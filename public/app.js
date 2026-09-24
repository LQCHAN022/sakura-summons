import { renderArt, stars } from './art.js';

// ------------------------------------------------------------------ helpers

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 1000) return n < 100 && n % 1 ? (Math.floor(n * 10) / 10).toString() : Math.floor(n).toString();
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return n.toExponential(2);
  const v = n / 10 ** (tier * 3);
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v)) + SUFFIXES[tier];
}
const pct = (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

function duration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${sec}s`;
}

const STAT_INFO = {
  click: ['Click power', (v) => `+${fmt(v)}`],
  idle: ['Idle gold / sec', (v) => `+${fmt(v)}`],
  critChance: ['Crit chance', (v) => `+${pct(v)}`],
  critMult: ['Crit damage', (v) => `+${v.toFixed(2)}×`],
  goldMult: ['Gold bonus', (v) => `+${pct(v)}`],
  offlineHours: ['Offline cap', (v) => `+${+v.toFixed(1)}h`],
};
const KIND_LABEL = { character: 'Character', weapon: 'Weapon', armor: 'Armor', accessory: 'Accessory' };
const SLOTS = ['weapon', 'armor', 'accessory'];

async function api(path, { method = 'GET', body, keepalive = false } = {}) {
  const opts = { method, headers: {}, keepalive };
  if (method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body || {});
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 401 && user) handleLoggedOut();
    throw err;
  }
  return data;
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function showModal(html, { onClose } = {}) {
  const modal = $('#modal');
  $('#modal-box').innerHTML = html;
  modal.classList.remove('hidden');
  modal.onclose = onClose;
  return $('#modal-box');
}
function closeModal() {
  const modal = $('#modal');
  if (modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  modal.onclose?.();
  modal.onclose = null;
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal();
});

// ------------------------------------------------------------------ state

let catalog = null;
let items = new Map();
let user = null;
let state = null;
const econ = { serverGold: 0, at: 0, pendingClicks: 0, pendingGold: 0, inflightGold: 0, syncing: null };
const ui = { tab: 'home', char: null, equip: null, equipKind: 'weapon', banner: 'character', busy: false };
let loopsStarted = false;

const owned = (id) => state.inventory.find((row) => row.itemId === id);

function displayGold() {
  const idle = state ? (state.stats.idleRate * (performance.now() - econ.at)) / 1000 : 0;
  return econ.serverGold + idle + econ.pendingGold + econ.inflightGold;
}

function applyState(next) {
  state = next;
  econ.serverGold = next.player.gold;
  econ.at = performance.now();
  renderTopbar();
  renderTab();
}

// Sends buffered clicks to the server and reconciles the gold balance.
function flush({ keepalive = false } = {}) {
  if (econ.syncing) return econ.syncing;
  const clicks = econ.pendingClicks;
  econ.inflightGold = econ.pendingGold;
  econ.pendingClicks = 0;
  econ.pendingGold = 0;
  econ.syncing = api('/api/sync', { method: 'POST', body: { clicks }, keepalive })
    .then((res) => {
      econ.serverGold = res.gold;
      econ.at = performance.now();
      if (state) state.stats = res.stats;
    })
    .catch((err) => {
      if (err.status !== 401) toast('Connection hiccup, some clicks were lost.', 'error');
    })
    .finally(() => {
      econ.inflightGold = 0;
      econ.syncing = null;
    });
  return econ.syncing;
}

// Wraps a server action: flush clicks first, apply returned state, surface errors.
async function act(fn) {
  if (ui.busy) return null;
  ui.busy = true;
  try {
    await flush();
    const res = await fn();
    if (res?.state) applyState(res.state);
    return res;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  } finally {
    ui.busy = false;
  }
}

// ------------------------------------------------------------------ auth

let authMode = 'login';

function showAuth() {
  $('#game-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
  const pick = catalog.characters[Math.floor(Math.random() * catalog.characters.length)];
  $('#auth-art').innerHTML = renderArt(pick);
  $('#auth-form [name=username]').focus();
}

$$('#auth-form .seg button').forEach((btn) =>
  btn.addEventListener('click', () => {
    authMode = btn.dataset.mode;
    $$('#auth-form .seg button').forEach((b) => b.classList.toggle('active', b === btn));
    $('#auth-submit').textContent = authMode === 'login' ? 'Log in' : 'Create account';
    $('#auth-form [name=password]').autocomplete = authMode === 'login' ? 'current-password' : 'new-password';
    $('#auth-error').textContent = '';
  })
);

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = { username: form.username.value.trim(), password: form.password.value };
  $('#auth-error').textContent = '';
  $('#auth-submit').disabled = true;
  try {
    const res = await api(`/api/auth/${authMode}`, { method: 'POST', body });
    user = res.user;
    form.reset();
    await enterGame(authMode === 'signup');
  } catch (err) {
    $('#auth-error').textContent = err.message;
  } finally {
    $('#auth-submit').disabled = false;
  }
});

function handleLoggedOut() {
  user = null;
  state = null;
  closeModal();
  showAuth();
}

$('#logout').addEventListener('click', async () => {
  await flush();
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  handleLoggedOut();
});

async function enterGame(isNew = false) {
  const next = await api('/api/state');
  econ.pendingClicks = econ.pendingGold = econ.inflightGold = 0;
  $('#auth-view').classList.add('hidden');
  $('#game-view').classList.remove('hidden');
  $('#username').textContent = user.username;
  switchTab('home');
  applyState(next);
  startLoops();
  if (isNew) welcomeModal();
  else if (next.offline) offlineModal(next.offline);
}

function welcomeModal() {
  showModal(`
    <h2>Welcome, ${esc(user.username)}!</h2>
    <p>Hana has joined your party with a trusty Wooden Sword.</p>
    <ul class="tips">
      <li>Click Hana to earn <b>gold</b>. Your team also earns gold while you're away.</li>
      <li>Spend gold on the <b>Summon</b> banners to get new characters and gear.</li>
      <li>Duplicates become <b>shards</b>. Use them to ascend and raise the level cap.</li>
    </ul>
    <button class="btn primary" data-close>Let's go!</button>`);
}

function offlineModal(off) {
  const capped = off.cappedSeconds < off.seconds;
  showModal(`
    <h2>Welcome back!</h2>
    <pre class="art mini-art">${renderArt(items.get(state.player.character))}</pre>
    <p>While you were away for <b>${duration(off.seconds)}</b>, your team earned</p>
    <p class="big-gold">◎ ${fmt(off.earned)}</p>
    ${capped ? `<p class="muted small">Offline earnings are capped at ${duration(off.cappedSeconds)}. Equip gear with "Offline cap" to extend it.</p>` : ''}
    <button class="btn primary" data-close>Collect</button>`);
}

// ------------------------------------------------------------------ loops

function startLoops() {
  if (loopsStarted) return;
  loopsStarted = true;

  let shownGold = '';
  const tick = () => {
    const text = state ? fmt(displayGold()) : '';
    if (state && text !== shownGold) $('#gold').textContent = shownGold = text;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  setInterval(() => {
    if (state && (econ.pendingClicks > 0 || performance.now() - econ.at > 15000)) flush();
  }, 2000);

  // Grey out buttons the player can't afford yet.
  setInterval(() => {
    if (!state || document.hidden) return;
    const gold = displayGold();
    $$('[data-cost]').forEach((btn) => {
      btn.classList.toggle('poor', gold < Number(btn.dataset.cost));
    });
  }, 250);

  // Blinking only swaps a class (see renderArt's `blinkable`), and skips while the
  // player is clicking so it can't stutter the bump animation.
  const blink = () => {
    if (state && ui.tab === 'home' && performance.now() - fx.lastClick > 1000) {
      const art = $('#stage-art');
      art.classList.add('blinking');
      setTimeout(() => art.classList.remove('blinking'), 140);
    }
    setTimeout(blink, 2500 + Math.random() * 3500);
  };
  setTimeout(blink, 2000);

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (!state) return;
    if (document.hidden) {
      hiddenAt = Date.now();
      flush({ keepalive: true });
    } else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
      await flush();
      const next = await api('/api/state').catch(() => null);
      if (next) {
        applyState(next);
        if (next.offline) offlineModal(next.offline);
      }
    }
  });
  window.addEventListener('pagehide', () => state && flush({ keepalive: true }));
}

// ------------------------------------------------------------------ tabs

function switchTab(tab) {
  ui.tab = tab;
  if (tab !== 'home') clearClickFx();
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab').forEach((s) => s.classList.toggle('hidden', s.id !== `tab-${tab}`));
  if (state) renderTab();
}
$$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

function renderTab() {
  ({
    home: renderHome,
    characters: renderCharacters,
    equipment: renderEquipment,
    gacha: renderGacha,
    ranking: renderRanking,
    profile: renderProfile,
  })[ui.tab]();
}

function renderTopbar() {
  $('#per-click').textContent = fmt(state.stats.clickValue);
  $('#per-sec').textContent = fmt(state.stats.idleRate);
}

// ------------------------------------------------------------------ home

function renderHome() {
  const char = items.get(state.player.character);
  const row = owned(char.id);
  $('#stage-art').innerHTML = renderArt(char, { blinkable: true });
  $('#stage').className = `stage r${char.rarity}`;
  stageRect = null; // art size may have changed
  $('#stage-name').innerHTML = `${esc(char.name)} <span class="stars r${char.rarity}">${stars(char.rarity)}</span>`;
  $('#stage-title').textContent = char.title;
  $('#stage-level').innerHTML = `Lv <b>${row.level}</b>/${row.maxLevel}${ascPips(row.ascension)}`;
  $('#stage-quote').textContent = char.quote;

  $('#loadout').innerHTML = SLOTS.map((slot) => {
    const id = state.player[slot];
    const item = id && items.get(id);
    const r = id && owned(id);
    return `
      <button class="slot ${item ? `r${item.rarity}` : 'empty'}" data-slot="${slot}">
        <pre class="art slot-art">${item ? renderArt(item) : ''}</pre>
        <div class="slot-info">
          <div class="slot-kind">${KIND_LABEL[slot]}</div>
          ${
            item
              ? `<div class="slot-name">${esc(item.name)}</div>
                 <div class="small"><span class="stars r${item.rarity}">${stars(item.rarity)}</span> Lv ${r.level}
                 ${r.signatureActive ? '<span class="tag sig">SIGNATURE</span>' : ''}</div>`
              : '<div class="slot-name muted">Empty slot</div><div class="small muted">Click to equip</div>'
          }
        </div>
      </button>`;
  }).join('');
  $$('#loadout .slot').forEach((btn) =>
    btn.addEventListener('click', () => {
      ui.equipKind = btn.dataset.slot;
      ui.equip = state.player[btn.dataset.slot] || null;
      switchTab('equipment');
    })
  );

  const s = state.stats;
  $('#stats').innerHTML = [
    ['Gold per click', fmt(s.clickValue)],
    ['Crit chance', pct(s.critChance)],
    ['Crit damage', `${s.critMult.toFixed(2)}×`],
    ['Idle gold / sec', fmt(s.idleRate)],
    ['Gold bonus', `+${pct(s.goldMult)}`],
    ['Offline cap', `${+s.offlineHours.toFixed(1)}h`],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');
}

function ascPips(asc) {
  const max = catalog.config.maxAscension;
  return ` <span class="pips" title="Ascension ${asc}/${max}">${'◆'.repeat(asc)}${'◇'.repeat(max - asc)}</span>`;
}

// Human-speed cap: extra clicks inside a 1s sliding window are ignored entirely
// (no gold, no effects). The server allows a little more to absorb sync jitter.
// Times are the event's own timestamp, so input the browser delivers late (after a
// slow frame) is judged by when it happened, and stale input is dropped rather
// than spawning effects after the player has stopped.
const MAX_CLICKS_PER_SEC = 15;
const STALE_INPUT_MS = 100;
const clickTimes = [];
function allowClick(t) {
  if (performance.now() - t > STALE_INPUT_MS) return false;
  while (clickTimes.length && t - clickTimes[0] >= 1000) clickTimes.shift();
  if (clickTimes.length >= MAX_CLICKS_PER_SEC) return false;
  clickTimes.push(t);
  return true;
}

// Floaters and sparks are drawn on one <canvas>, so a burst never creates DOM nodes
// or text-shadow paints over the art. Clicks are queued and spawned once per frame
// (clicks in the same frame merge into one floater), and the loop stops as soon as
// nothing is left alive.
const MAX_FLOATERS = 8;
const MAX_SPARKS = 18;
const FLOATER_MS = 800;
const SPARK_MS = 500;
// Once clicking pauses this long, only the newest batch may finish its animation;
// older effects fade out over FADE_MS.
const PAUSE_MS = 150;
const FADE_MS = 120;
const SPARK_CHARS = ['✦', '✧', '*', '+', '·', '✿'];
const fx = { queue: [], frame: 0, floaters: [], sparks: [], bump: null, flash: null, lastClick: -Infinity, batch: 0 };
const fxCanvas = $('#fx-canvas');
const fxCtx = fxCanvas.getContext('2d');
let fxStyle = null;

function clickStage(x, y, t) {
  if (!state || ui.tab !== 'home' || !allowClick(t)) return;
  const s = state.stats;
  const crit = Math.random() < s.critChance;
  const amount = s.clickValue * (crit ? s.critMult : 1);
  econ.pendingClicks++;
  econ.pendingGold += amount;
  fx.lastClick = t;
  fx.queue.push({ x, y, amount, crit });
  if (!fx.frame) fx.frame = requestAnimationFrame(drawClickFx);
}

function clearClickFx() {
  if (fx.frame) cancelAnimationFrame(fx.frame);
  fx.frame = 0;
  fx.queue = [];
  fx.floaters = [];
  fx.sparks = [];
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
}

function sizeFxCanvas() {
  const { width, height } = stageBox();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (fxCanvas.width !== w || fxCanvas.height !== h) {
    fxCanvas.width = w;
    fxCanvas.height = h;
  }
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnClickFx(batch, now) {
  const crit = batch.some((c) => c.crit);
  const total = batch.reduce((sum, c) => sum + c.amount, 0);
  const { x, y } = batch[batch.length - 1];
  const id = ++fx.batch;

  fx.floaters.push({
    id, born: now, crit,
    text: crit ? `CRIT! +${fmt(total)}` : `+${fmt(total)}`,
    x: x + (Math.random() * 30 - 15), y: y - 10,
  });
  if (fx.floaters.length > MAX_FLOATERS) fx.floaters.shift();

  for (let i = 0; i < (crit ? 6 : 2); i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * (crit ? 70 : 40);
    fx.sparks.push({
      id, born: now, x, y,
      dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist,
      ch: SPARK_CHARS[Math.floor(Math.random() * SPARK_CHARS.length)],
    });
  }
  if (fx.sparks.length > MAX_SPARKS) fx.sparks.splice(0, fx.sparks.length - MAX_SPARKS);

  // Web Animations restart without forcing a layout of the (large) art <pre>.
  fx.bump?.cancel();
  fx.bump = $('#stage-art').animate(
    crit
      ? [{ transform: 'none' }, { transform: 'scale(1.05) rotate(-1deg)', offset: 0.3 }, { transform: 'scale(0.98) rotate(1deg)', offset: 0.6 }, { transform: 'none' }]
      : [{ transform: 'none' }, { transform: 'scale(0.97, 1.02)', offset: 0.5 }, { transform: 'none' }],
    { duration: crit ? 250 : 140, easing: 'ease-out' }
  );
  if (crit) {
    fx.flash?.cancel();
    fx.flash = $('#stage-flash').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: 'ease-out' });
  }
}

const easeOut = (p) => 1 - (1 - p) ** 3;

function drawClickFx(now) {
  fx.frame = 0;
  if (ui.tab !== 'home') return clearClickFx();

  const batch = fx.queue;
  fx.queue = [];
  if (batch.length) spawnClickFx(batch, now);

  const fade = Math.max(0, now - fx.lastClick - PAUSE_MS) / FADE_MS;
  const fadeOf = (p) => (p.id === fx.batch ? 1 : 1 - fade);
  const alive = (p, life) => now - p.born < life && fadeOf(p) > 0;
  fx.floaters = fx.floaters.filter((p) => alive(p, FLOATER_MS));
  fx.sparks = fx.sparks.filter((p) => alive(p, SPARK_MS));

  sizeFxCanvas();
  const ctx = fxCtx;
  ctx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  fxStyle ??= (() => {
    const css = getComputedStyle(document.documentElement);
    return {
      font: getComputedStyle(document.body).fontFamily,
      mono: css.getPropertyValue('--mono').trim() || 'monospace',
      gold: css.getPropertyValue('--gold').trim() || '#ffd166',
    };
  })();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Sparks fly outward and fade.
  ctx.font = `16px ${fxStyle.mono}`;
  ctx.fillStyle = '#ffe08a';
  for (const p of fx.sparks) {
    const t = easeOut((now - p.born) / SPARK_MS);
    ctx.globalAlpha = (1 - t) * fadeOf(p);
    ctx.fillText(p.ch, p.x + p.dx * t, p.y + p.dy * t);
  }

  // Floaters pop in, then rise and fade.
  for (const p of fx.floaters) {
    const t = easeOut((now - p.born) / FLOATER_MS);
    const size = p.crit ? 25.6 : 17.6;
    let alpha, rise, scale;
    if (t < 0.15) {
      const k = t / 0.15;
      [alpha, rise, scale] = [k, 0.3 + 0.3 * k, 0.7 + 0.4 * k];
    } else {
      const k = (t - 0.15) / 0.85;
      [alpha, rise, scale] = [1 - k, 0.6 + 2 * k, 1.1 - 0.1 * k];
    }
    ctx.globalAlpha = alpha * fadeOf(p);
    ctx.font = `800 ${size * scale}px ${fxStyle.font}`;
    ctx.shadowColor = p.crit ? 'rgba(255, 93, 143, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = p.crit ? 12 : 6;
    ctx.shadowOffsetY = p.crit ? 0 : 2;
    ctx.fillStyle = p.crit ? '#ff5d8f' : fxStyle.gold;
    ctx.fillText(p.text, p.x, p.y - (rise - 0.5) * size * 1.2);
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';

  if (fx.floaters.length || fx.sparks.length) fx.frame = requestAnimationFrame(drawClickFx);
}

// Cached so pointerdown never triggers a synchronous layout.
let stageRect = null;
const stageBox = () => (stageRect ??= $('#stage').getBoundingClientRect());
window.addEventListener('resize', () => (stageRect = null));
window.addEventListener('scroll', () => (stageRect = null), { passive: true });

$('#stage').addEventListener('pointerdown', (e) => {
  const rect = stageBox();
  clickStage(e.clientX - rect.left, e.clientY - rect.top, e.timeStamp);
});
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || ui.tab !== 'home' || !state) return;
  if (!$('#modal').classList.contains('hidden') || e.target.matches('input, textarea, button')) return;
  e.preventDefault();
  const rect = stageBox();
  clickStage(rect.width / 2 + (Math.random() * 80 - 40), rect.height / 2 + (Math.random() * 60 - 30), e.timeStamp);
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

// ------------------------------------------------------------------ collections

function card(item, { selected }) {
  const row = owned(item.id);
  const isChar = item.kind === 'character';
  const active = isChar ? state.player.character === item.id : state.player[item.kind] === item.id;
  return `
    <button class="card r${item.rarity} ${row ? 'owned' : 'locked'} ${selected ? 'selected' : ''}" data-id="${item.id}">
      ${active ? `<span class="tag badge">${isChar ? 'ACTIVE' : 'EQUIPPED'}</span>` : ''}
      <div class="card-art"><pre class="art ${isChar ? 'thumb' : 'thumb-equip'}">${renderArt(item, { silhouette: !row })}</pre></div>
      <div class="card-name">${row ? esc(item.name) : '???'}</div>
      <div class="stars r${item.rarity}">${stars(item.rarity)}</div>
      <div class="card-sub small">${row ? `Lv ${row.level}${row.ascension ? ` · A${row.ascension}` : ''}` : 'Not owned'}</div>
    </button>`;
}

function statRows(item, row) {
  const current = row ? row.stats : item.stats;
  const next = row?.nextStats;
  return Object.keys(item.stats)
    .map((key) => {
      const [label, show] = STAT_INFO[key];
      const nextVal = next && Math.abs(next[key] - current[key]) > 1e-9 ? ` <span class="up">→ ${show(next[key])}</span>` : '';
      return `<dt>${label}</dt><dd>${show(current[key])}${nextVal}</dd>`;
    })
    .join('');
}

function detail(item) {
  const row = owned(item.id);
  const isChar = item.kind === 'character';
  const banner = catalog.banners.find((b) => b.kind === item.kind);
  const sigChar = item.signature && items.get(item.signature);
  const extra = isChar
    ? `<p class="passive"><b>Passive</b> ${esc(item.passive)}</p><p class="quote">${esc(item.quote)}</p>`
    : `<p class="quote">${esc(item.desc)}</p>`;
  const sigNote = sigChar
    ? `<p class="small sig-note ${row?.signatureActive ? 'on' : ''}">✦ Signature gear for <b>${esc(sigChar.name)}</b>: +${catalog.config.signatureBonus * 100}% stats while ${esc(sigChar.name)} is active.</p>`
    : '';

  if (!row) {
    return `
      <div class="detail-art"><pre class="art">${renderArt(item, { silhouette: true })}</pre></div>
      <h2>??? <span class="stars r${item.rarity}">${stars(item.rarity)}</span></h2>
      <div class="muted">${KIND_LABEL[item.kind]} · not owned yet</div>
      <p>Summon it from the <b>${esc(banner.name)}</b> banner.</p>
      <dl class="stats">${statRows(item, null)}</dl>
      <button class="btn primary" data-go-banner="${banner.id}">Go to ${esc(banner.name)}</button>`;
  }

  const active = isChar ? state.player.character === item.id : state.player[item.kind] === item.id;
  const asc = row.ascendCost;
  const atCap = row.level >= row.maxLevel;
  const equipBtn = isChar
    ? active
      ? '<button class="btn" disabled>Active character</button>'
      : '<button class="btn primary" data-action="equip">Set as active</button>'
    : active
      ? '<button class="btn" data-action="unequip">Unequip</button>'
      : '<button class="btn primary" data-action="equip">Equip</button>';

  return `
    <div class="detail-art"><pre class="art">${renderArt(item)}</pre></div>
    <h2>${esc(item.name)} <span class="stars r${item.rarity}">${stars(item.rarity)}</span></h2>
    <div class="muted">${isChar ? esc(item.title) : KIND_LABEL[item.kind]}</div>
    ${extra}
    ${sigNote}
    <div class="level-line">Lv <b>${row.level}</b> / ${row.maxLevel} ${ascPips(row.ascension)}</div>
    <dl class="stats">${statRows(item, row)}</dl>
    <div class="actions">
      ${
        atCap
          ? '<button class="btn" disabled>Level cap reached</button>'
          : `<button class="btn gold" data-action="level" data-times="1" data-cost="${row.levelUpCost}">Level up · ◎ ${fmt(row.levelUpCost)}</button>
             <button class="btn gold" data-action="level" data-times="10" data-cost="${row.levelUpCost}" title="Levels up as many times as you can afford, up to 10">×10</button>`
      }
    </div>
    <div class="ascend-box">
      <div>Shards: <b>${row.shards}</b>${asc ? ` / ${asc.shards} needed` : ''}</div>
      ${
        asc
          ? `<button class="btn purple" data-action="ascend" data-cost="${asc.gold}" ${atCap && row.shards >= asc.shards ? '' : 'disabled'}>
               Ascend · ◎ ${fmt(asc.gold)}</button>
             <div class="muted small">${atCap ? '' : `Reach Lv ${row.maxLevel} to ascend. `}Ascending raises the level cap by 10 and boosts all stats by 25%.</div>`
          : '<div class="muted small">Fully ascended! Extra duplicates turn into gold.</div>'
      }
    </div>
    <div class="actions">
      ${equipBtn}
      <button class="btn ghost danger-text" data-action="salvage" ${active ? 'disabled title="Unequip first"' : ''}>Salvage · +◎ ${fmt(row.salvageValue)}</button>
    </div>`;
}

function bindDetail(el, item) {
  el.querySelector('[data-go-banner]')?.addEventListener('click', (e) => {
    ui.banner = e.currentTarget.dataset.goBanner;
    switchTab('gacha');
  });
  $$('[data-action]', el).forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = encodeURIComponent(item.id);
      const slot = item.kind;
      switch (btn.dataset.action) {
        case 'level':
          await act(() => api(`/api/items/${id}/level-up`, { method: 'POST', body: { times: Number(btn.dataset.times) } }));
          break;
        case 'ascend': {
          const res = await act(() => api(`/api/items/${id}/ascend`, { method: 'POST' }));
          if (res) toast(`${item.name} ascended! ✦`, 'good');
          break;
        }
        case 'equip': {
          const res = await act(() => api(`/api/loadout/${slot}`, { method: 'PUT', body: { itemId: item.id } }));
          if (res) toast(slot === 'character' ? `${item.name} is now your active character.` : `Equipped ${item.name}.`, 'good');
          break;
        }
        case 'unequip':
          await act(() => api(`/api/loadout/${slot}`, { method: 'PUT', body: { itemId: null } }));
          break;
        case 'salvage':
          confirmSalvage(item);
          break;
      }
    })
  );
}

function confirmSalvage(item) {
  const row = owned(item.id);
  const box = showModal(`
    <h2>Salvage ${esc(item.name)}?</h2>
    <p>It will be removed from your collection and you'll get <b>◎ ${fmt(row.salvageValue)}</b>.
       You can summon it again later, but its levels and shards will be gone.</p>
    <div class="actions">
      <button class="btn" data-close>Keep it</button>
      <button class="btn danger" id="do-salvage">Salvage</button>
    </div>`);
  box.querySelector('#do-salvage').addEventListener('click', async () => {
    closeModal();
    const res = await act(() => api(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' }));
    if (res) toast(`Salvaged for ◎ ${fmt(res.refund)}.`, 'good');
  });
}

function sortForGrid(list) {
  return [...list].sort((a, b) => !!owned(b.id) - !!owned(a.id) || b.rarity - a.rarity || a.name.localeCompare(b.name));
}

function renderCollection(list, gridSel, detailSel, selKey) {
  const sorted = sortForGrid(list);
  if (!sorted.some((i) => i.id === ui[selKey])) ui[selKey] = sorted[0]?.id;
  const grid = $(gridSel);
  grid.innerHTML = sorted.map((item) => card(item, { selected: item.id === ui[selKey] })).join('');
  $$('.card', grid).forEach((btn) =>
    btn.addEventListener('click', () => {
      ui[selKey] = btn.dataset.id;
      renderTab();
      if (window.matchMedia('(max-width: 860px)').matches) $(detailSel).scrollIntoView({ behavior: 'smooth' });
    })
  );
  const item = items.get(ui[selKey]);
  const el = $(detailSel);
  el.className = `panel detail r${item.rarity}`;
  el.innerHTML = detail(item);
  bindDetail(el, item);
}

function renderCharacters() {
  if (!ui.char) ui.char = state.player.character;
  renderCollection(catalog.characters, '#char-grid', '#char-detail', 'char');
}

function renderEquipment() {
  $$('#equip-filters button').forEach((b) => b.classList.toggle('active', b.dataset.kind === ui.equipKind));
  const list = catalog.equipment.filter((e) => e.kind === ui.equipKind);
  if (!list.some((i) => i.id === ui.equip)) ui.equip = state.player[ui.equipKind] || null;
  renderCollection(list, '#equip-grid', '#equip-detail', 'equip');
}
$$('#equip-filters button').forEach((b) =>
  b.addEventListener('click', () => {
    ui.equipKind = b.dataset.kind;
    ui.equip = null;
    renderEquipment();
  })
);

// ------------------------------------------------------------------ gacha

function renderGacha() {
  const cfg = catalog.config;
  $('#banner-list').innerHTML = catalog.banners
    .map((b) => {
      const feat = items.get(b.featured[0]);
      return `
        <button class="banner-tab ${b.id === ui.banner ? 'active' : ''}" data-banner="${b.id}">
          <span class="banner-kind">${KIND_LABEL[b.kind]}</span>
          <span class="banner-name">${esc(b.name)}</span>
          <span class="small muted">Featuring ${esc(feat.name.split(',')[0])}</span>
        </button>`;
    })
    .join('');
  $$('#banner-list .banner-tab').forEach((btn) =>
    btn.addEventListener('click', () => {
      ui.banner = btn.dataset.banner;
      renderGacha();
    })
  );

  const b = catalog.banners.find((x) => x.id === ui.banner);
  const pity = state.pity[b.id] || { since5: 0, since4: 0, total: 0 };
  const pool = [...items.values()].filter((i) => i.kind === b.kind).sort((x, y) => y.rarity - x.rarity);
  const rate3 = 1 - cfg.rates[5] - cfg.rates[4];
  const left5 = cfg.pity5 - pity.since5;
  const left4 = cfg.pity4 - pity.since4;

  $('#banner-view').innerHTML = `
    <div class="banner-hero">
      <div class="featured">
        ${b.featured
          .map((id) => {
            const f = items.get(id);
            return `<figure><pre class="art ${f.kind === 'character' ? 'feature-art' : 'feature-equip'}">${renderArt(f)}</pre>
                    <figcaption><span class="stars r5">${stars(5)}</span> ${esc(f.name)}</figcaption></figure>`;
          })
          .join('')}
      </div>
      <div class="banner-info">
        <h2>${esc(b.name)}</h2>
        <p class="muted">${esc(b.desc)}</p>
        <table class="rate-table">
          <tr><td class="stars r5">${stars(5)}</td><td>${pct(cfg.rates[5])}</td><td class="muted small">guaranteed within ${cfg.pity5} summons</td></tr>
          <tr><td class="stars r4">${stars(4)}</td><td>${pct(cfg.rates[4])}</td><td class="muted small">4★ or higher every ${cfg.pity4} summons</td></tr>
          <tr><td class="stars r3">${stars(3)}</td><td>${pct(rate3)}</td><td></td></tr>
        </table>
        <div class="pity">
          <div class="pity-label"><span>5★ pity</span><span><b>${left5}</b> summons to guaranteed</span></div>
          <div class="bar"><div style="width:${(pity.since5 / cfg.pity5) * 100}%"></div></div>
          <div class="pity-label"><span>4★ pity</span><span><b>${left4}</b> to guaranteed</span></div>
          <div class="bar four"><div style="width:${(pity.since4 / cfg.pity4) * 100}%"></div></div>
        </div>
        <div class="actions pull-actions">
          <button class="btn primary big" data-pull="1" data-cost="${b.cost}">Summon ×1<br><small>◎ ${fmt(b.cost)}</small></button>
          <button class="btn gold big" data-pull="10" data-cost="${b.cost * 10}">Summon ×10<br><small>◎ ${fmt(b.cost * 10)}</small></button>
        </div>
        <p class="muted small">Total summons on this banner: ${pity.total}</p>
      </div>
    </div>
    <details class="pool">
      <summary>Banner pool (${pool.length} items)</summary>
      <ul>${pool
        .map((i) => `<li><span class="stars r${i.rarity}">${stars(i.rarity)}</span> ${esc(i.name)} ${owned(i.id) ? '<span class="tag">OWNED</span>' : ''}</li>`)
        .join('')}</ul>
    </details>`;
  $$('[data-pull]', $('#banner-view')).forEach((btn) =>
    btn.addEventListener('click', () => doPull(Number(btn.dataset.pull)))
  );
  loadHistory();
}

async function loadHistory() {
  const { history } = await api('/api/gacha/history').catch(() => ({ history: [] }));
  const label = { new: 'NEW', shard: '+1 shard', refund: 'gold' };
  $('#history').innerHTML = history.length
    ? history
        .slice(0, 20)
        .map((h) => {
          const item = items.get(h.item_id);
          const when = new Date(h.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          return `<li><span class="stars r${h.rarity}">${stars(h.rarity)}</span>
            <span class="r${h.rarity}-text">${esc(item?.name ?? h.item_id)}</span>
            <span class="tag ${h.outcome}">${label[h.outcome]}</span>
            <span class="muted small">${when}</span></li>`;
        })
        .join('')
    : '<li class="muted">No summons yet. Good luck!</li>';
}

async function doPull(count) {
  const res = await act(() => api(`/api/gacha/${ui.banner}/pull`, { method: 'POST', body: { count } }));
  if (res) showPullResults(res.results, count);
}

function showPullResults(results, count) {
  const best = Math.max(...results.map((r) => r.rarity));
  const b = catalog.banners.find((x) => x.id === ui.banner);
  const box = showModal(`
    <div class="pull-results best-${best}">
      <h2>Summon results</h2>
      <div class="result-grid ${results.length === 1 ? 'single' : ''}">
        ${results
          .map((r, i) => {
            const item = items.get(r.itemId);
            const note =
              r.outcome === 'new' ? '<span class="tag new">NEW!</span>'
              : r.outcome === 'shard' ? '<span class="tag shard">+1 shard</span>'
              : `<span class="tag refund">+◎ ${fmt(r.refund)}</span>`;
            return `
              <div class="result r${r.rarity}" style="--i:${i}">
                <div class="result-inner">
                  <div class="result-back">✿</div>
                  <div class="result-front">
                    <pre class="art ${item.kind === 'character' ? (results.length === 1 ? 'feature-art' : 'thumb') : 'thumb-equip'}">${renderArt(item)}</pre>
                    <div class="card-name">${esc(item.name)}</div>
                    <div class="stars r${r.rarity}">${stars(r.rarity)}</div>
                    ${note}
                  </div>
                </div>
              </div>`;
          })
          .join('')}
      </div>
      <div class="actions">
        <button class="btn" data-close>Close</button>
        <button class="btn gold" id="pull-again" data-cost="${b.cost * count}">Summon ×${count} again · ◎ ${fmt(b.cost * count)}</button>
      </div>
    </div>`);
  requestAnimationFrame(() => box.querySelector('.pull-results').classList.add('reveal'));
  box.querySelector('#pull-again').addEventListener('click', () => {
    closeModal();
    doPull(count);
  });
}

// ------------------------------------------------------------------ ranking & profile

async function renderRanking() {
  const table = $('#leaderboard');
  table.innerHTML = '<tr><td class="muted">Loading…</td></tr>';
  try {
    const { leaderboard } = await api('/api/leaderboard');
    table.innerHTML = `
      <thead><tr><th>#</th><th>Adventurer</th><th>Partner</th><th>Lifetime gold</th><th>Summons</th></tr></thead>
      <tbody>${leaderboard
        .map((r, i) => {
          const c = items.get(r.active_character);
          const me = user && r.username.toLowerCase() === user.username.toLowerCase();
          return `<tr class="${me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.username)}</td>
            <td class="r${c?.rarity}-text">${esc(c?.name ?? '?')}</td><td>◎ ${fmt(r.total_earned)}</td><td>${r.total_pulls}</td></tr>`;
        })
        .join('')}</tbody>`;
  } catch (err) {
    table.innerHTML = `<tr><td class="error">${esc(err.message)}</td></tr>`;
  }
}

function renderProfile() {
  const p = state.player;
  const chars = state.inventory.filter((r) => items.get(r.itemId).kind === 'character').length;
  const gear = state.inventory.length - chars;
  $('#profile-stats').innerHTML = [
    ['Username', esc(user.username)],
    ['Joined', new Date(user.createdAt).toLocaleDateString()],
    ['Lifetime gold', `◎ ${fmt(p.totalEarned)}`],
    ['Total clicks', p.totalClicks.toLocaleString()],
    ['Total summons', p.totalPulls.toLocaleString()],
    ['Characters', `${chars} / ${catalog.characters.length}`],
    ['Equipment', `${gear} / ${catalog.equipment.length}`],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');
}

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/auth/password', {
      method: 'PUT',
      body: { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value },
    });
    f.reset();
    toast('Password updated.', 'good');
  } catch (err) {
    toast(err.message, 'error');
  }
});

$('#delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (!f.confirm.checked) return toast('Tick the confirmation box first.', 'error');
  try {
    await api('/api/auth/account', { method: 'DELETE', body: { password: f.password.value } });
    f.reset();
    handleLoggedOut();
    toast('Account deleted. Sayonara!', 'info');
  } catch (err) {
    toast(err.message, 'error');
  }
});

// ------------------------------------------------------------------ petals & boot

function spawnPetals() {
  const layer = $('#petals');
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span');
    p.textContent = Math.random() < 0.7 ? '✿' : '❀';
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDuration = `${12 + Math.random() * 14}s`;
    p.style.animationDelay = `${-Math.random() * 20}s`;
    p.style.fontSize = `${10 + Math.random() * 12}px`;
    layer.append(p);
  }
}

async function boot() {
  spawnPetals();
  catalog = await api('/api/catalog');
  items = new Map([...catalog.characters, ...catalog.equipment].map((i) => [i.id, i]));
  try {
    ({ user } = await api('/api/auth/me'));
    await enterGame();
  } catch {
    user = null;
    showAuth();
  }
}

boot();
