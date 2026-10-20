import { defineConfig } from 'vitest/config';

// Two test projects:
//  - unit: pure functions (split math). No database, runs anywhere in milliseconds.
//  - api:  HTTP-level tests with Supertest against a real PostgreSQL test database.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['test/unit/**/*.test.ts'] } },
      {
        test: {
          name: 'api',
          include: ['test/api/**/*.test.ts'],
          globalSetup: ['test/api/globalSetup.ts'],
          // API test files share one database, so run them one after another.
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
