import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import {
  registerSchema,
  loginSchema,
  enable2FASchema,
  verify2FASchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.schemas';
import { authenticate } from '../middleware/authenticate';
import {
  authRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  otpRateLimiter,
  passwordResetRateLimiter,
  refreshRateLimiter,
} from '../middleware/rate-limit';

const router = Router();

// Public routes with rate limiting
router.post(
  '/register',
  registerRateLimiter,
  validate(registerSchema),
  authController.register
);

router.post(
  '/login',
  loginRateLimiter,
  validate(loginSchema),
  authController.login
);

// 2FA routes
router.post(
  '/2fa/enable',
  authenticate,
  otpRateLimiter,
  validate(enable2FASchema),
  authController.enable2FA
);

router.post(
  '/2fa/verify',
  otpRateLimiter,
  validate(verify2FASchema),
  authController.verify2FA
);

// Token routes
router.post(
  '/token/refresh',
  refreshRateLimiter,
  validate(refreshSchema),
  authController.refresh
);

router.post(
  '/logout',
  validate(logoutSchema),
  authController.logout
);

// Password reset routes
router.post(
  '/forgot-password',
  passwordResetRateLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword
);

export default router;