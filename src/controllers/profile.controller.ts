import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { authService } from '../services/auth.service';

export const profileController = {
  /**
   * GET /api/profile
   * Get authenticated user's profile
   */
  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;

      const profile = await authService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  },
};