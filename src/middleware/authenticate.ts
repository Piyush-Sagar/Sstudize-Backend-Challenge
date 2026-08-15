import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { AuthenticationError, TokenExpiredError, TokenInvalidError, UserInactiveError } from '../utils/errors';
import { config } from '../config/env';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    is2faEnabled: boolean;
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    let payload: { sub: string; iat: number; exp: number };

    try {
      payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as {
        sub: string;
        iat: number;
        exp: number;
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredError('Access token has expired');
      }
      throw new TokenInvalidError('Invalid access token');
    }

    // Fetch user to verify they still exist and are active
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true, is2faEnabled: true },
    });

    if (!user) {
      throw new TokenInvalidError('User no longer exists');
    }

    if (!user.isActive) {
      throw new UserInactiveError('Account is inactive');
    }

    req.user = {
      id: user.id,
      email: user.email,
      is2faEnabled: user.is2faEnabled,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    let payload: { sub: string; iat: number; exp: number };

    try {
      payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as {
        sub: string;
        iat: number;
        exp: number;
      };
    } catch {
      return next(); // Invalid token, proceed without auth
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true, is2faEnabled: true },
    });

    if (user && user.isActive) {
      req.user = {
        id: user.id,
        email: user.email,
        is2faEnabled: user.is2faEnabled,
      };
    }

    next();
  } catch {
    next(); // Any error, proceed without auth
  }
};