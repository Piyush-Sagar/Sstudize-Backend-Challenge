import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/database';
import { createTestUser } from './setup';

describe('Registration', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    await prisma.user.deleteMany();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'SecurePassword123!',
          phone: '+14155552671',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        email: 'newuser@example.com',
        phone: '+14155552671',
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it('should normalize email (lowercase and trim)', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: '  NewUser@Example.COM  ',
          password: 'SecurePassword123!',
          phone: '+14155552671',
        })
        .expect(201);

      const user = await prisma.user.findUnique({
        where: { email: 'newuser@example.com' },
      });

      expect(user).not.toBeNull();
      expect(user?.email).toBe('newuser@example.com');
    });

    it('should reject duplicate email', async () => {
      await createTestUser({ email: 'duplicate@example.com' });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'SecurePassword123!',
          phone: '+14155552671',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'SecurePassword123!',
          phone: '+14155552671',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          phone: '+14155552671',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid phone format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          phone: '1234567890',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept registration without phone', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'nophone@example.com',
          password: 'SecurePassword123!',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.phone).toBe('');
    });

    it('should hash password with Argon2', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'hashcheck@example.com',
          password: 'SecurePassword123!',
          phone: '+14155552671',
        })
        .expect(201);

      const user = await prisma.user.findUnique({
        where: { email: 'hashcheck@example.com' },
      });

      expect(user?.passwordHash).toBeDefined();
      expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user?.passwordHash).not.toBe('SecurePassword123!');
    });
  });
});