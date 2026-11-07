'use strict';
/*
 * Tung Tung Arcade server
 *  - static file hosting for the site
 *  - accounts (username + 4-digit PIN + profile picture)
 *  - WebSocket: presence, challenges, live matches, win/loss records
 * Run:  npm install && npm start
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { promisify } = require('util');
const { WebSocketServer } = require('ws');
const Sprouts = require('./games/sprouts/rules.js');
const Pool = require('./games/pool/pool.js');
const Imposter = require('./games/imposter/engine.js');
const IMP_WORDS = Object.keys(require('./games/imposter/words.js'));

const scrypt = promisify(crypto.scrypt);
const TB = { // turn-based games whose rules run on the server (see games/<id>/rules.js)
  chess: require('./games/chess/rules.js'),
  uttt: require('./games/uttt/rules.js'),
  boxes: require('./games/boxes/rules.js'),
  battleship: require('./games/battleship/rules.js'),
  hangman: require('./games/hangman/rules.js'),
  go: require('./games/go/rules.js'),
};
const PicWords = require('./games/pictionary/words.js');
const Shop = require('./assets/shop-items.js'); // the tung shop: the items, and which six are for sale today
const GOLF_COURSES = ['meadow', 'neon'];
const GOLF_HOLES = 6, GOLF_MAXSTROKES = 8;

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 3000;

// ---------- Config ----------
const AVATARS = ['🥁', '🪵', '🏏', '🐍', '💣', '🦆', '🐸', '🦊', '🐼', '🐙', '🦄', '🐲', '🌙', '⭐', '🔥', '👾'];
const LEVELS = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
};
const F1_TRACKS = ['speedway', 'chicane', 'hairpin', 'serpent', 'circuit', 'gauntlet'];
const TU_MAPS = ['junkyard', 'construction', 'frost', 'neon', 'volcano', 'clouds'];
const TU_MAX = 4, TU_CAP_MS = 8 * 60 * 1000;
const F1_CHECKPOINTS = 8; // gates per lap, the same on every track
const GAMES = {
  snake: { title: 'Tung Snake', icon: '🐍', progressLabel: 'Score', judge: 'score' },
  minesweeper: {
    title: 'Tung Minesweeper',
    icon: '💣',
    progressLabel: 'Cleared',
    options: { level: { label: 'Difficulty', values: Object.keys(LEVELS), default: 'easy' } },
  },
  sprouts: {
    title: 'Tung Sprouts',
    icon: '🌱',
    progressLabel: 'Moves',
    soloWL: true,
    options: {
      dots: { label: 'Starting dots', values: [2, 3, 4, 5, 6], default: 3 },
      mode: { label: 'Mode', values: ['normal', 'misere'], default: 'normal' },
    },
  },
  imposter: { title: 'The Imposter', icon: '🕵️', progressLabel: 'Score', rooms: true, soloWL: true },
  pool: { title: 'Tung Pool', icon: '🎱', progressLabel: 'Balls potted', soloWL: true },
  slope: { title: 'Tung Slope', icon: '🛷', progressLabel: 'Distance', judge: 'score' },
  brainrot: { title: 'Brainrot Merge', icon: '🧠', progressLabel: 'Score', judge: 'score' },
  clicker: { title: 'Tung Clicker', icon: '🖱️', soloOnly: true },
  battleship: {
    title: 'Tung Battleship', icon: '🚢', progressLabel: 'Hits', turnBased: true, soloWL: true,
    options: { rule: { label: 'Rules', values: ['classic', 'streak'], default: 'classic' } },
  },
  chess: {
    title: 'Tung Tung Chess', icon: '♟️', progressLabel: 'Captured', turnBased: true, soloWL: true,
    options: { variant: { label: 'Variant', values: ['standard', 'crazyhouse'], default: 'standard' } },
  },
  boxes: {
    title: 'Tung Dots & Boxes', icon: '🔲', progressLabel: 'Boxes', turnBased: true, soloWL: true,
    options: { size: { label: 'Board (boxes per side)', values: [3, 4, 5, 6], default: 4 } },
  },
  uttt: { title: 'Tung Super Tic-Tac-Toe', icon: '❌', progressLabel: 'Boards won', turnBased: true, soloWL: true },
  hangman: {
    title: 'Tung Hangman', icon: '🪢', progressLabel: 'Wrong guesses', turnBased: true, soloWL: true,
    options: { chances: { label: 'Wrong guesses allowed', values: [6, 8, 10], default: 8 } },
  },
  flappy: { title: 'Flappy Tung', icon: '🪵', progressLabel: 'Pipes', judge: 'score' },
  whack: { title: 'Whack-a-Tung', icon: '🔨', progressLabel: 'Score', judge: 'score' },
  basketball: {
    title: 'Tung 2x2 Basketball', icon: '🏀', progressLabel: 'Points', judge: 'score', realtime: true, soloWL: true,
    options: { length: { label: 'Game length (seconds)', values: [60, 120, 180], default: 120 } },
  },
  f1: {
    title: 'Tung F1 Racing', icon: '🏎️', progressLabel: 'Checkpoints', judge: 'race', realtime: true,
    options: {
      level: { label: 'Track', values: F1_TRACKS, default: 'speedway' },
      laps: { label: 'Laps', values: [2, 3, 5], default: 3 },
    },
  },
  tungup: {
    title: 'Tung Up!', icon: '🧗', progressLabel: 'Height %', judge: 'race', realtime: true, rooms: true, challenge: true,
    options: {
      level: { label: 'Map', values: TU_MAPS, default: 'junkyard' },
      chaos: { label: 'Chaos', values: ['off', 'normal', 'wild'], default: 'normal' },
    },
  },
  airhockey: {
    title: 'Tung Tung Air Hockey', icon: '🏒', progressLabel: 'Goals', judge: 'score', realtime: true, soloWL: true,
    options: { goals: { label: 'First to (goals)', values: [5, 7, 10], default: 7 } },
  },
  go: {
    title: 'Tung Tung Go', icon: '⚫', progressLabel: 'Captures', turnBased: true, soloWL: true,
    options: { size: { label: 'Board', values: [9, 13, 19], default: 9 } },
  },
  bomber: {
    title: 'Tung Bomber Arena', icon: '💣', progressLabel: 'Rounds won', judge: 'score', realtime: true, soloWL: true, groomMax: 4,
    options: { rounds: { label: 'Rounds to win', values: [1, 2, 3], default: 2 } },
  },
  sumo: {
    title: 'Tung Tung Sumo', icon: '🤼', progressLabel: 'Rounds won', judge: 'score', realtime: true, soloWL: true, groomMax: 4,
    options: { rounds: { label: 'Rounds to win', values: [2, 3, 5], default: 3 } },
  },
  golf: {
    title: 'Tung Tung Mini Golf', icon: '⛳', progressLabel: 'Strokes', judge: 'low', realtime: true,
    options: { level: { label: 'Course', values: GOLF_COURSES, default: 'meadow' } },
  },
  archery: {
    title: 'Tung Tung Archery', icon: '🏹', progressLabel: 'Points', judge: 'score', realtime: true,
    options: {
      arrows: { label: 'Arrows each', values: [5, 10, 15], default: 10 },
      wind: { label: 'Wind', values: ['calm', 'breezy', 'gusty'], default: 'breezy' },
    },
  },
  cuppong: {
    title: 'Tung Tung Cup Pong', icon: '🥤', progressLabel: 'Cups sunk', judge: 'score', realtime: true, soloWL: true,
    options: { cups: { label: 'Cups each', values: [6, 10], default: 6 } },
  },
  // played on their own pages with their own lobbies (Socket.IO, see realtime/); only their online wins and losses are kept here
  boxing: { title: 'Tung Boxing', icon: '🥊', progressLabel: 'Wins', external: true },
  dizzy: { title: 'Dizzy Tungs', icon: '🌀', progressLabel: 'Wins', external: true },
  pictionary: { title: 'Tung Tung Pictionary', icon: '🎨', progressLabel: 'Points', rooms: true, picRooms: true },
  paper: {
    title: 'Tung Paper.io', icon: '📄', progressLabel: 'Peak land', judge: 'score', realtime: true,
    options: {
      time: { label: 'Round length (seconds)', values: [60, 120, 180], default: 120 },
      bots: { label: 'Computer players', values: [0, 2, 4], default: 2 },
    },
  },
};
const SNAKE_GRID = 20;
// Highest score a player can honestly have after `ms` of a match (stops obvious cheating).
const SCORE_CAP = {
  snake: (ms) => Math.min(SNAKE_GRID * SNAKE_GRID, Math.floor(ms / 50) + 2),
  slope: (ms) => Math.floor((ms / 1000) * 45) + 40,
  brainrot: (ms) => Math.floor(ms / 1000) * 220 + 400,
  flappy: (ms) => Math.floor(ms / 1100) + 3,
  whack: (ms) => Math.floor(ms / 1000) * 130 + 120,
  basketball: (ms) => Math.floor(ms / 2200) * 3 + 8,
  paper: (ms) => Math.min(1000, Math.floor(ms / 1000) * 30 + 40),
  airhockey: (ms) => Math.floor(ms / 2200) + 2,
  bomber: (ms) => Math.floor(ms / 25000) + 1,
  sumo: (ms) => Math.floor(ms / 8000) + 1,
  archery: (ms) => (Math.floor(ms / 900) + 2) * 10,
  cuppong: (ms) => Math.min(10, Math.floor(ms / 1200) + 2),
};
const SOLO_MAX = { snake: SNAKE_GRID * SNAKE_GRID, slope: 99999, brainrot: 999999, flappy: 999, whack: 9999, paper: 1000, archery: 150 };
const isAuth = (g) => g === 'sprouts' || g === 'pool' || !!GAMES[g].turnBased; // server decides these, clients do not report scores

const TURN_MS = 120 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const SESSION_MS = 24 * 3600 * 1000;
const CHALLENGE_MS = 45 * 1000;
const JOIN_MS = 30 * 1000;
const COUNTDOWN_MS = 3000;
const MATCH_CAP_MS = 15 * 60 * 1000;
const DISCONNECT_GRACE_MS = 10 * 1000;
const PRESENCE_GRACE_MS = 4 * 1000;

// ---------- Tiny helpers ----------
const httpErr = (status, message) => Object.assign(new Error(message), { status });

fs.mkdirSync(AVATAR_DIR, { recursive: true });

// ---------- Database (JSON file, atomic writes) ----------
let db = { users: {} };
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  if (!db.users) db.users = {};
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.error('Could not read data/db.json:', e.message);
    process.exit(1);
  }
}
let saveTimer = null;

// ---------- Optional Supabase storage ----------
// With SUPABASE_URL and SUPABASE_SERVICE_KEY set, the accounts are also kept in a Supabase table (arcade_state), so a host
// that wipes its disk on restart (a free Render instance) loses nothing: the server reloads them when it starts.
// Without them everything stays in data/ as before. The service key stays on the server, in the host's environment settings.
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const REMOTE = !!(SB_URL && SB_KEY);
async function sb(query, opts = {}) {
  const r = await fetch(SB_URL + '/rest/v1/arcade_state' + query, {
    ...opts,
    // a new-style key (sb_secret_...) goes in apikey only; an old-style service_role key is a JWT and also goes in Authorization
    headers: { apikey: SB_KEY, ...(SB_KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + SB_KEY } : {}), 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error('Supabase answered ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r;
}
const sbPut = (key, value) => sb('?on_conflict=key', {
  method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
});
async function loadRemote() {
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const rows = await (await sb('?key=eq.db&select=value')).json();
      if (rows.length) {
        db = rows[0].value || { users: {} };
        if (!db.users) db.users = {};
        console.log('   Loaded', Object.keys(db.users).length, 'accounts from Supabase');
      } else {
        await sbPut('db', db); // first run: start the table from whatever the local file held
        console.log('   Supabase was empty: saved the local accounts there');
      }
      const avs = await (await sb('?key=like.avatar:*&select=key,value')).json();
      for (const a of avs) fs.writeFileSync(path.join(AVATAR_DIR, a.key.slice(7) + '.jpg'), Buffer.from(a.value, 'base64'));
      return;
    } catch (e) {
      lastErr = e; console.error('Supabase load failed (try ' + attempt + '):', e.message);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  // never start empty and then overwrite the stored accounts with nothing
  console.error('Could not reach Supabase, so the server will not start:', lastErr && lastErr.message);
  process.exit(1);
}
let pushChain = Promise.resolve(), pushDirty = false, pushTimer = null;
function pushDb() {
  if (!REMOTE) return pushChain;
  pushDirty = true;
  pushChain = pushChain.then(async () => {
    if (!pushDirty) return;
    pushDirty = false;
    try { await sbPut('db', db); } catch (e) { pushDirty = true; console.error('Could not save to Supabase (will retry):', e.message); }
  });
  return pushChain;
}
function schedulePush() {
  if (!REMOTE || pushTimer) return;
  pushTimer = setTimeout(() => { pushTimer = null; pushDb(); }, 1500);
}

function flushDb() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
  schedulePush();
}
function saveDb() {
  if (saveTimer) return;
  saveTimer = setTimeout(flushDb, 200);
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try {
      flushDb();
      if (REMOTE) {
        if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
        await Promise.race([pushDb(), new Promise((r) => setTimeout(r, 4000))]);
      }
    } catch (_) {}
    process.exit(0);
  });
}

function avatarOf(u) {
  return u.avatar.type === 'emoji' ? 'emoji:' + u.avatar.value : '/avatars/' + u.key + '.jpg?v=' + u.avatar.v;
}
const publicUser = (u) => ({ id: u.key, username: u.username, avatar: avatarOf(u) });
const emptyStats = () => ({ w: 0, l: 0, d: 0 });
function statsFor(u, game) {
  if (game === 'all') {
    const t = emptyStats();
    for (const g of Object.keys(GAMES)) {
      const s = (u.stats && u.stats[g]) || emptyStats();
      t.w += s.w; t.l += s.l; t.d += s.d;
    }
    return t;
  }
  return (u.stats && u.stats[game]) || emptyStats();
}
function recordResult(key, game, res) {
  const u = db.users[key];
  if (!u) return;
  u.stats = u.stats || {};
  u.stats[game] = u.stats[game] || emptyStats();
  u.stats[game][res]++;
}

// ---------- Sessions & rate limiting ----------
const sessions = new Map(); // token -> {key, exp}
function newSession(key) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { key, exp: Date.now() + SESSION_MS });
  return token;
}
function sessionKey(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) { sessions.delete(token); return null; }
  return db.users[s.key] && !db.users[s.key].removed ? s.key : null;
}
const buckets = new Map();
function rateLimit(ip, name, max, windowMs) {
  const k = name + '|' + ip;
  const now = Date.now();
  const arr = (buckets.get(k) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw httpErr(429, 'Too many requests. Slow down and try again soon.');
  arr.push(now);
  buckets.set(k, arr);
}
setInterval(() => {
  const now = Date.now();
  for (const [t, s] of sessions) if (s.exp < now) sessions.delete(t);
  for (const [k, arr] of buckets) if (!arr.some((t) => now - t < 3600e3)) buckets.delete(k);
}, 10 * 60 * 1000).unref();

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const ROOT_FILES = new Set(['index.html', 'styles.css', 'app.js', 'mp.js', 'mp.css', 'home.css', 'favicon.svg', 'share.jpg', 'arena.html', 'arena.js', 'arena.css']);
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'sha256-tLacyvDXM7iOBdrKicHZHGDOpIjXw5dTwO25l/lTFaI=' 'sha256-1bYHHe3SE5ji7T/2HhIPPaOd3hoICy83QpaTDL+iRYk='; connect-src 'self' ws: wss:; frame-ancestors 'none'";

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

function readJson(req, limit = 200 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpErr(413, 'Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(httpErr(400, 'Bad JSON')); }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

function saveImageAvatar(key, dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw httpErr(400, 'Photo must be a JPEG');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 80 * 1024) throw httpErr(413, 'Photo is too large');
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw httpErr(400, 'Photo must be a JPEG');
  fs.writeFileSync(path.join(AVATAR_DIR, key + '.jpg'), buf);
  if (REMOTE) sbPut('avatar:' + key, buf.toString('base64')).catch((e) => console.error('Could not save the avatar to Supabase:', e.message));
}

const DUMMY_SALT = crypto.randomBytes(16);

// Behind a host's proxy (Render, Caddy, nginx) every request arrives from the proxy's own address, so the visitor's
// address comes from X-Forwarded-For. It is only believed when the connection itself came from a private or loopback
// address, so a visitor connecting directly cannot invent one. The rate limits below are per visitor address.
function clientIp(req) {
  const peer = (req.socket.remoteAddress || '?').replace(/^::ffff:/, '');
  const fromProxy = peer === '::1' || peer === '127.0.0.1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd)/i.test(peer);
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fromProxy && fwd ? fwd.slice(0, 64) : peer;
}

// ---------- Tung shop: one tung buck for every multiplayer win, spent on cosmetics for the arena ----------
// The balance is worked out, never stored: every multiplayer win ever recorded, less what the player has spent.
function shopOf(u) { return u.shop || (u.shop = { owned: [], equipped: {}, spent: 0 }); }
function shopState(u) {
  const sh = u.shop || { owned: [], equipped: {}, spent: 0 }, wins = statsFor(u, 'all').w, bonus = sh.bonus || 0;
  return { wins, bonus, spent: sh.spent, balance: wins + bonus - sh.spent, owned: sh.owned, equipped: sh.equipped, today: Shop.offerFor(Shop.todayStr()), resetsIn: Shop.msUntilReset() };
}
// what a tung wears, as the numbers the arena sends (the item's place in the list + 1, 0 for nothing)
function gearOf(u) { const eq = (u.shop && u.shop.equipped) || {}; return Shop.SLOTS.map((slot) => (eq[slot] && Shop.byId[eq[slot]] ? Shop.byId[eq[slot]].n : 0)); }

// ---------- Admins: these accounts can remove users ----------
// Names are not secret and anyone could sign up as one if it is still free, so create these accounts first.
// Change who is an admin with the ADMIN_USERS setting on the host (names separated by commas).
const ADMINS = new Set((process.env.ADMIN_USERS || 'JackP,pb3tung').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean));
const isAdmin = (key) => ADMINS.has(key);
const liveUsers = () => Object.values(db.users).filter((u) => !u.removed);
// A removed account stops working at once (no login, no sessions, off the boards, kicked from games and the arena) and is
// deleted for good a few minutes later, once anything still winding down has finished with it.
function removeUser(key) {
  const u = db.users[key];
  if (!u || u.removed) return false;
  u.removed = Date.now();
  arenaLeave(key, false);
  const o = online.get(key);
  if (o) for (const ws of [...o.socks]) { try { wsSend(ws, { t: 'removed' }); setTimeout(() => ws.terminate(), 150); } catch (_) {} }
  for (const [t, s] of sessions) if (s.key === key) sessions.delete(t);
  saveDb(); sdDirty = true; schedulePresence();
  console.log('User removed by an admin:', u.username);
  return true;
}
function purgeRemoved() {
  const now = Date.now();
  for (const [key, u] of Object.entries(db.users)) {
    if (!u.removed || now - u.removed < (Number(process.env.REMOVE_PURGE_MS) || 3 * 60 * 1000)) continue;
    if (online.has(key) || userMatch.has(key) || userRoom.has(key) || arenaPlayers.has(key)) continue; // still winding down
    delete db.users[key];
    try { fs.unlinkSync(path.join(AVATAR_DIR, key + '.jpg')); } catch (_) {}
    if (REMOTE) sb('?key=eq.' + encodeURIComponent('avatar:' + key), { method: 'DELETE' }).catch(() => {});
    saveDb();
  }
}
setInterval(purgeRemoved, 30 * 1000).unref();

async function handleApi(req, res, url) {
  const ip = clientIp(req);
  const route = req.method + ' ' + url.pathname;

  switch (route) {
    case 'GET /api/config':
      return json(res, 200, { avatars: AVATARS, games: GAMES });

    case 'POST /api/signup': {
      rateLimit(ip, 'signup', 10, 3600e3);
      const b = await readJson(req);
      const username = String(b.username || '').trim();
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw httpErr(400, 'Username must be 3-16 letters, numbers or underscores');
      const key = username.toLowerCase();
      if (db.users[key]) throw httpErr(409, 'That username is taken');
      const pin = String(b.pin || '');
      if (!/^\d{4}$/.test(pin)) throw httpErr(400, 'PIN must be exactly 4 digits');
      const av = b.avatar || {};
      if (av.type === 'emoji' ? !AVATARS.includes(av.value) : av.type !== 'image') throw httpErr(400, 'Pick a profile picture');
      const salt = crypto.randomBytes(16);
      const hash = await scrypt(pin, salt, 32);
      if (db.users[key]) throw httpErr(409, 'That username is taken');
      let avatar;
      if (av.type === 'emoji') avatar = { type: 'emoji', value: av.value };
      else { saveImageAvatar(key, av.data); avatar = { type: 'image', v: Date.now() }; }
      db.users[key] = {
        key, username, salt: salt.toString('hex'), hash: hash.toString('hex'),
        avatar, createdAt: Date.now(), stats: {}, fails: 0, lockUntil: 0,
      };
      saveDb();
      return json(res, 201, { token: newSession(key), user: publicUser(db.users[key]) });
    }

    case 'POST /api/login': {
      rateLimit(ip, 'login', 40, 10 * 60e3);
      const b = await readJson(req);
      let u = db.users[String(b.username || '').trim().toLowerCase()];
      if (u && u.removed) u = null;
      const pin = String(b.pin || '');
      if (!u) {
        await scrypt(pin, DUMMY_SALT, 32);
        throw httpErr(401, 'Wrong username or PIN');
      }
      const now = Date.now();
      const lockMsg = () => `Too many wrong PINs. Try again in ${Math.max(1, Math.ceil((u.lockUntil - Date.now()) / 60000))} min.`;
      if (u.lockUntil > now) throw httpErr(429, lockMsg());
      // Count the attempt up-front so parallel guesses can't dodge the lock.
      u.fails = (u.fails || 0) + 1;
      if (u.fails > MAX_FAILS) {
        u.fails = 0; u.lockUntil = now + LOCK_MS; saveDb();
        throw httpErr(429, lockMsg());
      }
      const hash = await scrypt(pin, Buffer.from(u.salt, 'hex'), 32);
      const ok = /^\d{4}$/.test(pin) && crypto.timingSafeEqual(hash, Buffer.from(u.hash, 'hex'));
      if (!ok) {
        if (u.fails >= MAX_FAILS) {
          u.fails = 0; u.lockUntil = Date.now() + LOCK_MS; saveDb();
          throw httpErr(429, 'Too many wrong PINs. This account is locked for 5 minutes.');
        }
        saveDb();
        throw httpErr(401, `Wrong username or PIN (${MAX_FAILS - u.fails} tries left before a 5-minute lock)`);
      }
      u.fails = 0; saveDb();
      return json(res, 200, { token: newSession(u.key), user: publicUser(u) });
    }

    case 'POST /api/logout': {
      const token = bearer(req);
      if (token) {
        sessions.delete(token);
        for (const ws of wss.clients) if (ws.token === token) ws.close(4002, 'logged out');
      }
      return json(res, 200, { ok: true });
    }

    case 'GET /api/leaderboard': {
      const game = url.searchParams.get('game') || 'all';
      if (game !== 'all' && !GAMES[game]) throw httpErr(400, 'Unknown game');
      const rows = liveUsers().map((u) => {
        const s = statsFor(u, game);
        return { ...publicUser(u), wins: s.w, losses: s.l, draws: s.d };
      });
      rows.sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.username.localeCompare(b.username));
      return json(res, 200, { game, rows });
    }

    case 'POST /api/solo': {
      // Single-player personal bests (separate from multiplayer win/loss records).
      rateLimit(ip, 'solo', 120, 3600e3);
      const key = sessionKey(bearer(req) || '');
      if (!key) throw httpErr(401, 'Log in to save solo scores');
      const b = await readJson(req, 2048);
      const u = db.users[key];
      u.solo = u.solo || {};
      if (SOLO_MAX[b.game]) {
        const score = Math.floor(Number(b.score));
        if (!Number.isFinite(score) || score < 1 || score > SOLO_MAX[b.game]) throw httpErr(400, 'Bad score');
        if (!(u.solo[b.game] >= score)) { u.solo[b.game] = score; saveDb(); }
        return json(res, 200, { ok: true, best: u.solo[b.game] });
      }
      if (b.game === 'golf') {
        const strokes = Math.floor(Number(b.strokes));
        if (!GOLF_COURSES.includes(b.level) || !Number.isFinite(strokes) || strokes < GOLF_HOLES || strokes > GOLF_HOLES * GOLF_MAXSTROKES) throw httpErr(400, 'Bad score');
        u.solo.golf = u.solo.golf || {};
        const cur = u.solo.golf[b.level];
        if (!(cur <= strokes)) { u.solo.golf[b.level] = strokes; saveDb(); }
        return json(res, 200, { ok: true, best: u.solo.golf[b.level] });
      }
      if (b.game === 'minesweeper' || b.game === 'f1' || b.game === 'tungup') {
        const time = Math.floor(Number(b.time));
        const okLevel = b.game === 'f1' ? F1_TRACKS.includes(b.level) : b.game === 'tungup' ? TU_MAPS.includes(b.level) : !!LEVELS[b.level];
        const ms = b.game !== 'minesweeper';
        const lo = b.game === 'tungup' ? 20000 : b.game === 'f1' ? 15000 : 1, hi = b.game === 'tungup' ? 3600000 : b.game === 'f1' ? 900000 : 99999; // f1 and tungup times are milliseconds
        void ms;
        if (!okLevel || !Number.isFinite(time) || time < lo || time > hi) throw httpErr(400, 'Bad time');
        u.solo[b.game] = u.solo[b.game] || {};
        const cur = u.solo[b.game][b.level];
        if (!(cur <= time)) { u.solo[b.game][b.level] = time; saveDb(); }
        return json(res, 200, { ok: true, best: u.solo[b.game][b.level] });
      }
      if (GAMES[b.game] && GAMES[b.game].soloWL) {
        // Wins/losses against the computer.
        if (b.result !== 'win' && b.result !== 'loss') throw httpErr(400, 'Bad result');
        const rec = (u.solo[b.game] = u.solo[b.game] || { w: 0, l: 0 });
        rec[b.result === 'win' ? 'w' : 'l']++;
        saveDb();
        return json(res, 200, { ok: true, ...rec });
      }
      throw httpErr(400, 'Unknown game');
    }

    case 'GET /api/solo-leaderboard': {
      const game = url.searchParams.get('game');
      const level = url.searchParams.get('level') || 'easy';
      if (!GAMES[game]) throw httpErr(400, 'Unknown game');
      if (game === 'minesweeper' && !LEVELS[level]) throw httpErr(400, 'Unknown level');
      if (game === 'f1' && !F1_TRACKS.includes(level)) throw httpErr(400, 'Unknown track');
      if (game === 'tungup' && !TU_MAPS.includes(level)) throw httpErr(400, 'Unknown map');
      if (game === 'golf' && !GOLF_COURSES.includes(level)) throw httpErr(400, 'Unknown course');
      const rows = [];
      if (GAMES[game].soloWL) {
        for (const u of liveUsers()) {
          const r = u.solo && u.solo[game];
          if (r && r.w + r.l > 0) rows.push({ ...publicUser(u), value: r.w, losses: r.l });
        }
        rows.sort((a, b) => b.value - a.value || a.losses - b.losses || a.username.localeCompare(b.username));
        return json(res, 200, { game, level, rows });
      }
      for (const u of liveUsers()) {
        let v;
        if (game === 'clicker') v = u.clicker && Math.floor(u.clicker.total);
        else if (game === 'minesweeper' || game === 'f1' || game === 'tungup' || game === 'golf') v = u.solo && u.solo[game] && u.solo[game][level];
        else v = u.solo && u.solo[game];
        if (v > 0) rows.push({ ...publicUser(u), value: v });
      }
      // Scores and totals: higher is better. Minesweeper: lower time is better.
      rows.sort((a, b) => (game === 'minesweeper' || game === 'f1' || game === 'tungup' || game === 'golf' ? a.value - b.value : b.value - a.value) || a.username.localeCompare(b.username));
      return json(res, 200, { game, level, rows });
    }

    case 'GET /api/admin/users': {
      const key = sessionKey(bearer(req) || '');
      if (!key || !isAdmin(key)) throw httpErr(403, 'Admins only');
      return json(res, 200, { users: liveUsers().map((u) => ({ id: u.key, username: u.username, avatar: avatarOf(u), wins: statsFor(u, 'all').w, losses: statsFor(u, 'all').l, online: online.has(u.key), admin: isAdmin(u.key), joined: u.createdAt || 0 })).sort((a, b) => a.username.localeCompare(b.username)) });
    }
    case 'POST /api/admin/remove': {
      rateLimit(ip, 'admin', 60, 3600e3);
      const key = sessionKey(bearer(req) || '');
      if (!key || !isAdmin(key)) throw httpErr(403, 'Admins only');
      const b = await readJson(req, 1024);
      const target = String(b.id || '').toLowerCase();
      if (!db.users[target] || db.users[target].removed) throw httpErr(404, 'No such user');
      if (target === key) throw httpErr(400, 'You cannot remove your own account');
      if (isAdmin(target)) throw httpErr(400, 'You cannot remove another admin');
      removeUser(target);
      return json(res, 200, { ok: true, removed: db.users[target].username });
    }

    case 'GET /api/shop': {
      const key = sessionKey(bearer(req) || '');
      if (!key) throw httpErr(401, 'Log in to see the shop');
      return json(res, 200, shopState(db.users[key]));
    }
    case 'POST /api/shop/buy': {
      rateLimit(ip, 'shop', 120, 3600e3);
      const key = sessionKey(bearer(req) || '');
      if (!key) throw httpErr(401, 'Log in to shop');
      const b = await readJson(req, 1024);
      const item = Shop.byId[String(b.id)];
      if (!item) throw httpErr(400, 'No such item');
      if (!Shop.offerFor(Shop.todayStr()).includes(item.id)) throw httpErr(400, 'That item is not in today\'s shop');
      const u = db.users[key], sh = shopOf(u);
      if (sh.owned.includes(item.id)) throw httpErr(409, 'You already own that');
      if (shopState(u).balance < item.price) throw httpErr(402, 'Not enough tung bucks');
      sh.spent += item.price; sh.owned.push(item.id);
      saveDb();
      return json(res, 200, shopState(u));
    }
    case 'POST /api/shop/equip': {
      rateLimit(ip, 'shop', 120, 3600e3);
      const key = sessionKey(bearer(req) || '');
      if (!key) throw httpErr(401, 'Log in first');
      const b = await readJson(req, 1024);
      const slot = String(b.slot || ''), id = String(b.id || '');
      if (!Shop.SLOTS.includes(slot)) throw httpErr(400, 'No such slot');
      const u = db.users[key], sh = shopOf(u);
      if (id) {
        const item = Shop.byId[id];
        if (!item || item.slot !== slot) throw httpErr(400, 'That does not go there');
        if (!sh.owned.includes(id)) throw httpErr(403, 'You do not own that');
        sh.equipped[slot] = id;
      } else delete sh.equipped[slot];
      saveDb();
      const p = arenaPlayers.get(key);
      if (p) p.q = gearOf(u); // everyone in the arena sees it straight away
      return json(res, 200, shopState(u));
    }

    case 'GET /api/clicker': {
      const key = sessionKey(bearer(req) || '');
      if (!key) throw httpErr(401, 'Log in first');
      const c = db.users[key].clicker;
      return json(res, 200, { state: c ? c.state : null, saved: c ? c.t : 0 });
    }
    case 'POST /api/clicker': {
      rateLimit(ip, 'clicker', 900, 3600e3);
      const key = sessionKey(bearer(req) || '');
      if (!key) throw httpErr(401, 'Log in first');
      const b = await readJson(req, 20 * 1024);
      const st = b.state;
      if (!st || typeof st !== 'object' || !Number.isFinite(st.total) || st.total < 0 || st.total > 1e18 || !Number.isFinite(st.tungs) || st.tungs < 0) throw httpErr(400, 'Bad save');
      const u = db.users[key];
      // never let an old tab overwrite a bigger save
      if (u.clicker && u.clicker.total > st.total + 1) return json(res, 200, { ok: true, kept: true, state: u.clicker.state });
      u.clicker = { state: st, total: st.total, t: Date.now() };
      saveDb();
      return json(res, 200, { ok: true });
    }

    default:
      throw httpErr(404, 'Not found');
  }
}

function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return notFound(res); }
  if (p.includes('\0')) return notFound(res);
  if (p.endsWith('/')) p += 'index.html';
  const rel = path.posix.normalize(p).replace(/^\/+/, '') || 'index.html';
  if (rel.startsWith('..')) return notFound(res);

  let base, file;
  if (rel.startsWith('avatars/')) { base = AVATAR_DIR; file = path.join(AVATAR_DIR, rel.slice(8)); }
  else if (ROOT_FILES.has(rel) || rel.startsWith('games/') || rel.startsWith('assets/')) { base = ROOT; file = path.join(ROOT, rel); }
  else return notFound(res);

  file = path.resolve(file);
  if (!file.startsWith(base + path.sep)) return notFound(res);
  if (path.extname(file).toLowerCase() === '.mp3') return serveAudio(req, res, file); // audio needs Range support (Safari, seeking)
  fs.readFile(file, (err, data) => {
    if (err) return notFound(res);
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': base === AVATAR_DIR ? 'public, max-age=86400' : 'no-cache',
    };
    if (ext === '.html') headers['Content-Security-Policy'] = CSP;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}
function serveAudio(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const base = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400' };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let start = 0, end = st.size - 1, status = 200;
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), end); }
      else { start = Math.max(0, st.size - Number(m[2])); }
      if (start > end || start >= st.size) { res.writeHead(416, { ...base, 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      status = 206;
    }
    const headers = { ...base, 'Content-Length': end - start + 1 };
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  });
}
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    return serveStatic(req, res, url);
  } catch (e) {
    if (e && e.status) return json(res, e.status, { error: e.message });
    console.error(e);
    return json(res, 500, { error: 'Server error' });
  }
});

// ---------- WebSocket: presence ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
const online = new Map();      // key -> {socks:Set, timer}
const userMatch = new Map();   // key -> matchId
const challenges = new Map();  // id -> challenge
const matches = new Map();     // id -> match

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const origin = req.headers.origin;
  let okOrigin = true;
  if (origin) { try { okOrigin = new URL(origin).host === req.headers.host; } catch { okOrigin = false; } }
  if (url.pathname.startsWith('/socket.io/')) return; // handled by Socket.IO (Tung Boxing and Dizzy Tungs)
  if (url.pathname !== '/ws' || !okOrigin) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

const wsSend = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };
function sendUser(key, obj) {
  const o = online.get(key);
  if (o) for (const ws of o.socks) wsSend(ws, obj);
}

let presenceTimer = null;
function schedulePresence() {
  if (presenceTimer) return;
  presenceTimer = setTimeout(() => {
    presenceTimer = null;
    const users = [...online.keys()].filter((k) => db.users[k]).map((k) => ({
      ...publicUser(db.users[k]), status: userMatch.has(k) ? 'ingame' : 'online',
    })).sort((a, b) => a.username.localeCompare(b.username));
    const msg = JSON.stringify({ t: 'presence', users });
    for (const o of online.values()) for (const ws of o.socks) if (ws.readyState === 1) ws.send(msg);
  }, 60);
}

function addOnline(ws) {
  let o = online.get(ws.key);
  if (!o) { o = { socks: new Set(), timer: null }; online.set(ws.key, o); }
  if (o.timer) { clearTimeout(o.timer); o.timer = null; }
  o.socks.add(ws);
  schedulePresence();
}
function removeOnline(ws) {
  const o = online.get(ws.key);
  if (!o) return;
  o.socks.delete(ws);
  if (o.socks.size === 0 && !o.timer) {
    // Short grace so page navigations don't flicker the user offline.
    o.timer = setTimeout(() => {
      if (o.socks.size === 0) { online.delete(ws.key); cancelChallengesOf(ws.key, 'cancelled'); schedulePresence(); onUserOffline(ws.key); }
    }, PRESENCE_GRACE_MS);
  }
}

// ---------- Challenges ----------
function sanitizeOptions(game, opts) {
  const out = {};
  const spec = GAMES[game].options || {};
  for (const [k, o] of Object.entries(spec)) {
    const v = opts && opts[k];
    out[k] = o.values.includes(v) ? v : o.default;
  }
  return out;
}

function closeChallenge(c, status) {
  if (!challenges.delete(c.id)) return;
  clearTimeout(c.timer);
  const msg = { t: 'challenge_update', id: c.id, status };
  sendUser(c.from, msg);
  sendUser(c.to, msg);
}
function cancelChallengesOf(key, status) {
  for (const c of [...challenges.values()]) if (c.from === key || c.to === key) closeChallenge(c, status);
}

function onChallenge(ws, msg) {
  const to = String(msg.to || '');
  const game = String(msg.game || '');
  if (!GAMES[game]) return wsSend(ws, { t: 'error', message: 'Unknown game' });
  if (GAMES[game].rooms && !GAMES[game].challenge) return wsSend(ws, { t: 'error', message: 'That game is played in rooms, not 1-on-1 challenges' });
  if (GAMES[game].external) return wsSend(ws, { t: 'error', message: 'Start that game from its page or from its log in Tung Arena' });
  if (!db.users[to] || to === ws.key) return wsSend(ws, { t: 'error', message: 'Unknown player' });
  if (!online.has(to)) return wsSend(ws, { t: 'error', message: `${db.users[to].username} is offline` });
  if (userMatch.has(to)) return wsSend(ws, { t: 'error', message: `${db.users[to].username} is in a match` });
  if (userMatch.has(ws.key)) return wsSend(ws, { t: 'error', message: 'Finish your current match first' });
  for (const c of [...challenges.values()]) if (c.from === ws.key) closeChallenge(c, 'cancelled');

  const c = {
    id: crypto.randomBytes(6).toString('hex'), from: ws.key, to, game,
    options: sanitizeOptions(game, msg.options), fromSock: ws, timer: null,
  };
  c.timer = setTimeout(() => closeChallenge(c, 'expired'), CHALLENGE_MS);
  challenges.set(c.id, c);
  wsSend(ws, { t: 'challenge_out', id: c.id, to: publicUser(db.users[to]), game, options: c.options, ttl: CHALLENGE_MS });
  sendUser(to, { t: 'challenge_in', id: c.id, from: publicUser(db.users[ws.key]), game, options: c.options, ttl: CHALLENGE_MS });
}

function onChallengeResponse(ws, msg) {
  const c = challenges.get(String(msg.id));
  if (!c || c.to !== ws.key) return;
  if (!msg.accept) return closeChallenge(c, 'declined');
  if (userMatch.has(c.from) || userMatch.has(c.to)) return closeChallenge(c, 'busy');
  if (!online.has(c.from)) return closeChallenge(c, 'cancelled');
  closeChallenge(c, 'accepted');
  cancelChallengesOf(c.from, 'cancelled');
  cancelChallengesOf(c.to, 'cancelled');
  const m = createMatch(c);
  const start = { t: 'match_start', matchId: m.id, game: m.game, options: m.options };
  wsSend(ws, start);
  if (c.fromSock.readyState === 1) wsSend(c.fromSock, start);
  else sendUser(c.from, start);
}

// ---------- Matches ----------
function createMatch(c) {
  const g = c.game;
  const m = {
    id: crypto.randomBytes(8).toString('hex'), game: g, options: c.options,
    seed: crypto.randomBytes(8).toString('hex'), state: 'waiting', keys: [c.from, c.to],
    players: {}, startAt: null, joinTimer: null, startTimer: null, capTimer: null,
    sp: g === 'sprouts' ? Sprouts.newGame(c.options.dots, c.options.mode === 'misere') : null,
    pool: g === 'pool' ? Pool.newGame() : null, turn: c.from, turnTimer: null,
    tb: GAMES[g].turnBased ? TB[g].newGame(c.options) : null,
    total: g === 'golf' ? GOLF_HOLES * GOLF_MAXSTROKES : g === 'tungup' ? 100 : g === 'f1' ? c.options.laps * F1_CHECKPOINTS : g === 'minesweeper' ? LEVELS[c.options.level].rows * LEVELS[c.options.level].cols - LEVELS[c.options.level].mines : null,
  };
  for (const k of m.keys) {
    m.players[k] = { key: k, joined: false, started: false, socks: new Set(), progress: 0, status: 'playing', time: null, forfeitTimer: null };
    userMatch.set(k, m.id);
  }
  m.joinTimer = setTimeout(() => endMatch(m, null, 'noshow', true), JOIN_MS);
  matches.set(m.id, m);
  schedulePresence();
  return m;
}

const pstate = (p) => ({ progress: p.progress, status: p.status });
function matchInfo(m, forKey) {
  const oppKey = m.keys.find((k) => k !== forKey);
  return {
    id: m.id, game: m.game, options: m.options, seed: m.seed, total: m.total, idx: m.keys.indexOf(forKey),
    you: publicUser(db.users[forKey]), opp: publicUser(db.users[oppKey]), oppState: pstate(m.players[oppKey]),
  };
}
const bothJoined = (m) => m.keys.every((k) => m.players[k].joined);

function onJoin(ws, msg, resume) {
  const m = matches.get(String(msg.matchId));
  if (!m || !m.players[ws.key]) return wsSend(ws, { t: 'match_gone' });
  if (m.state === 'ended') return wsSend(ws, { t: 'match_gone' });
  const p = m.players[ws.key];
  const started = m.state !== 'waiting';
  if (started && !resume) { // a fresh page load after the game began = forfeit (no restarts)
    p.socks.add(ws); ws.matchId = m.id;
    return forfeit(m, ws.key, 'left');
  }
  if (resume && !p.joined) return wsSend(ws, { t: 'match_gone' });
  p.joined = true;
  p.socks.add(ws);
  ws.matchId = m.id;
  clearTimeout(p.forfeitTimer);
  wsSend(ws, { t: 'match_joined', match: matchInfo(m, ws.key), waiting: !bothJoined(m), resumed: !!resume });
  if (!started && bothJoined(m)) startCountdown(m);
  else if (m.state === 'countdown') wsSend(ws, { t: 'match_countdown', ms: Math.max(0, m.startAt - Date.now()) });
  else if (m.state === 'running' && m.game === 'pool') wsSend(ws, { t: 'pool_start', state: m.pool, turn: m.turn, idx: m.keys.indexOf(ws.key) });
  else if (m.state === 'running' && m.game === 'sprouts') wsSend(ws, { t: 'sp_start', state: m.sp, turn: m.turn, idx: m.keys.indexOf(ws.key) });
  else if (m.state === 'running' && m.tb) tbSendTo(m, ws.key, ws, null, null);
}

function startCountdown(m) {
  clearTimeout(m.joinTimer);
  m.state = 'countdown';
  m.startAt = Date.now() + COUNTDOWN_MS;
  for (const k of m.keys) {
    m.players[k].started = true;
    for (const s of m.players[k].socks) wsSend(s, { t: 'match_countdown', ms: COUNTDOWN_MS });
  }
  m.startTimer = setTimeout(() => {
    if (m.state !== 'countdown') return;
    m.state = 'running';
    m.capTimer = setTimeout(() => capMatch(m), MATCH_CAP_MS);
    if (m.game === 'sprouts') { sendSprouts(m); setTurnTimer(m); }
    if (m.game === 'pool') { sendPool(m); setTurnTimer(m); }
    if (m.tb) { tbSend(m, null, null); setTurnTimer(m); }
  }, COUNTDOWN_MS);
}

function notifyOpp(m, key) {
  const oppKey = m.keys.find((k) => k !== key);
  for (const s of m.players[oppKey].socks) wsSend(s, { t: 'opp', ...pstate(m.players[key]) });
}

function onProgress(ws, msg) {
  const m = matches.get(ws.matchId);
  if (!m || m.state !== 'running' || isAuth(m.game)) return;
  const p = m.players[ws.key];
  if (!p || p.status !== 'playing') return;
  const v = Math.floor(Number(msg.value));
  if (!Number.isFinite(v) || v < p.progress) return;
  if (SCORE_CAP[m.game]) {
    if (v > SCORE_CAP[m.game](Date.now() - m.startAt)) return;
  } else if (v > m.total) return;
  else if (m.game === 'tungup' && v > Math.floor((Date.now() - m.startAt) / 200) + 5) return; // nobody climbs the whole map in under ~20 s
  else if (m.game === 'f1' && v > Math.floor((Date.now() - m.startAt) / 1000) + 2) return; // a checkpoint cannot be reached faster than this
  p.progress = v;
  notifyOpp(m, ws.key);
  evaluate(m);
}

function onFinish(ws, msg) {
  const m = matches.get(ws.matchId);
  if (!m || m.state !== 'running' || isAuth(m.game)) return;
  const p = m.players[ws.key];
  if (!p || p.status !== 'playing') return;
  p.time = Date.now() - m.startAt;
  if ((m.game === 'minesweeper' || GAMES[m.game].judge === 'race') && msg.cleared && p.progress >= m.total) p.status = 'cleared';
  else p.status = 'out';
  notifyOpp(m, ws.key);
  evaluate(m);
}

// Returns on a decisive outcome by ending the match.
function evaluate(m) {
  if (m.state !== 'running') return;
  const [a, b] = m.keys.map((k) => m.players[k]);
  const done = (p) => p.status !== 'playing';
  const win = (p, reason) => endMatch(m, p.key, reason);

  if (GAMES[m.game].judge === 'score') {
    if (done(a) && done(b)) return a.progress === b.progress ? endMatch(m, null, 'score') : win(a.progress > b.progress ? a : b, 'score');
    for (const [x, y] of [[a, b], [b, a]]) if (done(x) && !done(y) && y.progress > x.progress) return win(y, 'score');
    return;
  }
  if (GAMES[m.game].judge === 'low') { // fewest strokes wins; whoever is already past the other's total cannot win
    if (done(a) && done(b)) return a.progress === b.progress ? endMatch(m, null, 'strokes') : win(a.progress < b.progress ? a : b, 'strokes');
    for (const [x, y] of [[a, b], [b, a]]) if (done(x) && !done(y) && y.progress > x.progress) return win(x, 'strokes');
    return;
  }
  if (GAMES[m.game].judge === 'race') {
    for (const p of [a, b]) if (p.status === 'cleared') return win(p, 'cleared');
    if (done(a) && done(b)) return a.progress === b.progress ? endMatch(m, null, 'revealed') : win(a.progress > b.progress ? a : b, 'revealed');
    return;
  }
  // minesweeper
  for (const p of [a, b]) if (p.status === 'cleared') return win(p, 'cleared');
  if (done(a) && done(b)) {
    if (a.progress !== b.progress) return win(a.progress > b.progress ? a : b, 'revealed');
    if (a.time !== b.time) return win(a.time > b.time ? a : b, 'survived');
    return endMatch(m, null, 'revealed');
  }
  for (const [x, y] of [[a, b], [b, a]]) if (done(x) && !done(y) && y.progress > x.progress) return win(y, 'revealed');
}

// ---------- Sprouts (server-validated turn-based match) ----------
function sendSprouts(m) {
  for (const k of m.keys) for (const s of m.players[k].socks) wsSend(s, { t: 'sp_start', state: m.sp, turn: m.turn, idx: m.keys.indexOf(k) });
}
function setTurnTimer(m) {
  clearTimeout(m.turnTimer);
  m.turnTimer = setTimeout(() => {
    if (m.state !== 'running') return;
    if (m.tb) { // whoever has to move (or has not finished setting up) loses; if nobody is to blame it is a draw
      const T = TB[m.game];
      let i = T.turnOf(m.tb);
      if (i === -1) i = T.laggard ? T.laggard(m.tb) : -1;
      return endMatch(m, i < 0 ? null : m.keys[1 - i], 'turntime');
    }
    endMatch(m, m.keys.find((k) => k !== m.turn), 'turntime');
  }, TURN_MS);
}

// ---------- Generic turn-based games (chess, battleship, dots and boxes, super tic-tac-toe, hangman) ----------
function tbSendTo(m, key, ws, by, ev) {
  const i = m.keys.indexOf(key), t = TB[m.game].turnOf(m.tb);
  wsSend(ws, { t: 'tb_state', state: TB[m.game].view(m.tb, i), turn: t >= 0 ? m.keys[t] : null, idx: i, ev: ev || null, by: by || null, prog: m.keys.map((k) => m.players[k].progress) });
}
function tbSend(m, by, ev) {
  for (const k of m.keys) for (const s of m.players[k].socks) tbSendTo(m, k, s, by, ev);
}
function onTbMove(ws, msg) {
  const m = matches.get(ws.matchId);
  if (!m || m.state !== 'running' || !m.tb) return;
  const T = TB[m.game], idx = m.keys.indexOf(ws.key), turn = T.turnOf(m.tb);
  if (turn !== -1 && turn !== idx) return wsSend(ws, { t: 'tb_reject', error: 'It is not your turn' });
  let r;
  try { r = T.play(m.tb, msg.move, idx); } catch (e) { r = { ok: false, error: 'That move did not work' }; }
  if (!r.ok) return wsSend(ws, { t: 'tb_reject', error: r.error });
  m.keys.forEach((k, i) => { m.players[k].progress = T.progress(m.tb, i); });
  tbSend(m, ws.key, r.ev);
  for (const k of m.keys) notifyOpp(m, k);
  if (m.tb.over) return endMatch(m, m.tb.winner == null ? null : m.keys[m.tb.winner], m.tb.reason || 'win');
  setTurnTimer(m);
}

// ---------- Real-time games (basketball, F1, paper.io): one player's browser runs the sim, we relay ----------
function onRt(ws, msg) {
  const m = matches.get(ws.matchId);
  if (!m || m.state !== 'running' || !GAMES[m.game].realtime) return;
  let size = 0;
  try { size = JSON.stringify(msg.d).length; } catch { return; }
  if (!(size < 30000)) return;
  const opp = m.keys.find((k) => k !== ws.key);
  const out = JSON.stringify({ t: 'rt', d: msg.d });
  for (const s of m.players[opp].socks) if (s.readyState === 1) s.send(out);
}
function onSpMove(ws, msg) {
  const m = matches.get(ws.matchId);
  if (!m || m.state !== 'running' || m.game !== 'sprouts' || m.turn !== ws.key) return;
  const r = Sprouts.play(m.sp, { from: msg.from, to: msg.to, path: msg.path }, m.keys.indexOf(ws.key));
  if (!r.ok) return wsSend(ws, { t: 'sp_reject', error: r.error });
  const p = m.players[ws.key];
  p.progress++;
  const next = m.keys.find((k) => k !== ws.key);
  m.turn = next;
  const out = { t: 'sp_move', by: ws.key, move: r.v, next };
  for (const k of m.keys) for (const s of m.players[k].socks) wsSend(s, out);
  notifyOpp(m, ws.key);
  if (!Sprouts.hasMove(m.sp)) {
    // The player to move is stuck: they lose in normal play, win in misere.
    return endMatch(m, m.sp.misere ? next : ws.key, 'nomoves');
  }
  setTurnTimer(m);
}

// ---------- Pool (server runs the physics) ----------
function sendPool(m) {
  for (const k of m.keys) for (const s of m.players[k].socks) wsSend(s, { t: 'pool_start', state: m.pool, turn: m.turn, idx: m.keys.indexOf(k) });
}
function onPoolShot(ws, msg) {
  const m = matches.get(ws.matchId);
  if (!m || m.state !== 'running' || m.game !== 'pool' || m.turn !== ws.key) return;
  const shot = { angle: Number(msg.angle), power: Number(msg.power) };
  if (Array.isArray(msg.cue) && msg.cue.length === 2) shot.cue = [Number(msg.cue[0]), Number(msg.cue[1])];
  const g = m.pool;
  const r = Pool.takeShot(g, shot);
  if (!r.ok) return wsSend(ws, { t: 'pool_reject', error: r.error });
  m.turn = m.keys[g.turn];
  m.keys.forEach((k, i) => { m.players[k].progress = g.pots[i]; });
  const out = { t: 'pool_shot', by: ws.key, shot, state: g, report: { potted: r.report.potted, foul: r.report.foul, notes: r.report.notes }, next: m.turn };
  for (const k of m.keys) for (const s of m.players[k].socks) wsSend(s, out);
  for (const k of m.keys) notifyOpp(m, k);
  if (g.over) return endMatch(m, m.keys[g.winner], r.report.reason || 'pot8');
  setTurnTimer(m);
}

function capMatch(m) {
  if (m.state !== 'running') return;
  if (isAuth(m.game)) return endMatch(m, null, 'timeout');
  for (const k of m.keys) {
    const p = m.players[k];
    if (p.status === 'playing') { p.status = 'out'; p.time = MATCH_CAP_MS; }
  }
  evaluate(m);
  if (m.state !== 'ended') endMatch(m, null, 'timeout');
}

function forfeit(m, key, reason) {
  if (m.state === 'ended') return;
  if (m.state === 'waiting') return endMatch(m, null, 'left', true);
  endMatch(m, m.keys.find((k) => k !== key), reason);
}

function endMatch(m, winnerKey, reason, cancelled = false) {
  if (m.state === 'ended') return;
  m.state = 'ended';
  clearTimeout(m.joinTimer); clearTimeout(m.startTimer); clearTimeout(m.capTimer); clearTimeout(m.turnTimer);
  for (const k of m.keys) {
    clearTimeout(m.players[k].forfeitTimer);
    if (userMatch.get(k) === m.id) userMatch.delete(k);
    if (!cancelled) recordResult(k, m.game, winnerKey === null ? 'd' : winnerKey === k ? 'w' : 'l');
  }
  if (!cancelled) saveDb();
  const summary = m.keys.map((k) => ({ ...publicUser(db.users[k]), progress: m.players[k].progress, status: m.players[k].status, time: m.players[k].time }));
  for (const k of m.keys) {
    const out = {
      t: 'match_end', matchId: m.id, game: m.game, options: m.options, total: m.total, reason, you: k, players: summary,
      result: cancelled ? 'cancelled' : winnerKey === null ? 'draw' : winnerKey === k ? 'win' : 'loss',
      stats: { game: statsFor(db.users[k], m.game), all: statsFor(db.users[k], 'all') },
    };
    for (const s of m.players[k].socks) { wsSend(s, out); s.matchId = null; }
  }
  setTimeout(() => matches.delete(m.id), 120000).unref();
  schedulePresence();
}

function onSocketGone(ws) {
  if (!ws.matchId) return;
  const m = matches.get(ws.matchId);
  if (!m) return;
  const p = m.players[ws.key];
  if (!p) return;
  p.socks.delete(ws);
  if (p.socks.size === 0 && m.state !== 'ended' && m.state !== 'waiting') {
    clearTimeout(p.forfeitTimer);
    p.forfeitTimer = setTimeout(() => forfeit(m, ws.key, 'disconnect'), DISCONNECT_GRACE_MS);
  }
}

// ---------- The Imposter (open rooms, 4-8 players) ----------
const rooms = new Map();     // id -> room
const userRoom = new Map();  // key -> roomId

function listRooms() {
  return [...rooms.values()].filter((r) => r.state === 'lobby').map((r) => ({
    id: r.id, host: publicUser(db.users[r.host]), count: r.members.length, max: Imposter.MAX_PLAYERS,
  }));
}
function broadcastRooms() {
  const msg = JSON.stringify({ t: 'imp_rooms', rooms: listRooms() });
  for (const ws of wss.clients) if (ws.impWatch && ws.readyState === 1) ws.send(msg);
}
function roomView(room, key) {
  return {
    id: room.id, state: room.state, host: room.host, notice: room.notice || null,
    min: Imposter.MIN_PLAYERS, max: Imposter.MAX_PLAYERS,
    members: room.members.map((k) => publicUser(db.users[k])),
    game: room.game ? Imposter.view(room.game, key, Date.now()) : null,
  };
}
function sendRoom(room) {
  for (const k of room.members) sendUser(k, { t: 'imp_room', room: roomView(room, k) });
}
function addToRoom(room, key) {
  room.members.push(key);
  userRoom.set(key, room.id);
  userMatch.set(key, room.id);
}
function dropFromRoom(room, key) {
  room.members = room.members.filter((k) => k !== key);
  if (userRoom.get(key) === room.id) { userRoom.delete(key); userMatch.delete(key); }
  sendUser(key, { t: 'imp_room', room: null });
}
function afterGameChange(room) {
  const g = room.game;
  if (g && g.cancelled) {
    room.state = 'lobby'; room.game = null;
    room.notice = 'Not enough players were left, so the round was cancelled. No records counted.';
  } else if (g && g.phase === 'result' && !room.recorded) {
    room.recorded = true;
    const crewWon = g.outcome.winner === 'crew';
    for (const p of g.players) {
      if (p.left) continue; // leavers already took a loss
      const isImp = p.id === g.imposter;
      recordResult(p.id, 'imposter', (crewWon ? !isImp : isImp) ? 'w' : 'l');
    }
    saveDb();
  }
  sendRoom(room);
  broadcastRooms();
}
function leaveRoom(key) {
  const room = rooms.get(userRoom.get(key));
  if (!room) return;
  const inGame = room.state === 'game' && room.game && room.game.phase !== 'result';
  if (inGame) {
    recordResult(key, 'imposter', 'l'); // quitting mid-round counts as a loss
    saveDb();
    Imposter.leave(room.game, key, Date.now());
  }
  dropFromRoom(room, key);
  if (room.members.length === 0) rooms.delete(room.id);
  else {
    if (room.host === key) room.host = room.members[0];
    if (inGame) afterGameChange(room); else sendRoom(room);
  }
  broadcastRooms();
  schedulePresence();
}
function onUserOffline(key) {
  tuLeave(key, true);
  grLeave(key, true);
  picLeave(key, true);
  const room = rooms.get(userRoom.get(key));
  if (!room) return;
  if (!room.game || room.game.phase === 'result') return leaveRoom(key);
  Imposter.setConnected(room.game, key, false, Date.now());
  afterGameChange(room);
  setTimeout(() => { if (!online.has(key) && userRoom.get(key) === room.id) leaveRoom(key); }, 20000).unref();
}
function onUserOnline(ws) {
  { const gr = grRooms.get(grUserRoom.get(ws.key)); if (gr) wsSend(ws, { t: 'gr_room', room: grView(gr) }); const pr = picRooms.get(picUserRoom.get(ws.key)); if (pr) { wsSend(ws, { t: 'pic_room', room: picView(pr, ws.key) }); } }
  { const tr = tuRooms.get(tuUserRoom.get(ws.key)); if (tr) wsSend(ws, { t: 'tu_room', room: tuView(tr) }); }
  const room = rooms.get(userRoom.get(ws.key));
  if (!room) return;
  if (room.game) Imposter.setConnected(room.game, ws.key, true, Date.now());
  wsSend(ws, { t: 'imp_room', room: roomView(room, ws.key) });
}
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function onImp(ws, msg) {
  const err = (message) => wsSend(ws, { t: 'error', message });
  const room = rooms.get(userRoom.get(ws.key));
  switch (msg.t) {
    case 'imp_watch':
      ws.impWatch = true;
      wsSend(ws, { t: 'imp_rooms', rooms: listRooms() });
      if (room) wsSend(ws, { t: 'imp_room', room: roomView(room, ws.key) });
      return;
    case 'imp_unwatch': ws.impWatch = false; return;
    case 'imp_create': {
      if (room || userMatch.has(ws.key)) return err('Finish your current match first');
      const r = { id: crypto.randomBytes(4).toString('hex'), host: ws.key, members: [], state: 'lobby', game: null, recorded: false, notice: null };
      rooms.set(r.id, r);
      addToRoom(r, ws.key);
      sendRoom(r); broadcastRooms(); schedulePresence();
      return;
    }
    case 'imp_join': {
      const r = rooms.get(String(msg.roomId));
      if (room || userMatch.has(ws.key)) return err('Finish your current match first');
      if (!r || r.state !== 'lobby') return err('That room is no longer open');
      if (r.members.length >= Imposter.MAX_PLAYERS) return err('That room is full');
      addToRoom(r, ws.key);
      r.notice = null;
      sendRoom(r); broadcastRooms(); schedulePresence();
      return;
    }
    case 'imp_leave': return leaveRoom(ws.key);
    case 'imp_start': {
      if (!room || room.host !== ws.key || room.state !== 'lobby') return;
      const n = room.members.length;
      if (n < Imposter.MIN_PLAYERS || n > Imposter.MAX_PLAYERS) return err(`You need ${Imposter.MIN_PLAYERS}-${Imposter.MAX_PLAYERS} players to start`);
      const players = room.members.map((k) => ({ id: k, name: db.users[k].username, avatar: avatarOf(db.users[k]) }));
      const word = IMP_WORDS[crypto.randomInt(IMP_WORDS.length)];
      const imposter = room.members[crypto.randomInt(n)];
      room.game = Imposter.createGame(players, word, imposter, shuffle(room.members), Date.now());
      room.state = 'game'; room.recorded = false; room.notice = null;
      sendRoom(room); broadcastRooms();
      return;
    }
    case 'imp_act': {
      if (!room || !room.game || !msg.a || typeof msg.a !== 'object') return;
      const r = Imposter.act(room.game, ws.key, msg.a, Date.now());
      if (!r.ok) return err(r.error);
      afterGameChange(room);
      return;
    }
    case 'imp_again': {
      if (!room || room.host !== ws.key || !room.game || room.game.phase !== 'result') return;
      room.state = 'lobby'; room.game = null; room.notice = null;
      sendRoom(room); broadcastRooms();
      return;
    }
  }
}


// ---------- Generic open rooms for real-time host-simulated games (Sumo, Bomber Arena): 2-4 players ----------
const grRooms = new Map(), grUserRoom = new Map();
const grPub = (k) => publicUser(db.users[k]);
function grView(r) { return { id: r.id, game: r.game, host: r.host, state: r.state, opts: r.opts, max: GAMES[r.game].groomMax, members: r.members.map(grPub) }; }
function grSend(r) { for (const k of r.members) sendUser(k, { t: 'gr_room', room: grView(r) }); }
function grList(game) { return [...grRooms.values()].filter((r) => r.game === game && r.state === 'lobby').map((r) => ({ id: r.id, host: grPub(r.host), count: r.members.length, max: GAMES[game].groomMax, opts: r.opts })); }
function grBroadcastList(game) { const msg = JSON.stringify({ t: 'gr_rooms', game, rooms: grList(game) }); for (const ws of wss.clients) if (ws.grWatch === game && ws.readyState === 1) ws.send(msg); }
function grEnd(r, ranking, reason) {
  if (r.state !== 'running') return;
  r.state = 'lobby'; clearTimeout(r.startTimer);
  const rank = ranking.filter((k) => r.players.includes(k));
  for (const k of r.players) if (!rank.includes(k)) rank.push(k);
  if (r.counted && reason === 'done') { rank.forEach((k, i) => { if (!r.left.has(k)) recordResult(k, r.game, i === 0 ? 'w' : 'l'); }); saveDb(); }
  const list = rank.map((k, i) => ({ ...grPub(k), place: i + 1 }));
  for (const k of r.members) sendUser(k, { t: 'gr_end', game: r.game, reason, ranking: list, you: k, stats: { game: statsFor(db.users[k], r.game), all: statsFor(db.users[k], 'all') } });
  grSend(r); grBroadcastList(r.game);
}
function grLeave(key, offline) {
  const r = grRooms.get(grUserRoom.get(key));
  if (!r) return;
  const doIt = () => {
    if (grUserRoom.get(key) !== r.id) return;
    if (r.state === 'running' && r.counted) { recordResult(key, r.game, 'l'); r.left.add(key); saveDb(); }
    r.members = r.members.filter((k) => k !== key);
    grUserRoom.delete(key); if (userMatch.get(key) === r.id) userMatch.delete(key);
    sendUser(key, { t: 'gr_room', room: null });
    if (!r.members.length) { clearTimeout(r.startTimer); grRooms.delete(r.id); }
    else {
      const hostLeft = r.host === key;
      if (hostLeft) r.host = r.members[0];
      if (r.state === 'running' && hostLeft) { grEnd(r, [], 'host_left'); }
      else if (r.state === 'running' && r.members.length < 2) grEnd(r, r.members, 'done');
      else for (const k of r.members) sendUser(k, { t: 'gr_left', id: key });
      grSend(r);
    }
    grBroadcastList(r.game); schedulePresence();
  };
  if (offline && r.state === 'running') { setTimeout(() => { if (!online.has(key)) doIt(); }, 15000).unref(); return; }
  if (offline && !online.has(key)) return doIt();
  doIt();
}
function onGr(ws, msg) {
  const err = (message) => wsSend(ws, { t: 'error', message });
  const r = grRooms.get(grUserRoom.get(ws.key));
  switch (msg.t) {
    case 'gr_watch': { const g = String(msg.game || ''); if (!GAMES[g] || !GAMES[g].groomMax) return; ws.grWatch = g; wsSend(ws, { t: 'gr_rooms', game: g, rooms: grList(g) }); if (r) wsSend(ws, { t: 'gr_room', room: grView(r) }); return; }
    case 'gr_unwatch': ws.grWatch = null; return;
    case 'gr_create': {
      const g = String(msg.game || ''); if (!GAMES[g] || !GAMES[g].groomMax) return err('Unknown game');
      if (r) return err('You are already in a room');
      if (userMatch.has(ws.key)) return err('Finish your current match first');
      const room = { id: crypto.randomBytes(4).toString('hex'), game: g, host: ws.key, members: [ws.key], state: 'lobby', opts: sanitizeOptions(g, msg.opts), players: [], left: new Set(), counted: false, startTimer: null };
      grRooms.set(room.id, room); grUserRoom.set(ws.key, room.id); userMatch.set(ws.key, room.id);
      grSend(room); grBroadcastList(g); schedulePresence(); return;
    }
    case 'gr_join': {
      const room = grRooms.get(String(msg.id));
      if (r) return err('You are already in a room');
      if (userMatch.has(ws.key)) return err('Finish your current match first');
      if (!room || room.state !== 'lobby') return err('That room is not open any more');
      if (room.members.length >= GAMES[room.game].groomMax) return err('That room is full');
      room.members.push(ws.key); grUserRoom.set(ws.key, room.id); userMatch.set(ws.key, room.id);
      grSend(room); grBroadcastList(room.game); schedulePresence(); return;
    }
    case 'gr_leave': return grLeave(ws.key, false);
    case 'gr_config': { if (!r || r.host !== ws.key || r.state !== 'lobby') return; r.opts = sanitizeOptions(r.game, Object.assign({}, r.opts, msg.opts)); grSend(r); grBroadcastList(r.game); return; }
    case 'gr_start': {
      if (!r || r.host !== ws.key || r.state !== 'lobby') return;
      if (r.members.length < 2) return err('You need at least 2 players');
      r.state = 'countdown'; r.players = r.members.slice(); r.left = new Set(); r.counted = true;
      const seed = crypto.randomBytes(6).toString('hex'), players = r.players.map((k, i) => ({ ...grPub(k), slot: i }));
      for (const k of r.members) sendUser(k, { t: 'gr_go', game: r.game, opts: r.opts, seed, players, host: r.host, you: k, ms: 3500 });
      grBroadcastList(r.game);
      r.startTimer = setTimeout(() => { if (r.state === 'countdown') { r.state = 'running'; grSend(r); } }, 3500);
      return;
    }
    case 'gr_rt': {
      if (!r || (r.state !== 'running' && r.state !== 'countdown')) return;
      let size = 0; try { size = JSON.stringify(msg.d).length; } catch { return; }
      if (!(size < 12000)) return;
      const out = JSON.stringify({ t: 'gr_rt', from: ws.key, d: msg.d });
      for (const k of r.members) if (k !== ws.key) { const o = online.get(k); if (o) for (const s of o.socks) if (s.readyState === 1) s.send(out); }
      return;
    }
    case 'gr_result': { // only the host's browser runs the simulation, so only the host can say who won
      if (!r || r.state !== 'running' || r.host !== ws.key || !Array.isArray(msg.ranking)) return;
      grEnd(r, msg.ranking.map(String), 'done'); return;
    }
  }
}

// ---------- Tung Tung Pictionary (server runs the rounds, picks the words and checks the guesses) ----------
const picRooms = new Map(), picUserRoom = new Map();
const PIC_MAX = 8, PIC_PICK_MS = 15000, PIC_REVEAL_MS = 5500;
const picPub = (k) => publicUser(db.users[k]);
const picNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function picLev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
function picMask(g) { return g.word.split('').map((ch, i) => (/[a-z0-9]/i.test(ch) ? (g.reveal.has(i) ? ch : '_') : ch)).join(''); }
function picView(r, key) {
  const g = r.g;
  const base = { id: r.id, host: r.host, state: r.state, opts: r.opts, max: PIC_MAX, members: r.members.map((k) => ({ ...picPub(k), pts: g ? g.scores[k] || 0 : 0, guessed: !!(g && g.guessed.has(k)), drawer: !!(g && g.drawer === k) })) };
  if (!g) return base;
  const showWord = key === g.drawer || g.guessed.has(key) || g.phase === 'reveal' || g.phase === 'end';
  base.game = { phase: g.phase, round: Math.floor(g.turn / g.order.length) + 1, rounds: r.opts.rounds, turn: g.turn + 1, turns: g.turns, drawer: g.drawer, choices: key === g.drawer && g.phase === 'pick' ? g.choices : null, word: showWord ? g.word : null, hint: g.word ? picMask(g) : '', len: g.word ? g.word.length : 0, endsAt: g.endsAt, now: Date.now(), total: g.phase === 'draw' ? r.opts.time * 1000 : 0, lastWord: g.lastWord || null };
  return base;
}
function picSend(r) { for (const k of r.members) sendUser(k, { t: 'pic_room', room: picView(r, k) }); }
function picList() { return [...picRooms.values()].filter((r) => r.state === 'lobby').map((r) => ({ id: r.id, host: picPub(r.host), count: r.members.length, max: PIC_MAX, opts: r.opts })); }
function picBroadcastList() { const msg = JSON.stringify({ t: 'pic_rooms', rooms: picList() }); for (const ws of wss.clients) if (ws.picWatch && ws.readyState === 1) ws.send(msg); }
function picSay(r, o, only) { const out = { t: 'pic_msg', ...o }; for (const k of only || r.members) sendUser(k, out); }
function picNextTurn(r) {
  const g = r.g; clearTimeout(g.timer);
  if (g.turn >= g.turns) return picFinish(r, 'done');
  g.drawer = g.order[g.turn % g.order.length];
  if (!r.members.includes(g.drawer)) { g.turn++; return picNextTurn(r); }
  g.phase = 'pick'; g.guessed = new Set(); g.reveal = new Set(); g.cmds = []; g.word = ''; g.lastWord = null;
  g.choices = PicWords.pick(3, g.used, 'any'); g.endsAt = Date.now() + PIC_PICK_MS;
  for (const k of r.members) sendUser(k, { t: 'pic_clear' });
  picSend(r);
  g.timer = setTimeout(() => picStartDraw(r, g.choices[0]), PIC_PICK_MS);
}
function picStartDraw(r, word) {
  const g = r.g; if (!g || g.phase !== 'pick') return; clearTimeout(g.timer);
  g.word = word; g.used.add(word); g.phase = 'draw'; g.endsAt = Date.now() + r.opts.time * 1000; g.startedAt = Date.now();
  const letters = g.word.split('').map((c, i) => [c, i]).filter(([c]) => /[a-z0-9]/i.test(c)).map(([, i]) => i);
  g.hintAt = [0.5, 0.75].map((f) => ({ at: g.startedAt + f * r.opts.time * 1000, done: false }));
  g.letterIdx = letters;
  picSend(r);
  g.timer = setTimeout(function tick() {
    if (r.g !== g || g.phase !== 'draw') return;
    const now = Date.now();
    if (now >= g.endsAt) return picReveal(r, 'time');
    for (const h of g.hintAt) if (!h.done && now >= h.at && g.word.length >= 4) { h.done = true; const free = g.letterIdx.filter((i) => !g.reveal.has(i)); if (free.length > 1) { g.reveal.add(free[Math.floor(Math.random() * free.length)]); picSend(r); } }
    g.timer = setTimeout(tick, 500);
  }, 500);
}
function picReveal(r, why) {
  const g = r.g; if (!g || g.phase !== 'draw') return; clearTimeout(g.timer);
  g.phase = 'reveal'; g.lastWord = g.word; g.endsAt = Date.now() + PIC_REVEAL_MS;
  if (g.guessed.size === 0) picSay(r, { kind: 'info', text: `Nobody guessed it! The word was “${g.word}”.` });
  g.turn++;
  picSend(r);
  g.timer = setTimeout(() => picNextTurn(r), PIC_REVEAL_MS);
}
function picFinish(r, why) {
  const g = r.g; if (!g) return; clearTimeout(g.timer);
  const ranking = r.members.map((k) => ({ ...picPub(k), pts: g.scores[k] || 0 })).sort((a, b) => b.pts - a.pts);
  const top = ranking.length ? ranking[0].pts : 0, winners = ranking.filter((x) => x.pts === top && top > 0).map((x) => x.id);
  if (r.counted && why === 'done') {
    for (const x of ranking) recordResult(x.id, 'pictionary', winners.length && winners.includes(x.id) ? (winners.length > 1 ? 'd' : 'w') : 'l');
    saveDb();
  }
  r.state = 'lobby'; r.g = null;
  for (const k of r.members) sendUser(k, { t: 'pic_end', ranking, winners, you: k, reason: why, stats: { game: statsFor(db.users[k], 'pictionary'), all: statsFor(db.users[k], 'all') } });
  picSend(r); picBroadcastList();
}
function picLeave(key, offline) {
  const r = picRooms.get(picUserRoom.get(key));
  if (!r) return;
  const doIt = () => {
    if (picUserRoom.get(key) !== r.id) return;
    if (r.state === 'game' && r.counted) { recordResult(key, 'pictionary', 'l'); saveDb(); }
    r.members = r.members.filter((k) => k !== key);
    picUserRoom.delete(key); if (userMatch.get(key) === r.id) userMatch.delete(key);
    sendUser(key, { t: 'pic_room', room: null });
    if (!r.members.length) { if (r.g) clearTimeout(r.g.timer); picRooms.delete(r.id); }
    else {
      if (r.host === key) r.host = r.members[0];
      if (r.g) {
        r.g.order = r.g.order.filter((k) => k !== key);
        if (r.members.length < 2) { r.counted = r.counted; picFinish(r, 'alone'); }
        else if (r.g.drawer === key) { if (r.g.phase === 'draw') picReveal(r, 'left'); else if (r.g.phase === 'pick') { r.g.turn++; picNextTurn(r); } }
        else if (r.g.phase === 'draw' && r.members.filter((k) => k !== r.g.drawer).every((k) => r.g.guessed.has(k))) picReveal(r, 'all');
      }
      picSend(r);
    }
    picBroadcastList(); schedulePresence();
  };
  if (offline && r.state === 'game') { setTimeout(() => { if (!online.has(key)) doIt(); }, 20000).unref(); return; }
  if (offline && !online.has(key)) return doIt();
  doIt();
}
function picClean(cmds) { // keep commands small and sane (coordinates are 0-1000 integers)
  const out = [], n = (v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0)));
  for (const c of Array.isArray(cmds) ? cmds.slice(0, 40) : []) {
    if (!Array.isArray(c)) continue;
    if (c[0] === 's' && Array.isArray(c[3])) { const pts = c[3].slice(0, 600).map(n); if (pts.length >= 2) out.push(['s', String(c[1]).slice(0, 9), Math.max(1, Math.min(60, Math.round(Number(c[2]) || 6))), pts]); }
    else if (c[0] === 'f') out.push(['f', n(c[1]), n(c[2]), String(c[3]).slice(0, 9)]);
    else if (c[0] === 'c' || c[0] === 'u') out.push([c[0]]);
  }
  return out;
}
function onPic(ws, msg) {
  const err = (message) => wsSend(ws, { t: 'error', message });
  const r = picRooms.get(picUserRoom.get(ws.key)), g = r && r.g;
  switch (msg.t) {
    case 'pic_watch': ws.picWatch = true; wsSend(ws, { t: 'pic_rooms', rooms: picList() }); if (r) wsSend(ws, { t: 'pic_room', room: picView(r, ws.key) }); return;
    case 'pic_unwatch': ws.picWatch = false; return;
    case 'pic_create': {
      if (r) return err('You are already in a room');
      if (userMatch.has(ws.key)) return err('Finish your current match first');
      const rounds = [1, 2, 3].includes(Number(msg.rounds)) ? Number(msg.rounds) : 2, time = [60, 80, 100].includes(Number(msg.time)) ? Number(msg.time) : 80;
      const room = { id: crypto.randomBytes(4).toString('hex'), host: ws.key, members: [ws.key], state: 'lobby', opts: { rounds, time }, g: null, counted: false };
      picRooms.set(room.id, room); picUserRoom.set(ws.key, room.id); userMatch.set(ws.key, room.id);
      picSend(room); picBroadcastList(); schedulePresence(); return;
    }
    case 'pic_join': {
      const room = picRooms.get(String(msg.id));
      if (r) return err('You are already in a room');
      if (userMatch.has(ws.key)) return err('Finish your current match first');
      if (!room || room.state !== 'lobby') return err('That room is not open any more');
      if (room.members.length >= PIC_MAX) return err('That room is full');
      room.members.push(ws.key); picUserRoom.set(ws.key, room.id); userMatch.set(ws.key, room.id);
      picSend(room); picBroadcastList(); schedulePresence(); return;
    }
    case 'pic_leave': return picLeave(ws.key, false);
    case 'pic_config': { if (!r || r.host !== ws.key || r.state !== 'lobby') return; if ([1, 2, 3].includes(Number(msg.rounds))) r.opts.rounds = Number(msg.rounds); if ([60, 80, 100].includes(Number(msg.time))) r.opts.time = Number(msg.time); picSend(r); picBroadcastList(); return; }
    case 'pic_start': {
      if (!r || r.host !== ws.key || r.state !== 'lobby') return;
      if (r.members.length < 2) return err('You need at least 2 players');
      r.state = 'game'; r.counted = true;
      const order = r.members.slice().sort(() => Math.random() - 0.5);
      r.g = { order, turn: 0, turns: order.length * r.opts.rounds, drawer: null, phase: 'pick', word: '', choices: [], used: new Set(), scores: {}, guessed: new Set(), reveal: new Set(), cmds: [], endsAt: 0, timer: null };
      picBroadcastList(); picNextTurn(r); return;
    }
    case 'pic_pick': { if (!g || g.phase !== 'pick' || g.drawer !== ws.key) return; const w = g.choices[Math.floor(Number(msg.i))]; if (w) picStartDraw(r, w); return; }
    case 'pic_draw': {
      if (!g || g.phase !== 'draw' || g.drawer !== ws.key) return;
      const cmds = picClean(msg.cmds); if (!cmds.length) return;
      for (const c of cmds) { if (c[0] === 'c') g.cmds = []; else if (c[0] === 'u') { for (let i = g.cmds.length - 1; i >= 0; i--) if (g.cmds[i][0] === 's' || g.cmds[i][0] === 'f') { g.cmds.splice(i, 1); break; } } else if (g.cmds.length < 5000) g.cmds.push(c); }
      const out = JSON.stringify({ t: 'pic_cmd', cmds });
      for (const k of r.members) if (k !== ws.key) { const o = online.get(k); if (o) for (const s of o.socks) if (s.readyState === 1) s.send(out); }
      return;
    }
    case 'pic_sync': { if (!r) return; wsSend(ws, { t: 'pic_clear' }); if (g) wsSend(ws, { t: 'pic_cmd', cmds: g.cmds.slice(0, 5000) }); return; }
    case 'pic_guess': {
      if (!g || !r) return;
      const text = String(msg.text || '').trim().slice(0, 40); if (!text) return;
      if (g.phase !== 'draw' || g.drawer === ws.key || g.guessed.has(ws.key)) { // chatter among those who already know the word
        const who = [g.drawer, ...g.guessed].filter(Boolean); if (g.phase === 'draw' && who.includes(ws.key)) picSay(r, { kind: 'chat', from: ws.key, text, priv: true }, who); else if (g.phase !== 'draw') picSay(r, { kind: 'chat', from: ws.key, text });
        return;
      }
      if (picNorm(text) === picNorm(g.word)) {
        const left = Math.max(0, g.endsAt - Date.now()), frac = left / (r.opts.time * 1000);
        const gain = Math.round(100 + 300 * frac) + (g.guessed.size === 0 ? 40 : 0);
        g.guessed.add(ws.key); g.scores[ws.key] = (g.scores[ws.key] || 0) + gain; g.scores[g.drawer] = (g.scores[g.drawer] || 0) + 45;
        picSay(r, { kind: 'correct', from: ws.key, gain });
        const rest = r.members.filter((k) => k !== g.drawer);
        if (rest.every((k) => g.guessed.has(k))) { g.scores[g.drawer] += 60; picReveal(r, 'all'); } else picSend(r);
        return;
      }
      const close = picNorm(text).length >= 4 && picLev(picNorm(text), picNorm(g.word)) <= 1;
      picSay(r, { kind: 'chat', from: ws.key, text });
      if (close) picSay(r, { kind: 'close', text: `“${text}” is so close!` }, [ws.key]);
      return;
    }
  }
}

// ---------- Tung Up! open rooms (2-4 racers; the climb itself is simulated in each player's browser) ----------
const tuRooms = new Map(); // id -> room
const tuUserRoom = new Map(); // key -> roomId
const tuPub = (k) => publicUser(db.users[k]);
function tuList() {
  return [...tuRooms.values()].filter((r) => r.state === 'lobby').map((r) => ({ id: r.id, host: tuPub(r.host), count: r.members.length, max: TU_MAX, map: r.map, chaos: r.chaos }));
}
function tuBroadcastList() {
  const msg = JSON.stringify({ t: 'tu_rooms', rooms: tuList() });
  for (const ws of wss.clients) if (ws.tuWatch && ws.readyState === 1) ws.send(msg);
}
function tuView(r) {
  return { id: r.id, host: r.host, state: r.state, map: r.map, chaos: r.chaos, max: TU_MAX, members: r.members.map((k) => ({ ...tuPub(k), progress: (r.prog[k] || 0) })) };
}
function tuSend(r) { for (const k of r.members) sendUser(k, { t: 'tu_room', room: tuView(r) }); }
function tuEnd(r, winnerKey, reason) {
  if (r.state !== 'running') return;
  r.state = 'lobby'; clearTimeout(r.capTimer); clearTimeout(r.startTimer);
  const ranking = r.members.map((k) => ({ ...tuPub(k), progress: r.prog[k] || 0, time: r.fin[k] || null })).sort((a, b) => (b.id === winnerKey) - (a.id === winnerKey) || b.progress - a.progress);
  if (r.counted) for (const k of r.members) recordResult(k, 'tungup', k === winnerKey ? 'w' : 'l');
  saveDb();
  for (const k of r.members) sendUser(k, { t: 'tu_end', winner: winnerKey, reason, ranking, you: k, stats: { game: statsFor(db.users[k], 'tungup'), all: statsFor(db.users[k], 'all') } });
  r.prog = {}; r.fin = {};
  tuSend(r); tuBroadcastList();
}
function tuLeave(key, offline) {
  const r = tuRooms.get(tuUserRoom.get(key));
  if (!r) return;
  const doIt = () => {
    if (tuUserRoom.get(key) !== r.id) return;
    if (r.state === 'running' && r.counted) { recordResult(key, 'tungup', 'l'); saveDb(); }
    r.members = r.members.filter((k) => k !== key);
    tuUserRoom.delete(key); if (userMatch.get(key) === r.id) userMatch.delete(key);
    sendUser(key, { t: 'tu_room', room: null });
    if (!r.members.length) { clearTimeout(r.capTimer); clearTimeout(r.startTimer); tuRooms.delete(r.id); }
    else {
      if (r.host === key) r.host = r.members[0];
      if (r.state === 'running' && r.members.length === 1) { r.counted = r.counted; tuEnd(r, r.members[0], 'alone'); }
      else for (const k of r.members) sendUser(k, { t: 'tu_left', id: key });
      tuSend(r);
    }
    tuBroadcastList(); schedulePresence();
  };
  if (offline && r.state === 'running') { setTimeout(() => { if (!online.has(key)) doIt(); }, 15000).unref(); return; }
  if (offline && !online.has(key)) return doIt();
  doIt();
}
function onTu(ws, msg) {
  const err = (message) => wsSend(ws, { t: 'error', message });
  const r = tuRooms.get(tuUserRoom.get(ws.key));
  switch (msg.t) {
    case 'tu_watch': ws.tuWatch = true; wsSend(ws, { t: 'tu_rooms', rooms: tuList() }); if (r) wsSend(ws, { t: 'tu_room', room: tuView(r) }); return;
    case 'tu_unwatch': ws.tuWatch = false; return;
    case 'tu_create': {
      if (r) return err('You are already in a room');
      if (userMatch.has(ws.key)) return err('Finish your current match first');
      const map = TU_MAPS.includes(msg.map) ? msg.map : 'junkyard', chaos = ['off', 'normal', 'wild'].includes(msg.chaos) ? msg.chaos : 'normal';
      const room = { id: crypto.randomBytes(4).toString('hex'), host: ws.key, members: [ws.key], state: 'lobby', map, chaos, prog: {}, fin: {}, counted: false, capTimer: null, startTimer: null, startAt: 0 };
      tuRooms.set(room.id, room); tuUserRoom.set(ws.key, room.id); userMatch.set(ws.key, room.id);
      tuSend(room); tuBroadcastList(); schedulePresence();
      return;
    }
    case 'tu_join': {
      const room = tuRooms.get(String(msg.id));
      if (r) return err('You are already in a room');
      if (userMatch.has(ws.key)) return err('Finish your current match first');
      if (!room || room.state !== 'lobby') return err('That room is not open any more');
      if (room.members.length >= TU_MAX) return err('That room is full');
      room.members.push(ws.key); tuUserRoom.set(ws.key, room.id); userMatch.set(ws.key, room.id);
      tuSend(room); tuBroadcastList(); schedulePresence();
      return;
    }
    case 'tu_leave': return tuLeave(ws.key, false);
    case 'tu_config': {
      if (!r || r.host !== ws.key || r.state !== 'lobby') return;
      if (TU_MAPS.includes(msg.map)) r.map = msg.map;
      if (['off', 'normal', 'wild'].includes(msg.chaos)) r.chaos = msg.chaos;
      tuSend(r); tuBroadcastList();
      return;
    }
    case 'tu_start': {
      if (!r || r.host !== ws.key || r.state !== 'lobby') return;
      if (r.members.length < 2) return err('You need at least 2 racers');
      r.state = 'countdown'; r.prog = {}; r.fin = {}; r.counted = true;
      const seed = crypto.randomBytes(6).toString('hex');
      const players = r.members.map((k, i) => ({ ...tuPub(k), slot: i }));
      for (const k of r.members) sendUser(k, { t: 'tu_go', seed, map: r.map, chaos: r.chaos, players, you: k, ms: 3500 });
      tuBroadcastList();
      r.startTimer = setTimeout(() => {
        if (r.state !== 'countdown') return;
        r.state = 'running'; r.startAt = Date.now(); tuSend(r);
        r.capTimer = setTimeout(() => { const best = r.members.slice().sort((a, b) => (r.prog[b] || 0) - (r.prog[a] || 0))[0]; tuEnd(r, best, 'timeout'); }, TU_CAP_MS);
      }, 3500);
      return;
    }
    case 'tu_rt': { // relay to the others in the room
      if (!r || (r.state !== 'running' && r.state !== 'countdown')) return;
      let size = 0; try { size = JSON.stringify(msg.d).length; } catch { return; }
      if (!(size < 4000)) return;
      const out = JSON.stringify({ t: 'tu_rt', from: ws.key, d: msg.d });
      for (const k of r.members) if (k !== ws.key) { const o = online.get(k); if (o) for (const s of o.socks) if (s.readyState === 1) s.send(out); }
      return;
    }
    case 'tu_progress': {
      if (!r || r.state !== 'running') return;
      const v = Math.floor(Number(msg.v));
      if (!Number.isFinite(v) || v < (r.prog[ws.key] || 0) || v > 100) return;
      if (v > Math.floor((Date.now() - r.startAt) / 200) + 5) return;
      r.prog[ws.key] = v;
      const out = JSON.stringify({ t: 'tu_prog', from: ws.key, v });
      for (const k of r.members) { const o = online.get(k); if (o) for (const s of o.socks) if (s.readyState === 1) s.send(out); }
      return;
    }
    case 'tu_top': {
      if (!r || r.state !== 'running') return;
      const ms = Date.now() - r.startAt;
      if (ms < 20000 || (r.prog[ws.key] || 0) < 95) return;
      r.prog[ws.key] = 100; r.fin[ws.key] = ms;
      tuEnd(r, ws.key, 'top');
      return;
    }
  }
}
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.game && room.game.phase !== 'result' && Imposter.tick(room.game, now)) afterGameChange(room);
  }
}, 500).unref();

// ---------- WebSocket connections ----------
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.key = null;
  ws.matchId = null;
  ws.tokens = 90;
  ws.lastRefill = Date.now();
  const authTimer = setTimeout(() => { if (!ws.key) ws.close(4001, 'auth timeout'); }, 5000);

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    const now = Date.now();
    ws.tokens = Math.min(90, ws.tokens + ((now - ws.lastRefill) / 1000) * 60);
    ws.lastRefill = now;
    if (ws.tokens < 1) return;
    ws.tokens--;

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (!ws.key) {
      if (msg.t !== 'auth') return;
      const key = sessionKey(String(msg.token || ''));
      if (!key) { wsSend(ws, { t: 'auth_failed' }); return ws.close(4003, 'bad token'); }
      clearTimeout(authTimer);
      ws.key = key;
      ws.token = msg.token;
      addOnline(ws);
      wsSend(ws, { t: 'hello', user: { ...publicUser(db.users[key]), admin: isAdmin(key) } });
      onUserOnline(ws);
      return;
    }

    switch (msg.t) {
      case 'challenge': return onChallenge(ws, msg);
      case 'challenge_response': return onChallengeResponse(ws, msg);
      case 'challenge_cancel': {
        const c = challenges.get(String(msg.id));
        if (c && c.from === ws.key) closeChallenge(c, 'cancelled');
        return;
      }
      case 'arena_join': case 'arena_leave': case 'arena_input': case 'arena_bonk': return onArena(ws, msg);
      case 'sp_move': return onSpMove(ws, msg);
      case 'pool_shot': return onPoolShot(ws, msg);
      case 'tb_move': return onTbMove(ws, msg);
      case 'gr_watch': case 'gr_unwatch': case 'gr_create': case 'gr_join': case 'gr_leave': case 'gr_config': case 'gr_start': case 'gr_rt': case 'gr_result': return onGr(ws, msg);
      case 'pic_watch': case 'pic_unwatch': case 'pic_create': case 'pic_join': case 'pic_leave': case 'pic_config': case 'pic_start': case 'pic_pick': case 'pic_draw': case 'pic_sync': case 'pic_guess': return onPic(ws, msg);
      case 'tu_watch': case 'tu_unwatch': case 'tu_create': case 'tu_join': case 'tu_leave': case 'tu_config': case 'tu_start': case 'tu_rt': case 'tu_progress': case 'tu_top': return onTu(ws, msg);
      case 'rt': return onRt(ws, msg);
      case 'imp_watch': case 'imp_unwatch': case 'imp_create': case 'imp_join': case 'imp_leave':
      case 'imp_start': case 'imp_act': case 'imp_again': return onImp(ws, msg);
      case 'join_match': return onJoin(ws, msg, false);
      case 'resume_match': return onJoin(ws, msg, true);
      case 'progress': return onProgress(ws, msg);
      case 'finish': return onFinish(ws, msg);
      case 'leave_match': {
        const m = matches.get(String(msg.matchId));
        if (m && m.players[ws.key]) forfeit(m, ws.key, 'left');
        return;
      }
    }
  });
  ws.on('close', () => {
    clearTimeout(authTimer);
    if (ws.key) { arenaSocketGone(ws); onSocketGone(ws); removeOnline(ws); }
  });
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000).unref();

// ---------- Real-time games on Socket.IO: Tung Boxing and Dizzy Tungs (see realtime/) ----------
// They bring their own lobbies (quick match and room codes) and run on their own Socket.IO namespaces.
{
  const { Server: IOServer } = require('socket.io');
  const io = new IOServer(server, { serveClient: true, cors: { origin: false } });
  // the games ask the site who a socket is (the session token the page sends) and hand back each online win and loss
  const hooks = {
    auth: (token) => { const key = sessionKey(String(token || '')); return key && db.users[key] ? { key, name: db.users[key].username } : null; },
    record: (key, game, result) => { if (GAMES[game] && (result === 'w' || result === 'l')) { recordResult(key, game, result); saveDb(); } },
  };
  import('./realtime/boxing.mjs').then((m) => m.setupBoxing(io, hooks)).catch((e) => console.error('Tung Boxing failed to start', e));
  import('./realtime/dizzy.mjs').then((m) => m.setupDizzy(io, hooks)).catch((e) => console.error('Dizzy Tungs failed to start', e));
}

// ---------- Tung Arena: the lobby where tungs run around, bonk each other and pick a game ----------
// Players are the logged-in accounts on the arena page. The server runs the world and the clients send inputs. A game is
// started by standing on its log: 2 tungs on the same log for 10 seconds start the 1v1 match, and 1 tung alone on a
// practice-corner log for 10 seconds goes to that game's solo mode.
const AR = { w: 4600, h: 3200, r: 28, tick: 30, speed: 320, range: 85, cooldown: 0.6, knock: 900, friction: 6, hold: 10, max: 40 };
const AR_COLORS = ['#c8874a', '#a86b35', '#d9a066', '#8b5a2b', '#e0b07a', '#b5793f'];
const arenaPlayers = new Map(); // key -> player
let arenaTimer = null, arenaTickNo = 0;
const arenaGameMeta = (g) => ({ title: GAMES[g].title, icon: GAMES[g].icon });
const arenaLogs = (() => {
  const logs = [];
  const mp = Object.keys(GAMES).filter((g) => !GAMES[g].soloOnly && !GAMES[g].external && !(GAMES[g].rooms && !GAMES[g].challenge));
  mp.push('dizzy', 'boxing'); // they run their own rooms, so a log sends the tungs on it to the same room (see arenaLaunch)
  // multiplayer logs: evenly around the edge of the map, long side along the wall
  const inset = 120, W = AR.w - inset * 2, H = AR.h - inset * 2, P = 2 * (W + H), step = P / mp.length;
  const at = (s) => {
    s = ((s % P) + P) % P;
    if (s < W) return { x: inset + s, y: inset, v: false };
    s -= W; if (s < H) return { x: inset + W, y: inset + s, v: true };
    s -= H; if (s < W) return { x: inset + W - s, y: inset + H, v: false };
    s -= W; return { x: inset, y: inset + H - s, v: true };
  };
  mp.forEach((g, i) => {
    const p = at(step * (i + 0.5));
    const pair = !!GAMES[g].external; // true for the games that bring their own lobby
    logs.push({ id: 'mp:' + g, game: g, kind: 'mp', need: 2, max: g === 'dizzy' ? 4 : 2, pair, x: p.x, y: p.y, w: p.v ? 92 : 210, h: p.v ? 210 : 92 });
  });
  // practice corner: one small log per game, in a grid well inside the map (about 600 pixels from the logs on the edge)
  const all = Object.keys(GAMES), cols = 6, cw = 190, ch = 130, gx = Math.round(AR.w * 0.58), gy = Math.round(AR.h * 0.55);
  all.forEach((g, i) => logs.push({ id: 'solo:' + g, game: g, kind: 'solo', need: 1, x: gx + (i % cols) * cw + cw / 2, y: gy + Math.floor(i / cols) * ch + ch / 2, w: 140, h: 60 }));
  for (const l of logs) { l.order = []; l.since = null; }
  return logs;
})();
// The practice corner (its rug) and every log are safe: nobody can be bonked there, and nobody there can bonk.
const arenaSafe = (() => {
  const solos = arenaLogs.filter((l) => l.kind === 'solo');
  return { x0: Math.min(...solos.map((l) => l.x - 95)), x1: Math.max(...solos.map((l) => l.x + 95)), y0: Math.min(...solos.map((l) => l.y - 78)), y1: Math.max(...solos.map((l) => l.y + 62)) };
})();
function inSafeZone(p) {
  if (p.x >= arenaSafe.x0 && p.x <= arenaSafe.x1 && p.y >= arenaSafe.y0 && p.y <= arenaSafe.y1) return true;
  const pad = AR.r * 0.6; // standing partly on a log counts
  return arenaLogs.some((l) => Math.abs(p.x - l.x) <= l.w / 2 + pad && Math.abs(p.y - l.y) <= l.h / 2 + pad);
}
// Tung Showdown: at the top of the arena, a round platform over a bottomless pit, reached by a bridge. Bonk people off to build a streak.
const SD = { cx: AR.w / 2, cy: 780, plat: 300, abyss: 470, bx0: AR.w / 2 - 60, bx1: AR.w / 2 + 60, by0: 780 + 300 - 40, by1: 780 + 470 + 60 };
SD.respawn = { x: SD.cx, y: SD.by1 + 90 }; // where a tung that fell comes back: on the floor below the bridge
const sdOnPlatform = (p) => Math.hypot(p.x - SD.cx, p.y - SD.cy) <= SD.plat;
const sdOnBridge = (p) => p.x >= SD.bx0 && p.x <= SD.bx1 && p.y >= SD.by0 && p.y <= SD.by1;
const sdInPit = (p) => Math.hypot(p.x - SD.cx, p.y - SD.cy) <= SD.abyss;
const SD_COIN_CAP = 16; // tung coins per 10-streak step: 1, 2, 4, 8, 16, then 16 each
let sdDirty = true, sdSentAt = 0;
function sdBoard() {
  const cur = [...arenaPlayers.values()].filter((p) => p.z && p.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 5).map((p) => [p.name, p.streak]);
  const all = Object.values(db.users).filter((u) => !u.removed && u.showdown && u.showdown.best > 0).sort((a, b) => b.showdown.best - a.showdown.best).slice(0, 5).map((u) => [u.username, u.showdown.best]);
  return { cur, all };
}
function sdEndStreak(p) { if (p.streak) { p.streak = 0; sdDirty = true; } }
function sdAddStreak(a, victim) {
  const now = Date.now();
  a.credited = a.credited || {};
  if (a.credited[victim.key] && now - a.credited[victim.key] < 15000) return; // the same tung can't be knocked off again and again for credit
  a.credited[victim.key] = now;
  a.streak++; sdDirty = true;
  const u = db.users[a.key]; if (!u) return;
  u.showdown = u.showdown || { best: 0 };
  if (a.streak > u.showdown.best) { u.showdown.best = a.streak; saveDb(); }
  if (a.streak % 10 === 0) { // 10 knock-offs: 1 coin, 20: 2, 30: 4, 40: 8 ...
    const coins = Math.min(SD_COIN_CAP, 2 ** (a.streak / 10 - 1)), sh = shopOf(u);
    sh.bonus = (sh.bonus || 0) + coins; saveDb();
    wsSend(a.ws, { t: 'arena_event', type: 'coins', n: coins, streak: a.streak });
    arenaBroadcast({ t: 'arena_event', type: 'streak', name: a.name, streak: a.streak });
  }
}
function sdFall(p) {
  p.fall = 1; p.vx = p.vy = 0;
  const hit = p.lastHit;
  if (hit && Date.now() - hit.at < 5000) { const a = arenaPlayers.get(hit.key); if (a && a !== p && a.z && !a.fall) sdAddStreak(a, p); }
  p.lastHit = null; sdEndStreak(p);
}

const arenaInfo = () => ({
  arena: { w: AR.w, h: AR.h }, radius: AR.r, hold: AR.hold, safe: arenaSafe, showdown: SD, board: sdBoard(),
  logs: arenaLogs.map((l) => ({ id: l.id, game: l.game, kind: l.kind, need: l.need, x: l.x, y: l.y, w: l.w, h: l.h, title: arenaGameMeta(l.game).title, icon: arenaGameMeta(l.game).icon })),
});
const arenaSpawn = () => ({ x: AR.w * 0.3 + Math.random() * AR.w * 0.2, y: AR.h * 0.45 + Math.random() * AR.h * 0.17 });

function arenaJoin(ws) {
  if (!ws.key || !db.users[ws.key]) return;
  let p = arenaPlayers.get(ws.key);
  if (!p) {
    if (arenaPlayers.size >= AR.max) return wsSend(ws, { t: 'arena_full' });
    if (userMatch.has(ws.key)) return wsSend(ws, { t: 'error', message: 'Finish your current match first' });
    const sp = arenaSpawn(), u = db.users[ws.key];
    p = { key: ws.key, name: u.username, color: AR_COLORS[[...ws.key].reduce((a, c) => a + c.charCodeAt(0), 0) % AR_COLORS.length],
      x: sp.x, y: sp.y, vx: 0, vy: 0, facing: 0, input: { up: false, down: false, left: false, right: false, aim: 0 },
      cooldown: 0, swing: 0, stunned: 0, score: 0, q: gearOf(u), streak: 0, z: false, fall: 0, lastHit: null, ws };
    arenaPlayers.set(ws.key, p);
    arenaBroadcast({ t: 'arena_event', type: 'join', name: p.name });
  }
  p.ws = ws;
  wsSend(ws, { t: 'arena_welcome', you: ws.key, ...arenaInfo() });
  if (!arenaTimer) arenaTimer = setInterval(arenaStep, 1000 / AR.tick);
}
function arenaLeave(key, quiet) {
  const p = arenaPlayers.get(key);
  if (!p) return;
  arenaPlayers.delete(key); sdDirty = true;
  for (const l of arenaLogs) { l.order = l.order.filter((k) => k !== key); if (l.order.length < l.need) l.since = null; }
  if (!quiet) arenaBroadcast({ t: 'arena_event', type: 'leave', name: p.name });
  if (!arenaPlayers.size && arenaTimer) { clearInterval(arenaTimer); arenaTimer = null; }
}
function arenaSocketGone(ws) { const p = ws.key && arenaPlayers.get(ws.key); if (p && p.ws === ws) arenaLeave(ws.key); }
function arenaBroadcast(msg) { const out = JSON.stringify(msg); for (const p of arenaPlayers.values()) if (p.ws.readyState === 1) p.ws.send(out); }

function onArena(ws, msg) {
  switch (msg.t) {
    case 'arena_join': return arenaJoin(ws);
    case 'arena_leave': return arenaLeave(ws.key, false);
    case 'arena_input': {
      const p = arenaPlayers.get(ws.key);
      if (!p || p.ws !== ws || !msg.i || typeof msg.i !== 'object') return;
      for (const k of ['up', 'down', 'left', 'right']) p.input[k] = !!msg.i[k];
      if (Number.isFinite(msg.i.aim)) p.input.aim = msg.i.aim;
      return;
    }
    case 'arena_bonk': {
      const p = arenaPlayers.get(ws.key);
      if (!p || p.ws !== ws || p.cooldown > 0 || p.stunned > 0 || p.fall > 0) return;
      if (inSafeZone(p)) { // no bonking from a log or from the practice corner
        if (!p.safeAt || Date.now() - p.safeAt > 1500) { p.safeAt = Date.now(); wsSend(ws, { t: 'arena_event', type: 'safe' }); }
        return;
      }
      p.cooldown = AR.cooldown; p.swing = 0.2;
      for (const o of arenaPlayers.values()) {
        if (o === p || o.fall > 0 || inSafeZone(o)) continue; // nobody on a log or in the practice corner can be bonked
        const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy);
        if (d > AR.range + AR.r) continue;
        let diff = Math.abs(Math.atan2(dy, dx) - p.facing);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff > Math.PI / 2) continue;
        o.vx += (dx / (d || 1)) * AR.knock; o.vy += (dy / (d || 1)) * AR.knock; o.stunned = 0.35; p.score++; o.lastHit = { key: p.key, at: Date.now() };
        arenaBroadcast({ t: 'arena_event', type: 'bonk', from: p.name, to: o.name, x: Math.round(o.x), y: Math.round(o.y) });
      }
    }
  }
}

function arenaStep() {
  const dt = 1 / AR.tick, now = Date.now();
  for (const p of arenaPlayers.values()) {
    p.cooldown = Math.max(0, p.cooldown - dt); p.swing = Math.max(0, p.swing - dt); p.stunned = Math.max(0, p.stunned - dt);
    if (p.fall > 0) { // falling into the pit: no control, then back on the floor below the bridge
      p.fall -= dt;
      if (p.fall <= 0) { p.fall = 0; p.x = SD.respawn.x + (Math.random() - 0.5) * 80; p.y = SD.respawn.y; p.vx = p.vy = 0; p.stunned = 0.3; p.z = false; }
      continue;
    }
    p.facing = p.input.aim;
    let mx = 0, my = 0;
    if (p.stunned <= 0) {
      if (p.input.up) my--; if (p.input.down) my++; if (p.input.left) mx--; if (p.input.right) mx++;
      const len = Math.hypot(mx, my); if (len) { mx /= len; my /= len; }
    }
    p.x += (mx * AR.speed + p.vx) * dt; p.y += (my * AR.speed + p.vy) * dt;
    const decay = Math.exp(-AR.friction * dt); p.vx *= decay; p.vy *= decay;
    if (p.x < AR.r) { p.x = AR.r; p.vx = Math.abs(p.vx) * 0.5; }
    if (p.x > AR.w - AR.r) { p.x = AR.w - AR.r; p.vx = -Math.abs(p.vx) * 0.5; }
    if (p.y < AR.r) { p.y = AR.r; p.vy = Math.abs(p.vy) * 0.5; }
    if (p.y > AR.h - AR.r) { p.y = AR.h - AR.r; p.vy = -Math.abs(p.vy) * 0.5; }
    // the showdown: off the platform and the bridge, inside the pit, you fall; walking back out onto the floor ends the streak too
    const inZone = sdInPit(p) || sdOnBridge(p);
    if (inZone && !sdOnPlatform(p) && !sdOnBridge(p)) { sdFall(p); p.z = true; continue; }
    if (p.z && !inZone) sdEndStreak(p);
    if (p.z !== inZone) { p.z = inZone; sdDirty = true; }
  }
  // the logs: who stands on which, and when the 10 seconds are up
  const gone = [];
  for (const l of arenaLogs) {
    const hw = l.w / 2, hh = l.h / 2;
    const on = [...arenaPlayers.values()].filter((p) => Math.abs(p.x - l.x) <= hw && Math.abs(p.y - l.y) <= hh).map((p) => p.key);
    l.order = l.order.filter((k) => on.includes(k));
    for (const k of on) if (!l.order.includes(k)) l.order.push(k);
    if (l.order.length >= l.need) { if (l.since === null) l.since = now; } else l.since = null;
    if (l.since !== null && now - l.since >= AR.hold * 1000) { gone.push(l); l.since = null; }
  }
  for (const l of gone) arenaLaunch(l);

  if (sdDirty && now - sdSentAt > 1000) { sdDirty = false; sdSentAt = now; arenaBroadcast({ t: 'arena_sd', board: sdBoard() }); }
  arenaTickNo++;
  if (arenaTickNo % 3 === 2) return; // snapshots go out at 20 per second
  const players = [...arenaPlayers.values()].map((p) => ({
    id: p.key, n: p.name, c: p.color, x: Math.round(p.x), y: Math.round(p.y),
    f: Math.round(p.facing * 100) / 100, s: p.swing > 0 ? 1 : 0, st: p.stunned > 0 ? 1 : 0, sc: p.score, q: p.q, z: p.z ? 1 : 0, k: p.streak, fl: p.fall > 0 ? Math.round(p.fall * 100) / 100 : 0,
  }));
  const logsOn = arenaLogs.filter((l) => l.order.length).map((l) => [l.id, l.order.length, l.since === null ? -1 : Math.max(0, Math.ceil(AR.hold - (now - l.since) / 1000))]);
  arenaBroadcast({ t: 'arena_state', ts: now, players, logs: logsOn });
}

function arenaLaunch(l) {
  const keys = l.order.slice(0, l.max || l.need);
  if (l.kind === 'solo') {
    const k = keys[0];
    sendUser(k, { t: 'arena_solo', game: l.game });
    arenaLeave(k, true);
    return;
  }
  if (l.pair) { // Dizzy Tungs and Tung Boxing: everyone gets the same key, and the game page matches them up with each other
    const key = crypto.randomBytes(6).toString('hex');
    for (const k of keys) { sendUser(k, { t: 'arena_pair', game: l.game, key, name: db.users[k] ? db.users[k].username : '' }); arenaLeave(k, true); }
    return;
  }
  const [a, b] = keys;
  if (!a || !b || userMatch.has(a) || userMatch.has(b) || !online.has(a) || !online.has(b)) return;
  const m = createMatch({ id: crypto.randomBytes(6).toString('hex'), game: l.game, from: a, to: b, options: sanitizeOptions(l.game, {}) });
  for (const k of m.keys) {
    sendUser(k, { t: 'match_start', matchId: m.id, game: m.game, options: m.options });
    arenaLeave(k, true);
  }
}

async function start() {
  if (REMOTE) await loadRemote();
  server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🥁 Tung Tung Arcade is running`);
  console.log(`   This computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`   On your network: http://${i.address}:${PORT}`);
  }
  console.log(REMOTE ? '   Accounts are saved in Supabase (and ./data)\n' : '   Accounts are saved in ./data\n');
  });
}
start();
