'use strict';

const express = require('express');
const path = require('path');
const session = require('express-session');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');
const { google } = require('googleapis');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { readDatabaseConfig } = require('./lib/databaseConfig');
const app = express();

const envFilePath = path.join(__dirname, '.env');
if (fs.existsSync(envFilePath)) {
  const envContent = fs.readFileSync(envFilePath, 'utf8');
  for (const rawLine of envContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function envBool(name, defaultValue = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function envNumber(name, defaultValue) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const TRUST_PROXY = envBool('TRUST_PROXY', NODE_ENV === 'production');
const SESSION_SECRET = process.env.SESSION_SECRET || 'outil-pme-secret';
const SESSION_COOKIE_SECURE = envBool('SESSION_COOKIE_SECURE', NODE_ENV === 'production');
const SESSION_COOKIE_SAMESITE = process.env.SESSION_COOKIE_SAMESITE || 'lax';
const MFA_ALLOWED_EMAILS = new Set(
  String(process.env.MFA_ALLOWED_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);
const MFA_CODE_TTL_MINUTES = envNumber('MFA_CODE_TTL_MINUTES', 10);
const MFA_CODE_TTL_MS = MFA_CODE_TTL_MINUTES * 60 * 1000;
const MFA_MAX_CODE_ATTEMPTS = envNumber('MFA_MAX_CODE_ATTEMPTS', 5);
const MFA_LOCK_MS = envNumber('MFA_LOCK_MINUTES', 15) * 60 * 1000;
const MFA_RESEND_COOLDOWN_MS = envNumber('MFA_RESEND_COOLDOWN_SECONDS', 60) * 1000;
const MFA_REQUEST_WINDOW_MS = envNumber('MFA_REQUEST_WINDOW_MINUTES', 10) * 60 * 1000;
const MFA_MAX_REQUESTS_PER_WINDOW = envNumber('MFA_MAX_REQUESTS_PER_WINDOW', 5);
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = envNumber('SMTP_PORT', 587);
const SMTP_SECURE = envBool('SMTP_SECURE', false);
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '');
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || '').trim();

const mfaRequestLimits = new Map();

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.get('/test', (req, res) => {
  res.send('SERVEUR OK');
});

app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});



/* ===================== HELPERS (Windows-safe) ===================== */

const WINDOWS_RESERVED = new Set([
  'CON','PRN','AUX','NUL',
  'COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9',
  'LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9',
]);

function safeLabel(str) {
  return String(str || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim();
}

// Dossiers (client/commande) : espaces conservés (lisible), Windows-safe
function safeName(str) {
  let s = safeLabel(str);
  if (!s || s === '.' || s === '..') s = 'item';
  s = s.replace(/[. ]+$/g, '');
  if (!s) s = 'item';
  const up = s.toUpperCase();
  if (WINDOWS_RESERVED.has(up)) s = `${s}_1`;
  if (s.length > 120) s = s.slice(0, 120);
  return s;
}

// Fichiers/segments URL : espaces -> _, Windows-safe
function safeSegment(str) {
  let s = safeLabel(str).replace(/\s+/g, '_');
  if (!s || s === '.' || s === '..') s = 'item';
  s = s.replace(/[. ]+$/g, '');
  if (!s) s = 'item';
  const up = s.toUpperCase();
  if (WINDOWS_RESERVED.has(up)) s = `${s}_1`;
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseDecimalInput(value, fallback = 0) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return fallback;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function toMinutes(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fmtMinutes(mins) {
  const h = Math.floor((mins || 0) / 60);
  const m = (mins || 0) % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

// Poids tôle : mm + densité "g/cm3" (acier ~7.85)
function calcSheetKg({ th_mm, w_mm, l_mm, density }) {
  const th = Number(th_mm) || 0;
  const w = Number(w_mm) || 0;
  const l = Number(l_mm) || 0;
  const dens = Number(density) || 7.85; // g/cm3 => 7850 kg/m3

  const Lm = l / 1000;
  const Wm = w / 1000;
  const Tm = th / 1000;

  const volume_m3 = Lm * Wm * Tm;
  const kg_per_m3 = dens * 1000; // 7.85 => 7850 kg/m3
  return volume_m3 * kg_per_m3;
}

function infoBar(left, right) {
  return `
    <div class="info-bar">
      <div class="info-left">${left}</div>
      <div class="info-right">${right}</div>
    </div>
  `;
}

function gridCards(cardsHtml) {
  return `<section class="cards-grid">${cardsHtml}</section>`;
}

function uniqueFolder(baseDir, wanted) {
  let name = wanted;
  let i = 2;
  while (fs.existsSync(path.join(baseDir, name))) name = `${wanted}_${i++}`;
  return name;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveStoragePath(value, fallback) {
  const raw = String(value || fallback || '').trim();
  const target = raw || path.join(__dirname, 'storage');
  return path.isAbsolute(target) ? path.normalize(target) : path.join(__dirname, target);
}

const STORAGE_DIR = resolveStoragePath(process.env.OUTIL_PME_STORAGE_DIR, path.join(__dirname, 'storage'));
const DATA_DIR = resolveStoragePath(process.env.OUTIL_PME_DATA_DIR, path.join(STORAGE_DIR, 'data'));
const DATABASE_CONFIG = readDatabaseConfig(process.env);

if (DATABASE_CONFIG.client !== 'sqlite') {
  throw new Error(`DB_CLIENT=${DATABASE_CONFIG.client} est préparé, mais le code métier utilise encore SQLite. Garder DB_CLIENT=sqlite jusqu'à la migration PostgreSQL.`);
}

const DB_PATH = resolveStoragePath(DATABASE_CONFIG.sqlite.path, path.join(DATA_DIR, 'app.db'));
const CLIENT_PC_DIR = resolveStoragePath(process.env.OUTIL_PME_CLIENTS_DIR, path.join(STORAGE_DIR, 'clients'));
const CLIENT_ORDER_FILES_DIR = resolveStoragePath(
  process.env.OUTIL_PME_ATTACHMENTS_DIR || process.env.OUTIL_PME_CLIENT_ORDER_FILES_DIR,
  path.join(STORAGE_DIR, 'client_orders_files')
);
const QUOTE_PHOTO_DIR = resolveStoragePath(process.env.OUTIL_PME_QUOTE_PHOTO_DIR, path.join(STORAGE_DIR, 'quote_photos'));
const PDF_STORAGE_DIR = resolveStoragePath(process.env.OUTIL_PME_PDF_DIR, path.join(STORAGE_DIR, 'pdf'));

ensureDir(STORAGE_DIR);
ensureDir(DATA_DIR);
ensureDir(path.dirname(DB_PATH));
ensureDir(CLIENT_PC_DIR);
ensureDir(CLIENT_ORDER_FILES_DIR);
ensureDir(QUOTE_PHOTO_DIR);
ensureDir(PDF_STORAGE_DIR);

const MEASUREMENTS_PUBLIC_DIR = path.join(__dirname, 'modules', 'measurements', 'public');
const MEASUREMENT_SHEETS = {
  escalier: 'measurements.html',
  'garde-corps': 'garde-corps.html',
  portail: 'portail.html',
  cloture: 'cloture.html',
};
const MEASUREMENTS_ASSETS = new Set(['measurements.css', 'measurements.js', 'module-sheet.js']);
const CHANTIER_STATUSES = ['À préparer', 'En fabrication', 'En pose', 'En attente', 'Terminé', 'Facturé'];
const QUOTE_STATUSES = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Facturé'];

function safeResolveInside(baseDir, ...parts) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...parts);
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error('Chemin invalide');
  }
  return target;
}
function normalizeKey(str) {
  return safeName(str).toLowerCase();
}
/* ===================== DB INIT ===================== */

const dataDir = DATA_DIR;
const dbPath = DB_PATH;

console.log('Base SQLite :', dbPath);
console.log('Dossier storage :', STORAGE_DIR);


const db = new Database(dbPath);

initializeSqlite(db);

/* ===================== TABLES + MIGRATIONS ===================== */

function initializeSqlite(database) {
  function ensureColumn(table, col, type) {
    const cols = database.prepare(`PRAGMA table_info(${table})`).all();
    const exists = cols.some((c) => c.name === col);
    if (!exists) {
      database.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`).run();
      console.log(`✅ Ajout colonne ${table}.${col}`);
    }
  }

  createSqliteTables(database);
  runSqliteMigrations(ensureColumn);
  runSqliteNormalizations(database);
  initializeDefaultUsers(database);
  logSqliteDebug(database);
}

function createSqliteTables(database) {
  database.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      address TEXT,
      postal_code TEXT,
      city TEXT,
      email TEXT,
      phone TEXT,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      status TEXT,
      client_id INTEGER,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
	      date TEXT NOT NULL,
	      price REAL DEFAULT 0,
        planned_hours REAL DEFAULT 0,
        done_hours REAL DEFAULT 0,
        chantier_status TEXT DEFAULT 'À préparer',
        chantier_start_date TEXT,
        chantier_end_date TEXT,
        chantier_progress REAL DEFAULT 0,
        chantier_notes TEXT,
	      status TEXT DEFAULT 'En cours',
	      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS supplier_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'En cours',
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS chantier_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client TEXT NOT NULL,
      order_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER DEFAULT 0,
      minutes_total INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS chantiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client_id INTEGER NULL,
      description TEXT,
      status TEXT DEFAULT 'À préparer',
      planned_hours REAL DEFAULT 0,
      done_hours REAL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      client_name TEXT,
      client_email TEXT,
      client_phone TEXT,
      client_address TEXT,
      status TEXT DEFAULT 'Brouillon',
      vat_rate REAL DEFAULT 20,
      created_at TEXT NOT NULL
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS quote_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL,
      category TEXT,
      label TEXT NOT NULL,
      qty REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      position INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      name TEXT,
      unit TEXT,
      price REAL NOT NULL DEFAULT 0,
      kg_per_m REAL,
      density REAL,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT,
      record_name TEXT,
      client TEXT,
      chantier TEXT,
      measure_date TEXT,
      quote_id INTEGER NULL,
      client_order_id INTEGER NULL,
      data TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();
}

function runSqliteMigrations(ensureColumn) {
  ensureColumn('users', 'role', "TEXT DEFAULT 'admin'");
  ensureColumn('clients', 'address', 'TEXT');
  ensureColumn('clients', 'postal_code', 'TEXT');
  ensureColumn('clients', 'city', 'TEXT');
  ensureColumn('clients', 'email', 'TEXT');
  ensureColumn('clients', 'phone', 'TEXT');
  ensureColumn('clients', 'created_at', 'TEXT');
  ensureColumn('events', 'type', 'TEXT');
  ensureColumn('client_orders', 'planned_hours', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'done_hours', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'chantier_status', "TEXT DEFAULT 'À préparer'");
  ensureColumn('client_orders', 'chantier_start_date', 'TEXT');
  ensureColumn('client_orders', 'chantier_end_date', 'TEXT');
  ensureColumn('client_orders', 'chantier_progress', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'chantier_notes', 'TEXT');
  ensureColumn('client_orders', 'status', 'TEXT');
  ensureColumn('supplier_orders', 'status', 'TEXT');
  ensureColumn('tasks', 'status', 'TEXT');
  ensureColumn('tasks', 'to_invoice', 'INTEGER DEFAULT 0');
  ensureColumn('quotes', 'title', 'TEXT');
  ensureColumn('quotes', 'client_name', 'TEXT');
  ensureColumn('quotes', 'client_email', 'TEXT');
  ensureColumn('quotes', 'client_phone', 'TEXT');
  ensureColumn('quotes', 'client_address', 'TEXT');
  ensureColumn('quotes', 'status', 'TEXT');
  ensureColumn('quotes', 'created_at', 'TEXT');
  ensureColumn('quotes', 'vat_rate', 'REAL DEFAULT 20');
  ensureColumn('quotes', 'margin_pct', 'REAL');
  ensureColumn('quotes', 'notes', 'TEXT');
  ensureColumn('quotes', 'photos', 'TEXT');
  ensureColumn('materials', 'type', 'TEXT');
  ensureColumn('materials', 'name', 'TEXT');
  ensureColumn('materials', 'unit', 'TEXT');
  ensureColumn('materials', 'price', 'REAL');
  ensureColumn('materials', 'kg_per_m', 'REAL');
  ensureColumn('materials', 'density', 'REAL');
  ensureColumn('materials', 'created_at', 'TEXT');
  ensureColumn('chantiers', 'name', 'TEXT');
  ensureColumn('chantiers', 'client_id', 'INTEGER');
  ensureColumn('chantiers', 'description', 'TEXT');
  ensureColumn('chantiers', 'status', "TEXT DEFAULT 'À préparer'");
  ensureColumn('chantiers', 'planned_hours', 'REAL DEFAULT 0');
  ensureColumn('chantiers', 'done_hours', 'REAL DEFAULT 0');
  ensureColumn('chantiers', 'start_date', 'TEXT');
  ensureColumn('chantiers', 'end_date', 'TEXT');
  ensureColumn('chantiers', 'created_at', 'TEXT');
  ensureColumn('measurements', 'module', 'TEXT');
  ensureColumn('measurements', 'record_name', 'TEXT');
  ensureColumn('measurements', 'client', 'TEXT');
  ensureColumn('measurements', 'chantier', 'TEXT');
  ensureColumn('measurements', 'measure_date', 'TEXT');
  ensureColumn('measurements', 'quote_id', 'INTEGER NULL');
  ensureColumn('measurements', 'client_order_id', 'INTEGER NULL');
  ensureColumn('measurements', 'data', 'TEXT');
  ensureColumn('measurements', 'created_at', 'TEXT');
  ensureColumn('measurements', 'updated_at', 'TEXT');
}

function runSqliteNormalizations(database) {
  database.prepare(`UPDATE materials SET type = 'tube' WHERE type IS NULL OR type = ''`).run();
  database.prepare(`
    UPDATE users
    SET role = 'admin'
    WHERE username IN ('admin','Bastien')
  `).run();
}

function initializeDefaultUsers(database) {
  const userCount = database.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    database.prepare(`
      INSERT INTO users (username, password, role)
      VALUES (?, ?, ?)
    `).run('admin', 'admin', 'admin');

    database.prepare(`
      INSERT INTO users (username, password, role)
      VALUES (?, ?, ?)
    `).run('Bastien', 'Escalier233!', 'admin');

    database.prepare(`
      INSERT INTO users (username, password, role)
      VALUES (?, ?, ?)
    `).run('atelier', 'atelier123', 'atelier');
    return;
  }

  const atelierExists = database
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('atelier');

  if (!atelierExists) {
    database.prepare(`
      INSERT INTO users (username, password, role)
      VALUES (?, ?, ?)
    `).run('atelier', 'atelier123', 'atelier');
  }
}

function logSqliteDebug(database) {
  console.log('TASKS');
  console.log(database.prepare('PRAGMA table_info(tasks)').all());

  console.log('CLIENT_ORDERS');
  console.log(database.prepare('PRAGMA table_info(client_orders)').all());

  console.log('SUPPLIER_ORDERS');
  console.log(database.prepare('PRAGMA table_info(supplier_orders)').all());

  const sqliteUsers = database.prepare(
    'SELECT id, username, role FROM users'
  ).all();

  console.log('UTILISATEURS =', sqliteUsers);
  console.log(sqliteUsers);
  console.log('BASE =', dbPath);
  console.log('UTILISATEURS =', sqliteUsers);
}
/* ===================== STANDARD SUBFOLDERS ===================== */

const STANDARD_SUBFOLDERS = ['Devis', 'Plans', 'Factures', 'Photos', 'Commandes', 'Heure chantier'];

function ensureStandardSubfolders(baseDir) {
  STANDARD_SUBFOLDERS.forEach((sub) => ensureDir(path.join(baseDir, sub)));
}

/* ===================== MULTER ===================== */

// Upload côté interne (par commande client via id)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const orderId = req.params.id || req.body.orderId;
      if (!orderId) return cb(new Error('Aucune commande spécifiée'));

      const dir = safeResolveInside(CLIENT_ORDER_FILES_DIR, String(orderId));
      ensureDir(dir);

      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const safeFileName = `${Date.now()}-${safeSegment(file.originalname || 'file')}`;
    cb(null, safeFileName);
  },
});
const upload = multer({ storage }); // conservé

// Upload direct dans dossier PC : /pc-folders/:client/:order/:type/upload
const pcStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const client = safeName(req.params.client);
      const order = safeName(req.params.order);
      const type = String(req.params.type || '').trim();

      if (!client || !order || !type) return cb(new Error('Dossier cible invalide'));
      if (!STANDARD_SUBFOLDERS.includes(type)) return cb(new Error('Type de dossier interdit'));

      const dir = safeResolveInside(CLIENT_PC_DIR, client, order, type);
      ensureDir(dir);
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const safeFileName = `${Date.now()}-${safeSegment(file.originalname || 'file')}`;
    cb(null, safeFileName);
  },
});
const pcUpload = multer({ storage: pcStorage });
const quotePhotoStorage = multer.diskStorage({

  destination(req, file, cb) {
    try {
      const quoteId = Number(req.params.id || 0);
      if (!Number.isFinite(quoteId) || quoteId <= 0) return cb(new Error('ID devis invalide'));

      const dir = safeResolveInside(QUOTE_PHOTO_DIR, String(quoteId));
      ensureDir(dir);
      req.quotePhotoDir = dir;
      console.log('UPLOAD DEVIS DESTINATION', { id: req.params.id, dir });

      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },

  filename(req, file, cb) {
    const safeFileName = `${Date.now()}-${safeSegment(file.originalname || 'fichier')}`;
    req.quotePhotoFilename = safeFileName;
    cb(null, safeFileName);

  }

});

const quotePhotoUpload =
  multer({ storage: quotePhotoStorage });
/* ===================== MIDDLEWARES ===================== */

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'outil-pme.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: SESSION_COOKIE_SECURE,
    httpOnly: true,
    sameSite: SESSION_COOKIE_SAMESITE
  }
}));


function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role === 'atelier') return res.status(403).send('Accès réservé aux administrateurs');
  next();
}

function requirePendingMfa(req, res, next) {
  if (req.session.user) return res.redirect('/dashboard');
  if (!req.session.pendingMfaUser) return res.redirect('/login');
  next();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function getMfaRequestLimit(key) {
  const now = Date.now();
  const current = mfaRequestLimits.get(key);
  if (!current || current.windowExpiresAt <= now) {
    const fresh = {
      count: 0,
      windowExpiresAt: now + MFA_REQUEST_WINDOW_MS,
      cooldownUntil: 0,
      lockUntil: 0
    };
    mfaRequestLimits.set(key, fresh);
    return fresh;
  }
  return current;
}

function checkMfaCodeRequestLimit(email, req) {
  const key = `${email}:${getClientIp(req)}`;
  const limit = getMfaRequestLimit(key);
  const now = Date.now();

  if (limit.lockUntil > now) {
    return {
      ok: false,
      message: 'Trop de demandes de code. Réessayez dans quelques minutes.'
    };
  }

  if (limit.cooldownUntil > now) {
    return {
      ok: false,
      message: 'Un code vient déjà d’être envoyé. Patientez avant de demander un nouveau code.'
    };
  }

  if (limit.count >= MFA_MAX_REQUESTS_PER_WINDOW) {
    limit.lockUntil = now + MFA_LOCK_MS;
    return {
      ok: false,
      message: 'Trop de demandes de code. Réessayez dans quelques minutes.'
    };
  }

  return { ok: true, limit };
}

function registerMfaCodeRequest(limit) {
  const now = Date.now();
  limit.count += 1;
  limit.cooldownUntil = now + MFA_RESEND_COOLDOWN_MS;
}

function createMfaCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashMfaCode({ code, salt, userId, email }) {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${userId}:${email}:${salt}:${code}`)
    .digest('hex');
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getSmtpTransport() {
  if (!SMTP_HOST || !SMTP_FROM) {
    throw new Error('Configuration SMTP incomplète');
  }

  const options = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE
  };

  if (SMTP_USER || SMTP_PASS) {
    options.auth = {
      user: SMTP_USER,
      pass: SMTP_PASS
    };
  }

  return nodemailer.createTransport(options);
}

async function sendMfaCodeEmail(email, code) {
  const transport = getSmtpTransport();
  await transport.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: 'Code de vérification Outil PME',
    text: [
      'Votre code de vérification Outil PME est :',
      '',
      code,
      '',
      `Ce code expire dans ${MFA_CODE_TTL_MINUTES} minutes.`,
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.'
    ].join('\n')
  });
}

function renderAuthPage({ title, body }) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)} - A2 METAL</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body class="login-body">
  <div class="login-wrapper">
    <div class="login-card">
      <div class="login-logo">A2 MÉTAL</div>
      ${body}
    </div>
  </div>
</body>
</html>
`;
}

function renderMfaEmailPage(error = '') {
  return renderAuthPage({
    title: 'Vérification email',
    body: `
      <h1>Vérification email</h1>
      <p class="login-help">Saisissez une adresse e-mail autorisée pour recevoir votre code.</p>
      ${error ? `<p class="login-error">${escHtml(error)}</p>` : ''}
      <form method="POST" action="/login/email">
        <label for="email">Adresse e-mail</label>
        <input
          id="email"
          type="email"
          name="email"
          autocomplete="email"
          required
        />
        <button type="submit">Envoyer le code</button>
      </form>
      <form method="GET" action="/logout" class="login-secondary-form">
        <button type="submit" class="btn-secondary">Retour à la connexion</button>
      </form>
    `
  });
}

function renderMfaCodePage(error = '') {
  return renderAuthPage({
    title: 'Code de vérification',
    body: `
      <h1>Vérification email</h1>
      <p class="login-help">Un code de sécurité vous a été envoyé par email.</p>
      ${error ? `<p class="login-error">${escHtml(error)}</p>` : ''}
      <form method="POST" action="/login/code">
        <label for="code">Code</label>
        <input
          id="code"
          class="login-code-input"
          type="text"
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          required
        />
        <button type="submit">Valider le code</button>
      </form>
      <form method="POST" action="/login/email" class="login-secondary-form">
        <button type="submit" class="btn-secondary">Renvoyer un code</button>
      </form>
      <a class="login-back-link" href="/logout">Retour à la connexion</a>
    `
  });
}

function normalizeChantierStatus(value) {
  const status = String(value || '').trim();
  return CHANTIER_STATUSES.includes(status) ? status : 'À préparer';
}

function chantierStatusOptions(selected) {
  const current = normalizeChantierStatus(selected);
  return CHANTIER_STATUSES
    .map((status) => `<option value="${escHtml(status)}"${status === current ? ' selected' : ''}>${escHtml(status)}</option>`)
    .join('');
}

function chantierStatusClass(status) {
  const index = CHANTIER_STATUSES.indexOf(normalizeChantierStatus(status));
  return `chantier-status-${index >= 0 ? index : 0}`;
}

function chantierProgress(doneHours, plannedHours) {
  const planned = Number(plannedHours || 0);
  const done = Number(doneHours || 0);
  if (planned <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / planned) * 100)));
}

function clientOrderStageProgress(status) {
  const normalized = normalizeChantierStatus(status);
  if (normalized === 'En fabrication') return 50;
  if (normalized === 'Facturé' || normalized === 'Terminé') return 100;
  return 0;
}

function formatHours(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0h';
  return `${Math.round(n * 100) / 100}h`;
}

function parsePositiveNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseOptionalClientId(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeQuoteStatus(value) {
  const status = String(value || '').trim();
  return QUOTE_STATUSES.includes(status) ? status : 'Brouillon';
}

function quoteStatusOptions(selected) {
  const current = normalizeQuoteStatus(selected);
  return QUOTE_STATUSES
    .map((status) => `<option value="${escHtml(status)}"${status === current ? ' selected' : ''}>${escHtml(status)}</option>`)
    .join('');
}

function quoteStatusClass(status) {
  return `quote-status-${Math.max(0, QUOTE_STATUSES.indexOf(normalizeQuoteStatus(status)))}`;
}

function normalizeVatRate(value) {
  const rate = Number(value);
  return rate === 10 || rate === 20 ? rate : 20;
}

function quoteVatOptions(selected) {
  const current = normalizeVatRate(selected);
  return [20, 10]
    .map((rate) => `<option value="${rate}"${rate === current ? ' selected' : ''}>TVA ${rate} %</option>`)
    .join('');
}

function formatDateLabel(value) {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return '—';
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('fr-FR');
}

function parseOptionalId(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeMeasurementLink(quoteIdValue, orderIdValue) {
  const quoteId = parseOptionalId(quoteIdValue);
  const orderId = quoteId ? null : parseOptionalId(orderIdValue);
  return { quoteId, orderId };
}

function measurementTitle(row) {
  return row?.record_name || row?.chantier || `Prise de cote #${row?.id}`;
}

function measurementLinkBadge(row) {
  const quoteId = parseOptionalId(row?.quote_id);
  const orderId = parseOptionalId(row?.client_order_id);
  if (quoteId) {
    return `<a class="measurement-link-badge linked" href="/devis/${quoteId}">Liée au devis #${quoteId}</a>`;
  }
  if (orderId) {
    const order = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
    if (order) {
      const folderName = safeName(order.description && order.description.trim() !== '' ? order.description : `Commande_${order.id}`);
      return `<a class="measurement-link-badge linked" href="/pc-folders/${encodeURIComponent(safeName(order.name))}/${encodeURIComponent(folderName)}">Liée à la commande #${orderId}</a>`;
    }
    return `<span class="measurement-link-badge linked">Liée à la commande #${orderId}</span>`;
  }
  return '<span class="measurement-link-badge">Non rattachée</span>';
}

function renderMeasurementCards(rows) {
  if (!rows.length) return '<div class="empty-state">Aucune prise de cote liée.</div>';
  return `
    <div class="measurement-linked-grid">
      ${rows.map((row) => `
        <article class="measurement-linked-card">
          <div>
            <strong>${escHtml(measurementTitle(row))}</strong>
            <span>${escHtml(row.module || 'Prise de cote')}</span>
          </div>
          ${measurementLinkBadge(row)}
          <a class="btn btn-secondary" href="/outils/prises-cotes/fiche/${row.id}">Ouvrir</a>
        </article>
      `).join('')}
    </div>
  `;
}

const STANDARD_MATERIALS = [
  ...['20x20x2', '25x25x2', '30x30x2', '40x40x2', '50x50x2', '60x60x3', '80x80x3', '100x100x4']
    .map((name) => ({ type: 'Tubes carrés acier', name, unit: 'ml' })),
  ...['40x20x2', '50x30x2', '60x30x2', '80x40x3', '100x50x3', '120x60x4', '150x100x5']
    .map((name) => ({ type: 'Tubes rectangulaires acier', name, unit: 'ml' })),
  ...['Ø20x2', 'Ø26,9x2,3', 'Ø33,7x2,6', 'Ø42,4x2,6', 'Ø48,3x3,2', 'Ø60,3x3,2']
    .map((name) => ({ type: 'Tubes ronds acier', name, unit: 'ml' })),
  ...['25x25x3', '30x30x3', '40x40x4', '50x50x5', '60x60x6']
    .map((name) => ({ type: 'Cornières acier', name, unit: 'ml' })),
  ...['20x5', '30x5', '40x5', '50x8', '60x10', '80x10', '100x10']
    .map((name) => ({ type: 'Plats acier', name, unit: 'ml' })),
  ...['UPN 80', 'UPN 100', 'UPN 120', 'IPN 80', 'IPN 100', 'IPN 120', 'IPE 100', 'IPE 120', 'HEA 100', 'HEA 120']
    .map((name) => ({ type: 'UPN / IPN / IPE / HEA', name, unit: 'ml' })),
  ...['1,5 mm', '2 mm', '3 mm', '4 mm', '5 mm', '6 mm', '8 mm', '10 mm', 'larmée 3/5', 'perforée standard']
    .map((name) => ({ type: 'Tôles acier', name, unit: 'm²' })),
  ...['2 mm', '3 mm', '4 mm', '5 mm', 'damier 3/5']
    .map((name) => ({ type: 'Tôles alu', name, unit: 'm²' })),
  ...['1,5 mm', '2 mm', '3 mm', 'brossée 2 mm', 'brossée 3 mm']
    .map((name) => ({ type: 'Tôles inox', name, unit: 'm²' })),
  ...['caillebotis 30x30', 'caillebotis 30x10', 'marche caillebotis standard']
    .map((name) => ({ type: 'Caillebotis', name, unit: 'm²' })),
  ...[
    'platine 100x100x8',
    'platine 150x150x10',
    'paumelle portail',
    'gond réglable',
    'serrure portail',
    'bouchon tube carré 40',
    'bouchon tube carré 50',
    'bouchon tube rectangulaire 80x40',
    'main courante ronde inox',
    'câble inox',
    'tendeur inox'
  ].map((name) => ({ type: 'Accessoires courants', name, unit: 'pièce' }))
];

function seedStandardMaterials() {
  const findExisting = db.prepare('SELECT id FROM materials WHERE lower(type) = lower(?) AND lower(name) = lower(?) LIMIT 1');
  const insertMaterial = db.prepare(
    'INSERT INTO materials (type, name, unit, price, kg_per_m, density, created_at) VALUES (?, ?, ?, 0, NULL, NULL, ?)'
  );
  const now = new Date().toISOString();

  const run = db.transaction((items) => {
    let inserted = 0;
    for (const item of items) {
      const type = String(item.type || '').trim();
      const name = String(item.name || '').trim();
      const unit = String(item.unit || '').trim();
      if (!type || !name) continue;
      if (findExisting.get(type, name)) continue;
      insertMaterial.run(type, name, unit, now);
      inserted += 1;
    }
    return inserted;
  });

  return run(STANDARD_MATERIALS);
}

// Statistiques sidebar
app.use((req, res, next) => {
  if (!req.session?.user) return next();

  try {
    const tasksTodo = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'Terminée'").get().c;
    const today = new Date().toISOString().slice(0, 10);
    const eventsToday = db.prepare('SELECT COUNT(*) AS c FROM events WHERE start_date LIKE ?').get(`${today}%`).c;
    const clientOrders = db.prepare("SELECT COUNT(*) AS c FROM client_orders WHERE status != 'Terminée'").get().c;
    const supplierOrders = db
      .prepare("SELECT COUNT(*) AS c FROM supplier_orders WHERE status IS NULL OR TRIM(status) = '' OR status != 'Terminée'")
      .get().c;

    req.navStats = { tasksTodo, eventsToday, clientOrders, supplierOrders };
  } catch (err) {
    console.error('Erreur navStats :', err);
  }

  next();
});

/* ===================== GOOGLE (optionnel) ===================== */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://desktop-stqqsqi.tail3d293a.ts.net:3000/google/callback';

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

/* ===================== TEMPLATES ===================== */

function dashboardTemplate(req, content) {
  return pageTemplate(req, 'Dashboard', content);
}

function navIcon(name) {
  const icons = {
    dashboard: '<path d="M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z"/>',
    clients: '<path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19"/><path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M20 19v-1.2a3 3 0 0 0-2.4-2.9"/><path d="M15.5 5.3a3 3 0 0 1 0 5.4"/>',
    tasks: '<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="m8 12 2.5 2.5L16 9"/>',
    calendar: '<path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h3M8 16h6"/>',
    clientOrders: '<path d="M5 5h5l2 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h8M8 15h5"/>',
    supplierOrders: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    quotes: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
    measurements: '<path d="M4 17 17 4l3 3L7 20z"/><path d="m14 7 3 3M11 10l2 2M8 13l3 3"/>',
    materials: '<path d="M4 8 12 4l8 4-8 4z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/>',
    logibarre: '<path d="M4 14h16"/><path d="M6 10h12"/><path d="M8 18h8"/><path d="M5 14v3M19 11v3"/>',
    logitole: '<path d="M5 5h14v14H5z"/><path d="M8 8h8v8H8z"/><path d="M5 12h3M16 12h3"/>',
    barreaudage: '<path d="M5 4v16M19 4v16"/><path d="M8 7v10M11 7v10M14 7v10M17 7v10"/><path d="M4 7h16M4 17h16"/>',
    logout: '<path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/>',
  };
  const svg = icons[name] || icons.dashboard;
  return `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${svg}</svg></span>`;
}

function mobileNavIcon(name) {
  const icons = {
    home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10.5V20h11v-9.5"/><path d="M10 20v-5h4v5"/>',
    clients: '<path d="M16 19v-1.3a3.3 3.3 0 0 0-3.3-3.3H7.3A3.3 3.3 0 0 0 4 17.7V19"/><path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M20 19v-1a3 3 0 0 0-2.2-2.9"/><path d="M15.8 5.4a3 3 0 0 1 0 5.2"/>',
    new: '<path d="M12 5v14M5 12h14"/>',
    calendar: '<path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h3M8 16h5"/>',
    more: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
    tasks: '<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="m8 12 2.5 2.5L16 9"/>',
    orders: '<path d="M5 5h5l2 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h8M8 15h5"/>',
    clientOrders: '<path d="M5 5h5l2 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h8M8 15h5"/>',
    supplierOrders: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    quotes: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
    measurements: '<path d="M4 17 17 4l3 3L7 20z"/><path d="m14 7 3 3M11 10l2 2M8 13l3 3"/>',
    materials: '<path d="M4 8 12 4l8 4-8 4z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/>',
    logibarre: '<path d="M4 14h16"/><path d="M6 10h12"/><path d="M8 18h8"/><path d="M5 14v3M19 11v3"/>',
    logitole: '<path d="M5 5h14v14H5z"/><path d="M8 8h8v8H8z"/><path d="M5 12h3M16 12h3"/>',
    barreaudage: '<path d="M5 4v16M19 4v16"/><path d="M8 7v10M11 7v10M14 7v10M17 7v10"/><path d="M4 7h16M4 17h16"/>',
    logout: '<path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/>',
  };
  const svg = icons[name] || icons.more;
  return `<span class="mobile-bottom-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${svg}</svg></span>`;
}

function clientPageIcon(name, className = 'clients-ui-icon') {
  const icons = {
    add: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5 10 17l9-10"/>',
    tasks: '<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="m8 12 2.5 2.5L16 9"/>',
    user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4 20a8 8 0 0 1 16 0"/>',
    clients: '<path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19"/><path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M20 19v-1.2a3 3 0 0 0-2.4-2.9"/><path d="M15.5 5.3a3 3 0 0 1 0 5.4"/>',
    mail: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
    calendar: '<path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h3M8 16h5"/>',
    location: '<path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11z"/><path d="M12 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    postal: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    building: '<path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2M4 21h16"/>',
    phone: '<path d="M8 4h3l1.5 4-2 1.2a10 10 0 0 0 4.3 4.3l1.2-2 4 1.5v3a3 3 0 0 1-3.3 3A15 15 0 0 1 5 7.3 3 3 0 0 1 8 4z"/>',
    search: '<path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z"/><path d="m20 20-4-4"/>',
    database: '<path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    quotes: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
    measurements: '<path d="M4 17 17 4l3 3L7 20z"/><path d="m14 7 3 3M11 10l2 2M8 13l3 3"/>',
    materials: '<path d="M4 8 12 4l8 4-8 4z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/>',
    logibarre: '<path d="M4 14h16"/><path d="M6 10h12"/><path d="M8 18h8"/><path d="M5 14v3M19 11v3"/>',
    logitole: '<path d="M5 5h14v14H5z"/><path d="M8 8h8v8H8z"/><path d="M5 12h3M16 12h3"/>',
    barreaudage: '<path d="M5 4v16M19 4v16"/><path d="M8 7v10M11 7v10M14 7v10M17 7v10"/><path d="M4 7h16M4 17h16"/>',
    supplierOrders: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    folder: '<path d="M5 5h5l2 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  };
  const svg = icons[name] || icons.user;
  return `<span class="${className}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${svg}</svg></span>`;
}

function pcFolderIcon(name, className = 'pc-modern-icon') {
  const icons = {
    Devis: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
    Plans: '<path d="M4 17 17 4l3 3L7 20z"/><path d="m14 7 3 3M11 10l2 2M8 13l3 3"/>',
    Factures: '<path d="M7 3h10v18l-2-1-2 1-2-1-2 1-2-1z"/><path d="M10 8h4M10 12h4M10 16h3"/>',
    Photos: '<path d="M4 7h4l1.5-2h5L16 7h4v12H4z"/><path d="M12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>',
    Commandes: '<path d="M5 5h5l2 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h8M8 15h5"/>',
    'Heure chantier': '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4"/>',
    image: '<path d="M4 5h16v14H4z"/><path d="m7 15 3-3 3 3 2-2 3 3"/><path d="M8.5 9.5h.01"/>',
    dxf: '<path d="M4 17 17 4l3 3L7 20z"/><path d="m14 7 3 3M11 10l2 2M8 13l3 3"/>',
    pdf: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M9 13h6M9 17h4"/>',
  };
  const svg = icons[name] || icons.file;
  return `<span class="${className}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${svg}</svg></span>`;
}

function pcFileIconName(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (ext === '.dxf') return 'dxf';
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  return 'file';
}

function pageTemplate(req, title, content) {
  const stats = req.navStats || { tasksTodo: 0, eventsToday: 0, clientOrders: 0, supplierOrders: 0 };

  const isAtelier =
    req.session?.user?.role === 'atelier';
  const isActivePath = (exactOrPrefix) => {
    if (exactOrPrefix.endsWith('*')) return req.path.startsWith(exactOrPrefix.slice(0, -1));
    return req.path === exactOrPrefix;
  };
  const bottomPrimaryLinks = isAtelier
    ? [
        { href: '/dashboard', icon: 'home', label: 'Accueil', active: isActivePath('/dashboard') },
        { href: '/orders/clients', icon: 'orders', label: 'Commandes', active: isActivePath('/orders/clients*') },
        { action: 'new', icon: 'new', label: 'Nouveau', primary: true },
        { href: '/outils/prises-cotes', icon: 'measurements', label: 'Cotes', active: isActivePath('/outils/prises-cotes*') },
        { action: 'more', icon: 'more', label: 'Plus' }
      ]
    : [
        { href: '/dashboard', icon: 'home', label: 'Accueil', active: isActivePath('/dashboard') },
        { href: '/clients', icon: 'clients', label: 'Clients', active: isActivePath('/clients*') },
        { action: 'new', icon: 'new', label: 'Nouveau', primary: true },
        { href: '/agenda', icon: 'calendar', label: 'Agenda', active: isActivePath('/agenda') },
        { action: 'more', icon: 'more', label: 'Plus' }
      ];
  const mobileNewLinks = isAtelier
    ? [
        { href: '/outils/prises-cotes', label: 'Nouvelle prise de cote', icon: 'measurements' }
      ]
    : [
        { href: '/clients', label: 'Nouveau client', icon: 'clients' },
        { href: '/devis/new', label: 'Nouveau devis', icon: 'quotes' },
        { href: '/orders/clients', label: 'Nouvelle commande / chantier', icon: 'clientOrders' },
        { href: '/outils/prises-cotes', label: 'Nouvelle prise de cote', icon: 'measurements' }
      ];
  const mobileMoreLinks = isAtelier
    ? [
        { href: '/tasks', label: 'Tâches', icon: 'tasks' },
        { href: '/orders/clients', label: 'Commandes clients', icon: 'clientOrders' },
        { href: '/orders/suppliers', label: 'Commandes fournisseurs', icon: 'supplierOrders' },
        { href: '/outils/prises-cotes', label: 'Prises de cotes', icon: 'measurements' },
        { href: '/outils/logibarre', label: 'LogiBarre', icon: 'logibarre' },
        { href: '/outils/logitole', label: 'LogiTôle', icon: 'logitole' },
        { href: '/outils/barreaudage', label: 'Barreaudage', icon: 'barreaudage' },
        { href: '/logout', label: 'Déconnexion', icon: 'logout' }
      ]
    : [
        { href: '/tasks', label: 'Tâches', icon: 'tasks' },
        { href: '/devis', label: 'Devis', icon: 'quotes' },
        { href: '/orders/clients', label: 'Commandes clients', icon: 'clientOrders' },
        { href: '/orders/suppliers', label: 'Commandes fournisseurs', icon: 'supplierOrders' },
        { href: '/outils/prises-cotes', label: 'Prises de cotes', icon: 'measurements' },
        { href: '/materials', label: 'Bibliothèque matière', icon: 'materials' },
        { href: '/outils/logibarre', label: 'LogiBarre', icon: 'logibarre' },
        { href: '/outils/logitole', label: 'LogiTôle', icon: 'logitole' },
        { href: '/outils/barreaudage', label: 'Barreaudage', icon: 'barreaudage' },
        { href: '/logout', label: 'Déconnexion', icon: 'logout' }
      ];
  const renderBottomItem = (item) => {
    if (item.href) {
      return `<a class="mobile-bottom-item${item.active ? ' active' : ''}" href="${item.href}">${mobileNavIcon(item.icon)}<small>${escHtml(item.label)}</small></a>`;
    }
    return `<button class="mobile-bottom-item${item.primary ? ' mobile-bottom-primary' : ''}" type="button" data-mobile-sheet="${item.action}" aria-expanded="false">${mobileNavIcon(item.icon)}<small>${escHtml(item.label)}</small></button>`;
  };
  const renderSheetLinks = (links) => links
    .map((link) => `<a href="${link.href}">${link.icon ? mobileNavIcon(link.icon) : ''}<span>${escHtml(link.label)}</span></a>`)
    .join('');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="A2 METAL">

<title>${escHtml(title)}</title>

<link rel="stylesheet" href="/style.css">
<link rel="apple-touch-icon" href="/logo-192.png">
<link rel="icon" type="image/png" href="/logo-192.png">
<link rel="manifest" href="/manifest.json">
</head>

<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">A2 METAL</div>
      <nav>

${isAtelier ? `



  <a href="/orders/clients"
     class="${req.path.startsWith('/orders/clients') ? 'active' : ''}">
     ${navIcon('clientOrders')}<span class="nav-label">Commandes clients</span>
  </a>

  <a href="/orders/suppliers"
     class="${req.path.startsWith('/orders/suppliers') ? 'active' : ''}">
     ${navIcon('supplierOrders')}<span class="nav-label">Commandes fournisseurs</span>
  </a>

  <a href="/outils/logibarre">
     ${navIcon('logibarre')}<span class="nav-label">Logibarre</span>
  </a>

  <a href="/outils/logitole">
     ${navIcon('logitole')}<span class="nav-label">Logitôle</span>
  </a>

  <a href="/outils/barreaudage"
     class="${req.path === '/outils/barreaudage' ? 'active' : ''}">
     ${navIcon('barreaudage')}<span class="nav-label">Barreaudage</span>
  </a>

    <a href="/outils/prises-cotes"
      class="${req.path.startsWith('/outils/prises-cotes') ? 'active' : ''}">
      ${navIcon('measurements')}<span class="nav-label">Prises de cotes</span>
    </a>

      <a href="/dashboard"
        class="${req.path === '/dashboard' ? 'active' : ''}">
        ${navIcon('dashboard')}<span class="nav-label">Dashboard</span>
      </a>

` : `

  <a href="/dashboard"
     class="${req.path === '/dashboard' ? 'active' : ''}">
     ${navIcon('dashboard')}<span class="nav-label">Dashboard</span>
  </a>

  <a href="/tasks"
     class="${req.path === '/tasks' ? 'active' : ''}">
     ${navIcon('tasks')}<span class="nav-label">Tâches</span>
     ${stats.tasksTodo > 0 ? `<span class="nav-badge">${stats.tasksTodo}</span>` : ''}
  </a>

  <a href="/clients"
     class="${req.path.startsWith('/clients') ? 'active' : ''}">
     ${navIcon('clients')}<span class="nav-label">Clients</span>
  </a>

  <a href="/agenda"
     class="${req.path === '/agenda' ? 'active' : ''}">
     ${navIcon('calendar')}<span class="nav-label">Agenda</span>
  </a>

  <a href="/orders/clients"
     class="${req.path.startsWith('/orders/clients') ? 'active' : ''}">
     ${navIcon('clientOrders')}<span class="nav-label">Commandes clients</span>
  </a>

  <a href="/orders/suppliers"
     class="${req.path.startsWith('/orders/suppliers') ? 'active' : ''}">
     ${navIcon('supplierOrders')}<span class="nav-label">Commandes fournisseurs</span>
  </a>

  <a href="/devis"
     class="${req.path.startsWith('/devis') ? 'active' : ''}">
     ${navIcon('quotes')}<span class="nav-label">Devis</span>
  </a>

  <a href="/materials"
     class="${req.path.startsWith('/materials') ? 'active' : ''}">
     ${navIcon('materials')}<span class="nav-label">Bibliothèque matière</span>
  </a>

  <a href="/outils/logibarre">
     ${navIcon('logibarre')}<span class="nav-label">Logibarre</span>
  </a>

  <a href="/outils/logitole">
     ${navIcon('logitole')}<span class="nav-label">Logitôle</span>
  </a>

  <a href="/outils/barreaudage"
     class="${req.path === '/outils/barreaudage' ? 'active' : ''}">
     ${navIcon('barreaudage')}<span class="nav-label">Barreaudage</span>
  </a>

    <a href="/outils/prises-cotes"
      class="${req.path.startsWith('/outils/prises-cotes') ? 'active' : ''}">
      ${navIcon('measurements')}<span class="nav-label">Prises de cotes</span>
    </a>

`}

<a href="/logout" class="logout">
  ${navIcon('logout')}<span class="nav-label">Déconnexion</span>
</a>

</nav>
    </aside>
    <main class="content">
      <div class="container">
        ${content}
      </div>
    </main>
  </div>
  <div class="mobile-sheet-overlay" data-mobile-close hidden></div>
  <nav class="mobile-bottom-nav" aria-label="Navigation mobile">
    ${bottomPrimaryLinks.map(renderBottomItem).join('')}
  </nav>
  <section id="mobileNewSheet" class="mobile-bottom-sheet" aria-hidden="true">
    <div class="mobile-sheet-handle"></div>
    <h2>Nouveau</h2>
    <div class="mobile-sheet-links">
      ${renderSheetLinks(mobileNewLinks)}
    </div>
    <button type="button" class="mobile-sheet-cancel" data-mobile-close>Annuler</button>
  </section>
  <section id="mobileMoreSheet" class="mobile-bottom-sheet" aria-hidden="true">
    <div class="mobile-sheet-handle"></div>
    <h2>Plus</h2>
    <div class="mobile-sheet-links">
      ${renderSheetLinks(mobileMoreLinks)}
    </div>
    <button type="button" class="mobile-sheet-cancel" data-mobile-close>Annuler</button>
  </section>
<script>
document.addEventListener('DOMContentLoaded', function () {
  const overlay = document.querySelector('.mobile-sheet-overlay');
  const sheets = {
    new: document.getElementById('mobileNewSheet'),
    more: document.getElementById('mobileMoreSheet')
  };
  const triggers = document.querySelectorAll('[data-mobile-sheet]');

  function closeSheets() {
    Object.keys(sheets).forEach(function (key) {
      if (!sheets[key]) return;
      sheets[key].classList.remove('open');
      sheets[key].setAttribute('aria-hidden', 'true');
    });
    triggers.forEach(function (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    });
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('mobile-sheet-open');
  }

  function openSheet(name, trigger) {
    const sheet = sheets[name];
    if (!sheet || !overlay) return;
    closeSheets();
    overlay.hidden = false;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('mobile-sheet-open');
  }

  triggers.forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      openSheet(trigger.getAttribute('data-mobile-sheet'), trigger);
    });
  });

  document.querySelectorAll('[data-mobile-close]').forEach(function (control) {
    control.addEventListener('click', closeSheets);
  });

  document.querySelectorAll('.mobile-bottom-sheet a').forEach(function (link) {
    link.addEventListener('click', closeSheets);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeSheets();
  });
});
</script>
</body>
</html>
`;
}

/* ===================== AUTH ===================== */

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  if (req.session.pendingMfaUser) {
    return req.session.mfa?.codeHash ? res.redirect('/login/code') : res.redirect('/login/email');
  }
  return res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND password = ?')
    .get(username, password);

  if (!user) {
    return res.status(401).send('Login incorrect');
  }

  req.session.pendingMfaUser = {
    id: user.id,
    username: user.username,
    role: user.role
  };
  delete req.session.user;
  delete req.session.mfa;

  res.redirect('/login/email');
});

app.get('/login/email', requirePendingMfa, (req, res) => {
  res.send(renderMfaEmailPage());
});

app.post('/login/email', requirePendingMfa, async (req, res) => {
  const previousEmail = normalizeEmail(req.session.mfa?.email);
  const email = normalizeEmail(req.body.email || previousEmail);
  const now = Date.now();

  if (req.session.mfa?.lockUntil && req.session.mfa.lockUntil > now) {
    return res.status(429).send(renderMfaEmailPage('Trop de codes incorrects. Réessayez dans quelques minutes.'));
  }

  if (!email || !MFA_ALLOWED_EMAILS.has(email)) {
    return res.status(403).send(renderMfaEmailPage('Adresse e-mail non autorisée.'));
  }

  const requestCheck = checkMfaCodeRequestLimit(email, req);
  if (!requestCheck.ok) {
    return res.status(429).send(renderMfaEmailPage(requestCheck.message));
  }

  const code = createMfaCode();
  const salt = crypto.randomBytes(16).toString('hex');
  const pendingUser = req.session.pendingMfaUser;

  req.session.mfa = {
    email,
    salt,
    codeHash: hashMfaCode({
      code,
      salt,
      userId: pendingUser.id,
      email
    }),
    expiresAt: Date.now() + MFA_CODE_TTL_MS,
    attempts: 0,
    lockUntil: 0,
    sentAt: Date.now()
  };

  try {
    await sendMfaCodeEmail(email, code);
    registerMfaCodeRequest(requestCheck.limit);
  } catch (err) {
    delete req.session.mfa;
    console.error('Erreur envoi code e-mail 2FA :', err.message);
    return res.status(500).send(renderMfaEmailPage('Impossible d’envoyer le code. Vérifiez la configuration SMTP.'));
  }

  res.redirect('/login/code');
});

app.get('/login/code', requirePendingMfa, (req, res) => {
  if (!req.session.mfa?.codeHash) return res.redirect('/login/email');
  res.send(renderMfaCodePage());
});

app.post('/login/code', requirePendingMfa, (req, res) => {
  const mfa = req.session.mfa;
  const pendingUser = req.session.pendingMfaUser;
  const code = String(req.body.code || '').trim();
  const now = Date.now();

  if (!mfa?.codeHash) {
    return res.redirect('/login/email');
  }

  if (mfa.lockUntil && mfa.lockUntil > now) {
    return res.status(429).send(renderMfaCodePage('Trop de codes incorrects. Réessayez dans quelques minutes.'));
  }

  if (!mfa.expiresAt || mfa.expiresAt <= now) {
    delete req.session.mfa;
    return res.status(400).send(renderMfaEmailPage('Le code a expiré. Demandez un nouveau code.'));
  }

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).send(renderMfaCodePage('Le code doit contenir 6 chiffres.'));
  }

  const submittedHash = hashMfaCode({
    code,
    salt: mfa.salt,
    userId: pendingUser.id,
    email: mfa.email
  });

  if (!timingSafeEqualHex(submittedHash, mfa.codeHash)) {
    mfa.attempts = Number(mfa.attempts || 0) + 1;
    if (mfa.attempts >= MFA_MAX_CODE_ATTEMPTS) {
      mfa.lockUntil = now + MFA_LOCK_MS;
      req.session.mfa = mfa;
      return res.status(429).send(renderMfaCodePage('Trop de codes incorrects. Réessayez dans quelques minutes.'));
    }

    req.session.mfa = mfa;
    return res.status(401).send(renderMfaCodePage('Code incorrect.'));
  }

  req.session.user = {
    id: pendingUser.id,
    username: pendingUser.username,
    role: pendingUser.role
  };
  delete req.session.pendingMfaUser;
  delete req.session.mfa;

  res.redirect('/dashboard');
});
app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

/* ===================== DASHBOARD ===================== */
app.get('/dashboard/classic', requireLogin, (req, res) => {
 const upcomingEvents = db.prepare(`
  SELECT *
  FROM events
  WHERE start_date IS NOT NULL
    AND title IS NOT NULL
    AND title != ''
    AND datetime(start_date) >= datetime('now')
  ORDER BY start_date ASC
  LIMIT 5
`).all();


  const todoTasks = db
    .prepare("SELECT * FROM tasks WHERE status != 'Terminée' ORDER BY created_at DESC LIMIT 5")
    .all();

const clientOrders = db
  .prepare(`
    SELECT *
    FROM client_orders
    WHERE status != 'Terminée'
    ORDER BY date DESC, id DESC
    LIMIT 5
  `)
  .all()
  .map(o => {

    const realMinutes = db.prepare(`
      SELECT COALESCE(SUM(minutes_total),0) AS total
      FROM chantier_hours
      WHERE client = ?
      AND order_name = ?
    `).get(o.name, o.description);

    const actualHours =
      Number(realMinutes.total || 0) / 60;

    const plannedHours =
      Number(o.planned_hours || 0);

    return {
      ...o,
      chantierStatus:
        plannedHours > 0 && actualHours > plannedHours
          ? '🔴'
          : '🟢'
    };
  });

  const supplierOrders = db
    .prepare('SELECT * FROM supplier_orders ORDER BY date DESC, id DESC LIMIT 5')
    .all();

  /* ===================== LISTES ===================== */

  const eventsList =
    upcomingEvents.length > 0
      ? upcomingEvents
          .map(e => {
            const d = e.start_date || '';
            const day = d.slice(0, 10);
            const time = d.slice(11, 16);
            return `
              <li>
                <span class="item-title">${escHtml(e.title)}</span>
                <span class="item-meta">${day}${time ? ' · ' + time : ''}</span>
              </li>`;
          })
          .join('')
      : `<li class="empty">Aucun rendez-vous à venir</li>`;

  const tasksList =
    todoTasks.length > 0
      ? todoTasks
          .map(t => `
            <li>
              <span class="item-title">${escHtml(t.title)}</span>
              <span class="item-meta">${escHtml(t.status)}</span>
            </li>`)
          .join('')
      : `<li class="empty">Aucune tâche à faire</li>`;

  /* ===================== CARTES COMMANDES CLIENTS ===================== */
const clientOrdersList =
  clientOrders.length > 0
    ? clientOrders
        .map(o => {
          const safeClientFolder = safeName(o.name);
          const orderFolderName = safeName(
            o.description && o.description.trim() !== ''
              ? o.description
              : `Commande_${o.id}`
          );
          const clientFolderUrl = `/pc-folders/${encodeURIComponent(
            safeClientFolder
          )}/${encodeURIComponent(orderFolderName)}`;

          const dateLabel = (o.date || '').slice(0, 10);
          const statusLabel = o.status || 'En cours';
          const planned = Number(o.planned_hours || 0);
const actual = Number(o.actual_hours || 0);

const statusDot =
  actual > planned
    ? '🔴'
    : '🟢';

          return `
            <article class="order-card">
              <a class="order-card-link"
                 href="${clientFolderUrl}"
                 aria-label="Ouvrir le dossier"></a>

              <header class="order-card-header">
                <div>
                  <div class="order-card-title">
<span class="order-card-client">
  ${req.session?.user?.role !== 'atelier' ? o.chantierStatus + ' ' : ''}
  ${escHtml(o.name)}
</span>
                    <span class="order-card-id">#${o.id}</span>
                  </div>

                <div class="order-card-meta">
  
  <span class="order-card-date">
    📅 ${escHtml(dateLabel || '—')}
  </span>
  <span class="order-card-status badge">
    ${escHtml(statusLabel)}
  </span>
</div>
                </div>
              </header>

              <div class="order-card-body">
                <p class="order-card-description">
                  ${escHtml(o.description || '—')}
                </p>
              </div>
            </article>
          `;
        })
        .join('')
    : `<p class="empty">Aucune commande client.</p>`;



  const supplierOrdersList =
    supplierOrders.length > 0
      ? supplierOrders
          .map(o => `
            <li>
              <span class="item-title">${escHtml(o.name)}</span>
              <span class="item-meta">
                ${escHtml((o.description || '').slice(0, 40))}
                ${o.description && o.description.length > 40 ? '…' : ''}
              </span>
              <span class="item-tag">${escHtml((o.date || '').slice(0, 10))}</span>
            </li>
          `)
          .join('')
      : `<li class="empty">Aucune commande fournisseur</li>`;

  const todayDate = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  /* ===================== RENDER ===================== */

  res.send(
    dashboardTemplate(
      req,
      `
      <div class="dashboard-header">
        <div class="dashboard-title">
          <h1>Tableau de bord</h1>
          <p>
            Bonjour <strong>${escHtml(req.session.user.username)}</strong>
            <span class="dot">•</span>
            ${escHtml(todayDate)}
          </p>
        </div>
      </div>

      <div class="dashboard-main">
        <section class="panel">
          <div class="panel-header"><h2>À faire</h2></div>
          <ul class="item-list">${tasksList}</ul>
        </section>

        <section class="panel">
          <div class="panel-header"><h2>Prochains rendez-vous</h2></div>
          <ul class="item-list">${eventsList}</ul>
        </section>
      </div>

      <div class="dashboard-main" id="commandes">
        <section class="panel">
          <div class="panel-header"><h2>Commandes clients</h2></div>
          <div class="order-cards">
            ${clientOrdersList}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header"><h2>Commandes fournisseurs</h2></div>
          <ul class="item-list">${supplierOrdersList}</ul>
        </section>
      </div>
      `
    )
  );
});

app.get('/dashboard', requireLogin, renderDashboardPrototype);

app.get('/dashboard-prototype', requireLogin, (req, res) => {
  res.redirect('/dashboard');
});

app.get('/dashboard/prototype', requireLogin, (req, res) => {
  res.redirect('/dashboard');
});

function renderDashboardPrototype(req, res) {
  const todayIso = isoDate();
  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const userName = req.session?.user?.username || 'Utilisateur';

  const openTasks = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'Terminée'").get().c;
  const eventsToday = db.prepare("SELECT COUNT(*) AS c FROM events WHERE start_date LIKE ?").get(`${todayIso}%`).c;
  const clientsCount = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
  const openClientOrders = db.prepare("SELECT COUNT(*) AS c FROM client_orders WHERE status != 'Terminée'").get().c;
  const activeOrderChantiers = db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM client_orders
      WHERE status != 'Terminée'
      AND COALESCE(chantier_status, 'À préparer') NOT IN ('Terminé', 'Facturé')
    `)
    .get().c;
  const quotesToFollowCount = db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM quotes
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'Brouillon') IN ('Brouillon', 'Envoyé', 'Accepté')
    `)
    .get().c;
  const waitingSupplierOrders = db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM supplier_orders
      WHERE status IS NULL OR TRIM(status) = '' OR status != 'Terminée'
    `)
    .get().c;

  const todayEvents = db
    .prepare(`
      SELECT title, start_date, end_date, type
      FROM events
      WHERE start_date LIKE ?
      ORDER BY datetime(start_date) ASC
      LIMIT 6
    `)
    .all(`${todayIso}%`);

  const upcomingEvents = db
    .prepare(`
      SELECT title, start_date, end_date, type
      FROM events
      WHERE datetime(start_date) >= datetime('now', 'localtime')
      ORDER BY datetime(start_date) ASC
      LIMIT 5
    `)
    .all();

  const orderChantiers = db
    .prepare(`
      SELECT id, name, description, date, status, planned_hours, done_hours,
             chantier_status, chantier_progress, chantier_start_date, chantier_end_date
      FROM client_orders
      WHERE status != 'Terminée'
      ORDER BY
        CASE
          WHEN chantier_end_date IS NOT NULL AND TRIM(chantier_end_date) != '' THEN chantier_end_date
          ELSE date
        END ASC,
        id DESC
      LIMIT 3
    `)
    .all();

  const formatDateShort = (value) => {
    const raw = String(value || '').slice(0, 10);
    if (!raw) return '—';
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };
  const orderIconFor = (order) => {
    const label = `${order.description || ''} ${order.name || ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const icons = {
      stair: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M4 15h4v4M8 11h4v8M12 7h4v12M16 3h4v16"/></svg>',
      rail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V7M20 18V7M4 9h16M7 9v9M11 9v9M15 9v9M19 9v9"/></svg>',
      gate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V5M20 20V5M6 8h12M6 18h12M8 18V8M12 18V8M16 18V8"/></svg>',
      pergola: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16M6 9l2-4h8l2 4M7 9v11M17 9v11M5 20h14M9 9v4M12 9v4M15 9v4"/></svg>',
      window: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zM12 4v16M5 12h14"/></svg>',
      site: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6M8 11h8"/></svg>',
    };
    if (label.includes('escalier')) return icons.stair;
    if (label.includes('garde-corps') || label.includes('garde corps') || label.includes('barriere')) return icons.rail;
    if (label.includes('portail')) return icons.gate;
    if (label.includes('pergola')) return icons.pergola;
    if (label.includes('verriere') || label.includes('fenetre')) return icons.window;
    return icons.site;
  };

  const kpiIcon = (name) => {
    const icons = {
      tasks: '<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="m8 12 2.5 2.5L16 9"/>',
      calendar: '<path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h3M8 16h5"/>',
      clients: '<path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19"/><path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M20 19v-1.2a3 3 0 0 0-2.4-2.9"/><path d="M15.5 5.3a3 3 0 0 1 0 5.4"/>',
      orders: '<path d="M5 5h5l2 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h8M8 15h5"/>',
      suppliers: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
      quotes: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.orders}</svg>`;
  };

  const kpis = [
    { icon: 'tasks', label: 'Tâches en cours', value: openTasks, href: '/tasks' },
    { icon: 'calendar', label: 'Agenda aujourd’hui', value: eventsToday, href: '/agenda' },
    { icon: 'clients', label: 'Clients', value: clientsCount, href: '/clients' },
    { icon: 'orders', label: 'Commandes / chantiers en cours', value: activeOrderChantiers, href: '/orders/clients' },
    { icon: 'suppliers', label: 'Commandes fournisseurs', value: waitingSupplierOrders, href: '/orders/suppliers' },
    { icon: 'quotes', label: 'Devis', value: quotesToFollowCount, href: '/devis' },
  ]
    .map(
      (item) => `
      <a class="prototype-kpi-card" href="${item.href}">
        <span class="prototype-kpi-icon">${kpiIcon(item.icon)}</span>
        <span class="prototype-kpi-body">
          <strong>${escHtml(item.value)}</strong>
          <small>${escHtml(item.label)}</small>
          <em>Voir ›</em>
        </span>
      </a>
    `
    )
    .join('');

  const formatEventDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
  };
  const formatEventTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };
  const upcomingEventsHtml = upcomingEvents.length
    ? upcomingEvents
        .map((event) => {
          const startTime = formatEventTime(event.start_date);
          const endTime = formatEventTime(event.end_date);
          const timeLabel = [startTime, endTime].filter(Boolean).join(' - ') || 'Horaire à préciser';
          const location = event.location || event.place || event.lieu || '';
          return `
            <article class="prototype-appointment-card">
              <div>
                <strong>${escHtml(event.title || 'Rendez-vous')}</strong>
                <span>${escHtml(formatEventDate(event.start_date))} · ${escHtml(timeLabel)}</span>
                ${location ? `<small>${escHtml(location)}</small>` : ''}
              </div>
            </article>
          `;
        })
        .join('')
    : '<p class="prototype-empty">Aucun rendez-vous à venir.</p>';

  const orderChantiersHtml = orderChantiers.length
    ? orderChantiers
        .map((order) => {
          const safeClientFolder = safeName(order.name || 'Client');
          const orderFolderName = safeName(
            order.description && order.description.trim() !== '' ? order.description : `Commande_${order.id}`
          );
          const orderUrl = `/pc-folders/${encodeURIComponent(safeClientFolder)}/${encodeURIComponent(orderFolderName)}`;
          const planned = Number(order.planned_hours || 0);
          const done = Number(order.done_hours || 0);
          const progress = Number.isFinite(Number(order.chantier_progress))
            ? Math.max(0, Math.min(100, Math.round(Number(order.chantier_progress))))
            : chantierProgress(done, planned);
          const gap = done - planned;
          const endDate = String(order.chantier_end_date || '').slice(0, 10);
          const isLate = endDate && endDate < todayIso;
          return `
        <article class="prototype-order-card">
          <header>
            <span class="prototype-order-icon">${orderIconFor(order)}</span>
            <div>
              <strong>${escHtml(order.description || `Commande #${order.id}`)}</strong>
              <small>${escHtml(order.name || 'Client')}</small>
            </div>
            <span class="prototype-status">${escHtml(order.chantier_status || order.status || 'En cours')}</span>
            <b>${progress}%</b>
            <a class="prototype-chevron" href="${orderUrl}" aria-label="Ouvrir la commande">›</a>
          </header>
          <div class="prototype-progress" aria-label="Avancement chantier ${progress}%">
            <span style="width:${progress}%"></span>
          </div>
          <div class="prototype-order-metrics">
            <span><strong>${escHtml(formatHours(planned))}</strong><small>Prévues</small></span>
            <span><strong>${escHtml(formatHours(done))}</strong><small>Réalisées</small></span>
            <span><strong>${escHtml(formatHours(gap))}</strong><small>Écart</small></span>
            <span class="${isLate ? 'prototype-metric-late' : ''}"><strong>${escHtml(formatDateShort(endDate))}</strong><small>Fin prévue</small></span>
          </div>
        </article>
      `;
        })
        .join('')
    : '<p class="prototype-empty">Aucune commande / chantier actif</p>';

  res.send(
    dashboardTemplate(
      req,
      `
      <div class="dash-shell dashboard-prototype">
        <section class="prototype-hero">
          <div>
            <h1>Bonjour </h1>
            <p>${escHtml(todayLabel)} · Voici l’état de l’activité aujourd’hui.</p>
          </div>
        </section>

        <section class="prototype-kpi-grid" aria-label="Indicateurs principaux">
          ${kpis}
        </section>

        <section class="prototype-main-layout">
          <article class="prototype-panel prototype-orders-panel">
            <div class="prototype-panel-head">
              <h2>Commandes / chantiers actifs</h2>
              <a href="/orders/clients">Voir tout ›</a>
            </div>
            <div class="prototype-orders-grid">
              ${orderChantiersHtml}
            </div>
          </article>

          <aside class="prototype-side-stack">
            <article class="prototype-panel prototype-appointments-panel">
              <div class="prototype-panel-head">
                <h2>Prochains rendez-vous</h2>
                <a href="/agenda">Voir agenda ›</a>
              </div>
              <div class="prototype-appointments-list">
                ${upcomingEventsHtml}
              </div>
            </article>

            <article class="prototype-panel prototype-weather-card" data-weather-card aria-live="polite">
              <div class="prototype-weather-head">
                <span class="prototype-weather-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M7 16.5h9a4 4 0 0 0 .7-7.9A6 6 0 0 0 5.5 10.2 3.3 3.3 0 0 0 7 16.5z"/>
                    <path d="M8 20h8M10 22h4"/>
                  </svg>
                </span>
                <div>
                  <h2>Météo Riaillé</h2>
                  <small data-weather-status>Chargement météo...</small>
                </div>
              </div>

              <div class="prototype-weather-content" data-weather-content hidden>
                <div class="prototype-weather-main">
                  <strong data-weather-temp>—</strong>
                  <span data-weather-condition>—</span>
                </div>
                <div class="prototype-weather-meta">
                  <span>Pluie <strong data-weather-rain>—</strong></span>
                  <span>Vent <strong data-weather-wind>—</strong></span>
                </div>
                <div class="prototype-weather-forecast">
                  <span>Aujourd’hui <strong data-weather-today>—</strong></span>
                  <span>Demain <strong data-weather-tomorrow>—</strong></span>
                </div>
              </div>
            </article>
          </aside>
        </section>
      </div>
      <script>
        (function(){
          const card = document.querySelector('[data-weather-card]');
          if (!card) return;
          const status = card.querySelector('[data-weather-status]');
          const content = card.querySelector('[data-weather-content]');
          const setText = function(selector, value) {
            const el = card.querySelector(selector);
            if (el) el.textContent = value;
          };
          const unavailable = function() {
            if (status) status.textContent = 'Météo indisponible';
            if (content) content.hidden = true;
          };

          fetch('/api/weather', { headers: { Accept: 'application/json' } })
            .then(function(response) {
              if (!response.ok) throw new Error('weather');
              return response.json();
            })
            .then(function(data) {
              if (!data || !data.ok) throw new Error('weather');
              const current = data.current || {};
              const today = data.today || {};
              const tomorrow = data.tomorrow || {};
              setText('[data-weather-temp]', current.temperature === null || current.temperature === undefined ? '—' : current.temperature + '°C');
              setText('[data-weather-condition]', current.condition || '—');
              setText('[data-weather-rain]', today.precipitation === null || today.precipitation === undefined ? '—' : today.precipitation + ' mm');
              setText('[data-weather-wind]', current.wind === null || current.wind === undefined ? '—' : current.wind + ' km/h');
              setText('[data-weather-today]', (today.temperatureMin === null || today.temperatureMin === undefined ? '—' : today.temperatureMin + '°') + ' / ' + (today.temperatureMax === null || today.temperatureMax === undefined ? '—' : today.temperatureMax + '°'));
              setText('[data-weather-tomorrow]', (tomorrow.temperatureMin === null || tomorrow.temperatureMin === undefined ? '—' : tomorrow.temperatureMin + '°') + ' / ' + (tomorrow.temperatureMax === null || tomorrow.temperatureMax === undefined ? '—' : tomorrow.temperatureMax + '°'));
              if (status) status.textContent = current.condition || 'Météo actuelle';
              if (content) content.hidden = false;
            })
            .catch(unavailable);
        })();
      </script>
      `
    )
  );
}

function weatherConditionLabel(code) {
  const n = Number(code);
  if ([0].includes(n)) return 'Ciel dégagé';
  if ([1, 2, 3].includes(n)) return 'Nuageux';
  if ([45, 48].includes(n)) return 'Brouillard';
  if ([51, 53, 55, 56, 57].includes(n)) return 'Bruine';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(n)) return 'Pluie';
  if ([71, 73, 75, 77, 85, 86].includes(n)) return 'Neige';
  if ([95, 96, 99].includes(n)) return 'Orage';
  return 'Météo variable';
}

function roundWeatherValue(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

app.get('/api/weather', requireLogin, async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const params = new URLSearchParams({
      latitude: '47.52',
      longitude: '-1.29',
      timezone: 'Europe/Paris',
      forecast_days: '2',
      current: 'temperature_2m,weather_code,wind_speed_10m,precipitation',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: 'Météo indisponible' });
    }

    const data = await response.json();
    const current = data.current || {};
    const daily = data.daily || {};
    const dayAt = (index) => ({
      date: daily.time?.[index] || null,
      condition: weatherConditionLabel(daily.weather_code?.[index]),
      temperatureMax: roundWeatherValue(daily.temperature_2m_max?.[index]),
      temperatureMin: roundWeatherValue(daily.temperature_2m_min?.[index]),
      precipitation: roundWeatherValue(daily.precipitation_sum?.[index], 1),
      windMax: roundWeatherValue(daily.wind_speed_10m_max?.[index]),
    });

    res.json({
      ok: true,
      location: 'Riaillé',
      current: {
        temperature: roundWeatherValue(current.temperature_2m),
        condition: weatherConditionLabel(current.weather_code),
        precipitation: roundWeatherValue(current.precipitation, 1),
        wind: roundWeatherValue(current.wind_speed_10m),
      },
      today: dayAt(0),
      tomorrow: dayAt(1),
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: 'Météo indisponible' });
  } finally {
    clearTimeout(timeout);
  }
});


/* ===================== TASKS ===================== */

app.get('/tasks', requireLogin, (req, res) => {
  const tasks = db
    .prepare('SELECT * FROM tasks ORDER BY created_at DESC, id DESC')
    .all();

  const taskCards = tasks.length
    ? tasks
        .map((t) => {
          const status = String(t.status || 'À faire');
          const statusClass = status === 'Terminée' ? 'done' : status === 'En cours' ? 'progress' : 'todo';
          return `
        <article class="modern-task-card">
          <div class="modern-task-main">
            ${clientPageIcon('tasks', 'modern-page-icon')}
            <div>
              <h2>${escHtml(t.title)}</h2>
              <span class="modern-status-badge ${statusClass}">${escHtml(status)}</span>
            </div>
          </div>

          <div class="modern-task-actions">
            ${
              status !== 'Terminée'
                ? `
                <form method="POST" action="/tasks/done">
                  <input type="hidden" name="id" value="${t.id}" />
                  <button class="modern-secondary-btn" type="submit">Terminer</button>
                </form>
                `
                : `
                ${
                  Number(t.to_invoice || 0) === 1
                    ? `<div class="modern-invoice-badge">À facturer</div>`
                    : `
                    <form method="POST" action="/tasks/to-invoice">
                      <input type="hidden" name="id" value="${t.id}" />
                      <button class="modern-secondary-btn" type="submit">À facturer</button>
                    </form>
                    `
                }

                <form method="POST"
                      action="/tasks/delete"
                      onsubmit="return confirm('Supprimer cette tâche ?');">
                  <input type="hidden" name="id" value="${t.id}" />
                  <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
                </form>
                `
            }
          </div>
        </article>
      `;
        })
        .join('')
    : '<div class="empty-state">Aucune tâche</div>';

  res.send(
    pageTemplate(
      req,
      'Tâches',
      `
      <div class="modern-page">
        <form method="POST" action="/tasks" class="clients-create-card modern-form-card">
          <div class="clients-create-head">
            ${clientPageIcon('tasks', 'clients-title-icon')}
            <h1>Tâches</h1>
          </div>

          <div class="modern-form-grid">
            <label class="clients-field">
              <span>Titre tâche</span>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
                <input name="title" placeholder="Nouvelle tâche" required />
              </div>
            </label>

            <label class="clients-field">
              <span>Statut</span>
              <div class="clients-input-shell">
                ${clientPageIcon('add')}
                <select name="status">
                  <option>À faire</option>
              
                  <option>À facturer</option>
                </select>
              </div>
            </label>
          </div>

          <button class="clients-submit-btn" type="submit">
            <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
            Ajouter la tâche
          </button>
        </form>

        <section class="modern-list-head">
          <div>
            <h2>Liste des tâches</h2>
            <span>${tasks.length} au total</span>
          </div>
        </section>

        <div class="modern-task-grid">
          ${taskCards}
        </div>
      </div>
      `
    )
  );
});
app.post('/tasks/to-invoice', requireLogin, (req, res) => {

  db.prepare(`
    UPDATE tasks
    SET to_invoice = 1
    WHERE id = ?
  `).run(req.body.id);

  res.redirect('/tasks');

});
app.post('/tasks/to-invoice', requireLogin, (req, res) => {

  db.prepare(`
    UPDATE tasks
    SET to_invoice = 1
    WHERE id = ?
  `).run(req.body.id);

  res.redirect('/tasks');

});
/* ===================== AGENDA ===================== */
app.get('/agenda', requireLogin, (req, res) => {
  const requestedView = String(req.query.view || 'week').trim().toLowerCase();
  const agendaView = ['day', 'week', 'month'].includes(requestedView) ? requestedView : 'week';

  const events = db.prepare(`
    SELECT *
    FROM events
    ORDER BY start_date ASC
  `).all();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrow = new Date(todayStart);
  tomorrow.setDate(todayStart.getDate() + 1);

  const monday = new Date(todayStart);
  monday.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const nextMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);

  function eventDate(event) {
    const date = new Date(event.start_date);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function inRange(event, start, end) {
    const date = eventDate(event);
    return date && date >= start && date < end;
  }

  function formatAgendaDate(date) {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    });
  }

  function formatAgendaTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function renderAgendaEvent(event) {
    const start = formatAgendaTime(event.start_date);
    const end = formatAgendaTime(event.end_date);
    return `
      <button
        type="button"
        class="planning-event ${escHtml(event.type || 'rdv')}"
        data-event-id="${event.id}"
        data-event-title="${escHtml(event.title || '')}"
        data-event-type="${escHtml(event.type || 'rdv')}"
        data-event-start="${escHtml(event.start_date || '')}"
        data-event-end="${escHtml(event.end_date || '')}"
      >
        <span class="planning-event-title">${escHtml(event.title || 'Événement')}</span>
        <span class="planning-event-time">${escHtml(start)}${end ? ' - ' + escHtml(end) : ''}</span>
      </button>
    `;
  }

  function renderEventsList(list) {
    const sorted = list.slice().sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return sorted.length
      ? sorted.map(renderAgendaEvent).join('')
      : '<div class="planning-empty">Aucun événement</div>';
  }

  const dayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  function renderDayView() {
    const dayEvents = events.filter((event) => inRange(event, todayStart, tomorrow));
    return `
      <div class="planning-single-day">
        <div class="planning-day">
          <div class="planning-day-header">${escHtml(formatAgendaDate(todayStart))}</div>
          <div class="planning-events">${renderEventsList(dayEvents)}</div>
        </div>
      </div>
    `;
  }

  function renderWeekView() {
    const columns = dayLabels.map((label, index) => {
      const dayStart = new Date(monday);
      dayStart.setDate(monday.getDate() + index);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);
      const dayEvents = events.filter((event) => inRange(event, dayStart, dayEnd));

      return `
        <div class="planning-day">
          <div class="planning-day-header">${escHtml(label)} <span>${dayStart.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span></div>
          <div class="planning-events">${renderEventsList(dayEvents)}</div>
        </div>
      `;
    }).join('');

    return `<div class="planning-week">${columns}</div>`;
  }

  function renderMonthView() {
    const days = [];
    for (let date = new Date(monthStart); date < nextMonth; date.setDate(date.getDate() + 1)) {
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setDate(date.getDate() + 1);
      const dayEvents = events.filter((event) => inRange(event, dayStart, dayEnd));

      days.push(`
        <div class="planning-month-day${dayStart.toDateString() === todayStart.toDateString() ? ' today' : ''}">
          <div class="planning-month-header">
            <strong>${dayStart.toLocaleDateString('fr-FR', { day: '2-digit' })}</strong>
            <span>${dayStart.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
          </div>
          <div class="planning-events">${renderEventsList(dayEvents)}</div>
        </div>
      `);
    }

    return `<div class="planning-month">${days.join('')}</div>`;
  }

  const agendaLabels = {
    day: 'Planning jour',
    week: 'Planning semaine',
    month: 'Planning mois'
  };

  const agendaBody = agendaView === 'day'
    ? renderDayView()
    : agendaView === 'month'
      ? renderMonthView()
      : renderWeekView();

  const viewSelector = `
    <nav class="agenda-view-switch" aria-label="Vue agenda">
      <a class="${agendaView === 'day' ? 'active' : ''}" href="/agenda?view=day">Jour</a>
      <a class="${agendaView === 'week' ? 'active' : ''}" href="/agenda?view=week">Semaine</a>
      <a class="${agendaView === 'month' ? 'active' : ''}" href="/agenda?view=month">Mois</a>
    </nav>
  `;

  const googleSyncButton = `
    <a class="btn btn-secondary" href="/google/sync">
      Synchroniser Google Agenda
    </a>
  `;

  const newEventButton = `
    <button class="btn btn-primary" type="button" onclick="newEvent()">
      + Nouvel événement
    </button>
  `;

  const pageTitle = agendaLabels[agendaView];

  const content = `
      <div class="page-head agenda-page-head app-dark-page-head">
        <div class="clients-create-head">
          ${clientPageIcon('calendar', 'clients-title-icon')}
          <div>
            <h1>${escHtml(pageTitle)}</h1>
            <span>${events.length} événement${events.length > 1 ? 's' : ''}</span>
          </div>
        </div>
        ${viewSelector}
      </div>

      <div class="agenda-toolbar">
        ${googleSyncButton}
        ${newEventButton}
      </div>

      ${agendaBody}

      <div id="event-editor" class="event-editor hidden">

        <h3>Événement</h3>

        <input type="hidden" id="edit-id">

        <label>Titre</label>
        <input id="edit-title">

        <label>Type</label>
        <select id="edit-type">
          <option value="chantier">Chantier</option>
          <option value="pose">Pose</option>
          <option value="rdv">RDV</option>
        </select>

        <label>Début</label>
        <input type="datetime-local" id="edit-start">

        <label>Fin</label>
        <input type="datetime-local" id="edit-end">

        <div class="editor-actions">
          <button id="save-event">Enregistrer</button>
          <button id="delete-event" class="danger">Supprimer</button>
          <button id="cancel-edit">Annuler</button>
        </div>

      </div>

      <script>
      function toLocalDateTimeValue(date) {
        const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return offsetDate.toISOString().slice(0, 16);
      }

      function newEvent(){
        document.getElementById('event-editor').classList.remove('hidden');
        document.getElementById('edit-id').value = '';
        document.getElementById('edit-title').value = '';
        document.getElementById('edit-type').value = 'rdv';

        const now = new Date();
        const endDate = new Date(now.getTime() + 60 * 60 * 1000);

        document.getElementById('edit-start').value = toLocalDateTimeValue(now);
        document.getElementById('edit-end').value = toLocalDateTimeValue(endDate);
        document.getElementById('delete-event').style.display = 'none';
      }

      function editEvent(id,title,type,start,end){
        document.getElementById('event-editor').classList.remove('hidden');
        document.getElementById('edit-id').value=id;
        document.getElementById('edit-title').value=title;
        document.getElementById('edit-type').value=type;
        document.getElementById('edit-start').value = String(start || '').substring(0,16);
        document.getElementById('edit-end').value = String(end || '').substring(0,16);
        document.getElementById('delete-event').style.display = 'inline-block';
      }

      document.querySelectorAll('.planning-event').forEach(function (button) {
        button.addEventListener('click', function () {
          editEvent(
            button.dataset.eventId,
            button.dataset.eventTitle,
            button.dataset.eventType,
            button.dataset.eventStart,
            button.dataset.eventEnd
          );
        });
      });

      document.getElementById('cancel-edit').onclick = () => {
        document.getElementById('event-editor').classList.add('hidden');
      };

      document.getElementById('save-event').onclick = () => {
        const payload = {
          title: document.getElementById('edit-title').value,
          type: document.getElementById('edit-type').value,
          start_date: document.getElementById('edit-start').value,
          end_date: document.getElementById('edit-end').value
        };

        const id = document.getElementById('edit-id').value;

        fetch(
          id ? '/agenda/update' : '/agenda/add',
          {
            method:'POST',
            headers:{
              'Content-Type':'application/json'
            },
            body: JSON.stringify(
              id
                ? { id, ...payload }
                : payload
            )
          }
        ).then(()=>location.reload());
      };

      document.getElementById('delete-event').onclick = () => {
        if(!confirm('Supprimer cet événement ?')) return;

        fetch('/agenda/delete',{
          method:'POST',
          headers:{
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            id:document.getElementById('edit-id').value
          })
        }).then(()=>location.reload());
      };
      </script>
  `;

  res.send(
    pageTemplate(
      req,
      'Agenda',
      content
    )
  );
});

/* ===================== PRISES DE COTES ===================== */

app.get('/outils/prises-cotes', requireLogin, (req, res) => {
  const savedMeasurements = db
    .prepare('SELECT * FROM measurements ORDER BY updated_at DESC, id DESC LIMIT 12')
    .all();

  const cards = [
    {
      href: '/outils/prises-cotes/escalier',
      icon: '🪜',
      title: 'Escalier',
      desc: 'Fiche de prises de cotes Escalier',
    },
    {
      href: '/outils/prises-cotes/garde-corps',
      icon: '🧱',
      title: 'Garde-corps',
      desc: 'Fiche de prises de cotes Garde-corps',
    },
    {
      href: '/outils/prises-cotes/portail',
      icon: '🚪',
      title: 'Portail',
      desc: 'Fiche de prises de cotes Portail',
    },
    {
      href: '/outils/prises-cotes/cloture',
      icon: '🧰',
      title: 'Clôture',
      desc: 'Fiche de prises de cotes Clôture',
    },
  ]
    .map(
      (item) => `
      <a class="card" href="${item.href}">
        <div class="card-icon">${item.icon}</div>
        <div class="card-main">
          <div class="card-title">${escHtml(item.title)}</div>
          <div class="card-sub">${escHtml(item.desc)}</div>
        </div>
        <div class="card-cta">Ouvrir</div>
      </a>
    `
    )
    .join('');

  res.send(
    pageTemplate(
      req,
      'Prises de cotes',
      `
      <div class="page-head app-dark-page-head">
        <div class="clients-create-head">
          ${clientPageIcon('measurements', 'clients-title-icon')}
          <div>
            <h1>Prises de cotes</h1>
            <span>Modules chantier</span>
          </div>
        </div>
      </div>

      <section class="cards-grid">
        ${cards}
      </section>

      <section class="panel-soft measurement-linked-section">
        <h2>Fiches enregistrées</h2>
        ${savedMeasurements.length ? renderMeasurementCards(savedMeasurements) : '<div class="empty-state">Aucune fiche enregistrée côté serveur.</div>'}
      </section>
      `
    )
  );
});

app.get('/api/measurements/link-options', requireLogin, (req, res) => {
  const quotes = db
    .prepare('SELECT id, title, client_name, status FROM quotes ORDER BY id DESC')
    .all()
    .map((q) => ({
      id: q.id,
      label: `#${q.id} - ${q.client_name || 'Client non renseigné'} - ${q.title || 'Sans titre'} - ${normalizeQuoteStatus(q.status)}`
    }));

  const clientOrders = db
    .prepare('SELECT id, name, description, status FROM client_orders ORDER BY id DESC')
    .all()
    .map((o) => ({
      id: o.id,
      label: `#${o.id} - ${o.name || 'Client'} - ${o.description || 'Commande'} - ${o.status || 'En cours'}`
    }));

  res.json({ quotes, clientOrders });
});

app.post('/api/measurements', requireLogin, (req, res) => {
  const body = req.body || {};
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  const { quoteId, orderId } = normalizeMeasurementLink(body.quote_id ?? fields.quote_id, body.client_order_id ?? fields.client_order_id);
  const id = parseOptionalId(body.server_id || body.id);
  const moduleName = String(body.module || body.moduleLabel || fields.module || 'Prise de cote').trim();
  const recordName = String(body.recordName || '').trim() || `Fiche ${moduleName.toLowerCase()} ${formatDateLabel(isoDate())}`;
  const client = String(fields.client || '').trim() || null;
  const chantier = String(fields.chantier || '').trim() || null;
  const measureDate = String(fields.date || '').trim() || null;
  const now = new Date().toISOString();
  const data = JSON.stringify(body);

  if (id) {
    const existing = db.prepare('SELECT id FROM measurements WHERE id = ?').get(id);
    if (existing) {
      db.prepare(`
        UPDATE measurements
        SET module = ?, record_name = ?, client = ?, chantier = ?, measure_date = ?,
            quote_id = ?, client_order_id = ?, data = ?, updated_at = ?
        WHERE id = ?
      `).run(moduleName, recordName, client, chantier, measureDate, quoteId, orderId, data, now, id);
      return res.json({ ok: true, id });
    }
  }

  const byName = db.prepare('SELECT id FROM measurements WHERE module = ? AND record_name = ?').get(moduleName, recordName);
  if (byName) {
    db.prepare(`
      UPDATE measurements
      SET client = ?, chantier = ?, measure_date = ?, quote_id = ?, client_order_id = ?, data = ?, updated_at = ?
      WHERE id = ?
    `).run(client, chantier, measureDate, quoteId, orderId, data, now, byName.id);
    return res.json({ ok: true, id: byName.id });
  }

  const info = db.prepare(`
    INSERT INTO measurements
      (module, record_name, client, chantier, measure_date, quote_id, client_order_id, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(moduleName, recordName, client, chantier, measureDate, quoteId, orderId, data, now, now);

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get('/outils/prises-cotes/fiche/:id', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  if (!id) return res.status(400).send('ID prise de cote invalide');

  const measurement = db.prepare('SELECT * FROM measurements WHERE id = ?').get(id);
  if (!measurement) return res.status(404).send('Prise de cote introuvable');

  res.send(
    pageTemplate(
      req,
      measurementTitle(measurement),
      `
      <div class="page-head">
        <h1>${escHtml(measurementTitle(measurement))}</h1>
      </div>

      <section class="panel-soft measurement-detail">
        ${measurementLinkBadge(measurement)}
        <div class="measurement-detail-grid">
          <div><span>Module</span><strong>${escHtml(measurement.module || '—')}</strong></div>
          <div><span>Client</span><strong>${escHtml(measurement.client || '—')}</strong></div>
          <div><span>Chantier</span><strong>${escHtml(measurement.chantier || '—')}</strong></div>
          <div><span>Date</span><strong>${escHtml(formatDateLabel(measurement.measure_date))}</strong></div>
        </div>
        <div class="nav-actions">
          <a class="btn btn-secondary" href="/outils/prises-cotes">Retour prises de cotes</a>
        </div>
      </section>
      `
    )
  );
});

app.get('/outils/prises-cotes/:module', requireLogin, (req, res, next) => {
  const moduleName = String(req.params.module || '').trim().toLowerCase();
  const fileName = MEASUREMENT_SHEETS[moduleName];

  if (!fileName) return next();

  const filePath = path.join(MEASUREMENTS_PUBLIC_DIR, fileName);
  return res.sendFile(filePath);
});

app.get('/outils/prises-cotes/:asset', requireLogin, (req, res, next) => {
  const asset = String(req.params.asset || '').trim();
  if (!MEASUREMENTS_ASSETS.has(asset)) return next();

  const filePath = path.join(MEASUREMENTS_PUBLIC_DIR, asset);
  return res.sendFile(filePath);
});

/* ===================== GOOGLE OAUTH ROUTES ===================== */

app.get('/google/auth', requireLogin, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  });

  res.redirect(url);
});

app.get('/google/callback', requireLogin, async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    req.session.googleTokens = tokens;

    res.redirect('/agenda');
  } catch (err) {
    console.error(err);
    res.send('Erreur connexion Google');
  }
});

// Synchronisation des événements internes → Google Agenda (sans doublons)
app.get('/google/sync', requireLogin, async (req, res) => {
  
  if (!req.session.googleTokens) {
    return res.redirect('/google/auth');
  }

  oauth2Client.setCredentials(req.session.googleTokens);

  const calendar = google.calendar({
    version: 'v3',
    auth: oauth2Client,
  });



  try {
    const GOOGLE_CALENDAR_ID =
'family00522959929950336958@group.calendar.google.com';

const now = new Date();

const oneWeekAgo = new Date();
oneWeekAgo.setDate(now.getDate() - 7);

const googleEvents = await calendar.events.list({
  calendarId: GOOGLE_CALENDAR_ID,
  singleEvents: true,
  timeMin: oneWeekAgo.toISOString(),
  maxResults: 2500
});
const googleIds = new Set(
  (googleEvents.data.items || []).map(e => e.id)
);



const localEvents = db.prepare(`
  SELECT *
  FROM events
  WHERE start_date >= ?
`).all(oneWeekAgo.toISOString());

for (const e of localEvents) {

  if (!googleIds.has(e.google_event_id)) {

    db.prepare(`
      DELETE FROM events
      WHERE id = ?
    `).run(e.id);

  }
}
for (const g of googleEvents.data.items || []) {

  const existing = db.prepare(`
    SELECT *
    FROM events
    WHERE google_event_id = ?
  `).get(g.id);

  if (!existing) {

 const start =
  g.start?.dateTime || g.start?.date;

const end =
  g.end?.dateTime || g.end?.date;

console.log(
  'IMPORT GOOGLE',
  g.summary,
  start,
  end
);

if (!start || !end) {
  console.log('ÉVÉNEMENT IGNORÉ');
  continue;
}

db.prepare(`
  INSERT INTO events (
    title,
    start_date,
    end_date,
    google_event_id,
    type
  )
  VALUES (?, ?, ?, ?, ?)
`).run(
  g.summary || 'Sans titre',
  start,
  end,
  g.id,
  'chantier'
);

  }
}

const allEvents = db.prepare(`
  SELECT *
  FROM events
  WHERE start_date >= ?
`).all(oneWeekAgo.toISOString());

for (const e of allEvents) {

  console.log('EVENT =', e);

  const startDate = new Date(e.start_date);
  const endDate = new Date(e.end_date || e.start_date);

  if (isNaN(startDate.getTime())) {
    console.error('DATE DEBUT INVALIDE', e);
    continue;
  }

  if (isNaN(endDate.getTime())) {
    console.error('DATE FIN INVALIDE', e);
    continue;
  }

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // Déjà lié à Google → mise à jour
  if (e.google_event_id) {

    await calendar.events.update({
      calendarId: GOOGLE_CALENDAR_ID,
      eventId: e.google_event_id,
      requestBody: {
        summary: e.title,
        start: {
          dateTime: startIso,
          timeZone: 'Europe/Paris',
        },
        end: {
          dateTime: endIso,
          timeZone: 'Europe/Paris',
        }
      }
    });

    continue;
  }

  // Pas encore lié → création Google
  const created = await calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    requestBody: {
      summary: e.title,
      start: {
        dateTime: startIso,
        timeZone: 'Europe/Paris',
      },
      end: {
        dateTime: endIso,
        timeZone: 'Europe/Paris',
      }
    }
  });

  db.prepare(`
    UPDATE events
    SET google_event_id = ?
    WHERE id = ?
  `).run(
    created.data.id,
    e.id
  );

}
    

    res.send(`
      <h2>✅ Synchronisation Google Agenda terminée (sans doublons)</h2>
      <a href="/agenda">Retour à l’agenda</a>
    `);
  } catch (err) {
    console.error('Erreur Google :', err.response ? err.response.data : err);
    res.send(`
      <h2>❌ Erreur lors de la synchro Google</h2>
      <pre>${err.response ? JSON.stringify(err.response.data, null, 2) : err}</pre>
      <a href="/agenda">Retour à l’agenda</a>
    `);
  }
});


app.get('/google/calendars', requireLogin, async (req, res) => {

  oauth2Client.setCredentials(req.session.googleTokens);

  const calendar = google.calendar({
    version: 'v3',
    auth: oauth2Client
  });

  const result = await calendar.calendarList.list();

  console.log(result.data.items);

  res.send('OK');
});
/* ===================== CHANTIERS ===================== */

app.get('/chantiers', requireLogin, (req, res) => {
  return res.redirect('/orders/clients');
  const clients = db.prepare('SELECT id, name FROM clients ORDER BY name ASC').all();
  const chantiers = db
    .prepare(`
      SELECT chantiers.*, clients.name AS client_name
      FROM chantiers
      LEFT JOIN clients ON clients.id = chantiers.client_id
      ORDER BY
        CASE WHEN chantiers.status IN ('Terminé', 'Facturé') THEN 1 ELSE 0 END,
        chantiers.created_at DESC,
        chantiers.id DESC
    `)
    .all();

  const clientOptions = [
    '<option value="">Aucun client lié</option>',
    ...clients.map((client) => `<option value="${client.id}">${escHtml(client.name || 'Client')}</option>`)
  ].join('');

  const cards = chantiers.length
    ? chantiers
        .map((chantier) => {
          const planned = Number(chantier.planned_hours || 0);
          const done = Number(chantier.done_hours || 0);
          const diff = done - planned;
          const progress = chantierProgress(done, planned);
          const statusIndex = Math.max(0, CHANTIER_STATUSES.indexOf(normalizeChantierStatus(chantier.status)));

          return `
            <article class="chantier-card">
              <div class="chantier-card-head">
                <div>
                  <h3>${escHtml(chantier.name)}</h3>
                  <p>${chantier.client_name ? escHtml(chantier.client_name) : 'Aucun client lié'}</p>
                </div>
                <span class="chantier-status chantier-status-${statusIndex}">${escHtml(normalizeChantierStatus(chantier.status))}</span>
              </div>

              <div class="chantier-hours-grid">
                <div><span>Prévu</span><strong>${formatHours(planned)}</strong></div>
                <div><span>Réalisé</span><strong>${formatHours(done)}</strong></div>
                <div><span>Écart</span><strong class="${diff > 0 ? 'chantier-over' : ''}">${formatHours(diff)}</strong></div>
              </div>

              <div class="chantier-progress" aria-label="Avancement ${progress}%">
                <span style="width:${progress}%"></span>
              </div>
              <div class="chantier-progress-label">${progress}% d’avancement</div>

              <a class="btn chantier-open-btn" href="/chantiers/${chantier.id}">Ouvrir</a>
            </article>
          `;
        })
        .join('')
    : '<p class="dash-empty">Aucun chantier pour le moment.</p>';

  res.send(
    pageTemplate(
      req,
      'Chantiers',
      `
      <div class="chantiers-page">
        <div class="page-head chantiers-head">
          <div>
            <h1>Chantiers</h1>
          </div>
          <a class="btn btn-primary" href="#new-chantier">+ Nouveau chantier</a>
        </div>

        <form id="new-chantier" method="POST" action="/chantiers" class="chantiers-form">
          <h2>Nouveau chantier</h2>

          <div class="chantiers-form-grid">
            <label>
              <span>Nom du chantier *</span>
              <input name="name" required placeholder="Ex: Verrière atelier" />
            </label>

            <label>
              <span>Client</span>
              <select name="client_id">${clientOptions}</select>
            </label>

            <label>
              <span>Statut</span>
              <select name="status">${chantierStatusOptions('À préparer')}</select>
            </label>

            <label>
              <span>Heures prévues</span>
              <input name="planned_hours" type="number" min="0" step="0.25" value="0" />
            </label>

            <label>
              <span>Date début</span>
              <input name="start_date" type="date" />
            </label>

            <label>
              <span>Date fin prévue</span>
              <input name="end_date" type="date" />
            </label>

            <label class="chantiers-form-wide">
              <span>Description</span>
              <textarea name="description" rows="3" placeholder="Notes, périmètre, contraintes..."></textarea>
            </label>
          </div>

          <div class="chantiers-form-actions">
            <button class="btn btn-primary" type="submit">Créer le chantier</button>
          </div>
        </form>

        <section class="chantiers-grid">
          ${cards}
        </section>
      </div>
      `
    )
  );
});

app.post('/chantiers', requireLogin, (req, res) => {
  return res.redirect('/orders/clients');
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).send('Nom du chantier requis');

  let clientId = parseOptionalClientId(req.body.client_id);
  if (clientId) {
    const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(clientId);
    if (!client) clientId = null;
  }

  const description = String(req.body.description || '').trim();
  const status = normalizeChantierStatus(req.body.status);
  const plannedHours = parsePositiveNumber(req.body.planned_hours);
  const startDate = String(req.body.start_date || '').trim();
  const endDate = String(req.body.end_date || '').trim();

  const result = db
    .prepare(`
      INSERT INTO chantiers (
        name,
        client_id,
        description,
        status,
        planned_hours,
        done_hours,
        start_date,
        end_date,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `)
    .run(
      name,
      clientId,
      description || null,
      status,
      plannedHours,
      startDate || null,
      endDate || null,
      new Date().toISOString()
    );

  res.redirect(`/chantiers/${result.lastInsertRowid}`);
});

app.get('/chantiers/:id', requireLogin, (req, res) => {
  return res.redirect('/orders/clients');
  const chantierId = Number(req.params.id);
  if (!Number.isInteger(chantierId) || chantierId <= 0) return res.status(400).send('Chantier invalide');

  const chantier = db
    .prepare(`
      SELECT chantiers.*, clients.name AS client_name
      FROM chantiers
      LEFT JOIN clients ON clients.id = chantiers.client_id
      WHERE chantiers.id = ?
    `)
    .get(chantierId);

  if (!chantier) return res.status(404).send('Chantier introuvable');

  const planned = Number(chantier.planned_hours || 0);
  const done = Number(chantier.done_hours || 0);
  const diff = done - planned;
  const progress = chantierProgress(done, planned);
  const statusIndex = Math.max(0, CHANTIER_STATUSES.indexOf(normalizeChantierStatus(chantier.status)));

  res.send(
    pageTemplate(
      req,
      `Chantier : ${chantier.name}`,
      `
      <div class="chantier-detail">
        <section class="chantier-detail-hero">
          <div>
            <span class="chantier-status chantier-status-${statusIndex}">${escHtml(normalizeChantierStatus(chantier.status))}</span>
            <h1>${escHtml(chantier.name)}</h1>
          </div>
          <a class="btn btn-secondary" href="/chantiers">Retour</a>
        </section>

        <section class="chantier-detail-grid">
          <article class="chantier-metric"><span>Heures prévues</span><strong>${formatHours(planned)}</strong></article>
          <article class="chantier-metric"><span>Heures réalisées</span><strong>${formatHours(done)}</strong></article>
          <article class="chantier-metric"><span>Écart</span><strong class="${diff > 0 ? 'chantier-over' : ''}">${formatHours(diff)}</strong></article>
          <article class="chantier-metric"><span>Avancement</span><strong>${progress}%</strong></article>
        </section>

        <section class="chantier-detail-panel">
          <h2>Avancement</h2>
          <div class="chantier-progress chantier-progress-large" aria-label="Avancement ${progress}%">
            <span style="width:${progress}%"></span>
          </div>
          <div class="chantier-dates">
            <span>Début : ${escHtml(chantier.start_date || '—')}</span>
            <span>Fin prévue : ${escHtml(chantier.end_date || '—')}</span>
          </div>
          <p>${chantier.description ? escHtml(chantier.description) : 'Aucune description.'}</p>
        </section>

        <form method="POST" action="/chantiers/${chantier.id}" class="chantiers-form">
          <h2>Modifier le chantier</h2>

          <div class="chantiers-form-grid">
            <label>
              <span>Statut</span>
              <select name="status">${chantierStatusOptions(chantier.status)}</select>
            </label>

            <label>
              <span>Heures prévues</span>
              <input name="planned_hours" type="number" min="0" step="0.25" value="${planned}" />
            </label>

            <label>
              <span>Heures réalisées</span>
              <input name="done_hours" type="number" min="0" step="0.25" value="${done}" />
            </label>

            <label>
              <span>Date début</span>
              <input name="start_date" type="date" value="${escHtml(chantier.start_date || '')}" />
            </label>

            <label>
              <span>Date fin prévue</span>
              <input name="end_date" type="date" value="${escHtml(chantier.end_date || '')}" />
            </label>

            <label class="chantiers-form-wide">
              <span>Description</span>
              <textarea name="description" rows="4">${escHtml(chantier.description || '')}</textarea>
            </label>
          </div>

          <div class="chantiers-form-actions">
            <button class="btn btn-primary" type="submit">Enregistrer</button>
          </div>
        </form>
      </div>
      `
    )
  );
});

app.post('/chantiers/:id', requireLogin, (req, res) => {
  return res.redirect('/orders/clients');
  const chantierId = Number(req.params.id);
  if (!Number.isInteger(chantierId) || chantierId <= 0) return res.status(400).send('Chantier invalide');

  const existing = db.prepare('SELECT id FROM chantiers WHERE id = ?').get(chantierId);
  if (!existing) return res.status(404).send('Chantier introuvable');

  const status = normalizeChantierStatus(req.body.status);
  const plannedHours = parsePositiveNumber(req.body.planned_hours);
  const doneHours = parsePositiveNumber(req.body.done_hours);
  const description = String(req.body.description || '').trim();
  const startDate = String(req.body.start_date || '').trim();
  const endDate = String(req.body.end_date || '').trim();

  db
    .prepare(`
      UPDATE chantiers
      SET status = ?,
          planned_hours = ?,
          done_hours = ?,
          description = ?,
          start_date = ?,
          end_date = ?
      WHERE id = ?
    `)
    .run(
      status,
      plannedHours,
      doneHours,
      description || null,
      startDate || null,
      endDate || null,
      chantierId
    );

  res.redirect(`/chantiers/${chantierId}`);
});

/* ===================== CLIENTS ===================== */

app.get('/clients', requireLogin, (req, res) => {
  const dbClients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC, id DESC').all();
  const dbMap = new Map();
  dbClients.forEach((c) => dbMap.set(normalizeKey(c.name), c));


  // PC
  let pcFolders = [];
  try {
    pcFolders = fs
      .readdirSync(CLIENT_PC_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (err) {
    console.error('Erreur lecture clients_pc :', err);
  }

  // Merge
  const merged = [];
for (const c of dbClients) {
  const folder = safeName(c.name);
  const clientDir = path.join(CLIENT_PC_DIR, folder);
  ensureDir(clientDir);

  merged.push({
    id: c.id,
    name: c.name,
    address: c.address,
    postal_code: c.postal_code,
    city: c.city,
    email: c.email,
    phone: c.phone,
    folder,
    source: 'db',
  });
}

for (const folder of pcFolders) {
  if (!dbMap.has(normalizeKey(folder))) {

    merged.push({
      id: null,
      name: folder,
      address: '',
      postal_code: '',
      city: '',
      email: '',
      phone: '',
      folder,
      source: 'pc',
    });

  }
}

  merged.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));

  const cards = merged.length
    ? merged
        .map(
          (c) => `
<div class="client-card-modern">

  <a class="client-card-link"
     href="/pc-folders/${encodeURIComponent(c.folder)}">

    <div class="client-header">
      <div class="client-name">
        ${escHtml(c.name)}
      </div>

      <span class="client-source">
        ${clientPageIcon(c.source === 'pc' ? 'folder' : 'database', 'client-source-icon')}
        ${c.source === 'pc' ? 'PC' : 'DB'}
      </span>
    </div>

    <div class="client-infos">

      ${c.city ? `
        <div>${clientPageIcon('building', 'client-info-icon')} ${escHtml(c.city)}</div>
      ` : ''}

      ${c.phone ? `
        <div>${clientPageIcon('phone', 'client-info-icon')} ${escHtml(c.phone)}</div>
      ` : ''}

      ${c.email ? `
        <div>${clientPageIcon('mail', 'client-info-icon')} ${escHtml(c.email)}</div>
      ` : ''}

    </div>

  </a>

  ${c.source === 'db' ? `
  <form method="POST"
        action="/clients/delete"
        onsubmit="return confirm('Supprimer définitivement ce client ?');">

    <input type="hidden" name="id" value="${c.id}">

    <button class="client-delete-btn">
      ${clientPageIcon('trash', 'client-delete-icon')}
    </button>

  </form>
  ` : ''}

</div>
        `
        )
        .join('')
    : `<div class="empty-state">Aucun client</div>`;

  res.send(
    pageTemplate(
      req,
      'Clients',
      `
      <div class="clients-page-modern">
        <form method="POST" action="/clients" class="clients-create-card">
          <div class="clients-create-head">
            ${clientPageIcon('clients', 'clients-title-icon')}
            <h1>Ajouter un client</h1>
          </div>

          <div class="clients-form-grid">
            <label class="clients-field">
              <span>Nom *</span>
              <div class="clients-input-shell">
                ${clientPageIcon('user')}
                <input name="name" required placeholder="Nom du client" />
              </div>
            </label>

            <label class="clients-field">
              <span>Email</span>
              <div class="clients-input-shell">
                ${clientPageIcon('mail')}
                <input name="email" type="email" placeholder="client@email.com" />
              </div>
            </label>

            <label class="clients-field clients-field-wide">
              <span>Adresse</span>
              <div class="clients-input-shell">
                ${clientPageIcon('location')}
                <input name="address" placeholder="Adresse" />
              </div>
            </label>

            <label class="clients-field">
              <span>Code postal</span>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
                <input name="postal_code" placeholder="00000" />
              </div>
            </label>

            <label class="clients-field">
              <span>Ville</span>
              <div class="clients-input-shell">
                ${clientPageIcon('building')}
                <input name="city" placeholder="Ville" />
              </div>
            </label>

            <label class="clients-field">
              <span>Téléphone</span>
              <div class="clients-input-shell">
                ${clientPageIcon('phone')}
                <input name="phone" placeholder="06…" />
              </div>
            </label>
          </div>

          <button class="clients-submit-btn" type="submit">
            <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
            Ajouter le client
          </button>
        </form>

        <section class="clients-list-card">
          <div class="clients-list-head">
            <div>
              <h2>Clients</h2>
              <span>${merged.length} au total</span>
            </div>
            <strong>${merged.length}</strong>
          </div>

          <div class="clients-search-shell">
            ${clientPageIcon('search')}
            <input id="clientSearch" class="search" placeholder="Rechercher un client…" autocomplete="off" />
          </div>
        </section>

      <section class="cards-grid" id="clientsGrid">${cards}</section>
      </div>

      <script>
        (function(){
          const input = document.getElementById('clientSearch');
          const cards = document.querySelectorAll('.client-card-modern');
          if (!input) return;
          input.addEventListener('input', function(){
            const q = (this.value||'').toLowerCase();
            cards.forEach(card => {
              const name = card.textContent.toLowerCase();
              card.style.display = name.includes(q) ? '' : 'none';
            });
          });
        })();
      </script>
      `
    )
  );
});

app.post('/clients', requireLogin, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).send('Nom requis');

  const address = String(req.body.address || '').trim();
  const postal_code = String(req.body.postal_code || '').trim();
  const city = String(req.body.city || '').trim();
  const email = String(req.body.email || '').trim();
  const phone = String(req.body.phone || '').trim();

const existing = db
  .prepare('SELECT id FROM clients WHERE LOWER(name) = LOWER(?)')
  .get(name);


  if (!existing) {
    db.prepare(
      `
      INSERT INTO clients (name, address, postal_code, city, email, phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(name, address || null, postal_code || null, city || null, email || null, phone || null, new Date().toISOString());
  }

  const folder = safeName(name);
  ensureDir(path.join(CLIENT_PC_DIR, folder));

  res.redirect('/clients');
});

// Fiche client (route basée sur le dossier PC)
app.get('/clients/:client', requireLogin, (req, res) => {
  const clientFolder = safeName(req.params.client);
  res.redirect(`/pc-folders/${encodeURIComponent(clientFolder)}`);
});
app.post('/clients/delete', requireLogin, (req, res) => {

  console.log(req.body);

  db.prepare(`
    DELETE FROM clients
    WHERE id = ?
  `).run(req.body.id);

  res.redirect('/clients');

});
/* ===================== COMMANDES CLIENTS ===================== */

app.get('/orders/clients', requireLogin, (req, res) => {
  const isAtelier =
  req.session?.user?.role === 'atelier';
  const orders = db
    .prepare(
      `
      SELECT *
      FROM client_orders
      WHERE status != 'Terminée'
      ORDER BY date DESC, id DESC
    `
    )
    .all();

  const totalAmount = orders.reduce((sum, o) => sum + (o.price || 0), 0);

  // datalist clients PC
  let pcFolders = [];
  try {
    pcFolders = fs
      .readdirSync(CLIENT_PC_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {}

  const pcFoldersOptions = pcFolders.map((name) => `<option value="${escHtml(name)}"></option>`).join('');

  const todayIso = isoDate();

  const cards =
    orders.length > 0
      ? orders
          .map((o) => {
            const safeClientFolder = safeName(o.name);
            const orderFolderName = safeName(o.description && o.description.trim() !== '' ? o.description : `Commande_${o.id}`);
            const clientFolderUrl = `/pc-folders/${encodeURIComponent(safeClientFolder)}/${encodeURIComponent(orderFolderName)}`;

            const dateLabel = (o.date || '').slice(0, 10);
            const priceLabel = (o.price || 0).toFixed(2) + ' €';
            const statusLabel = o.status || 'En cours';
const realMinutes = db.prepare(`
  SELECT COALESCE(SUM(minutes_total),0) AS total
  FROM chantier_hours
  WHERE client = ?
  AND order_name = ?
`).get(o.name, o.description);

const actualHours =
  Number(realMinutes.total || 0) / 60;

const plannedHours =
  Number(o.planned_hours || 0);

const chantierStatus = normalizeChantierStatus(o.chantier_status);
const progress = clientOrderStageProgress(chantierStatus);
const isOverHours = plannedHours > 0 && actualHours > plannedHours;

const endDate = String(o.chantier_end_date || '').slice(0, 10);
const isLate = endDate && endDate < todayIso;
            return `
              <article class="order-card modern-client-order-card">
                <header class="modern-client-order-head">
                  <div class="modern-client-order-icon">
                    ${clientPageIcon('folder', 'modern-client-order-svg')}
                  </div>
                  <div class="modern-client-order-title">
                    <h2>${escHtml(o.description || `Commande #${o.id}`)}</h2>
                    <p>${escHtml(o.name || 'Client non renseigné')}</p>
                  </div>
                  <span class="modern-status-badge progress">${escHtml(statusLabel)}</span>
                </header>

                <div class="modern-client-order-row">
                  <span class="chantier-status ${chantierStatusClass(chantierStatus)}">${escHtml(chantierStatus)}</span>
                  <strong>${progress}%</strong>
                  ${isLate ? '<span class="modern-late-badge">Retard</span>' : ''}
                </div>

                <div class="modern-client-order-progress">
                  <div class="chantier-progress client-order-stage-progress ${isOverHours ? 'over-hours' : 'ok-hours'}"><span style="width:${progress}%"></span></div>
                </div>

                <div class="modern-client-order-actions">
                  <a class="modern-client-order-open" href="${clientFolderUrl}">
                    ${clientPageIcon('folder', 'modern-client-order-open-icon')}
                    <span>Ouvrir</span>
                    <b aria-hidden="true">›</b>
                  </a>
                  <form method="POST" action="/orders/client/done" onsubmit="return confirm('Terminer cette commande ?');">
                    <input type="hidden" name="id" value="${o.id}" />
                    <button type="submit" class="modern-order-done-btn" title="Terminer">${clientPageIcon('check', 'modern-action-icon')} Terminer</button>
                  </form>
                </div>
              </article>
            `;
          })
          .join('')
      : `<p class="empty">Aucune commande client.</p>`;

  const preClient = String(req.query.client || '').trim();

  res.send(
    pageTemplate(
      req,
      'Commandes clients',
      `
      <div class="modern-page modern-client-orders-page">
        <section class="modern-list-head modern-client-orders-head">
          <div class="clients-create-head">
            ${clientPageIcon('folder', 'clients-title-icon')}
            <div>
              <h1>Commandes clients</h1>
              <span>${orders.length} commande${orders.length > 1 ? 's' : ''} en cours${!isAtelier ? ` · ${totalAmount.toFixed(2)} €` : ''}</span>
            </div>
          </div>
        </section>

        <section class="clients-create-card modern-form-card modern-client-order-form modern-client-order-add-card is-collapsed" id="new-client-order" data-client-order-add-card>
          <button type="button" class="modern-client-order-add-toggle" aria-expanded="false" aria-controls="client-order-add-panel" data-client-order-add-toggle>
            <span class="modern-client-order-add-title">
              ${clientPageIcon('add', 'clients-title-icon')}
              <h2>Nouvelle commande</h2>
            </span>
            <span class="modern-client-order-add-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
          </button>

          <div class="modern-client-order-add-panel" id="client-order-add-panel" hidden data-client-order-add-panel>
            <form method="POST" action="/orders/client" class="modern-client-order-add-form">
              <div class="modern-form-grid">
                <label class="clients-field">
                  <span>Client</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('user')}
                    <input list="pc-clients" name="name" placeholder="Nom du client ou dossier PC" required value="${escHtml(preClient)}" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Nom / objet commande</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('folder')}
                    <input name="description" placeholder="Ex : Escalier, portail, garde-corps" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Statut commande</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('database')}
                    <select disabled>
                      <option>En cours</option>
                    </select>
                  </div>
                </label>

                <label class="clients-field">
                  <span>Statut chantier</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('database')}
                    <select name="chantier_status">${chantierStatusOptions('À préparer')}</select>
                  </div>
                </label>

                <label class="clients-field">
                  <span>Heures prévues</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input type="number" name="planned_hours" min="0" step="0.25" placeholder="0" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Date commande</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input type="date" name="date" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Date début</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input type="date" name="chantier_start_date" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Date fin prévue</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input type="date" name="chantier_end_date" />
                  </div>
                </label>

                ${!isAtelier ? `
                <label class="clients-field">
                  <span>Prix (€)</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('postal')}
                    <input type="number" name="price" step="0.01" placeholder="0.00" />
                  </div>
                </label>
                ` : ''}
              </div>

              <div class="modern-form-actions">
                <button type="submit" class="clients-submit-btn">
                  <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
                  Créer la commande
                </button>
                <a class="modern-cancel-link" href="/clients">Voir clients</a>
              </div>

              <datalist id="pc-clients">${pcFoldersOptions}</datalist>
            </form>
          </div>
        </section>

        <section class="orders-cards-section modern-client-orders-section">
          <div class="modern-client-orders-grid">${cards}</div>
        </section>
      </div>
      <script>
        (function(){
          var card = document.querySelector('[data-client-order-add-card]');
          if (!card) return;
          var toggle = card.querySelector('[data-client-order-add-toggle]');
          var panel = card.querySelector('[data-client-order-add-panel]');
          if (!toggle || !panel) return;
          toggle.addEventListener('click', function(){
            var isOpen = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!isOpen));
            if (isOpen) {
              card.classList.remove('is-open');
              card.classList.add('is-collapsed');
              window.setTimeout(function(){
                if (toggle.getAttribute('aria-expanded') !== 'true') panel.hidden = true;
              }, 230);
            } else {
              panel.hidden = false;
              window.requestAnimationFrame(function(){
                card.classList.add('is-open');
                card.classList.remove('is-collapsed');
              });
            }
          });
        })();
      </script>
      `
    )
  );
});

app.post('/orders/client', requireLogin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const date = String(req.body.date || '').trim();
  const price = req.body.price;
  const chantierStatus = normalizeChantierStatus(req.body.chantier_status);
  const plannedHours = parsePositiveNumber(req.body.planned_hours);
  const chantierStartDate = String(req.body.chantier_start_date || '').trim() || null;
  const chantierEndDate = String(req.body.chantier_end_date || '').trim() || null;

  if (!name) return res.status(400).send('Nom client requis');

  const dateValue = date && date !== '' ? date : isoDate();

  const info = db
    .prepare(
      `
	    INSERT INTO client_orders (
        name,
        description,
        date,
        price,
        planned_hours,
        chantier_status,
        chantier_start_date,
        chantier_end_date,
        status,
        created_at
      )
	    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'En cours', ?)
	  `
    )
	    .run(
        name,
        description || null,
        dateValue,
        price ? parseFloat(price) : 0,
        plannedHours,
        chantierStatus,
        chantierStartDate,
        chantierEndDate,
        new Date().toISOString()
      );

  const orderId = info.lastInsertRowid;



// Interne
const internalDir = path.join(CLIENT_ORDER_FILES_DIR, String(orderId));

console.log('CLIENT_ORDER_FILES_DIR =', CLIENT_ORDER_FILES_DIR);
console.log('internalDir =', internalDir);

try {
  console.log(
    'CLIENT_ORDER_FILES_DIR isDirectory =',
    fs.existsSync(CLIENT_ORDER_FILES_DIR)
      ? fs.statSync(CLIENT_ORDER_FILES_DIR).isDirectory()
      : 'NOT EXISTS'
  );
} catch (e) {
  console.log('STAT ERROR =', e.message);
}

ensureDir(internalDir);

  // PC
  const safeClientFolder = safeName(name);
  const clientDir = path.join(CLIENT_PC_DIR, safeClientFolder);
  ensureDir(clientDir);

  const orderFolderName = safeName(description && description.trim() !== '' ? description : `Commande_${orderId}`);
  const pcOrderDir = path.join(clientDir, orderFolderName);
  ensureDir(pcOrderDir);
  ensureStandardSubfolders(pcOrderDir);

  res.redirect('/orders/clients');
});

app.post('/orders/client/done', requireLogin, (req, res) => {
  db.prepare("UPDATE client_orders SET status = 'Terminée' WHERE id = ?").run(req.body.id);
  res.redirect('/orders/clients');
});

/* ===================== COMMANDES FOURNISSEURS ===================== */

app.get('/orders/suppliers', requireLogin, (req, res) => {
  const orders = db
    .prepare('SELECT * FROM supplier_orders ORDER BY date DESC, id DESC')
    .all();

  const activeCount = orders.filter((o) => String(o.status || 'En cours') !== 'Terminée').length;
  const cards = orders.length > 0
    ? orders.map((o) => {
        const status = String(o.status || 'En cours');
        const statusClass = status === 'Terminée' ? 'done' : 'progress';
        const dateLabel = String(o.date || '').slice(0, 10) || 'Date non renseignée';
        return `
          <article class="supplier-modern-card">
            <header>
              <span class="supplier-modern-icon">${clientPageIcon('supplierOrders', 'modern-client-order-svg')}</span>
              <div>
                <h2>${escHtml(o.name || 'Commande fournisseur')}</h2>
                <p>${escHtml(o.description || 'Aucune description')}</p>
              </div>
              <span class="modern-status-badge ${statusClass}">${escHtml(status)}</span>
            </header>

            <div class="supplier-modern-meta">
              <span>${clientPageIcon('calendar', 'modern-action-icon')} ${escHtml(dateLabel)}</span>
            </div>

            <div class="supplier-modern-actions">
              <form method="POST" action="/orders/supplier/delete" onsubmit="return confirm('Supprimer cette commande ?');">
                <input type="hidden" name="id" value="${o.id}">
                <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
              </form>
            </div>
          </article>
        `;
      }).join('')
    : '<div class="empty-state">Aucune commande fournisseur</div>';

  res.send(
    pageTemplate(req, 'Commandes fournisseurs', `
      <div class="modern-page supplier-modern-page">
        <section class="modern-list-head modern-client-orders-head supplier-modern-head">
          <div class="clients-create-head">
            ${clientPageIcon('supplierOrders', 'clients-title-icon')}
            <div>
              <h1>Commandes fournisseurs</h1>
              <span>${orders.length} commande${orders.length > 1 ? 's' : ''} · ${activeCount} en cours</span>
            </div>
          </div>
        </section>

        <section class="clients-create-card modern-form-card modern-client-order-form supplier-order-add-card is-collapsed" id="new-supplier-order" data-supplier-order-add-card>
          <button type="button" class="modern-client-order-add-toggle" aria-expanded="false" aria-controls="supplier-order-add-panel" data-supplier-order-add-toggle>
            <span class="modern-client-order-add-title">
              ${clientPageIcon('add', 'clients-title-icon')}
              <span>Nouvelle commande fournisseur</span>
            </span>
            <span class="modern-client-order-add-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
          </button>

          <div class="modern-client-order-add-panel" id="supplier-order-add-panel" hidden data-supplier-order-add-panel>
            <form method="POST" action="/orders/supplier" class="modern-client-order-add-form">
              <div class="modern-form-grid supplier-modern-form-grid">
                <label class="clients-field">
                  <span>Nom</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('supplierOrders')}
                    <input name="name" required placeholder="Nom fournisseur ou commande" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Description</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('folder')}
                    <input name="description" placeholder="Ex : acier, quincaillerie, traitement" />
                  </div>
                </label>

                <label class="clients-field">
                  <span>Date</span>
                  <div class="clients-input-shell">
                    ${clientPageIcon('calendar')}
                    <input name="date" type="date" />
                  </div>
                </label>
              </div>

              <div class="modern-form-actions">
                <button type="submit" class="clients-submit-btn">
                  <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
                  Créer la commande
                </button>
              </div>
            </form>
          </div>
        </section>

        <section class="supplier-modern-grid">
          ${cards}
        </section>
      </div>
      <script>
        (function(){
          var card = document.querySelector('[data-supplier-order-add-card]');
          if (!card) return;
          var toggle = card.querySelector('[data-supplier-order-add-toggle]');
          var panel = card.querySelector('[data-supplier-order-add-panel]');
          if (!toggle || !panel) return;
          toggle.addEventListener('click', function(){
            var isOpen = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!isOpen));
            if (isOpen) {
              card.classList.remove('is-open');
              card.classList.add('is-collapsed');
              window.setTimeout(function(){
                if (toggle.getAttribute('aria-expanded') !== 'true') panel.hidden = true;
              }, 230);
            } else {
              panel.hidden = false;
              window.requestAnimationFrame(function(){
                card.classList.add('is-open');
                card.classList.remove('is-collapsed');
              });
            }
          });
        })();
      </script>
    `)
  );
});
app.post('/orders/supplier', requireLogin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const date = String(req.body.date || '').trim() || isoDate();

  db.prepare(`
    INSERT INTO supplier_orders (name, description, date, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    name,
    description || null,
    date,
    new Date().toISOString()
  );

  res.redirect('/orders/suppliers');
});
app.post('/orders/supplier/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM supplier_orders WHERE id = ?').run(req.body.id);
  res.redirect('/orders/suppliers');
});

/* ===================== PC FOLDERS (NAVIGATION) ===================== */

app.get('/pc-folders', requireLogin, (req, res) => res.redirect('/clients'));

app.get('/pc-folders/:client', requireLogin, (req, res) => {
  const client = safeName(req.params.client);
  const clientDir = path.join(CLIENT_PC_DIR, client);

  if (!fs.existsSync(clientDir) || !fs.lstatSync(clientDir).isDirectory()) {
    return res.status(404).send('Client introuvable sur le PC');
  }

  let orders = [];
  try {
    orders = fs
      .readdirSync(clientDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  } catch {}

  const cards = orders.length
    ? orders
        .map(
          (orderName) => `
        <article class="pc-modern-card">
          <a class="pc-modern-card-link" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(orderName)}" aria-label="Ouvrir ${escHtml(orderName)}"></a>
          ${pcFolderIcon('Commandes')}
          <div class="pc-modern-main">
            <strong>${escHtml(orderName)}</strong>
            <span>Commande</span>
          </div>
          <span class="pc-modern-open">Ouvrir</span>
        </article>
      `
        )
        .join('')
    : `<div class="empty-state">Aucune commande trouvée.</div>`;

  const content = `
    <div class="pc-modern-page">
      <section class="pc-modern-hero">
        <div>
          <span>Client</span>
          <h1>${escHtml(client)}</h1>
          <p>${orders.length} commande${orders.length > 1 ? 's' : ''}</p>
        </div>
        <a class="modern-cancel-link" href="/clients">Retour clients</a>
      </section>

      <section class="pc-modern-grid">
        ${cards}
      </section>
    </div>
  `;

  res.send(pageTemplate(req, `Client : ${client}`, content));
});

app.get('/pc-folders/:client/:order', requireLogin, (req, res) => {

  const isAtelier =
    req.session?.user?.role === 'atelier';

  const atelierFolders = [
    'Plans',
    'Photos',
    'Commandes',
    'Heure chantier'
  ];

  const foldersToShow = isAtelier
    ? STANDARD_SUBFOLDERS.filter(f => atelierFolders.includes(f))
    : STANDARD_SUBFOLDERS;

  const client = safeName(req.params.client);
  const order = safeName(req.params.order);

  const orderDir = path.join(CLIENT_PC_DIR, client, order);

  if (!fs.existsSync(orderDir) || !fs.lstatSync(orderDir).isDirectory()) {
    return res.status(404).send('Commande introuvable sur le PC');
  }

  ensureStandardSubfolders(orderDir);

  const cards = foldersToShow.map(

    (type) => `
      <article class="pc-modern-card">
        <a class="pc-modern-card-link" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}" aria-label="Ouvrir ${escHtml(type)}"></a>
        ${pcFolderIcon(type)}
        <div class="pc-modern-main">
          <strong>${escHtml(type)}</strong>
          <span>Dossier</span>
        </div>
        <span class="pc-modern-open">Ouvrir</span>
      </article>
    `
  ).join('');

  const orderDb = db
    .prepare('SELECT * FROM client_orders ORDER BY id DESC')
    .all()
    .find((row) => {
      const folderName = safeName(row.description && row.description.trim() !== '' ? row.description : `Commande_${row.id}`);
      return safeName(row.name) === client && folderName === order;
    });

  const linkedMeasurements = orderDb
    ? db.prepare('SELECT * FROM measurements WHERE client_order_id = ? ORDER BY updated_at DESC, id DESC').all(orderDb.id)
    : [];

  const chantierHeroControl = orderDb
    ? (() => {
        const status = normalizeChantierStatus(orderDb.chantier_status);
        return `
          <form method="POST" action="/orders/client/${orderDb.id}/chantier" class="chantier-status-card-form" data-auto-submit>
            <label>
              <span>Étape chantier</span>
              <select name="chantier_status" onchange="this.form.requestSubmit()">${chantierStatusOptions(status)}</select>
            </label>
          </form>
        `;
      })()
    : '';

  const content = `
    <div class="pc-modern-page">
      <section class="pc-modern-hero pc-order-hero">
        <div class="pc-order-hero-main">
          <span>Commande</span>
          <h1>${escHtml(order)}</h1>
          <p>${foldersToShow.length} dossier${foldersToShow.length > 1 ? 's' : ''}</p>
        </div>
        <div class="pc-modern-actions pc-order-hero-actions">
          ${chantierHeroControl}
          <div class="pc-order-hero-links">
            <a class="pc-order-hero-link" href="/pc-folders/${encodeURIComponent(client)}">
              ${clientPageIcon('clients', 'pc-order-hero-link-icon')}
              Client
            </a>
            <a class="pc-order-hero-link" href="/orders/clients">
              ${clientPageIcon('folder', 'pc-order-hero-link-icon')}
              Commandes
            </a>
          </div>
        </div>
      </section>

      <section class="pc-modern-grid">
        ${cards}
      </section>

      <section class="pc-modern-panel measurement-linked-section">
        <div class="modern-section-title">
          ${pcFolderIcon('Plans', 'clients-title-icon')}
          <div>
            <h2>Prises de cotes liées</h2>
          </div>
        </div>
        ${renderMeasurementCards(linkedMeasurements)}
      </section>
    </div>
  `;

  res.send(pageTemplate(req, `Commande : ${order}`, content));
});

app.post('/orders/client/:id/chantier', requireLogin, (req, res) => {
  const orderId = Number(req.params.id || 0);
  const existing = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
  if (!existing) return res.status(404).send('Commande introuvable');

  const chantierStatus = normalizeChantierStatus(req.body.chantier_status || existing.chantier_status);
  const plannedHours = Object.prototype.hasOwnProperty.call(req.body, 'planned_hours')
    ? parsePositiveNumber(req.body.planned_hours)
    : Number(existing.planned_hours || 0);
  const doneHours = Object.prototype.hasOwnProperty.call(req.body, 'done_hours')
    ? parsePositiveNumber(req.body.done_hours)
    : Number(existing.done_hours || 0);
  const progressRaw = Object.prototype.hasOwnProperty.call(req.body, 'chantier_progress')
    ? Number(req.body.chantier_progress || 0)
    : Number(existing.chantier_progress || 0);
  const chantierProgressValue = Number.isFinite(progressRaw)
    ? Math.max(0, Math.min(100, progressRaw))
    : chantierProgress(doneHours, plannedHours);
  const startDate = Object.prototype.hasOwnProperty.call(req.body, 'chantier_start_date')
    ? String(req.body.chantier_start_date || '').trim() || null
    : existing.chantier_start_date || null;
  const endDate = Object.prototype.hasOwnProperty.call(req.body, 'chantier_end_date')
    ? String(req.body.chantier_end_date || '').trim() || null
    : existing.chantier_end_date || null;
  const notes = Object.prototype.hasOwnProperty.call(req.body, 'chantier_notes')
    ? String(req.body.chantier_notes || '').trim() || null
    : existing.chantier_notes || null;

  db.prepare(`
    UPDATE client_orders
    SET chantier_status = ?,
        planned_hours = ?,
        done_hours = ?,
        chantier_progress = ?,
        chantier_start_date = ?,
        chantier_end_date = ?,
        chantier_notes = ?
    WHERE id = ?
  `).run(
    chantierStatus,
    plannedHours,
    doneHours,
    chantierProgressValue,
    startDate,
    endDate,
    notes,
    orderId
  );

  const orderFolderName = safeName(existing.description && existing.description.trim() !== '' ? existing.description : `Commande_${existing.id}`);
  res.redirect(`/pc-folders/${encodeURIComponent(safeName(existing.name))}/${encodeURIComponent(orderFolderName)}`);
});

app.get('/pc-folders/:client/:order/:type', requireLogin, (req, res) => {
  const client = safeName(req.params.client);
  const order = safeName(req.params.order);
  const type = String(req.params.type || '').trim();

  if (type === 'Heure chantier') return renderHeuresChantier(req, res);

  if (!STANDARD_SUBFOLDERS.includes(type)) return res.status(400).send('Type de dossier invalide');

  const dirPath = path.join(CLIENT_PC_DIR, client, order, type);
  if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) {
    return res.status(404).send('Dossier introuvable sur le PC');
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

const list = files.length
  ? `
    <div class="pc-modern-grid pc-modern-file-grid">
      ${files.map(f => {
        return `
          <article class="pc-modern-card pc-modern-file-card">
            ${pcFolderIcon(pcFileIconName(f))}
            <div class="pc-modern-main">
              <strong>${escHtml(f)}</strong>
              <span>Fichier</span>
            </div>
            <a
              class="pc-modern-open"
              href="/pc-file/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}/${encodeURIComponent(f)}"
              target="_blank">
              Ouvrir
            </a>
          </article>
        `;

      }).join('')}
    </div>
  `
  : `<div class="empty-state">Aucun fichier dans ce dossier.</div>`;
    

  const content = `
    <div class="pc-modern-page">
      <section class="pc-modern-hero">
        <div>
          <span>Dossier</span>
          <h1>${escHtml(type)}</h1>
          <p>${files.length} fichier${files.length > 1 ? 's' : ''}</p>
        </div>
        <div class="pc-modern-actions">
          <a class="modern-cancel-link" href="/pc-folders/${encodeURIComponent(client)}">Client</a>
          <a class="clients-submit-btn" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}">Retour commande</a>
        </div>
      </section>

      <section class="pc-modern-panel">
        <div class="modern-section-title">
          ${pcFolderIcon(type, 'clients-title-icon')}
          <div>
            <h2>Ajouter un fichier</h2>
          </div>
        </div>
        <form method="POST"
              action="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}/upload"
              enctype="multipart/form-data"
              class="pc-modern-upload-form">
          <input type="file" name="file" required />
          <button class="clients-submit-btn" type="submit">Ajouter</button>
        </form>
      </section>

      <section class="pc-modern-panel">
        <div class="modern-section-title">
          ${pcFolderIcon('file', 'clients-title-icon')}
          <div>
            <h2>Fichiers</h2>
          </div>
        </div>
        ${list}
      </section>
    </div>
  `;

  res.send(pageTemplate(req, `${type} - ${order}`, content));
});

app.post('/pc-folders/:client/:order/:type/upload', requireLogin, pcUpload.single('file'), (req, res) => {
  const client = safeName(req.params.client);
  const order = safeName(req.params.order);
  const type = String(req.params.type || '').trim();

  if (!req.file) return res.status(400).send('Aucun fichier reçu');

  res.redirect(`/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}`);
});

// ⚠️ Windows + sécurité : on re-sécurise le filename avant lecture disque
app.get('/pc-file/:client/:order/:type/:file', requireLogin, (req, res) => {

  const client = encodeURIComponent(req.params.client);
  const order = encodeURIComponent(req.params.order);
  const type = encodeURIComponent(req.params.type);
  const file = encodeURIComponent(req.params.file);

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
html,body{
  margin:0;
  height:100%;
}

.topbar{
  position:fixed;
  top:15px;
  right:15px;
  z-index:99999;
}

.close-btn{
  min-width:96px;
  height:44px;
  padding:0 18px;
  border:none;
  border-radius:999px;
  background:#ff7a00;
  color:#fff;
  font-size:15px;
  font-weight:bold;
  box-shadow:0 4px 12px rgba(0,0,0,.25);
}

iframe{
  width:100%;
  height:100vh;
  border:none;
}
</style>
</head>

<body>

<div class="topbar">
  <button class="close-btn" onclick="history.back()">Retour</button>
</div>

${file.toLowerCase().endsWith('.pdf')
  ? `
    <embed
      src="/pc-file-raw/${client}/${order}/${type}/${file}"
      type="application/pdf"
      width="100%"
      height="100%">
  `
  : `
    <iframe
      src="/pc-file-raw/${client}/${order}/${type}/${file}">
    </iframe>
  `
}

</body>
</html>
`);
});

app.get('/pc-file-raw/:client/:order/:type/:file', requireLogin, (req, res) => {
  try {
    const client = safeName(req.params.client);
    const order = safeName(req.params.order);
    const type = String(req.params.type || '').trim();
    const file = decodeURIComponent(req.params.file || '');

    if (!STANDARD_SUBFOLDERS.includes(type))
      return res.status(400).send('Type de dossier invalide');

    const filePath = safeResolveInside(
      CLIENT_PC_DIR,
      client,
      order,
      type,
      file
    );

    if (!fs.existsSync(filePath))
      return res.status(404).send('Fichier introuvable');

    res.sendFile(filePath);

  } catch (e) {
    return res.status(400).send('Chemin invalide');
  }
});
/* ===================== HEURE CHANTIER ===================== */

function renderHeuresChantier(req, res) {
  const client = safeName(req.params.client);
  const order = safeName(req.params.order);

  const rows = db
    .prepare(
      `
    SELECT *
    FROM chantier_hours
    WHERE client = ? AND order_name = ?
    ORDER BY work_date DESC, id DESC
  `
    )
    .all(client, order);

  const totalMinutes = rows.reduce((sum, r) => sum + (r.minutes_total || 0), 0);
  const orderDb = db.prepare(`
  SELECT planned_hours
  FROM client_orders
  WHERE name = ?
  AND description = ?
  ORDER BY id DESC
  LIMIT 1
`).get(client, order);

const plannedHours =
  Number(orderDb?.planned_hours || 0);

const actualHours =
  totalMinutes / 60;

const diffHours =
  actualHours - plannedHours;

const isOver =
  actualHours > plannedHours;

  const since7 = new Date();
  since7.setDate(since7.getDate() - 7);
  const since7Iso = since7.toISOString().slice(0, 10);

  const last7 = db
    .prepare(
      `
    SELECT COALESCE(SUM(minutes_total),0) AS m
    FROM chantier_hours
    WHERE client = ? AND order_name = ? AND work_date >= ?
  `
    )
    .get(client, order, since7Iso).m;

  const listHtml = rows.length
    ? `
      <div class="pc-modern-hours-grid">
          ${rows
            .map(
              (r) => `
            <article class="pc-modern-hour-card">
              <header>
                <strong>${escHtml(r.work_date)}</strong>
                <span>${fmtMinutes(r.minutes_total || 0)}</span>
              </header>
              <div class="pc-modern-hour-meta">
                <span>Début <strong>${escHtml(r.start_time || '—')}</strong></span>
                <span>Fin <strong>${escHtml(r.end_time || '—')}</strong></span>
                <span>Pause <strong>${Number(r.break_minutes || 0)} min</strong></span>
              </div>
              ${r.note ? `<p>${escHtml(r.note)}</p>` : ''}
                <form method="POST" action="/chantier-hours/delete" onsubmit="return confirm('Supprimer cette ligne ?');" style="margin:0">
                  <input type="hidden" name="id" value="${r.id}">
                  <input type="hidden" name="client" value="${escHtml(client)}">
                  <input type="hidden" name="order" value="${escHtml(order)}">
                  <button class="modern-danger-btn" title="Supprimer">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
                </form>
            </article>
          `
            )
            .join('')}
      </div>
    `
    : `<div class="empty-state">Aucune heure saisie pour ce chantier.</div>`;

  res.send(
    pageTemplate(
      req,
      `Heures chantier - ${order}`,
      `
      <div class="pc-modern-page">
        <section class="pc-modern-hero">
          <div>
            <span>Dossier</span>
            <h1>Heures chantier</h1>
            <p>${escHtml(order)}</p>
          </div>
          <div class="pc-modern-actions">
            <a class="modern-cancel-link" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}">Retour commande</a>
            <a class="modern-cancel-link" href="/pc-folders/${encodeURIComponent(client)}">Retour client</a>
            <a class="clients-submit-btn" href="/chantier-hours/export.csv?client=${encodeURIComponent(client)}&order=${encodeURIComponent(order)}">Export CSV</a>
          </div>
        </section>

        <section class="pc-modern-panel">
          <div class="chantier-hours-grid">
            <div><span>Total chantier</span><strong>${fmtMinutes(totalMinutes)}</strong></div>
            <div><span>7 derniers jours</span><strong>${fmtMinutes(last7)}</strong></div>
            ${
              req.session?.user?.role !== 'atelier'
                ? `
                <div><span>Heures prévues</span><strong>${plannedHours.toFixed(1)} h</strong></div>
                <div><span>Écart</span><strong class="${isOver ? 'chantier-over' : ''}">${diffHours >= 0 ? '+' : ''}${diffHours.toFixed(1)} h</strong></div>
                `
                : ''
            }
          </div>
          ${
            req.session?.user?.role !== 'atelier'
              ? `
              <form method="POST" action="/chantier-hours/planned-hours" class="pc-modern-planned-form">
                <input type="hidden" name="client" value="${escHtml(client)}">
                <input type="hidden" name="order" value="${escHtml(order)}">
                <label>Heures prévues</label>
                <input type="number" step="0.5" name="planned_hours" value="${plannedHours}">
                <button class="clients-submit-btn" type="submit">Enregistrer</button>
              </form>
              `
              : ''
          }
        </section>

      <section class="pc-modern-panel">
        <div class="modern-section-title">
          ${pcFolderIcon('Heure chantier', 'clients-title-icon')}
          <div><h2>Ajouter une ligne</h2></div>
        </div>
        <form method="POST" action="/chantier-hours/add" class="hours-form">
          <input type="hidden" name="client" value="${escHtml(client)}">
          <input type="hidden" name="order" value="${escHtml(order)}">

          <div class="hours-grid">
            <div class="field">
              <label>Date</label>
              <input type="date" name="work_date" value="${isoDate()}" required>
            </div>

            <div class="field">
              <label>Début</label>
              <input type="time" name="start_time" required>
            </div>

            <div class="field">
              <label>Fin</label>
              <input type="time" name="end_time" required>
            </div>

            <div class="field">
              <label>Pause (min)</label>
              <input type="number" name="break_minutes" min="0" step="5" value="0">
            </div>

            <div class="field field-wide">
              <label>Note</label>
              <input name="note" placeholder="Ex: pose portail, soudure, déplacement…">
            </div>

            <div class="actions">
              <button class="clients-submit-btn" type="submit">Ajouter</button>
            </div>
          </div>
        </form>
      </section>

      <section class="pc-modern-panel">
        <div class="modern-section-title">
          ${pcFolderIcon('file', 'clients-title-icon')}
          <div><h2>Historique</h2></div>
        </div>
        ${listHtml}
      </section>
      </div>
      `
    )
  );
}

app.post('/chantier-hours/add', requireLogin, (req, res) => {
  const client = String(req.body.client || '').trim();
  const order = String(req.body.order || '').trim();
  const work_date = String(req.body.work_date || '').trim();
  const start_time = String(req.body.start_time || '').trim();
  const end_time = String(req.body.end_time || '').trim();
  const break_minutes = parseInt(req.body.break_minutes || '0', 10) || 0;
  const note = String(req.body.note || '').trim();

  if (!client || !order || !work_date) return res.status(400).send('Données manquantes');

  const s = toMinutes(start_time);
  const e = toMinutes(end_time);
  if (s === null || e === null) return res.status(400).send('Heures invalides');
  if (e <= s) return res.status(400).send('Fin doit être après début');

  const minutes_total = Math.max(0, e - s - break_minutes);

  db.prepare(
    `
    INSERT INTO chantier_hours (client, order_name, work_date, start_time, end_time, break_minutes, minutes_total, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(client, order, work_date, start_time, end_time, break_minutes, minutes_total, note || null, new Date().toISOString());

  res.redirect(`/pc-folders/${encodeURIComponent(safeName(client))}/${encodeURIComponent(safeName(order))}/Heure%20chantier`);
});

app.post('/chantier-hours/delete', requireLogin, (req, res) => {
  const id = req.body.id;
  const client = String(req.body.client || '').trim();
  const order = String(req.body.order || '').trim();

  db.prepare('DELETE FROM chantier_hours WHERE id = ?').run(id);
  res.redirect(`/pc-folders/${encodeURIComponent(safeName(client))}/${encodeURIComponent(safeName(order))}/Heure%20chantier`);
});

app.get('/chantier-hours/export.csv', requireLogin, (req, res) => {
  const client = String(req.query.client || '').trim();
  const order = String(req.query.order || '').trim();

  const rows = db
    .prepare(
      `
    SELECT work_date, start_time, end_time, break_minutes, minutes_total, note
    FROM chantier_hours
    WHERE client = ? AND order_name = ?
    ORDER BY work_date ASC, id ASC
  `
    )
    .all(client, order);

  const header = 'date;debut;fin;pause_min;total;note\n';
  const lines = rows
    .map(
      (r) =>
        `${r.work_date};${r.start_time || ''};${r.end_time || ''};${r.break_minutes || 0};${fmtMinutes(r.minutes_total || 0)};${String(r.note || '').replace(/;/g, ',')}`
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="heures_${safeSegment(client)}_${safeSegment(order)}.csv"`);
  res.send(header + lines + '\n');
});
app.post('/chantier-hours/planned-hours', requireLogin, (req, res) => {

  db.prepare(`
    UPDATE client_orders
    SET planned_hours = ?
    WHERE name = ?
    AND description = ?
  `).run(
    Number(req.body.planned_hours || 0),
    req.body.client,
    req.body.order
  );

  res.redirect(
    `/pc-folders/${encodeURIComponent(req.body.client)}/${encodeURIComponent(req.body.order)}/Heure chantier`
  );
});
/* ===================== DEVIS ===================== */

// LISTE DEVIS
app.get('/devis', requireLogin, (req, res) => {
  const quotes = db.prepare('SELECT * FROM quotes ORDER BY id DESC').all();
  const quoteTotals = db
    .prepare(`
      SELECT quote_id, COALESCE(SUM(total), 0) AS total_ht
      FROM quote_lines
      GROUP BY quote_id
    `)
    .all()
    .reduce((map, row) => {
      map.set(Number(row.quote_id), Number(row.total_ht || 0));
      return map;
    }, new Map());

  const cards = quotes.length
    ? quotes
        .map(
          (q) => {
            const totalHt = quoteTotals.get(Number(q.id)) || 0;
            const tva = round2(totalHt * (normalizeVatRate(q.vat_rate) / 100));
            const totalTtc = round2(totalHt + tva);
            const status = normalizeQuoteStatus(q.status);
            return `
        <article class="quote-list-card">
          <a class="quote-list-link" href="/devis/${q.id}" aria-label="Ouvrir le devis ${q.id}"></a>
          <div class="quote-list-head">
            <span class="quote-number">#${q.id}</span>
            <span class="quote-status-badge ${quoteStatusClass(status)}">${escHtml(status)}</span>
          </div>
          <h2>${escHtml(q.title || 'Sans titre')}</h2>
          <div class="quote-list-client">${escHtml(q.client_name || 'Client non renseigné')}</div>
          <div class="quote-list-meta">
            <span>Date : ${escHtml(formatDateLabel(q.created_at))}</span>
            <span>HT : ${totalHt.toFixed(2)} €</span>
            <span>TTC : ${totalTtc.toFixed(2)} €</span>
          </div>
          <div class="quote-list-footer">
            <strong>${totalTtc.toFixed(2)} € TTC</strong>
            <span class="dash-card-button">Ouvrir</span>
          </div>
        </article>
      `;
          }
        )
        .join('')
    : `<div class="empty-state">Aucun devis</div>`;

  res.send(
    pageTemplate(
      req,
      'Devis',
      `
      <div class="page-head quote-page-head app-dark-page-head">
        <div class="clients-create-head">
          ${clientPageIcon('quotes', 'clients-title-icon')}
          <div>
            <h1>Devis</h1>
            <span>${quotes.length} devis au total</span>
          </div>
        </div>
        <a class="btn btn-primary" href="/devis/new">+ Nouveau devis</a>
      </div>

      ${infoBar(
        `<div class="kpi"><div class="kpi-label">Devis</div><div class="kpi-value">${quotes.length}</div></div>`,
        ''
      )}

      <section class="quote-list-grid">${cards}</section>
      `
    )
  );
});

// PAGE NOUVEAU DEVIS
app.get('/devis/new', requireLogin, (req, res) => {
  // 1) Clients DB
  let dbClients = [];
  try {
    dbClients = db
      .prepare("SELECT name FROM clients WHERE name IS NOT NULL AND TRIM(name) != '' ORDER BY name COLLATE NOCASE")
      .all()
      .map((r) => String(r.name).trim());
  } catch (e) {
    console.error('Erreur lecture clients DB:', e);
  }

  // 2) Clients PC (dossiers)
  let pcClients = [];
  try {
    pcClients = fs
      .readdirSync(CLIENT_PC_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => String(e.name).trim())
      .filter(Boolean);
  } catch (e) {
    console.error('Erreur lecture clients PC:', e);
  }

  // 3) Merge + dedupe
  const seen = new Set();
  const merged = [...dbClients, ...pcClients]
    .map((n) => n.trim())
    .filter(Boolean)
    .filter((n) => {
      const k = n.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

  const clientSelectOptions = [
    '<option value="">Nouveau prospect</option>',
    ...merged.map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`)
  ].join('');

  res.send(
    pageTemplate(
      req,
      'Nouveau devis',
      `
      <div class="modern-page">
        <form method="POST" action="/devis" class="clients-create-card modern-form-card quote-create-form" id="quoteForm">
          <div class="clients-create-head">
            ${clientPageIcon('quotes', 'clients-title-icon')}
            <h1>Nouveau devis</h1>
          </div>

          <h2 class="modern-section-title">Informations du devis</h2>

          <div class="modern-form-grid">
            <label class="clients-field">
              <span>Client</span>
              <div class="clients-input-shell">
                ${clientPageIcon('user')}
                <select id="existing_client" name="existing_client">
                  ${clientSelectOptions}
                </select>
              </div>
            </label>

            <label class="clients-field">
              <span>Objet du devis *</span>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
                <input name="title" required placeholder="Ex : Escalier quart tournant" />
              </div>
            </label>

            <label class="clients-field">
              <span>Date du devis</span>
              <div class="clients-input-shell">
                ${clientPageIcon('calendar')}
                <input name="quote_date" type="date" value="${isoDate()}" />
              </div>
            </label>

            <label class="clients-field">
              <span>Statut</span>
              <div class="clients-input-shell">
                ${clientPageIcon('database')}
                <select name="status" disabled>
                  <option>Brouillon</option>
                </select>
              </div>
            </label>
          </div>

          <h2 class="modern-section-title">Nouveau prospect</h2>

          <div class="modern-form-grid">
            <label class="clients-field">
              <span>Nom du prospect *</span>
              <div class="clients-input-shell">
                ${clientPageIcon('user')}
                <input name="prospect_name" id="prospect_name" placeholder="Nom du prospect" />
              </div>
            </label>

            <label class="clients-field">
              <span>Email</span>
              <div class="clients-input-shell">
                ${clientPageIcon('mail')}
                <input name="prospect_email" id="prospect_email" type="email" />
              </div>
            </label>

            <label class="clients-field">
              <span>Téléphone</span>
              <div class="clients-input-shell">
                ${clientPageIcon('phone')}
                <input name="prospect_phone" id="prospect_phone" />
              </div>
            </label>

            <label class="clients-field">
              <span>Adresse</span>
              <div class="clients-input-shell">
                ${clientPageIcon('location')}
                <input name="prospect_address" id="prospect_address" />
              </div>
            </label>
          </div>

          <div class="modern-form-actions">
            <button type="submit" class="clients-submit-btn">
              <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
              Créer le devis
            </button>
            <a class="modern-cancel-link" href="/devis">Annuler</a>
          </div>
        </form>
      </div>

      <script>
      (function(){
        const existing = document.getElementById('existing_client');
        const pName  = document.getElementById('prospect_name');
        const pEmail = document.getElementById('prospect_email');
        const pPhone = document.getElementById('prospect_phone');
        const pAddr  = document.getElementById('prospect_address');

        function setProspectEnabled(enabled){
          [pName, pEmail, pPhone, pAddr].forEach(el => {
            if (!el) return;
            el.disabled = !enabled;
            if (!enabled) el.value = '';
          });
        }

        function sync(){
          const hasExisting = (existing && existing.value ? existing.value : '').trim().length > 0;
          setProspectEnabled(!hasExisting);
        }

        if (existing){
          existing.addEventListener('input', sync);
          existing.addEventListener('change', sync);
        }
        sync();
      })();
      </script>
      `
    )
  );
});

// CREATION DEVIS
app.post('/devis', requireLogin, (req, res) => {
  const existing_client = String(req.body.existing_client || '').trim();
  const title = String(req.body.title || '').trim();
  const quoteDate = String(req.body.quote_date || '').trim() || isoDate();
  if (!title) return res.status(400).send('❌ Titre du devis requis');

  let clientName = existing_client;

  if (!clientName) {
    const pName = String(req.body.prospect_name || '').trim();
    if (!pName) return res.status(400).send('❌ Nom du prospect requis');
    clientName = pName;
  }

  const info = db
    .prepare(
      `
    INSERT INTO quotes
    (title, client_name, client_email, client_phone, client_address, status, vat_rate, created_at)
    VALUES (?, ?, ?, ?, ?, 'Brouillon', 20, ?)
  `
    )
    .run(
      title,
      clientName,
      String(req.body.prospect_email || '').trim() || null,
      String(req.body.prospect_phone || '').trim() || null,
      String(req.body.prospect_address || '').trim() || null,
      `${quoteDate}T00:00:00.000Z`
    );

  res.redirect('/devis/' + info.lastInsertRowid);
});
// PAGE DEVIS (EXISTANT) + RECHERCHE MATIÈRE
app.post('/devis/:id/notes', requireLogin, (req, res) => {

  db.prepare(`
    UPDATE quotes
    SET notes = ?
    WHERE id = ?
  `).run(
    req.body.notes || '',
    req.params.id
  );

  res.redirect('/devis/' + req.params.id);

});

app.post('/devis/:id/status', requireLogin, (req, res) => {
  const quoteId = Number(req.params.id);
  if (!Number.isFinite(quoteId) || quoteId <= 0) return res.status(400).send('ID devis invalide');

  const status = normalizeQuoteStatus(req.body.status);
  db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(status, quoteId);

  res.redirect('/devis/' + quoteId);
});

app.post('/devis/:id/vat', requireLogin, (req, res) => {
  const quoteId = Number(req.params.id);
  if (!Number.isFinite(quoteId) || quoteId <= 0) return res.status(400).send('ID devis invalide');

  const requestedRate = Number(req.body.vat_rate);
  if (requestedRate !== 10 && requestedRate !== 20) {
    return res.status(400).send('TVA invalide');
  }

  db.prepare('UPDATE quotes SET vat_rate = ? WHERE id = ?').run(requestedRate, quoteId);

  res.redirect('/devis/' + quoteId);
});

app.post('/devis/:id/photo', requireLogin, (req, res) => {
  quotePhotoUpload.single('photo')(req, res, (err) => {
    const quoteId = Number(req.params.id || 0);
    if (!Number.isFinite(quoteId) || quoteId <= 0) return res.status(400).send('ID devis invalide');
    console.log('UPLOAD DEVIS', { id: req.params.id, file: req.file, body: req.body });
    if (err) {
      console.error('Erreur upload fichier devis:', err);
      return res.status(400).send('Impossible d’ajouter ce fichier au devis.');
    }
    if (!req.file) {
      console.warn('UPLOAD DEVIS SANS FICHIER', { id: req.params.id, body: req.body });
      return res.status(400).send('Aucun fichier reçu. Vérifiez que le champ fichier du formulaire est bien renseigné.');
    }

    const savedPath = req.file.path || safeResolveInside(QUOTE_PHOTO_DIR, String(quoteId), req.file.filename);
    console.log('UPLOAD DEVIS FICHIER SAUVEGARDE', {
      id: quoteId,
      destination: req.file.destination,
      filename: req.file.filename,
      path: savedPath,
      exists: fs.existsSync(savedPath),
      size: req.file.size,
    });

    if (!fs.existsSync(savedPath)) {
      return res.status(500).send('Le fichier a été reçu mais n’a pas été retrouvé sur le disque.');
    }

    res.redirect('/devis/' + quoteId);
  });
});
app.get('/devis/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);

  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
  if (!quote) return res.status(404).send('Devis introuvable');
const photoDir = safeResolveInside(QUOTE_PHOTO_DIR, String(id));
console.log('LECTURE FICHIERS DEVIS', { id, photoDir, exists: fs.existsSync(photoDir) });

const photos = fs.existsSync(photoDir)
  ? fs.readdirSync(photoDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  : [];
const photosHtml = photos.map(photo => {
  const fileUrl = `/quote-photos/${id}/${encodeURIComponent(photo)}`;
  const lower = photo.toLowerCase();
  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower);
  return `
  <div class="quote-photo-card">

    ${
      isImage
        ? `<button type="button" class="quote-photo-open" data-quote-photo-url="${escHtml(fileUrl)}" data-quote-photo-title="${escHtml(photo)}" aria-label="Ouvrir ${escHtml(photo)}">
            <img src="${fileUrl}" class="quote-photo" alt="${escHtml(photo)}">
          </button>`
        : `<a href="${fileUrl}" target="_blank" rel="noopener">
            <span class="quote-file-preview">${clientPageIcon('quotes', 'quote-file-icon')}<strong>${escHtml(photo)}</strong></span>
          </a>`
    }

    <form method="POST"
          action="/devis/${id}/photo/delete"
          onsubmit="return confirm('Supprimer ce fichier ?');">

      <input
        type="hidden"
        name="photo"
        value="${escHtml(photo)}">

      <button
        type="submit"
        class="btn danger">
        Supprimer
      </button>

    </form>

  </div>
`;
}).join('');
  const materials = db
    .prepare('SELECT * FROM materials ORDER BY COALESCE(type,\'\'), name')
    .all()
    .map((m) => ({ ...m, type_safe: String(m.type || '') }));

  const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position ASC, id ASC').all(id);
  const total = lines.reduce((s, l) => s + (Number(l.total) || 0), 0);

  const rows = lines.length
    ? lines
        .map(
          (l) => `
      <tr>
        <td>${escHtml(l.category || '')}</td>
        <td>${escHtml(l.label || '')}</td>
        <td style="text-align:right">${Number(l.qty || 0).toFixed(2)}</td>
        <td>${escHtml(l.unit || '')}</td>
        <td style="text-align:right">${Number(l.unit_price || 0).toFixed(2)} €</td>
        <td style="text-align:right"><strong>${Number(l.total || 0).toFixed(2)} €</strong></td>
        <td style="text-align:center">
          <form method="POST" action="/devis/line/delete" onsubmit="return confirm('Supprimer cette ligne ?');" style="margin:0">
            <input type="hidden" name="quote_id" value="${id}">
            <input type="hidden" name="id" value="${l.id}">
            <button class="btn-icon danger" title="Supprimer">Supprimer</button>
          </form>
        </td>
      </tr>
    `
        )
        .join('')
    : `<tr><td colspan="7">Aucune ligne</td></tr>`;

  const acceptDisabled = String(quote.status || '') === 'Accepté';
  const marginPct = Number(quote.margin_pct ?? 0);
  const totalWithMargin = round2(total * (1 + marginPct / 100));
  const vatRate = normalizeVatRate(quote.vat_rate);
  const tva = round2(total * (vatRate / 100));
  const totalTtc = round2(total + tva);
  const quoteStatus = normalizeQuoteStatus(quote.status);
  const linkedMeasurements = db
    .prepare('SELECT * FROM measurements WHERE quote_id = ? ORDER BY updated_at DESC, id DESC')
    .all(id);

  res.send(
    pageTemplate(
      req,
      `Devis #${id}`,
      `
      <div class="quote-work-page">
        <section class="quote-work-hero">
          <div class="quote-work-title">
            <div class="quote-work-title-head">
              ${clientPageIcon('quotes', 'clients-title-icon')}
              <div>
                <span class="quote-work-kicker">Devis #${id}</span>
                <h1>${escHtml(quote.title || 'Sans titre')}</h1>
                <div class="quote-work-meta">
                  <span>${clientPageIcon('user', 'quote-work-meta-icon')}${escHtml(quote.client_name || 'Client non renseigné')}</span>
                  <span>${clientPageIcon('calendar', 'quote-work-meta-icon')}${escHtml(formatDateLabel(quote.created_at))}</span>
                  <span class="quote-status-badge ${quoteStatusClass(quoteStatus)}">${escHtml(quoteStatus)}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="quote-work-actions">
            <a class="modern-cancel-link" href="/devis">Retour aux devis</a>
            <form method="POST" action="/devis/${id}/status" class="quote-work-status-form">
              <label>Statut</label>
              <select name="status">${quoteStatusOptions(quote.status)}</select>
              <button class="modern-secondary-btn" type="submit">Modifier</button>
            </form>
            <form
              method="POST"
              action="/devis/${id}/accept"
              onsubmit="return confirm('Accepter ce devis et créer la commande client ?');"
            >
              <button class="clients-submit-btn quote-accept-btn" ${acceptDisabled ? 'disabled' : ''}>
                ${acceptDisabled ? 'Devis accepté' : 'Accepter le devis'}
              </button>
            </form>
            <form
              method="POST"
              action="/devis/${id}/delete"
              onsubmit="return confirm('Supprimer définitivement ce devis ? Cette action est irréversible.');"
            >
              <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
            </form>
          </div>
        </section>

        <section class="quote-finance-grid" aria-label="Résumé financier">
          <article class="quote-finance-card">
            <span>Total HT</span>
            <strong>${total.toFixed(2)} €</strong>
          </article>
          <article class="quote-finance-card quote-vat-card">
            <div class="quote-vat-card-head">
              <span>TVA ${vatRate}%</span>
              <form method="POST" action="/devis/${id}/vat" class="quote-vat-form">
                <select name="vat_rate" aria-label="Taux de TVA">${quoteVatOptions(vatRate)}</select>
                <button type="submit">OK</button>
              </form>
            </div>
            <strong>${tva.toFixed(2)} €</strong>
          </article>
          <article class="quote-finance-card quote-finance-card-total">
            <span>Total TTC</span>
            <strong>${totalTtc.toFixed(2)} €</strong>
          </article>
        </section>

        <section class="quote-work-card quote-add-line-card">
          <div class="modern-section-title">
            ${clientPageIcon('add', 'clients-title-icon')}
            <div>
              <h2>Ajouter une ligne</h2>
              <p>Matière, main-d'œuvre et coûts associés au devis.</p>
            </div>
          </div>

          <div class="quote-add-grid">
            <article class="quote-cost-section">
              <header>
                ${clientPageIcon('database', 'quote-section-icon')}
                <div>
                  <h3>Matière</h3>
                  <p>Sélectionnez une matière pour remplir automatiquement l'unité et le prix.</p>
                </div>
              </header>

              <form method="POST" action="/devis/line" class="quote-line-modern-form" id="quickMatForm">
          <input type="hidden" name="quote_id" value="${id}">
          <input type="hidden" name="category" value="Matière">

          <div class="quote-line-form-grid">
            <div class="modern-field field-wide">
              <label>Recherche matière</label>
              <div class="clients-input-shell">
                ${clientPageIcon('search')}
              <input
                id="quickMatLabel"
                name="label"
                list="materialsSuggest"
                class="search"
                placeholder="Tape: tube 40x40, tôle 5mm, HEA…"
                autocomplete="off"
                required
              />
              </div>
              <datalist id="materialsSuggest">
                ${materials
                  .map((m) => `<option value="${escHtml(m.name || '')}"></option>`)
                  .join('')}
              </datalist>

            </div>

            <div class="modern-field">
              <label>Qté</label>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
              <input id="quickMatQty" name="qty" type="number" step="0.01" required placeholder="Ex: 6" />
              </div>
            </div>

            <div class="modern-field">
              <label>Unité</label>
              <div class="clients-input-shell">
                ${clientPageIcon('database')}
              <select id="quickMatUnit" name="unit" required>
                <option value="ml">ml</option>
                <option value="m²">m²</option>
                <option value="pièce">pièce</option>
                <option value="m">m</option>
                <option value="kg">kg</option>
                <option value="u">u</option>
              </select>
              </div>
            </div>

            <div class="modern-field">
              <label>Prix unitaire (€)</label>
              <div class="clients-input-shell">
                ${clientPageIcon('postal')}
              <input id="quickMatPU" name="unit_price" type="number" step="0.01" required placeholder="Ex: 12.50" />
              </div>
            </div>
<div class="modern-field">
  <label>Marge (%)</label>
  <div class="clients-input-shell">
    ${clientPageIcon('add')}
  <input id="matMargin" type="number" step="0.1" value="30">
  </div>
</div>
            <div class="quote-material-summary" id="quickMatSummary">
              <span>Matière sélectionnée</span>
              <strong id="quickMatSummaryName">Aucune matière</strong>
              <div>
                <small>Unité : <b id="quickMatSummaryUnit">—</b></small>
                <small>PU : <b id="quickMatSummaryPrice">—</b></small>
                <small>Total matière : <b id="quickMatSummaryTotal">—</b></small>
              </div>
            </div>
            <div class="modern-form-actions field-wide">
              <button type="submit" class="clients-submit-btn"><span>${clientPageIcon('add', 'clients-submit-icon')}</span>Ajouter au devis</button>
            </div>
          </div>
        </form>

        <script>
        (function(){
          const MAT_INDEX = new Map(
            ${JSON.stringify(
              materials.map(m => ({
                id: Number(m.id || 0),
                type: String(m.type || ''),
                name: String(m.name || ''),
                key: String((m.name || '')).trim().toLowerCase(),
                unit: String(m.unit || ''),
                price: Number(m.price || 0)
              }))
            )}.map(x => [x.key, x])
          );

     const label = document.getElementById('quickMatLabel');
const unit  = document.getElementById('quickMatUnit');
const pu    = document.getElementById('quickMatPU');
const margin = document.getElementById('matMargin');
const qty = document.getElementById('quickMatQty');
const summaryName = document.getElementById('quickMatSummaryName');
const summaryUnit = document.getElementById('quickMatSummaryUnit');
const summaryPrice = document.getElementById('quickMatSummaryPrice');
const summaryTotal = document.getElementById('quickMatSummaryTotal');

if (!label || !unit || !pu) return;

function normalizeMaterialUnit(value){
  const raw = String(value || '').trim();
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/\\s+/g, '');

  if (['m', 'ml', 'metre', 'meter', 'metres', 'meters'].includes(key)) return 'ml';
  if (['m2', 'm²', 'metrecarre', 'metrescarres', 'meter2', 'sqm'].includes(key)) return 'm²';
  if (['u', 'unite', 'unites', 'piece', 'pieces', 'pc', 'pcs'].includes(key)) return 'pièce';
  return raw;
}

function setMaterialUnit(value){
  const nextUnit = normalizeMaterialUnit(value);
  if (!nextUnit) return;

  const exists = Array.from(unit.options).some(option => option.value === nextUnit);
  if (!exists){
    unit.appendChild(new Option(nextUnit, nextUnit));
  }

  unit.value = nextUnit;
}

function updateMaterialSummary(found){
  const q = Number(qty?.value || 0);
  const p = Number(pu?.value || 0);
  if (summaryName) summaryName.textContent = found?.name || label.value || 'Aucune matière';
  if (summaryUnit) summaryUnit.textContent = unit.value || '—';
  if (summaryPrice) summaryPrice.textContent = p > 0 ? p.toFixed(2) + ' €' : '—';
  if (summaryTotal) summaryTotal.textContent = q > 0 && p > 0 ? (q * p).toFixed(2) + ' €' : '—';
}

function sync(){

  const k = (label.value || '').trim().toLowerCase();
  const found = MAT_INDEX.get(k);

  if (!found) {
    updateMaterialSummary(null);
    return;
  }

  if (found.unit){
    setMaterialUnit(found.unit);
  }

  if (Number.isFinite(found.price) && found.price > 0){

    const m = Number(margin?.value || 0);

    const salePrice =
      found.price * (1 + m / 100);

    pu.value = salePrice.toFixed(2);
  }

  updateMaterialSummary(found);
}

label.addEventListener('change', sync);
label.addEventListener('blur', sync);
unit.addEventListener('change', sync);
pu.addEventListener('input', sync);
if (qty) qty.addEventListener('input', sync);

if (margin){
  margin.addEventListener('input', sync);
}

sync();

})();
        </script>
            </article>
        

<details class="tool-box quote-support-tool">
  <summary>Calculateur de barres</summary>
  <h2>Calculateur de barres</h2>

  <div class="bar-calc">
    <div class="bar-calc-row">
      <label>Longueur barre standard (mm)</label>
      <input id="bar-length" type="number" value="6000">
    </div>

    <div class="bar-calc-row">
      <label>Perte par coupe (mm)</label>
      <input id="bar-loss" type="number" value="3">
    </div>

    <h4>Pièces à couper</h4>

    <table class="bar-table">
      <thead>
        <tr>
          <th>Longueur (mm)</th>
          <th>Quantité</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="cuts-body">
        <tr>
          <td><input type="number" min="1" value="1200"></td>
          <td><input type="number" min="1" value="1"></td>
          <td>
            <button type="button" onclick="removeBarRow(this)">Supprimer</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:10px">
      <button type="button" onclick="addBarRow()">Ajouter une coupe</button>
      <button type="button" class="btn primary" onclick="calculateBars()">Calculer</button>
      <button type="button" class="btn secondary" onclick="printCuts()">
  Imprimer les coupes
</button>
<script>
function printCuts() {
  const result = document.getElementById('bar-result');

  if (!result || !result.innerHTML.trim()) {
    alert('Aucun résultat à imprimer');
    return;
  }

  const win = window.open('', '', 'width=900,height=650');

  win.document.write(
    '<html>' +
      '<head>' +
        '<title>Plan de coupe</title>' +
        '<style>' +
          'body{font-family:Arial,sans-serif;padding:20px;}' +
          'h2{text-align:center;margin-bottom:15px;}' +
          '.bar-box{border:1px solid #000;padding:10px;margin-bottom:8px;}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<h2>Plan de coupe</h2>' +
        result.innerHTML +
      '</body>' +
    '</html>'
  );

  win.document.close();
  win.focus();
  win.print();
}
</script>

    </div>

    <div id="bar-result" class="bar-result" style="margin-top:12px"></div>
  </div>

<script>
function addBarRow() {
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="number" min="1" required></td>' +
    '<td><input type="number" min="1" value="1" required></td>' +
    '<td><button type="button" onclick="removeBarRow(this)">Supprimer</button></td>';

  document.getElementById('cuts-body').appendChild(tr);
}

function removeBarRow(btn) {
  btn.closest('tr').remove();
}


function removeRow(btn) {
  btn.closest('tr').remove();
}

function calculateBars() {
  const barLength = Number(document.getElementById('bar-length').value);
  const loss = Number(document.getElementById('bar-loss').value);

  if (!barLength || barLength <= 0) {
    alert('Longueur de barre invalide');
    return;
  }

  let cuts = [];

  document.querySelectorAll('#cuts-body tr').forEach(function(tr) {
    const len = Number(tr.children[0].querySelector('input').value);
    const qty = Number(tr.children[1].querySelector('input').value);

    if (!len || !qty) return;

    for (let i = 0; i < qty; i++) {
      cuts.push(len + loss);
    }
  });

  if (cuts.length === 0) {
    alert('Aucune coupe renseignée');
    return;
  }

  cuts.sort(function(a, b) {
    return b - a;
  });

  let bars = [];

  cuts.forEach(function(cut) {
    let placed = false;

    for (let i = 0; i < bars.length; i++) {
      if (bars[i].remaining >= cut) {
        bars[i].remaining -= cut;
        bars[i].cuts.push(cut);
        placed = true;
        break;
      }
    }

    if (!placed) {
      bars.push({
        remaining: barLength - cut,
        cuts: [cut]
      });
    }
  });

  let html = '<h4>Résultat</h4>';
  html += '<p><strong>' + bars.length + '</strong> barre(s) nécessaire(s)</p>';

  bars.forEach(function(bar, i) {
    html +=
      '<div class="bar-box">' +
      '<strong>Barre ' + (i + 1) + '</strong><br>' +
      'Coupes : ' + bar.cuts.map(function(c) { return c - loss; }).join(' + ') + '<br>' +
      'Reste : ' + bar.remaining + ' mm' +
      '</div>';
  });

  document.getElementById('bar-result').innerHTML = html;
}
</script>
</details>

<details class="tool-box quote-support-tool">
  <summary>Calculateur de tôles</summary>
  <h2>Calculateur de tôles</h2>

  <label>Largeur tôle</label>
  <input id="sheetW" type="number" value="3000">

  <label>Hauteur tôle</label>
  <input id="sheetH" type="number" value="1500">

  <label>Perte / jeu</label>
  <input id="gap" type="number" value="3">

  <table>
    <thead>
      <tr><th>L</th><th>H</th><th>Qté</th><th></th></tr>
    </thead>
    <tbody id="pieces">
      <tr>
        <td><input value="500"></td>
        <td><input value="300"></td>
        <td><input value="1"></td>
        <td><button onclick="removeSheetRow(this)">Supprimer</button></td>
      </tr>
    </tbody>
  </table>

  <button onclick="addSheetRow()">Ajouter une pièce</button>
  <button onclick="calculate()">Calculer</button>
 <button onclick="printPlan()">Imprimer</button>

<div id="result"></div>

<canvas
  id="canvas"
  width="900"
  height="500"
  style="border:1px solid #ccc">
</canvas>

<script>


function addSheetRow() {
  const tr = document.createElement('tr');

  tr.innerHTML =
    '<td><input></td>' +
    '<td><input></td>' +
    '<td><input value="1"></td>' +
    '<td><button onclick="removeSheetRow(this)">Supprimer</button></td>';

  document.getElementById('pieces').appendChild(tr);
}

function removeSheetRow(btn) {
  btn.closest('tr').remove();
}


function calculate() {
  const W = Number(document.getElementById('sheetW').value);
  const H = Number(document.getElementById('sheetH').value);
  const loss = Number(document.getElementById('gap').value);

  if (!W || !H) {
    alert('Dimensions de tôle invalides');
    return;
  }

  let pieces = [];

  document.querySelectorAll('#pieces tr').forEach(tr => {
    const w = Number(tr.children[0].firstElementChild.value);
    const h = Number(tr.children[1].firstElementChild.value);
    const q = Number(tr.children[2].firstElementChild.value);

    if (!w || !h || !q) return;

    for (let i = 0; i < q; i++) {
      pieces.push({ w: w + loss, h: h + loss });
    }
  });

  if (!pieces.length) {
    alert('Aucune pièce');
    return;
  }

  let sheets = [{ bands: [], used: 0 }];

  pieces.forEach(p => {
    let placed = false;

    for (let s of sheets) {
      for (let b of s.bands) {
        if (b.used + p.w <= W && b.h >= p.h) {
          b.items.push(p);
          b.used += p.w;
          placed = true;
          break;
        }
      }
      if (placed) break;

      if (s.used + p.h <= H) {
        s.bands.push({ h: p.h, used: p.w, items: [p] });
        s.used += p.h;
        placed = true;
        break;
      }
    }

    if (!placed) {
      sheets.push({
        bands: [{ h: p.h, used: p.w, items: [p] }],
        used: p.h
      });
    }
  });
  // Affichage du nombre de tôles
  document.getElementById('result').innerHTML =
    '<h4>' + sheets.length + ' tôle(s) nécessaire(s)</h4>';
  draw(sheets, W, H, loss);
}


function draw(sheets, W, H, loss) {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(
    canvas.width / W,
    canvas.height / (H * sheets.length)
  );

  let offsetY = 10;

  sheets.forEach((sheet, i) => {
    ctx.strokeRect(10, offsetY, W * scale, H * scale);
    ctx.fillText('Tôle ' + (i + 1), 10, offsetY - 2);

    let y = offsetY;

    sheet.bands.forEach(band => {
      let x = 10;
      band.items.forEach(p => {
        ctx.fillStyle = '#cfe8ff';
        ctx.fillRect(x, y, (p.w - loss) * scale, (p.h - loss) * scale);
        ctx.strokeRect(x, y, (p.w - loss) * scale, (p.h - loss) * scale);
        ctx.fillStyle = '#000';
        ctx.fillText(
          (p.w - loss) + '×' + (p.h - loss),
          x + 4,
          y + 12
        );
        x += p.w * scale;
      });
      y += band.h * scale;
    });

    offsetY += H * scale + 20;
  });
}


function printPlan() {
  var canvas = document.getElementById('canvas');
  if (!canvas) {
    alert('Canvas introuvable');
    return;
  }

  var imgData = canvas.toDataURL('image/png');
  var result = document.getElementById('result').innerHTML;

  var w = window.open('', '', 'width=1000,height=700');

  w.document.write(
    '<html>' +
      '<head>' +
        '<title>Plan de découpe tôles</title>' +
        '<style>' +
          'body{font-family:Arial;padding:20px;}' +
          'img{max-width:100%;border:1px solid #000;}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<h2>Plan de découpe tôles</h2>' +
        result +
        '<img src="' + imgData + '">' +
      '</body>' +
    '</html>'
  );

  w.document.close();
  w.focus();
  w.print();
}


</script>
</details>



            <article class="quote-cost-section">
              <header>
                ${clientPageIcon('user', 'quote-section-icon')}
                <div>
                  <h3>Main-d'œuvre et autres coûts</h3>
                  <p>Ajoutez une prestation, une pose, un traitement ou un forfait existant.</p>
                </div>
              </header>

  <form method="POST" action="/devis/line" class="quote-line-modern-form" id="prestForm">
    <input type="hidden" name="quote_id" value="${id}">
    <input type="hidden" name="category" value="Prestation">

    <div class="quote-line-form-grid">
      <div class="modern-field">
        <label>Type</label>
        <div class="clients-input-shell">
          ${clientPageIcon('database')}
        <select id="prest_type" required>
          <option value="Main d’œuvre">Main d’œuvre</option>
          <option value="Pose">Pose</option>
          <option value="Laser">Laser</option>
          <option value="Galvanisation">Galvanisation</option>
          <option value="Thermolaquage">Thermolaquage</option>
          <option value="Matières">Matières</option>
        </select>
        </div>
      </div>

      <div class="modern-field field-wide">
        <label>Libellé</label>
        <div class="clients-input-shell">
          ${clientPageIcon('postal')}
        <input id="prest_label" name="label" required />
        </div>
      </div>

      <div class="modern-field">
        <label>Qté</label>
        <div class="clients-input-shell">
          ${clientPageIcon('add')}
        <input name="qty" type="number" step="0.01" value="1" required />
        </div>
      </div>

      <div class="modern-field">
        <label>Unité</label>
        <div class="clients-input-shell">
          ${clientPageIcon('database')}
        <select name="unit" required>
          <option value="h">h</option>
          <option value="forfait">forfait</option>
          <option value="u">u</option>
          <option value="kilos">kilos</option>
        </select>
        </div>
      </div>

      <div class="modern-field">
        <label>Coût unitaire (€)</label>
        <div class="clients-input-shell">
          ${clientPageIcon('postal')}
        <input id="prest_cost" type="number" step="0.01" value="0" required />
        </div>
      </div>

      <div class="modern-field">
        <label>Marge (%)</label>
        <div class="clients-input-shell">
          ${clientPageIcon('add')}
        <input id="prest_margin" type="number" step="0.1" value="0" />
        </div>
      </div>

      <div class="modern-field">
        <label>Prix unitaire (€)</label>
        <div class="clients-input-shell">
          ${clientPageIcon('postal')}
        <input id="prest_price" name="unit_price" type="number" step="0.01" required />
        </div>
      </div>

      <div class="quote-material-summary">
        <span>Total main-d'œuvre</span>
        <strong id="prest_total_preview">—</strong>
        <div>
          <small>Prix unitaire : <b id="prest_unit_preview">—</b></small>
        </div>
      </div>

      <div class="modern-form-actions field-wide">
        <button type="submit" class="clients-submit-btn"><span>${clientPageIcon('add', 'clients-submit-icon')}</span>Ajouter au devis</button>
      </div>
    </div>
  </form>
            </article>
          </div>
        </section>
<script>
(function () {
  var costInput = document.getElementById('prest_cost');
  var marginInput = document.getElementById('prest_margin');
  var priceInput = document.getElementById('prest_price');
  var typeInput = document.getElementById('prest_type');
  var labelInput = document.getElementById('prest_label');
  var qtyInput = document.querySelector('#prestForm input[name="qty"]');
  var totalPreview = document.getElementById('prest_total_preview');
  var unitPreview = document.getElementById('prest_unit_preview');

  if (!costInput || !marginInput || !priceInput) return;

  function updatePrice() {
    var cost = Number(costInput.value || 0);
    var margin = Number(marginInput.value || 0);
    var price = cost * (1 + margin / 100);
    priceInput.value = price.toFixed(2);
    if (unitPreview) unitPreview.textContent = price.toFixed(2) + ' €';
    if (totalPreview) {
      var qty = Number(qtyInput?.value || 0);
      totalPreview.textContent = qty > 0 ? (qty * price).toFixed(2) + ' €' : '—';
    }
  }

  costInput.addEventListener('input', updatePrice);
  marginInput.addEventListener('input', updatePrice);
  priceInput.addEventListener('input', function(){
    var price = Number(priceInput.value || 0);
    if (unitPreview) unitPreview.textContent = price > 0 ? price.toFixed(2) + ' €' : '—';
    if (totalPreview) {
      var qty = Number(qtyInput?.value || 0);
      totalPreview.textContent = qty > 0 && price > 0 ? (qty * price).toFixed(2) + ' €' : '—';
    }
  });
  if (qtyInput) qtyInput.addEventListener('input', updatePrice);

  typeInput.addEventListener('change', function () {
    if (!labelInput.value.trim()) {
      labelInput.value = typeInput.value;
    }
  });

  updatePrice();
})();
</script>

  <script>
  (function(){
    const type = document.getElementById('prest_type');
    const label = document.getElementById('prest_label');
    if (!type || !label) return;

    function sync(){
      const t = type.value || '';
      if (!label.value.trim()) label.value = t;
    }
    type.addEventListener('change', sync);
    sync();
  })();
  </script>
<section class="quote-work-card quote-lines-section">
  <div class="modern-list-head">
    <h2>Lignes du devis</h2>
    <span>${lines.length} ligne${lines.length > 1 ? 's' : ''}</span>
  </div>

  <div class="quote-lines quote-work-lines">

${lines.length ? lines.map(l => `

<article class="quote-card quote-work-line-card">

  <div class="quote-card-head">

    <span class="quote-type">
      ${escHtml(l.category || '')}
    </span>

    <div class="quote-line-actions">
    <form method="POST"
          action="/devis/line/delete"
          onsubmit="return confirm('Supprimer ?')">

      <input type="hidden" name="quote_id" value="${id}">
      <input type="hidden" name="id" value="${l.id}">

      <button class="delete-btn" aria-label="Supprimer">${clientPageIcon('trash', 'modern-action-icon')}</button>

    </form>
<form
  method="GET"
  action="/devis/line/${l.id}/edit"
>

  <button
    type="submit"
    class="edit-btn"
    aria-label="Modifier">
    Modifier
  </button>

</form>
    </div>
  </div>

  <h3>${escHtml(l.label || '')}</h3>

  <div class="quote-line-grid">
    <div>
      <span>Quantité</span>
      <strong>${Number(l.qty || 0).toFixed(2)} ${escHtml(l.unit || '')}</strong>
    </div>
    <div>
      <span>PU HT</span>
      <strong>${Number(l.unit_price || 0).toFixed(2)} €</strong>
    </div>
    <div>
      <span>Total HT</span>
      <strong>${Number(l.total || 0).toFixed(2)} €</strong>
    </div>
  </div>

</article>

`).join('') : '<div class="empty-state">Aucune ligne dans ce devis.</div>'}

  </div>
</section>

<section class="quote-work-card measurement-linked-section">
  <div class="modern-section-title">
    ${clientPageIcon('folder', 'clients-title-icon')}
    <div>
      <h2>Prises de cotes liées</h2>
      <p>Documents rattachés à ce devis.</p>
    </div>
  </div>
  ${renderMeasurementCards(linkedMeasurements)}
</section>

<section class="quote-secondary-grid">
  <article class="quote-work-card">
    <div class="modern-section-title">
      ${clientPageIcon('postal', 'clients-title-icon')}
      <div>
        <h2>Relevé de cotes / Notes chantier</h2>
        <p>Notes internes conservées avec le devis.</p>
      </div>
    </div>

    <form method="POST" action="/devis/${id}/notes" class="quote-notes-form">
      <textarea name="notes" rows="8">${escHtml(quote.notes || '')}</textarea>
      <div class="modern-form-actions">
        <button type="submit" class="clients-submit-btn"><span>${clientPageIcon('add', 'clients-submit-icon')}</span>Enregistrer</button>
      </div>
    </form>
  </article>

  <article class="quote-work-card">
    <div class="modern-section-title">
      ${clientPageIcon('folder', 'clients-title-icon')}
      <div>
        <h2>Photos chantier</h2>
        <p>Ajoutez ou consultez les fichiers photo du devis.</p>
      </div>
    </div>

    <form method="POST" action="/devis/${id}/photo" enctype="multipart/form-data" class="quote-photo-form">
      <input type="file" name="photo" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" required>
      <button type="submit" class="modern-secondary-btn">Ajouter</button>
    </form>

    <div class="photo-grid quote-photo-grid">
      ${photosHtml || '<div class="empty-state">Aucune photo.</div>'}
    </div>
  </article>
</section>

<div class="quote-lightbox" data-quote-lightbox hidden>
  <div class="quote-lightbox-backdrop" data-quote-lightbox-close></div>
  <div class="quote-lightbox-panel" role="dialog" aria-modal="true" aria-label="Visionneuse photo devis">
    <button type="button" class="quote-lightbox-close" data-quote-lightbox-close aria-label="Fermer la photo">×</button>
    <img src="" alt="" class="quote-lightbox-image" data-quote-lightbox-image>
    <p class="quote-lightbox-title" data-quote-lightbox-title></p>
  </div>
</div>

<script>
(function () {
  const lightbox = document.querySelector('[data-quote-lightbox]');
  if (!lightbox) return;

  const image = lightbox.querySelector('[data-quote-lightbox-image]');
  const title = lightbox.querySelector('[data-quote-lightbox-title]');
  const closeControls = lightbox.querySelectorAll('[data-quote-lightbox-close]');

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove('quote-lightbox-open');
    if (image) {
      image.removeAttribute('src');
      image.alt = '';
    }
    if (title) title.textContent = '';
  }

  function openLightbox(url, label) {
    if (!image || !url) return;
    image.src = url;
    image.alt = label || 'Photo du devis';
    if (title) title.textContent = label || '';
    lightbox.hidden = false;
    document.body.classList.add('quote-lightbox-open');
  }

  document.querySelectorAll('[data-quote-photo-url]').forEach(function (button) {
    button.addEventListener('click', function () {
      openLightbox(button.getAttribute('data-quote-photo-url'), button.getAttribute('data-quote-photo-title'));
    });
  });

  closeControls.forEach(function (control) {
    control.addEventListener('click', closeLightbox);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
})();
</script>

</div>

      `
    )
  );
});
app.post('/devis/:id/photo/delete', requireLogin, (req, res) => {

  const id = Number(req.params.id);
  const photo = path.basename(req.body.photo || '');
  if (!Number.isFinite(id) || id <= 0) return res.status(400).send('ID devis invalide');

  const photoPath = safeResolveInside(QUOTE_PHOTO_DIR, String(id), photo);

  if (fs.existsSync(photoPath)) {
    fs.unlinkSync(photoPath);
  }

  res.redirect('/devis/' + id);

});
app.get('/devis/line/:id/edit', requireLogin, (req, res) => {

  const line = db
    .prepare('SELECT * FROM quote_lines WHERE id = ?')
    .get(req.params.id);

  if (!line) {
    return res.status(404).send('Ligne introuvable');
  }

  res.send(`
    <form method="POST" action="/devis/line/${line.id}/edit">

      <input name="label" value="${line.label}">
      <input name="qty" value="${line.qty}">
      <input name="unit_price" value="${line.unit_price}">

      <button type="submit">
        Enregistrer
      </button>

    </form>
  `);

});
app.post('/devis/line/:id/edit', requireLogin, (req, res) => {

  const line = db
    .prepare('SELECT * FROM quote_lines WHERE id = ?')
    .get(req.params.id);

  const qty = Number(req.body.qty || 0);
  const pu = Number(req.body.unit_price || 0);

  db.prepare(`
    UPDATE quote_lines
    SET
      label = ?,
      qty = ?,
      unit_price = ?,
      total = ?
    WHERE id = ?
  `).run(
    req.body.label,
    qty,
    pu,
    qty * pu,
    req.params.id
  );

  res.redirect('/devis/' + line.quote_id);

});
app.get(
  '/quote-photos/:id/:file',
  requireLogin,
  (req, res) => {
    const quoteId = Number(req.params.id || 0);
    if (!Number.isFinite(quoteId) || quoteId <= 0) return res.status(400).send('ID devis invalide');

    const filePath = safeResolveInside(QUOTE_PHOTO_DIR, String(quoteId), path.basename(req.params.file || ''));

    if (!fs.existsSync(filePath)) return res.status(404).send('Fichier introuvable');

    res.sendFile(filePath);

  }
);
// AJOUT LIGNE MANUELLE
app.post('/devis/line', requireLogin, (req, res) => {
  const quote_id = Number(req.body.quote_id);
  const category = String(req.body.category || '').trim();
  const label = String(req.body.label || '').trim();
  const unit = String(req.body.unit || '').trim();
  const qty = Number(req.body.qty || 0);
  const unit_price = Number(req.body.unit_price || 0);

  if (!quote_id || !label || !unit || !Number.isFinite(qty) || !Number.isFinite(unit_price) || qty <= 0 || unit_price <= 0) {
    return res.status(400).send('Données ligne invalides');
  }

  const total = round2(qty * unit_price);

  db.prepare(
    `
    INSERT INTO quote_lines (quote_id, category, label, qty, unit, unit_price, total, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(quote_id, category || null, label, qty, unit, unit_price, total, 0, new Date().toISOString());

  res.redirect('/devis/' + quote_id);
});

// SUPPRIMER LIGNE
app.post('/devis/line/delete', requireLogin, (req, res) => {
  const id = Number(req.body.id);
  const quote_id = Number(req.body.quote_id);
  if (!id || !quote_id) return res.status(400).send('Paramètres invalides');

  db.prepare('DELETE FROM quote_lines WHERE id = ? AND quote_id = ?').run(id, quote_id);
  res.redirect('/devis/' + quote_id);
});

// AJOUT LIGNE MATIERE (depuis répertoire)
app.post('/devis/line/material', requireLogin, (req, res) => {
  const quote_id = Number(req.body.quote_id);
  const material_id = Number(req.body.material_id);
  const category = String(req.body.category || 'Matière').trim();

  if (!quote_id || !material_id) return res.status(400).send('Paramètres invalides');

  const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(material_id);
  if (!m) return res.status(404).send('Matière introuvable');

  const type = String(m.type || '');
  const n = (x) => Number(x || 0) || 0;

  let label = m.name || 'Matière';
  let qty = 0;
  let unit = m.unit || '';
  const unit_price = Number(m.price || 0);

  if (type === 'tube') {
    const len_m = n(req.body.len_m);
    if (len_m <= 0) return res.status(400).send('Longueur (m) requise');
    qty = len_m;
    unit = 'm';
  } else if (type === 'beam') {
    const len_m = n(req.body.len_m);
    const kgpm = n(m.kg_per_m);
    if (len_m <= 0) return res.status(400).send('Longueur (m) requise');
    if (kgpm <= 0) return res.status(400).send('kg/m manquant dans le répertoire');
    qty = len_m * kgpm;
    unit = 'kg';
    label = `${m.name} (${len_m.toFixed(2)} m)`;
  } else if (type === 'sheet') {
    const th = n(req.body.th_mm);
    const w = n(req.body.w_mm);
    const l = n(req.body.l_mm);
    const dens = n(m.density) || 7.85;

    if (th <= 0 || w <= 0 || l <= 0) return res.status(400).send('Dimensions tôle requises');

    qty = calcSheetKg({ th_mm: th, w_mm: w, l_mm: l, density: dens });
    unit = 'kg';
    label = `${m.name} ${th}mm (${w}x${l})`;
  } else {
    return res.status(400).send('Type matière invalide (tube/beam/sheet)');
  }

  if (qty <= 0 || unit_price <= 0) return res.status(400).send('Quantité ou prix invalide');

  const total = round2(qty * unit_price);

  db.prepare(
    `
    INSERT INTO quote_lines (quote_id, category, label, qty, unit, unit_price, total, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(quote_id, category || null, label, qty, unit, unit_price, total, 0, new Date().toISOString());

  res.redirect('/devis/' + quote_id);
});

// ACCEPTER DEVIS
app.post('/devis/:id/accept', requireLogin, (req, res) => {

  try {

    const quoteId = Number(req.params.id);

    const lines = db.prepare(`
      SELECT *
      FROM quote_lines
      WHERE quote_id = ?
    `).all(quoteId);
    console.log('LIGNES DU DEVIS :');
console.log(JSON.stringify(lines, null, 2));

let plannedHours = 0;

for (const line of lines) {

  const label =
    String(line.label || '').toLowerCase();

  if (label.includes('main')) {
    plannedHours += Number(line.qty || 0);
  }

}

console.log('HEURES PREVUES =', plannedHours);


    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
    if (!quote) return res.status(404).send('Devis introuvable');

    const clientName = String(quote.client_name || '').trim();
    if (!clientName) return res.status(400).send('Client manquant sur le devis');

    const orderTitle = String(quote.title || '').trim();
    if (!orderTitle) return res.status(400).send('Titre du devis manquant');

    const safeClient = safeName(clientName);

    // Total du devis (serveur)
   const totalLines = db.prepare(
  'SELECT total FROM quote_lines WHERE quote_id = ?'
).all(quoteId);
    const total = totalLines.reduce((s, l) => s + (Number(l.total) || 0), 0);

    const marginPct = Number(quote.margin_pct ?? 0);
    const totalWithMargin = round2(total * (1 + marginPct / 100));

    // 1) Client DB (création si absent)
const existing = db
  .prepare('SELECT id FROM clients WHERE LOWER(name) = LOWER(?)')
  .get(clientName);

    if (!existing) {
      db.prepare(
        `
        INSERT INTO clients (name, email, phone, address, created_at)
        VALUES (?, ?, ?, ?, ?)
        `
      ).run(
        clientName,
        quote.client_email || null,
        quote.client_phone || null,
        quote.client_address || null,
        new Date().toISOString()
      );
    }

    // 2) Dossier client PC
    const clientDir = path.join(CLIENT_PC_DIR, safeClient);
    ensureDir(clientDir);

    // 3) Dossier commande = titre devis (unique)
    const safeOrder = uniqueFolder(clientDir, safeName(orderTitle));
    const orderDir = path.join(clientDir, safeOrder);
    ensureDir(orderDir);
    ensureStandardSubfolders(orderDir);
const devisDir = path.join(orderDir, 'Devis');


let descriptif = '';

descriptif += `CLIENT : ${clientName}\n`;
descriptif += `PROJET : ${orderTitle}\n`;
descriptif += `DATE : ${new Date().toLocaleDateString('fr-FR')}\n\n`;

descriptif += 'DESCRIPTIF DU DEVIS\n';
descriptif += '===================\n\n';

for (const line of lines) {

  descriptif += `${line.qty || 1} x ${line.label || ''}`;

  if (line.unit_price) {
    descriptif += ` - ${line.unit_price} €`;
  }

  descriptif += '\n';
}

descriptif += '\n';
descriptif += `TOTAL : ${totalWithMargin.toFixed(2)} €\n`;

fs.writeFileSync(
  path.join(devisDir, 'Descriptif devis.txt'),
  descriptif,
  'utf8'
);
    // 4) Commande DB (prix = total avec marge)
    console.log('HEURES PREVUES =', plannedHours);
    console.log('quoteId =', quoteId);
console.log('plannedHours =', plannedHours);
console.log('clientName =', clientName);
console.log('orderTitle =', orderTitle);
  db.prepare(
  `
  INSERT INTO client_orders
  (
    name,
    description,
    date,
    price,
    planned_hours,
    status,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, 'En cours', ?)
  `
).run(
  clientName,
  orderTitle,
  isoDate(),
  totalWithMargin,
  plannedHours,
  new Date().toISOString()
);

    // 5) MAJ devis
    db.prepare("UPDATE quotes SET status = 'Accepté' WHERE id = ?").run(quoteId);

    // 6) Redirection vers dossier PC
    return res.redirect(
      '/pc-folders/' + encodeURIComponent(safeClient) + '/' + encodeURIComponent(safeOrder)
    );
  } catch (err) {
    console.error('❌ Erreur accept devis:', err);
    return res.status(500).send('Erreur serveur lors de l’acceptation (voir console).');
  }
});

app.post('/devis/:id/margin', requireLogin, (req, res) => {
  const quoteId = Number(req.params.id);
  const margin = Number(req.body.margin_pct || 0);

  if (!Number.isFinite(quoteId) || quoteId <= 0) return res.status(400).send('ID devis invalide');
  if (!Number.isFinite(margin) || margin < 0) return res.status(400).send('Marge invalide');

  db.prepare('UPDATE quotes SET margin_pct = ? WHERE id = ?').run(margin, quoteId);

  res.redirect('/devis/' + quoteId);
});

// SUPPRIMER UN DEVIS (et ses lignes)
app.post('/devis/:id/delete', requireLogin, (req, res) => {
  const quoteId = Number(req.params.id);
  if (!quoteId) return res.status(400).send('ID devis invalide');

  const quote = db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId);
  if (!quote) return res.status(404).send('Devis introuvable');

  db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(quoteId);
  db.prepare('DELETE FROM quotes WHERE id = ?').run(quoteId);

  res.redirect('/devis');
});

/* ===================== MATIÈRES ===================== */
app.get('/materials', requireLogin, (req, res) => {
  const q = String(req.query.q || '').trim();
  const totalMaterials = db.prepare('SELECT COUNT(*) AS c FROM materials').get().c;
  const materials = q
    ? db.prepare(`
        SELECT *
        FROM materials
        WHERE lower(COALESCE(type, '')) LIKE lower(?)
           OR lower(COALESCE(name, '')) LIKE lower(?)
           OR lower(COALESCE(unit, '')) LIKE lower(?)
        ORDER BY type, name
      `).all(`%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM materials ORDER BY type, name').all();
  const isAdmin = req.session?.user?.role !== 'atelier';
  const seeded = req.query.seeded === '1';
  const saved = req.query.saved === '1';
  const added = Number(req.query.added || 0);

  const groupedMaterials = materials.reduce((groups, material) => {
    const type = String(material.type || 'Sans type').trim() || 'Sans type';
    if (!groups[type]) groups[type] = [];
    groups[type].push(material);
    return groups;
  }, {});

  const materialGroups = Object.keys(groupedMaterials).length
    ? Object.keys(groupedMaterials)
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map((type) => {
          const rows = groupedMaterials[type]
            .map((m) => {
              const priceValue = Number(m.price || 0).toFixed(2);
              return (
                '<a class="material-list-row" href="/materials/' + m.id + '">' +
                  '<div class="material-list-main">' +
                    '<strong>' + escHtml(String(m.name || 'Matière')) + '</strong>' +
                    '<span>' + escHtml(type) + '</span>' +
                  '</div>' +
                  '<div class="material-list-meta">' +
                    '<span>' + priceValue + ' €</span>' +
                    '<small>' + escHtml(String(m.unit || '—')) + '</small>' +
                  '</div>' +
                  '<b aria-hidden="true">›</b>' +
                '</a>'
              );
            })
            .join('');
          return (
            '<section class="materials-category">' +
              '<header>' +
                '<h2>' + escHtml(type) + '</h2>' +
                '<span>' + groupedMaterials[type].length + ' matière(s)</span>' +
              '</header>' +
              '<div class="materials-compact-list">' + rows + '</div>' +
            '</section>'
          );
        })
        .join('')
    : '<div class="empty-state material-empty-state">' + (q ? 'Aucune matière trouvée.' : 'Aucune matière enregistrée') + '</div>';

  const html =
    '<div class="materials-page modern-page">' +
      '<section class="materials-hero">' +
        '<div class="clients-create-head">' +
          clientPageIcon('materials', 'clients-create-icon') +
          '<div>' +
            
            '<h1>Bibliothèque matière</h1>' +
          '</div>' +
        '</div>' +
        '<div class="materials-hero-actions">' +
          '<span class="materials-count">' + totalMaterials + ' matière(s)</span>' +
          (isAdmin
            ? '<form method="POST" action="/materials/seed" class="materials-seed-form">' +
              
                (seeded ? '<span>' + added + ' matière(s) ajoutée(s)</span>' : '') +
              '</form>'
            : '') +
        '</div>' +
      '</section>' +

    (seeded
      ? '<div class="success-message">Bibliothèque matière préremplie. Vous pouvez maintenant renseigner vos tarifs.</div>'
      : '') +
    (saved
      ? '<div class="success-message">Matière enregistrée.</div>'
      : '') +

    '<section class="clients-create-card materials-add-card is-collapsed" data-materials-add-card>' +
      '<button type="button" class="materials-add-toggle" aria-expanded="false" aria-controls="materials-add-panel" data-materials-add-toggle>' +
        '<span class="materials-add-title">' +
          clientPageIcon('add', 'clients-create-icon') +
          '<span>Ajouter une matière</span>' +
        '</span>' +
        '<span class="materials-add-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>' +
      '</button>' +
      '<div class="materials-add-panel" id="materials-add-panel" hidden data-materials-add-panel>' +
        '<form method="POST" action="/materials" class="materials-add-form">' +
          '<div class="clients-form-grid">' +
            '<label class="clients-field">' +
              '<span>Type</span>' +
              '<div class="clients-input-shell">' +
                clientPageIcon('materials') +
                '<input name="type" required placeholder="Ex: Tubes carrés acier">' +
              '</div>' +
            '</label>' +
            '<label class="clients-field">' +
              '<span>Nom</span>' +
              '<div class="clients-input-shell">' +
                clientPageIcon('postal') +
                '<input name="name" required placeholder="Ex: 40x40x2">' +
              '</div>' +
            '</label>' +
            '<label class="clients-field">' +
              '<span>Unité</span>' +
              '<div class="clients-input-shell">' +
                clientPageIcon('materials') +
                '<input name="unit" placeholder="ml, m², pièce">' +
              '</div>' +
            '</label>' +
            '<label class="clients-field">' +
              '<span>Prix (€)</span>' +
              '<div class="clients-input-shell">' +
                clientPageIcon('postal') +
                '<input name="price" inputmode="decimal" placeholder="0.00">' +
              '</div>' +
            '</label>' +
            '<label class="clients-field">' +
              '<span>kg / m</span>' +
              '<div class="clients-input-shell">' +
                clientPageIcon('logibarre') +
                '<input name="kg_per_m" inputmode="decimal" placeholder="Optionnel">' +
              '</div>' +
            '</label>' +
            '<label class="clients-field">' +
              '<span>Densité</span>' +
              '<div class="clients-input-shell">' +
                clientPageIcon('database') +
                '<input name="density" inputmode="decimal" placeholder="Optionnel">' +
              '</div>' +
            '</label>' +
          '</div>' +
          '<div class="clients-submit-row">' +
            '<button type="submit" class="clients-submit-btn">' +
              clientPageIcon('add', 'clients-submit-icon') +
              'Ajouter la matière' +
            '</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</section>' +

    '<form method="GET" action="/materials" class="materials-search-form">' +
      '<div class="materials-search-shell">' +
        clientPageIcon('search', 'materials-search-icon') +
        '<input name="q" value="' + escHtml(q) + '" placeholder="Rechercher par type, nom ou unité..." autocomplete="off" />' +
      '</div>' +
      '<button type="submit" class="clients-submit-btn materials-search-btn">Rechercher</button>' +
      (q ? '<a class="materials-reset-btn" href="/materials">Réinitialiser</a>' : '') +
    '</form>' +

    '<div class="materials-groups">' + materialGroups + '</div>' +
    '<script>' +
      '(function(){' +
        'var card=document.querySelector("[data-materials-add-card]");' +
        'if(!card)return;' +
        'var toggle=card.querySelector("[data-materials-add-toggle]");' +
        'var panel=card.querySelector("[data-materials-add-panel]");' +
        'if(!toggle||!panel)return;' +
        'toggle.addEventListener("click",function(){' +
          'var isOpen=toggle.getAttribute("aria-expanded")==="true";' +
          'toggle.setAttribute("aria-expanded",String(!isOpen));' +
          'if(isOpen){' +
            'card.classList.remove("is-open");' +
            'card.classList.add("is-collapsed");' +
            'window.setTimeout(function(){if(toggle.getAttribute("aria-expanded")!=="true")panel.hidden=true;},230);' +
          '}else{' +
            'panel.hidden=false;' +
            'window.requestAnimationFrame(function(){card.classList.add("is-open");card.classList.remove("is-collapsed");});' +
          '}' +
        '});' +
      '})();' +
    '</script>' +
    '</div>';

  res.send(pageTemplate(req, 'Bibliothèque matière', html));
});

app.post('/materials', requireLogin, (req, res) => {
  const type = req.body.type;
  const name = req.body.name;
  const unit = req.body.unit;
  const price = parseDecimalInput(req.body.price, 0);
  const kg_per_m = String(req.body.kg_per_m || '').trim() !== '' ? parseDecimalInput(req.body.kg_per_m, null) : null;
  const density = String(req.body.density || '').trim() !== '' ? parseDecimalInput(req.body.density, null) : null;

  db.prepare(
    'INSERT INTO materials (type, name, unit, price, kg_per_m, density, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    type,
    name,
    unit,
    price,
    kg_per_m,
    density,
    new Date().toISOString()
  );

  res.redirect('/materials');
});

function updateMaterialPricing(id, body) {
  const unit = String(body.unit || '').trim();
  const price = parseDecimalInput(body.price, 0);
  const kgPerM = String(body.kg_per_m || '').trim() !== '' ? parseDecimalInput(body.kg_per_m, null) : null;
  const density = String(body.density || '').trim() !== '' ? parseDecimalInput(body.density, null) : null;

  db.prepare(
    'UPDATE materials SET unit = ?, price = ?, kg_per_m = ?, density = ? WHERE id = ?'
  ).run(unit, price, kgPerM, density, id);
}

app.post('/materials/update', requireLogin, (req, res) => {
  const id = Number(req.body.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).send('ID matière invalide');

  updateMaterialPricing(id, req.body);

  res.redirect('/materials/' + id + '?saved=1');
});

app.post('/materials/seed', requireAdmin, (req, res) => {
  const inserted = seedStandardMaterials();
  res.redirect('/materials?seeded=1&added=' + inserted);
});

app.post('/materials/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM materials WHERE id = ?').run(req.body.id);
  res.redirect('/materials');
});

app.get('/materials/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).send('ID matière invalide');

  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  if (!material) return res.status(404).send('Matière introuvable');

  const saved = req.query.saved === '1';
  const priceValue = Number(material.price || 0).toFixed(2);
  const kgValue = material.kg_per_m !== null && material.kg_per_m !== undefined ? escHtml(String(material.kg_per_m)) : '';
  const densityValue = material.density !== null && material.density !== undefined ? escHtml(String(material.density)) : '';
  const createdLabel = material.created_at ? formatDateLabel(material.created_at) : '—';

  const html =
    '<div class="materials-page material-detail-page modern-page">' +
    '<section class="materials-hero material-detail-hero">' +
      '<div class="clients-create-head">' +
        clientPageIcon('materials', 'clients-create-icon') +
        '<div>' +
          '<span>' + escHtml(String(material.type || 'Matière')) + '</span>' +
          '<h1>' + escHtml(String(material.name || 'Matière')) + '</h1>' +
        '</div>' +
      '</div>' +
      '<a class="materials-reset-btn" href="/materials">Retour matières</a>' +
    '</section>' +

    (saved ? '<div class="success-message">Matière enregistrée.</div>' : '') +

    '<section class="material-detail-card">' +
      '<div class="material-detail-summary">' +
        '<span>' + escHtml(String(material.type || '').toUpperCase()) + '</span>' +
        '<strong>' + escHtml(String(material.name || '')) + '</strong>' +
      '</div>' +
      '<div class="material-detail-grid">' +
        '<div><span>Unité</span><strong>' + escHtml(String(material.unit || '—')) + '</strong></div>' +
        '<div><span>Prix</span><strong>' + priceValue + ' €</strong></div>' +
        '<div><span>kg/m</span><strong>' + (kgValue || '—') + '</strong></div>' +
        '<div><span>Densité</span><strong>' + (densityValue || '—') + '</strong></div>' +
        '<div><span>Créée le</span><strong>' + escHtml(createdLabel) + '</strong></div>' +
      '</div>' +
    '</section>' +

    '<form method="POST" action="/materials/' + id + '" class="clients-create-card material-detail-form">' +
      '<div class="clients-create-head">' +
        clientPageIcon('postal', 'clients-create-icon') +
        '<div>' +
          '<span>Tarifs</span>' +
          '<h2>Modifier les informations</h2>' +
        '</div>' +
      '</div>' +
      '<div class="clients-form-grid">' +
        '<label class="clients-field">' +
          '<span>Unité</span>' +
          '<div class="clients-input-shell">' +
            clientPageIcon('materials') +
            '<input name="unit" value="' + escHtml(String(material.unit || '')) + '">' +
          '</div>' +
        '</label>' +
        '<label class="clients-field">' +
          '<span>Prix (€)</span>' +
          '<div class="clients-input-shell">' +
            clientPageIcon('postal') +
            '<input name="price" value="' + priceValue + '" inputmode="decimal">' +
          '</div>' +
        '</label>' +
        '<label class="clients-field">' +
          '<span>kg / m</span>' +
          '<div class="clients-input-shell">' +
            clientPageIcon('logibarre') +
            '<input name="kg_per_m" value="' + kgValue + '" inputmode="decimal">' +
          '</div>' +
        '</label>' +
        '<label class="clients-field">' +
          '<span>Densité</span>' +
          '<div class="clients-input-shell">' +
            clientPageIcon('database') +
            '<input name="density" value="' + densityValue + '" inputmode="decimal">' +
          '</div>' +
        '</label>' +
      '</div>' +
      '<div class="clients-submit-row">' +
        '<button type="submit" class="clients-submit-btn">' +
          clientPageIcon('check', 'clients-submit-icon') +
          'Enregistrer' +
        '</button>' +
      '</div>' +
    '</form>' +
    '<form method="POST" action="/materials/delete" class="material-delete-form" onsubmit="return confirm(\'Supprimer cette matière ?\');">' +
      '<input type="hidden" name="id" value="' + id + '">' +
      '<button type="submit" class="modern-danger-btn">' +
        clientPageIcon('trash', 'modern-action-icon') +
        'Supprimer la matière' +
      '</button>' +
    '</form>' +
    '</div>';

  res.send(pageTemplate(req, material.name || 'Matière', html));
});

app.post('/materials/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).send('ID matière invalide');

  const material = db.prepare('SELECT id FROM materials WHERE id = ?').get(id);
  if (!material) return res.status(404).send('Matière introuvable');

  updateMaterialPricing(id, req.body);

  res.redirect('/materials/' + id + '?saved=1');
});
/* ===================== Logibarre ===================== */
app.get('/outils/logibarre', requireLogin, (req, res) => {
  res.send(
    pageTemplate(req, 'Logibarre', `
     <section class="panel workshop-calc-panel logibarre-page">
  <div class="panel-header app-dark-tool-head">
    ${clientPageIcon('logibarre', 'clients-title-icon')}
    <div>
      <h2>Calculateur de barres</h2>
      <span>Optimisation des coupes</span>
    </div>
  </div>

  <div class="bar-calc">

    <div class="workshop-param-grid">
    <div class="bar-row workshop-field">
      <label>Longueur barre standard</label>
      <input id="bar-length" type="number" value="6000">
    </div>

    <div class="bar-row workshop-field">
      <label>Perte par coupe</label>
      <input id="bar-loss" type="number" value="3">
    </div>
    </div>

    <h4 class="workshop-section-title">Pièces à couper</h4>

    <table class="workshop-pieces-table logibarre-pieces-table">
      <thead>
        <tr>
          <th>Longueur (mm)</th>
          <th>Qté</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="cuts-body">
        <tr>
          <td data-label="Longueur"><input type="number" value="1200"></td>
          <td data-label="Qté"><input type="number" value="1"></td>
          <td data-label=""><button type="button" class="workshop-delete-btn" aria-label="Supprimer la coupe" onclick="removeRow(this)">×</button></td>
        </tr>
      </tbody>
    </table>

    <div class="workshop-actions">
      <button type="button" class="btn workshop-add-btn" onclick="addRow()">+ Ajouter une coupe</button>
      <button type="button" class="btn primary workshop-calc-btn" onclick="calculateBars()">Calculer</button>
      <button type="button" class="btn secondary workshop-print-btn" onclick="printBars()">Imprimer</button>
    </div>

    <div id="bar-result" class="workshop-result bar-result"></div>

  </div>
</section>

<script>
/* ======================
   AJOUT / SUPPRESSION
====================== */
function addRow() {
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td data-label="Longueur"><input type="number" value="1000"></td>' +
    '<td data-label="Qté"><input type="number" value="1"></td>' +
    '<td data-label=""><button type="button" class="workshop-delete-btn" aria-label="Supprimer la coupe" onclick="removeRow(this)">×</button></td>';
  document.getElementById('cuts-body').appendChild(tr);
}

function removeRow(btn) {
  btn.closest('tr').remove();
}

/* ======================
   CALCUL DES BARRES
====================== */
function calculateBars() {
  var barLength = Number(document.getElementById('bar-length').value);
  var loss = Number(document.getElementById('bar-loss').value);

  if (!barLength || barLength <= 0) {
    alert('Longueur de barre invalide');
    return;
  }

  var cuts = [];

  document.querySelectorAll('#cuts-body tr').forEach(function(tr) {
    var len = Number(tr.children[0].querySelector('input').value);
    var qty = Number(tr.children[1].querySelector('input').value);

    for (var i = 0; i < qty; i++) {
      cuts.push(len + loss);
    }
  });

  if (cuts.length === 0) {
    alert('Aucune coupe');
    return;
  }

  cuts.sort(function(a, b) {
    return b - a;
  });

  var bars = [];

  cuts.forEach(function(cut) {
    var placed = false;

    bars.forEach(function(bar) {
      if (!placed && bar.remaining >= cut) {
        bar.remaining -= cut;
        bar.cuts.push(cut);
        placed = true;
      }
    });

    if (!placed) {
      bars.push({
        remaining: barLength - cut,
        cuts: [cut]
      });
    }
  });

  var html = '<h4>' + bars.length + ' barre(s) nécessaire(s)</h4>';

  bars.forEach(function(bar, i) {
    html += '<div class="bar-box">';
    html += '<strong>Barre ' + (i + 1) + '</strong><br>';
    html += 'Coupes : ' + bar.cuts.map(function(c) {
      return c - loss;
    }).join(' + ');
    html += '<br>Reste : ' + bar.remaining + ' mm';
    html += '</div>';
  });

  document.getElementById('bar-result').innerHTML = html;
}

/* ======================
   IMPRESSION
====================== */
function printBars() {
  var content = document.getElementById('bar-result').innerHTML;
  if (!content) {
    alert('Rien à imprimer');
    return;
  }

  var win = window.open('', '', 'width=900,height=650');
  win.document.write('<h2>Plan de coupe barres</h2>' + content);
  win.document.close();
  win.print();
}
</script>

    `)
  );
});


/* ===================== Barreaudage ===================== */
app.get('/outils/barreaudage', requireLogin, (req, res) => {
  res.send(
    pageTemplate(req, 'Barreaudage', `
      <section class="panel workshop-calc-panel barreaudage-page">
        <div class="panel-header app-dark-tool-head">
          ${clientPageIcon('barreaudage', 'clients-title-icon')}
          <div>
            <h2>Calcul barreaudage</h2>
            <span>Espacement et positions</span>
          </div>
        </div>

        <div class="barreaudage-calc">
          <div class="workshop-param-grid barreaudage-param-grid">
            <div class="workshop-field">
              <label>Longueur totale entre poteaux (mm)</label>
              <input id="railing-total-length" type="number" min="1" step="1" value="1500">
            </div>

            <div class="workshop-field">
              <label>Largeur d'un barreau (mm)</label>
              <input id="railing-bar-width" type="number" min="1" step="1" value="20">
            </div>

            <div class="workshop-field">
              <label>Espacement maximum autorisé (mm)</label>
              <input id="railing-max-space" type="number" min="1" step="1" value="110">
            </div>

            <div class="workshop-field">
              <label>Nombre de barreaux optionnel</label>
              <input id="railing-bar-count" type="number" min="1" step="1" placeholder="Auto">
            </div>
          </div>

          <div class="workshop-actions barreaudage-actions">
            <button type="button" class="btn primary workshop-calc-btn" onclick="calculateBarreaudage()">Calculer</button>
            <button type="button" class="btn secondary workshop-print-btn" onclick="resetBarreaudage()">Réinitialiser</button>
          </div>

          <div id="railing-result" class="workshop-result barreaudage-result"></div>
        </div>
      </section>

<script>
function getRailingNumber(id) {
  var value = String(document.getElementById(id).value || '').replace(',', '.');
  return Number(value);
}

function formatRailingMm(value) {
  if (!isFinite(value)) return '-';
  return Math.round(value * 10) / 10 + ' mm';
}

function findMinimumBars(totalLength, barWidth, maxSpace) {
  for (var count = 1; count <= 500; count++) {
    var spacing = (totalLength - count * barWidth) / (count + 1);
    if (spacing < 0) return count;
    if (spacing <= maxSpace) return count;
  }
  return 500;
}

function buildRailingDiagram(totalLength, barWidth, barCount, spacing, maxSpace) {
  var svgWidth = 760;
  var svgHeight = 220;
  var startX = 52;
  var baseY = 76;
  var visualWidth = 656;
  var railHeight = 96;
  var scale = totalLength > 0 ? visualWidth / totalLength : 1;
  var postWidth = 14;
  var barPx = Math.max(2, barWidth * scale);
  var gapPx = Math.max(0, spacing * scale);
  var html = '';

  html += '<svg class="barreaudage-svg" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '" role="img" aria-label="Schéma barreaudage">';
  html += '<rect x="0" y="0" width="' + svgWidth + '" height="' + svgHeight + '" rx="18" fill="#ffffff"/>';
  html += '<line x1="' + startX + '" y1="' + (baseY + 16) + '" x2="' + (startX + visualWidth) + '" y2="' + (baseY + 16) + '" stroke="#d1d5db" stroke-width="2"/>';
  html += '<line x1="' + startX + '" y1="' + (baseY + railHeight - 16) + '" x2="' + (startX + visualWidth) + '" y2="' + (baseY + railHeight - 16) + '" stroke="#d1d5db" stroke-width="2"/>';
  html += '<rect x="' + (startX - postWidth) + '" y="' + baseY + '" width="' + postWidth + '" height="' + railHeight + '" rx="3" fill="#111827"/>';
  html += '<rect x="' + (startX + visualWidth) + '" y="' + baseY + '" width="' + postWidth + '" height="' + railHeight + '" rx="3" fill="#111827"/>';

  var x = startX + gapPx;
  for (var i = 0; i < barCount; i++) {
    html += '<rect x="' + x + '" y="' + (baseY + 8) + '" width="' + barPx + '" height="' + (railHeight - 16) + '" rx="3" fill="#f97316"/>';
    x += barPx + gapPx;
  }

  html += '<line x1="' + startX + '" y1="190" x2="' + (startX + visualWidth) + '" y2="190" stroke="#f97316" stroke-width="1.5"/>';
  html += '<path d="M' + startX + ' 190 l8 -5 v10z" fill="#f97316"/>';
  html += '<path d="M' + (startX + visualWidth) + ' 190 l-8 -5 v10z" fill="#f97316"/>';
  html += '<text x="' + (startX + visualWidth / 2) + '" y="184" text-anchor="middle" fill="#111827" font-size="18" font-family="Arial, Helvetica, sans-serif">' + Math.round(totalLength) + ' mm entre poteaux</text>';
  html += '<text x="' + (startX + visualWidth / 2) + '" y="36" text-anchor="middle" fill="#475467" font-size="15" font-family="Arial, Helvetica, sans-serif">Espacement réel : ' + formatRailingMm(spacing) + ' / max ' + formatRailingMm(maxSpace) + '</text>';
  html += '</svg>';
  return html;
}

function buildRailingPositions(barCount, barWidth, spacing) {
  var positions = [];
  var centerDistance = barWidth + spacing;

  for (var i = 1; i <= barCount; i++) {
    var start = spacing + (i - 1) * centerDistance;
    var axis = start + barWidth / 2;
    var end = start + barWidth;

    positions.push({
      index: i,
      start: start,
      axis: axis,
      end: end
    });
  }

  return positions;
}

function buildRailingPositionsHtml(positions) {
  var rows = positions.map(function(pos) {
    return '<tr>' +
      '<td>Barreau ' + pos.index + '</td>' +
      '<td>' + formatRailingMm(pos.start) + '</td>' +
      '<td>' + formatRailingMm(pos.axis) + '</td>' +
      '<td>' + formatRailingMm(pos.end) + '</td>' +
    '</tr>';
  }).join('');

  var cards = positions.map(function(pos) {
    return '<article class="barreaudage-position-card">' +
      '<strong>Barreau ' + pos.index + '</strong>' +
      '<div><span>Début depuis poteau</span><b>' + formatRailingMm(pos.start) + '</b></div>' +
      '<div><span>Axe / entraxe</span><b>' + formatRailingMm(pos.axis) + '</b></div>' +
      '<div><span>Fin depuis poteau</span><b>' + formatRailingMm(pos.end) + '</b></div>' +
    '</article>';
  }).join('');

  return '<div class="barreaudage-positions">' +
    '<h3>Positions des barreaux</h3>' +
    '<div class="barreaudage-table-wrap">' +
      '<table class="barreaudage-positions-table">' +
        '<thead><tr><th>Barreau n°</th><th>Début depuis poteau</th><th>Axe / entraxe</th><th>Fin depuis poteau</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="barreaudage-position-cards">' + cards + '</div>' +
  '</div>';
}

function calculateBarreaudage() {
  var totalLength = getRailingNumber('railing-total-length');
  var barWidth = getRailingNumber('railing-bar-width');
  var maxSpace = getRailingNumber('railing-max-space');
  var manualCountRaw = String(document.getElementById('railing-bar-count').value || '').trim();
  var manualCount = manualCountRaw ? Number(manualCountRaw.replace(',', '.')) : 0;

  if (!totalLength || totalLength <= 0 || !barWidth || barWidth <= 0 || !maxSpace || maxSpace <= 0) {
    alert('Renseigne une longueur, une largeur de barreau et un espacement maximum valides.');
    return;
  }

  var barCount = manualCount > 0 ? Math.floor(manualCount) : findMinimumBars(totalLength, barWidth, maxSpace);
  var spaces = barCount + 1;
  var occupied = barCount * barWidth;
  var spacing = (totalLength - occupied) / spaces;
  var centerDistance = barWidth + spacing;
  var positions = buildRailingPositions(barCount, barWidth, spacing);
  var isValid = spacing >= 0 && spacing <= maxSpace;
  var result = document.getElementById('railing-result');
  var statusClass = isValid ? 'ok' : 'warning';
  var statusText = isValid ? 'OK' : 'Attention';
  var detail = isValid
    ? 'L\\'espacement réel ne dépasse pas le maximum autorisé.'
    : 'L\\'espacement dépasse la limite ou les barreaux sont trop larges pour la longueur saisie.';

  result.innerHTML =
    '<div class="barreaudage-summary">' +
      '<div class="barreaudage-status ' + statusClass + '">' + statusText + '</div>' +
      '<div><span>Nombre de barreaux</span><strong>' + barCount + '</strong></div>' +
      '<div><span>Nombre d\\'espaces</span><strong>' + spaces + '</strong></div>' +
      '<div><span>Espacement réel</span><strong>' + formatRailingMm(spacing) + '</strong></div>' +
      '<div><span>Entraxe barreaux</span><strong>' + formatRailingMm(centerDistance) + '</strong></div>' +
      '<div><span>Longueur occupée</span><strong>' + formatRailingMm(occupied) + '</strong></div>' +
    '</div>' +
    '<p class="barreaudage-note">' + detail + '</p>' +
    '<div class="barreaudage-diagram">' + buildRailingDiagram(totalLength, barWidth, barCount, spacing, maxSpace) + '</div>' +
    buildRailingPositionsHtml(positions);
}

function resetBarreaudage() {
  document.getElementById('railing-total-length').value = 1500;
  document.getElementById('railing-bar-width').value = 20;
  document.getElementById('railing-max-space').value = 110;
  document.getElementById('railing-bar-count').value = '';
  document.getElementById('railing-result').innerHTML = '';
}
</script>
    `)
  );
});


/* ===================== Logitôle ===================== */
app.get('/outils/logitole', requireLogin, (req, res) => {
  res.send(
    pageTemplate(req, 'Logitôle', `
      <section class="panel workshop-calc-panel logitole-page">
  <div class="panel-header app-dark-tool-head">
    ${clientPageIcon('logitole', 'clients-title-icon')}
    <div>
      <h2>Calculateur de tôles</h2>
      <span>Optimisation de découpe</span>
    </div>
  </div>

  <div class="sheet-calc">

    <div class="workshop-param-grid sheet-param-grid">
    <div class="sheet-row workshop-field">
      <label>Largeur tôle</label>
      <input id="sheet-width" type="number" value="3000">
    </div>

    <div class="sheet-row workshop-field">
      <label>Hauteur tôle</label>
      <input id="sheet-height" type="number" value="1500">
    </div>

    <div class="sheet-row workshop-field">
      <label>Jeu / perte</label>
      <input id="sheet-gap" type="number" value="3">
    </div>
    </div>

    <h4 class="workshop-section-title">Pièces à découper</h4>

    <table class="workshop-pieces-table logitole-pieces-table">
      <thead>
        <tr>
          <th>Largeur</th>
          <th>Hauteur</th>
          <th>Qté</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="sheet-cuts-body">
        <tr>
          <td data-label="Largeur"><input type="number" value="500"></td>
          <td data-label="Hauteur"><input type="number" value="300"></td>
          <td data-label="Qté"><input type="number" value="1"></td>
          <td data-label=""><button type="button" class="workshop-delete-btn" aria-label="Supprimer la pièce" onclick="removeSheetRow(this)">×</button></td>
        </tr>
      </tbody>
    </table>

    <div class="workshop-actions">
      <button type="button" class="btn workshop-add-btn" onclick="addSheetRow()">+ Ajouter une pièce</button>
      <button type="button" class="btn primary workshop-calc-btn" onclick="calculateSheets()">Calculer</button>
      <button type="button" class="btn secondary workshop-print-btn" onclick="printSheets()">Imprimer</button>
    </div>

    <div id="sheet-result" class="workshop-result sheet-result"></div>

    <canvas id="sheet-canvas" class="workshop-sheet-canvas" width="900" height="500"
      style="border:1px solid #ccc; margin-top:12px;"></canvas>

  </div>
</section>

<script>
/* ======================
   AJOUT / SUPPRESSION
====================== */
function addSheetRow() {
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td data-label="Largeur"><input type="number" value="100"></td>' +
    '<td data-label="Hauteur"><input type="number" value="100"></td>' +
    '<td data-label="Qté"><input type="number" value="1"></td>' +
    '<td data-label=""><button type="button" class="workshop-delete-btn" aria-label="Supprimer la pièce" onclick="removeSheetRow(this)">×</button></td>';
  document.getElementById('sheet-cuts-body').appendChild(tr);
}

function removeSheetRow(btn) {
  btn.closest('tr').remove();
}

/* ======================
   CALCUL DES TÔLES
====================== */
function calculateSheets() {
  var W = Number(document.getElementById('sheet-width').value);
  var H = Number(document.getElementById('sheet-height').value);
  var gap = Number(document.getElementById('sheet-gap').value);

  var pieces = [];

  document.querySelectorAll('#sheet-cuts-body tr').forEach(function(tr) {
    var w = Number(tr.children[0].querySelector('input').value);
    var h = Number(tr.children[1].querySelector('input').value);
    var q = Number(tr.children[2].querySelector('input').value);

    for (var i = 0; i < q; i++) {
      pieces.push({ w: w + gap, h: h + gap });
    }
  });

  if (pieces.length === 0) {
    alert('Aucune pièce');
    return;
  }

  pieces.sort(function(a, b) {
    return Math.max(b.w, b.h) - Math.max(a.w, a.h);
  });

  var sheets = [];

  pieces.forEach(function(p) {
    var placed = false;

    sheets.forEach(function(sheet) {
      sheet.rows.forEach(function(row) {
        if (!placed && row.remaining >= p.w) {
          row.items.push(p);
          row.remaining -= p.w;
          placed = true;
        }
      });

      if (!placed && sheet.remaining >= p.h) {
        sheet.rows.push({
          remaining: W - p.w,
          items: [p],
          height: p.h
        });
        sheet.remaining -= p.h;
        placed = true;
      }
    });

    if (!placed) {
      sheets.push({
        remaining: H - p.h,
        rows: [{
          remaining: W - p.w,
          items: [p],
          height: p.h
        }]
      });
    }
  });

  var html = '<h4>' + sheets.length + ' tôle(s) nécessaire(s)</h4>';

  sheets.forEach(function(sheet, i) {
    html += '<div class="sheet-box"><strong>Tôle ' + (i + 1) + '</strong><br>';
    sheet.rows.forEach(function(row, j) {
      html += 'Bande ' + (j + 1) + ' : ';
      html += row.items.map(function(p) {
        return (p.w - gap) + '×' + (p.h - gap);
      }).join(' | ');
      html += '<br>';
    });
    html += '</div>';
  });

  document.getElementById('sheet-result').innerHTML = html;
  drawSheets(sheets, W, H, gap);
}

/* ======================
   DESSIN DES TÔLES
====================== */
function drawSheets(sheets, W, H, gap) {
  var canvas = document.getElementById('sheet-canvas');
  var ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  var margin = 20;
  var scale = Math.min(
    (canvas.width - margin * 2) / W,
    (canvas.height - margin * 2) / (H * sheets.length)
  );

  var offsetY = margin;

  sheets.forEach(function(sheet, i) {
    ctx.strokeRect(margin, offsetY, W * scale, H * scale);
    ctx.fillText('Tôle ' + (i + 1), margin, offsetY - 5);

    var y = offsetY;

    sheet.rows.forEach(function(row) {
      var x = margin;
      row.items.forEach(function(p) {
        var pw = (p.w - gap) * scale;
        var ph = (p.h - gap) * scale;

        ctx.fillStyle = '#cfe8ff';
        ctx.fillRect(x, y, pw, ph);
        ctx.strokeRect(x, y, pw, ph);

        ctx.fillStyle = '#000';
        ctx.fillText((p.w - gap) + '×' + (p.h - gap), x + 3, y + 12);

        x += pw;
      });
      y += row.height * scale;
    });

    offsetY += H * scale + margin;
  });
}

/* ======================
   IMPRESSION
====================== */
function printSheets() {
  var content = document.getElementById('sheet-result').innerHTML;
  if (!content) {
    alert('Rien à imprimer');
    return;
  }

  var win = window.open('', '', 'width=900,height=650');
  win.document.write('<h2>Plan de découpe tôles</h2>' + content);
  win.document.close();
  win.print();
}
</script>

    `)
  );
});




/* ===================== ERREURS ===================== */

process.on('uncaughtException', (err) => console.error('❌ uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('❌ unhandledRejection:', err));

app.use((err, req, res, next) => {
  console.error('❌ Express error:', err);
  res.status(500).send('Erreur serveur (voir console).');
});
/* ===================== TÂCHES ===================== */

// ➕ Ajouter une tâche
app.post('/tasks', requireLogin, (req, res) => {
  const title = String(req.body.title || '').trim();
  const status = String(req.body.status || 'À faire').trim();

  if (!title) {
    return res.redirect('/tasks');
  }

  db.prepare(`
    INSERT INTO tasks (title, status, created_at)
    VALUES (?, ?, ?)
  `).run(title, status, new Date().toISOString());

  res.redirect('/tasks');
});

// ✔️ Terminer une tâche
app.post('/tasks/done', requireLogin, (req, res) => {
  const id = req.body.id;

  db.prepare(`
    UPDATE tasks
    SET status = 'Terminée'
    WHERE id = ?
  `).run(id);

  res.redirect('/tasks');
});

// 🗑️ Supprimer une tâche
app.post('/tasks/delete', requireLogin, (req, res) => {
  const id = req.body.id;

  db.prepare(`
    DELETE FROM tasks
    WHERE id = ?
  `).run(id);

  res.redirect('/tasks');
});
/* ===================== COMMANDES FOURNISSEURS ===================== */

// ✔️ Terminer / réceptionner une commande fournisseur
app.post('/orders/suppliers/done', requireLogin, (req, res) => {
  const id = req.body.id;

  db.prepare(`
    UPDATE supplier_orders
    SET status = 'Terminée'
    WHERE id = ?
  `).run(id);

  res.redirect('/orders/suppliers');
});

// 🗑️ Supprimer une commande fournisseur
app.post('/orders/suppliers/delete', requireLogin, (req, res) => {
  const id = req.body.id;

  db.prepare(`
    DELETE FROM supplier_orders
    WHERE id = ?
  `).run(id);

  res.redirect('/orders/suppliers');
});
app.post('/agenda/add', requireLogin, (req, res) => {
  const { title, type, start_date, end_date } = req.body;

  db.prepare(`
    INSERT INTO events (title, type, start_date, end_date, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    title,
    type || 'rdv',
    start_date,
    end_date,
    new Date().toISOString()
  );

  res.json({ success: true });
});
app.post('/agenda/update', requireLogin, (req, res) => {
  const { id, title, type, start_date, end_date } = req.body;

  db.prepare(`
    UPDATE events
    SET title = ?, type = ?, start_date = ?, end_date = ?
    WHERE id = ?
  `).run(title, type, start_date, end_date, id);

  res.json({ success: true });
});
app.post('/agenda/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.body.id);
  res.json({ success: true });
});

/* ===================== START ===================== */

app.listen(PORT, HOST, () => {
  console.log(`Serveur démarré sur ${HOST}:${PORT}`);
});
