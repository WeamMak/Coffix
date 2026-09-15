import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'images.spec.ts', workers: 1,
  timeout: 90_000,
  use: { baseURL: 'http://localhost:5299', trace: 'off', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} },
  webServer: [
    { cwd: process.cwd(), command: 'exec env PYTHONPATH=../backend/src ../backend/.venv/bin/python tests/e2e/imageFixture.py', url: 'http://127.0.0.1:8299/api/v1/__image_test_sessions', timeout: 60_000, reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 } },
    { cwd: process.cwd(), command: 'corepack pnpm exec vite --config tests/e2e/images.vite.ts', url: 'http://localhost:5299', reuseExistingServer: false },
  ],
});
