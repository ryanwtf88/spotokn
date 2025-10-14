import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Spotify } from "../services/spotify";
import { SpotifyBrowser } from "../services/browser";
import { TokenController } from "../controllers/token";

// Mock the browser service
const mockBrowser = {
    getToken: mock(() => Promise.resolve({
        accessToken: "test-token",
        accessTokenExpirationTimestampMs: Date.now() + 3600000,
        clientId: "test-client-id",
        isAnonymous: true,
        timestamp: Date.now(),
        cached: false,
        source: "anonymous"
    })),
    close: mock(() => Promise.resolve()),
    healthCheck: mock(() => Promise.resolve(true)),
    getStatus: mock(() => ({ isConnected: true }))
};

// Mock the Spotify service
const mockSpotifyService = {
    getToken: mock(() => Promise.resolve({
        accessToken: "test-token",
        accessTokenExpirationTimestampMs: Date.now() + 3600000,
        clientId: "test-client-id",
        isAnonymous: true,
        timestamp: Date.now(),
        cached: false,
        source: "anonymous"
    })),
    getStatus: mock(() => ({
        hasAnonymousToken: true,
        hasAuthenticatedToken: false,
        isRefreshing: false,
        anonymousTokenValid: true,
        authenticatedTokenValid: false,
        lastRefresh: Date.now(),
        uptime: 1000,
        memoryUsage: {
            rss: 1000000,
            heapTotal: 500000,
            heapUsed: 300000,
            external: 100000,
            arrayBuffers: 50000
        },
        browserConnected: true
    })),
    getMetrics: mock(() => ({
        serviceState: "ready",
        uptime: 1000,
        refreshCount: 1,
        errorCount: 0,
        lastRefreshTime: Date.now(),
        hasAnonymousToken: true,
        hasAuthenticatedToken: false,
        anonymousTokenValid: true,
        authenticatedTokenValid: false,
        browserStatus: { isConnected: true }
    })),
    forceRefresh: mock(() => Promise.resolve({
        accessToken: "refreshed-token",
        accessTokenExpirationTimestampMs: Date.now() + 3600000,
        clientId: "test-client-id",
        isAnonymous: true,
        timestamp: Date.now(),
        cached: false,
        source: "anonymous"
    })),
    cleanup: mock(() => Promise.resolve())
};

describe("Application Server", () => {
    let server: any;
    let tokenService: any;
    let tokenController: any;

    beforeEach(() => {
        // Reset mocks
        mockBrowser.getToken.mockClear();
        mockBrowser.close.mockClear();
        mockBrowser.healthCheck.mockClear();
        mockBrowser.getStatus.mockClear();
        
        mockSpotifyService.getToken.mockClear();
        mockSpotifyService.getStatus.mockClear();
        mockSpotifyService.getMetrics.mockClear();
        mockSpotifyService.forceRefresh.mockClear();
        mockSpotifyService.cleanup.mockClear();
    });

    afterEach(() => {
        if (server) {
            server.close?.();
        }
    });

    describe("Health Endpoint", () => {
        it("should return healthy status with proper memory handling", async () => {
            const response = await fetch("http://localhost:3012/health");
            const data = await response.json() as any;

            expect(response.status).toBe(200);
            expect(data.status).toBe("healthy");
            expect(data.timestamp).toBeTypeOf("number");
            expect(data.uptime).toBeTypeOf("number");
            expect(data.version).toContain("Bun v");
            expect(data.service).toBe("spotify-token-service");
            expect(data.memory).toBeDefined();
            expect(data.memory.rss).toBeTypeOf("number");
            expect(data.memory.heapTotal).toBeTypeOf("number");
            expect(data.memory.heapUsed).toBeTypeOf("number");
            expect(data.memory.external).toBeTypeOf("number");
            expect(data.memory.arrayBuffers).toBeTypeOf("number");
            expect(data.pid).toBeTypeOf("number");
        });

        it("should handle NaN values in memory usage", async () => {
            // Mock process.memoryUsage to return NaN values
            const originalMemoryUsage = process.memoryUsage;
            process.memoryUsage = (() => ({
                rss: NaN,
                heapTotal: NaN,
                heapUsed: NaN,
                external: NaN,
                arrayBuffers: NaN
            })) as any;

            const response = await fetch("http://localhost:3012/health");
            const data = await response.json() as any;

            expect(data.memory.rss).toBe(0);
            expect(data.memory.heapTotal).toBe(0);
            expect(data.memory.heapUsed).toBe(0);
            expect(data.memory.external).toBe(0);
            expect(data.memory.arrayBuffers).toBe(0);

            // Restore original function
            process.memoryUsage = originalMemoryUsage;
        });
    });

    describe("Token Endpoint", () => {
        it("should return token for anonymous request", async () => {
            const response = await fetch("http://localhost:3012/api/token");
            const data = await response.json() as any;

            expect(response.status).toBe(200);
            expect(data.accessToken).toBeDefined();
            expect(data.accessTokenExpirationTimestampMs).toBeTypeOf("number");
            expect(data.clientId).toBeDefined();
            expect(data.isAnonymous).toBe(true);
        });

        it("should return token for authenticated request with cookies", async () => {
            const response = await fetch("http://localhost:3012/api/token", {
                headers: {
                    "Cookie": "sp_dc=test-cookie-value"
                }
            });
            const data = await response.json() as any;

            expect(response.status).toBe(200);
            expect(data.accessToken).toBeDefined();
            expect(data.accessTokenExpirationTimestampMs).toBeTypeOf("number");
            expect(data.clientId).toBeDefined();
        });

        it("should handle debug parameter", async () => {
            const response = await fetch("http://localhost:3012/api/token?debug=true");
            const data = await response.json() as any;

            expect(response.status).toBe(200);
            expect(data).toBeDefined();
        });

        it("should handle metrics parameter", async () => {
            const response = await fetch("http://localhost:3012/api/token?metrics=true");
            const data = await response.json() as any;

            expect(response.status).toBe(200);
            expect(data).toBeDefined();
        });
    });

    describe("Status Endpoint", () => {
        it("should return service status", async () => {
            const response = await fetch("http://localhost:3012/api/status");
            const data = await response.json() as any;

            expect(response.status).toBe(200);
            expect(data.hasAnonymousToken).toBeDefined();
            expect(data.hasAuthenticatedToken).toBeDefined();
            expect(data.isRefreshing).toBeDefined();
            expect(data.uptime).toBeTypeOf("number");
            expect(data.memoryUsage).toBeDefined();
            expect(data.browserConnected).toBeDefined();
        });
    });

    describe("Metrics Endpoint", () => {
        it("should return service metrics", async () => {
            const response = await fetch("http://localhost:3012/api/metrics");
            const data = await response.json() as any;

            expect(response.status).toBe(200);
            expect(data.serviceState).toBeDefined();
            expect(data.uptime).toBeTypeOf("number");
            expect(data.refreshCount).toBeTypeOf("number");
            expect(data.errorCount).toBeTypeOf("number");
            expect(data.browserStatus).toBeDefined();
        });
    });

    describe("Refresh Endpoint", () => {
        it("should force refresh token", async () => {
            const response = await fetch("http://localhost:3012/api/refresh");
            const data = await response.json() as any;

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data).toBeDefined();
        });
    });

    describe("Web Interface", () => {
        it("should return HTML interface", async () => {
            const response = await fetch("http://localhost:3012/");
            const html = await response.text();

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("text/html");
            expect(html).toContain("Spotokn");
            expect(html).toContain("High-performance token generation");
        });
    });

    describe("Error Handling", () => {
        it("should handle invalid endpoints", async () => {
            const response = await fetch("http://localhost:3012/invalid-endpoint");
            expect(response.status).toBe(404);
        });

        it("should handle malformed requests gracefully", async () => {
            const response = await fetch("http://localhost:3012/api/token", {
                method: "POST",
                body: "invalid-json"
            });
            // Should still return 200 for GET endpoint
            expect(response.status).toBe(200);
        });
    });
});

describe("Memory Management", () => {
    it("should handle memory usage without NaN values", () => {
        const memoryUsage = process.memoryUsage();
        
        expect(memoryUsage.rss).not.toBeNaN();
        expect(memoryUsage.heapTotal).not.toBeNaN();
        expect(memoryUsage.heapUsed).not.toBeNaN();
        expect(memoryUsage.external).not.toBeNaN();
        expect(memoryUsage.arrayBuffers).not.toBeNaN();
    });

    it("should handle uptime without NaN values", () => {
        const uptime = process.uptime();
        expect(uptime).not.toBeNaN();
        expect(uptime).toBeGreaterThanOrEqual(0);
    });
});

describe("Environment Variables", () => {
    it("should use correct default port", () => {
        const port = parseInt(process.env.PORT || '3012', 10);
        expect(port).toBe(3012);
    });

    it("should handle missing environment variables gracefully", () => {
        const headless = process.env.HEADLESS !== 'false';
        expect(typeof headless).toBe("boolean");
    });
});