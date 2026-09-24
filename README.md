# ✿ Sakura Summons

An anime-themed idle clicker with gacha. Click your character to earn gold, spend it on
summon banners for characters and equipment, and level up / ascend your collection.
All art is colored ASCII.

## Run it

Requires Node.js 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # same, restarts on file changes
```

Env vars: `PORT` (default 3000), `DB_FILE` (default `data/game.db`).

## How it plays

- **Clicking** earns gold (click power × gold bonus, with crits). **Idle gold** accrues
  per second, including while you're offline (capped at 8h + bonuses).
- **One active character + 3 gear slots** (weapon, armor, accessory). Stats stack.
  Signature gear gives +50% when worn by its matching character.
- **Four banners**: characters, weapons, armor, accessories. Rates: 5★ 2%, 4★ 12%.
  Pity: 5★ guaranteed within 50 summons, 4★+ within 10 (tracked per banner).
- **Duplicates → shards.** Ascending (needs max level + shards + gold) raises the level
  cap by 10 and boosts stats 25%. Once an item has all the shards it can use, dupes pay out gold.
- **Salvage** unwanted items for gold.

## Project layout

```
server/
  index.js          Express app + routes
  auth.js           signup / login / sessions (bcrypt, httpOnly cookie), password change, account delete
  game.js           all game rules: stats, idle settle, clicks, gacha, level/ascend, loadout, salvage
  db.js             SQLite schema
  data/             characters, equipment (stats + ASCII art), banners
public/
  index.html, style.css
  app.js            client UI and game loop
  art.js            ASCII art → colored HTML renderer
```

The server owns all game state; the client only shows predicted numbers between syncs.
Clicks are batched every ~2s and capped at 20/sec on the server.

### Adding a character or item

Add an entry to `server/data/characters.js` or `equipment.js`. It shows up on its banner
automatically. Art fields:

- `art`: an `art(String.raw\`...\`)` block (the common left indent is stripped)
- `paint`: `[rowStart, rowEnd, colStart, colEnd, color]` rectangles (end is exclusive)
- `glyphs`: `{ char: color }` overrides
- `blink`: `[row, col, text]` overlays for the closed-eye frame (characters only)

Columns are counted **after** the indent is stripped.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` | Auth |
| GET | `/api/auth/me` | Current user |
| PUT | `/api/auth/password` | Change password |
| DELETE | `/api/auth/account` | Delete account |
| GET | `/api/catalog` | Characters, equipment, banners, rates |
| GET | `/api/state` | Player state (+ offline earnings report) |
| POST | `/api/sync` | Submit batched clicks |
| POST | `/api/gacha/:bannerId/pull` | Summon (`{count: 1..10}`) |
| GET | `/api/gacha/history` | Last 50 summons |
| POST | `/api/items/:id/level-up` | Level up (`{times}`) |
| POST | `/api/items/:id/ascend` | Ascend |
| DELETE | `/api/items/:id` | Salvage |
| PUT | `/api/loadout/:slot` | Equip (`{itemId}`; `null` unequips gear) |
| GET | `/api/leaderboard` | Top 20 by lifetime gold |
