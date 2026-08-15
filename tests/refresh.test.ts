import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { createTestUser } from './setup';
import { refreshTokenService } from '../src/services/refresh-token.service';
import { jwtService } from '../src/services/jwt.service';

describe('Token Refresh', () => {
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

  describe('POST /api/auth/token/refresh', () => {
    it('should refresh tokens successfully with valid refresh token', async () => {
      const user = await createTestUser({
        email: 'refresh@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'refresh@example.com',
          password: 'SecurePassword123!',
        });

      const originalRefreshToken = loginResponse.body.data.refreshToken;
      const originalAccessToken = loginResponse.body.data.accessToken;

      // Wait until the next second so JWT iat differs (access token uses second-granularity timestamps)
      const nowSec = Math.floor(Date.now() / 1000);
      while (Math.floor(Date.now() / 1000) === nowSec) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const response = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.accessToken).not.toBe(originalAccessToken);
      expect(response.body.data.refreshToken).not.toBe(originalRefreshToken);
    });

    it('should rotate refresh token (old one revoked)', async () => {
      const user = await createTestUser({
        email: 'rotate@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'rotate@example.com',
          password: 'SecurePassword123!',
        });

      const originalRefreshToken = loginResponse.body.data.refreshToken;

      // First refresh
      await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(200);

      // Try to use old refresh token again - should fail
      const response = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken: originalRefreshToken })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('REFRESH_TOKEN_REVOKED');
    });

    it('should reject revoked refresh token', async () => {
      const user = await createTestUser({
        email: 'revoked@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'revoked@example.com',
          password: 'SecurePassword123!',
        });

      const refreshToken = loginResponse.body.data.refreshToken;

      // Logout (revokes token)
      await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken })
        .expect(200);

      // Try to use revoked token
      const response = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('REFRESH_TOKEN_REVOKED');
    });

    it('should reject expired refresh token', async () => {
      const user = await createTestUser({
        email: 'expired@example.com',
        password: 'SecurePassword123!',
      });

      // Create a refresh token with past expiry
      const tokenHash = await refreshTokenService.create(user.id);

      // Manually expire it in the database
      const tokenRecord = await prisma.refreshToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (tokenRecord) {
        await prisma.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
      }

      const response = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken: tokenHash })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('REFRESH_TOKEN_EXPIRED');
    });

    it('should reject refresh token for inactive user', async () => {
      const user = await createTestUser({
        email: 'inactiverefresh@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'inactiverefresh@example.com',
          password: 'SecurePassword123!',
        });

      const refreshToken = loginResponse.body.data.refreshToken;

      // Deactivate user
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });

      const response = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_INACTIVE');
    });

    it('should reject invalid refresh token format', async () => {
      const response = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken: 'not-a-valid-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/token/refresh')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should revoke refresh token on logout', async () => {
      const user = await createTestUser({
        email: 'logout@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'logout@example.com',
          password: 'SecurePassword123!',
        });

      const refreshToken = loginResponse.body.data.refreshToken;

      const response = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logged out');

      // Verify token is revoked
      const tokenRecord = await prisma.refreshToken.findFirst({
        where: { userId: user.id },
      });

      expect(tokenRecord?.revoked).toBe(true);
    });

    it('should prevent using revoked token after logout', async () => {
      const user = await createTestUser({
        email: 'logoutreuse@example.com',
        password: 'SecurePassword123!',
      });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'logoutreuse@example.com',
          password: 'SecurePassword123!',
        });

      const refreshToken = loginResponse.body.data.refreshToken;

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken })
        .expect(200);

      // Try to refresh with logged out token
      const response = await request(app)
        .post('/api/auth/token/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.error.code).toBe('REFRESH_TOKEN_REVOKED');
    });
  });
});