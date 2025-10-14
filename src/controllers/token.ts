import type { Spotify } from '../services/spotify';
import type { Cookie, RequestContext, TokenResponse, ErrorResponse } from '../types/types';
import { logs } from '../utils/logger';
import { ErrorMiddleware } from '../middleware/error';

export class TokenController {
    private errorCount: number = 0;
    private requestCount: number = 0;
    private startTime: number = Date.now();
    private tokenCache: Map<string, { token: any; expires: number }> = new Map();

    constructor(private readonly tokenService: Spotify) { }

    public async handle(
        queryParams: { force?: string; debug?: string; metrics?: string; refresh?: string },
        cookies: Record<string, string> | undefined,
        setStatus: (status: number) => void,
        requestContext?: RequestContext
    ): Promise<TokenResponse | ErrorResponse | any> {
        const requestId = requestContext?.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.requestCount++;
        
        try {
            // Debug endpoint
            if (queryParams.debug === 'true') {
                logs('info', 'Debug status requested', { requestId });
                return this.tokenService.getStatus();
            }

            // Metrics endpoint
            if (queryParams.metrics === 'true') {
                logs('info', 'Metrics requested', { requestId });
                return this.tokenService.getMetrics();
            }

            // Token refresh endpoint (LavaSrc specific)
            if (queryParams.refresh === 'true') {
                logs('info', 'Token refresh requested for LavaSrc', { requestId });
                return await this.handleTokenRefresh(cookies, setStatus, requestId);
            }

            // Force refresh endpoint
            if (queryParams.force === 'true') {
                logs('info', 'Force refresh requested', { requestId });
                const token = await this.tokenService.forceRefresh();
                if (!token) {
                    setStatus(503);
                    return ErrorMiddleware.createErrorResponse(
                        'Force refresh failed - service temporarily unavailable',
                        'TOKEN_FETCH_FAILED',
                        503,
                        { requestId }
                    );
                }
                return this.createLavaSrcResponse(token, requestId);
            }

            // Main token endpoint - LavaSrc compatible
            return await this.handleMainTokenRequest(cookies, setStatus, requestId);

        } catch (error) {
            this.errorCount++;
            logs('error', 'Token controller error', { error, requestId });
            setStatus(500);
            return ErrorMiddleware.handleAsyncError(error, 'TokenController', requestId);
        }
    }

    private extractCookies(cookies?: Record<string, string>): Cookie[] {
        if (!cookies) return [];

        return Object.entries(cookies).map(([name, value]) => ({
            name,
            value
        }));
    }

    /**
     * Handle main token request - LavaSrc compatible
     */
    private async handleMainTokenRequest(
        cookies: Record<string, string> | undefined,
        setStatus: (status: number) => void,
        requestId: string
    ): Promise<any> {
        const cookieArray = this.extractCookies(cookies);
        const hasSpDc = cookieArray.some(c => c.name === 'sp_dc');
        const cacheKey = hasSpDc ? 'authenticated' : 'anonymous';

        // Check cache first
        const cached = this.tokenCache.get(cacheKey);
        if (cached && cached.expires > Date.now()) {
            logs('info', `Returning cached ${cacheKey} token`, { requestId });
            return cached.token;
        }

        // Create request context
        const context: RequestContext = {
            requestId,
            timestamp: Date.now(),
            cookies: cookieArray,
            queryParams: {}
        };

        // Get fresh token using LavaSrc-compatible method
        const token = await this.tokenService.getLavaSrcToken(cookieArray, context);

        if (!token) {
            setStatus(503);
            logs('error', 'Token service returned null - service temporarily unavailable', { requestId });
            return ErrorMiddleware.createErrorResponse(
                'Token service temporarily unavailable',
                'TOKEN_FETCH_FAILED',
                503,
                { requestId }
            );
        }

        // Cache the token
        this.tokenCache.set(cacheKey, {
            token,
            expires: token.expires_in ? (Date.now() + token.expires_in * 1000) : (Date.now() + 3600000) // 1 hour default
        });

        logs('info', `Returned fresh ${token.is_anonymous ? 'anonymous' : 'authenticated'} token`, { 
            requestId,
            expiresIn: token.expires_in
        });

        return token;
    }

    /**
     * Handle token refresh - LavaSrc specific
     */
    private async handleTokenRefresh(
        cookies: Record<string, string> | undefined,
        setStatus: (status: number) => void,
        requestId: string
    ): Promise<any> {
        const cookieArray = this.extractCookies(cookies);
        const hasSpDc = cookieArray.some(c => c.name === 'sp_dc');
        const cacheKey = hasSpDc ? 'authenticated' : 'anonymous';

        // Clear cached token
        this.tokenCache.delete(cacheKey);

        // Create request context
        const context: RequestContext = {
            requestId,
            timestamp: Date.now(),
            cookies: cookieArray,
            queryParams: {}
        };

        // Force refresh using LavaSrc-compatible method
        const token = await this.tokenService.getLavaSrcToken(cookieArray, context);

        if (!token) {
            setStatus(503);
            return ErrorMiddleware.createErrorResponse(
                'Token refresh failed - service temporarily unavailable',
                'TOKEN_FETCH_FAILED',
                503,
                { requestId }
            );
        }

        // Cache the new token
        this.tokenCache.set(cacheKey, {
            token,
            expires: token.expires_in ? (Date.now() + token.expires_in * 1000) : (Date.now() + 3600000) // 1 hour default
        });

        logs('info', `Token refreshed successfully for ${cacheKey}`, { requestId });
        return token;
    }

    /**
     * Create LavaSrc-compatible response format
     */
    private createLavaSrcResponse(token: any, requestId: string): any {
        // LavaSrc expects a specific format
        return {
            access_token: token.accessToken,
            token_type: 'Bearer',
            expires_in: Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000),
            scope: 'user-read-private user-read-email',
            client_id: token.clientId,
            is_anonymous: token.isAnonymous,
            cached: token.cached || false,
            source: token.source || 'fresh',
            timestamp: Date.now(),
            request_id: requestId
        };
    }

    private createSuccessResponse(token: any, requestId: string): TokenResponse {
        return {
            success: true,
            data: token,
            timestamp: Date.now(),
            requestId
        };
    }

    private createErrorResponse(error: string, requestId?: string): ErrorResponse {
        return {
            success: false,
            error,
            timestamp: Date.now(),
            requestId
        };
    }

    public getMetrics() {
        return {
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
            uptime: Date.now() - this.startTime,
            serviceMetrics: this.tokenService.getMetrics()
        };
    }

    public getTokenTrackerStats() {
        return this.tokenService.getMetrics().tokenTrackerStats;
    }
}