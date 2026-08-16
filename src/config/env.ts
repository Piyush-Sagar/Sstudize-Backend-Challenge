import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_EXPIRY: z.string().default('10m'),
  JWT_REFRESH_TOKEN_EXPIRY: z.string().default('7d'),

  ARGON2_MEMORY_COST: z.coerce.number().default(19456),
  ARGON2_TIME_COST: z.coerce.number().default(2),
  ARGON2_PARALLELISM: z.coerce.number().default(1),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().default(10),

  OTP_CODE_LENGTH: z.coerce.number().default(6),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),

  RESET_TOKEN_EXPIRY_HOURS: z.coerce.number().default(1),
  RESET_TOKEN_BYTES: z.coerce.number().default(32),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  MOCK_SMS_ENABLED: z.coerce.boolean().default(true),
  MOCK_EMAIL_ENABLED: z.coerce.boolean().default(true),

  // SMS Provider Configuration
  SMS_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
}).refine((data) => {
  if (data.SMS_PROVIDER === 'twilio') {
    return data.TWILIO_ACCOUNT_SID && data.TWILIO_AUTH_TOKEN && data.TWILIO_VERIFY_SERVICE_SID;
  }
  return true;
}, {
  message: 'Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID) are required when SMS_PROVIDER=twilio',
  path: ['SMS_PROVIDER'],
});

let env: z.infer<typeof envSchema>;

export function loadEnv(): z.infer<typeof envSchema> {
  if (process.env.NODE_ENV === 'test') {
    // Override for test environment
    process.env.RATE_LIMIT_AUTH_MAX_REQUESTS = '1000';
    process.env.MOCK_SMS_ENABLED = 'true';
    process.env.MOCK_EMAIL_ENABLED = 'true';
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('[CONFIG] Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  env = result.data;
  return env;
}

export function getEnv(): z.infer<typeof envSchema> {
  if (!env) {
    return loadEnv();
  }
  return env;
}

// Export parsed env for easy access
export const config = getEnv();