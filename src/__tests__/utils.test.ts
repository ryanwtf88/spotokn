import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { MutexLock } from "../utils/mutex";

describe("MutexLock", () => {
    let mutex: MutexLock;

    beforeEach(() => {
        mutex = new MutexLock(1000, 2000); // 1s lock duration, 2s timeout
    });

    afterEach(() => {
        // Clean up any pending locks
        if (mutex.isLockedNow()) {
            // Force unlock if needed
            (mutex as any).unlock();
        }
    });

    describe("Basic Functionality", () => {
        it("should create mutex with correct configuration", () => {
            expect(mutex).toBeDefined();
            expect(mutex.isLockedNow()).toBe(false);
            expect(mutex.getPendingCount()).toBe(0);
        });

        it("should acquire and release lock", async () => {
            const result = await mutex.withLock(async () => {
                expect(mutex.isLockedNow()).toBe(true);
                return "test-result";
            });

            expect(result).toBe("test-result");
            expect(mutex.isLockedNow()).toBe(false);
        });

        it("should handle multiple sequential locks", async () => {
            const results: string[] = [];

            for (let i = 0; i < 3; i++) {
                const result = await mutex.withLock(async () => {
                    expect(mutex.isLockedNow()).toBe(true);
                    return `result-${i}`;
                });
                results.push(result);
            }

            expect(results).toEqual(["result-0", "result-1", "result-2"]);
            expect(mutex.isLockedNow()).toBe(false);
        });
    });

    describe("Concurrent Access", () => {
        it("should handle concurrent lock requests", async () => {
            const promises: Promise<number>[] = [];

            // Start multiple concurrent lock requests
            for (let i = 0; i < 5; i++) {
                promises.push(
                    mutex.withLock(async () => {
                        // Simulate some work
                        await new Promise(resolve => setTimeout(resolve, 10));
                        return i;
                    })
                );
            }

            const results = await Promise.all(promises);

            expect(results).toHaveLength(5);
            expect(results.sort()).toEqual([0, 1, 2, 3, 4]);
            expect(mutex.isLockedNow()).toBe(false);
        });

        it("should queue concurrent requests", async () => {
            const executionOrder: number[] = [];
            const promises: Promise<number>[] = [];

            // Start multiple concurrent requests
            for (let i = 0; i < 3; i++) {
                promises.push(
                    mutex.withLock(async () => {
                        executionOrder.push(i);
                        await new Promise(resolve => setTimeout(resolve, 50));
                        return i;
                    })
                );
            }

            await Promise.all(promises);

            // Should execute in order (FIFO)
            expect(executionOrder).toEqual([0, 1, 2]);
        });
    });

    describe("Error Handling", () => {
        it("should release lock on error", async () => {
            await expect(
                mutex.withLock(async () => {
                    expect(mutex.isLockedNow()).toBe(true);
                    throw new Error("Test error");
                })
            ).rejects.toThrow("Test error");

            expect(mutex.isLockedNow()).toBe(false);
        });

        it("should handle async errors", async () => {
            await expect(
                mutex.withLock(async () => {
                    expect(mutex.isLockedNow()).toBe(true);
                    await new Promise((_, reject) => setTimeout(() => reject(new Error("Async error")), 10));
                })
            ).rejects.toThrow("Async error");

            expect(mutex.isLockedNow()).toBe(false);
        });
    });

    describe("Timeout Handling", () => {
        it("should timeout on long-running operations", async () => {
            const shortMutex = new MutexLock(100, 200); // Very short timeout

            await expect(
                shortMutex.withLock(async () => {
                    await new Promise(resolve => setTimeout(resolve, 300));
                })
            ).rejects.toThrow();
        });

        it("should handle timeout in queue", async () => {
            const shortMutex = new MutexLock(50, 100);
            const results: string[] = [];

            // First lock holds for a long time
            const longPromise = shortMutex.withLock(async () => {
                await new Promise(resolve => setTimeout(resolve, 200));
                results.push("long");
            });

            // Second lock should timeout
            const shortPromise = shortMutex.withLock(async () => {
                results.push("short");
            });

            await expect(shortPromise).rejects.toThrow();
            await longPromise;
            expect(results).toEqual(["long"]);
        });
    });

    describe("Status Monitoring", () => {
        it("should track pending count", async () => {
            const promises: Promise<void>[] = [];

            // Start multiple requests
            for (let i = 0; i < 3; i++) {
                promises.push(
                    mutex.withLock(async () => {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    })
                );
            }

            // Check pending count while requests are running
            const pendingCount = mutex.getPendingCount();
            expect(pendingCount).toBeGreaterThan(0);

            await Promise.all(promises);
            expect(mutex.getPendingCount()).toBe(0);
        });

        it("should track lock duration", async () => {
            const startTime = Date.now();
            
            await mutex.withLock(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
            });

            const lockDuration = mutex.getLockDuration();
            expect(lockDuration).toBeGreaterThan(0);
            expect(lockDuration).toBeLessThan(200);
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty function", async () => {
            const result = await mutex.withLock(async () => {
                // Empty function
            });

            expect(result).toBeUndefined();
            expect(mutex.isLockedNow()).toBe(false);
        });

        it("should handle synchronous function", async () => {
            const result = await mutex.withLock(async () => {
                return "sync-result";
            });

            expect(result).toBe("sync-result");
            expect(mutex.isLockedNow()).toBe(false);
        });

        it("should handle null/undefined return values", async () => {
            const result1 = await mutex.withLock(async () => null);
            const result2 = await mutex.withLock(async () => undefined);

            expect(result1).toBeNull();
            expect(result2).toBeUndefined();
        });
    });
});

describe("Logger Utility", () => {
    it("should handle different log levels", () => {
        // Test that logs function exists and can be called
        const { logs } = require("../utils/logger");
        
        // Test different log levels - these should not throw
        expect(() => {
            logs("info", "Test info message");
            logs("warn", "Test warning message");
            logs("error", "Test error message");
            logs("debug", "Test debug message");
        }).not.toThrow();
    });

    it("should handle log messages with metadata", () => {
        const { logs } = require("../utils/logger");
        
        // Test logging with metadata
        expect(() => {
            logs("info", "Test message", { key: "value", number: 123 });
        }).not.toThrow();
    });
});