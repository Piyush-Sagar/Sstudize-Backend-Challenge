import { z } from 'zod';

// ============================================
// Shared Validators
// ============================================

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email format')
  .max(254);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format (e.g., +14155552671)')
  .optional()
  .nullable();

const otpSchema = z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be numeric');

const refreshTokenSchema = z.string().min(1, 'Refresh token is required');

const resetTokenSchema = z.string().min(1, 'Reset token is required');

const challengeIdSchema = z.string().min(1, 'Challenge ID is required');

// ============================================
// Request Schemas
// ============================================

export const registerSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema,
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
  }),
});

export const enable2FASchema = z.object({
  body: z.object({}).optional(), // No input needed, uses authenticated user
});

export const verify2FASchema = z.object({
  body: z.object({
    challengeId: challengeIdSchema,
    code: otpSchema,
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: refreshTokenSchema,
  }),
});

export const logoutSchema = z.object({
  body: z.object({
    refreshToken: refreshTokenSchema,
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: resetTokenSchema,
    newPassword: passwordSchema,
  }),
});

// ============================================
// Type Exports
// ============================================

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type Verify2FAInput = z.infer<typeof verify2FASchema>['body'];
export type RefreshInput = z.infer<typeof refreshSchema>['body'];
export type LogoutInput = z.infer<typeof logoutSchema>['body'];
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];