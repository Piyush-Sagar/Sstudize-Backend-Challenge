import rateLimit from 'express-rate-limit';
import { config } from '../config/env';
import { RateLimitError } from '../utils/errors';

const createRateLimiter = (
  windowMs: number,
  max: number,
  message: string,
  keyPrefix: string
) => {
  return rateLimit({
    windowMs,
    max: config.NODE_ENV === 'test' ? 10000 : max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message,
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${keyPrefix}:${req.ip}`,
    handler: (_req, _res, _next, options) => {
      throw new RateLimitError(options.message.error.message);
    },
    skip: (req) => config.NODE_ENV === 'test' && req.path === '/health',
  });
};

// General API rate limiter
export const generalRateLimiter = createRateLimiter(
  config.RATE_LIMIT_WINDOW_MS,
  config.RATE_LIMIT_MAX_REQUESTS,
  'Too many requests, please try again later',
  'api'
);

// Stricter rate limiter for authentication endpoints
export const authRateLimiter = createRateLimiter(
  config.RATE_LIMIT_WINDOW_MS,
  config.RATE_LIMIT_AUTH_MAX_REQUESTS,
  'Too many authentication attempts, please try again later',
  'auth'
);

// Specific limiters for sensitive endpoints
export const loginRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  config.RATE_LIMIT_AUTH_MAX_REQUESTS,
  'Too many login attempts, please try again later',
  'auth:login'
);

export const registerRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  config.RATE_LIMIT_AUTH_MAX_REQUESTS,
  'Too many registration attempts, please try again later',
  'auth:register'
);

export const otpRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  config.RATE_LIMIT_AUTH_MAX_REQUESTS,
  'Too many OTP requests, please try again later',
  'auth:otp'
);

export const passwordResetRateLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  3, // Very strict for password reset
  'Too many password reset requests, please try again later',
  'auth:password-reset'
);

export const refreshRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  20,
  'Too many token refresh attempts',
  'auth:refresh'
);