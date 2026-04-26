import { Router } from 'express';
import { authenticate } from '@/middlewares/auth.middleware.js';
import { getReport } from '@/controllers/recording.controller.js';

const sessionRouter = Router();

// GET /sessions/:roomId/report     — returns computed analytics
sessionRouter.get('/:roomId/report', authenticate, getReport);

export default sessionRouter;
