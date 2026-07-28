import { defineConfig } from "@playwright/test";

/**
 * Integration test Playwright config.
 *
 * The Vite web server is NOT managed here — the integration runner
 * (run-integration.mjs) starts it separately with VITE_HARNESS_API_URL
 * set.  The user-configured PLAYWRIGHT_BASE_URL env var tells Playwright
 * where to find the already-running dev server.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    screenshot: "on",
  },
  // No webServer — the integration runner manages server lifecycle
});
