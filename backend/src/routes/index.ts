/**
 * Aggregator de todas as rotas do backend.
 */
import { Router } from 'express';
import { healthRouter } from './health.js';
import { authRouter } from './auth.js';
import { matchesRouter } from './matches.js';
import { groupsRouter } from './groups.js';
import { standingsRouter } from './standings.js';
import { playersRouter } from './players.js';
import { predictionsRouter } from './predictions.js';
import { specialsRouter } from './specials.js';
import { configRouter } from './config.js';
import { adminRouter } from './admin.js';
import { leaderboardRouter } from './leaderboard.js';
import { signalrRouter } from './signalr.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/matches', matchesRouter);
router.use('/groups', groupsRouter);
router.use('/standings', standingsRouter);
router.use('/players', playersRouter);
router.use('/predictions', predictionsRouter);
router.use('/specials', specialsRouter);
router.use('/config', configRouter);
router.use('/admin', adminRouter);
router.use('/leaderboard', leaderboardRouter);
router.use('/negotiate', signalrRouter);

export { router as apiRouter };
