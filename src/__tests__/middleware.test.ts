import { describe, it, expect, mock } from "bun:test";
import { ErrorMiddleware } from "../middleware/error";

describe("Error Middleware", () => {
    describe("Error Handling", () => {
        it("should handle VALIDATION error", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-1";
            
            const result = ErrorMiddleware.handle("VALIDATION", new Error("Validation failed"), setStatus, requestId);
            
            expect(result).toBeDefined();
            expect(result.error).toBe("Request validation failed");
            expect(result.code).toBe("UNKNOWN");
            expect(result.requestId).toBe(requestId);
            expect(setStatus).toHaveBeenCalledWith(400);
        });

        it("should handle NOT_FOUND error", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-2";
            
            const result = ErrorMiddleware.handle("NOT_FOUND", new Error("Not found"), setStatus, requestId);
            
            expect(result).toBeDefined();
            expect(result.error).toBe("Endpoint not found");
            expect(result.code).toBe("UNKNOWN");
            expect(result.requestId).toBe(requestId);
            expect(setStatus).toHaveBeenCalledWith(404);
        });

        it("should handle INTERNAL_SERVER_ERROR", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-3";
            
            const result = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", new Error("Internal error"), setStatus, requestId);
            
            expect(result).toBeDefined();
            expect(result.error).toBe("Unknown error");
            expect(result.code).toBe("UNKNOWN");
            expect(result.requestId).toBe(requestId);
            expect(setStatus).toHaveBeenCalledWith(500);
        });

        it("should handle PARSE error", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-4";
            
            const result = ErrorMiddleware.handle("PARSE", new Error("Parse error"), setStatus, requestId);
            
            expect(result).toBeDefined();
            expect(result.error).toBe("Unknown error");
            expect(result.code).toBe("UNKNOWN");
            expect(result.requestId).toBe(requestId);
            expect(setStatus).toHaveBeenCalledWith(500);
        });

        it("should handle unknown error codes", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-5";
            
            const result = ErrorMiddleware.handle("UNKNOWN_ERROR" as any, new Error("Unknown error"), setStatus, requestId);
            
            expect(result).toBeDefined();
            expect(result.error).toBe("Unknown error");
            expect(result.code).toBe("UNKNOWN");
            expect(result.requestId).toBe(requestId);
            expect(setStatus).toHaveBeenCalledWith(500);
        });
    });

    describe("Error Message Handling", () => {
        it("should handle Error objects", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-6";
            const error = new Error("Test error message");
            
            const result = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", error, setStatus, requestId);
            
            expect(result.error).toBe("Test error message");
        });

        it("should handle string errors", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-7";
            const error = "String error message";
            
            const result = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", error, setStatus, requestId);
            
            expect(result.error).toBe("String error message");
        });

        it("should handle object errors", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-8";
            const error = { message: "Object error message", code: "TEST_ERROR" };
            
            const result = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", error, setStatus, requestId);
            
            expect(result.error).toBe("Object error message");
        });

        it("should handle null/undefined errors", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-9";
            
            const result1 = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", null, setStatus, requestId);
            expect(result1.error).toBe("Unknown error occurred");
            
            const result2 = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", undefined, setStatus, requestId);
            expect(result2.error).toBe("Unknown error occurred");
        });
    });

    describe("Request ID Handling", () => {
        it("should use provided request ID", () => {
            const setStatus = mock(() => {});
            const requestId = "custom-request-id";
            
            const result = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", new Error("Test"), setStatus, requestId);
            
            expect(result.requestId).toBe(requestId);
        });

        it("should generate request ID if not provided", () => {
            const setStatus = mock(() => {});
            
            const result = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", new Error("Test"), setStatus);
            
            expect(result.requestId).toBeDefined();
            expect(result.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
        });
    });

    describe("Status Code Mapping", () => {
        it("should map all known error codes correctly", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-status";
            
            const testCases = [
                { code: "VALIDATION", expectedStatus: 400 },
                { code: "NOT_FOUND", expectedStatus: 404 },
                { code: "INTERNAL_SERVER_ERROR", expectedStatus: 500 },
                { code: "PARSE", expectedStatus: 500 },
                { code: "UNKNOWN_ERROR" as any, expectedStatus: 500 }
            ];

            testCases.forEach(({ code, expectedStatus }) => {
                const result = ErrorMiddleware.handle(code, new Error("Test"), setStatus, requestId);
                expect(result.code).toBeDefined();
                expect(setStatus).toHaveBeenCalledWith(expectedStatus);
            });
        });
    });

    describe("Response Structure", () => {
        it("should return consistent response structure", () => {
            const setStatus = mock(() => {});
            const requestId = "test-request-structure";
            const error = new Error("Test error");
            
            const result = ErrorMiddleware.handle("INTERNAL_SERVER_ERROR", error, setStatus, requestId);
            
            expect(result).toHaveProperty("error");
            expect(result).toHaveProperty("status");
            expect(result).toHaveProperty("requestId");
            expect(result).toHaveProperty("timestamp");
            expect(typeof result.timestamp).toBe("number");
            expect(result.timestamp).toBeGreaterThan(0);
        });
    });
});