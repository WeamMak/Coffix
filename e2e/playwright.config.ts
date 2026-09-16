import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.ts', workers: 1, fullyParallel: false, retries: 0,
  timeout: 120_000, expect: { timeout: 15_000 },
  outputDir: process.env.COFFIX_E2E_OUTPUT ?? '../.local/e2e-results',
  reporter: [['list'], ['json', { outputFile: process.env.COFFIX_E2E_REPORT }]],
  use: {
    baseURL: process.env.COFFIX_E2E_ADMIN_URL ?? 'http://localhost:5320',
    trace: 'off', screenshot: 'off', video: 'off',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
});
