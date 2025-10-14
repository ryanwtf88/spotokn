import Elysia from "elysia";
import { Logestic } from "logestic";
import { Spotify } from "./services/spotify";
import { TokenController } from "./controllers/token";
import { ErrorMiddleware } from "./middleware/error";
import { logs } from "./utils/logger";
import type { RequestContext } from "./types/types";


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
                query: { force?: string; debug?: string; metrics?: string }, 
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
            .get('/', () => this.getWebInterface())
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

    private getWebInterface() {
        return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spotify Token Service</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1db954, #1ed760);
            min-height: 100vh;
            color: #fff;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 2rem;
        }
        .header {
            text-align: center;
            margin-bottom: 3rem;
        }
        .header h1 {
            font-size: 3rem;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-bottom: 3rem;
        }
        .card {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 2rem;
            border: 1px solid rgba(255,255,255,0.2);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        .card h2 {
            margin-bottom: 1rem;
            font-size: 1.5rem;
        }
        .btn {
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 0.5rem;
            transition: all 0.3s ease;
        }
        .btn:hover {
            background: rgba(255,255,255,0.3);
            transform: translateY(-2px);
        }
        .status {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 1rem 0;
            padding: 1rem;
            background: rgba(0,0,0,0.2);
            border-radius: 8px;
        }
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #4ade80;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .endpoint {
            background: rgba(0,0,0,0.3);
            padding: 1rem;
            border-radius: 8px;
            margin: 0.5rem 0;
            font-family: 'Monaco', 'Menlo', monospace;
        }
        .footer {
            text-align: center;
            margin-top: 3rem;
            opacity: 0.8;
        }
        .real-time {
            background: rgba(0,0,0,0.2);
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            margin: 0.5rem 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Spotokn</h1>
            <p>High-performance token generation with real-time monitoring</p>
        </div>

        <div class="grid">
            <div class="card">
                <h2>Quick Actions</h2>
                <a href="/api/token" class="btn">Get Token</a>
                <a href="/api/token?debug=true" class="btn">Debug Info</a>
                <a href="/api/token?metrics=true" class="btn">Metrics</a>
                <a href="/api/token-tracker" class="btn">Token Tracker</a>
                <a href="/api/refresh" class="btn">Force Refresh</a>
            </div>

            <div class="card">
                <h2>Service Status</h2>
                <div class="status">
                    <span>Service Status</span>
                    <div class="status-indicator"></div>
                </div>
                <div class="real-time" id="status">
                    <div class="metric">
                        <span>Uptime:</span>
                        <span id="uptime">Loading...</span>
                    </div>
                    <div class="metric">
                        <span>Memory Usage:</span>
                        <span id="memory">Loading...</span>
                    </div>
                    <div class="metric">
                        <span>Heap Used:</span>
                        <span id="heap">Loading...</span>
                    </div>
                    <div class="metric">
                        <span>Browser Status:</span>
                        <span id="browser">Loading...</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2>API Endpoints</h2>
                <div class="endpoint">GET /api/token</div>
                <div class="endpoint">GET /api/token?debug=true</div>
                <div class="endpoint">GET /api/token?metrics=true</div>
                <div class="endpoint">GET /api/status</div>
                <div class="endpoint">GET /api/refresh</div>
                <div class="endpoint">GET /api/token-tracker</div>
                <div class="endpoint">GET /health</div>
            </div>

            <div class="card">
                <h2>Usage Examples</h2>
                <div class="endpoint">
                    curl http://localhost:${SERVER_PORT}/api/token
                </div>
                <div class="endpoint">
                    curl -H "Cookie: sp_dc=your_cookie" http://localhost:${SERVER_PORT}/api/token
                </div>
                <div class="endpoint">
                    curl http://localhost:${SERVER_PORT}/api/token?force=true
                </div>
            </div>
        </div>

        <div class="footer">
            <p>Built with using Bun, Elysia, and Playwright</p>
            <p>Version: Bun v${Bun.version} | Service: spotify-token-service</p>
        </div>
    </div>

    <script>
        async function updateStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                // Handle uptime safely
                const uptime = data.uptime || 0;
                document.getElementById('uptime').textContent = Math.round(uptime / 1000) + 's';
                
                // Handle memory usage safely
                const memoryUsage = data.memoryUsage || {};
                const rss = memoryUsage.rss || 0;
                const heapUsed = memoryUsage.heapUsed || 0;
                
                document.getElementById('memory').textContent = Math.round(rss / 1024 / 1024) + 'MB';
                document.getElementById('heap').textContent = Math.round(heapUsed / 1024 / 1024) + 'MB';
                document.getElementById('browser').textContent = data.browserConnected ? 'Connected' : 'Disconnected';
            } catch (error) {
                console.error('Failed to update status:', error);
                // Set fallback values
                document.getElementById('uptime').textContent = 'Error';
                document.getElementById('memory').textContent = 'Error';
                document.getElementById('heap').textContent = 'Error';
                document.getElementById('browser').textContent = 'Error';
            }
        }

        // Update status every 5 seconds
        updateStatus();
        setInterval(updateStatus, 5000);
    </script>
</body>
</html>
        `, {
            headers: {
                'Content-Type': 'text/html',
            },
        });
    }

    public start(): void {
        this.app.listen(SERVER_PORT, () => {
            logs('info', '🚀 Spotify Token Service Started');
            logs('info', `📡 Server: http://localhost:${SERVER_PORT}`);
            logs('info', `🌐 Web Interface: http://localhost:${SERVER_PORT}`);
            logs('info', `🎯 Token API: http://localhost:${SERVER_PORT}/api/token`);
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