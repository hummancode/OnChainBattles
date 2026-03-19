// ============================================================
// api/index.ts
// Assembles all REST API sub-routers.
// Mounted at /api in server/app.ts.
// ============================================================

import { Router } from 'express';
import { authRouter } from './authRoutes.js';
import { playerRouter } from './playerRoutes.js';
import { deckRouter } from './deckRoutes.js';
import { collectionRouter } from './collectionRoutes.js';
import { matchRouter } from './matchRoutes.js';
import { adminRouter } from './adminRoutes.js';
import { puzzleRouter } from './puzzleRoutes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/player', playerRouter);
apiRouter.use('/decks', deckRouter);
apiRouter.use('/collection', collectionRouter);
apiRouter.use('/matches', matchRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/puzzles', puzzleRouter);
