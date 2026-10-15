import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Locally reuse the installed Chrome instead of downloading a browser build
    ...(isCI ? {} : { channel: 'chrome' }),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'pnpm run build && pnpm run serve',
    url: `http://localhost:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
