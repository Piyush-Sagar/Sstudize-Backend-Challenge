import 'dotenv/config';

/**
 * Derive the dedicated test database URL from the development DATABASE_URL.
 * e.g. postgresql://user:pass@localhost:5432/sstudize_auth  ->  .../sstudize_auth_test
 */
export function testDatabaseUrl(): string {
  const devUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/sstudize_auth?schema=public';
  return devUrl.replace(/(postgresql:\/\/[^/]+\/)([^?]+)(.*)/, '$1$2_test$3');
}
