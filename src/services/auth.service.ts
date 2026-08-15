import { prisma } from '../config/database';
import { hashPassword, verifyPassword, normalizeEmail, hashToken } from '../utils/crypto';
import { config } from '../config/env';
import {
  ConflictError,
  AuthenticationError,
  UserInactiveError,
  ValidationError,
  TwoFARequiredError,
} from '../utils/errors';
import { jwtService } from './jwt.service';
import { refreshTokenService } from './refresh-token.service';
import { otpService, OTPPurpose } from './otp.service';
import { smsService } from './sms.service';
import { passwordResetService } from './password-reset.service';
import { auditService, AuditEvent } from './audit.service';

export const authService = {
  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    phone: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ id: string; email: string; phone: string }> {
    const normalizedEmail = normalizeEmail(email);

    // Check for existing user
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      await auditService.log({
        event: 'LOGIN_FAILED',
        metadata: { reason: 'duplicate_email', email: normalizedEmail },
        ip,
        userAgent,
      });
      throw new ConflictError('Email already registered');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        phone,
        isActive: true,
        is2faEnabled: false,
      },
    });

    await auditService.log({
      userId: user.id,
      event: 'REGISTER_SUCCESS',
      ip,
      userAgent,
    });

    return { id: user.id, email: user.email, phone: user.phone || '' };
  },

  /**
   * Login with email and password
   * Returns tokens if 2FA disabled, or challenge if 2FA enabled
   */
  async login(
    email: string,
    password: string,
    ip?: string,
    userAgent?: string
  ): Promise<{
    accessToken?: string;
    refreshToken?: string;
    requires2FA: boolean;
    challengeId?: string;
  }> {
    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Generic error to prevent user enumeration
    const invalidCredentials = (): never => {
      auditService.log({
        event: 'LOGIN_FAILED',
        metadata: { reason: 'invalid_credentials', email: normalizedEmail },
        ip,
        userAgent,
      });
      throw new AuthenticationError('Invalid credentials');
    };

    if (!user) {
      // Still hash a dummy password to prevent timing attacks
      await verifyPassword(password, '$argon2id$v=19$m=19456,t=2,p=1$dummy$salt');
      invalidCredentials();
    }

    const currentUser = user!;

    if (!currentUser.isActive) {
      await auditService.log({
        userId: currentUser.id,
        event: 'LOGIN_FAILED',
        metadata: { reason: 'account_inactive' },
        ip,
        userAgent,
      });
      throw new UserInactiveError('Account is inactive');
    }

    const isValid = await verifyPassword(password, currentUser.passwordHash);
    if (!isValid) {
      invalidCredentials();
    }

    // 2FA check
    if (currentUser.is2faEnabled) {
      // Generate login OTP
      const { challengeId, otpCode } = await otpService.create(currentUser.id, 'login_2fa');

      // Send OTP via SMS
      if (currentUser.phone) {
        await smsService.sendOTP(currentUser.phone, otpCode, 'login_2fa');
        await auditService.log({
          userId: currentUser.id,
          event: 'OTP_SENT',
          metadata: { purpose: 'login_2fa' },
          ip,
          userAgent,
        });
      } else {
        await auditService.log({
          userId: currentUser.id,
          event: 'OTP_FAILED',
          metadata: { reason: 'no_phone', purpose: 'login_2fa' },
          ip,
          userAgent,
        });
        throw new ValidationError('Phone number required for 2FA');
      }

      await auditService.log({
        userId: currentUser.id,
        event: 'LOGIN_SUCCESS',
        metadata: { requires2FA: true },
        ip,
        userAgent,
      });

      return { requires2FA: true, challengeId };
    }

    // No 2FA - issue tokens directly
    const accessToken = jwtService.signAccessToken(
      currentUser.id,
      currentUser.email,
      currentUser.is2faEnabled
    );
    const refreshToken = await refreshTokenService.create(currentUser.id);

    await auditService.log({
      userId: currentUser.id,
      event: 'LOGIN_SUCCESS',
      metadata: { requires2FA: false },
      ip,
      userAgent,
    });

    return { accessToken, refreshToken, requires2FA: false };
  },

  /**
   * Verify 2FA OTP (for both login and enable_2fa)
   */
  async verify2FA(
    challengeId: string,
    code: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string } | { success: true }> {
    const result = await otpService.verify(challengeId, code);
    const { userId, purpose } = result;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, is2faEnabled: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UserInactiveError('Account is inactive');
    }

    await auditService.log({
      userId,
      event: 'OTP_VERIFIED',
      metadata: { purpose },
      ip,
      userAgent,
    });

    if (purpose === 'enable_2fa') {
      // Enable 2FA for the user
      await prisma.user.update({
        where: { id: userId },
        data: { is2faEnabled: true },
      });

      await auditService.log({
        userId,
        event: 'TWO_FA_ENABLED',
        ip,
        userAgent,
      });

      return { success: true };
    }

    // Login 2FA - issue tokens
    const accessToken = jwtService.signAccessToken(user.id, user.email, user.is2faEnabled);
    const refreshToken = await refreshTokenService.create(userId);

    await auditService.log({
      userId,
      event: 'LOGIN_SUCCESS',
      metadata: { requires2FA: false, method: '2fa' },
      ip,
      userAgent,
    });

    return { accessToken, refreshToken };
  },

  /**
   * Initiate 2FA enable flow
   */
  async enable2FA(
    userId: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ challengeId: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, is2faEnabled: true },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (user.is2faEnabled) {
      throw new ValidationError('2FA is already enabled');
    }

    if (!user.phone) {
      throw new ValidationError('Phone number required to enable 2FA');
    }

    const { challengeId, otpCode } = await otpService.create(userId, 'enable_2fa');

    await smsService.sendOTP(user.phone, otpCode, 'enable_2fa');

    await auditService.log({
      userId,
      event: 'OTP_SENT',
      metadata: { purpose: 'enable_2fa' },
      ip,
      userAgent,
    });

    return { challengeId };
  },

  /**
   * Refresh access token using refresh token
   */
  async refresh(
    userId: string,
    refreshToken: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokens = await refreshTokenService.validateAndRotate(userId, refreshToken);

    await auditService.log({
      userId,
      event: 'TOKEN_REFRESHED',
      ip,
      userAgent,
    });

    return tokens;
  },

  /**
   * Logout - revoke refresh token
   */
  async logout(
    refreshToken: string,
    ip?: string,
    userAgent?: string
  ): Promise<void> {
    const tokenHash = hashToken(refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });

    if (storedToken) {
      await refreshTokenService.revoke(refreshToken);

      await auditService.log({
        userId: storedToken.userId,
        event: 'LOGOUT',
        ip,
        userAgent,
      });
    }
  },

  /**
   * Request password reset
   */
  async forgotPassword(
    email: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ message: string }> {
    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Always return generic message to prevent enumeration
    const response = { message: 'If an account exists, password reset instructions have been sent.' };

    if (user && user.isActive) {
      const resetToken = await passwordResetService.create(user.id);

      // Mock email delivery (logs to console)
      const separator = '='.repeat(60);
      console.log('\n' + separator);
      console.log('[MOCK EMAIL] DEVELOPMENT ONLY - PASSWORD RESET');
      console.log(separator);
      console.log(`Timestamp:  ${new Date().toISOString()}`);
      console.log(`Recipient:  ${user.email}`);
      console.log(`Reset Token: ${resetToken}`);
      console.log('');
      console.log('⚠️  THIS IS A MOCK EMAIL SERVICE FOR DEVELOPMENT ONLY');
      console.log('⚠️  In production, this would send an actual email');
      console.log(separator + '\n');

      await auditService.log({
        userId: user.id,
        event: 'PASSWORD_RESET_REQUEST',
        ip,
        userAgent,
      });
    } else if (user && !user.isActive) {
      // Still log but don't send email for inactive accounts
      await auditService.log({
        userId: user.id,
        event: 'PASSWORD_RESET_REQUEST',
        metadata: { reason: 'account_inactive' },
        ip,
        userAgent,
      });
    }

    return response;
  },

  /**
   * Reset password with token
   */
  async resetPassword(
    token: string,
    newPassword: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ message: string }> {
    await passwordResetService.reset(token, newPassword);

    // Find user for audit log
    const tokenHash = hashToken(token);
    const resetRecord = await prisma.passwordReset.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });

    if (resetRecord) {
      await auditService.log({
        userId: resetRecord.userId,
        event: 'PASSWORD_RESET_SUCCESS',
        ip,
        userAgent,
      });
    }

    return { message: 'Password has been reset successfully' };
  },

  /**
   * Get user profile (protected endpoint)
   */
  async getProfile(userId: string): Promise<{
    id: string;
    email: string;
    phone: string;
    is2faEnabled: boolean;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, is2faEnabled: true },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone || '',
      is2faEnabled: user.is2faEnabled,
    };
  },
};

// Export normalizeEmail for use in other services
export { normalizeEmail } from '../utils/crypto';