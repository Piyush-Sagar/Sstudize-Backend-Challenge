export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', details?: unknown) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', details?: unknown) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', details?: unknown) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export class TokenExpiredError extends AppError {
  constructor(message: string = 'Token has expired', details?: unknown) {
    super(message, 401, 'TOKEN_EXPIRED', details);
  }
}

export class TokenInvalidError extends AppError {
  constructor(message: string = 'Invalid token', details?: unknown) {
    super(message, 401, 'TOKEN_INVALID', details);
  }
}

export class OTPExpiredError extends AppError {
  constructor(message: string = 'OTP has expired') {
    super(message, 400, 'OTP_EXPIRED');
  }
}

export class OTPInvalidError extends AppError {
  constructor(message: string = 'Invalid OTP') {
    super(message, 400, 'OTP_INVALID');
  }
}

export class OTPAttemptsExceededError extends AppError {
  constructor(message: string = 'Maximum OTP attempts exceeded') {
    super(message, 400, 'OTP_ATTEMPTS_EXCEEDED');
  }
}

export class OTPAlreadyUsedError extends AppError {
  constructor(message: string = 'OTP has already been used') {
    super(message, 400, 'OTP_ALREADY_USED');
  }
}

export class ResetTokenExpiredError extends AppError {
  constructor(message: string = 'Password reset token has expired') {
    super(message, 400, 'RESET_TOKEN_EXPIRED');
  }
}

export class ResetTokenInvalidError extends AppError {
  constructor(message: string = 'Invalid password reset token') {
    super(message, 400, 'RESET_TOKEN_INVALID');
  }
}

export class ResetTokenUsedError extends AppError {
  constructor(message: string = 'Password reset token has already been used') {
    super(message, 400, 'RESET_TOKEN_USED');
  }
}

export class RefreshTokenRevokedError extends AppError {
  constructor(message: string = 'Refresh token has been revoked') {
    super(message, 401, 'REFRESH_TOKEN_REVOKED');
  }
}

export class RefreshTokenExpiredError extends AppError {
  constructor(message: string = 'Refresh token has expired') {
    super(message, 401, 'REFRESH_TOKEN_EXPIRED');
  }
}

export class UserInactiveError extends AppError {
  constructor(message: string = 'Account is inactive') {
    super(message, 403, 'USER_INACTIVE');
  }
}

export class TwoFARequiredError extends AppError {
  constructor(message: string = 'Two-factor authentication required', public readonly challengeId: string) {
    super(message, 200, 'TWO_FA_REQUIRED');
  }
}

export class SMSDeliveryError extends AppError {
  constructor(message: string = 'Unable to send verification code', details?: unknown) {
    super(message, 503, 'SMS_DELIVERY_FAILED', details);
  }
}

// Error code constants for consistent client handling
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_ATTEMPTS_EXCEEDED: 'OTP_ATTEMPTS_EXCEEDED',
  OTP_ALREADY_USED: 'OTP_ALREADY_USED',
  RESET_TOKEN_EXPIRED: 'RESET_TOKEN_EXPIRED',
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',
  RESET_TOKEN_USED: 'RESET_TOKEN_USED',
  REFRESH_TOKEN_REVOKED: 'REFRESH_TOKEN_REVOKED',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  USER_INACTIVE: 'USER_INACTIVE',
  TWO_FA_REQUIRED: 'TWO_FA_REQUIRED',
} as const;