import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { hashToken } from '../utils/crypto';
import { prisma } from '../config/database';
import { RefreshTokenRevokedError } from '../utils/errors';

export const authController = {
  /**
   * POST /api/auth/register
   * Register a new user
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, phone } = req.body;
      const ip = req.ip;
      const userAgent = req.get('user-agent');

      const user = await authService.register(email, password, phone || '', ip, userAgent);

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/login
   * Login with email and password
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const ip = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.login(email, password, ip, userAgent);

      if (result.requires2FA) {
        res.status(200).json({
          success: true,
          requires2FA: true,
          challengeId: result.challengeId,
          message: 'Two-factor authentication required',
        });
        return;
      }

      res.status(200).json({
        success: true,
        requires2FA: false,
        data: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/2fa/enable
   * Initiate 2FA enable flow (requires authentication)
   */
  async enable2FA(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const ip = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.enable2FA(userId, ip, userAgent);

      res.status(200).json({
        success: true,
        challengeId: result.challengeId,
        message: 'OTP sent to your phone. Please verify to enable 2FA.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/2fa/verify
   * Verify OTP for login_2fa or enable_2fa
   */
  async verify2FA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { challengeId, code } = req.body;
      const ip = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.verify2FA(challengeId, code, ip, userAgent);

      if ('accessToken' in result) {
        // Login 2FA - return tokens
        res.status(200).json({
          success: true,
          requires2FA: false,
          data: {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          },
        });
      } else {
        // Enable 2FA - return success
        res.status(200).json({
          success: true,
          message: 'Two-factor authentication has been enabled',
        });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/token/refresh
   * Refresh access token using refresh token
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      const tokenHash = hashToken(refreshToken);

      const storedToken = await prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
      });

      if (!storedToken) {
        throw new RefreshTokenRevokedError('Invalid refresh token');
      }

      const ip = req.ip;
      const userAgent = req.get('user-agent');

      const tokens = await authService.refresh(storedToken.userId, refreshToken, ip, userAgent);

      res.status(200).json({
        success: true,
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/logout
   * Logout - revoke refresh token
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const ip = req.ip;
      const userAgent = req.get('user-agent');

      await authService.logout(refreshToken, ip, userAgent);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/forgot-password
   * Request password reset
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      const ip = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.forgotPassword(email, ip, userAgent);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/auth/reset-password
   * Reset password with token
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;
      const ip = req.ip;
      const userAgent = req.get('user-agent');

      const result = await authService.resetPassword(token, newPassword, ip, userAgent);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  },
};