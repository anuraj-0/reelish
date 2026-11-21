import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Full Chromium in headless mode (no separate headless-shell download needed).
    channel: "chromium",
    trace: "off", // keep disk use low; enable with --trace on when debugging
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
