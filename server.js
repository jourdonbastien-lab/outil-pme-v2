'use strict';

const express = require('express');
const path = require('path');
const session = require('express-session');
const Database = require('better-sqlite3');
const fs = require('fs');
const { google } = require('googleapis');
const multer = require('multer');
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

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const TRUST_PROXY = envBool('TRUST_PROXY', NODE_ENV === 'production');
const SESSION_SECRET = process.env.SESSION_SECRET || 'outil-pme-secret';
const SESSION_COOKIE_SECURE = envBool('SESSION_COOKIE_SECURE', NODE_ENV === 'production');
const SESSION_COOKIE_SAMESITE = process.env.SESSION_COOKIE_SAMESITE || 'lax';

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

function breadcrumb(items) {
  const html = items
    .map((it) => {
      const label = escHtml(it.label);
      if (it.href) return `<a href="${it.href}">${label}</a>`;
      return `<span class="crumb-current">${label}</span>`;
    })
    .join('<span class="crumb-sep">›</span>');
  return `<nav class="crumbs">${html}</nav>`;
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
    'SELECT id, username, password FROM users'
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
<button id="mobileMenuBtn" class="mobile-menu-btn">
☰
</button>
    <main class="content">
      <div class="container">
        ${content}
      </div>
    </main>
  </div>
<script>
document.addEventListener('DOMContentLoaded', function () {

  const btn = document.getElementById('mobileMenuBtn');
  const sidebar = document.querySelector('.sidebar');

  btn.addEventListener('click', function () {
    sidebar.classList.toggle('open');
  });

});
</script>
</body>
</html>
`;
}

/* ===================== AUTH ===================== */

app.get('/', (req, res) => (req.session.user ? res.redirect('/dashboard') : res.redirect('/login')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', (req, res) => {

  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND password = ?')
    .get(username, password);

  if (!user) {
    return res.status(401).send('Login incorrect');
  }

req.session.user = {
  id: user.id,
  username: user.username,
  role: user.role
};

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
  const openTasks = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'Terminée'").get().c;
  const eventsThisWeek = db
    .prepare(`
      SELECT COUNT(*) AS c
      FROM events
      WHERE start_date IS NOT NULL
        AND datetime(start_date) >= datetime('now')
        AND datetime(start_date) < datetime('now', '+7 days')
    `)
    .get().c;
  const openClientOrders = db.prepare("SELECT COUNT(*) AS c FROM client_orders WHERE status != 'Terminée'").get().c;
  const openSupplierOrders = db
    .prepare("SELECT COUNT(*) AS c FROM supplier_orders WHERE status IS NULL OR TRIM(status) = '' OR status != 'Terminée'")
    .get().c;

  const recentTasks = db
    .prepare(`
      SELECT title, status
      FROM tasks
      ORDER BY created_at DESC, id DESC
      LIMIT 6
    `)
    .all();

  const upcomingEvents = db
    .prepare(`
      SELECT title, start_date
      FROM events
      WHERE start_date IS NOT NULL
        AND datetime(start_date) >= datetime('now')
      ORDER BY datetime(start_date) ASC
      LIMIT 6
    `)
    .all();

  const recentOrders = db
    .prepare(`
      SELECT id, name, description, date, status
      FROM client_orders
      ORDER BY date DESC, id DESC
      LIMIT 6
    `)
    .all();

  const recentSupplierOrders = db
    .prepare(`
      SELECT id, name, description, date, status
      FROM supplier_orders
      ORDER BY date DESC, id DESC
      LIMIT 6
    `)
    .all();

  const tasksHtml = recentTasks.length
    ? recentTasks
        .map(
          (t) => `
      <li>
        <span>${escHtml(t.title || 'Sans titre')}</span>
        <span class="proto-chip">${escHtml(t.status || 'À faire')}</span>
      </li>
    `
        )
        .join('')
    : '<li><span>Aucune tâche récente</span></li>';

  const eventsHtml = upcomingEvents.length
    ? upcomingEvents
        .map((e) => {
          const day = String(e.start_date || '').slice(0, 10);
          const hour = String(e.start_date || '').slice(11, 16);
          return `
      <li>
        <span>${escHtml(e.title || 'Événement')}</span>
        <span class="proto-muted">${escHtml(day)}${hour ? ' · ' + escHtml(hour) : ''}</span>
      </li>
    `;
        })
        .join('')
    : '<li><span>Aucun rendez-vous planifié</span></li>';

  const ordersHtml = recentOrders.length
    ? recentOrders
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
      <article class="order-card modern-order-card">
        <a class="order-card-link" href="${clientFolderUrl}" aria-label="Ouvrir la commande"></a>

        <header class="order-card-header modern-order-card-header">
          <div>
            <div class="order-card-title">
              <span class="order-card-client">${escHtml(o.name || 'Client')}</span>
              <span class="order-card-id">#${o.id}</span>
            </div>
            <div class="order-card-meta modern-order-card-meta">
              <span class="order-card-date">📅 ${escHtml(day)}</span>
              <span class="order-card-status badge">${escHtml(status)}</span>
            </div>
          </div>
        </header>

        <div class="order-card-body modern-order-card-body">
          <p class="order-card-description">${escHtml(o.description || '—')}</p>
        </div>
      </article>
    `;
        })
        .join('')
    : '<p class="empty">Aucune commande récente</p>';

  const supplierOrdersHtml = recentSupplierOrders.length
    ? recentSupplierOrders
        .map((o) => {
          const day = String(o.date || '').slice(0, 10) || '—';
          const status = o.status || 'En cours';
          return `
      <article class="order-card supplier-proto-card">
        <header class="order-card-header supplier-proto-card-header">
          <div>
            <div class="order-card-title">
              <span class="supplier-proto-label">Fournisseur</span>
              <span class="order-card-client">${escHtml(o.name || 'Fournisseur')}</span>
              <span class="order-card-id">#${o.id}</span>
            </div>
            <div class="order-card-meta supplier-proto-card-meta">
              <span class="order-card-date">📅 ${escHtml(day)}</span>
              <span class="order-card-status badge">${escHtml(status)}</span>
            </div>
          </div>
        </header>

        <div class="order-card-body supplier-proto-card-body">
          <p class="order-card-description">${escHtml(o.description || '—')}</p>
        </div>
      </article>
    `;
        })
        .join('')
    : '<p class="empty">Aucune commande fournisseur récente</p>';

  res.send(
    dashboardTemplate(
      req,
      `
      <div class="proto-shell">
        <section class="proto-hero">
          <div>
            <p class="proto-eyebrow">Pilotage quotidien</p>
            <h1>Tableau de bord</h1>
            <p class="proto-sub">Vue synthétique rapide pour suivre les priorités, les rendez-vous et les commandes.</p>
          </div>
          <div class="proto-hero-actions">
            <a class="btn btn-primary" href="/tasks">Tâches</a>
            <a class="btn btn-secondary" href="/outils/prises-cotes">Prises de cotes</a>
          </div>
        </section>

        <section class="proto-kpis">
          <article class="proto-kpi">
            <p class="proto-kpi-label">Tâches ouvertes</p>
            <p class="proto-kpi-value">${openTasks}</p>
          </article>
          <article class="proto-kpi">
            <p class="proto-kpi-label">RDV 7 jours</p>
            <p class="proto-kpi-value">${eventsThisWeek}</p>
          </article>
          <article class="proto-kpi">
            <p class="proto-kpi-label">Cmd clients</p>
            <p class="proto-kpi-value">${openClientOrders}</p>
          </article>
          <article class="proto-kpi">
            <p class="proto-kpi-label">Cmd fournisseurs</p>
            <p class="proto-kpi-value">${openSupplierOrders}</p>
          </article>
        </section>

        <section class="proto-grid">
          <article class="proto-panel">
            <h2>Activité tâches</h2>
            <ul class="proto-list">
              ${tasksHtml}
            </ul>
          </article>

          <article class="proto-panel">
            <h2>Prochains rendez-vous</h2>
            <ul class="proto-list">
              ${eventsHtml}
            </ul>
          </article>

          <article class="proto-panel proto-panel-wide">
            <h2>Dernières commandes clients</h2>
            <div class="orders-cards-grid modern-orders-grid">
              ${ordersHtml}
            </div>
          </article>

          <article class="proto-panel proto-panel-wide">
            <h2>Dernières commandes fournisseurs</h2>
            <div class="orders-cards-grid modern-orders-grid">
              ${supplierOrdersHtml}
            </div>
          </article>
        </section>
      </div>
      `
    )
  );
});

app.get('/dashboard/prototype', requireLogin, (req, res) => {
  res.redirect('/dashboard');
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

  const events = db.prepare(`
    SELECT *
    FROM events
    ORDER BY start_date ASC
  `).all();

const now = new Date();

const monday = new Date(now);
monday.setDate(
  now.getDate() -
  ((now.getDay() + 6) % 7)
);
monday.setHours(0,0,0,0);

const sunday = new Date(monday);
sunday.setDate(monday.getDate() + 7);

const weekEvents = events.filter(e => {

  const d = new Date(e.start_date);

  return d >= monday && d < sunday;

});

const days = {
  1: [],
  2: [],
  3: [],
  4: [],
  5: []
};

weekEvents.forEach(e => {

  const date = new Date(e.start_date);
  const day = date.getDay();

  if(day >= 1 && day <= 5){
    days[day].push(e);
  }

});
Object.values(days).forEach(list => {

  list.sort((a,b) =>
    new Date(a.start_date) -
    new Date(b.start_date)
  );

});
  const dayNames = {
    1: 'Lundi',
    2: 'Mardi',
    3: 'Mercredi',
    4: 'Jeudi',
    5: 'Vendredi'
  };

  const columns = Object.keys(days).map(day => `

    <div class="planning-day">

      <div class="planning-day-header">
        ${dayNames[day]}
      </div>

      <div class="planning-events">

        ${
          days[day].length
          ? days[day].map(e => `

            <div
              class="planning-event ${e.type || 'rdv'}"
              onclick="editEvent(
                '${e.id}',
                '${(e.title || '').replace(/'/g,"\\'")}',
                '${e.type || 'rdv'}',
                '${e.start_date}',
                '${e.end_date}'
              )"
            >

              <div class="planning-event-title">
                ${escHtml(e.title)}
              </div>

              <div class="planning-event-time">
                ${new Date(e.start_date).toLocaleTimeString(
                  'fr-FR',
                  {
                    hour:'2-digit',
                    minute:'2-digit'
                  }
                )}
              </div>

            </div>

          `).join('')

          : `<div class="planning-empty">
               Aucun événement
             </div>`
        }

      </div>

    </div>

  `).join('');

  res.send(
    pageTemplate(
      req,
      'Agenda',
      `

      <div class="page-head">
        <h1>Planning semaine</h1>
      </div>

      <div style="margin-bottom:15px">

        <a href="/google/sync">
          <button>
            Synchroniser Google Agenda
          </button>
        </a>

      </div>
<div style="margin-bottom:15px;">
  <button onclick="newEvent()">
    ➕ Nouvel événement
  </button>
</div>
      <div class="planning-week">

        ${columns}

      </div>

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
      function newEvent(){

  document
    .getElementById('event-editor')
    .classList
    .remove('hidden');

  document.getElementById('edit-id').value = '';
  document.getElementById('edit-title').value = '';
  document.getElementById('edit-type').value = 'rdv';

  const now = new Date();

  const start =
    now.toISOString().slice(0,16);

  const endDate = new Date(
    now.getTime() + 60 * 60 * 1000
  );

  const end =
    endDate.toISOString().slice(0,16);

  document.getElementById('edit-start').value = start;
  document.getElementById('edit-end').value = end;
document.getElementById('delete-event').style.display = 'none';
}

      function editEvent(id,title,type,start,end){

        document
          .getElementById('event-editor')
          .classList
          .remove('hidden');

        document.getElementById('edit-id').value=id;
        document.getElementById('edit-title').value=title;
        document.getElementById('edit-type').value=type;

        document.getElementById('edit-start').value =
          start.substring(0,16);

        document.getElementById('edit-end').value =
          end.substring(0,16);
// Affiche le bouton supprimer
  document.getElementById('delete-event').style.display = 'inline-block';
      }

      document.getElementById('cancel-edit').onclick = () => {

        document
          .getElementById('event-editor')
          .classList
          .add('hidden');

      };
document.getElementById('save-event').onclick = () => {

  const payload = {
    title: document.getElementById('edit-title').value,
    type: document.getElementById('edit-type').value,
    start_date: document.getElementById('edit-start').value,
    end_date: document.getElementById('edit-end').value
  };

  const id =
    document.getElementById('edit-id').value;

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

      `
    )
  );

});

/* ===================== PRISES DE COTES ===================== */

app.get('/outils/prises-cotes', requireLogin, (req, res) => {
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
        <p class="muted">Choisir un module pour ouvrir sa fiche terrain.</p>
      </div>

      <section class="cards-grid">
        ${cards}
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


app.get('/google/calendars', async (req, res) => {

  oauth2Client.setCredentials(req.session.googleTokens);

  const calendar = google.calendar({
    version: 'v3',
    auth: oauth2Client
  });

  const result = await calendar.calendarList.list();

  console.log(result.data.items);

  res.send('OK');
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
        <p class="muted">Création DB + dossier PC automatique. Les dossiers déjà présents sur le PC apparaissent aussi ici.</p>
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
          const cards = document.querySelectorAll('.client-card');
          if (!input) return;
          input.addEventListener('input', function(){
            const q = (this.value||'').toLowerCase();
            cards.forEach(card => {
              const name = card.dataset.name || '';
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
      ${breadcrumb([{ label: 'Clients', href: '/clients' }, { label: clientFolder }])}

      <div class="page-head">
        <h1>${escHtml(clientFolder)}</h1>
        <p class="muted">
          ${clientDb?.address ? escHtml(clientDb.address) + ' · ' : ''}
          ${clientDb?.postal_code ? escHtml(clientDb.postal_code) + ' ' : ''}
          ${clientDb?.city ? escHtml(clientDb.city) : ''}
          ${clientDb?.phone ? ' · ' + escHtml(clientDb.phone) : ''}
          ${clientDb?.email ? ' · ' + escHtml(clientDb.email) : ''}
        </p>
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
  Number(realMinutes.total || 0) / 60;

const plannedHours =
  Number(o.planned_hours || 0);

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
        <p class="muted">Créer une commande = dossier client/commande + sous-dossiers standard sur ton PC</p>
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

  if (!name) return res.status(400).send('Nom client requis');

  const dateValue = date && date !== '' ? date : isoDate();

  const info = db
    .prepare(
      `
    INSERT INTO client_orders (name, description, date, price, status, created_at)
    VALUES (?, ?, ?, ?, 'En cours', ?)
  `
    )
    .run(name, description || null, dateValue, price ? parseFloat(price) : 0, new Date().toISOString());

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
    : `<div class="empty-state">Aucune commande trouvée dans <code>${escHtml(clientDir)}</code></div>`;

  const content = `
    ${breadcrumb([{ label: 'Clients', href: '/clients' }, { label: client, href: '/clients/' + encodeURIComponent(client) }, { label: 'Dossiers commandes' }])}

    <div class="page-head">
      <h1>${escHtml(client)}</h1>
      <p class="muted">Chemin : <code>${escHtml(clientDir)}</code></p>
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

  const content = `
    ${breadcrumb([{ label: 'Clients', href: '/clients' }, { label: client, href: '/clients/' + encodeURIComponent(client) }, { label: order }])}

    <div class="page-head">
      <h1>${escHtml(order)}</h1>
      <p class="muted">Client : <strong>${escHtml(client)}</strong> · <code>${escHtml(orderDir)}</code></p>
    </div>

    ${infoBar(
      `<div class="kpi"><div class="kpi-label">Dossiers</div><div class="kpi-value">${foldersToShow.length}</div></div>`,
      `
        <a class="btn btn-secondary" href="/clients/${encodeURIComponent(client)}">← Retour client</a>
        <a class="btn btn-primary" href="/pc-folders/${encodeURIComponent(client)}">← Retour commandes</a>
      `
    )}

    ${gridCards(cards)}
  `;

  res.send(pageTemplate(req, `Commande : ${order}`, content));
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
    ${breadcrumb([
      { label: 'Clients', href: '/clients' },
      { label: client, href: '/clients/' + encodeURIComponent(client) },
      { label: order, href: '/pc-folders/' + encodeURIComponent(client) + '/' + encodeURIComponent(order) },
      { label: type },
    ])}

    <div class="page-head">
      <h1>${escHtml(type)}</h1>
      <p class="muted"><code>${escHtml(dirPath)}</code></p>
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
      ${breadcrumb([
        { label: 'Clients', href: '/clients' },
        { label: client, href: '/clients/' + encodeURIComponent(client) },
        { label: order, href: '/pc-folders/' + encodeURIComponent(client) + '/' + encodeURIComponent(order) },
        { label: 'Heure chantier' },
      ])}

      <div class="page-head">
        <h1>Heures chantier</h1>
        <p class="muted">Client : <strong>${escHtml(client)}</strong> · Commande : <strong>${escHtml(order)}</strong></p>
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

  const cards = quotes.length
    ? quotes
        .map(
          (q) => `
        <a class="card" href="/devis/${q.id}">
          <div class="card-icon">🧾</div>
          <div class="card-main">
            <div class="card-title">${escHtml(q.title || '')}</div>
            <div class="card-sub">
              ${escHtml(q.client_name || '—')} · ${escHtml(q.status || 'Brouillon')}
            </div>
          </div>
          <div class="card-cta">Ouvrir</div>
        </a>
      `
        )
        .join('')
    : `<div class="empty-state">Aucun devis</div>`;

  res.send(
    pageTemplate(
      req,
      'Devis',
      `
      ${breadcrumb([{ label: 'Devis' }])}

      <div class="page-head">
        <h1>Devis</h1>
        <p class="muted">Créer un devis, puis ajouter tes lignes (manuel ou via Calcul matière).</p>
      </div>

      ${infoBar(
        `<div class="kpi"><div class="kpi-label">Devis</div><div class="kpi-value">${quotes.length}</div></div>`,
        `
          <a class="btn" href="/devis/new">➕ Nouveau devis</a>
        
        `
      )}

      <section class="cards-grid">${cards}</section>
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

  const datalistOptions = merged.map((c) => `<option value="${escHtml(c)}"></option>`).join('');

  res.send(
    pageTemplate(
      req,
      'Nouveau devis',
      `
      ${breadcrumb([{ label: 'Devis', href: '/devis' }, { label: 'Nouveau' }])}

      <div class="page-head">
        <h1>Nouveau devis</h1>
        <p class="muted">Recherche un client existant (DB + PC) ou crée un prospect.</p>
      </div>

      <form method="POST" action="/devis" class="orders-form" id="quoteForm">

        <h2>Client existant</h2>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Rechercher un client</label>
            <input
              id="existing_client"
              name="existing_client"
              list="clientsList"
              class="search"
              placeholder="Tape le nom du client…"
              autocomplete="off"
            />
            <datalist id="clientsList">
              ${datalistOptions}
            </datalist>
            <p class="muted" style="margin-top:6px">Si tu remplis ce champ, la partie Prospect sera désactivée.</p>
          </div>
        </div>

        <hr style="margin:24px 0">

        <h2>Prospect</h2>
        <p class="muted">À remplir uniquement si le client n’existe pas</p>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Nom *</label>
            <input name="prospect_name" id="prospect_name" placeholder="Nom du prospect" />
          </div>
          <div class="orders-form-field">
            <label>Email</label>
            <input name="prospect_email" id="prospect_email" />
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

        <hr style="margin:24px 0">

        <h2>Devis</h2>

        <div class="orders-form-row">
          <div class="orders-form-field">
            <label>Titre du devis *</label>
            <input name="title" required placeholder="Ex : Escalier quart tournant" />
          </div>
        </div>

        <div class="orders-form-actions">
          <button type="submit">Créer le devis</button>
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
      new Date().toISOString()
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

  res.send(
    pageTemplate(
      req,
      `Devis #${id}`,
      `
  ${breadcrumb([{ label: 'Devis', href: '/devis' }, { label: '#' + id }])}

      <div class="page-head">
        <h1>${escHtml(quote.title || '')}</h1>
        <p class="muted">${escHtml(quote.client_name || '—')} · ${escHtml(quote.status || 'Brouillon')}</p>
      </div>
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

function sync(){

  const k = (label.value || '').trim().toLowerCase();
  const found = MAT_INDEX.get(k);

  if (!found) return;

  if (found.unit){
    unit.value = found.unit;
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

<div class="quote-summary">

  <div class="summary-card">
    <span>HT</span>
    <strong>${total.toFixed(2)} €</strong>
  </div>

  <div class="summary-card">
    <span>TVA</span>
    <strong>${(total * 0.20).toFixed(2)} €</strong>
  </div>

  <div class="summary-card">
    <span>TTC</span>
    <strong>${(total * 1.20).toFixed(2)} €</strong>
  </div>

</div>


<div class="quote-lines">

${lines.length ? lines.map(l => `

<div class="quote-card">

  <div class="quote-card-head">

    <span class="quote-type">
      ${escHtml(l.category || '')}
    </span>

    <form method="POST"
          action="/devis/line/delete"
          onsubmit="return confirm('Supprimer ?')">

      <input type="hidden" name="quote_id" value="${id}">
      <input type="hidden" name="id" value="${l.id}">

      <button class="delete-btn">🗑️</button>

    </form>
<form
  method="GET"
  action="/devis/line/${l.id}/edit"
  style="display:inline-block">

  <button
    type="submit"
    class="edit-btn">
    ✏️
  </button>

</form>
  </div>

  <h3>${escHtml(l.label || '')}</h3>

  <div class="quote-meta">
    ${Number(l.qty || 0).toFixed(2)}
    ${escHtml(l.unit || '')}
  </div>

  <div class="quote-price">
    ${Number(l.unit_price || 0).toFixed(2)} €
  </div>

  <div class="quote-total">
    ${Number(l.total || 0).toFixed(2)} €
  </div>

</div>

`).join('') : '<p>Aucune ligne dans ce devis</p>'}

</div>
   

<div style="margin-top:12px">
  <form
    method="POST"
    action="/devis/${id}/accept"
    onsubmit="return confirm('Accepter ce devis et créer la commande client ?');"
    style="display:inline-block"
  >
    <button class="btn btn-primary" ${acceptDisabled ? 'disabled' : ''}>
      ✅ ${acceptDisabled ? 'Devis déjà accepté' : 'Accepter le devis'}
    </button>
  </form>

  <form
    method="POST"
    action="/devis/${id}/delete"
    onsubmit="return confirm('⚠️ Supprimer définitivement ce devis ? Cette action est irréversible.');"
    style="display:inline-block;margin-left:10px"
  >
    <button class="btn btn-danger">
      🗑️ Supprimer le devis
    </button>
  </form>

  <a class="btn btn-secondary" href="/devis" style="margin-left:10px">
    ← Retour devis
  </a>
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
  const materials = db.prepare('SELECT * FROM materials ORDER BY type, name').all();

  const rows = materials.length
    ? materials
        .map((m) => {
          return (
            '<tr>' +
              '<td>' + escHtml(String(m.type || '').toUpperCase()) + '</td>' +
              '<td>' + escHtml(String(m.name || '')) + '</td>' +
              '<td>' + escHtml(String(m.unit || '')) + '</td>' +
              '<td style="text-align:right">' + Number(m.price || 0).toFixed(2) + ' €</td>' +
              '<td style="text-align:right">' + (m.kg_per_m !== null && m.kg_per_m !== undefined ? escHtml(String(m.kg_per_m)) : '—') + '</td>' +
              '<td style="text-align:right">' + (m.density !== null && m.density !== undefined ? escHtml(String(m.density)) : '—') + '</td>' +
              '<td style="text-align:center">' +
                '<form method="POST" action="/materials/delete" onsubmit="return confirm(\'Supprimer cette matière ?\')" style="margin:0">' +
                  '<input type="hidden" name="id" value="' + m.id + '">' +
                  '<button class="btn-icon danger">🗑️</button>' +
                '</form>' +
              '</td>' +
            '</tr>'
          );
        })
        .join('')
    : '<tr><td colspan="7">Aucune matière enregistrée</td></tr>';

  const html =
    '<h1>Bibliothèque matière</h1>' +

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

    '<div class="table-responsive">' +
'<table>' +
      '<thead>' +
        '<tr>' +
          '<th>Type</th>' +
          '<th>Nom</th>' +
          '<th>Unité</th>' +
          '<th>Prix</th>' +
          '<th>kg/m</th>' +
          '<th>Densité</th>' +
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
  const price = Number(req.body.price || 0);
  const kg_per_m = req.body.kg_per_m !== '' ? req.body.kg_per_m : null;
  const density = req.body.density !== '' ? req.body.density : null;

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

app.post('/materials/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM materials WHERE id = ?').run(req.body.id);
  res.redirect('/materials');
});
/* ===================== Logibarre ===================== */
app.get('/outils/logibarre', requireLogin, (req, res) => {
  res.send(
    pageTemplate(req, 'Logibarre', `
     <section class="panel">
  <div class="panel-header">
    <h2>Calculateur de barres</h2>
  </div>

  <div class="bar-calc">

    <div class="bar-row">
      <label>Longueur barre standard (mm)</label>
      <input id="bar-length" type="number" value="6000">
    </div>

    <div class="bar-row">
      <label>Perte par coupe (mm)</label>
      <input id="bar-loss" type="number" value="3">
    </div>

    <h4>Pièces à couper</h4>

    <table>
      <thead>
        <tr>
          <th>Longueur (mm)</th>
          <th>Qté</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="cuts-body">
        <tr>
          <td><input type="number" value="1200"></td>
          <td><input type="number" value="1"></td>
          <td><button type="button" onclick="removeRow(this)">✖</button></td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:10px">
      <button type="button" onclick="addRow()">➕ Ajouter une coupe</button>
      <button type="button" class="btn primary" onclick="calculateBars()">Calculer</button>
      <button type="button" class="btn secondary" onclick="printBars()">🖨️ Imprimer</button>
    </div>

    <div id="bar-result" style="margin-top:12px"></div>

  </div>
</section>

<script>
/* ======================
   AJOUT / SUPPRESSION
====================== */
function addRow() {
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input type="number" value="1000"></td>' +
    '<td><input type="number" value="1"></td>' +
    '<td><button type="button" onclick="removeRow(this)">✖</button></td>';
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
      <section class="panel">
  <div class="panel-header">
    <h2>Calculateur de tôles</h2>
  </div>

  <div class="sheet-calc">

    <div class="sheet-row">
      <label>Largeur tôle (mm)</label>
      <input id="sheet-width" type="number" value="3000">
    </div>

    <div class="sheet-row">
      <label>Hauteur tôle (mm)</label>
      <input id="sheet-height" type="number" value="1500">
    </div>

    <div class="sheet-row">
      <label>Jeu / perte (mm)</label>
      <input id="sheet-gap" type="number" value="3">
    </div>

    <h4>Pièces à découper</h4>

    <table>
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
          <td><input type="number" value="500"></td>
          <td><input type="number" value="300"></td>
          <td><input type="number" value="1"></td>
          <td><button type="button" onclick="removeSheetRow(this)">✖</button></td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top:10px">
      <button type="button" onclick="addSheetRow()">➕ Ajouter une pièce</button>
      <button type="button" class="btn primary" onclick="calculateSheets()">Calculer</button>
      <button type="button" class="btn secondary" onclick="printSheets()">🖨️ Imprimer</button>
    </div>

    <div id="sheet-result" style="margin-top:12px"></div>

    <canvas id="sheet-canvas" width="900" height="500"
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
    '<td><input type="number" value="100"></td>' +
    '<td><input type="number" value="100"></td>' +
    '<td><input type="number" value="1"></td>' +
    '<td><button type="button" onclick="removeSheetRow(this)">✖</button></td>';
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
