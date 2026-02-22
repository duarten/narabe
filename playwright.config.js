import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3004',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node server/index.js',
      port: 3002,
      reuseExistingServer: false,
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key',
        DATA_DIR: 'data-test',
        PORT: '3002',
      },
    },
    {
      command: 'npx vite',
      port: 3004,
      reuseExistingServer: false,
      env: {
        VITE_PORT: '3004',
        API_PORT: '3002',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
