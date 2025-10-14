import { describe, it, expect, beforeEach, mock } from "bun:test";
import { TokenController } from "../controllers/token";
import { Spotify } from "../services/spotify";
import type { Cookie, RequestContext } from "../types/types";

describe("Token Controller", () => {
    let tokenController: TokenController;
    let mockSpotifyService: any;

    beforeEach(() => {
        mockSpotifyService = {
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

        tokenController = new TokenController(mockSpotifyService);
    });

    describe("Token Handling", () => {
        it("should handle token request without cookies", async () => {
            const query = {};
            const cookies = undefined;
            const setStatus = mock(() => {});
            const requestContext: RequestContext = {
                requestId: "test-request-1",
                timestamp: Date.now(),
                userAgent: "test-agent",
                ip: "127.0.0.1",
                queryParams: query
            };

            const result = await tokenController.handle(query, cookies, setStatus, requestContext);

            expect(result).toBeDefined();
            expect(result.accessToken).toBe("test-token");
            expect(result.isAnonymous).toBe(true);
            expect(mockSpotifyService.getToken).toHaveBeenCalledWith(undefined, requestContext);
        });

        it("should handle token request with cookies", async () => {
            const query = {};
            const cookies = {
                "sp_dc": "test-cookie-value"
            };
            const setStatus = mock(() => {});
            const requestContext: RequestContext = {
                requestId: "test-request-2",
                timestamp: Date.now(),
                userAgent: "test-agent",
                ip: "127.0.0.1",
                cookies: [{ name: "sp_dc", value: "test-cookie-value" }],
                queryParams: query
            };

            mockSpotifyService.getToken.mockResolvedValueOnce({
                accessToken: "auth-token",
                accessTokenExpirationTimestampMs: Date.now() + 3600000,
                clientId: "test-client-id",
                isAnonymous: false,
                timestamp: Date.now(),
                cached: false,
                source: "authenticated"
            });

            const result = await tokenController.handle(query, cookies, setStatus, requestContext);

            expect(result).toBeDefined();
            expect(result.data.accessToken).toBe("auth-token");
            expect(result.data.isAnonymous).toBe(false);
            expect(mockSpotifyService.getToken).toHaveBeenCalledWith([{ name: "sp_dc", value: "test-cookie-value" }], requestContext);
        });

        it("should handle debug parameter", async () => {
            const query = { debug: "true" };
            const cookies = undefined;
            const setStatus = mock(() => {});
            const requestContext: RequestContext = {
                requestId: "test-request-3",
                timestamp: Date.now(),
                userAgent: "test-agent",
                ip: "127.0.0.1",
                queryParams: query
            };

            const result = await tokenController.handle(query, cookies, setStatus, requestContext);

            expect(result).toBeDefined();
            expect(result.hasAnonymousToken).toBeDefined();
            expect(result.hasAuthenticatedToken).toBeDefined();
            expect(result.uptime).toBeTypeOf("number");
            expect(result.memoryUsage).toBeDefined();
        });

        it("should handle metrics parameter", async () => {
            const query = { metrics: "true" };
            const cookies = undefined;
            const setStatus = mock(() => {});
            const requestContext: RequestContext = {
                requestId: "test-request-4",
                timestamp: Date.now(),
                userAgent: "test-agent",
                ip: "127.0.0.1",
                queryParams: query
            };

            const result = await tokenController.handle(query, cookies, setStatus, requestContext);

            expect(result).toBeDefined();
            expect(result.serviceState).toBeDefined();
            expect(result.uptime).toBeTypeOf("number");
            expect(result.refreshCount).toBeTypeOf("number");
        });

        it("should handle force parameter", async () => {
            const query = { force: "true" };
            const cookies = undefined;
            const setStatus = mock(() => {});
            const requestContext: RequestContext = {
                requestId: "test-request-5",
                timestamp: Date.now(),
                userAgent: "test-agent",
                ip: "127.0.0.1",
                queryParams: query
            };

            mockSpotifyService.forceRefresh.mockResolvedValueOnce({
                accessToken: "forced-token",
                accessTokenExpirationTimestampMs: Date.now() + 3600000,
                clientId: "test-client-id",
                isAnonymous: true,
                timestamp: Date.now(),
                cached: false,
                source: "anonymous"
            });

            const result = await tokenController.handle(query, cookies, setStatus, requestContext);

            expect(result).toBeDefined();
            expect(result.data.accessToken).toBe("forced-token");
            expect(mockSpotifyService.forceRefresh).toHaveBeenCalled();
        });
    });

    describe("Error Handling", () => {
        it("should handle service errors", async () => {
            const query = {};
            const cookies = undefined;
            const setStatus = mock(() => {});
            const requestContext: RequestContext = {
                requestId: "test-request-error",
                timestamp: Date.now(),
                userAgent: "test-agent",
                ip: "127.0.0.1",
                queryParams: query
            };

            mockSpotifyService.getToken.mockRejectedValueOnce(new Error("Service error"));

            const result = await tokenController.handle(query, cookies, setStatus, requestContext);

            expect(result).toBeDefined();
            expect(result.error).toBeDefined();
            expect(result.error).toContain("Service error");
            expect(setStatus).toHaveBeenCalledWith(500);
        });

        it("should handle timeout errors", async () => {
            const query = {};
            const cookies = undefined;
            const setStatus = mock(() => {});
            const requestContext: RequestContext = {
                requestId: "test-request-timeout",
                timestamp: Date.now(),
                userAgent: "test-agent",
                ip: "127.0.0.1",
                queryParams: query
            };

            mockSpotifyService.getToken.mockRejectedValueOnce(new Error("Timeout"));

            const result = await tokenController.handle(query, cookies, setStatus, requestContext);

            expect(result).toBeDefined();
            expect(result.error).toBeDefined();
            expect(setStatus).toHaveBeenCalledWith(500);
        });
    });

    describe("Metrics", () => {
        it("should return service metrics", () => {
            const metrics = tokenController.getMetrics();

            expect(metrics).toBeDefined();
            expect(metrics.requestCount).toBeTypeOf("number");
            expect(metrics.errorCount).toBeTypeOf("number");
            expect(metrics.errorRate).toBeTypeOf("number");
            expect(metrics.uptime).toBeTypeOf("number");
            expect(metrics.serviceMetrics).toBeDefined();
        });
    });

    describe("Request Context", () => {
        it("should handle missing request context", async () => {
            const query = {};
            const cookies = undefined;
            const setStatus = mock(() => {});

            const result = await tokenController.handle(query, cookies, setStatus);

            expect(result).toBeDefined();
            expect(mockSpotifyService.getToken).toHaveBeenCalledWith([], expect.any(Object));
        });

        it("should handle partial request context", async () => {
            const query = {};
            const cookies = undefined;
            const setStatus = mock(() => {});
            const requestContext: Partial<RequestContext> = {
                requestId: "partial-request",
                timestamp: Date.now()
            };

            const result = await tokenController.handle(query, cookies, setStatus, requestContext as RequestContext);

            expect(result).toBeDefined();
            expect(mockSpotifyService.getToken).toHaveBeenCalledWith([], requestContext);
        });
    });
});