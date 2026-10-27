import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3210",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx next dev --port 3210",
    url: "http://localhost:3210",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AGENT_MODE: "rules",
      TICKET_FLAKY: "0",
      ALLOW_RESET: "1",
      NEXO_DB: "./data/e2e.sqlite",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
