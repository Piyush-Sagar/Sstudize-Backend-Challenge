import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { testDatabaseUrl } from './test-db';

/**
 * Global Vitest setup (runs once, in the main process, before test workers).
 *
 * It guarantees the dedicated test database exists and is fully migrated so
 * the test suite is deterministic and independent of the developer database.
 * Migration failures are surfaced loudly rather than hidden.
 */
export default async function globalSetup(): Promise<void> {
  // NOTE: Vitest's `test.env` does NOT apply to the globalSetup process,
  // so we always derive the test URL from the development DATABASE_URL here.
  const testUrl = testDatabaseUrl();

  const parsed = new URL(testUrl);
  const dbName = parsed.pathname.slice(1).split('/')[0] || 'sstudize_auth_test';

  // Connect to the maintenance "postgres" database using the same credentials
  // so we can create the test database if it does not exist yet.
  parsed.pathname = '/postgres';
  const maintenanceUrl = parsed.toString();

  const admin = new PrismaClient({ datasources: { db: { url: maintenanceUrl } } });

  try {
    const existing: Array<{ datname: string }> = await admin.$queryRawUnsafe(
      'SELECT datname FROM pg_database WHERE datname = $1',
      dbName
    );

    if (existing.length === 0) {
      // Identifier here is derived from a known URL segment, never from user input.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`[global-setup] Created test database "${dbName}".`);
    }
  } finally {
    await admin.$disconnect();
  }

  // Apply all migrations to the test database.
  console.log(`[global-setup] Applying migrations to "${dbName}"...`);
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'inherit',
  });
  console.log('[global-setup] Migrations applied.');
}
