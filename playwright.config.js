import { defineConfig } from '@playwright/test';
import path from 'path';

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
      // A stand-in for the VOICEVOX engine
      command: 'node tests/fixtures/fake-voicevox.js 3008',
      port: 3008,
      reuseExistingServer: false,
    },
    {
      command: 'node server/index.js',
      port: 3002,
      reuseExistingServer: false,
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key',
        CLAUDE_BACKEND: 'api',
        // Absolute, so the server uses the same directory the tests seed
        DATA_DIR: path.join(import.meta.dirname, 'server', 'data-test'),
        PORT: '3002',
        TTS_CACHE_DIR: path.join(
          import.meta.dirname,
          'server',
          'tts-cache-test',
        ),
        VOICEVOX_SPEAKER: '8',
        VOICEVOX_URL: 'http://127.0.0.1:3008',
      },
    },
    {
      // The claude-code backend, with a stand-in for the Claude Code CLI
      command: 'node server/index.js',
      port: 3006,
      reuseExistingServer: false,
      env: {
        ANTHROPIC_API_KEY: 'test-key',
        CLAUDE_BACKEND: 'claude-code',
        CLAUDE_CODE_PATH: path.join(
          import.meta.dirname,
          'tests',
          'fixtures',
          'fake-claude.js',
        ),
        DATA_DIR: path.join(import.meta.dirname, 'server', 'data-test'),
        PORT: '3006',
        // Nothing listens here, for testing without the engine, even if one
        // is running on this machine
        VOICEVOX_URL: 'http://127.0.0.1:3009',
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
