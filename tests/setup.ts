import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/crypto';

// The test environment (NODE_ENV=test, DATABASE_URL -> *_test, test JWT secret,
// relaxed rate limits) is injected by vitest.config.ts -> test.env.

beforeAll(async () => {
  // Connect to the test database
  await prisma.$connect();

  // Clean up any existing data
  await prisma.auditLog.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.otp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  // Clean up test data
  await prisma.auditLog.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.otp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  await prisma.$disconnect();
});

// Helper to create a test user
export async function createTestUser(overrides: Partial<{
  email: string;
  password: string;
  phone: string | null;
  isActive: boolean;
  is2faEnabled: boolean;
}> = {}) {
  const email = overrides.email || `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides.password || 'TestPassword123!';
  const phone = overrides.phone === undefined ? '+14155552671' : overrides.phone;
  const isActive = overrides.isActive ?? true;
  const is2faEnabled = overrides.is2faEnabled ?? false;

  const passwordHash = await hashPassword(password);

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      phone,
      isActive,
      is2faEnabled,
    },
  });
}

// Helper to create an authenticated request
export function createAuthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}
