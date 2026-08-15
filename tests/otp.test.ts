import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { createTestUser, createAuthHeaders } from './setup';
import { jwtService } from '../src/services/jwt.service';

describe('2FA OTP', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.otp.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  afterEach(async () => {
    await prisma.user.deleteMany();
    await prisma.otp.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  describe('POST /api/auth/2fa/enable', () => {
    it('should initiate 2FA enable and return challenge', async () => {
      const user = await createTestUser({
        email: 'enable2fa@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: false,
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'enable2fa@example.com',
          password: 'SecurePassword123!',
        });

      const accessToken = loginResponse.body.data.accessToken;

      const response = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.challengeId).toBeDefined();
      expect(response.body.message).toContain('OTP sent');
    });

    it('should reject if 2FA already enabled', async () => {
      const user = await createTestUser({
        email: '2faalready@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: true,
      });

      // Login returns a 2FA challenge (no access token) when 2FA is enabled,
      // so mint an access token directly to exercise the authenticated route.
      const accessToken = jwtService.signAccessToken(user.id, user.email, true);

      const response = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject if no phone number', async () => {
      const user = await createTestUser({
        email: 'nophone2fa@example.com',
        password: 'SecurePassword123!',
        phone: null,
        is2faEnabled: false,
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nophone2fa@example.com',
          password: 'SecurePassword123!',
        });

      const accessToken = loginResponse.body.data.accessToken;

      const response = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/auth/2fa/enable')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/2fa/verify (enable_2fa)', () => {
    it('should verify OTP and enable 2FA', async () => {
      const user = await createTestUser({
        email: 'verifyenable@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: false,
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'verifyenable@example.com',
          password: 'SecurePassword123!',
        });

      const accessToken = loginResponse.body.data.accessToken;

      // Initiate 2FA enable
      const enableResponse = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const challengeId = enableResponse.body.challengeId;

      // Get the OTP from the database (since mock SMS logs it)
      const otpRecord = await prisma.otp.findFirst({
        where: { userId: user.id, purpose: 'enable_2fa', used: false },
        orderBy: { createdAt: 'desc' },
      });

      expect(otpRecord).not.toBeNull();

      // We can't easily get the plain OTP from hash, so we'll use a different approach
      // For testing, we'll directly call the service to verify
      // But since we need to test the HTTP endpoint, we'll use the mock OTP that was logged
      // Actually, the mock SMS prints the OTP to console. In tests, we can extract it from the DB by testing verify2FA with the actual code
      // But since OTP is hashed, we need another way. Let's use the fact that we can call the OTP service directly for test setup.

      // Better approach: Use the service to create OTP and capture the code
      const { otpService } = await import('../src/services/otp.service');
      const { challengeId: directChallenge, otpCode } = await otpService.create(user.id, 'enable_2fa');

      const verifyResponse = await request(app)
        .post('/api/auth/2fa/verify')
        .send({
          challengeId: directChallenge,
          code: otpCode,
        })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.message).toContain('enabled');

      // Verify 2FA is now enabled in database
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updatedUser?.is2faEnabled).toBe(true);
    });

    it('should reject invalid OTP', async () => {
      const user = await createTestUser({
        email: 'invalidotp@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: false,
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalidotp@example.com',
          password: 'SecurePassword123!',
        });

      const accessToken = loginResponse.body.data.accessToken;

      const enableResponse = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const challengeId = enableResponse.body.challengeId;

      const response = await request(app)
        .post('/api/auth/2fa/verify')
        .send({
          challengeId,
          code: '000000',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('OTP_INVALID');
    });

    it('should reject reused OTP', async () => {
      const { otpService } = await import('../src/services/otp.service');

      const user = await createTestUser({
        email: 'reusedotp@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: false,
      });

      const { challengeId, otpCode } = await otpService.create(user.id, 'enable_2fa');

      // First verification - should succeed
      await request(app)
        .post('/api/auth/2fa/verify')
        .send({ challengeId, code: otpCode })
        .expect(200);

      // Second verification with same OTP - should fail
      const response = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ challengeId, code: otpCode })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('OTP_ALREADY_USED');
    });

    it('should increment attempts on failed verification', async () => {
      const { otpService } = await import('../src/services/otp.service');

      const user = await createTestUser({
        email: 'attempts@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: false,
      });

      const { challengeId } = await otpService.create(user.id, 'enable_2fa');

      // Make 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/auth/2fa/verify')
          .send({ challengeId, code: '111111' })
          .expect(400);
      }

      // Check attempts in database
      const otpRecord = await prisma.otp.findFirst({
        where: { userId: user.id, purpose: 'enable_2fa' },
        orderBy: { createdAt: 'desc' },
      });

      expect(otpRecord?.attempts).toBe(3);
    });

    it('should reject after max attempts exceeded', async () => {
      const { otpService } = await import('../src/services/otp.service');

      const user = await createTestUser({
        email: 'maxattempts@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: false,
      });

      const { challengeId } = await otpService.create(user.id, 'enable_2fa');

      // Make 5 failed attempts (max is 5)
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/2fa/verify')
          .send({ challengeId, code: '222222' })
          .expect(400);
      }

      // 6th attempt should fail with attempts exceeded
      const response = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ challengeId, code: '222222' })
        .expect(400);

      expect(response.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    });
  });

  describe('Login with 2FA', () => {
    it('should complete login with valid OTP after 2FA enabled', async () => {
      const { otpService } = await import('../src/services/otp.service');

      const user = await createTestUser({
        email: 'login2fa@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: true,
      });

      // First login attempt - returns challenge
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login2fa@example.com',
          password: 'SecurePassword123!',
        })
        .expect(200);

      expect(loginResponse.body.requires2FA).toBe(true);
      const challengeId = loginResponse.body.challengeId;

      // Get the OTP that was created
      const otpRecord = await prisma.otp.findFirst({
        where: { userId: user.id, purpose: 'login_2fa', used: false },
        orderBy: { createdAt: 'desc' },
      });

      // Verify using the otpService to get the code
      const { challengeId: newChallenge, otpCode } = await otpService.create(user.id, 'login_2fa');

      // Verify OTP
      const verifyResponse = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ challengeId: newChallenge, code: otpCode })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);
      expect(verifyResponse.body.requires2FA).toBe(false);
      expect(verifyResponse.body.data.accessToken).toBeDefined();
      expect(verifyResponse.body.data.refreshToken).toBeDefined();
    });

    it('should reject login with invalid OTP', async () => {
      const user = await createTestUser({
        email: 'login2fafail@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: true,
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login2fafail@example.com',
          password: 'SecurePassword123!',
        })
        .expect(200);

      const challengeId = loginResponse.body.challengeId;

      const response = await request(app)
        .post('/api/auth/2fa/verify')
        .send({ challengeId, code: '000000' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('OTP_INVALID');
    });
  });
});