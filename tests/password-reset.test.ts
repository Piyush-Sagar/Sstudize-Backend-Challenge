import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { createTestUser } from './setup';
import { hashPassword } from '../src/utils/crypto';
import { jwtService } from '../src/services/jwt.service';
import { refreshTokenService } from '../src/services/refresh-token.service';

describe('Password Reset', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.otp.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  afterEach(async () => {
    await prisma.user.deleteMany();
    await prisma.passwordReset.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.otp.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return generic success message for existing user', async () => {
      await createTestUser({
        email: 'forgot@example.com',
        password: 'OldPassword123!',
      });

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'forgot@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists');

      // Verify reset token was created
      const resetToken = await prisma.passwordReset.findFirst({
        where: { user: { email: 'forgot@example.com' } },
      });
      expect(resetToken).not.toBeNull();
      expect(resetToken?.used).toBe(false);
    });

    it('should return generic success message for non-existing user (no enumeration)', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists');
    });

    it('should return generic success for inactive user', async () => {
      await createTestUser({
        email: 'inactiveforgot@example.com',
        password: 'Password123!',
        isActive: false,
      });

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'inactiveforgot@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should create reset token with 1 hour expiry', async () => {
      await createTestUser({
        email: 'expiry@example.com',
        password: 'Password123!',
      });

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'expiry@example.com' })
        .expect(200);

      const resetToken = await prisma.passwordReset.findFirst({
        where: { user: { email: 'expiry@example.com' } },
      });

      expect(resetToken).not.toBeNull();
      const expiryDiff = resetToken!.expiresAt.getTime() - Date.now();
      // Should be approximately 1 hour (3600000ms)
      expect(expiryDiff).toBeGreaterThan(3500000);
      expect(expiryDiff).toBeLessThan(3700000);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const user = await createTestUser({
        email: 'reset@example.com',
        password: 'OldPassword123!',
      });

      // Create reset token directly via service
      const { passwordResetService } = await import('../src/services/password-reset.service');
      const resetToken = await passwordResetService.create(user.id);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('reset successfully');

      // Verify old password no longer works
      const loginOld = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'reset@example.com',
          password: 'OldPassword123!',
        });

      expect(loginOld.status).toBe(401);

      // Verify new password works
      const loginNew = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'reset@example.com',
          password: 'NewPassword123!',
        })
        .expect(200);

      expect(loginNew.body.success).toBe(true);
    });

    it('should revoke all refresh tokens on password reset', async () => {
      const user = await createTestUser({
        email: 'revokesessions@example.com',
        password: 'OldPassword123!',
      });

      // Login to create refresh tokens
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'revokesessions@example.com',
          password: 'OldPassword123!',
        });

      const refreshToken = loginResponse.body.data.refreshToken;

      // Create another session (simulate multiple devices)
      const loginResponse2 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'revokesessions@example.com',
          password: 'OldPassword123!',
        });

      const refreshToken2 = loginResponse2.body.data.refreshToken;

      // Create reset token and reset password
      const { passwordResetService } = await import('../src/services/password-reset.service');
      const resetToken = await passwordResetService.create(user.id);

      await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      // Both refresh tokens should now be revoked
      const response1 = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response1.body.error.code).toBe('REFRESH_TOKEN_REVOKED');

      const response2 = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken: refreshToken2 })
        .expect(401);

      expect(response2.body.error.code).toBe('REFRESH_TOKEN_REVOKED');
    });

    it('should reject reused reset token', async () => {
      const user = await createTestUser({
        email: 'reusereset@example.com',
        password: 'OldPassword123!',
      });

      const { passwordResetService } = await import('../src/services/password-reset.service');
      const resetToken = await passwordResetService.create(user.id);

      // First use - should succeed
      await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      // Second use - should fail
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'AnotherPassword123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RESET_TOKEN_USED');
    });

    it('should reject expired reset token', async () => {
      const user = await createTestUser({
        email: 'expiredreset@example.com',
        password: 'OldPassword123!',
      });

      // Create expired reset token manually
      const { generateResetToken, hashToken } = await import('../src/utils/crypto');
      const resetToken = generateResetToken();
      const tokenHash = hashToken(resetToken);

      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      });

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPassword123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RESET_TOKEN_EXPIRED');
    });

    it('should reject invalid reset token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid-token',
          newPassword: 'NewPassword123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RESET_TOKEN_INVALID');
    });

    it('should validate new password strength', async () => {
      const user = await createTestUser({
        email: 'weakreset@example.com',
        password: 'OldPassword123!',
      });

      const { passwordResetService } = await import('../src/services/password-reset.service');
      const resetToken = await passwordResetService.create(user.id);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'weak',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});