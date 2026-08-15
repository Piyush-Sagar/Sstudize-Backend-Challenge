import { defineConfig } from 'vitest/config';
import path from 'path';
import { testDatabaseUrl } from './tests/test-db';

const testDbUrl = testDatabaseUrl();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Tests wipe shared tables, so files MUST run sequentially (one worker).
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDbUrl,
      JWT_SECRET: 'test-secret-key-for-testing-only-min-32-chars',
      MOCK_SMS_ENABLED: 'true',
      MOCK_EMAIL_ENABLED: 'true',
      RATE_LIMIT_AUTH_MAX_REQUESTS: '10000',
      RATE_LIMIT_MAX_REQUESTS: '10000',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'prisma/',
        'src/server.ts',
        'src/app.ts',
        '**/*.d.ts',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
