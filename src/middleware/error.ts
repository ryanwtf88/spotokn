import { logs } from '../utils/logger';
import type { ErrorResponse, ErrorCode } from '../types/types';

export class ErrorMiddleware {
    private static readonly ERROR_CODES: Record<string, { status: number; message: string; code: ErrorCode }> = {
        'NOT_FOUND': { status: 404, message: 'Endpoint not found', code: 'UNKNOWN' },
        'VALIDATION': { status: 400, message: 'Request validation failed', code: 'UNKNOWN' },
        'TOKEN_FETCH_FAILED': { status: 503, message: 'Token service temporarily unavailable', code: 'TOKEN_FETCH_FAILED' },
        'BROWSER_ERROR': { status: 503, message: 'Browser automation failed', code: 'BROWSER_ERROR' },
        'RATE_LIMITED': { status: 429, message: 'Rate limit exceeded', code: 'RATE_LIMITED' },
        'INVALID_COOKIES': { status: 400, message: 'Invalid or expired cookies', code: 'INVALID_COOKIES' },
        'NETWORK_ERROR': { status: 503, message: 'Network connectivity issue', code: 'NETWORK_ERROR' },
        'TIMEOUT': { status: 504, message: 'Request timeout', code: 'TIMEOUT' },
        'MUTEX_TIMEOUT': { status: 503, message: 'Service busy, please try again', code: 'UNKNOWN' },
        'BROWSER_LAUNCH_FAILED': { status: 503, message: 'Browser initialization failed', code: 'BROWSER_ERROR' },
        'TOKEN_PARSE_ERROR': { status: 502, message: 'Invalid token response format', code: 'TOKEN_FETCH_FAILED' }
    };

    static handle(code: string, error: unknown, setStatus: (status: number) => void, requestId?: string): ErrorResponse {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        // Log the error with context
        logs('error', `Global error handler - ${code}`, {
            message: errorMessage,
            stack: errorStack,
            requestId,
            timestamp: new Date().toISOString()
        });

        const errorConfig = this.ERROR_CODES[code] || { status: 500, message: 'Unknown error', code: 'UNKNOWN' as ErrorCode };
        setStatus(errorConfig.status);

        const response: ErrorResponse = {
            success: false,
            error: errorConfig.message,
            code: errorConfig.code,
            timestamp: Date.now(),
            requestId
        };

        // Add additional details for specific error types
        if (code === 'VALIDATION' && errorMessage) {
            response.details = errorMessage;
        }

        if (code === 'RATE_LIMITED') {
            response.details = {
                retryAfter: 60, // seconds
                message: 'Please wait before making another request'
            };
        }

        if (code === 'BROWSER_ERROR') {
            response.details = {
                message: 'Browser automation service is temporarily unavailable',
                suggestion: 'Please try again in a few moments'
            };
        }

        if (code === 'TOKEN_FETCH_FAILED') {
            response.details = {
                message: 'Unable to fetch Spotify token',
                suggestion: 'Check your internet connection and try again'
            };
        }

        return response;
    }

    static createErrorResponse(
        message: string, 
        code: ErrorCode = 'UNKNOWN', 
        status: number = 500, 
        details?: any,
        requestId?: string
    ): ErrorResponse {
        return {
            success: false,
            error: message,
            code,
            timestamp: Date.now(),
            requestId,
            details
        };
    }

    static handleAsyncError(error: unknown, context: string, requestId?: string): ErrorResponse {
        const errorMessage = error instanceof Error ? error.message : 'Unknown async error';
        
        logs('error', `Async error in ${context}`, {
            message: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            requestId,
            context,
            timestamp: new Date().toISOString()
        });

        return this.createErrorResponse(
            `Error in ${context}: ${errorMessage}`,
            'UNKNOWN',
            500,
            { context, originalError: errorMessage },
            requestId
        );
    }
}