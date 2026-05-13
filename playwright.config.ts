import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:3020',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node --import tsx tests/e2e/web-server.ts',
    env: {
      NEXT_PUBLIC_BASE_URL: 'http://127.0.0.1:3020',
    },
    url: 'http://127.0.0.1:3020',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
