import playwright from "playwright";
import type {
    Browser,
    LaunchOptions,
    BrowserContext,
    Response,
    Page,
} from "playwright";
import type { SpotifyToken, Cookie, BrowserConfig, RequestContext } from "../types/types";
import { logs } from "../utils/logger";
import { MutexLock } from "../utils/mutex";

export class SpotifyBrowser {
    private browser: Browser | undefined;
    private context: BrowserContext | undefined;
    private readonly mutex: MutexLock;
    private readonly config: BrowserConfig;
    private isConnected: boolean = false;
    private lastLaunchTime: number = 0;
    private readonly minLaunchInterval: number = 5000; // 5 seconds between launches

    constructor(config?: Partial<BrowserConfig>) {
        this.config = {
            headless: process.env.HEADLESS !== 'false',
            executablePath: process.env.BROWSER_PATH || undefined,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            timeout: parseInt(process.env.BROWSER_TIMEOUT || '15000', 10),
            retryAttempts: parseInt(process.env.BROWSER_RETRY_ATTEMPTS || '3', 10),
            retryDelay: parseInt(process.env.BROWSER_RETRY_DELAY || '2000', 10),
            ...config
        };
        this.mutex = new MutexLock(30000, 60000);
    }

    private async launch(): Promise<{
        browser: Browser;
        context: BrowserContext;
    }> {
        return this.mutex.withLock(async () => {
            // Check if we need to wait before launching again
            const timeSinceLastLaunch = Date.now() - this.lastLaunchTime;
            if (timeSinceLastLaunch < this.minLaunchInterval) {
                const waitTime = this.minLaunchInterval - timeSinceLastLaunch;
                logs('debug', `Waiting ${waitTime}ms before browser launch`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            if (!this.browser || !this.context || !this.isConnected) {
                try {
                    const launchOptions: LaunchOptions = {
                        headless: this.config.headless,
                        args: [
                            "--disable-gpu",
                            "--disable-dev-shm-usage",
                            "--disable-setuid-sandbox",
                            "--no-sandbox",
                            "--no-zygote",
                            "--disable-extensions",
                            "--disable-background-timer-throttling",
                            "--disable-backgrounding-occluded-windows",
                            "--disable-renderer-backgrounding",
                            "--disable-web-security",
                            "--disable-features=VizDisplayCompositor",
                            "--disable-ipc-flooding-protection",
                        ],
                    };
                    
                    if (this.config.executablePath) {
                        launchOptions.executablePath = this.config.executablePath;
                    }

                    logs('info', 'Launching browser...');
                    this.browser = await playwright.chromium.launch(launchOptions);
                    this.context = await this.browser.newContext({
                        userAgent: this.config.userAgent,
                        viewport: { width: 1920, height: 1080 },
                        ignoreHTTPSErrors: true,
                    });

                    this.isConnected = true;
                    this.lastLaunchTime = Date.now();

                    // Initialize with a test page
                    const initPage = await this.context.newPage();
                    try {
                        await initPage.goto("https://open.spotify.com/", { 
                            waitUntil: 'domcontentloaded',
                            timeout: 10000 
                        });
                        await initPage.close();
                        logs('info', 'Browser launched successfully');
                    } catch (initError) {
                        logs('warn', 'Initial page load failed, but browser is ready', initError);
                        await initPage.close();
                    }
                } catch (err) {
                    this.browser = undefined;
                    this.context = undefined;
                    this.isConnected = false;
                    logs("error", "Failed to launch browser or context", err);
                    throw new Error(`Browser launch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
            } else {
                // Verify browser is still connected
                try {
                    if (!this.browser.isConnected()) {
                        logs("warn", "Browser is not connected, relaunching...");
                        this.isConnected = false;
                        this.browser = undefined;
                        this.context = undefined;
                        return this.launch();
                    }
                    
                    // Test context
                    this.context.pages();
                } catch {
                    logs("warn", "Context is closed, relaunching...");
                    this.isConnected = false;
                    this.browser = undefined;
                    this.context = undefined;
                    return this.launch();
                }
            }
            
            return { browser: this.browser, context: this.context };
        });
    }

    public async getToken(
        cookies?: Cookie[],
        requestContext?: RequestContext
    ): Promise<SpotifyToken> {
        const requestId = requestContext?.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                logs('info', `Token fetch attempt ${attempt}/${this.config.retryAttempts}`, { requestId });
                return await this.attemptTokenFetch(cookies, requestId);
            } catch (error) {
                const isLastAttempt = attempt === this.config.retryAttempts;
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                
                logs('warn', `Token fetch attempt ${attempt} failed`, { 
                    error: errorMessage, 
                    requestId, 
                    isLastAttempt 
                });

                if (isLastAttempt) {
                    throw error;
                }

                // Wait before retry
                const delay = this.config.retryDelay * attempt;
                logs('debug', `Waiting ${delay}ms before retry`, { requestId });
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw new Error('All token fetch attempts failed');
    }

    private async attemptTokenFetch(cookies?: Cookie[], requestId?: string): Promise<SpotifyToken> {
        const { context } = await this.launch();

        return new Promise<SpotifyToken>((resolve, reject) => {
            (async () => {
                let page: Page | undefined;
                let timeout: NodeJS.Timeout | undefined;

                try {
                    page = await context.newPage();
                    
                    // Set up request interception for performance
                    await this.setupRequestInterception(page);

                    // Clear existing cookies
                    await context.clearCookies();

                    // Set cookies if provided
                    if (cookies && cookies.length > 0) {
                        await this.setCookies(context, cookies, requestId);
                    }

                    // Set up response handler
                    const responseHandler = this.setupResponseHandler(page, resolve, reject, requestId, cookies);
                    page.on("response", responseHandler);

                    // Set up timeout
                    timeout = setTimeout(() => {
                        if (!(page as any).responseReceived) {
                            logs("error", "Token fetch timeout", { requestId, timeout: this.config.timeout });
                            this.cleanupPage(page);
                            reject(new Error(`Token fetch exceeded deadline of ${this.config.timeout}ms`));
                        }
                    }, this.config.timeout);

                    // Navigate to Spotify
                    await page.goto("https://open.spotify.com/", {
                        waitUntil: 'domcontentloaded',
                        timeout: this.config.timeout
                    });

                } catch (error) {
                    if (timeout) {
                        clearTimeout(timeout);
                    }
                    this.cleanupPage(page);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    logs("error", `Token fetch navigation failed`, { error: errorMessage, requestId });
                    reject(new Error(`Navigation failed: ${errorMessage}`));
                }
            })();
        });
    }

    private async setupRequestInterception(page: Page): Promise<void> {
        await page.route("**/*", (route) => {
            const url = route.request().url();
            const type = route.request().resourceType();

            const blockedTypes = new Set([
                "image",
                "stylesheet",
                "font",
                "media",
                "websocket",
                "other",
            ]);

            const blockedPatterns = [
                "google-analytics",
                "doubleclick.net",
                "googletagmanager.com",
                "https://open.spotifycdn.com/cdn/images/",
                "https://encore.scdn.co/fonts/",
                "facebook.com",
                "twitter.com",
                "instagram.com",
                "tiktok.com",
                "youtube.com",
                "vimeo.com"
            ];

            const isBlockedUrl = (u: string) =>
                blockedPatterns.some((pat) => u.includes(pat));

            if (blockedTypes.has(type) || isBlockedUrl(url)) {
                route.abort();
                return;
            }

            route.continue();
        });
    }

    private async setCookies(context: BrowserContext, cookies: Cookie[], requestId?: string): Promise<void> {
        try {
            const cookieObjects = cookies.map((cookie) => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain || ".spotify.com",
                path: cookie.path || "/",
                httpOnly: cookie.httpOnly || false,
                secure: cookie.secure !== false,
                sameSite: cookie.sameSite || "Lax" as const,
                expires: cookie.expires,
            }));

            await context.addCookies(cookieObjects);
            
            logs("info", "Cookies set for request", {
                requestId,
                cookieCount: cookieObjects.length,
                cookies: cookieObjects.map((c) => ({
                    name: c.name,
                    value: `${c.value.slice(0, 20)}...`,
                    domain: c.domain
                }))
            });
        } catch (error) {
            logs("warn", "Failed to set some cookies", { error, requestId });
            // Don't throw here, continue without cookies
        }
    }

    private setupResponseHandler(
        page: Page, 
        resolve: (value: SpotifyToken) => void, 
        reject: (reason?: any) => void,
        requestId?: string,
        cookies?: Cookie[]
    ) {
        return async (response: Response) => {
            if (!response.url().includes("/api/token")) return;

            // Mark that we received a response to prevent timeout
            (page as any).responseReceived = true;
            
            try {
                if (!response.ok()) {
                    const status = response.status();
                    const statusText = response.statusText();
                    logs("error", "Invalid response from Spotify", { 
                        status, 
                        statusText, 
                        url: response.url(),
                        requestId 
                    });
                    this.cleanupPage(page);
                    return reject(new Error(`Invalid response from Spotify: ${status} ${statusText}`));
                }

                const responseBody = await response.text();
                let json: unknown;
                
                try {
                    json = JSON.parse(responseBody);
                } catch (parseError) {
                    logs("error", "Failed to parse response JSON", { 
                        error: parseError, 
                        responseBody: responseBody.slice(0, 200),
                        requestId 
                    });
                    this.cleanupPage(page);
                    return reject(new Error("Failed to parse response JSON"));
                }

                // Clean up response
                if (json && typeof json === "object" && json !== null && "_notes" in json) {
                    delete (json as Record<string, unknown>)._notes;
                }

                // Validate token structure
                const token = json as SpotifyToken;
                if (!this.validateToken(token)) {
                    logs("error", "Invalid token structure received", { token, requestId });
                    this.cleanupPage(page);
                    return reject(new Error("Invalid token structure received"));
                }

                // Add metadata
                token.timestamp = Date.now();
                token.cached = false;
                token.source = (cookies && cookies.length > 0) ? 'authenticated' : 'anonymous';

                logs("info", "Token fetched successfully", { 
                    requestId, 
                    isAnonymous: token.isAnonymous,
                    expiresIn: Math.round((token.accessTokenExpirationTimestampMs - Date.now()) / 1000 / 60)
                });

                this.cleanupPage(page);
                resolve(token);
            } catch (error) {
                this.cleanupPage(page);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logs("error", `Failed to process token response`, { error: errorMessage, requestId });
                reject(new Error(`Failed to process token response: ${errorMessage}`));
            }
        };
    }

    private validateToken(token: any): token is SpotifyToken {
        return (
            token &&
            typeof token === 'object' &&
            typeof token.accessToken === 'string' &&
            typeof token.accessTokenExpirationTimestampMs === 'number' &&
            typeof token.clientId === 'string' &&
            typeof token.isAnonymous === 'boolean'
        );
    }

    private async cleanupPage(page: Page | undefined): Promise<void> {
        if (page) {
            try {
                await page.close();
            } catch (error) {
                logs('debug', 'Error closing page', error);
            }
        }
    }

    public async close(): Promise<void> {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = undefined;
                this.context = undefined;
                this.isConnected = false;
                logs('info', 'Browser closed successfully');
            }
        } catch (error) {
            logs('warn', 'Error closing browser', error);
        }
    }

    public getStatus() {
        return {
            isConnected: this.isConnected,
            hasBrowser: !!this.browser,
            hasContext: !!this.context,
            lastLaunchTime: this.lastLaunchTime,
            mutexLocked: this.mutex.isLockedNow(),
            mutexPendingCount: this.mutex.getPendingCount(),
            mutexLockDuration: this.mutex.getLockDuration()
        };
    }

    public async healthCheck(): Promise<boolean> {
        try {
            if (!this.browser || !this.isConnected) {
                return false;
            }

            if (!this.browser.isConnected()) {
                this.isConnected = false;
                return false;
            }

            // Test with a simple page
            const { context } = await this.launch();
            const page = await context.newPage();
            await page.goto('about:blank', { timeout: 5000 });
            await page.close();
            
            return true;
        } catch (error) {
            logs('warn', 'Browser health check failed', error);
            this.isConnected = false;
            return false;
        }
    }
}