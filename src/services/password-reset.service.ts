import { prisma } from '../config/database';
import { generateResetToken, hashToken, compareHashes } from '../utils/crypto';
import { hashPassword } from '../utils/crypto';
import { config } from '../config/env';
import {
  ResetTokenExpiredError,
  ResetTokenInvalidError,
  ResetTokenUsedError,
} from '../utils/errors';

export const passwordResetService = {
  /**
   * Create a password reset token for a user
   * Returns the plain token (for mock email delivery)
   */
  async create(userId: string): Promise<string> {
    const token = generateResetToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.RESET_TOKEN_EXPIRY_HOURS);

    // Invalidate any existing unused reset tokens for this user
    await prisma.passwordReset.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });

    // Create new reset token
    await prisma.passwordReset.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return token;
  },

  /**
   * Verify and consume a password reset token
   * Updates password, marks token used, revokes all refresh tokens
   * All done in a transaction
   */
  async reset(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);

    await prisma.$transaction(async (tx) => {
      // Find the reset token
      const resetToken = await tx.passwordReset.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!resetToken) {
        throw new ResetTokenInvalidError('Invalid password reset token');
      }

      // Check if already used
      if (resetToken.used) {
        throw new ResetTokenUsedError('Password reset token has already been used');
      }

      // Check expiry
      if (resetToken.expiresAt < new Date()) {
        throw new ResetTokenExpiredError('Password reset token has expired');
      }

      // Hash new password
      const passwordHash = await hashPassword(newPassword);

      // Update user password
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      // Mark reset token as used
      await tx.passwordReset.update({
        where: { id: resetToken.id },
        data: { used: true },
      });

      // Revoke all refresh tokens for the user
      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revoked: false },
        data: { revoked: true },
      });
    });
  },

  /**
   * Verify a reset token is valid (without consuming it)
   */
  async verify(token: string): Promise<{ userId: string; email: string } | null> {
    const tokenHash = hashToken(token);

    const resetToken = await prisma.passwordReset.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return null;
    }

    return { userId: resetToken.user.id, email: resetToken.user.email };
  },

  /**
   * Clean up expired reset tokens
   */
  async cleanupExpired(): Promise<number> {
    const result = await prisma.passwordReset.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  },
};