import { prisma } from '../config/database';
import { generateRefreshToken, hashToken } from '../utils/crypto';
import { config } from '../config/env';
import { jwtService } from './jwt.service';
import {
  RefreshTokenRevokedError,
  RefreshTokenExpiredError,
  UserInactiveError,
} from '../utils/errors';

export interface RefreshTokenResult {
  refreshToken: string;
  accessToken: string;
}

export const refreshTokenService = {
  /**
   * Create a new refresh token for a user
   */
  async create(userId: string): Promise<string> {
    const refreshToken = generateRefreshToken();
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return refreshToken;
  },

  /**
   * Validate a refresh token and return the user if valid
   * Also performs rotation - revokes old token and creates new one
   */
  async validateAndRotate(userId: string, providedToken: string): Promise<RefreshTokenResult> {
    const tokenHash = hashToken(providedToken);

    // Find the token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new RefreshTokenRevokedError('Refresh token not found');
    }

    // Check if token belongs to the user
    if (storedToken.userId !== userId) {
      throw new RefreshTokenRevokedError('Refresh token does not belong to user');
    }

    // Check if revoked
    if (storedToken.revoked) {
      // Potential reuse detection - log for audit
      await prisma.auditLog.create({
        data: {
          userId,
          event: 'REFRESH_TOKEN_REUSE_DETECTED',
          metadata: { tokenId: storedToken.id },
        },
      });
      throw new RefreshTokenRevokedError('Refresh token has been revoked (possible reuse detected)');
    }

    // Check expiry
    if (storedToken.expiresAt < new Date()) {
      throw new RefreshTokenExpiredError('Refresh token has expired');
    }

    // Check user is active
    if (!storedToken.user.isActive) {
      throw new UserInactiveError('User account is inactive');
    }

    // Revoke the old token (rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    // Create new refresh token
    const newRefreshToken = await this.create(userId);

    // Generate new access token
    const accessToken = jwtService.signAccessToken(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.is2faEnabled
    );

    return { refreshToken: newRefreshToken, accessToken };
  },

  /**
   * Revoke a specific refresh token (logout)
   */
  async revoke(providedToken: string): Promise<void> {
    const tokenHash = hashToken(providedToken);

    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  },

  /**
   * Revoke all refresh tokens for a user (password reset, security event)
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    return result.count;
  },

  /**
   * Clean up expired tokens (optional maintenance)
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  },
};