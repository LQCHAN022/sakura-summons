import { randomInt } from 'node:crypto';
import { db, tx } from './db.js';
import { ITEMS, SLOTS, BANNER_MAP, BANNER_POOLS } from './data/index.js';

export const CONFIG = {
  base: { click: 1, idle: 0, critChance: 0.05, critMult: 2, goldMult: 0, offlineHours: 8 },
  maxCritChance: 0.75,
  maxClicksPerSecond: 20,
  maxClickWindowSec: 10,
  rates: { 5: 0.02, 4: 0.12 },
  pity5: 50,
  pity4: 10,
  maxAscension: 5,
  signatureBonus: 0.5,
  startingGold: 300,
  starter: { character: 'hana', weapon: 'wooden_sword' },
  offlineReportSec: 60,
  maxPullCount: 10,
};

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const FLAT_STATS = new Set(['click', 'idle']);
const PCT_STATS = new Set(['critChance', 'critMult', 'goldMult']);
const RARITY_FACTOR = { 3: 1, 4: 2.5, 5: 6 };
const DUPE_REFUND = { 3: 50, 4: 200, 5: 1000 };
const SALVAGE_BASE = { 3: 40, 4: 150, 5: 600 };

// ------------------------------------------------------------------ formulas

export const maxLevel = (ascension) => 10 + 10 * ascension;

export function levelUpCost(item, level) {
  const base = { 3: 15, 4: 40, 5: 100 }[item.rarity] * (item.kind === 'character' ? 1 : 0.7);
  return Math.ceil(base * Math.pow(1.16, level - 1));
}

export function ascendCost(item, ascension) {
  if (ascension >= CONFIG.maxAscension) return null;
  return { shards: ascension + 1, gold: Math.ceil(200 * (ascension + 1) * RARITY_FACTOR[item.rarity]) };
}

// Shards still needed to fully ascend from the given ascension.
function shardsToMax(ascension) {
  let total = 0;
  for (let a = ascension; a < CONFIG.maxAscension; a++) total += a + 1;
  return total;
}

export function scaledStats(item, level, ascension, signature = false) {
  const levelF = 1 + 0.2 * (level - 1);
  const ascF = 1 + 0.25 * ascension;
  const sigF = signature ? 1 + CONFIG.signatureBonus : 1;
  const out = {};
  for (const [key, value] of Object.entries(item.stats)) {
    if (FLAT_STATS.has(key)) out[key] = value * levelF * ascF * sigF;
    else if (PCT_STATS.has(key)) out[key] = value * ascF * sigF;
    else out[key] = value * sigF;
  }
  return out;
}

function salvageValue(item, row) {
  let spent = 0;
  for (let l = 1; l < row.level; l++) spent += levelUpCost(item, l);
  const base = SALVAGE_BASE[item.rarity];
  return Math.floor(base + spent * 0.5 + row.shards * base * 0.5);
}

function isSignature(item, player) {
  return item.kind !== 'character' && item.signature === player.active_character;
}

export function computeStats(player, inv) {
  const s = { ...CONFIG.base };
  for (const id of [player.active_character, ...SLOTS.map((slot) => player[slot])]) {
    const row = id && inv.get(id);
    if (!row) continue;
    const item = ITEMS.get(id);
    const add = scaledStats(item, row.level, row.ascension, isSignature(item, player));
    for (const [key, value] of Object.entries(add)) s[key] += value;
  }
  const critChance = Math.min(s.critChance, CONFIG.maxCritChance);
  const mult = 1 + s.goldMult;
  const clickValue = s.click * mult;
  return {
    clickValue,
    idleRate: s.idle * mult,
    critChance,
    critMult: s.critMult,
    goldMult: s.goldMult,
    offlineHours: s.offlineHours,
    expectedClick: clickValue * (1 + critChance * (s.critMult - 1)),
  };
}

// ------------------------------------------------------------------ queries

const q = {
  player: db.prepare('SELECT * FROM players WHERE user_id = ?'),
  inventory: db.prepare('SELECT * FROM inventory WHERE user_id = ?'),
  insertPlayer: db.prepare(`
    INSERT INTO players (user_id, gold, last_tick, last_sync, active_character, weapon)
    VALUES (?, ?, ?, ?, ?, ?)`),
  insertItem: db.prepare(
    'INSERT INTO inventory (user_id, item_id, obtained_at) VALUES (?, ?, ?)'
  ),
  addShard: db.prepare('UPDATE inventory SET shards = shards + 1 WHERE user_id = ? AND item_id = ?'),
  setLevel: db.prepare('UPDATE inventory SET level = ? WHERE user_id = ? AND item_id = ?'),
  ascend: db.prepare(
    'UPDATE inventory SET ascension = ascension + 1, shards = shards - ? WHERE user_id = ? AND item_id = ?'
  ),
  deleteItem: db.prepare('DELETE FROM inventory WHERE user_id = ? AND item_id = ?'),
  economy: db.prepare(
    'UPDATE players SET gold = ?, total_earned = ?, last_tick = ? WHERE user_id = ?'
  ),
  spend: db.prepare('UPDATE players SET gold = gold - ? WHERE user_id = ?'),
  earn: db.prepare(
    'UPDATE players SET gold = gold + ?, total_earned = total_earned + ? WHERE user_id = ?'
  ),
  clicks: db.prepare(
    'UPDATE players SET gold = gold + ?, total_earned = total_earned + ?, total_clicks = total_clicks + ?, last_sync = ? WHERE user_id = ?'
  ),
  pity: db.prepare('SELECT * FROM pity WHERE user_id = ?'),
  upsertPity: db.prepare(`
    INSERT INTO pity (user_id, banner_id, since5, since4, total) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, banner_id) DO UPDATE SET since5 = excluded.since5, since4 = excluded.since4, total = excluded.total`),
  addPulls: db.prepare('UPDATE players SET total_pulls = total_pulls + ? WHERE user_id = ?'),
  logPull: db.prepare(
    'INSERT INTO pulls (user_id, banner_id, item_id, rarity, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  history: db.prepare(
    'SELECT banner_id, item_id, rarity, outcome, created_at FROM pulls WHERE user_id = ? ORDER BY id DESC LIMIT 50'
  ),
  leaderboard: db.prepare(`
    SELECT u.username, p.total_earned, p.total_pulls, p.active_character
    FROM players p JOIN users u ON u.id = p.user_id
    ORDER BY p.total_earned DESC LIMIT 20`),
};

function loadInventory(userId) {
  return new Map(q.inventory.all(userId).map((row) => [row.item_id, row]));
}

function requireOwned(inv, itemId) {
  const row = inv.get(itemId);
  if (!row) throw new GameError("You don't own that item.", 404);
  return row;
}

function requireGold(player, amount) {
  if (player.gold < amount) throw new GameError('Not enough gold.');
}

// ------------------------------------------------------------------ core

export function createPlayer(userId) {
  const now = Date.now();
  const { character, weapon } = CONFIG.starter;
  q.insertPlayer.run(userId, CONFIG.startingGold, now, now, character, weapon);
  q.insertItem.run(userId, character, now);
  q.insertItem.run(userId, weapon, now);
}

// Credits idle gold earned since the last tick (capped by the offline limit).
function settle(userId, now = Date.now()) {
  const player = q.player.get(userId);
  if (!player) throw new GameError('Player not found.', 404);
  const inv = loadInventory(userId);
  const stats = computeStats(player, inv);
  const elapsedSec = Math.max(0, (now - player.last_tick) / 1000);
  const earned = stats.idleRate * Math.min(elapsedSec, stats.offlineHours * 3600);
  player.gold += earned;
  player.total_earned += earned;
  player.last_tick = now;
  q.economy.run(player.gold, player.total_earned, now, userId);
  return { player, inv, stats, earned, elapsedSec };
}

function itemView(row, player) {
  const item = ITEMS.get(row.item_id);
  const sig = isSignature(item, player);
  const cap = maxLevel(row.ascension);
  const equipped =
    row.item_id === player.active_character || SLOTS.some((slot) => player[slot] === row.item_id);
  return {
    itemId: row.item_id,
    level: row.level,
    ascension: row.ascension,
    shards: row.shards,
    maxLevel: cap,
    signatureActive: sig,
    equipped,
    levelUpCost: row.level < cap ? levelUpCost(item, row.level) : null,
    ascendCost: ascendCost(item, row.ascension),
    stats: scaledStats(item, row.level, row.ascension, sig),
    nextStats: row.level < cap ? scaledStats(item, row.level + 1, row.ascension, sig) : null,
    salvageValue: salvageValue(item, row),
  };
}

function stateFrom({ player, inv, stats }, userId) {
  const pity = {};
  for (const row of q.pity.all(userId)) {
    pity[row.banner_id] = { since5: row.since5, since4: row.since4, total: row.total };
  }
  return {
    player: {
      gold: player.gold,
      totalEarned: player.total_earned,
      totalClicks: player.total_clicks,
      totalPulls: player.total_pulls,
      character: player.active_character,
      weapon: player.weapon,
      armor: player.armor,
      accessory: player.accessory,
    },
    stats,
    inventory: [...inv.values()].map((row) => itemView(row, player)),
    pity,
  };
}

export function getState(userId) {
  return tx(() => {
    const settled = settle(userId);
    // A new page load resets the click window so a stale last_sync can't be banked.
    db.prepare('UPDATE players SET last_sync = ? WHERE user_id = ?').run(Date.now(), userId);
    const offline =
      settled.elapsedSec >= CONFIG.offlineReportSec && settled.earned > 0
        ? {
            seconds: Math.floor(settled.elapsedSec),
            cappedSeconds: Math.floor(Math.min(settled.elapsedSec, settled.stats.offlineHours * 3600)),
            earned: settled.earned,
          }
        : null;
    return { ...stateFrom(settled, userId), offline };
  });
}

// Credits clicks reported by the client, capped to a humanly possible rate.
export function syncClicks(userId, reported) {
  return tx(() => {
    const now = Date.now();
    const { player, stats } = settle(userId, now);
    const windowSec = Math.min((now - player.last_sync) / 1000, CONFIG.maxClickWindowSec);
    const allowed = Math.ceil(Math.max(0, windowSec) * CONFIG.maxClicksPerSecond);
    const clicks = Math.max(0, Math.min(Math.floor(Number(reported) || 0), allowed));
    const gain = clicks * stats.expectedClick;
    q.clicks.run(gain, gain, clicks, now, userId);
    return { gold: player.gold + gain, stats, accepted: clicks };
  });
}

function rollRarity(p) {
  const roll = randomInt(1_000_000) / 1_000_000;
  if (p.since5 + 1 >= CONFIG.pity5 || roll < CONFIG.rates[5]) return 5;
  if (p.since4 + 1 >= CONFIG.pity4 || roll < CONFIG.rates[5] + CONFIG.rates[4]) return 4;
  return 3;
}

export function pull(userId, bannerId, count) {
  const banner = BANNER_MAP.get(bannerId);
  if (!banner) throw new GameError('Unknown banner.', 404);
  count = Math.floor(Number(count));
  if (!(count >= 1 && count <= CONFIG.maxPullCount)) throw new GameError('Invalid pull count.');

  return tx(() => {
    const now = Date.now();
    const settled = settle(userId, now);
    const cost = banner.cost * count;
    requireGold(settled.player, cost);
    q.spend.run(cost, userId);
    settled.player.gold -= cost;

    const pityRow = q.pity.all(userId).find((r) => r.banner_id === bannerId);
    const p = pityRow ? { ...pityRow } : { since5: 0, since4: 0, total: 0 };
    const pool = BANNER_POOLS.get(bannerId);
    const results = [];

    for (let i = 0; i < count; i++) {
      const rarity = rollRarity(p);
      p.total++;
      if (rarity === 5) {
        p.since5 = 0;
        p.since4 = 0;
      } else if (rarity === 4) {
        p.since5++;
        p.since4 = 0;
      } else {
        p.since5++;
        p.since4++;
      }
      const choices = pool[rarity];
      const itemId = choices[randomInt(choices.length)];
      const item = ITEMS.get(itemId);
      const owned = settled.inv.get(itemId);
      let outcome;
      let refund = 0;
      if (!owned) {
        q.insertItem.run(userId, itemId, now);
        settled.inv.set(itemId, { item_id: itemId, level: 1, ascension: 0, shards: 0 });
        outcome = 'new';
      } else if (owned.shards < shardsToMax(owned.ascension)) {
        q.addShard.run(userId, itemId);
        owned.shards++;
        outcome = 'shard';
      } else {
        refund = DUPE_REFUND[rarity] * (item.kind === 'character' ? 2 : 1);
        q.earn.run(refund, refund, userId);
        settled.player.gold += refund;
        outcome = 'refund';
      }
      q.logPull.run(userId, bannerId, itemId, rarity, outcome, now);
      results.push({ itemId, rarity, outcome, refund });
    }

    q.upsertPity.run(userId, bannerId, p.since5, p.since4, p.total);
    q.addPulls.run(count, userId);
    return { results, state: stateFrom(settle(userId, now), userId) };
  });
}

export function levelUp(userId, itemId, times = 1) {
  times = Math.max(1, Math.min(100, Math.floor(Number(times)) || 1));
  return tx(() => {
    const settled = settle(userId);
    const row = requireOwned(settled.inv, itemId);
    const item = ITEMS.get(itemId);
    const cap = maxLevel(row.ascension);
    if (row.level >= cap) throw new GameError('Max level reached. Ascend to raise the cap.');

    let level = row.level;
    let spent = 0;
    for (let i = 0; i < times && level < cap; i++) {
      const cost = levelUpCost(item, level);
      if (settled.player.gold - spent < cost) break;
      spent += cost;
      level++;
    }
    if (level === row.level) throw new GameError('Not enough gold.');
    q.spend.run(spent, userId);
    q.setLevel.run(level, userId, itemId);
    return { state: stateFrom(settle(userId), userId) };
  });
}

export function ascend(userId, itemId) {
  return tx(() => {
    const settled = settle(userId);
    const row = requireOwned(settled.inv, itemId);
    const item = ITEMS.get(itemId);
    const cost = ascendCost(item, row.ascension);
    if (!cost) throw new GameError('Already fully ascended.');
    if (row.level < maxLevel(row.ascension)) throw new GameError('Reach max level before ascending.');
    if (row.shards < cost.shards) throw new GameError(`Need ${cost.shards} shards (duplicates) to ascend.`);
    requireGold(settled.player, cost.gold);
    q.spend.run(cost.gold, userId);
    q.ascend.run(cost.shards, userId, itemId);
    return { state: stateFrom(settle(userId), userId) };
  });
}

export function setLoadout(userId, slot, itemId) {
  if (slot !== 'character' && !SLOTS.includes(slot)) throw new GameError('Unknown slot.');
  return tx(() => {
    const settled = settle(userId); // bank idle gold at the old rate first
    if (itemId === null || itemId === undefined) {
      if (slot === 'character') throw new GameError('You must have an active character.');
    } else {
      requireOwned(settled.inv, itemId);
      if (ITEMS.get(itemId).kind !== slot) throw new GameError(`That item doesn't go in the ${slot} slot.`);
    }
    const column = slot === 'character' ? 'active_character' : slot;
    db.prepare(`UPDATE players SET ${column} = ? WHERE user_id = ?`).run(itemId ?? null, userId);
    return { state: stateFrom(settle(userId), userId) };
  });
}

export function salvage(userId, itemId) {
  return tx(() => {
    const settled = settle(userId);
    const row = requireOwned(settled.inv, itemId);
    const { player } = settled;
    if (itemId === player.active_character || SLOTS.some((slot) => player[slot] === itemId)) {
      throw new GameError('Unequip it before salvaging.');
    }
    const value = salvageValue(ITEMS.get(itemId), row);
    q.deleteItem.run(userId, itemId);
    q.earn.run(value, value, userId);
    return { refund: value, state: stateFrom(settle(userId), userId) };
  });
}

export function history(userId) {
  return q.history.all(userId);
}

export function leaderboard() {
  return q.leaderboard.all();
}
