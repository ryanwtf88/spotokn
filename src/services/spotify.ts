import { SpotifyBrowser } from './browser';
import { TokenTracker } from './token-tracker';
import type { 
    SpotifyToken, 
    Cookie, 
    ServiceStatus, 
    TokenConfig, 
    RequestContext,
    ServiceState,
    TokenType 
} from '../types/types';
import { logs } from '../utils/logger';
import { MutexLock } from '../utils/mutex';

export class Spotify {
    private browser: SpotifyBrowser;
    private tokenTracker: TokenTracker;
    private anonymousToken: SpotifyToken | null = null;
    private authenticatedToken: SpotifyToken | null = null;
    private proactiveRefreshTimer: NodeJS.Timeout | null = null;
    private isRefreshing = false;
    private serviceState: ServiceState = 'initializing';
    private readonly mutex: MutexLock;
    private readonly config: TokenConfig;
    private startTime: number;
    private lastRefreshTime: number = 0;
    private refreshCount: number = 0;
    private errorCount: number = 0;

    constructor(config?: Partial<TokenConfig>) {
        this.config = {
            proactiveRefreshBuffer: parseInt(process.env.PROACTIVE_REFRESH_BUFFER || '300000', 10), // 5 minutes
            checkInterval: parseInt(process.env.CHECK_INTERVAL || '60000', 10), // 1 minute
            maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
            retryDelay: parseInt(process.env.RETRY_DELAY || '2000', 10),
            cacheTimeout: parseInt(process.env.CACHE_TIMEOUT || '3600000', 10), // 1 hour
            ...config
        };
        
        this.mutex = new MutexLock(30000, 60000);
        this.browser = new SpotifyBrowser();
        this.tokenTracker = new TokenTracker();
        this.startTime = Date.now();
        
        this.initializeService();
        logs('info', 'Spotify Token Service initialized with enhanced real-time features');
    }

    private async initializeService(): Promise<void> {
        try {
            this.serviceState = 'initializing';
            await this.initializeProactiveRefresh();
            await this.getAnonymousToken();
            this.serviceState = 'ready';
            logs('info', 'Service initialization completed successfully');
        } catch (error) {
            this.serviceState = 'error';
            this.errorCount++;
            logs('error', 'Service initialization failed', error);
            throw error;
        }
    }

    /**
     * Get token based on cookie presence with enhanced real-time logic
     * - With sp_dc cookie: Returns authenticated token (fetched on-demand)
     * - Without sp_dc cookie: Returns anonymous token (proactively refreshed)
     */
    public async getToken(cookies?: Cookie[], requestContext?: RequestContext): Promise<SpotifyToken | null> {
        const requestId = requestContext?.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            const hasSpDcCookie = this.hasSpDcCookie(cookies);
            const tokenType: TokenType = hasSpDcCookie ? 'authenticated' : 'anonymous';

            logs('info', `Token request received`, { 
                requestId, 
                tokenType, 
                hasCookies: !!cookies?.length,
                serviceState: this.serviceState 
            });

            if (this.serviceState === 'error') {
                logs('warn', 'Service is in error state, attempting recovery', { requestId });
                await this.recoverService();
            }

            if (hasSpDcCookie) {
                return await this.getAuthenticatedToken(cookies!, requestContext);
            } else {
                return await this.getAnonymousToken(requestContext);
            }
        } catch (error) {
            this.errorCount++;
            logs('error', 'Token request failed', { error, requestId });
            
            // If we have a cached anonymous token and the request is for anonymous, return it as fallback
            if (!this.hasSpDcCookie(cookies) && this.anonymousToken && this.isTokenValid(this.anonymousToken)) {
                logs('warn', 'Using cached anonymous token as fallback', { requestId });
                return this.anonymousToken;
            }
            
            throw error;
        }
    }

    /**
     * Handle authenticated token requests (with sp_dc cookie)
     * Always fetch fresh to ensure latest user permissions
     */
    private async getAuthenticatedToken(cookies: Cookie[], requestContext?: RequestContext): Promise<SpotifyToken | null> {
        const requestId = requestContext?.requestId || 'unknown';
        logs('info', 'Fetching fresh authenticated token for sp_dc user', { requestId });

        try {
            const token = await this.browser.getToken(cookies, requestContext);

            if (!token.isAnonymous) {
                this.authenticatedToken = token;
                this.tokenTracker.storeToken('authenticated', token);
                this.lastRefreshTime = Date.now();
                this.refreshCount++;
                logs('info', 'Successfully obtained authenticated token', { 
                    requestId,
                    expiresIn: Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000 / 60)
                });
            } else {
                logs('warn', 'Expected authenticated token but got anonymous token', { requestId });
            }

            return token;
        } catch (error) {
            this.errorCount++;
            logs('error', 'Authenticated token fetch failed', { 
                error: error instanceof Error ? error.message : error,
                requestId 
            });
            return null;
        }
    }

    /**
     * Handle anonymous token requests (no sp_dc cookie)
     * Use cached token if valid, otherwise fetch new one
     */
    private async getAnonymousToken(requestContext?: RequestContext): Promise<SpotifyToken | null> {
        const requestId = requestContext?.requestId || 'unknown';
        
        if (this.anonymousToken && this.isTokenValid(this.anonymousToken)) {
            logs('debug', 'Returning cached anonymous token', { 
                requestId,
                expiresIn: Math.round((this.anonymousToken.accessTokenExpirationTimestampMs - Date.now()) / 1000 / 60)
            });
            
            // Add cache metadata
            const cachedToken = { ...this.anonymousToken };
            cachedToken.cached = true;
            cachedToken.source = 'cached';
            cachedToken.timestamp = Date.now();
            
            return cachedToken;
        }

        if (this.isRefreshing) {
            logs('info', 'Waiting for ongoing refresh to complete', { requestId });
            await this.waitForRefresh();
            return this.anonymousToken;
        }

        logs('info', 'Fetching fresh anonymous token', { requestId });
        return this.refreshAnonymousToken(requestContext);
    }

    /**
     * Refresh anonymous token (used by proactive refresh and on-demand)
     */
    private async refreshAnonymousToken(requestContext?: RequestContext): Promise<SpotifyToken | null> {
        const requestId = requestContext?.requestId || 'proactive';
        
        if (this.isRefreshing) {
            await this.waitForRefresh();
            return this.anonymousToken;
        }

        this.isRefreshing = true;
        this.serviceState = 'refreshing';

        try {
            const token = await this.browser.getToken(undefined, requestContext);

            if (token.isAnonymous) {
                this.anonymousToken = token;
                this.tokenTracker.storeToken('anonymous', token);
                this.lastRefreshTime = Date.now();
                this.refreshCount++;
                this.serviceState = 'ready';
                logs('info', 'Anonymous token refreshed successfully', { 
                    requestId,
                    expiresIn: Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000 / 60)
                });
            } else {
                logs('warn', 'Expected anonymous token but got authenticated token', { requestId });
            }

            return token;
        } catch (error) {
            this.errorCount++;
            this.serviceState = 'error';
            logs('error', 'Anonymous token refresh failed', { 
                error: error instanceof Error ? error.message : error,
                requestId 
            });
            return null;
        } finally {
            this.isRefreshing = false;
        }
    }

    /**
     * Initialize proactive refresh system for anonymous tokens only
     */
    private initializeProactiveRefresh(): void {
        const checkAndRefresh = async () => {
            try {
                if (this.anonymousToken && !this.isRefreshing && this.serviceState === 'ready') {
                    const timeUntilExpiry = this.anonymousToken.accessTokenExpirationTimestampMs - Date.now();

                    if (timeUntilExpiry <= this.config.proactiveRefreshBuffer) {
                        logs('info', `Anonymous token expires in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes - proactively refreshing`);
                        await this.refreshAnonymousToken();
                    }
                } else if (!this.anonymousToken && this.serviceState === 'ready') {
                    // If we don't have an anonymous token, try to get one
                    logs('info', 'No anonymous token available, attempting to fetch one');
                    await this.refreshAnonymousToken();
                }
            } catch (error) {
                logs('error', 'Proactive refresh check failed', error);
                this.errorCount++;
                
                // If we've had too many errors, try to recover
                if (this.errorCount > 5) {
                    logs('warn', 'Too many errors, attempting service recovery');
                    await this.recoverService();
                }
            }

            this.proactiveRefreshTimer = setTimeout(checkAndRefresh, this.config.checkInterval);
        };

        this.proactiveRefreshTimer = setTimeout(checkAndRefresh, this.config.checkInterval);
        logs('info', 'Proactive refresh scheduler started for anonymous tokens', {
            checkInterval: this.config.checkInterval,
            refreshBuffer: this.config.proactiveRefreshBuffer
        });
    }

    /**
     * Utility methods
     */
    private hasSpDcCookie(cookies?: Cookie[]): boolean {
        return cookies?.some(cookie => cookie.name === 'sp_dc') || false;
    }

    private isTokenValid(token: SpotifyToken): boolean {
        if (!token || !token.accessToken || !token.accessTokenExpirationTimestampMs) {
            return false;
        }
        
        const now = Date.now();
        const isExpired = token.accessTokenExpirationTimestampMs <= now;
        const isTooOld = token.timestamp && (now - token.timestamp) > this.config.cacheTimeout;
        
        // Add buffer time (5 minutes) to prevent using tokens that are about to expire
        const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
        const isAboutToExpire = token.accessTokenExpirationTimestampMs <= (now + bufferTime);
        
        return !isExpired && !isTooOld && !isAboutToExpire;
    }

    private async waitForRefresh(): Promise<void> {
        let attempts = 0;
        const maxAttempts = 30;

        while (this.isRefreshing && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
    }

    private async recoverService(): Promise<void> {
        try {
            logs('info', 'Attempting service recovery...');
            this.serviceState = 'initializing';
            
            // Test browser health
            const browserHealthy = await this.browser.healthCheck();
            if (!browserHealthy) {
                logs('warn', 'Browser health check failed, reinitializing...');
                await this.browser.close();
                this.browser = new SpotifyBrowser();
            }
            
            // Try to get a fresh token
            await this.refreshAnonymousToken();
            
            if (this.anonymousToken) {
                this.serviceState = 'ready';
                logs('info', 'Service recovery successful');
            } else {
                throw new Error('Failed to obtain token during recovery');
            }
        } catch (error) {
            this.serviceState = 'error';
            logs('error', 'Service recovery failed', error);
            throw error;
        }
    }

    public async forceRefresh(): Promise<SpotifyToken | null> {
        logs('info', 'Force refresh requested');
        return this.refreshAnonymousToken();
    }

    public getMetrics() {
        return {
            serviceState: this.serviceState,
            uptime: Date.now() - this.startTime,
            refreshCount: this.refreshCount,
            errorCount: this.errorCount,
            lastRefreshTime: this.lastRefreshTime,
            hasAnonymousToken: !!this.anonymousToken,
            hasAuthenticatedToken: !!this.authenticatedToken,
            anonymousTokenValid: this.anonymousToken ? this.isTokenValid(this.anonymousToken) : false,
            authenticatedTokenValid: this.authenticatedToken ? this.isTokenValid(this.authenticatedToken) : false,
            browserStatus: this.browser.getStatus(),
            tokenTrackerStats: this.tokenTracker.getStats()
        };
    }

    /**
     * Cleanup resources
     */
    public async cleanup(): Promise<void> {
        try {
            this.serviceState = 'shutdown';
            
            if (this.proactiveRefreshTimer) {
                clearTimeout(this.proactiveRefreshTimer);
                this.proactiveRefreshTimer = null;
                logs('info', 'Proactive refresh timer stopped');
            }

            await this.browser.close();
            this.tokenTracker.clearAll();
            this.anonymousToken = null;
            this.authenticatedToken = null;
            this.isRefreshing = false;
            
            logs('info', 'Token service cleanup completed');
        } catch (error) {
            logs('error', 'Error during cleanup', error);
        }
    }

    /**
     * Get comprehensive service status for debugging and monitoring
     */
    public getStatus(): ServiceStatus {
        const now = Date.now();
        const uptime = now - this.startTime;
        
        return {
            hasAnonymousToken: !!this.anonymousToken,
            hasAuthenticatedToken: !!this.authenticatedToken,
            isRefreshing: this.isRefreshing,
            anonymousTokenExpiry: this.anonymousToken?.accessTokenExpirationTimestampMs,
            authenticatedTokenExpiry: this.authenticatedToken?.accessTokenExpirationTimestampMs,
            anonymousTokenValid: this.anonymousToken ? this.isTokenValid(this.anonymousToken) : false,
            authenticatedTokenValid: this.authenticatedToken ? this.isTokenValid(this.authenticatedToken) : false,
            lastRefresh: this.lastRefreshTime,
            uptime,
            memoryUsage: process.memoryUsage(),
            browserConnected: this.browser.getStatus().isConnected
        };
    }
}