import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  is2faEnabled: boolean;
  iat: number;
  exp: number;
}

export const jwtService = {
  signAccessToken(
    userId: string,
    email: string,
    is2faEnabled: boolean
  ): string {
    const payload = { sub: userId, email, is2faEnabled };
    return jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_ACCESS_TOKEN_EXPIRY as jwt.SignOptions['expiresIn'],
      algorithm: 'HS256',
    });
  },

  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
    } catch {
      return null;
    }
  },

  decodeToken(token: string): AccessTokenPayload | null {
    try {
      return jwt.decode(token) as AccessTokenPayload;
    } catch {
      return null;
    }
  },
};