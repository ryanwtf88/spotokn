export class MutexLock {
    private isLocked = false;
    private pendingResolvers: Array<(releaseCallback: () => void) => void> = [];
    private readonly maxWaitTime: number;
    private readonly lockTimeout: number;
    private lockStartTime: number = 0;

    constructor(maxWaitTime: number = 30000, lockTimeout: number = 60000) {
        this.maxWaitTime = maxWaitTime;
        this.lockTimeout = lockTimeout;
    }

    async lock(): Promise<() => void> {
        if (this.isLocked) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    const index = this.pendingResolvers.indexOf(resolve);
                    if (index > -1) {
                        this.pendingResolvers.splice(index, 1);
                    }
                    reject(new Error('Mutex lock timeout - maximum wait time exceeded'));
                }, this.maxWaitTime);

                this.pendingResolvers.push((releaseCallback) => {
                    clearTimeout(timeout);
                    resolve(releaseCallback);
                });
            });
        }

        this.isLocked = true;
        this.lockStartTime = Date.now();
        
        // Set a timeout to automatically release the lock if it's held too long
        const lockTimeout = setTimeout(() => {
            if (this.isLocked) {
                this.forceRelease();
            }
        }, this.lockTimeout);

        return this.release(lockTimeout);
    }

    private release = (timeout?: NodeJS.Timeout): (() => void) => {
        return () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            
            const nextResolver = this.pendingResolvers.shift();
            if (nextResolver) {
                nextResolver(this.release());
            } else {
                this.isLocked = false;
                this.lockStartTime = 0;
            }
        };
    };

    private forceRelease(): void {
        this.isLocked = false;
        this.lockStartTime = 0;
        
        // Reject all pending resolvers
        while (this.pendingResolvers.length > 0) {
            const resolver = this.pendingResolvers.shift();
            if (resolver) {
                resolver(() => {}); // Provide a no-op release function
            }
        }
    }

    public isLockedNow(): boolean {
        return this.isLocked;
    }

    public getLockDuration(): number {
        if (!this.isLocked) return 0;
        return Date.now() - this.lockStartTime;
    }

    public getPendingCount(): number {
        return this.pendingResolvers.length;
    }

    public async withLock<T>(fn: () => Promise<T>): Promise<T> {
        const release = await this.lock();
        try {
            return await fn();
        } finally {
            release();
        }
    }
}