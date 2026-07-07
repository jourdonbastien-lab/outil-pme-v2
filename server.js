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

    const dir = path.join(
      QUOTE_PHOTO_DIR,
      String(req.params.id)
    );

    fs.mkdirSync(dir, { recursive: true });

    cb(null, dir);
  },

  filename(req, file, cb) {

    cb(
      null,
      Date.now() + '-' + file.originalname
    );

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
      <div class="login-logo">A2 METAL</div>
      ${body}
    </div>
  </div>
</body>
</html>
`;
}

function renderMfaEmailPage(error = '') {
  return renderAuthPage({
    title: 'Vérification e-mail',
    body: `
      <h1>Vérification e-mail</h1>
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
        <button type="submit" class="btn-secondary">Annuler</button>
      </form>
    `
  });
}

function renderMfaCodePage(error = '') {
  return renderAuthPage({
    title: 'Code de vérification',
    body: `
      <h1>Code de vérification</h1>
      <p class="login-help">Entrez le code à 6 chiffres reçu par e-mail.</p>
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
        <button type="submit">Valider</button>
      </form>
      <form method="POST" action="/login/email" class="login-secondary-form">
        <button type="submit" class="btn-secondary">Renvoyer un code</button>
      </form>
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

function chantierProgress(doneHours, plannedHours) {
  const planned = Number(plannedHours || 0);
  const done = Number(doneHours || 0);
  if (planned <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / planned) * 100)));
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
        { href: '/dashboard', icon: '🏠', label: 'Accueil', active: isActivePath('/dashboard') },
        { href: '/orders/clients', icon: '📦', label: 'Commandes', active: isActivePath('/orders/clients*') },
        { action: 'new', icon: '+', label: 'Nouveau', primary: true },
        { href: '/outils/prises-cotes', icon: '📋', label: 'Cotes', active: isActivePath('/outils/prises-cotes*') },
        { action: 'more', icon: '⋯', label: 'Plus' }
      ]
    : [
        { href: '/dashboard', icon: '🏠', label: 'Accueil', active: isActivePath('/dashboard') },
        { href: '/clients', icon: '👥', label: 'Clients', active: isActivePath('/clients*') },
        { action: 'new', icon: '+', label: 'Nouveau', primary: true },
        { href: '/agenda', icon: '📅', label: 'Agenda', active: isActivePath('/agenda') },
        { action: 'more', icon: '⋯', label: 'Plus' }
      ];
  const mobileNewLinks = isAtelier
    ? [
        { href: '/outils/prises-cotes', label: 'Nouvelle prise de cote' }
      ]
    : [
        { href: '/clients', label: 'Nouveau client' },
        { href: '/devis/new', label: 'Nouveau devis' },
        { href: '/orders/clients', label: 'Nouvelle commande / chantier' },
        { href: '/outils/prises-cotes', label: 'Nouvelle prise de cote' }
      ];
  const mobileMoreLinks = isAtelier
    ? [
        { href: '/orders/clients', label: 'Commandes clients' },
        { href: '/orders/suppliers', label: 'Commandes fournisseurs' },
        { href: '/outils/prises-cotes', label: 'Prises de cotes' },
        { href: '/outils/logibarre', label: 'LogiBarre' },
        { href: '/outils/logitole', label: 'LogiTôle' },
        { href: '/logout', label: 'Déconnexion' }
      ]
    : [
        { href: '/devis', label: 'Devis' },
        { href: '/orders/clients', label: 'Commandes clients' },
        { href: '/orders/suppliers', label: 'Commandes fournisseurs' },
        { href: '/outils/prises-cotes', label: 'Prises de cotes' },
        { href: '/materials', label: 'Bibliothèque matière' },
        { href: '/outils/logibarre', label: 'LogiBarre' },
        { href: '/outils/logitole', label: 'LogiTôle' },
        { href: '/logout', label: 'Déconnexion' }
      ];
  const renderBottomItem = (item) => {
    if (item.href) {
      return `<a class="mobile-bottom-item${item.active ? ' active' : ''}" href="${item.href}"><span>${item.icon}</span><small>${escHtml(item.label)}</small></a>`;
    }
    return `<button class="mobile-bottom-item${item.primary ? ' mobile-bottom-primary' : ''}" type="button" data-mobile-sheet="${item.action}" aria-expanded="false"><span>${item.icon}</span><small>${escHtml(item.label)}</small></button>`;
  };
  const renderSheetLinks = (links) => links.map((link) => `<a href="${link.href}">${escHtml(link.label)}</a>`).join('');

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
     📦 Commandes clients
  </a>

  <a href="/orders/suppliers"
     class="${req.path.startsWith('/orders/suppliers') ? 'active' : ''}">
     📑 Commandes fournisseurs
  </a>

  <a href="/outils/logibarre">
     📏 Logibarre
  </a>

  <a href="/outils/logitole">
     📐 Logitôle
  </a>

    <a href="/outils/prises-cotes"
      class="${req.path.startsWith('/outils/prises-cotes') ? 'active' : ''}">
      📋 Prises de cotes
    </a>

      <a href="/dashboard"
        class="${req.path === '/dashboard' ? 'active' : ''}">
        Dashboard
      </a>

` : `

  <a href="/dashboard"
     class="${req.path === '/dashboard' ? 'active' : ''}">
     📊 Dashboard
  </a>

  <a href="/tasks"
     class="${req.path === '/tasks' ? 'active' : ''}">
     ✅ Tâches
     ${stats.tasksTodo > 0 ? `<span class="nav-badge">${stats.tasksTodo}</span>` : ''}
  </a>

  <a href="/clients"
     class="${req.path.startsWith('/clients') ? 'active' : ''}">
     👤 Clients
  </a>

  <a href="/agenda"
     class="${req.path === '/agenda' ? 'active' : ''}">
     📅 Agenda
  </a>

  <a href="/orders/clients"
     class="${req.path.startsWith('/orders/clients') ? 'active' : ''}">
     📦 Commandes clients
  </a>

  <a href="/orders/suppliers"
     class="${req.path.startsWith('/orders/suppliers') ? 'active' : ''}">
     📑 Commandes fournisseurs
  </a>

  <a href="/devis"
     class="${req.path.startsWith('/devis') ? 'active' : ''}">
     🧾 Devis
  </a>

  <a href="/materials"
     class="${req.path.startsWith('/materials') ? 'active' : ''}">
     🧱 Bibliothèque matière
  </a>

  <a href="/outils/logibarre">
     📏 Logibarre
  </a>

  <a href="/outils/logitole">
     📐 Logitôle
  </a>

    <a href="/outils/prises-cotes"
      class="${req.path.startsWith('/outils/prises-cotes') ? 'active' : ''}">
      📋 Prises de cotes
    </a>

`}

<a href="/logout" class="logout">
  🚪 Déconnexion
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

app.get('/dashboard', requireLogin, (req, res) => {
  const todayIso = isoDate();
  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const openTasks = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'Terminée'").get().c;
  const eventsToday = db
    .prepare("SELECT COUNT(*) AS c FROM events WHERE start_date LIKE ?")
    .get(`${todayIso}%`).c;
  const clientsCount = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
  const openClientOrders = db.prepare("SELECT COUNT(*) AS c FROM client_orders WHERE status != 'Terminée'").get().c;
  const openSupplierOrders = db
    .prepare("SELECT COUNT(*) AS c FROM supplier_orders WHERE status IS NULL OR TRIM(status) = '' OR status != 'Terminée'")
    .get().c;
  const quotesCount = db.prepare('SELECT COUNT(*) AS c FROM quotes').get().c;
  const activeOrderChantiers = db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM client_orders
      WHERE status != 'Terminée'
      AND COALESCE(chantier_status, 'À préparer') NOT IN ('Terminé', 'Facturé')
    `)
    .get().c;

  const priorityTasks = db
    .prepare(`
      SELECT title, status, created_at
      FROM tasks
      WHERE status != 'Terminée'
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `)
    .all();

  const todayEvents = db
    .prepare(`
      SELECT title, start_date, end_date, type
      FROM events
      WHERE start_date LIKE ?
      ORDER BY datetime(start_date) ASC
      LIMIT 8
    `)
    .all(`${todayIso}%`);

  const openOrders = db
    .prepare(`
      SELECT id, name, description, date, status
      FROM client_orders
      WHERE status != 'Terminée'
      ORDER BY date DESC, id DESC
      LIMIT 6
    `)
    .all();

  const todayStats = [
    { label: 'Tâches à faire', value: openTasks },
    { label: 'Événements du jour', value: eventsToday },
    { label: 'Cmd clients en cours', value: openClientOrders },
    { label: 'Cmd fournisseurs en cours', value: openSupplierOrders },
  ]
    .map(
      (item) => `
      <article class="dash-today-stat">
        <span>${escHtml(item.label)}</span>
        <strong>${item.value}</strong>
      </article>
    `
    )
    .join('');

  const quickCardsData = [
    { icon: '✓', label: 'Tâches en cours', value: openTasks, href: '/tasks' },
    { icon: 'A', label: 'Agenda aujourd’hui', value: eventsToday, href: '/agenda' },
    { icon: 'C', label: 'Clients', value: clientsCount, href: '/clients' },
    { icon: 'CC', label: 'Commandes / chantiers en cours', value: activeOrderChantiers, href: '/orders/clients' },
    { icon: 'CF', label: 'Commandes fournisseurs', value: openSupplierOrders, href: '/orders/suppliers' },
    { icon: 'D', label: 'Devis', value: quotesCount, href: '/devis' },
  ];
  const quickCards = quickCardsData
    .map(
      (card) => `
      <a class="dash-quick-card" href="${card.href}">
        <span class="dash-quick-icon">${escHtml(card.icon)}</span>
        <span class="dash-quick-body">
          <span>${escHtml(card.label)}</span>
          <strong>${card.value}</strong>
        </span>
        <span class="dash-quick-open">Voir</span>
      </a>
    `
    )
    .join('');

  const priorityTasksHtml = priorityTasks.length
    ? priorityTasks
        .map(
          (t) => `
      <li class="dash-list-item">
        <span>
          <strong>${escHtml(t.title || 'Sans titre')}</strong>
          <small>${escHtml(t.status || 'À faire')}</small>
        </span>
        <a class="dash-mini-link" href="/tasks">Ouvrir</a>
      </li>
    `
        )
        .join('')
    : '<li class="dash-empty">Aucune tâche prioritaire</li>';

  const todayEventsHtml = todayEvents.length
    ? todayEvents
        .map((e) => {
          const hour = String(e.start_date || '').slice(11, 16);
          const endHour = String(e.end_date || '').slice(11, 16);
          return `
      <li class="dash-list-item">
        <span>
          <strong>${escHtml(e.title || 'Événement')}</strong>
          <small>${escHtml(e.type || 'rdv')}${hour ? ' · ' + escHtml(hour) : ''}${endHour ? ' - ' + escHtml(endHour) : ''}</small>
        </span>
        <a class="dash-mini-link" href="/agenda">Voir</a>
      </li>
    `;
        })
        .join('')
    : '<li class="dash-empty">Aucun événement aujourd’hui</li>';

  const openOrdersHtml = openOrders.length
    ? openOrders
        .map((o) => {
          const safeClientFolder = safeName(o.name || 'Client');
          const orderFolderName = safeName(
            o.description && o.description.trim() !== ''
              ? o.description
              : `Commande_${o.id}`
          );
          const clientFolderUrl = `/pc-folders/${encodeURIComponent(
            safeClientFolder
          )}/${encodeURIComponent(orderFolderName)}`;

          const day = String(o.date || '').slice(0, 10) || '—';
          const status = o.status || 'En cours';
          return `
      <article class="dash-order-card">
        <a class="dash-order-link" href="${clientFolderUrl}" aria-label="Ouvrir la commande"></a>
        <header>
          <div>
            <strong>${escHtml(o.name || 'Client')}</strong>
            <p>${escHtml(o.description || 'Commande')}</p>
          </div>
          <span>#${o.id}</span>
        </header>
        <div class="dash-order-meta">
          <span>${escHtml(day)}</span>
          <span>${escHtml(status)}</span>
        </div>
        <span class="dash-card-button">Ouvrir</span>
      </article>
    `;
        })
        .join('')
    : '<p class="dash-empty">Aucune commande client en cours</p>';

  res.send(
    dashboardTemplate(
      req,
      `
      <div class="dash-shell">
        <section class="dash-today">
          <div>
            <h1>${escHtml(todayLabel)}</h1>
            <a class="dash-prototype-link" href="/dashboard-prototype">Tester le dashboard prototype</a>
          </div>
          <div class="dash-today-grid">
            ${todayStats}
          </div>
        </section>

        <section class="dash-quick-grid" aria-label="Accès rapides">
          ${quickCards}
        </section>

        <section class="dash-main-grid">
          <article class="dash-panel">
            <div class="dash-panel-head">
              <h2>À faire en priorité</h2>
              <a href="/tasks">Voir</a>
            </div>
            <ul class="dash-list">
              ${priorityTasksHtml}
            </ul>
          </article>

          <article class="dash-panel">
            <div class="dash-panel-head">
              <h2>Planning du jour</h2>
              <a href="/agenda">Ouvrir</a>
            </div>
            <ul class="dash-list">
              ${todayEventsHtml}
            </ul>
          </article>

          <article class="dash-panel dash-panel-wide">
            <div class="dash-panel-head">
              <h2>Commandes en cours</h2>
              <a href="/orders/clients">Voir tout</a>
            </div>
            <div class="dash-orders-grid">
              ${openOrdersHtml}
            </div>
          </article>
        </section>
      </div>
      `
    )
  );
});

app.get('/dashboard-prototype', requireLogin, (req, res) => {
  const todayIso = isoDate();
  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const userName = req.session?.user?.username || 'Utilisateur';

  const openTasks = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'Terminée'").get().c;
  const openClientOrders = db.prepare("SELECT COUNT(*) AS c FROM client_orders WHERE status != 'Terminée'").get().c;
  const remainingHours = db
    .prepare(`
      SELECT COALESCE(SUM(
        CASE
          WHEN COALESCE(planned_hours, 0) > COALESCE(done_hours, 0)
          THEN COALESCE(planned_hours, 0) - COALESCE(done_hours, 0)
          ELSE 0
        END
      ), 0) AS total
      FROM client_orders
      WHERE status != 'Terminée'
    `)
    .get().total;
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

  const priorityTasks = db
    .prepare(`
      SELECT title, status, created_at
      FROM tasks
      WHERE status != 'Terminée'
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `)
    .all();

  const overdueOrders = db
    .prepare(`
      SELECT id, name, description, chantier_end_date, status, chantier_status
      FROM client_orders
      WHERE status != 'Terminée'
        AND chantier_end_date IS NOT NULL
        AND TRIM(chantier_end_date) != ''
        AND chantier_end_date < ?
      ORDER BY chantier_end_date ASC, id DESC
      LIMIT 5
    `)
    .all(todayIso);

  const todayEvents = db
    .prepare(`
      SELECT title, start_date, end_date, type
      FROM events
      WHERE start_date LIKE ?
      ORDER BY datetime(start_date) ASC
      LIMIT 6
    `)
    .all(`${todayIso}%`);

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

  const kpis = [
    { icon: 'C', label: 'Commandes en cours', value: openClientOrders, href: '/orders/clients' },
    { icon: 'H', label: 'Heures prévues restantes', value: formatHours(remainingHours), href: '/orders/clients' },
    { icon: 'D', label: 'Devis à suivre', value: quotesToFollowCount, href: '/devis' },
    { icon: 'F', label: 'Fournisseurs en attente', value: waitingSupplierOrders, href: '/orders/suppliers' },
  ]
    .map(
      (item) => `
      <a class="prototype-kpi-card" href="${item.href}">
        <span class="prototype-kpi-icon">${escHtml(item.icon)}</span>
        <span class="prototype-kpi-body">
          <strong>${escHtml(item.value)}</strong>
          <small>${escHtml(item.label)}</small>
          <em>Voir ›</em>
        </span>
      </a>
    `
    )
    .join('');

  const todaySummary = [
    { icon: 'P', label: 'Planning du jour', value: todayEvents.length },
    { icon: 'T', label: 'Tâches ouvertes', value: openTasks },
    { icon: 'R', label: 'En retard', value: overdueOrders.length },
  ]
    .map(
      (item) => `
      <article class="prototype-today-stat">
        <span>${escHtml(item.icon)}</span>
        <strong>${escHtml(item.label)}</strong>
        <small>${escHtml(item.value)}</small>
      </article>
    `
    )
    .join('');

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
            <span class="prototype-kicker">Dashboard prototype</span>
            <h1>Bonjour ${escHtml(userName)}</h1>
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

          <article class="prototype-panel prototype-today-panel">
            <div class="prototype-panel-head">
              <h2>À faire aujourd’hui</h2>
            </div>
            <div class="prototype-today-grid">
              ${todaySummary}
            </div>
          </article>
        </section>
      </div>
      `
    )
  );
});

app.get('/dashboard/prototype', requireLogin, (req, res) => {
  res.redirect('/dashboard-prototype');
});


/* ===================== KS ===================== */

app.get('/tasks', requireLogin, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM tasks ORDER BY created_at DESC, id DESC')
    .all()
    .map(t => `
      <tr>
        <td>${escHtml(t.title)}</td>
        <td>${escHtml(t.status)}</td>
        <td>
          ${
            t.status !== 'Terminée'
              ? `
                <form method="POST" action="/tasks/done">
                  <input type="hidden" name="id" value="${t.id}" />
                  <button class="btn">Terminer</button>
                </form>`
              : `
                <form method="POST" action="/tasks/delete"
                      onsubmit="return confirm('Supprimer cette tâche ?');">
                  <input type="hidden" name="id" value="${t.id}" />
                  <button class="btn danger">Supprimer</button>
                </form>`
          }
        </td>
      </tr>
    `)
    .join('');

  res.send(
    pageTemplate(
      req,
      'Tâches',
      `
      <div class="tasks-page">

        <!-- FORMULAIRE EN HAUT -->
        <form method="POST" action="/tasks" class="tasks-form">
          <input name="title" placeholder="Nouvelle tâche" required />
          <select name="status">
            <option>À faire</option>
            <option>En cours</option>
            <option>Terminée</option>
          </select>
          <button class="btn primary">Ajouter</button>
        </form>

        <!-- LISTE DES TÂCHES -->
      <div class="tasks-cards">
  ${
    db.prepare('SELECT * FROM tasks ORDER BY created_at DESC, id DESC')
      .all()
      .map(t => `
        <div class="task-card">

          <div class="task-card-title">
            ${escHtml(t.title)}
          </div>

          <div class="task-card-status">
            ${escHtml(t.status)}
          </div>

  <div class="task-card-actions">

  ${
    t.status !== 'Terminée'
      ? `
      <form method="POST" action="/tasks/done">
        <input type="hidden" name="id" value="${t.id}" />
        <button class="btn primary">
          ✅ Terminer
        </button>
      </form>
      `
      : `
      ${
        Number(t.to_invoice || 0) === 1
          ? `
          <div class="task-badge-invoice">
            💰 À facturer
          </div>
          `
          : `
          <form method="POST"
                action="/tasks/to-invoice">
            <input type="hidden" name="id" value="${t.id}" />
            <button class="btn warning">
              📄 À facturer
            </button>
          </form>
          `
      }

      <form method="POST"
            action="/tasks/delete"
            onsubmit="return confirm('Supprimer cette tâche ?');">
        <input type="hidden" name="id" value="${t.id}" />
        <button class="btn danger">
          🗑️ Supprimer
        </button>
      </form>
      `
  }

</div>

        </div>
      `)
      .join('')
  }
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
      <div class="page-head agenda-page-head">
        <h1>${escHtml(pageTitle)}</h1>
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
      <div class="page-head">
        <h1>Prises de cotes</h1>
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
     href="/clients/${encodeURIComponent(c.folder)}">

    <div class="client-header">
      <div class="client-name">
        ${escHtml(c.name)}
      </div>

      <span class="client-source">
        ${c.source === 'pc' ? '📂 PC' : '🗄️ DB'}
      </span>
    </div>

    <div class="client-infos">

      ${c.city ? `
        <div>📍 ${escHtml(c.city)}</div>
      ` : ''}

      ${c.phone ? `
        <div>📞 ${escHtml(c.phone)}</div>
      ` : ''}

      ${c.email ? `
        <div>✉️ ${escHtml(c.email)}</div>
      ` : ''}

    </div>

  </a>

  ${c.source === 'db' ? `
  <form method="POST"
        action="/clients/delete"
        onsubmit="return confirm('Supprimer définitivement ce client ?');">

    <input type="hidden" name="id" value="${c.id}">

    <button class="client-delete-btn">
      🗑️
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
      <div class="page-head">
        <h1>Clients</h1>
      </div>

      <form method="POST" action="/clients" class="orders-form">
        <h2>Ajouter un client</h2>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Nom *</label>
            <input name="name" required placeholder="Nom du client" />
          </div>
          <div class="orders-form-field">
            <label>Email</label>
            <input name="email" type="email" placeholder="client@email.com" />
          </div>
        </div>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Adresse</label>
            <input name="address" placeholder="Adresse" />
          </div>
          <div class="orders-form-field">
            <label>Code postal</label>
            <input name="postal_code" placeholder="00000" />
          </div>
          <div class="orders-form-field">
            <label>Ville</label>
            <input name="city" placeholder="Ville" />
          </div>
        </div>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Téléphone</label>
            <input name="phone" placeholder="06…" />
          </div>

          <div class="orders-form-actions">
            <button type="submit">➕ Ajouter le client</button>
          </div>
        </div>
      </form>

      ${infoBar(
        `<div class="kpi"><div class="kpi-label">Clients</div><div class="kpi-value">${merged.length}</div></div>`,
        `<input id="clientSearch" class="search" placeholder="Rechercher un client…" autocomplete="off" />`
      )}

      <section class="cards-grid" id="clientsGrid">${cards}</section>

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
  const clientDir = path.join(CLIENT_PC_DIR, clientFolder);
  ensureDir(clientDir);

  // On tente de récupérer le client DB en comparant sur name normalisé
  const allClients = db.prepare('SELECT * FROM clients').all();
  const clientDb = allClients.find((c) => safeName(c.name) === clientFolder) || null;

  // Commandes DB du client (par name exact si possible)
  const orders = clientDb
    ? db.prepare('SELECT * FROM client_orders WHERE name = ? ORDER BY date DESC, id DESC').all(clientDb.name)
    : [];

  // Commandes PC
  let pcOrders = [];
  try {
    pcOrders = fs
      .readdirSync(clientDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  } catch {}

  const totalAmount = orders.filter((o) => o.status !== 'Terminée').reduce((sum, o) => sum + (o.price || 0), 0);

  const cards = pcOrders.length
    ? pcOrders
        .map(
          (orderName) => `
        <a class="card" href="/pc-folders/${encodeURIComponent(clientFolder)}/${encodeURIComponent(orderName)}">
          <div class="card-icon">📦</div>
          <div class="card-main">
            <div class="card-title">${escHtml(orderName)}</div>
            <div class="card-sub">Commande</div>
          </div>
          <div class="card-cta">Ouvrir</div>
        </a>
      `
        )
        .join('')
    : `<div class="empty-state">Aucune commande trouvée dans le dossier PC</div>`;

  res.send(
    pageTemplate(
      req,
      `Client : ${clientFolder}`,
      `
      <div class="page-head">
        <h1>${escHtml(clientFolder)}</h1>
      </div>

      ${infoBar(
        `
          <div class="kpi"><div class="kpi-label">Commandes PC</div><div class="kpi-value">${pcOrders.length}</div></div>
          <div class="kpi"><div class="kpi-label">Total commandes DB</div><div class="kpi-value">${totalAmount.toFixed(2)} €</div></div>
        `,
        `
          <a class="btn btn-primary" href="/orders/clients?client=${encodeURIComponent(clientFolder)}">➕ Nouvelle commande</a>
          <a class="btn btn-secondary" href="/clients">← Retour clients</a>
        `
      )}

      <h2>Commandes (dossiers PC)</h2>
      <section class="cards-grid">${cards}</section>
      `
    )
  );
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
  Number(o.done_hours || 0) || Number(realMinutes.total || 0) / 60;

const plannedHours =
  Number(o.planned_hours || 0);

const chantierStatus = normalizeChantierStatus(o.chantier_status);
const progress = o.chantier_progress
  ? Math.max(0, Math.min(100, Math.round(Number(o.chantier_progress || 0))))
  : chantierProgress(actualHours, plannedHours);

const statusDot =
  plannedHours > 0 && actualHours > plannedHours
    ? '🔴'
    : '🟢';
            return `
              <article class="order-card modern-order-card">
                <a class="order-card-link" href="${clientFolderUrl}" aria-label="Ouvrir le dossier"></a>

                <header class="order-card-header modern-order-card-header">
                  <div>
                    <div class="order-card-title">
                     <span class="order-card-client">
  ${!isAtelier ? statusDot + ' ' : ''}
  ${escHtml(o.name)}
</span>
                      <span class="order-card-id">#${o.id}</span>
                    </div>
                    <div class="order-card-meta modern-order-card-meta">
                      <span class="order-card-date">📅 ${escHtml(dateLabel || '—')}</span>
                      <span class="order-card-status badge">${escHtml(statusLabel)}</span>
                    </div>
                  </div>

                ${!isAtelier ? `
<div class="order-card-amount">
  <div class="order-card-amount-label">Montant</div>
  <div class="order-card-amount-value">${escHtml(priceLabel)}</div>
</div>
` : ''}
                </header>

	                <div class="order-card-body modern-order-card-body">
	                  <p class="order-card-description">${escHtml(o.description || '—')}</p>
                    <div class="chantier-hours-grid" style="margin-top:10px">
                      <div><span>Chantier</span><strong>${escHtml(chantierStatus)}</strong></div>
                      <div><span>Prévu</span><strong>${formatHours(plannedHours)}</strong></div>
                      <div><span>Réalisé</span><strong>${formatHours(actualHours)}</strong></div>
                      <div><span>Avancement</span><strong>${progress}%</strong></div>
                    </div>
	                </div>

                <form method="POST" action="/orders/client/done" onsubmit="return confirm('Terminer cette commande ?');" class="order-card-actions">
                  <input type="hidden" name="id" value="${o.id}" />
                  <button type="submit" class="icon-btn" title="Terminer">✔</button>
                </form>
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
      <div class="page-head">
        <h1>Commandes clients</h1>
      </div>

      <form method="POST" action="/orders/client" class="orders-form">
        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Client</label>
            <input list="pc-clients" name="name" placeholder="Nom du client (ou dossier PC)…" required value="${escHtml(preClient)}" />
          </div>

          <div class="orders-form-field">
            <label>Description</label>
            <input name="description" placeholder="Description rapide de la commande" />
          </div>
        </div>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Prix (€)</label>
            <input type="number" name="price" step="0.01" placeholder="0.00" />
          </div>

	          <div class="orders-form-field">
	            <label>Date</label>
	            <input type="date" name="date" />
	          </div>
	
	          <div class="orders-form-field">
	            <label>Statut chantier</label>
	            <select name="chantier_status">
	              ${chantierStatusOptions('À préparer')}
	            </select>
	          </div>
	
	          <div class="orders-form-field">
	            <label>Heures prévues</label>
	            <input type="number" name="planned_hours" min="0" step="0.25" placeholder="0" />
	          </div>
	
	          <div class="orders-form-actions">
	            <button type="submit">Ajouter la commande</button>
	          </div>
        </div>

        <datalist id="pc-clients">${pcFoldersOptions}</datalist>
      </form>

${infoBar(
  `
    <div class="kpi">
      <div class="kpi-label">Commandes</div>
      <div class="kpi-value">${orders.length}</div>
    </div>

    ${!isAtelier ? `
    <div class="kpi">
      <div class="kpi-label">Total en cours</div>
      <div class="kpi-value">${totalAmount.toFixed(2)} €</div>
    </div>
    ` : ''}
  `,
  `<a class="btn btn-secondary" href="/clients">← Voir clients</a>`
)}

      <section class="orders-cards-section modern-orders-section">
        <div class="orders-cards-grid modern-orders-grid">${cards}</div>
      </section>
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
        status,
        created_at
      )
	    VALUES (?, ?, ?, ?, ?, ?, 'En cours', ?)
	  `
	    )
	    .run(name, description || null, dateValue, price ? parseFloat(price) : 0, plannedHours, chantierStatus, new Date().toISOString());

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

  const rows =
    orders.length > 0
      ? orders.map(o => `
          <tr>
            <td>${escHtml(o.name)}</td>
            <td>${escHtml(o.description || '—')}</td>
            <td>${escHtml((o.date || '').slice(0, 10))}</td>
            <td>
              <form method="POST" action="/orders/supplier/delete"
                    onsubmit="return confirm('Supprimer cette commande ?');">
                <input type="hidden" name="id" value="${o.id}">
                <button>🗑️</button>
              </form>
            </td>
          </tr>
        `).join('')
      : `<tr><td colspan="4">Aucune commande fournisseur</td></tr>`;

  res.send(
    pageTemplate(req, 'Commandes fournisseurs', `
      <div class="page-head">
        <h1>Commandes fournisseurs</h1>
      </div>

      <form method="POST" action="/orders/supplier" class="orders-form">
        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Nom</label>
            <input name="name" required />
          </div>
          <div class="orders-form-field">
            <label>Description</label>
            <input name="description" />
          </div>
          <div class="orders-form-field">
            <label>Date</label>
            <input name="date" type="date" />
          </div>
          <div class="orders-form-actions">
            <button type="submit">Ajouter</button>
          </div>
        </div>
      </form>
<div class="supplier-cards">
  ${
    orders.length > 0
      ? orders.map(o => `
        <div class="supplier-card">

          <div class="supplier-title">
            ${escHtml(o.name)}
          </div>

          <div class="supplier-description">
            ${escHtml(o.description || 'Aucune description')}
          </div>

          <div class="supplier-date">
            📅 ${escHtml((o.date || '').slice(0, 10))}
          </div>

          <div class="supplier-actions">
            <form method="POST"
                  action="/orders/supplier/delete"
                  onsubmit="return confirm('Supprimer cette commande ?');">

              <input type="hidden" name="id" value="${o.id}">

              <button class="btn danger">
                🗑️ Supprimer
              </button>

            </form>
          </div>

        </div>
      `).join('')
      : '<div class="empty-state">Aucune commande fournisseur</div>'
  }
</div>
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
        <a class="card" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(orderName)}">
          <div class="card-icon">📦</div>
          <div class="card-main">
            <div class="card-title">${escHtml(orderName)}</div>
            <div class="card-sub">Commande</div>
          </div>
          <div class="card-cta">Ouvrir</div>
        </a>
      `
        )
        .join('')
    : `<div class="empty-state">Aucune commande trouvée.</div>`;

  const content = `
    <div class="page-head">
      <h1>${escHtml(client)}</h1>
    </div>

    ${infoBar(
      `<div class="kpi"><div class="kpi-label">Commandes</div><div class="kpi-value">${orders.length}</div></div>`,
      `<a class="btn btn-secondary" href="/clients/${encodeURIComponent(client)}">← Retour client</a>`
    )}

    ${gridCards(cards)}
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
      <a class="card" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}">
        <div class="card-icon">📂</div>
        <div class="card-main">
          <div class="card-title">${escHtml(type)}</div>
          <div class="card-sub">Dossier</div>
        </div>
        <div class="card-cta">Ouvrir</div>
      </a>
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

  const chantierSection = orderDb
    ? (() => {
        const logged = db.prepare(`
          SELECT COALESCE(SUM(minutes_total),0) AS total
          FROM chantier_hours
          WHERE client = ?
          AND order_name = ?
        `).get(orderDb.name, orderDb.description);
        const planned = Number(orderDb.planned_hours || 0);
        const done = Number(orderDb.done_hours || 0) || Number(logged.total || 0) / 60;
        const diff = done - planned;
        const progress = orderDb.chantier_progress
          ? Math.max(0, Math.min(100, Math.round(Number(orderDb.chantier_progress || 0))))
          : chantierProgress(done, planned);
        const status = normalizeChantierStatus(orderDb.chantier_status);
        return `
          <section class="panel-soft chantier-detail-panel">
            <h2>Suivi chantier</h2>
            <div class="chantier-hours-grid">
              <div><span>Statut</span><strong>${escHtml(status)}</strong></div>
              <div><span>Heures prévues</span><strong>${formatHours(planned)}</strong></div>
              <div><span>Heures réalisées</span><strong>${formatHours(done)}</strong></div>
              <div><span>Écart</span><strong class="${diff > 0 ? 'chantier-over' : ''}">${diff >= 0 ? '+' : ''}${formatHours(diff)}</strong></div>
              <div><span>Avancement</span><strong>${progress}%</strong></div>
              <div><span>Dates</span><strong>${escHtml(orderDb.chantier_start_date || '—')} → ${escHtml(orderDb.chantier_end_date || '—')}</strong></div>
            </div>
            <div class="chantier-progress" aria-label="Avancement ${progress}%">
              <span style="width:${progress}%"></span>
            </div>
            ${orderDb.chantier_notes ? `<p>${escHtml(orderDb.chantier_notes)}</p>` : ''}
            <form method="POST" action="/orders/client/${orderDb.id}/chantier" class="chantiers-form" style="margin-top:14px">
              <div class="chantiers-form-grid">
                <label><span>Statut</span><select name="chantier_status">${chantierStatusOptions(status)}</select></label>
                <label><span>Heures prévues</span><input name="planned_hours" type="number" min="0" step="0.25" value="${planned}" /></label>
                <label><span>Heures réalisées</span><input name="done_hours" type="number" min="0" step="0.25" value="${done}" /></label>
                <label><span>Avancement (%)</span><input name="chantier_progress" type="number" min="0" max="100" step="1" value="${progress}" /></label>
                <label><span>Date début</span><input name="chantier_start_date" type="date" value="${escHtml(orderDb.chantier_start_date || '')}" /></label>
                <label><span>Date fin prévue</span><input name="chantier_end_date" type="date" value="${escHtml(orderDb.chantier_end_date || '')}" /></label>
                <label class="chantiers-form-wide"><span>Notes chantier</span><textarea name="chantier_notes" rows="3">${escHtml(orderDb.chantier_notes || '')}</textarea></label>
              </div>
              <div class="chantiers-form-actions">
                <button class="btn btn-primary" type="submit">Enregistrer le suivi chantier</button>
              </div>
            </form>
          </section>
        `;
      })()
    : '';

  const content = `
    <div class="page-head">
      <h1>${escHtml(order)}</h1>
    </div>

    ${infoBar(
      `<div class="kpi"><div class="kpi-label">Dossiers</div><div class="kpi-value">${foldersToShow.length}</div></div>`,
      `
        <a class="btn btn-secondary" href="/clients/${encodeURIComponent(client)}">← Retour client</a>
        <a class="btn btn-primary" href="/pc-folders/${encodeURIComponent(client)}">← Retour commandes</a>
      `
    )}

	    ${gridCards(cards)}
	
	    ${chantierSection}
	
	    <section class="panel-soft measurement-linked-section">
      <h2>Prises de cotes liées</h2>
      ${renderMeasurementCards(linkedMeasurements)}
    </section>
  `;

  res.send(pageTemplate(req, `Commande : ${order}`, content));
});

app.post('/orders/client/:id/chantier', requireLogin, (req, res) => {
  const orderId = Number(req.params.id || 0);
  const existing = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
  if (!existing) return res.status(404).send('Commande introuvable');

  const chantierStatus = normalizeChantierStatus(req.body.chantier_status);
  const plannedHours = parsePositiveNumber(req.body.planned_hours);
  const doneHours = parsePositiveNumber(req.body.done_hours);
  const progressRaw = Number(req.body.chantier_progress || 0);
  const chantierProgressValue = Number.isFinite(progressRaw)
    ? Math.max(0, Math.min(100, progressRaw))
    : chantierProgress(doneHours, plannedHours);
  const startDate = String(req.body.chantier_start_date || '').trim() || null;
  const endDate = String(req.body.chantier_end_date || '').trim() || null;
  const notes = String(req.body.chantier_notes || '').trim() || null;

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
    <div class="files-grid">
      ${files.map(f => {

        const ext = path.extname(f).toLowerCase();

        let icon = '📄';

        if (ext === '.dxf') icon = '📐';
        else if (ext === '.pdf') icon = '📄';
        else if (['.jpg','.jpeg','.png','.webp'].includes(ext)) icon = '🖼️';

        return `
          <div class="file-card">

            <div class="file-icon">
              ${icon}
            </div>

            <div class="file-name">
              ${escHtml(f)}
            </div>

            <a
              class="btn btn-primary"
              href="/pc-file/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}/${encodeURIComponent(f)}"
              target="_blank">

              Ouvrir

            </a>

          </div>
        `;

      }).join('')}
    </div>
  `
  : `<div class="empty-state">Aucun fichier dans ce dossier.</div>`;
    

  const content = `
    <div class="page-head">
      <h1>${escHtml(type)}</h1>
    </div>

    <div class="panel-soft">
      <h2>Ajouter un fichier</h2>
      <form method="POST"
            action="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}/upload"
            enctype="multipart/form-data"
            class="upload-form">
        <input type="file" name="file" required />
        <button type="submit">Ajouter</button>
      </form>
    </div>

    <div class="panel-soft" style="margin-top:14px">
      <h2>Fichiers</h2>
      <div class="back-command-btn">
  <a
    class="btn btn-primary"
    href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}">
    ← Retour commande
  </a>
</div>
      ${list}
    </div>

    <div class="nav-actions" style="margin-top:14px">
      <a class="btn btn-secondary" href="/clients/${encodeURIComponent(client)}">← Client</a>
      <a class="btn btn-primary" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}">← Commande</a>
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
  width:50px;
  height:50px;
  border:none;
  border-radius:50%;
  background:#ff7a00;
  color:#fff;
  font-size:28px;
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
  <button class="close-btn" onclick="history.back()">✕</button>
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
      <table class="table-pro">
        <thead>
          <tr>
            <th>Date</th>
            <th>Début</th>
            <th>Fin</th>
            <th>Pause</th>
            <th>Total</th>
            <th>Note</th>
            <th style="width:72px"></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${escHtml(r.work_date)}</td>
              <td>${escHtml(r.start_time || '—')}</td>
              <td>${escHtml(r.end_time || '—')}</td>
              <td>${Number(r.break_minutes || 0)} min</td>
              <td><strong>${fmtMinutes(r.minutes_total || 0)}</strong></td>
              <td>${escHtml(r.note || '')}</td>
              <td style="text-align:right">
                <form method="POST" action="/chantier-hours/delete" onsubmit="return confirm('Supprimer cette ligne ?');" style="margin:0">
                  <input type="hidden" name="id" value="${r.id}">
                  <input type="hidden" name="client" value="${escHtml(client)}">
                  <input type="hidden" name="order" value="${escHtml(order)}">
                  <button class="icon-btn" title="Supprimer">🗑️</button>
                </form>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `
    : `<div class="empty-state">Aucune heure saisie pour ce chantier.</div>`;

  res.send(
    pageTemplate(
      req,
      `Heures chantier - ${order}`,
      `
      <div class="page-head">
        <h1>Heures chantier</h1>
      </div>

  ${infoBar(
  `
    <div class="kpi">
      <div class="kpi-label">Total chantier</div>
      <div class="kpi-value">
        ${fmtMinutes(totalMinutes)}
      </div>
    </div>

    <div class="kpi">
      <div class="kpi-label">7 derniers jours</div>
      <div class="kpi-value">
        ${fmtMinutes(last7)}
      </div>
    </div>

    ${
      req.session?.user?.role !== 'atelier'
        ? `
        <div class="kpi">
          <div class="kpi-label">Heures prévues</div>
          <div class="kpi-value">
            ${plannedHours.toFixed(1)} h
            <form method="POST" action="/chantier-hours/planned-hours">
  <input
    type="hidden"
    name="client"
    value="${escHtml(client)}">

  <input
    type="hidden"
    name="order"
    value="${escHtml(order)}">

  <input
    type="number"
    step="0.5"
    name="planned_hours"
    value="${plannedHours}">

  <button type="submit">
    Enregistrer
  </button>
</form>
          </div>
        </div>

        <div class="kpi">
          <div class="kpi-label">Écart</div>
          <div
            class="kpi-value"
            style="
              color:${isOver ? '#d32f2f' : '#2e7d32'};
              font-weight:bold;
            "
          >
            ${diffHours >= 0 ? '+' : ''}
            ${diffHours.toFixed(1)} h
          </div>
        </div>
        `
        : ''
    }
  `,
        `
          <a class="btn btn-secondary" href="/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}">← Retour commande</a>
          <a class="btn btn-primary" href="/clients/${encodeURIComponent(client)}">← Retour client</a>
          <a class="btn" href="/chantier-hours/export.csv?client=${encodeURIComponent(client)}&order=${encodeURIComponent(order)}">Export CSV</a>
        `
      )}

      <section class="panel-soft">
        <h2>Ajouter une ligne</h2>
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
              <button type="submit">Ajouter</button>
            </div>
          </div>
        </form>
      </section>

      <section class="panel-soft" style="margin-top:14px">
        <h2>Historique</h2>
        ${listHtml}
      </section>
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
            const tva = round2(totalHt * 0.2);
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
      <div class="page-head quote-page-head">
        <h1>Devis</h1>
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
      <div class="page-head">
        <h1>Nouveau devis</h1>
      </div>

      <form method="POST" action="/devis" class="orders-form quote-create-form" id="quoteForm">

        <h2>Informations du devis</h2>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Client</label>
            <select
              id="existing_client"
              name="existing_client"
              class="search"
            >
              ${clientSelectOptions}
            </select>
          </div>
          <div class="orders-form-field">
            <label>Objet du devis *</label>
            <input name="title" required placeholder="Ex : Escalier quart tournant" />
          </div>
        </div>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Date du devis</label>
            <input name="quote_date" type="date" value="${isoDate()}" />
          </div>
          <div class="orders-form-field">
            <label>Statut</label>
            <select name="status" disabled>
              <option>Brouillon</option>
            </select>
          </div>
        </div>

        <h2>Nouveau prospect</h2>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Nom du prospect *</label>
            <input name="prospect_name" id="prospect_name" placeholder="Nom du prospect" />
          </div>
          <div class="orders-form-field">
            <label>Email</label>
            <input name="prospect_email" id="prospect_email" type="email" />
          </div>
        </div>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Téléphone</label>
            <input name="prospect_phone" id="prospect_phone" />
          </div>
          <div class="orders-form-field">
            <label>Adresse</label>
            <input name="prospect_address" id="prospect_address" />
          </div>
        </div>

        <div class="orders-form-actions">
          <button type="submit" class="btn btn-primary">Créer le devis</button>
          <a class="btn btn-secondary" href="/devis">Annuler</a>
        </div>

      </form>

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
    (title, client_name, client_email, client_phone, client_address, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'Brouillon', ?)
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

app.post(
  '/devis/:id/photo',
  requireLogin,
  quotePhotoUpload.single('photo'),
  (req, res) => {

    res.redirect('/devis/' + req.params.id);

  }
);
app.get('/devis/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);

  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
  if (!quote) return res.status(404).send('Devis introuvable');
const photoDir =
  path.join(QUOTE_PHOTO_DIR, String(id));

const photos =
  fs.existsSync(photoDir)
    ? fs.readdirSync(photoDir)
    : [];
const photosHtml = photos.map(photo => `
  <div class="quote-photo-card">

    <a href="/quote-photos/${id}/${encodeURIComponent(photo)}"
       target="_blank">

      <img
        src="/quote-photos/${id}/${encodeURIComponent(photo)}"
        class="quote-photo">
    </a>

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
        🗑️ Supprimer
      </button>

    </form>

  </div>
`).join('');
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
            <button class="btn-icon danger" title="Supprimer">🗑️</button>
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
  const tva = round2(total * 0.2);
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
      <div class="page-head quote-page-head">
        <h1>${escHtml(quote.title || '')}</h1>
        <a class="btn btn-secondary" href="/devis">Retour aux devis</a>
      </div>

<section class="quote-hero">
  <div class="quote-hero-main">
    <span class="quote-number">Devis #${id}</span>
    <h2>${escHtml(quote.client_name || 'Client non renseigné')}</h2>
    <div class="quote-hero-meta">
      <span class="quote-status-badge ${quoteStatusClass(quoteStatus)}">${escHtml(quoteStatus)}</span>
      <span>Date : ${escHtml(formatDateLabel(quote.created_at))}</span>
    </div>
  </div>

  <div class="quote-hero-totals">
    <div><span>Total HT</span><strong>${total.toFixed(2)} €</strong></div>
    <div><span>TVA 20%</span><strong>${tva.toFixed(2)} €</strong></div>
    <div><span>Total TTC</span><strong>${totalTtc.toFixed(2)} €</strong></div>
  </div>
</section>

<section class="quote-action-bar">
  <form method="POST" action="/devis/${id}/status" class="quote-status-form">
    <label>Modifier le statut</label>
    <select name="status">${quoteStatusOptions(quote.status)}</select>
    <button class="btn btn-primary" type="submit">Enregistrer</button>
  </form>

  <div class="quote-action-buttons">
    <form
      method="POST"
      action="/devis/${id}/accept"
      onsubmit="return confirm('Accepter ce devis et créer la commande client ?');"
    >
      <button class="btn btn-primary" ${acceptDisabled ? 'disabled' : ''}>
        ${acceptDisabled ? 'Devis accepté' : 'Accepter'}
      </button>
    </form>

    <form
      method="POST"
      action="/devis/${id}/delete"
      onsubmit="return confirm('⚠️ Supprimer définitivement ce devis ? Cette action est irréversible.');"
    >
      <button class="btn btn-danger">Supprimer</button>
    </form>
  </div>
</section>

<section class="panel-soft measurement-linked-section">
  <h2>Prises de cotes liées</h2>
  ${renderMeasurementCards(linkedMeasurements)}
</section>

<div class="quote-top-grid">

  <div class="panel-soft">
    <h2>📐 Relevé de cotes / Notes chantier</h2>

    <form method="POST" action="/devis/${id}/notes">
      <textarea
        name="notes"
        rows="10"
        style="width:100%;min-height:250px"
      >${escHtml(quote.notes || '')}</textarea>

      <button type="submit">
        💾 Enregistrer
      </button>
    </form>
  </div>

  <div class="panel-soft">
    <h2>📷 Photos chantier</h2>

    <form
      method="POST"
      action="/devis/${id}/photo"
      enctype="multipart/form-data">

      <input
        type="file"
        name="photo"
        accept="image/*">

      <button type="submit">
        📷 Ajouter
      </button>
    </form>

    <div class="photo-grid">
      ${photosHtml}
    </div>

  </div>

</div>

<details class="tool-box" open>
  <summary>📦 Ajouter une matière</summary>

  <div class="panel-soft" style="margin-top:10px">

        <form method="POST" action="/devis/line" class="orders-form" style="margin:0" id="quickMatForm">
          <input type="hidden" name="quote_id" value="${id}">
          <input type="hidden" name="category" value="Matière">

          <div class="orders-form-row">
            <div class="orders-form-field">
              <label>Recherche matière</label>
              <input
                id="quickMatLabel"
                name="label"
                list="materialsSuggest"
                class="search"
                placeholder="Tape: tube 40x40, tôle 5mm, HEA…"
                autocomplete="off"
                required
              />
              <datalist id="materialsSuggest">
                ${materials
                  .map((m) => `<option value="${escHtml(m.name || '')}"></option>`)
                  .join('')}
              </datalist>

            </div>

            <div class="orders-form-field">
              <label>Qté</label>
              <input id="quickMatQty" name="qty" type="number" step="0.01" required placeholder="Ex: 6" />
            </div>

            <div class="orders-form-field">
              <label>Unité</label>
              <select id="quickMatUnit" name="unit" required>
                <option value="ml">ml</option>
                <option value="m²">m²</option>
                <option value="pièce">pièce</option>
                <option value="m">m</option>
                <option value="kg">kg</option>
                <option value="u">u</option>
              </select>
            </div>

            <div class="orders-form-field">
              <label>Prix unitaire (€)</label>
              <input id="quickMatPU" name="unit_price" type="number" step="0.01" required placeholder="Ex: 12.50" />
            </div>
<div class="orders-form-field">
  <label>Marge (%)</label>
  <input id="matMargin" type="number" step="0.1" value="30">
</div>
            <div class="orders-form-actions" style="align-self:end">
              <button type="submit">Ajouter</button>
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

function sync(){

  const k = (label.value || '').trim().toLowerCase();
  const found = MAT_INDEX.get(k);

  if (!found) return;

  if (found.unit){
    setMaterialUnit(found.unit);
  }

  if (Number.isFinite(found.price) && found.price > 0){

    const m = Number(margin?.value || 0);

    const salePrice =
      found.price * (1 + m / 100);

    pu.value = salePrice.toFixed(2);
  }
}

label.addEventListener('change', sync);
label.addEventListener('blur', sync);

if (margin){
  margin.addEventListener('input', sync);
}

})();
        </script>
      </div>

</details>
        

<details class="tool-box">
  <summary>📏 Calculateur de barres</summary>
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
            <button type="button" onclick="removeBarRow(this)">✖</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:10px">
      <button type="button" onclick="addBarRow()">➕ Ajouter une coupe</button>
      <button type="button" class="btn primary" onclick="calculateBars()">Calculer</button>
      <button type="button" class="btn secondary" onclick="printCuts()">
  🖨️ Imprimer les coupes
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
    '<td><button type="button" onclick="removeBarRow(this)">✖</button></td>';

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

<details class="tool-box">
  <summary>📐 Calculateur de tôles</summary>
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
        <td><button onclick="removeSheetRow(this)">✖</button></td>
      </tr>
    </tbody>
  </table>

  <button onclick="addSheetRow()">➕ Ajouter une pièce</button>
  <button onclick="calculate()">Calculer</button>
 <button onclick="printPlan()">🖨️ Imprimer</button>

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
    '<td><button onclick="removeSheetRow(this)">✖</button></td>';

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
  // ✅ AFFICHAGE DU NOMBRE DE TÔLES
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



<details class="tool-box">
  <summary>👷 Ajouter main d'œuvre</summary>

  <div class="panel-soft" style="margin-top:10px">

  <form method="POST" action="/devis/line" class="orders-form" style="margin:0" id="prestForm">
    <input type="hidden" name="quote_id" value="${id}">
    <input type="hidden" name="category" value="Prestation">

    <div class="orders-form-row">
      <div class="orders-form-field">
        <label>Type</label>
        <select id="prest_type" required>
          <option value="Main d’œuvre">Main d’œuvre</option>
          <option value="Pose">Pose</option>
          <option value="Laser">Laser</option>
          <option value="Galvanisation">Galvanisation</option>
          <option value="Thermolaquage">Thermolaquage</option>
          <option value="Matières">Matières</option>
        </select>
      </div>

      <div class="orders-form-field">
        <label>Libellé</label>
        <input id="prest_label" name="label" required />
      </div>
    </div>

    <div class="orders-form-row">
      <div class="orders-form-field">
        <label>Qté</label>
        <input name="qty" type="number" step="0.01" value="1" required />
      </div>

      <div class="orders-form-field">
        <label>Unité</label>
        <select name="unit" required>
          <option value="h">h</option>
          <option value="forfait">forfait</option>
          <option value="u">u</option>
          <option value="kilos">kilos</option>
        </select>
      </div>

      <div class="orders-form-field">
        <label>Coût unitaire (€)</label>
        <input id="prest_cost" type="number" step="0.01" value="0" required />
      </div>

      <div class="orders-form-field">
        <label>Marge (%)</label>
        <input id="prest_margin" type="number" step="0.1" value="0" />
      </div>

      <div class="orders-form-field">
        <label>Prix unitaire (€)</label>
        <input id="prest_price" name="unit_price" type="number" step="0.01" required />
      </div>

      <div class="orders-form-actions" style="align-self:end">
        <button type="submit">Ajouter</button>
      </div>
    </div>
  </form>
</div>

</details>
<script>
(function () {
  var costInput = document.getElementById('prest_cost');
  var marginInput = document.getElementById('prest_margin');
  var priceInput = document.getElementById('prest_price');
  var typeInput = document.getElementById('prest_type');
  var labelInput = document.getElementById('prest_label');

  if (!costInput || !marginInput || !priceInput) return;

  function updatePrice() {
    var cost = Number(costInput.value || 0);
    var margin = Number(marginInput.value || 0);
    var price = cost * (1 + margin / 100);
    priceInput.value = price.toFixed(2);
  }

  costInput.addEventListener('input', updatePrice);
  marginInput.addEventListener('input', updatePrice);

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
</div>

<div class="quote-lines">

${lines.length ? lines.map(l => `

<div class="quote-card">

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

      <button class="delete-btn" aria-label="Supprimer">×</button>

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

</div>

`).join('') : '<p>Aucune ligne dans ce devis</p>'}

</div>
   

      `
    )
  );
});
app.post('/devis/:id/photo/delete', requireLogin, (req, res) => {

  const id = Number(req.params.id);
  const photo = path.basename(req.body.photo || '');

  const photoPath = path.join(
    QUOTE_PHOTO_DIR,
    String(id),
    photo
  );

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

    const filePath = path.join(
      QUOTE_PHOTO_DIR,
      req.params.id,
      req.params.file
    );

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

  const rows = materials.length
    ? materials
        .map((m) => {
          const priceValue = Number(m.price || 0).toFixed(2);
          return (
            '<tr>' +
              '<td>' + escHtml(String(m.type || '').toUpperCase()) + '</td>' +
              '<td>' + escHtml(String(m.name || '')) + '</td>' +
              '<td>' + escHtml(String(m.unit || '')) + '</td>' +
              '<td style="text-align:right">' + priceValue + ' €</td>' +
              '<td style="text-align:center">' +
                '<a class="btn btn-secondary material-open-btn" href="/materials/' + m.id + '">Ouvrir</a>' +
                '<form method="POST" action="/materials/delete" onsubmit="return confirm(\'Supprimer cette matière ?\')" style="margin:0">' +
                  '<input type="hidden" name="id" value="' + m.id + '">' +
                  '<button class="btn-icon danger">🗑️</button>' +
                '</form>' +
              '</td>' +
            '</tr>'
          );
        })
        .join('')
    : '<tr><td colspan="5">' + (q ? 'Aucune matière trouvée.' : 'Aucune matière enregistrée') + '</td></tr>';

  const cards = materials.length
    ? materials.map((m) => {
        const priceValue = Number(m.price || 0).toFixed(2);
        return (
          '<article class="material-list-card">' +
            '<a class="material-list-link" href="/materials/' + m.id + '" aria-label="Ouvrir ' + escHtml(String(m.name || 'matière')) + '"></a>' +
            '<header>' +
              '<span>' + escHtml(String(m.type || '').toUpperCase()) + '</span>' +
              '<strong>' + escHtml(String(m.name || '')) + '</strong>' +
            '</header>' +
            '<div class="material-list-meta">' +
              '<span>Unité : ' + escHtml(String(m.unit || '—')) + '</span>' +
              '<strong>' + priceValue + ' €</strong>' +
            '</div>' +
            '<span class="dash-card-button">Ouvrir</span>' +
          '</article>'
        );
      }).join('')
    : '<div class="empty-state">' + (q ? 'Aucune matière trouvée.' : 'Aucune matière enregistrée') + '</div>';

  const html =
    '<h1>Bibliothèque matière</h1>' +

    (seeded
      ? '<div class="success-message">Bibliothèque matière préremplie. Vous pouvez maintenant renseigner vos tarifs.</div>'
      : '') +
    (saved
      ? '<div class="success-message">Matière enregistrée.</div>'
      : '') +

    (isAdmin
      ? '<form method="POST" action="/materials/seed" class="materials-seed-form">' +
          '<button type="submit" class="btn btn-primary">Préremplir la bibliothèque</button>' +
          (seeded ? '<span>' + added + ' matière(s) ajoutée(s) au dernier import.</span>' : '') +
        '</form>'
      : '') +

    '<form method="POST" action="/materials" class="orders-form">' +
      '<h2>Ajouter une matière</h2>' +

      '<div class="orders-form-row">' +
        '<div class="orders-form-field">' +
          '<label>Type</label>' +
          '<select name="type" required>' +
            '<option value="tube">Tube</option>' +
            '<option value="beam">Profilé</option>' +
            '<option value="sheet">Tôle</option>' +
          '</select>' +
        '</div>' +

        '<div class="orders-form-field">' +
          '<label>Nom</label>' +
          '<input name="name" required placeholder="Ex: Tube 40x40x2 S235" />' +
        '</div>' +
      '</div>' +

      '<div class="orders-form-row">' +
        '<div class="orders-form-field">' +
          '<label>Unité</label>' +
          '<select name="unit">' +
            '<option value="m">m</option>' +
            '<option value="kg">kg</option>' +
          '</select>' +
        '</div>' +

        '<div class="orders-form-field">' +
          '<label>Prix (€)</label>' +
          '<input name="price" type="number" step="0.01" required />' +
        '</div>' +
      '</div>' +

      '<div class="orders-form-row">' +
        '<div class="orders-form-field">' +
          '<label>kg / m (profilés)</label>' +
          '<input name="kg_per_m" type="number" step="0.01" />' +
        '</div>' +

        '<div class="orders-form-field">' +
          '<label>Densité (tôles)</label>' +
          '<input name="density" type="number" step="0.01" placeholder="7.85" />' +
        '</div>' +
      '</div>' +

      '<div class="orders-form-actions">' +
        '<button type="submit">Ajouter</button>' +
      '</div>' +
    '</form>' +

    '<h2 style="margin-top:24px">Matières enregistrées</h2>' +

    '<form method="GET" action="/materials" class="materials-search-form">' +
      '<input name="q" value="' + escHtml(q) + '" placeholder="Rechercher par type, nom ou unité..." autocomplete="off" />' +
      '<button type="submit" class="btn btn-primary">Rechercher</button>' +
      (q ? '<a class="btn btn-secondary" href="/materials">Réinitialiser</a>' : '') +
    '</form>' +

    '<div class="materials-edit-cards">' + cards + '</div>' +

    '<div class="table-responsive materials-edit-table">' +
      '<table>' +
      '<thead>' +
        '<tr>' +
          '<th>Type</th>' +
          '<th>Nom</th>' +
          '<th>Unité</th>' +
          '<th>Prix</th>' +
          '<th></th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
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
    '<div class="page-head material-detail-head">' +
      '<h1>' + escHtml(String(material.name || 'Matière')) + '</h1>' +
      '<a class="btn btn-secondary" href="/materials">Retour matières</a>' +
    '</div>' +

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

    '<form method="POST" action="/materials/' + id + '" class="orders-form material-detail-form">' +
      '<h2>Modifier les informations tarifaires</h2>' +
      '<div class="orders-form-row">' +
        '<div class="orders-form-field">' +
          '<label>Unité</label>' +
          '<input name="unit" value="' + escHtml(String(material.unit || '')) + '">' +
        '</div>' +
        '<div class="orders-form-field">' +
          '<label>Prix (€)</label>' +
          '<input name="price" value="' + priceValue + '" inputmode="decimal">' +
        '</div>' +
      '</div>' +
      '<div class="orders-form-row">' +
        '<div class="orders-form-field">' +
          '<label>kg / m</label>' +
          '<input name="kg_per_m" value="' + kgValue + '" inputmode="decimal">' +
        '</div>' +
        '<div class="orders-form-field">' +
          '<label>Densité</label>' +
          '<input name="density" value="' + densityValue + '" inputmode="decimal">' +
        '</div>' +
      '</div>' +
      '<div class="orders-form-actions">' +
        '<button type="submit" class="btn btn-primary">Enregistrer</button>' +
      '</div>' +
    '</form>';

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
  <div class="panel-header">
    <h2>Calculateur de barres</h2>
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


/* ===================== Logitôle ===================== */
app.get('/outils/logitole', requireLogin, (req, res) => {
  res.send(
    pageTemplate(req, 'Logitôle', `
      <section class="panel workshop-calc-panel logitole-page">
  <div class="panel-header">
    <h2>Calculateur de tôles</h2>
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
