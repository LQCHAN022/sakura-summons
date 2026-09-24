import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter, loadUser, requireAuth } from './auth.js';
import * as game from './game.js';
import { CHARACTERS, EQUIPMENT, BANNERS } from './data/index.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(root, 'public')));

// Mutating API calls must be JSON: blocks cross-site form posts (CSRF) without a token.
app.use('/api', (req, _res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) {
    return next(new game.GameError('Expected a JSON request.', 415));
  }
  next();
});
app.use('/api', loadUser);
app.use('/api/auth', authRouter);

app.get('/api/catalog', (_req, res) => {
  res.json({
    characters: CHARACTERS,
    equipment: EQUIPMENT,
    banners: BANNERS,
    config: {
      rates: game.CONFIG.rates,
      pity5: game.CONFIG.pity5,
      pity4: game.CONFIG.pity4,
      maxAscension: game.CONFIG.maxAscension,
      signatureBonus: game.CONFIG.signatureBonus,
      maxPullCount: game.CONFIG.maxPullCount,
    },
  });
});

app.get('/api/leaderboard', (_req, res) => res.json({ leaderboard: game.leaderboard() }));

const api = express.Router();
api.use(requireAuth);
api.get('/state', (req, res) => res.json(game.getState(req.user.id)));
api.post('/sync', (req, res) => res.json(game.syncClicks(req.user.id, req.body.clicks)));
api.post('/gacha/:bannerId/pull', (req, res) =>
  res.json(game.pull(req.user.id, req.params.bannerId, req.body.count ?? 1))
);
api.get('/gacha/history', (req, res) => res.json({ history: game.history(req.user.id) }));
api.post('/items/:itemId/level-up', (req, res) =>
  res.json(game.levelUp(req.user.id, req.params.itemId, req.body.times ?? 1))
);
api.post('/items/:itemId/ascend', (req, res) => res.json(game.ascend(req.user.id, req.params.itemId)));
api.delete('/items/:itemId', (req, res) => res.json(game.salvage(req.user.id, req.params.itemId)));
api.put('/loadout/:slot', (req, res) =>
  res.json(game.setLoadout(req.user.id, req.params.slot, req.body.itemId ?? null))
);
app.use('/api', api);

app.use('/api', (_req, _res, next) => next(new game.GameError('Not found.', 404)));

app.use((err, _req, res, _next) => {
  if (err instanceof game.GameError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Sakura Summons running at http://localhost:${port}`));
