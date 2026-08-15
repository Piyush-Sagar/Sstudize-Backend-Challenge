import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Evaluator credentials (documented in SUBMISSION.md)
  const evaluatorEmail = 'evaluator@example.com';
  const evaluatorPassword = 'Evaluator123!';
  const evaluatorPhone = '+14155552671';

  // Check if evaluator user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: evaluatorEmail },
  });

  if (existingUser) {
    console.log('✅ Evaluator user already exists, skipping seed');
    return;
  }

  // Hash password with Argon2
  const passwordHash = await hashPassword(evaluatorPassword);

  // Create evaluator user
  const user = await prisma.user.create({
    data: {
      email: evaluatorEmail,
      passwordHash,
      phone: evaluatorPhone,
      isActive: true,
      is2faEnabled: false,
    },
  });

  console.log('✅ Created evaluator user:', {
    id: user.id,
    email: user.email,
    phone: user.phone,
    is2faEnabled: user.is2faEnabled,
  });

  console.log('🌱 Seeding complete!');
  console.log('');
  console.log('📋 Evaluator Credentials:');
  console.log('   Email:    evaluator@example.com');
  console.log('   Password: Evaluator123!');
  console.log('   Phone:    +14155552671');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });