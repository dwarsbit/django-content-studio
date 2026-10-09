import { defineConfig } from "@playwright/test";

const port = 8090;

/**
 * End-to-end tests against the demo project (demo/), served with the built
 * frontend bundle — the same static files users get from PyPI. The webServer
 * script builds the bundle if it is missing, then boots Django.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  webServer: {
    command: "bash e2e/serve.sh",
    url: `http://127.0.0.1:${port}/admin/api/info`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
