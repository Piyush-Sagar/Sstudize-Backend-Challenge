import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { hash, verify } from 'argon2';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

// ============================================
// Argon2 Password Hashing
// ============================================

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    type: 2, // argon2id
    memoryCost: config.ARGON2_MEMORY_COST,
    timeCost: config.ARGON2_TIME_COST,
    parallelism: config.ARGON2_PARALLELISM,
    hashLength: 32,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await verify(hash, password);
  } catch {
    return false;
  }
}

// ============================================
// Secure Random Token Generation
// ============================================

export function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function generateRefreshToken(): string {
  return generateSecureToken(32);
}

export function generateResetToken(): string {
  return generateSecureToken(config.RESET_TOKEN_BYTES);
}

export function generateOTP(length: number = 6): string {
  const digits = '0123456789';
  let otp = '';
  const randomValues = randomBytes(length);
  for (let i = 0; i < length; i++) {
    otp += digits[randomValues[i] % 10];
  }
  return otp;
}

// ============================================
// Deterministic Hashing for Token Lookup
// ============================================

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashOTP(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// ============================================
// Constant-Time Comparison
// ============================================

export function compareHashes(hash1: string, hash2: string): boolean {
  if (hash1.length !== hash2.length) {
    return false;
  }
  const buf1 = Buffer.from(hash1);
  const buf2 = Buffer.from(hash2);
  return timingSafeEqual(buf1, buf2);
}

// ============================================
// JWT Challenge Token (for 2FA flow)
// ============================================

interface TwoFAChallengePayload {
  userId: string;
  purpose: 'login_2fa' | 'enable_2fa';
  otpId: string;
  iat: number;
  exp: number;
}

export function create2FAChallengeToken(
  userId: string,
  purpose: 'login_2fa' | 'enable_2fa',
  otpId: string
): string {
  const payload: Omit<TwoFAChallengePayload, 'iat' | 'exp'> = { userId, purpose, otpId };
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '10m', algorithm: 'HS256' });
}

export function verify2FAChallengeToken(token: string): TwoFAChallengePayload | null {
  try {
    return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as TwoFAChallengePayload;
  } catch {
    return null;
  }
}

// ============================================
// Email Normalization
// ============================================

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
