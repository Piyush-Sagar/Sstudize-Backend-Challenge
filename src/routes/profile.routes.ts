import { Router } from 'express';
import { profileController } from '../controllers/profile.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// Protected routes
router.get('/', authenticate, profileController.getProfile);

export default router;