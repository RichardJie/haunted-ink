import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      { test: { name: 'server', environment: 'node', include: ['tests/server/**/*.test.ts'], testTimeout: 30000 } },
      { test: { name: 'live', environment: 'node', include: ['tests/live/**/*.live.test.ts'], testTimeout: 240000, hookTimeout: 60000, fileParallelism: false } },
    ],
  },
});
