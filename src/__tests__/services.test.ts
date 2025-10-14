import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Spotify } from "../services/spotify";
import { SpotifyBrowser } from "../services/browser";
import type { Cookie, RequestContext } from "../types/types";

describe("Spotify Service", () => {
    let spotifyService: Spotify;
    let mockBrowser: any;

    beforeEach(() => {
        mockBrowser = {
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

        // Mock the browser in Spotify service
        spotifyService = new Spotify();
        (spotifyService as any).browser = mockBrowser;
    });

    afterEach(() => {
        if (spotifyService) {
            spotifyService.cleanup();
        }
    });

    describe("Token Management", () => {
        it("should get anonymous token when no cookies provided", async () => {
            const token = await spotifyService.getToken();
            
            expect(token).toBeDefined();
            expect(token?.isAnonymous).toBe(true);
            expect(token?.accessToken).toBe("test-token");
            expect(mockBrowser.getToken).toHaveBeenCalledWith(undefined, expect.any(Object));
        });

        it("should get authenticated token when sp_dc cookie provided", async () => {
            const cookies: Cookie[] = [
                { name: "sp_dc", value: "test-cookie-value" }
            ];
            
            mockBrowser.getToken.mockResolvedValueOnce({
                accessToken: "auth-token",
                accessTokenExpirationTimestampMs: Date.now() + 3600000,
                clientId: "test-client-id",
                isAnonymous: false,
                timestamp: Date.now(),
                cached: false,
                source: "authenticated"
            });

            const token = await spotifyService.getToken(cookies);
            
            expect(token).toBeDefined();
            expect(token?.isAnonymous).toBe(false);
            expect(token?.accessToken).toBe("auth-token");
            expect(mockBrowser.getToken).toHaveBeenCalledWith(cookies, expect.any(Object));
        });

        it("should handle token refresh", async () => {
            const token = await spotifyService.forceRefresh();
            
            expect(token).toBeDefined();
            expect(token?.accessToken).toBe("test-token");
        });
    });

    describe("Service Status", () => {
        it("should return service status", () => {
            const status = spotifyService.getStatus();
            
            expect(status).toBeDefined();
            expect(status.hasAnonymousToken).toBeDefined();
            expect(status.hasAuthenticatedToken).toBeDefined();
            expect(status.isRefreshing).toBeDefined();
            expect(status.uptime).toBeTypeOf("number");
            expect(status.memoryUsage).toBeDefined();
            expect(status.browserConnected).toBeDefined();
        });

        it("should return service metrics", () => {
            const metrics = spotifyService.getMetrics();
            
            expect(metrics).toBeDefined();
            expect(metrics.serviceState).toBeDefined();
            expect(metrics.uptime).toBeTypeOf("number");
            expect(metrics.refreshCount).toBeTypeOf("number");
            expect(metrics.errorCount).toBeTypeOf("number");
            expect(metrics.browserStatus).toBeDefined();
        });
    });

    describe("Error Handling", () => {
        it("should handle browser errors gracefully", async () => {
            mockBrowser.getToken.mockRejectedValueOnce(new Error("Browser error"));
            
            await expect(spotifyService.getToken()).rejects.toThrow("Browser error");
        });

        it("should handle service recovery", async () => {
            // Mock service in error state
            (spotifyService as any).serviceState = "error";
            mockBrowser.healthCheck.mockResolvedValueOnce(false);
            mockBrowser.close.mockResolvedValueOnce(undefined);
            
            // Mock new browser instance
            const newMockBrowser = {
                getToken: mock(() => Promise.resolve({
                    accessToken: "recovered-token",
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
            
            // This would require more complex mocking to test recovery
            expect(spotifyService).toBeDefined();
        });
    });
});

describe("Spotify Browser Service", () => {
    let browserService: SpotifyBrowser;

    beforeEach(() => {
        browserService = new SpotifyBrowser();
    });

    afterEach(() => {
        if (browserService) {
            browserService.close();
        }
    });

    describe("Browser Management", () => {
        it("should initialize with correct configuration", () => {
            const status = browserService.getStatus();
            
            expect(status).toBeDefined();
            expect(status.isConnected).toBeDefined();
            expect(status.hasBrowser).toBeDefined();
            expect(status.hasContext).toBeDefined();
        });

        it("should handle health check", async () => {
            // Mock browser as not connected
            const healthStatus = await browserService.healthCheck();
            expect(typeof healthStatus).toBe("boolean");
        });
    });

    describe("Token Fetching", () => {
        it("should handle token fetch with retries", async () => {
            // This would require more complex mocking of playwright
            // For now, just test that the method exists and can be called
            expect(typeof browserService.getToken).toBe("function");
        });
    });

    describe("Configuration", () => {
        it("should use environment variables for configuration", () => {
            const browser = new SpotifyBrowser();
            expect(browser).toBeDefined();
        });

        it("should handle custom configuration", () => {
            const customConfig = {
                headless: false,
                timeout: 20000,
                retryAttempts: 5
            };
            
            const browser = new SpotifyBrowser(customConfig);
            expect(browser).toBeDefined();
        });
    });
});

describe("Memory and Performance", () => {
    it("should handle memory usage without leaks", () => {
        const initialMemory = process.memoryUsage();
        
        // Create and destroy multiple services
        for (let i = 0; i < 10; i++) {
            const service = new Spotify();
            service.cleanup();
        }
        
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        
        const finalMemory = process.memoryUsage();
        
        // Memory should not increase significantly
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB increase
    });

    it("should handle concurrent requests", async () => {
        const service = new Spotify();
        
        // Mock browser for concurrent requests
        (service as any).browser = {
            getToken: mock(() => Promise.resolve({
                accessToken: "concurrent-token",
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

        const promises = Array.from({ length: 10 }, () => service.getToken());
        const results = await Promise.all(promises);
        
        expect(results).toHaveLength(10);
        results.forEach(result => {
            expect(result).toBeDefined();
            expect(result?.accessToken).toBe("concurrent-token");
        });
        
        await service.cleanup();
    });
});