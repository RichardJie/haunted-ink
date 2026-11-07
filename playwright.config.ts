import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4318', channel: 'chrome', headless: true },
  webServer: {
    command: 'npm run build && HAUNTED_INK_PORT=4318 NODE_ENV=production node server/index.ts',
    url: 'http://127.0.0.1:4318/api/health',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
