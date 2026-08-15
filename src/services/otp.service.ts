import { prisma } from '../config/database';
import { generateOTP, hashOTP, compareHashes, create2FAChallengeToken, verify2FAChallengeToken } from '../utils/crypto';
import { config } from '../config/env';
import {
  OTPExpiredError,
  OTPInvalidError,
  OTPAttemptsExceededError,
  OTPAlreadyUsedError,
} from '../utils/errors';

export type OTPPurpose = 'enable_2fa' | 'login_2fa';

export interface OTPResult {
  challengeId: string;
  otpCode: string; // Only returned in development for mock SMS
}

interface TwoFAChallengePayload {
  userId: string;
  purpose: OTPPurpose;
  otpId: string;
  iat: number;
  exp: number;
}

export const otpService = {
  /**
   * Create a new OTP for a user with the given purpose.
   * Returns the challengeId bound to the exact OTP row and the plain code
   * (the code is only handed to the SMS delivery mechanism).
   */
  async create(userId: string, purpose: OTPPurpose): Promise<OTPResult> {
    const codeLength = config.OTP_CODE_LENGTH;
    const expiryMinutes = config.OTP_EXPIRY_MINUTES;

    const otpCode = generateOTP(codeLength);
    const codeHash = hashOTP(otpCode);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    // Invalidate any existing unused OTPs for this user/purpose
    await prisma.otp.updateMany({
      where: { userId, purpose, used: false },
      data: { used: true },
    });

    // Create new OTP
    const otp = await prisma.otp.create({
      data: {
        userId,
        codeHash,
        purpose,
        expiresAt,
        attempts: 0,
      },
    });

    // Bind the challenge token to this exact OTP row so a stale challenge
    // can never be satisfied by a newer OTP.
    const challengeId = create2FAChallengeToken(userId, purpose, otp.id);

    return { challengeId, otpCode };
  },

  /**
   * Verify an OTP code using a challenge token.
   *
   * Race safety is achieved with atomic conditional updates
   * (`WHERE used = false`): concurrent verifications cannot both consume
   * the same OTP. Failed attempts are persisted (they are not rolled back)
   * so the attempt counter and lockout behave correctly.
   */
  async verify(challengeId: string, providedCode: string): Promise<{ userId: string; purpose: OTPPurpose }> {
    const challenge = verify2FAChallengeToken(challengeId) as TwoFAChallengePayload | null;

    if (!challenge) {
      throw new OTPInvalidError('Invalid or expired challenge');
    }

    const { userId, purpose, otpId } = challenge;

    // The challenge is bound to one specific OTP row.
    const otp = await prisma.otp.findUnique({
      where: { id: otpId },
    });

    if (!otp || otp.userId !== userId || otp.purpose !== purpose) {
      throw new OTPInvalidError('No valid OTP found');
    }

    if (otp.used) {
      throw new OTPAlreadyUsedError('OTP has already been used');
    }

    if (otp.expiresAt < new Date()) {
      throw new OTPExpiredError('OTP has expired');
    }

    if (otp.attempts >= config.OTP_MAX_ATTEMPTS) {
      // Lock the OTP permanently once the attempt budget is exhausted.
      await prisma.otp.updateMany({
        where: { id: otp.id, used: false },
        data: { used: true },
      });
      throw new OTPAttemptsExceededError('Maximum OTP attempts exceeded');
    }

    const providedHash = hashOTP(providedCode);
    const isValid = compareHashes(otp.codeHash, providedHash);

    // Atomically increment the attempt counter (persists even on failure).
    const incremented = await prisma.otp.updateMany({
      where: { id: otp.id, used: false },
      data: { attempts: { increment: 1 } },
    });

    if (incremented.count === 0) {
      throw new OTPAlreadyUsedError('OTP has already been used');
    }

    if (!isValid) {
      throw new OTPInvalidError('Invalid OTP');
    }

    // Atomically consume the OTP. Only one concurrent verifier can win.
    const consumed = await prisma.otp.updateMany({
      where: { id: otp.id, used: false },
      data: { used: true },
    });

    if (consumed.count === 0) {
      throw new OTPAlreadyUsedError('OTP has already been used');
    }

    return { userId, purpose };
  },

  /**
   * Check if user has a valid unused OTP for a purpose
   */
  async hasValidOTP(userId: string, purpose: OTPPurpose): Promise<boolean> {
    const otp = await prisma.otp.findFirst({
      where: {
        userId,
        purpose,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });
    return !!otp;
  },

  /**
   * Clean up expired OTPs
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.otp.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  },
};
