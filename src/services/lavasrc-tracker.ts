import type { SpotifyToken, Cookie, RequestContext } from '../types/types';
import { logs } from '../utils/logger';

/**
 * LavaSrc-compatible token tracker
 * Manages token lifecycle exactly like LavaSrc SpotifyTokenTracker
 */
export class LavaSrcTracker {
    private tokens: Map<string, LavaSrcToken> = new Map();
    private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
    private readonly refreshBufferMs: number = 5 * 60 * 1000; // 5 minutes buffer
    private readonly maxCacheSize: number = 100;

    constructor() {
        logs('info', 'LavaSrc Token Tracker initialized');
    }

    /**
     * Get or create a token for the given context
     * This is the main method LavaSrc will call
     */
    public async getToken(
        cookies?: Cookie[], 
        requestContext?: RequestContext,
        tokenService?: any
    ): Promise<LavaSrcToken | null> {
        const requestId = requestContext?.requestId || 'unknown';
        const hasSpDc = this.hasSpDcCookie(cookies);
        const tokenKey = hasSpDc ? 'authenticated' : 'anonymous';

        logs('info', `LavaSrc token request`, { 
            requestId, 
            tokenKey, 
            hasCookies: !!cookies?.length 
        });

        // Check if we have a valid cached token
        const cached = this.tokens.get(tokenKey);
        if (cached && this.isTokenValid(cached)) {
            logs('debug', `Returning cached ${tokenKey} token`, { requestId });
            return this.formatForLavaSrc(cached, requestId);
        }

        // If we have a token service, try to get a fresh token
        if (tokenService) {
            try {
                const freshToken = await tokenService.getToken(cookies, requestContext);
                if (freshToken) {
                    const lavasrcToken = this.convertToLavaSrcToken(freshToken);
                    this.storeToken(tokenKey, lavasrcToken);
                    return this.formatForLavaSrc(lavasrcToken, requestId);
                }
            } catch (error) {
                logs('error', 'Failed to get fresh token', { error, requestId });
            }
        }

        // Return cached token even if expired as fallback
        if (cached) {
            logs('warn', `Returning expired ${tokenKey} token as fallback`, { requestId });
            return this.formatForLavaSrc(cached, requestId);
        }

        return null;
    }

    /**
     * Store a token with automatic refresh scheduling
     */
    public storeToken(key: string, token: LavaSrcToken): void {
        // Clear existing timer
        this.clearRefreshTimer(key);
        
        // Store the token
        this.tokens.set(key, token);
        
        // Schedule refresh if not anonymous
        if (!token.isAnonymous) {
            this.scheduleRefresh(key, token);
        }

        // Cleanup old tokens if cache is full
        this.cleanupCache();

        logs('info', `Token stored for key: ${key}`, {
            isAnonymous: token.isAnonymous,
            expiresIn: Math.round((token.expiresAt - Date.now()) / 1000 / 60)
        });
    }

    /**
     * Refresh a specific token
     */
    public async refreshToken(
        key: string, 
        tokenService?: any, 
        cookies?: Cookie[]
    ): Promise<LavaSrcToken | null> {
        logs('info', `Refreshing token for key: ${key}`);
        
        if (!tokenService) {
            logs('warn', 'No token service available for refresh');
            return null;
        }

        try {
            const freshToken = await tokenService.getToken(cookies);
            if (freshToken) {
                const lavasrcToken = this.convertToLavaSrcToken(freshToken);
                this.storeToken(key, lavasrcToken);
                return lavasrcToken;
            }
        } catch (error) {
            logs('error', 'Token refresh failed', { error, key });
        }

        return null;
    }

    /**
     * Check if a token exists and is valid
     */
    public hasValidToken(key: string): boolean {
        const token = this.tokens.get(key);
        return token ? this.isTokenValid(token) : false;
    }

    /**
     * Remove a token
     */
    public removeToken(key: string): void {
        this.clearRefreshTimer(key);
        this.tokens.delete(key);
        logs('debug', `Token removed for key: ${key}`);
    }

    /**
     * Clear all tokens
     */
    public clearAll(): void {
        this.tokens.clear();
        this.refreshTimers.forEach(timer => clearTimeout(timer));
        this.refreshTimers.clear();
        logs('info', 'All tokens cleared');
    }

    /**
     * Get statistics
     */
    public getStats() {
        const totalTokens = this.tokens.size;
        const validTokens = Array.from(this.tokens.values()).filter(token => this.isTokenValid(token)).length;
        const activeTimers = this.refreshTimers.size;

        return {
            totalTokens,
            validTokens,
            invalidTokens: totalTokens - validTokens,
            activeTimers,
            cacheSize: this.tokens.size,
            maxCacheSize: this.maxCacheSize,
            tokens: Array.from(this.tokens.entries()).map(([key, token]) => ({
                key,
                isAnonymous: token.isAnonymous,
                isValid: this.isTokenValid(token),
                expiresIn: Math.round((token.expiresAt - Date.now()) / 1000 / 60),
                clientId: token.clientId
            }))
        };
    }

    /**
     * Convert Spotify token to LavaSrc format
     */
    private convertToLavaSrcToken(token: SpotifyToken): LavaSrcToken {
        return {
            accessToken: token.accessToken,
            tokenType: 'Bearer',
            expiresIn: Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000),
            scope: 'user-read-private user-read-email',
            clientId: token.clientId,
            isAnonymous: token.isAnonymous,
            expiresAt: token.accessTokenExpirationTimestampMs,
            cached: token.cached || false,
            source: token.source || 'fresh',
            timestamp: Date.now()
        };
    }

    /**
     * Format token for LavaSrc response
     */
    private formatForLavaSrc(token: LavaSrcToken, requestId: string): LavaSrcToken {
        return {
            ...token,
            requestId,
            timestamp: Date.now()
        };
    }

    /**
     * Check if token is valid
     */
    private isTokenValid(token: LavaSrcToken): boolean {
        if (!token || !token.accessToken || !token.expiresAt) {
            return false;
        }

        const now = Date.now();
        const isExpired = token.expiresAt <= now;
        const isAboutToExpire = token.expiresAt <= (now + this.refreshBufferMs);

        return !isExpired && !isAboutToExpire;
    }

    /**
     * Check if request has sp_dc cookie
     */
    private hasSpDcCookie(cookies?: Cookie[]): boolean {
        return cookies?.some(cookie => cookie.name === 'sp_dc') || false;
    }

    /**
     * Schedule token refresh
     */
    private scheduleRefresh(key: string, token: LavaSrcToken): void {
        const now = Date.now();
        const timeUntilRefresh = token.expiresAt - now - this.refreshBufferMs;

        if (timeUntilRefresh > 0) {
            const timer = setTimeout(() => {
                this.handleTokenRefresh(key);
            }, timeUntilRefresh);

            this.refreshTimers.set(key, timer);
            
            logs('debug', `Refresh scheduled for key: ${key}`, {
                refreshIn: Math.round(timeUntilRefresh / 1000 / 60)
            });
        }
    }

    /**
     * Handle token refresh
     */
    private handleTokenRefresh(key: string): void {
        logs('info', `Token refresh triggered for key: ${key}`);
        // This would typically trigger a refresh in the main service
        // For now, we just mark the token as expired
        const token = this.tokens.get(key);
        if (token) {
            token.expiresAt = Date.now() - 1; // Mark as expired
        }
    }

    /**
     * Clear refresh timer
     */
    private clearRefreshTimer(key: string): void {
        const timer = this.refreshTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.refreshTimers.delete(key);
        }
    }

    /**
     * Cleanup old tokens if cache is full
     */
    private cleanupCache(): void {
        if (this.tokens.size <= this.maxCacheSize) {
            return;
        }

        // Remove oldest tokens
        const entries = Array.from(this.tokens.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toRemove = entries.slice(0, this.tokens.size - this.maxCacheSize);
        toRemove.forEach(([key]) => {
            this.removeToken(key);
        });

        logs('info', `Cleaned up ${toRemove.length} old tokens`);
    }
}

/**
 * LavaSrc-compatible token format
 */
export interface LavaSrcToken {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    scope: string;
    clientId: string;
    isAnonymous: boolean;
    expiresAt: number;
    cached: boolean;
    source: string;
    timestamp: number;
    requestId?: string;
}