import type { SpotifyToken, Cookie, RequestContext } from '../types/types';
import { logs } from '../utils/logger';

/**
 * Token tracker inspired by LavaSrc SpotifyTokenTracker
 * Manages token lifecycle, validation, and refresh logic
 */
export class TokenTracker {
    private tokens: Map<string, SpotifyToken> = new Map();
    private refreshTimers: Map<string, NodeJS.Timeout> = new Map();
    private readonly refreshBufferMs: number = 5 * 60 * 1000; // 5 minutes buffer

    constructor() {
        logs('info', 'TokenTracker initialized');
    }

    /**
     * Store a token with automatic refresh scheduling
     */
    public storeToken(key: string, token: SpotifyToken): void {
        // Clear existing timer if any
        this.clearRefreshTimer(key);
        
        // Store the token
        this.tokens.set(key, token);
        
        // Schedule refresh if token is not anonymous
        if (!token.isAnonymous) {
            this.scheduleRefresh(key, token);
        }
        
        logs('info', `Token stored for key: ${key}`, {
            isAnonymous: token.isAnonymous,
            expiresIn: Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000 / 60)
        });
    }

    /**
     * Get a token by key
     */
    public getToken(key: string): SpotifyToken | null {
        const token = this.tokens.get(key);
        if (!token) {
            return null;
        }

        // Check if token is still valid
        if (this.isTokenValid(token)) {
            return token;
        }

        // Token is invalid, remove it
        this.removeToken(key);
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
     * Remove a token and clear its refresh timer
     */
    public removeToken(key: string): void {
        this.clearRefreshTimer(key);
        this.tokens.delete(key);
        logs('debug', `Token removed for key: ${key}`);
    }

    /**
     * Get all stored tokens
     */
    public getAllTokens(): Map<string, SpotifyToken> {
        return new Map(this.tokens);
    }

    /**
     * Clear all tokens and timers
     */
    public clearAll(): void {
        this.tokens.clear();
        this.refreshTimers.forEach(timer => clearTimeout(timer));
        this.refreshTimers.clear();
        logs('info', 'All tokens and timers cleared');
    }

    /**
     * Validate if a token is still valid
     */
    private isTokenValid(token: SpotifyToken): boolean {
        if (!token || !token.accessToken || !token.accessTokenExpirationTimestampMs) {
            return false;
        }

        const now = Date.now();
        const isExpired = token.accessTokenExpirationTimestampMs <= now;
        const isAboutToExpire = token.accessTokenExpirationTimestampMs <= (now + this.refreshBufferMs);

        return !isExpired && !isAboutToExpire;
    }

    /**
     * Schedule token refresh
     */
    private scheduleRefresh(key: string, token: SpotifyToken): void {
        const now = Date.now();
        const timeUntilRefresh = token.accessTokenExpirationTimestampMs - now - this.refreshBufferMs;

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
     * Handle token refresh (to be implemented by the service)
     */
    private handleTokenRefresh(key: string): void {
        logs('info', `Token refresh triggered for key: ${key}`);
        // This would typically trigger a refresh in the main service
        // For now, we just remove the invalid token
        this.removeToken(key);
    }

    /**
     * Clear refresh timer for a specific key
     */
    private clearRefreshTimer(key: string): void {
        const timer = this.refreshTimers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.refreshTimers.delete(key);
        }
    }

    /**
     * Get statistics about stored tokens
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
            tokens: Array.from(this.tokens.entries()).map(([key, token]) => ({
                key,
                isAnonymous: token.isAnonymous,
                isValid: this.isTokenValid(token),
                expiresIn: Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000 / 60)
            }))
        };
    }
}