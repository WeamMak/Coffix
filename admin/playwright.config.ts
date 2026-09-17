import { defineConfig } from '@playwright/test';

const port = Number(process.env.COFFIX_ADMIN_TEST_PORT ?? 5173);

export default defineConfig({
  testDir: './tests',
  testMatch: ['browser/**/*.spec.ts', 'e2e/**/*.spec.ts'],
  // Image flows own their disposable servers/data via test:images.
  testIgnore: 'e2e/images.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
    // Auth traces would contain access tokens and phone numbers.
    trace: 'off',
  },
  webServer: {
    command: `corepack pnpm dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
