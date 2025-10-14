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
                    uptime: isNaN(uptime) ? 0 : Math.round(uptime * 1000),
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

    private formatUptime(milliseconds: number): string {
        const seconds = Math.floor(milliseconds / 1000);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (days > 0) {
            return days + "d " + hours.toString().padStart(2, '0') + "h " + minutes.toString().padStart(2, '0') + "m " + secs.toString().padStart(2, '0') + "s";
        }
        return hours.toString().padStart(2, '0') + ":" + minutes.toString().padStart(2, '0') + ":" + secs.toString().padStart(2, '0');
    }

    private getWebInterface() {
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Spotify Token Service</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
        }
        
        body { 
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #1a2f3f, #0d1b2a);
            min-height: 100vh;
            color: #fff;
            overflow-x: hidden;
        }
        
        .floating-bg {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            opacity: 0.1;
        }
        
        .floating-circle {
            position: absolute;
            border-radius: 50%;
            background: radial-gradient(circle, #1db954, transparent);
            animation: float 20s infinite linear;
        }
        
        .floating-circle:nth-child(1) {
            width: 300px;
            height: 300px;
            top: 10%;
            left: 10%;
            animation-delay: 0s;
        }
        
        .floating-circle:nth-child(2) {
            width: 200px;
            height: 200px;
            top: 60%;
            right: 10%;
            animation-delay: -5s;
            background: radial-gradient(circle, #1ed760, transparent);
        }
        
        .floating-circle:nth-child(3) {
            width: 150px;
            height: 150px;
            bottom: 20%;
            left: 20%;
            animation-delay: -10s;
            background: radial-gradient(circle, #1db954, transparent);
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            25% { transform: translateY(-20px) rotate(90deg); }
            50% { transform: translateY(0px) rotate(180deg); }
            75% { transform: translateY(20px) rotate(270deg); }
        }
        
        .container { 
            max-width: 1400px; 
            margin: 0 auto; 
            padding: 2rem;
            position: relative;
            z-index: 1;
        }
        
        .header {
            text-align: center;
            margin-bottom: 4rem;
            position: relative;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: -10px;
            left: 50%;
            transform: translateX(-50%);
            width: 100px;
            height: 4px;
            background: linear-gradient(90deg, #1db954, #1ed760);
            border-radius: 2px;
        }
        
        .header h1 {
            font-size: 4rem;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #1db954, #1ed760);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 30px rgba(29, 185, 84, 0.3);
            font-weight: 700;
            letter-spacing: -1px;
        }
        
        .header p {
            font-size: 1.4rem;
            opacity: 0.8;
            font-weight: 300;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 2.5rem;
            margin-bottom: 4rem;
        }
        
        .card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 2.5rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 
                0 20px 40px rgba(0, 0, 0, 0.3),
                0 0 0 1px rgba(255, 255, 255, 0.05),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }
        
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #1db954, #1ed760);
            transform: scaleX(0);
            transition: transform 0.3s ease;
        }
        
        .card:hover {
            transform: translateY(-10px) scale(1.02);
            box-shadow: 
                0 30px 60px rgba(0, 0, 0, 0.4),
                0 0 0 1px rgba(255, 255, 255, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }
        
        .card:hover::before {
            transform: scaleX(1);
        }
        
        .card h2 {
            margin-bottom: 1.5rem;
            font-size: 1.8rem;
            font-weight: 600;
            color: #1db954;
        }
        
        .btn-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }
        
        .btn {
            background: linear-gradient(135deg, #1db954, #1ed760);
            border: none;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            cursor: pointer;
            text-decoration: none;
            text-align: center;
            font-weight: 500;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 8px 25px rgba(29, 185, 84, 0.3);
            position: relative;
            overflow: hidden;
        }
        
        .btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }
        
        .btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 35px rgba(29, 185, 84, 0.4);
        }
        
        .btn:hover::before {
            left: 100%;
        }
        
        .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
        }
        
        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
        }
        
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin: 1.5rem 0;
        }
        
        .status-item {
            background: rgba(0, 0, 0, 0.3);
            padding: 1.5rem;
            border-radius: 15px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .status-label {
            font-size: 0.9rem;
            opacity: 0.7;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-value {
            font-size: 1.4rem;
            font-weight: 600;
            color: #1db954;
        }
        
        .endpoint {
            background: rgba(0, 0, 0, 0.4);
            padding: 1.2rem;
            border-radius: 12px;
            margin: 1rem 0;
            font-family: 'Monaco', 'Menlo', monospace;
            border-left: 4px solid #1db954;
            transition: all 0.3s ease;
        }
        
        .endpoint:hover {
            background: rgba(0, 0, 0, 0.5);
            transform: translateX(5px);
        }
        
        .footer {
            text-align: center;
            margin-top: 4rem;
            padding-top: 2rem;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            opacity: 0.7;
        }
        
        .pulse {
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { 
                opacity: 1;
                transform: scale(1);
            }
            50% { 
                opacity: 0.7;
                transform: scale(1.05);
            }
        }
        
        .live-badge {
            display: inline-block;
            background: #1db954;
            color: white;
            padding: 0.3rem 0.8rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            margin-left: 0.5rem;
            animation: pulse 2s infinite;
        }
        
        .metric-chart {
            width: 100%;
            height: 120px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
            margin: 1rem 0;
            position: relative;
            overflow: hidden;
        }
        
        .chart-bar {
            position: absolute;
            bottom: 0;
            width: 8px;
            background: linear-gradient(to top, #1db954, #1ed760);
            border-radius: 4px 4px 0 0;
            animation: grow 1s ease-out;
        }
        
        @keyframes grow {
            from { height: 0; }
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }
            
            .header h1 {
                font-size: 2.5rem;
            }
            
            .grid {
                grid-template-columns: 1fr;
            }
            
            .btn-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="floating-bg">
        <div class="floating-circle"></div>
        <div class="floating-circle"></div>
        <div class="floating-circle"></div>
    </div>
    
    <div class="container">
        <div class="header">
            <h1>Spotokn</h1>
            <p>High-performance token generation with real-time monitoring</p>
        </div>

        <div class="grid">
            <div class="card">
                <h2>Quick Actions</h2>
                <div class="btn-grid">
                    <a href="/api/token" class="btn">Get Token</a>
                    <a href="/api/token?debug=true" class="btn btn-secondary">Debug Info</a>
                    <a href="/api/token?metrics=true" class="btn btn-secondary">Metrics</a>
                    <a href="/api/token?refresh=true" class="btn">Refresh Token</a>
                    <a href="/api/lavasrc/token" class="btn">LavaSrc Token</a>
                    <a href="/api/token-tracker" class="btn btn-secondary">Token Tracker</a>
                    <a href="/api/refresh" class="btn">Force Refresh</a>
                </div>
            </div>

            <div class="card">
                <h2>Service Status <span class="live-badge">LIVE</span></h2>
                <div class="status-grid">
                    <div class="status-item">
                        <div class="status-label">Uptime</div>
                        <div class="status-value" id="uptime">00:00:00</div>
                    </div>
                    <div class="status-item">
                        <div class="status-label">Memory</div>
                        <div class="status-value" id="memory">0 MB</div>
                    </div>
                    <div class="status-item">
                        <div class="status-label">Heap Used</div>
                        <div class="status-value" id="heap">0 MB</div>
                    </div>
                    <div class="status-item">
                        <div class="status-label">Browser</div>
                        <div class="status-value" id="browser">Checking...</div>
                    </div>
                </div>
                <div class="metric-chart" id="memoryChart"></div>
            </div>

            <div class="card">
                <h2>API Endpoints</h2>
                <div class="endpoint">GET /api/token</div>
                <div class="endpoint">GET /api/token?debug=true</div>
                <div class="endpoint">GET /api/token?metrics=true</div>
                <div class="endpoint">GET /api/token?refresh=true</div>
                <div class="endpoint">GET /api/lavasrc/token</div>
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
                    curl http://localhost:${SERVER_PORT}/api/token?refresh=true
                </div>
                <div class="endpoint">
                    curl http://localhost:${SERVER_PORT}/api/lavasrc/token
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
        let memoryData = [];
        const maxDataPoints = 20;
        
        function formatUptime(milliseconds) {
            const seconds = Math.floor(milliseconds / 1000);
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            if (days > 0) {
                return days + "d " + hours.toString().padStart(2, '0') + "h " + minutes.toString().padStart(2, '0') + "m " + secs.toString().padStart(2, '0') + "s";
            }
            return hours.toString().padStart(2, '0') + ":" + minutes.toString().padStart(2, '0') + ":" + secs.toString().padStart(2, '0');
        }
        
        function updateMemoryChart() {
            const chart = document.getElementById('memoryChart');
            chart.innerHTML = '';
            
            if (memoryData.length === 0) return;
            
            const maxMemory = Math.max(...memoryData);
            const chartWidth = chart.offsetWidth;
            const barWidth = Math.max(6, (chartWidth - 20) / memoryData.length - 2);
            
            memoryData.forEach((value, index) => {
                const bar = document.createElement('div');
                bar.className = 'chart-bar';
                bar.style.height = ((value / maxMemory) * 100) + '%';
                bar.style.left = (index * (barWidth + 2)) + 'px';
                bar.style.width = barWidth + 'px';
                chart.appendChild(bar);
            });
        }
        
        async function updateStatus() {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                const uptime = data.uptime || 0;
                document.getElementById('uptime').textContent = formatUptime(uptime);
                
                const memoryUsage = data.memoryUsage || {};
                const rss = memoryUsage.rss || 0;
                const heapUsed = memoryUsage.heapUsed || 0;
                
                const rssMB = Math.round(rss / 1024 / 1024);
                const heapMB = Math.round(heapUsed / 1024 / 1024);
                
                document.getElementById('memory').textContent = rssMB + ' MB';
                document.getElementById('heap').textContent = heapMB + ' MB';
                document.getElementById('browser').textContent = data.browserConnected ? 'Connected' : 'Disconnected';
                
                memoryData.push(rssMB);
                if (memoryData.length > maxDataPoints) {
                    memoryData.shift();
                }
                updateMemoryChart();
                
            } catch (error) {
                console.error('Failed to update status:', error);
                document.getElementById('uptime').textContent = 'Error';
                document.getElementById('memory').textContent = 'Error';
                document.getElementById('heap').textContent = 'Error';
                document.getElementById('browser').textContent = 'Error';
            }
        }
        
        updateStatus();
        setInterval(updateStatus, 2000);
        
        setInterval(() => {
            const uptimeElement = document.getElementById('uptime');
            const currentText = uptimeElement.textContent;
            if (!currentText.includes('Error')) {
                const currentUptime = uptimeElement.dataset.uptime ? 
                    parseInt(uptimeElement.dataset.uptime) + 2000 : 2000;
                uptimeElement.dataset.uptime = currentUptime;
                uptimeElement.textContent = formatUptime(currentUptime);
            }
        }, 2000);
        
        window.addEventListener('resize', updateMemoryChart);
    </script>
</body>
</html>`;

        return new Response(htmlContent, {
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
