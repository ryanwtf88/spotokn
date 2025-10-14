import Elysia from "elysia";
import { Logestic } from "logestic";
import { Spotify } from "./services/spotify";
import { TokenController } from "./controllers/token";
import { ErrorMiddleware } from "./middleware/error";
import { logs } from "./utils/logger";
import type { RequestContext } from "./types/types";
import { readFileSync } from "fs";
import { join } from "path";


const SERVER_PORT = parseInt(process.env.PORT || '3012', 10);

class ApplicationServer {
    private readonly app: Elysia;
    public readonly tokenService: Spotify;
    private readonly tokenController: TokenController;
    private readonly startTime: number;

    constructor() {
        this.startTime = Date.now();
        this.tokenService = new Spotify();
        this.tokenController = new TokenController(this.tokenService);
        this.app = new Elysia()
            .use(Logestic.preset('common'))
            .decorate('tokenController', this.tokenController)
            .decorate('tokenService', this.tokenService)
            .get('/api/token', async ({ query, headers, set, tokenController, request }: { 
                query: { force?: string; debug?: string; metrics?: string; refresh?: string }, 
                headers: { cookie?: string; 'user-agent'?: string }, 
                set: any, 
                tokenController: TokenController,
                request: Request
            }) => {
                const cookies = this.parseCookieHeader(headers.cookie);
                const requestContext: RequestContext = {
                    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: Date.now(),
                    userAgent: headers['user-agent'],
                    ip: this.getClientIP(request),
                    cookies: cookies ? Object.entries(cookies).map(([name, value]) => ({ name, value })) : undefined,
                    queryParams: query
                };
                
                return await tokenController.handle(query, cookies, (status) => {
                    set.status = status;
                }, requestContext);
            })
            .get('/api/status', async ({ tokenService }: { tokenService: Spotify }) => {
                return tokenService.getStatus();
            })
            .get('/api/metrics', async ({ tokenController }: { tokenController: TokenController }) => {
                return tokenController.getMetrics();
            })
            .get('/api/token-tracker', async ({ tokenController }: { tokenController: TokenController }) => {
                return tokenController.getTokenTrackerStats();
            })
            .get('/api/refresh', async ({ tokenService, set }: { tokenService: Spotify, set: any }) => {
                try {
                    const token = await tokenService.forceRefresh();
                    if (!token) {
                        set.status = 503;
                        return { success: false, error: 'Failed to refresh token' };
                    }
                    return { success: true, data: token };
                } catch (error) {
                    set.status = 500;
                    return { success: false, error: 'Refresh failed' };
                }
            })
            .get('/api/lavasrc/token', async ({ query, headers, set, tokenService, request }: { 
                query: { refresh?: string }, 
                headers: { cookie?: string; 'user-agent'?: string }, 
                set: any, 
                tokenService: Spotify,
                request: Request
            }) => {
                const cookies = this.parseCookieHeader(headers.cookie);
                const requestContext: RequestContext = {
                    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: Date.now(),
                    userAgent: headers['user-agent'],
                    ip: this.getClientIP(request),
                    cookies: cookies ? Object.entries(cookies).map(([name, value]) => ({ name, value })) : undefined,
                    queryParams: query
                };
                
                try {
                    const token = await tokenService.getLavaSrcToken(
                        requestContext.cookies, 
                        requestContext
                    );
                    
                    if (!token) {
                        set.status = 503;
                        return { 
                            error: 'Token service temporarily unavailable',
                            error_description: 'Unable to fetch Spotify token',
                            request_id: requestContext.requestId
                        };
                    }
                    
                    return token;
                } catch (error) {
                    set.status = 500;
                    return { 
                        error: 'Internal server error',
                        error_description: error instanceof Error ? error.message : 'Unknown error',
                        request_id: requestContext.requestId
                    };
                }
            })
            .get('/health', () => {
                const memoryUsage = process.memoryUsage();
                const uptime = process.uptime();
                
                return {
                    status: 'healthy',
                    timestamp: Date.now(),
                    uptime: isNaN(uptime) ? 0 : Math.round(uptime * 1000), // Convert to milliseconds
                    version: `Bun v${Bun.version}`,
                    service: 'spotify-token-service',
                    memory: {
                        rss: isNaN(memoryUsage.rss) ? 0 : memoryUsage.rss,
                        heapTotal: isNaN(memoryUsage.heapTotal) ? 0 : memoryUsage.heapTotal,
                        heapUsed: isNaN(memoryUsage.heapUsed) ? 0 : memoryUsage.heapUsed,
                        external: isNaN(memoryUsage.external) ? 0 : memoryUsage.external,
                        arrayBuffers: isNaN(memoryUsage.arrayBuffers) ? 0 : memoryUsage.arrayBuffers
                    },
                    pid: process.pid || 0
                };
            })
            .get('/', () => this.serveStaticFile('index.html'))
            .get('/styles.css', () => this.serveStaticFile('styles.css', 'text/css'))
            .get('/script.js', () => this.serveStaticFile('script.js', 'application/javascript'))
            .onError(({ code, error, set, request }) => {
                const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                return ErrorMiddleware.handle(code, error, (status) => {
                    set.status = status;
                }, requestId);
            });
    }

    private parseCookieHeader(cookieHeader?: string): Record<string, string> | undefined {
        if (!cookieHeader?.trim()) return undefined;

        const cookies: Record<string, string> = {};

        cookieHeader.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
                cookies[name] = decodeURIComponent(value);
            }
        });

        return Object.keys(cookies).length > 0 ? cookies : undefined;
    }

    private getClientIP(request: Request): string {
        const forwarded = request.headers.get('x-forwarded-for');
        const realIP = request.headers.get('x-real-ip');
        const remoteAddr = request.headers.get('x-remote-addr');
        
        if (forwarded && forwarded.length > 0) {
            return forwarded.split(',')[0]?.trim() || 'unknown';
        }
        if (realIP && realIP.length > 0) {
            return realIP;
        }
        if (remoteAddr && remoteAddr.length > 0) {
            return remoteAddr;
        }
        
        return 'unknown';
    }

    private serveStaticFile(filename: string, contentType: string = 'text/html') {
        try {
            const filePath = join(process.cwd(), 'client', filename);
            const content = readFileSync(filePath, 'utf-8');
            
            return new Response(content, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
                },
            });
        } catch (error) {
            logs('error', `Failed to serve static file ${filename}:`, error);
            return new Response('File not found', { status: 404 });
        }
    }

    public start(): void {
        this.app.listen(SERVER_PORT, () => {
            logs('info', '🚀 Spotify Token Service Started');
            logs('info', `📡 Server: http://localhost:${SERVER_PORT}`);
            logs('info', `🌐 Web Interface: http://localhost:${SERVER_PORT}`);
            logs('info', `🎯 Token API: http://localhost:${SERVER_PORT}/api/token`);
            logs('info', `🎵 LavaSrc API: http://localhost:${SERVER_PORT}/api/lavasrc/token`);
            logs('info', `📊 Status API: http://localhost:${SERVER_PORT}/api/status`);
            logs('info', `📈 Metrics API: http://localhost:${SERVER_PORT}/api/metrics`);
            logs('info', `🔍 Token Tracker: http://localhost:${SERVER_PORT}/api/token-tracker`);
            logs('info', `🔄 Refresh API: http://localhost:${SERVER_PORT}/api/refresh`);
            logs('info', `💚 Health Check: http://localhost:${SERVER_PORT}/health`);
            logs('info', `🔧 Debug Info: http://localhost:${SERVER_PORT}/api/token?debug=true`);
            logs('info', '');
            logs('info', '📋 Usage Examples:');
            logs('info', `  • Anonymous: curl http://localhost:${SERVER_PORT}/api/token`);
            logs('info', `  • Authenticated: curl -H "Cookie: sp_dc=your_cookie" http://localhost:${SERVER_PORT}/api/token`);
            logs('info', `  • Token Refresh: curl http://localhost:${SERVER_PORT}/api/token?refresh=true`);
            logs('info', `  • LavaSrc Token: curl http://localhost:${SERVER_PORT}/api/lavasrc/token`);
            logs('info', `  • Force Refresh: curl http://localhost:${SERVER_PORT}/api/token?force=true`);
            logs('info', `  • Debug Info: curl http://localhost:${SERVER_PORT}/api/token?debug=true`);
            logs('info', `  • Metrics: curl http://localhost:${SERVER_PORT}/api/token?metrics=true`);
            logs('info', '');
            logs('info', '🎉 Service is ready to handle requests!');
        });
    }
}

const server = new ApplicationServer();
server.start();

process.on('uncaughtException', async (error) => {
    logs('error', '💥 Uncaught Exception', error);
    await server.tokenService.cleanup();
    process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
    logs('error', '💥 Unhandled Rejection', reason);
    await server.tokenService.cleanup();
    process.exit(1);
});


const gracefulShutdown = async (signal: string) => {
    logs('info', `🛑 Received ${signal} - Initiating graceful shutdown...`);
    await server.tokenService.cleanup();
    logs('info', '✅ Graceful shutdown completed');
    process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));