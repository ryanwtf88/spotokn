export interface SpotifyToken {
    accessToken: string;
    accessTokenExpirationTimestampMs: number;
    clientId: string;
    isAnonymous: boolean;
    timestamp?: number;
    cached?: boolean;
    source?: 'anonymous' | 'authenticated' | 'cached';
}

export interface Cookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    expires?: number;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    timestamp: number;
    requestId?: string;
}

export interface TokenResponse extends ApiResponse<SpotifyToken> {
    data: SpotifyToken;
}

export interface ErrorResponse extends ApiResponse {
    success: false;
    error: string;
    code?: string;
    details?: any;
}

export interface ServiceStatus {
    hasAnonymousToken: boolean;
    hasAuthenticatedToken: boolean;
    isRefreshing: boolean;
    anonymousTokenExpiry?: number;
    authenticatedTokenExpiry?: number;
    anonymousTokenValid: boolean;
    authenticatedTokenValid: boolean;
    lastRefresh?: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    browserConnected: boolean;
}

export interface RateLimitInfo {
    requests: number;
    windowStart: number;
    windowDuration: number;
    limit: number;
    remaining: number;
    resetTime: number;
}

export interface RequestContext {
    requestId: string;
    timestamp: number;
    userAgent?: string;
    ip?: string;
    cookies?: Cookie[];
    queryParams?: Record<string, string>;
}

export interface BrowserConfig {
    headless: boolean;
    executablePath?: string;
    userAgent: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
}

export interface TokenConfig {
    proactiveRefreshBuffer: number;
    checkInterval: number;
    maxRetries: number;
    retryDelay: number;
    cacheTimeout: number;
}

export interface LogLevel {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: number;
    context?: any;
}

export type TokenType = 'anonymous' | 'authenticated';
export type ServiceState = 'initializing' | 'ready' | 'refreshing' | 'error' | 'shutdown';
export type ErrorCode = 'TOKEN_FETCH_FAILED' | 'BROWSER_ERROR' | 'RATE_LIMITED' | 'INVALID_COOKIES' | 'NETWORK_ERROR' | 'TIMEOUT' | 'UNKNOWN';