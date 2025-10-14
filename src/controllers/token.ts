import type { Spotify } from '../services/spotify';
import type { Cookie, RequestContext, TokenResponse, ErrorResponse } from '../types/types';
import { logs } from '../utils/logger';
import { ErrorMiddleware } from '../middleware/error';

export class TokenController {
    private errorCount: number = 0;
    private requestCount: number = 0;
    private startTime: number = Date.now();

    constructor(private readonly tokenService: Spotify) { }

    public async handle(
        queryParams: { force?: string; debug?: string; metrics?: string },
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
                return this.createSuccessResponse(token, requestId);
            }

            // Extract cookies
            const cookieArray = this.extractCookies(cookies);
            const hasSpDc = cookieArray.some(c => c.name === 'sp_dc');

            if (hasSpDc) {
                logs('info', 'Processing request with sp_dc cookie - will fetch authenticated token', { requestId });
            } else {
                logs('debug', 'Processing anonymous request - will use cached/proactively refreshed token', { requestId });
            }

            // Create request context
            const context: RequestContext = {
                requestId,
                timestamp: Date.now(),
                cookies: cookieArray,
                queryParams
            };

            // Get token
            const token = await this.tokenService.getToken(cookieArray, context);

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

            // Log success
            logs('info', `Returned ${token.isAnonymous ? 'anonymous' : 'authenticated'} token successfully`, { 
                requestId,
                cached: token.cached,
                source: token.source,
                expiresIn: Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000 / 60)
            });

            return this.createSuccessResponse(token, requestId);

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
}