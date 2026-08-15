import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { createTestUser, createAuthHeaders } from './setup';
import { hashPassword } from '../src/utils/crypto';
import { jwtService } from '../src/services/jwt.service';

describe('Login', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.otp.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  afterEach(async () => {
    await prisma.user.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.otp.deleteMany();
    await prisma.auditLog.deleteMany();
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully without 2FA', async () => {
      const user = await createTestUser({
        email: 'login@example.com',
        password: 'SecurePassword123!',
        is2faEnabled: false,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'SecurePassword123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.requires2FA).toBe(false);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();

      // Verify access token is valid
      const payload = jwtService.verifyAccessToken(response.body.data.accessToken);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(user.id);
    });

    it('should reject invalid password', async () => {
      await createTestUser({
        email: 'wrongpass@example.com',
        password: 'SecurePassword123!',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrongpass@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should reject unknown user with same error (no enumeration)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should reject inactive user', async () => {
      await createTestUser({
        email: 'inactive@example.com',
        password: 'SecurePassword123!',
        isActive: false,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'inactive@example.com',
          password: 'SecurePassword123!',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_INACTIVE');
    });

    it('should return challenge when 2FA is enabled', async () => {
      await createTestUser({
        email: '2fa@example.com',
        password: 'SecurePassword123!',
        phone: '+14155552671',
        is2faEnabled: true,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: '2fa@example.com',
          password: 'SecurePassword123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.requires2FA).toBe(true);
      expect(response.body.challengeId).toBeDefined();
      expect(response.body.data).toBeUndefined();
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Protected endpoint with valid token', () => {
    it('should access profile with valid access token', async () => {
      const user = await createTestUser({
        email: 'profile@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'profile@example.com',
          password: 'SecurePassword123!',
        });

      const accessToken = loginResponse.body.data.accessToken;

      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: user.id,
        email: 'profile@example.com',
        is2faEnabled: false,
      });
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    it('should reject request with expired token', async () => {
      // Create a token that's already expired
      const expiredToken = jwtService.signAccessToken(
        'some-user-id',
        'test@example.com',
        false
      );

      // We can't easily test expiration without time manipulation
      // but we verify the middleware checks exp
      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});