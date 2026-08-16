import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  TokenExpiredError,
  TokenInvalidError,
} from '../utils/errors';
import { config } from '../config/env';

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging (but not sensitive data)
  if (config.NODE_ENV !== 'test') {
    console.error('[ERROR]', {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details,
      },
    };
    res.status(400).json(response);
    return;
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const field = (err.meta?.target as string[])?.join(', ') || 'field';
      const response: ErrorResponse = {
        success: false,
        error: {
          code: 'CONFLICT',
          message: `${field} already exists`,
          details: { field },
        },
      };
      res.status(409).json(response);
      return;
    }
  }

  // Custom app errors
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Unknown errors
  if (config.NODE_ENV === 'production') {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
    res.status(500).json(response);
  } else {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message,
        details: { stack: err.stack },
      },
    };
    res.status(500).json(response);
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  };
  res.status(404).json(response);
}