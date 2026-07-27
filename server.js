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
const { parseEbpQuoteText, parseEbpInvoiceText } = require('./lib/ebpQuoteParser');
const googleSync = require('./lib/googleCalendarSync');
const agendaEventRange = require('./lib/agendaEventRange');
const measurementRoutes = require('./lib/measurementRoutes');
const measurementPhotoFiles = require('./lib/measurementPhotoFiles');
const incomingDocuments = require('./lib/incomingDocuments');
const app = express();

function tryRequire(moduleName) {
  try {
    return require(moduleName);
  } catch {
    return null;
  }
}

const pdfParse = tryRequire('pdf-parse');
const tesseractJs = tryRequire('tesseract.js');
const heicConvert = tryRequire('heic-convert');
const sharp = tryRequire('sharp');
const BetterSqlite3SessionStoreFactory = tryRequire('better-sqlite3-session-store');
const quoteAiReview = require('./lib/quoteAiReview');
const projectProfitability = require('./lib/projectProfitability');
const clientOrderCostLines = require('./lib/clientOrderCostLines');
const clientOrderFinancialSnapshot = require('./lib/clientOrderFinancialSnapshot');
const { registerClientOrderRoutes } = require('./routes/clientOrders');
const { createClientOrderProfitabilityController } = require('./controllers/clientOrderProfitabilityController');
const { renderClientOrderProfitabilityView } = require('./views/clientOrderProfitabilityView');
const { createClientOrderPurchaseService } = require('./services/clientOrderPurchaseService');
const { createClientOrderPurchasesController } = require('./controllers/clientOrderPurchasesController');
const { createClientOrderInvoiceService } = require('./services/clientOrderInvoiceService');
const { createClientOrderInvoicesController } = require('./controllers/clientOrderInvoicesController');
const { renderClientOrderInvoicesView } = require('./views/clientOrderInvoicesView');
const { createClientOrderHoursService } = require('./services/clientOrderHoursService');
const { createClientOrderHoursController } = require('./controllers/clientOrderHoursController');
const { renderClientOrderHoursView } = require('./views/clientOrderHoursView');
const { createClientOrderAgendaService } = require('./services/clientOrderAgendaService');
const { createClientOrderAgendaController } = require('./controllers/clientOrderAgendaController');
const { renderClientOrderInvoiceValidationView } = require('./views/clientOrderInvoiceValidationView');
const { createClientOrderService } = require('./services/clientOrderService');
const { createClientOrdersController } = require('./controllers/clientOrdersController');
const { renderClientOrdersListView } = require('./views/clientOrdersListView');
const { createClientOrderFolderService } = require('./services/clientOrderFolderService');
const { createClientOrderFoldersController } = require('./controllers/clientOrderFoldersController');
const {
  renderClientOrderFolderView,
  renderClientOrderRootFolderView,
  renderClientOrderFilesList,
  renderPurchasesBlock
} = require('./views/clientOrderFolderView');
const { createClientFolderNavigationService } = require('./services/clientFolderNavigationService');
const { createClientFolderNavigationController } = require('./controllers/clientFolderNavigationController');
const { renderClientFolderNavigationView } = require('./views/clientFolderNavigationView');
const { registerClientFolderRoutes } = require('./routes/clientFolders');
const { createClientsService } = require('./services/clientsService');
const { createClientsController } = require('./controllers/clientsController');
const { renderClientsListView } = require('./views/clientsListView');
const { renderClientCard } = require('./views/clientCardView');
const { registerClientsRoutes, registerPcFoldersAliasRoute } = require('./routes/clients');
const { createQuotesService } = require('./services/quotesService');
const { createQuotesController } = require('./controllers/quotesController');
const { renderQuotesListView } = require('./views/quotesListView');
const { renderQuoteCreateView } = require('./views/quoteCreateView');
const { registerQuoteRoutes } = require('./routes/quotes');

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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const TRUST_PROXY = envBool('TRUST_PROXY', NODE_ENV === 'production');
const RAW_SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim();
const SESSION_SECRET = RAW_SESSION_SECRET || 'outil-pme-secret';
const SESSION_COOKIE_SECURE = envBool('SESSION_COOKIE_SECURE', NODE_ENV === 'production');
const SESSION_COOKIE_SAMESITE = process.env.SESSION_COOKIE_SAMESITE || 'lax';
const SESSION_MAX_AGE_DAYS = envNumber('SESSION_MAX_AGE_DAYS', 30);
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
const SESSION_STORE_CLEAR_INTERVAL_MINUTES = envNumber('SESSION_STORE_CLEAR_INTERVAL_MINUTES', 15);
const SESSION_STORE_CLEAR_INTERVAL_MS = SESSION_STORE_CLEAR_INTERVAL_MINUTES * 60 * 1000;
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

if (NODE_ENV === 'production' && !RAW_SESSION_SECRET) {
  console.warn('SESSION_SECRET absent: utilisation d\'une valeur de repli. Définissez SESSION_SECRET en production.');
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

function formatEuroFr(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function parseDecimalInput(value, fallback = 0) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!normalized) return fallback;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function hasDecimalInput(value) {
  return String(value ?? '').trim() !== '';
}

function invoiceTotalsAreConsistent(amountHt, vatAmount, amountTtc) {
  const expectedTtc = round2(Number(amountHt || 0) + Number(vatAmount || 0));
  return Math.abs(expectedTtc - Number(amountTtc || 0)) <= 0.05;
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

const APP_TIME_ZONE = 'Europe/Paris';

function dateKeyInTimeZone(date = new Date(), timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function timeZoneOffsetForGoogleTimeMin(date = new Date(), timeZone = APP_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset'
  }).formatToParts(date);
  const offsetName = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+1';
  const match = offsetName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return '+01:00';
  const sign = match[1];
  const hours = String(match[2]).padStart(2, '0');
  const minutes = String(match[3] || '00').padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function parisTodayStartLocal() {
  return `${dateKeyInTimeZone(new Date(), APP_TIME_ZONE)}T00:00`;
}

function parisTodayStartGoogleTimeMin() {
  const today = dateKeyInTimeZone(new Date(), APP_TIME_ZONE);
  const offset = timeZoneOffsetForGoogleTimeMin(new Date(`${today}T12:00:00Z`), APP_TIME_ZONE);
  return `${today}T00:00:00${offset}`;
}

function localAgendaDateKey(value) {
  const normalized = googleSync.normalizeAgendaDateTime(value, APP_TIME_ZONE);
  return normalized ? normalized.slice(0, 10) : '';
}

function eventLastVisibleDateKey(event) {
  return localAgendaDateKey(event?.end_date) || localAgendaDateKey(event?.start_date);
}

function purgeExpiredLocalAgendaEvents() {
  const today = dateKeyInTimeZone(new Date(), APP_TIME_ZONE);
  const expiredIds = db
    .prepare('SELECT id, start_date, end_date FROM events')
    .all()
    .filter((event) => {
      const lastVisibleDate = eventLastVisibleDateKey(event);
      return lastVisibleDate && lastVisibleDate < today;
    })
    .map((event) => event.id);

  if (!expiredIds.length) return 0;

  const deleteEvent = db.prepare('DELETE FROM events WHERE id = ?');
  const deleteExpiredEvents = db.transaction((ids) => {
    for (const id of ids) deleteEvent.run(id);
  });
  deleteExpiredEvents(expiredIds);
  console.log(`Agenda: ${expiredIds.length} événement(s) passé(s) supprimé(s) localement.`);
  return expiredIds.length;
}

function purgeExpiredLocalAgendaEventsSafely() {
  try {
    return purgeExpiredLocalAgendaEvents();
  } catch (err) {
    console.error('Erreur purge automatique agenda local :', err);
    return 0;
  }
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

function formatChantierDurationLabel(minutes) {
  const total = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(total / 60);
  const remainingMinutes = total % 60;
  if (!remainingMinutes) return `${hours} h`;
  return `${hours} h ${String(remainingMinutes).padStart(2, '0')}`;
}

function parseChantierHoursDuration(hoursValue, minutesValue) {
  const hoursRaw = String(hoursValue ?? '').trim();
  const minutesRaw = String(minutesValue ?? '').trim();
  if (!/^\d+$/.test(hoursRaw)) return { error: 'Heures invalides' };
  if (!/^(0|15|30|45)$/.test(minutesRaw)) return { error: 'Minutes invalides' };

  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const minutesTotal = hours * 60 + minutes;

  if (hours < 0) return { error: 'Heures invalides' };
  if (minutesTotal <= 0) return { error: 'La durée doit être supérieure à 0 minute' };

  return { hours, minutes, minutesTotal };
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
const SKETCHES_DIR = resolveStoragePath(process.env.OUTIL_PME_SKETCHES_DIR, path.join(STORAGE_DIR, 'sketches'));
const PDF_STORAGE_DIR = resolveStoragePath(process.env.OUTIL_PME_PDF_DIR, path.join(STORAGE_DIR, 'pdf'));
const ESCALIER_V2_PHOTO_DIR = resolveStoragePath(
  process.env.OUTIL_PME_ESCALIER_V2_PHOTO_DIR,
  path.join(STORAGE_DIR, 'measurement_photos', 'escalier-v2')
);
const MEASUREMENT_PHOTO_DIR = resolveStoragePath(
  process.env.OUTIL_PME_MEASUREMENT_PHOTO_DIR,
  path.join(STORAGE_DIR, 'measurements')
);
const EBP_SCAN_DIR = resolveStoragePath(process.env.OUTIL_PME_EBP_SCAN_DIR, path.join(STORAGE_DIR, 'ebp_scans'));
const EBP_SCAN_TMP_DIR = resolveStoragePath(process.env.OUTIL_PME_EBP_SCAN_TMP_DIR, path.join(STORAGE_DIR, 'tmp', 'ebp-scans'));
const EBP_INCOMING_DIR = resolveStoragePath(process.env.OUTIL_PME_EBP_INCOMING_DIR, path.join(STORAGE_DIR, 'incoming-ebp'));
const EBP_INCOMING_PROCESSED_DIR = safeResolveInside(EBP_INCOMING_DIR, 'traites');
const EBP_SCAN_LAST_PDF_TEXT_PATH = safeResolveInside(EBP_SCAN_TMP_DIR, 'last-pdf-text.txt');

ensureDir(STORAGE_DIR);
ensureDir(DATA_DIR);
ensureDir(path.dirname(DB_PATH));
ensureDir(CLIENT_PC_DIR);
ensureDir(CLIENT_ORDER_FILES_DIR);
ensureDir(QUOTE_PHOTO_DIR);
ensureDir(SKETCHES_DIR);
ensureDir(PDF_STORAGE_DIR);
ensureDir(ESCALIER_V2_PHOTO_DIR);
ensureDir(MEASUREMENT_PHOTO_DIR);
ensureDir(EBP_SCAN_DIR);
ensureDir(EBP_SCAN_TMP_DIR);
ensureDir(EBP_INCOMING_DIR);
ensureDir(EBP_INCOMING_PROCESSED_DIR);
const SCANNER_DIRS = incomingDocuments.ensureScannerDirectories(STORAGE_DIR);
const SCANNER_IMPORT_ENABLED = String(process.env.SCANNER_IMPORT_ENABLED || 'true').toLowerCase() !== 'false';
const SCANNER_IMPORT_INTERVAL_MS = Math.min(300000, Math.max(2000, parsePositiveInt(process.env.SCANNER_IMPORT_INTERVAL_MS, 10000)));
const SCANNER_MAX_FILE_SIZE_BYTES = Math.min(100, Math.max(1, parsePositiveInt(process.env.SCANNER_MAX_FILE_SIZE_MB, 25))) * 1024 * 1024;

const MEASUREMENTS_PUBLIC_DIR = path.join(__dirname, 'modules', 'measurements', 'public');
const MEASUREMENT_SHEETS = {
  escalier: 'measurements.html',
  'escalier-v2': 'escalier-v2.html',
  'garde-corps': 'garde-corps.html',
  portail: 'portail.html',
  cloture: 'cloture.html',
  pergola: 'pergola.html',
  verriere: 'verriere.html',
  autres: 'autres.html',
};
const MEASUREMENTS_ASSETS = new Set([
  'measurement-modern.css',
  'measurement-modern.js',
  'measurements.css',
  'measurements.js',
  'module-sheet.js',
  'sketchpad.js',
  'escalier-v2.css',
  'escalier-v2.js',
  'croquis-technique.css',
  'croquis-technique.js',
  'photo-recovery.js',
]);
const TECHNICAL_DRAWING_ASSETS = new Set([
  'technical-drawing-editor.css',
  'technical-drawing-core.js',
  'technical-drawing-editor.js',
  'technical-drawing-template.js',
  'technical-drawing-symbols.js',
]);
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

function removeStoragePathIfExists(targetPath) {
  const storageBase = path.resolve(STORAGE_DIR);
  const target = path.resolve(targetPath);
  if (!target.startsWith(storageBase + path.sep) && target !== storageBase) {
    console.warn('Suppression ignoree hors storage:', target);
    return;
  }
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}
function normalizeKey(str) {
  return safeName(str).toLowerCase();
}

function clientOrderFolderName(order) {
  return safeName(order?.description && String(order.description).trim() !== '' ? order.description : `Commande_${order?.id}`);
}

function findClientOrderByFolder(clientFolder, orderFolder) {
  return clientOrderFolderService.resolveClientOrder(clientFolder, orderFolder);
}

function normalizePurchaseStatus(value) {
  const status = String(value || '').trim();
  return ['À commander', 'Commandé', 'Reçu'].includes(status) ? status : 'À commander';
}

function purchaseStatusOptions(selected) {
  const current = normalizePurchaseStatus(selected);
  return ['À commander', 'Commandé', 'Reçu']
    .map((status) => `<option value="${escHtml(status)}"${status === current ? ' selected' : ''}>${escHtml(status)}</option>`)
    .join('');
}

function purchaseStatusClass(status) {
  const current = normalizePurchaseStatus(status);
  if (current === 'Reçu') return 'received';
  if (current === 'Commandé') return 'ordered';
  return 'todo';
}

function getPurchaseOrderRedirect(order) {
  const orderFolderName = clientOrderFolderName(order);
  return `/pc-folders/${encodeURIComponent(safeName(order.name))}/${encodeURIComponent(orderFolderName)}/Commandes`;
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildClientCandidates() {
  const map = new Map();
  const push = (name, source) => {
    const raw = String(name || '').trim();
    if (!raw) return;
    const key = normalizeSearchText(raw);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { name: raw, sources: new Set([source]) });
      return;
    }
    map.get(key).sources.add(source);
  };

  db.prepare("SELECT name FROM clients WHERE name IS NOT NULL AND TRIM(name) != ''").all().forEach((row) => {
    push(row.name, 'sqlite');
  });

  try {
    fs.readdirSync(CLIENT_PC_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => {
        push(entry.name, 'storage');
      });
  } catch {}

  return Array.from(map.values()).map((item) => ({
    name: item.name,
    sources: Array.from(item.sources),
  }));
}

function scoreClientMatch(detected, candidate) {
  const a = normalizeSearchText(detected);
  const b = normalizeSearchText(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let common = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) common += 1;
  }
  return common / Math.max(aTokens.size, bTokens.size);
}

function findBestClientMatch(detectedName) {
  const candidates = buildClientCandidates();
  if (!String(detectedName || '').trim()) {
    return { best: null, candidates };
  }
  let best = null;
  for (const candidate of candidates) {
    const score = scoreClientMatch(detectedName, candidate.name);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (!best || best.score < 0.55) return { best: null, candidates };
  return { best, candidates };
}

function parseFrenchAmount(raw) {
  const cleaned = String(raw || '')
    .replace(/\s+/g, '')
    .replace(/€/g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? round2(n) : null;
}

function pickAmountWithLabel(text, labels) {
  const raw = String(text || '');
  for (const label of labels) {
    const re = new RegExp(`${label}[^0-9]{0,24}([0-9][0-9 .,'\\u00A0]*)`, 'i');
    const match = raw.match(re);
    if (!match) continue;
    const amount = parseFrenchAmount(match[1]);
    if (amount !== null) return amount;
  }
  return null;
}

function normalizeOcrLine(line) {
  return String(line || '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLabeledValue(lines, labels) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeOcrLine(lines[i]);
    if (!line) continue;
    const normalized = normalizeSearchText(line);
    for (const label of labels) {
      const normalizedLabel = normalizeSearchText(label);
      if (!normalizedLabel) continue;

      if (normalized.startsWith(normalizedLabel)) {
        const remainder = line.slice(label.length).replace(/^\s*[:\-–—]\s*/, '').trim();
        if (remainder) return remainder;
        if (lines[i + 1]) {
          const next = normalizeOcrLine(lines[i + 1]);
          if (next && !/^\d+[\s\S]*$/.test(next)) return next;
        }
      }

      const index = normalized.indexOf(normalizedLabel);
      if (index >= 0 && index < 14) {
        const after = line.slice(Math.min(line.length, label.length + index)).replace(/^.*?[:\-–—]\s*/, '').trim();
        if (after) return after;
      }
    }
  }
  return '';
}

function pickBestAmountFromText(text, labels) {
  const raw = String(text || '');
  const amountPattern = /([0-9]{1,3}(?:[ .\u00A0][0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)/g;
  for (const label of labels) {
    const labelMatch = raw.match(new RegExp(`${label}`, 'i'));
    if (!labelMatch) continue;

    const snippetStart = Math.max(0, raw.toLowerCase().indexOf(labelMatch[0].toLowerCase()));
    const snippet = raw.slice(snippetStart, snippetStart + 140);
    const values = Array.from(snippet.matchAll(amountPattern)).map((m) => parseFrenchAmount(m[1])).filter((v) => v !== null);
    if (values.length) return values[0];
  }
  return null;
}

function isLikelyCompanyLine(line) {
  const normalized = normalizeSearchText(line);
  if (!normalized) return false;
  return /(sarl|sas|sa|eurl|entreprise|metallerie|métallerie|ferronnerie|batiment|bâtiment|construction|industrie|artisan)/i.test(line)
    || /^((\d{1,4}\s+)?(rue|avenue|bd|boulevard|route|zone|zi|zac)\b)/i.test(line)
    || /(tel|tél|telephone|mobile|mail|@)/i.test(line);
}

function guessClientFromLines(lines) {
  const labels = [
    'client',
    'nom du client',
    'client facture',
    'client facturation',
    'raison sociale',
    'destinataire',
    'adresse facturation',
    'adresse de facturation',
    'adresse livraison',
    'facture à',
    'commande pour',
    'devis pour',
  ];

  const labeled = extractLabeledValue(lines, labels);
  if (labeled && !isLikelyCompanyLine(labeled)) return labeled;

  for (const line of lines) {
    const normalized = normalizeOcrLine(line);
    if (!normalized) continue;
    if (/^client\b/i.test(normalized)) {
      const cleaned = normalized.replace(/^client\b[:\-–—]*/i, '').trim();
      if (cleaned && !isLikelyCompanyLine(cleaned)) return cleaned;
    }
  }

  const candidateLines = lines.filter((line) => {
    const normalized = normalizeOcrLine(line);
    if (!normalized) return false;
    if (isLikelyCompanyLine(normalized)) return false;
    if (/^(devis|facture|bon de commande|commande|offre|total|ht|ttc|date|objet|intitul|reference|référence)/i.test(normalized)) return false;
    return /[A-Za-zÀ-ÿ]{2,}/.test(normalized) && normalized.length <= 80;
  });

  return candidateLines[0] || '';
}

function guessTitleFromLines(lines) {
  const titleLabels = [
    'objet',
    'intitule',
    'intitulé',
    'désignation',
    'designation',
    'travaux',
    'prestation',
    'chantier',
  ];

  const labeled = extractLabeledValue(lines, titleLabels);
  if (labeled) return labeled;

  const useful = lines.filter((line) => {
    const normalized = normalizeOcrLine(line);
    if (!normalized) return false;
    if (/^(devis|client|facture|adresse|date|page|référence|reference|tel|tél|siret|sas|sarl|montant|total)/i.test(normalized)) return false;
    return /[A-Za-zÀ-ÿ]{3,}/.test(normalized);
  });

  return useful.find((line) => /(escalier|portail|garde-corps|garde corps|cloture|clôture|pergola|verriere|vérrière|terrasse|rampe|main courante)/i.test(line)) || useful[0] || '';
}

function extractEbpFieldsFromText(text) {
  const parsedEbp = parseEbpQuoteText(text);
  if (parsedEbp.recognized) {
    return parsedEbp;
  }

  const raw = String(text || '');
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const clientName = guessClientFromLines(lines);

  let quoteNumber = '';
  const quotePatterns = [
    /devis\s*(?:n[°o]|numero|num|ref(?:erence)?|réf(?:érence)?)?\s*[:#\-–—]?\s*([A-Z0-9][A-Z0-9\-\/_]*)/i,
    /(?:ref(?:erence)?|réf(?:érence)?)\s*devis\s*[:#\-–—]?\s*([A-Z0-9][A-Z0-9\-\/_]*)/i,
  ];
  for (const pattern of quotePatterns) {
    const match = raw.match(pattern);
    if (match) {
      quoteNumber = match[1].trim();
      break;
    }
  }

  let quoteDate = '';
  const datePatterns = [
    /(?:date|du)\s*[:\-–—]?\s*(\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i,
    /(?:édité le|emis le|émis le|date de création)\s*[:\-–—]?\s*(\d{2}[\/\-.]\d{2}[\/\-.]\d{2,4}|\d{4}[\-\/]\d{2}[\-\/]\d{2})/i,
  ];
  for (const pattern of datePatterns) {
    const dateMatch = raw.match(pattern);
    if (!dateMatch) continue;
    const d = dateMatch[1].replace(/\./g, '/');
    const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
    const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fr) {
      const year = fr[3].length === 2 ? `20${fr[3]}` : fr[3];
      quoteDate = `${year}-${fr[2]}-${fr[1]}`;
      break;
    }
    if (iso) {
      quoteDate = `${iso[1]}-${iso[2]}-${iso[3]}`;
      break;
    }
  }

  const title = guessTitleFromLines(lines) || '';

  const amountHt = pickBestAmountFromText(raw, ['total ht', 'montant ht', 'sous total ht', 'net ht', 'base ht', 'prix ht'])
    ?? pickAmountWithLabel(raw, ['total\s*ht', 'montant\s*ht', 'sous\s*total\s*ht', 'net\s*ht', 'base\s*ht', '\bht\b']);
  const amountTtc = pickBestAmountFromText(raw, ['total ttc', 'montant ttc', 'net a payer', 'net à payer', 'total general', 'total général'])
    ?? pickAmountWithLabel(raw, ['total\s*ttc', 'montant\s*ttc', 'net\s*a\s*payer', 'net\s*à\s*payer', 'total\s*g[ée]n[ée]ral', '\bttc\b']);

  return {
    recognized: false,
    matched: false,
    reason: parsedEbp.reason || 'Format EBP non reconnu',
    markersFound: parsedEbp.markersFound || [],
    markersMissing: parsedEbp.markersMissing || [],
    inputLength: parsedEbp.inputLength || String(text || '').length,
    primaryTextLength: parsedEbp.primaryTextLength || 0,
    diagnostic: parsedEbp.diagnostic || {
      matched: false,
      reason: parsedEbp.reason || 'Format EBP non reconnu',
      markersFound: parsedEbp.markersFound || [],
      markersMissing: parsedEbp.markersMissing || [],
      inputLength: parsedEbp.inputLength || String(text || '').length,
      primaryTextLength: parsedEbp.primaryTextLength || 0,
    },
    analysisUsed: 'Analyse générique',
    parserName: 'Analyse générique',
    client_name: clientName,
    amount_ht: amountHt,
    amount_ttc: amountTtc,
    quote_number: quoteNumber,
    quote_date: quoteDate,
    title: title,
  };
}

function extractEbpInvoiceFieldsFromText(text) {
  const parsed = parseEbpInvoiceText(text);
  const raw = String(text || '');

  let invoiceNumber = parsed.invoice_number || '';
  if (!invoiceNumber) {
    const match = raw.match(/\b(?:facture|avoir)\s*(?:n[Â°o]|numero|num)?\s*[:#\-â€“â€”]?\s*([A-Z0-9][A-Z0-9\-\/_]*)/i);
    if (match) invoiceNumber = match[1].trim().toUpperCase();
  }

  let invoiceDate = parsed.invoice_date || '';
  if (invoiceDate && /^\d{2}\/\d{2}\/\d{4}$/.test(invoiceDate)) {
    const [day, month, year] = invoiceDate.split('/');
    invoiceDate = `${year}-${month}-${day}`;
  }

  return {
    ...parsed,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    client_name: parsed.client_name || guessClientFromLines(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)),
    amount_ht: parsed.amount_ht,
    vat_amount: parsed.vat_amount,
    amount_ttc: parsed.amount_ttc,
  };
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function clientOrderFolderPath(order) {
  const clientFolder = safeName(order.name);
  const orderFolder = clientOrderFolderName(order);
  return safeResolveInside(safeResolveInside(CLIENT_PC_DIR, clientFolder), orderFolder);
}

function clientOrderInvoicesDir(order) {
  const orderDir = clientOrderFolderPath(order);
  ensureStandardSubfolders(orderDir);
  const invoicesDir = safeResolveInside(orderDir, 'Factures');
  ensureDir(invoicesDir);
  return invoicesDir;
}

function validateExistingInvoiceFile(order, fileName) {
  const safeFileName = path.basename(String(fileName || ''));
  if (!safeFileName) throw new Error('Fichier facture manquant');

  const ext = path.extname(safeFileName).toLowerCase();
  if (!EBP_SCAN_ALLOWED_EXT.has(ext)) {
    throw new Error('Format non supporte. Utilisez PDF, JPG, PNG, HEIC ou HEIF.');
  }

  const invoicesDir = clientOrderInvoicesDir(order);
  const filePath = safeResolveInside(invoicesDir, safeFileName);
  if (!fs.existsSync(filePath) || !fs.lstatSync(filePath).isFile()) {
    throw new Error('Fichier facture introuvable dans le dossier Factures.');
  }

  const stat = fs.statSync(filePath);
  if (stat.size > EBP_SCAN_MAX_FILE_SIZE_BYTES) {
    throw new Error('Fichier facture trop volumineux. Limite: 25 Mo.');
  }

  return {
    fileName: safeFileName,
    filePath,
    mimeType: EBP_SCAN_MIME_BY_EXT[ext] || 'application/octet-stream',
    size: stat.size,
  };
}

function parseJsonObject(value, fallback = {}) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function latestProjectForecast(clientOrderId) {
  const row = db.prepare(`
    SELECT * FROM project_profitability_forecasts
    WHERE client_order_id = ?
    ORDER BY created_at DESC, id DESC LIMIT 1
  `).get(clientOrderId);
  if (!row) return null;
  const snapshot = parseJsonObject(row.snapshot_json, {});
  if (Object.keys(snapshot).length) return { ...snapshot, forecastId: row.id };
  return {
    forecastId: row.id,
    quoteId: row.quote_id,
    totalHT: Number(row.total_ht || 0),
    breakdown: {
      material: Number(row.material_cost || 0), subcontracting: Number(row.subcontracting_cost || 0),
      galvanizing: Number(row.galvanizing_cost || 0), powderCoating: Number(row.powder_coating_cost || 0),
      motorization: Number(row.motorization_cost || 0), accessories: Number(row.accessories_cost || 0),
      transport: Number(row.transport_cost || 0), consumables: Number(row.consumables_cost || 0),
      rental: Number(row.rental_cost || 0)
    },
    hours: { study: Number(row.study_hours || 0), workshop: Number(row.workshop_hours || 0), installation: Number(row.installation_hours || 0) },
    hourlyCost: Number(row.hourly_cost || projectProfitability.PROFITABILITY_RULES.defaultHourlyCost),
    forecastCost: Number(row.forecast_cost || 0), margin: Number(row.forecast_margin || 0),
    marginOnSale: row.forecast_margin_rate === null ? null : Number(row.forecast_margin_rate), category: row.work_category || 'autre'
  };
}

function saveProjectForecast(quote, lines, clientOrderId) {
  const snapshot = projectProfitability.buildForecastSnapshot(quote, lines);
  db.prepare(`
    INSERT INTO project_profitability_forecasts
      (quote_id, client_order_id, total_ht, material_cost, subcontracting_cost, galvanizing_cost,
       powder_coating_cost, motorization_cost, accessories_cost, transport_cost, consumables_cost,
       rental_cost, study_hours, workshop_hours, installation_hours, hourly_cost, forecast_cost,
       forecast_margin, forecast_margin_rate, work_category, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quote.id, clientOrderId, snapshot.totalHT, snapshot.breakdown.material, snapshot.breakdown.subcontracting,
    snapshot.breakdown.galvanizing, snapshot.breakdown.powderCoating, snapshot.breakdown.motorization,
    snapshot.breakdown.accessories, snapshot.breakdown.transport, snapshot.breakdown.consumables,
    snapshot.breakdown.rental, snapshot.hours.study, snapshot.hours.workshop, snapshot.hours.installation,
    snapshot.hourlyCost, snapshot.forecastCost, snapshot.margin, snapshot.marginOnSale, snapshot.category,
    JSON.stringify(snapshot), new Date().toISOString()
  );
  return snapshot;
}

function projectProfitabilityForOrder(order) {
  const forecast = latestProjectForecast(order.id);
  const hours = db.prepare(`
    SELECT * FROM chantier_hours
    WHERE client_order_id = ? OR (client_order_id IS NULL AND client = ? AND order_name = ?)
  `).all(order.id, safeName(order.name), safeName(order.description || `Commande_${order.id}`));
  const costs = db.prepare('SELECT * FROM project_actual_costs WHERE client_order_id = ? ORDER BY cost_date DESC, id DESC').all(order.id);
  const invoices = db.prepare('SELECT * FROM client_order_invoices WHERE client_order_id = ? ORDER BY invoice_date DESC, id DESC').all(order.id);
  return { forecast, hours, costs, invoices, actual: projectProfitability.calculateActual({ order, forecast, hours, costs, invoices }) };
}

function renderProjectProfitabilityCard(order, data) {
  const forecast = data.forecast;
  const actual = data.actual;
  const money = (value) => formatEuroFr(Number(value || 0));
  const percent = (value) => value == null ? 'Non calculable' : `${Number(value).toFixed(2)} %`;
  const metric = (label, value, className = '') => `<div><span>${escHtml(label)}</span><strong class="${className}">${escHtml(value)}</strong></div>`;
  const forecastHtml = forecast
    ? [
        metric('Chiffre d’affaires HT', money(forecast.totalHT)),
        metric('Coût matière', money(forecast.breakdown?.material)),
        metric('Sous-traitance', money(forecast.breakdown?.subcontracting)),
        metric('Main-d’œuvre', money(forecast.laborCost)),
        metric('Coût de revient', money(forecast.forecastCost)),
        metric('Marge', money(forecast.margin)),
        metric('Marge sur vente', percent(forecast.marginOnSale)),
        metric('Heures prévues', `${Number(forecast.hours?.total || 0).toFixed(2)} h`)
      ].join('')
    : '<p class="profitability-empty">Aucun instantané prévisionnel : commande ancienne ou créée manuellement.</p>';
  const actualHtml = [
    metric('Montant facturé HT', money(actual.invoicedHT)),
    metric('Achats et coûts réels', money(actual.purchasesCost)),
    metric('Sous-traitance réelle', money(actual.costsByType.subcontracting)),
    metric('Main-d’œuvre réelle', money(actual.laborCost)),
    metric('Autres coûts', money(actual.costsByType.other)),
    metric('Coût réel total', money(actual.actualCost)),
    metric('Marge réelle', money(actual.margin)),
    metric('Marge réelle sur vente', percent(actual.marginOnSale)),
    metric('Heures réalisées', `${actual.actualHours.toFixed(2)} h`)
  ].join('');
  const costRows = data.costs.length
    ? data.costs.map((cost) => `<article class="profitability-cost-row"><div><strong>${escHtml(cost.description || cost.cost_type)}</strong><span>${escHtml(cost.cost_type)} · ${escHtml(cost.cost_date || '')}</span></div><strong>${money(cost.amount_ht)}</strong><button type="button" class="modern-danger-btn" data-delete-actual-cost="${cost.id}">Supprimer</button></article>`).join('')
    : '<p class="profitability-empty">Aucun coût réel manuel ou fournisseur rattaché.</p>';
  return `
    <section class="pc-modern-panel project-profitability-card" data-project-profitability data-order-id="${order.id}">
      <div class="modern-section-title"><span class="quote-ai-review-icon">${clientPageIcon('quotes')}</span><div><h2>Rentabilité du chantier</h2><p>Comparaison de l’instantané accepté avec les données réellement saisies.</p></div></div>
      <div class="project-profitability-columns">
        <article><h3>Prévisionnel</h3><div class="project-profitability-metrics">${forecastHtml}</div></article>
        <article><h3>Réel</h3><div class="project-profitability-metrics">${actualHtml}</div></article>
      </div>
      <div class="project-profitability-variances">
        ${metric('Écart coût prévu / réel', money(actual.costVariance), actual.costVariance > 0 ? 'profit-negative' : 'profit-positive')}
        ${metric('Écart de marge', actual.marginPointVariance == null ? 'Non calculable' : `${actual.marginPointVariance > 0 ? '+' : ''}${actual.marginPointVariance.toFixed(2)} points`, actual.marginPointVariance < 0 ? 'profit-negative' : 'profit-positive')}
        ${metric('Écart heures', `${actual.hourVariance > 0 ? '+' : ''}${actual.hourVariance.toFixed(2)} h (${percent(actual.hourVariancePct)})`, actual.hourVariance > 0 ? 'profit-negative' : 'profit-positive')}
        ${metric('Cause principale', actual.mainVarianceCause ? `${actual.mainVarianceCause.type} : +${money(actual.mainVarianceCause.variance)}` : 'Aucun dépassement identifié')}
      </div>
      <details class="profitability-costs"><summary>Coûts réels rattachés</summary><div class="profitability-cost-list">${costRows}</div>
        <form class="profitability-cost-form" data-actual-cost-form>
          <label><span>Type</span><select name="cost_type" required>${projectProfitability.ACTUAL_COST_TYPES.map((type) => `<option value="${type}">${type}</option>`).join('')}</select></label>
          <label><span>Description</span><input name="description" placeholder="Carburant, péage, grue…"></label>
          <label><span>Montant HT</span><input type="number" name="amount_ht" min="0" step="0.01" required></label>
          <label><span>Date</span><input type="date" name="cost_date" value="${isoDate()}"></label>
          <button class="clients-submit-btn" type="submit">Ajouter le coût réel</button><span data-cost-status></span>
        </form>
      </details>
      <p class="quote-ai-disclaimer">Les calculs n’altèrent aucune heure, facture ou commande. Les coûts ne sont ajoutés qu’après validation explicite de ce formulaire.</p>
      <script>(function(){var root=document.querySelector('[data-project-profitability][data-order-id="${order.id}"]');if(!root)return;var orderId=root.dataset.orderId;var form=root.querySelector('[data-actual-cost-form]');var status=root.querySelector('[data-cost-status]');form.addEventListener('submit',async function(event){event.preventDefault();status.textContent='Enregistrement…';var body=Object.fromEntries(new FormData(form).entries());try{var response=await fetch('/api/orders/'+orderId+'/actual-costs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var data=await response.json();if(!response.ok)throw new Error(data.error||'Erreur');location.reload();}catch(error){status.textContent=error.message||'Erreur';}});root.querySelectorAll('[data-delete-actual-cost]').forEach(function(button){button.addEventListener('click',async function(){if(!confirm('Supprimer uniquement ce coût réel ?'))return;var response=await fetch('/api/orders/'+orderId+'/actual-costs/'+button.dataset.deleteActualCost+'/delete',{method:'POST'});if(response.ok)location.reload();});});})();</script>
    </section>`;
}

function clientOrderDetailRedirect(order) {
  return `/orders/client/${order.id}/profitability#order-budget`;
}

function clientOrderFolderUrl(order) {
  return `/pc-folders/${encodeURIComponent(safeName(order.name))}/${encodeURIComponent(clientOrderFolderName(order))}`;
}

function importMissingQuoteCostLines(clientOrderId, quoteId) {
  const orderId = Number(clientOrderId || 0);
  const linkedQuoteId = Number(quoteId || 0);
  if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(linkedQuoteId) || linkedQuoteId <= 0) {
    return { imported: 0, available: 0 };
  }
  const quoteLines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position, id').all(linkedQuoteId);
  const excluded = new Set(db.prepare('SELECT source_quote_line_id FROM client_order_cost_line_exclusions WHERE client_order_id = ?').all(orderId).map((row) => Number(row.source_quote_line_id)));
  const insert = db.prepare(`
    INSERT OR IGNORE INTO client_order_cost_lines
      (client_order_id, line_type, category, designation, quantity, unit, unit_cost_ht, unit_sale_ht,
       planned_minutes, hourly_cost_ht, hourly_sale_ht, notes, source_type, source_quote_line_id,
       sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quote', ?, ?, ?, ?)
  `);
  let imported = 0;
  db.transaction(() => {
    quoteLines.forEach((quoteLine, index) => {
      if (excluded.has(Number(quoteLine.id))) return;
      const line = clientOrderCostLines.quoteLineToCostLine(quoteLine);
      const note = line.incomplete_cost ? 'Coût à compléter : le devis ne contient pas de coût d’achat fiable.' : null;
      const result = insert.run(orderId, line.line_type, line.category, line.designation, line.quantity, line.unit,
        line.unit_cost_ht, line.unit_sale_ht, line.planned_minutes, line.hourly_cost_ht, line.hourly_sale_ht,
        note, quoteLine.id, Number(quoteLine.position || index), new Date().toISOString(), new Date().toISOString());
      imported += Number(result.changes || 0);
    });
  })();
  return { imported, available: quoteLines.length };
}

function clientOrderForecastData(order) {
  const lines = db.prepare('SELECT * FROM client_order_cost_lines WHERE client_order_id = ? ORDER BY sort_order, id').all(order.id);
  const actualMinutes = Number(db.prepare(`
    SELECT COALESCE(SUM(minutes_total), 0) AS total FROM chantier_hours
    WHERE client_order_id = ? OR (client_order_id IS NULL AND client = ? AND order_name = ?)
  `).get(order.id, safeName(order.name), clientOrderFolderName(order))?.total || 0);
  const actualMaterialRows = db.prepare("SELECT amount_ht FROM project_actual_costs WHERE client_order_id = ? AND cost_type = 'material'").all(order.id);
  const actualMaterialCost = actualMaterialRows.length ? actualMaterialRows.reduce((sum, row) => sum + Number(row.amount_ht || 0), 0) : null;
  const quoteLines = order.quote_id
    ? db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position, id').all(order.quote_id)
    : [];
  return { lines, quoteLines, summary: clientOrderCostLines.summarize(lines, order.price, actualMinutes, actualMaterialCost) };
}

function renderOrderActualDetails(order, realData) {
  const actual = realData.actual;
  const hasHours = realData.hours.length > 0;
  const hasCosts = realData.costs.length > 0;
  const material = hasCosts ? actual.costsByType.material : null;
  const other = hasCosts ? round2(actual.purchasesCost - actual.costsByType.material) : null;
  const folderUrl = clientOrderFolderUrl(order);
  const value = (amount) => amount === null ? '<strong class="profit-missing">Non renseigné</strong>' : `<strong>${formatEuroFr(amount)}</strong>`;
  return `<section class="pc-modern-panel profitability-real-section">
    <div class="modern-section-title"><span class="quote-ai-review-icon">${pcFolderIcon('Rentabilité', 'clients-ui-icon')}</span><div><h2>Réel</h2><p>Totaux issus uniquement des données rattachées à cette commande.</p></div></div>
    <div class="profitability-real-grid profitability-real-summary">
      <article><span>Main-d’œuvre réelle</span>${value(hasHours ? actual.laborCost : null)}</article>
      <article><span>Matière réelle</span>${value(material)}</article>
      <article><span>Autres coûts réels</span>${value(other)}</article>
      <article><span>Coût réel total</span>${value(hasHours || hasCosts ? actual.actualCost : null)}</article>
      <article><span>Heures réalisées</span><strong class="${hasHours ? '' : 'profit-missing'}">${hasHours ? `${actual.actualHours.toFixed(2)} h` : 'Non renseigné'}</strong></article>
    </div>
    <nav class="profitability-folder-links" aria-label="Consulter les données détaillées"><a href="${folderUrl}/Heure%20chantier">Voir les heures</a><a href="${folderUrl}/Factures">Voir les factures</a><a href="${folderUrl}/Devis">Voir les devis</a></nav>
  </section>`;
}

function renderOrderProfitabilityComparison(forecastData, realData) {
  const forecast = forecastData.summary;
  const actual = realData.actual;
  const hasHours = realData.hours.length > 0;
  const hasCosts = realData.costs.length > 0;
  const actualMaterial = hasCosts ? actual.costsByType.material : null;
  const rows = [
    ['Heures', forecast.plannedHours, hasHours ? actual.actualHours : null, 'hours'],
    ['Main-d’œuvre', forecast.groups.labor.cost, hasHours ? actual.laborCost : null, 'money'],
    ['Matière', forecast.groups.material.cost, actualMaterial, 'money'],
    ['Coût total', forecast.totalCost, hasHours || hasCosts ? actual.actualCost : null, 'money']
  ];
  const renderValue = (value, type) => value === null ? 'Donnée non renseignée' : type === 'hours' ? `${Number(value).toFixed(2)} h` : formatEuroFr(value);
  return `<section class="pc-modern-panel profitability-comparison-section"><div class="modern-section-title"><span class="quote-ai-review-icon">${pcFolderIcon('Rentabilité', 'clients-ui-icon')}</span><div><h2>Écarts</h2><p>Un dépassement de coût apparaît en rouge.</p></div></div><div class="profitability-comparison-grid">
    ${rows.map(([label, planned, real, type]) => {
      const difference = real === null ? null : round2(Number(real || 0) - Number(planned || 0));
      return `<article><h3>${label}</h3><div><span>Prévu</span><strong>${renderValue(planned, type)}</strong></div><div><span>Réel</span><strong class="${real === null ? 'profit-missing' : ''}">${renderValue(real, type)}</strong></div><div><span>Écart</span><strong class="${difference === null ? 'profit-missing' : difference > 0 ? 'profit-negative' : difference < 0 ? 'profit-positive' : ''}">${difference === null ? 'Non renseigné' : `${difference > 0 ? '+' : ''}${renderValue(difference, type)}`}</strong></div></article>`;
    }).join('')}
  </div></section>`;
}

async function extractTextFromPdfBuffer(buffer) {
  if (!pdfParse) return { text: '', wordCount: 0, warning: 'pdf-parse indisponible: extraction PDF désactivée.' };
  try {
    const result = await pdfParse(buffer);
    const text = String(result?.text || '');
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { text, wordCount, pageCount: Number(result?.numpages || 0), warning: '' };
  } catch (err) {
    console.error('Scan EBP: lecture PDF impossible:', err.message || err);
    return { text: '', wordCount: 0, warning: 'Lecture PDF impossible. Vérifiez le fichier ou complétez manuellement.' };
  }
}

async function preprocessImageBufferForOcr(buffer, mimeType) {
  let imageBuffer = buffer;
  if ((mimeType || '').includes('heic') || (mimeType || '').includes('heif')) {
    if (!heicConvert) {
      return { buffer: null, warning: 'HEIC détecté mais conversion indisponible. Utilisez JPG/PNG ou installez heic-convert.' };
    }
    try {
      imageBuffer = await heicConvert({
        buffer,
        format: 'JPEG',
        quality: 0.92,
      });
    } catch {
      return { buffer: null, warning: 'Conversion HEIC impossible. Utilisez JPG/PNG/PDF ou corrigez manuellement.' };
    }
  }

  if (!sharp) {
    return { buffer: imageBuffer, warning: '' };
  }

  try {
    const prepared = await sharp(imageBuffer)
      .rotate()
      .resize({ width: 2400, withoutEnlargement: true })
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer();
    return { buffer: prepared, warning: '' };
  } catch {
    return { buffer: imageBuffer, warning: 'Prétraitement image ignoré, OCR lancé sur l’image brute.' };
  }
}

async function extractTextFromImageBuffer(buffer, mimeType) {
  if (!tesseractJs) {
    return { text: '', wordCount: 0, warning: 'tesseract.js indisponible: OCR image désactivé.' };
  }
  const preprocessed = await preprocessImageBufferForOcr(buffer, mimeType);
  if (!preprocessed.buffer) return { text: '', wordCount: 0, warning: preprocessed.warning };
  const imageBuffer = preprocessed.buffer;
  try {
    const worker = await tesseractJs.createWorker('fra+eng');
    const result = await worker.recognize(imageBuffer);
    await worker.terminate();
    const text = String(result?.data?.text || '');
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { text, wordCount, warning: preprocessed.warning || '' };
  } catch {
    return { text: '', wordCount: 0, warning: preprocessed.warning || 'OCR image impossible. Complétez manuellement les champs.' };
  }
}

async function analyzeEbpFile(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);
  const lowerMime = String(mimeType || '').toLowerCase();
  const isPdf = lowerMime.includes('pdf') || path.extname(String(filePath || '')).toLowerCase() === '.pdf';

  if (isPdf) {
    const pdfResult = await extractTextFromPdfBuffer(buffer);
    try {
      fs.writeFileSync(EBP_SCAN_LAST_PDF_TEXT_PATH, String(pdfResult.text || ''), 'utf8');
    } catch (e) {
      console.warn('Impossible d\'écrire le debug PDF EBP:', e.message);
    }
    const pdfTextLength = String(pdfResult.text || '').trim().replace(/\s+/g, ' ').length;
    const hasEnoughText = pdfResult.wordCount >= 15 || pdfTextLength >= 100;
    if (hasEnoughText) {
      return {
        source: 'pdf',
        pdfText: pdfResult.text,
        ocrText: '',
        text: pdfResult.text,
        warning: '',
        ocrWarning: '',
        pdfWordCount: pdfResult.wordCount,
        pdfPageCount: pdfResult.pageCount || 0,
        ocrWordCount: 0,
      };
    }

    const ocrResult = await extractTextFromImageBuffer(buffer, lowerMime);
    return {
      source: 'ocr',
      pdfText: pdfResult.text,
      ocrText: ocrResult.text,
      text: ocrResult.text || pdfResult.text,
      warning: pdfResult.warning || ocrResult.warning || 'PDF peu textuel: OCR utilisé en secours.',
      ocrWarning: ocrResult.warning || '',
      pdfWordCount: pdfResult.wordCount,
      pdfPageCount: pdfResult.pageCount || 0,
      ocrWordCount: ocrResult.wordCount,
    };
  }

  const ocrResult = await extractTextFromImageBuffer(buffer, lowerMime);
  return {
    source: 'ocr',
    pdfText: '',
    ocrText: ocrResult.text,
    text: ocrResult.text,
    warning: ocrResult.warning || '',
    ocrWarning: ocrResult.warning || '',
    pdfWordCount: 0,
    pdfPageCount: 0,
    ocrWordCount: ocrResult.wordCount,
  };
}

function uniqueFilePath(baseDir, desiredFileName) {
  const cleanName = safeSegment(desiredFileName || 'document.pdf');
  const ext = path.extname(cleanName);
  const stem = path.basename(cleanName, ext) || 'document';
  let candidate = cleanName;
  let i = 2;
  while (fs.existsSync(safeResolveInside(baseDir, candidate))) {
    candidate = `${stem}_${i}${ext}`;
    i += 1;
  }
  return safeResolveInside(baseDir, candidate);
}

function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} octets`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function formatDateTimeLabel(rawDate) {
  if (!rawDate) return '—';
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeIncomingPdfName(rawName) {
  const baseName = path.basename(String(rawName || '').trim());
  if (!baseName) return '';
  if (path.extname(baseName).toLowerCase() !== '.pdf') return '';
  return baseName;
}

function listIncomingEbpPdfFiles() {
  ensureDir(EBP_INCOMING_DIR);
  const entries = fs.readdirSync(EBP_INCOMING_DIR, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (path.extname(entry.name).toLowerCase() !== '.pdf') continue;
    const filePath = safeResolveInside(EBP_INCOMING_DIR, entry.name);
    const stats = fs.statSync(filePath);
    files.push({
      name: entry.name,
      addedAt: stats.birthtime || stats.mtime,
      size: stats.size,
    });
  }

  return files.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
}
/* ===================== DB INIT ===================== */

const dataDir = DATA_DIR;
const dbPath = DB_PATH;

console.log('Base SQLite :', dbPath);
console.log('Dossier storage :', STORAGE_DIR);


const db = new Database(dbPath);

initializeSqlite(db);

const SqliteSessionStore = BetterSqlite3SessionStoreFactory
  ? BetterSqlite3SessionStoreFactory(session)
  : null;

const sessionStore = SqliteSessionStore
  ? new SqliteSessionStore({
      client: db,
      expired: {
        clear: true,
        intervalMs: SESSION_STORE_CLEAR_INTERVAL_MS,
      },
    })
  : null;

if (!sessionStore) {
  console.warn('better-sqlite3-session-store indisponible: express-session utilise le MemoryStore.');
}

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
  incomingDocuments.migrateIncomingDocuments(database);
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
      google_event_id TEXT NULL,
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
      client_order_id INTEGER NULL,
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
    CREATE TABLE IF NOT EXISTS client_order_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_order_id INTEGER NOT NULL,
      designation TEXT NOT NULL,
      category TEXT,
      qty REAL DEFAULT 1,
      unit TEXT,
      reference TEXT,
      supplier TEXT,
      needed_date TEXT,
      note TEXT,
      status TEXT DEFAULT 'À commander',
      created_at TEXT,
      updated_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_order_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_order_id INTEGER NOT NULL,
      invoice_number TEXT,
      invoice_date TEXT,
      client_name TEXT,
      amount_ht REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      amount_ttc REAL DEFAULT 0,
      stored_file_name TEXT,
      original_file_name TEXT,
      file_hash TEXT,
      source_type TEXT DEFAULT 'upload',
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
      cost_unit REAL,
      cost_total REAL,
      margin_pct REAL,
      coefficient REAL,
      hours REAL,
      hourly_cost REAL,
      cost_category TEXT,
      cost_source TEXT,
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

  database.prepare(`
    CREATE TABLE IF NOT EXISTS quote_ai_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      total_ht REAL,
      cost_price REAL,
      margin_amount REAL,
      margin_on_cost REAL,
      margin_on_sale REAL,
      checks_json TEXT,
      ai_response_json TEXT,
      model_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER
    )
  `).run();

  database.prepare('CREATE INDEX IF NOT EXISTS idx_quote_ai_reviews_quote_id_created_at ON quote_ai_reviews(quote_id, created_at DESC, id DESC)').run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS quote_profitability_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL UNIQUE,
      material_cost REAL NOT NULL DEFAULT 0,
      laser_cutting_cost REAL NOT NULL DEFAULT 0,
      subcontracting_cost REAL NOT NULL DEFAULT 0,
      galvanizing_cost REAL NOT NULL DEFAULT 0,
      powder_coating_cost REAL NOT NULL DEFAULT 0,
      motorization_cost REAL NOT NULL DEFAULT 0,
      accessories_cost REAL NOT NULL DEFAULT 0,
      transport_cost REAL NOT NULL DEFAULT 0,
      consumables_cost REAL NOT NULL DEFAULT 0,
      rental_cost REAL NOT NULL DEFAULT 0,
      other_cost REAL NOT NULL DEFAULT 0,
      study_hours REAL NOT NULL DEFAULT 0,
      workshop_hours REAL NOT NULL DEFAULT 0,
      installation_hours REAL NOT NULL DEFAULT 0,
      transport_hours REAL NOT NULL DEFAULT 0,
      sav_hours REAL NOT NULL DEFAULT 0,
      hourly_cost REAL NOT NULL DEFAULT 55,
      direct_costs REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      total_cost_price REAL NOT NULL DEFAULT 0,
      work_categories_json TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER
      ,analysis_json TEXT
      ,manual_adjustments_json TEXT
      ,reliability_level TEXT
      ,analyzed_at TEXT
      ,engine_version INTEGER
    )
  `).run();
  database.prepare('CREATE INDEX IF NOT EXISTS idx_quote_profitability_quote ON quote_profitability_forecasts(quote_id)').run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS project_profitability_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER,
      client_order_id INTEGER NOT NULL,
      total_ht REAL NOT NULL DEFAULT 0,
      material_cost REAL NOT NULL DEFAULT 0,
      subcontracting_cost REAL NOT NULL DEFAULT 0,
      galvanizing_cost REAL NOT NULL DEFAULT 0,
      powder_coating_cost REAL NOT NULL DEFAULT 0,
      motorization_cost REAL NOT NULL DEFAULT 0,
      accessories_cost REAL NOT NULL DEFAULT 0,
      transport_cost REAL NOT NULL DEFAULT 0,
      consumables_cost REAL NOT NULL DEFAULT 0,
      rental_cost REAL NOT NULL DEFAULT 0,
      study_hours REAL NOT NULL DEFAULT 0,
      workshop_hours REAL NOT NULL DEFAULT 0,
      installation_hours REAL NOT NULL DEFAULT 0,
      hourly_cost REAL NOT NULL DEFAULT 55,
      forecast_cost REAL NOT NULL DEFAULT 0,
      forecast_margin REAL NOT NULL DEFAULT 0,
      forecast_margin_rate REAL,
      work_category TEXT,
      snapshot_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  database.prepare('CREATE INDEX IF NOT EXISTS idx_profitability_forecasts_order ON project_profitability_forecasts(client_order_id, created_at DESC, id DESC)').run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS project_actual_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_order_id INTEGER NOT NULL,
      cost_type TEXT NOT NULL,
      description TEXT,
      amount_ht REAL NOT NULL DEFAULT 0,
      supplier_invoice_id INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      cost_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER
    )
  `).run();
  database.prepare('CREATE INDEX IF NOT EXISTS idx_project_actual_costs_order ON project_actual_costs(client_order_id, cost_date, id)').run();
  database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_actual_costs_supplier_invoice ON project_actual_costs(supplier_invoice_id) WHERE supplier_invoice_id IS NOT NULL').run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_order_cost_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_order_id INTEGER NOT NULL,
      line_type TEXT NOT NULL,
      category TEXT,
      designation TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT,
      unit_cost_ht REAL NOT NULL DEFAULT 0,
      unit_sale_ht REAL NOT NULL DEFAULT 0,
      planned_minutes INTEGER NOT NULL DEFAULT 0,
      hourly_cost_ht REAL NOT NULL DEFAULT 0,
      hourly_sale_ht REAL NOT NULL DEFAULT 0,
      supplier TEXT,
      notes TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_quote_line_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_order_id) REFERENCES client_orders(id)
    )
  `).run();
  database.prepare('CREATE INDEX IF NOT EXISTS idx_client_order_cost_lines_order_type ON client_order_cost_lines(client_order_id, line_type, sort_order, id)').run();
  database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_client_order_cost_lines_quote_source ON client_order_cost_lines(client_order_id, source_quote_line_id) WHERE source_quote_line_id IS NOT NULL').run();
  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_order_cost_line_exclusions (
      client_order_id INTEGER NOT NULL,
      source_quote_line_id INTEGER NOT NULL,
      excluded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(client_order_id, source_quote_line_id)
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS measurement_photo_files (
      id TEXT PRIMARY KEY,
      measurement_id INTEGER NOT NULL,
      stored_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      caption TEXT,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(measurement_id, sha256)
    )
  `).run();

  database.prepare('CREATE INDEX IF NOT EXISTS idx_measurement_photo_files_measurement_id ON measurement_photo_files(measurement_id)').run();
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
  ensureColumn('events', 'google_event_id', 'TEXT NULL');
  ensureColumn('client_orders', 'planned_hours', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'done_hours', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'chantier_status', "TEXT DEFAULT 'À préparer'");
  ensureColumn('client_orders', 'chantier_start_date', 'TEXT');
  ensureColumn('client_orders', 'chantier_end_date', 'TEXT');
  ensureColumn('client_orders', 'chantier_progress', 'REAL DEFAULT 0');
  ensureColumn('client_orders', 'chantier_notes', 'TEXT');
  ensureColumn('client_orders', 'status', 'TEXT');
  ensureColumn('client_orders', 'vat_rate', 'REAL NULL');
  ensureColumn('supplier_orders', 'status', 'TEXT');
  ensureColumn('chantier_hours', 'client_order_id', 'INTEGER NULL');
  ensureColumn('client_order_purchases', 'client_order_id', 'INTEGER');
  ensureColumn('client_order_purchases', 'designation', 'TEXT');
  ensureColumn('client_order_purchases', 'category', 'TEXT');
  ensureColumn('client_order_purchases', 'qty', 'REAL DEFAULT 1');
  ensureColumn('client_order_purchases', 'unit', 'TEXT');
  ensureColumn('client_order_purchases', 'reference', 'TEXT');
  ensureColumn('client_order_purchases', 'supplier', 'TEXT');
  ensureColumn('client_order_purchases', 'needed_date', 'TEXT');
  ensureColumn('client_order_purchases', 'note', 'TEXT');
  ensureColumn('client_order_purchases', 'status', "TEXT DEFAULT 'À commander'");
  ensureColumn('client_order_purchases', 'created_at', 'TEXT');
  ensureColumn('client_order_purchases', 'updated_at', 'TEXT');
  ensureColumn('client_order_invoices', 'source_type', "TEXT DEFAULT 'upload'");
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
  ensureColumn('quotes', 'cout_revient', 'REAL');
  ensureColumn('quotes', 'cout_matiere', 'REAL');
  ensureColumn('quotes', 'cout_sous_traitance', 'REAL');
  ensureColumn('quotes', 'cout_galvanisation', 'REAL');
  ensureColumn('quotes', 'cout_thermolaquage', 'REAL');
  ensureColumn('quotes', 'cout_motorisation', 'REAL');
  ensureColumn('quotes', 'cout_accessoires', 'REAL');
  ensureColumn('quotes', 'cout_transport', 'REAL');
  ensureColumn('quotes', 'cout_consommables', 'REAL');
  ensureColumn('quotes', 'cout_locations', 'REAL');
  ensureColumn('quotes', 'heures_etude', 'REAL');
  ensureColumn('quotes', 'heures_atelier', 'REAL');
  ensureColumn('quotes', 'heures_pose', 'REAL');
  ensureColumn('quotes', 'cout_horaire', 'REAL');
  ensureColumn('quotes', 'work_category', 'TEXT');
  ensureColumn('quote_lines', 'cost_unit', 'REAL');
  ensureColumn('quote_lines', 'cost_total', 'REAL');
  ensureColumn('quote_lines', 'margin_pct', 'REAL');
  ensureColumn('quote_lines', 'coefficient', 'REAL');
  ensureColumn('quote_lines', 'hours', 'REAL');
  ensureColumn('quote_lines', 'hourly_cost', 'REAL');
  ensureColumn('quote_lines', 'cost_category', 'TEXT');
  ensureColumn('quote_lines', 'cost_source', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'analysis_json', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'manual_adjustments_json', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'reliability_level', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'analyzed_at', 'TEXT');
  ensureColumn('quote_profitability_forecasts', 'engine_version', 'INTEGER');
  ensureColumn('client_orders', 'quote_id', 'INTEGER NULL');
  ensureColumn('client_orders', 'work_category', 'TEXT');
  ensureColumn('chantier_hours', 'category', "TEXT DEFAULT 'autre'");
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

const ESCALIER_V2_PHOTO_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const ESCALIER_V2_PHOTO_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const ESCALIER_V2_PHOTO_EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

const escalierV2PhotoStorage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const measurementId = parseOptionalId(req.params.id);
      if (!measurementId) return cb(new Error('ID fiche invalide'));
      const row = db.prepare('SELECT * FROM measurements WHERE id = ? AND module = ?').get(measurementId, 'Escalier V2');
      if (!row) return cb(new Error('Fiche Escalier V2 introuvable'));

      const clientOrderId = parseOptionalId(row.client_order_id);
      let dir = safeResolveInside(ESCALIER_V2_PHOTO_DIR, String(measurementId));

      if (clientOrderId) {
        const order = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(clientOrderId);
        if (order) {
          dir = safeResolveInside(
            CLIENT_PC_DIR,
            safeName(order.name),
            clientOrderFolderName(order),
            'Photos',
            'prises-cotes-escalier-v2',
            String(measurementId)
          );
        }
      }

      ensureDir(dir);
      req.escalierV2PhotoDir = dir;
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },

  filename(req, file, cb) {
    const extFromName = path.extname(String(file.originalname || '')).toLowerCase();
    const ext = ESCALIER_V2_PHOTO_ALLOWED_EXT.has(extFromName)
      ? extFromName
      : (ESCALIER_V2_PHOTO_EXT_BY_MIME[String(file.mimetype || '').toLowerCase()] || '.jpg');
    const base = safeSegment(path.basename(String(file.originalname || 'photo'), extFromName) || 'photo');
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const escalierV2PhotoUpload = multer({
  storage: escalierV2PhotoStorage,
  limits: { fileSize: 15 * 1024 * 1024, files: 30 },
  fileFilter(req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (ESCALIER_V2_PHOTO_ALLOWED_EXT.has(ext) || ESCALIER_V2_PHOTO_ALLOWED_MIME.has(mime)) return cb(null, true);
    cb(new Error('Format photo non supporte. Utilisez JPG, PNG, WEBP ou HEIC.'));
  }
});

const EBP_SCAN_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const EBP_SCAN_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.pdf']);
const EBP_SCAN_MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
};
const EBP_SCAN_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const ebpScanStorage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      ensureDir(EBP_SCAN_DIR);
      cb(null, EBP_SCAN_DIR);
    } catch (e) {
      cb(e);
    }
  },
  filename(req, file, cb) {
    const original = String(file.originalname || 'scan');
    const ext = path.extname(original).toLowerCase();
    const safeBase = safeSegment(path.basename(original, ext) || 'scan-ebp');
    const safeExt = EBP_SCAN_ALLOWED_EXT.has(ext) ? ext : '.bin';
    cb(null, `${Date.now()}-${safeBase}${safeExt}`);
  },
});

const ebpScanUpload = multer({
  storage: ebpScanStorage,
  limits: { fileSize: EBP_SCAN_MAX_FILE_SIZE_BYTES },
  fileFilter(req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (EBP_SCAN_ALLOWED_EXT.has(ext) || EBP_SCAN_ALLOWED_MIME.has(mime)) return cb(null, true);
    cb(new Error('Format non supporté. Utilisez JPG, PNG, HEIC ou PDF.'));
  },
});
/* ===================== MIDDLEWARES ===================== */

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'outil-pme.sid',
  secret: SESSION_SECRET,
  store: sessionStore || undefined,
  proxy: TRUST_PROXY,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: SESSION_MAX_AGE_MS,
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
  <link rel="stylesheet" href="/style.css?v=20260711-2" />
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

function getProgressFromChantierStatus(status) {
  const normalized = normalizeChantierStatus(status);
  if (normalized === 'En pose') return 75;
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

function parseOptionalVatRate(value) {
  const rate = Number(value);
  return rate === 10 || rate === 20 ? rate : null;
}

function inferVatRateFromHtTtc(amountHt, amountTtc) {
  const ht = Number(amountHt || 0);
  const ttc = Number(amountTtc || 0);
  if (!Number.isFinite(ht) || !Number.isFinite(ttc) || ht <= 0 || ttc <= 0) return null;
  const rate = ((ttc / ht) - 1) * 100;
  if (Math.abs(rate - 10) <= 0.25) return 10;
  if (Math.abs(rate - 20) <= 0.25) return 20;
  return null;
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

function renderMeasurementCards(rows, options = {}) {
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
          <a class="btn btn-secondary" href="${escHtml(measurementRoutes.canonicalMeasurementUrl(row, options) || `/outils/prises-cotes/fiche/${row.id}`)}">Ouvrir</a>
        </article>
      `).join('')}
    </div>
  `;
}

function parseMeasurementData(data) {
  try {
    const parsed = JSON.parse(String(data || '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const ESCALIER_V2_PHOTO_CATEGORIES = [
  'Vue generale',
  'Depart',
  'Arrivee',
  'Tremie',
  'Dessous',
  'Mur gauche',
  'Mur droit',
  'Details',
  'Autres',
];

function normalizeEscalierV2Category(value) {
  const raw = String(value || '').trim();
  return ESCALIER_V2_PHOTO_CATEGORIES.includes(raw) ? raw : 'Autres';
}

function normalizeEscalierV2PhotoSlots(value) {
  const map = new Map();
  ESCALIER_V2_PHOTO_CATEGORIES.forEach((category) => map.set(category, []));

  if (!Array.isArray(value)) {
    return ESCALIER_V2_PHOTO_CATEGORIES.map((category) => ({ category, photos: [] }));
  }

  value.forEach((slot) => {
    const category = normalizeEscalierV2Category(slot?.category);
    const photos = Array.isArray(slot?.photos) ? slot.photos : [];
    photos.forEach((photo) => {
      const photoId = String(photo?.id || '').trim();
      const fileName = path.basename(String(photo?.fileName || '').trim());
      if (!photoId || !fileName) return;
      map.get(category).push({
        id: photoId,
        fileName,
        caption: String(photo?.caption || '').trim(),
        size: Number(photo?.size || 0),
        mimeType: String(photo?.mimeType || '').trim(),
        createdAt: String(photo?.createdAt || '').trim() || null,
      });
    });
  });

  return ESCALIER_V2_PHOTO_CATEGORIES.map((category) => ({
    category,
    photos: map.get(category),
  }));
}

function measurementEscalierV2PhotoBaseDir(row) {
  const clientOrderId = parseOptionalId(row?.client_order_id);
  if (!clientOrderId) {
    return safeResolveInside(ESCALIER_V2_PHOTO_DIR, String(row.id));
  }

  const order = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(clientOrderId);
  if (!order) {
    return safeResolveInside(ESCALIER_V2_PHOTO_DIR, String(row.id));
  }

  return safeResolveInside(
    CLIENT_PC_DIR,
    safeName(order.name),
    clientOrderFolderName(order),
    'Photos',
    'prises-cotes-escalier-v2',
    String(row.id)
  );
}

function buildEscalierV2PhotoPublicSlots(measurementId, slots) {
  return normalizeEscalierV2PhotoSlots(slots).map((slot) => ({
    category: slot.category,
    count: slot.photos.length,
    photos: slot.photos.map((photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      caption: photo.caption || '',
      size: photo.size || 0,
      mimeType: photo.mimeType || '',
      createdAt: photo.createdAt || null,
      url: `/api/measurements/escalier-v2/${measurementId}/photos/${encodeURIComponent(photo.id)}/file`,
    })),
  }));
}

function makeTechnicalSketchId() {
  return `sketch-${crypto.randomUUID()}`;
}

function normalizeTechnicalSketches(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: String(item.id || makeTechnicalSketchId()).trim(),
      title: String(item.title || `Croquis ${index + 1}`).trim(),
      data: item.data && typeof item.data === 'object' ? item.data : item,
      preview: typeof item.preview === 'string' ? item.preview : '',
      updatedAt: String(item.updatedAt || new Date().toISOString()),
    }));
}

function readMeasurementForSketches(measurementId) {
  const id = parseOptionalId(measurementId);
  if (!id) return null;
  const row = db.prepare('SELECT * FROM measurements WHERE id = ?').get(id);
  if (!row) return null;
  const payload = parseMeasurementData(row.data);
  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
  return { id, row, payload, fields, sketches: normalizeTechnicalSketches(fields.technical_drawing_sketches) };
}

function saveMeasurementTechnicalSketches(entry, sketches) {
  const nextSketches = normalizeTechnicalSketches(sketches);
  entry.payload.fields = {
    ...(entry.fields || {}),
    technical_drawing_sketches: nextSketches,
    technical_drawing_version: 2,
  };
  db.prepare('UPDATE measurements SET data = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(entry.payload), new Date().toISOString(), entry.id);
  return nextSketches;
}

function preserveTechnicalSketchesInMeasurementPayload(nextBody, existingId) {
  const body = nextBody && typeof nextBody === 'object' ? nextBody : {};
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  if (Object.prototype.hasOwnProperty.call(fields, 'technical_drawing_sketches')) return body;
  const existing = parseOptionalId(existingId)
    ? db.prepare('SELECT data FROM measurements WHERE id = ?').get(existingId)
    : null;
  if (!existing) return body;
  const previousPayload = parseMeasurementData(existing.data);
  const previousFields = previousPayload.fields && typeof previousPayload.fields === 'object' ? previousPayload.fields : {};
  if (!Array.isArray(previousFields.technical_drawing_sketches)) return body;
  return {
    ...body,
    fields: {
      ...fields,
      technical_drawing_sketches: previousFields.technical_drawing_sketches,
      technical_drawing_version: previousFields.technical_drawing_version || 2,
    },
  };
}

function updateEscalierV2PhotoSlots(measurementId, updater) {
  const row = db.prepare('SELECT * FROM measurements WHERE id = ? AND module = ?').get(measurementId, 'Escalier V2');
  if (!row) return null;

  const payload = parseMeasurementData(row.data);
  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
  const slots = normalizeEscalierV2PhotoSlots(fields.photo_slots);
  const nextSlots = normalizeEscalierV2PhotoSlots(updater(slots) || slots);

  payload.fields = {
    ...fields,
    photo_slots: nextSlots,
  };

  db.prepare('UPDATE measurements SET data = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(payload), new Date().toISOString(), measurementId);

  return {
    row,
    slots: nextSlots,
  };
}

function sketchPath(scope, id) {
  return safeResolveInside(SKETCHES_DIR, scope, `${id}.png`);
}

function saveSketchPng(scope, id, dataUrl) {
  const cleanId = Number(id);
  if (!Number.isFinite(cleanId) || cleanId <= 0) {
    const error = new Error('ID invalide');
    error.statusCode = 400;
    throw error;
  }

  const match = String(dataUrl || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const error = new Error('Image PNG invalide');
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
    const error = new Error('Croquis trop volumineux');
    error.statusCode = 400;
    throw error;
  }

  const dir = safeResolveInside(SKETCHES_DIR, scope);
  ensureDir(dir);
  const filePath = sketchPath(scope, cleanId);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

function sendSketch(scope, id, res) {
  const cleanId = Number(id);
  if (!Number.isFinite(cleanId) || cleanId <= 0) return res.status(400).send('ID invalide');
  const filePath = sketchPath(scope, cleanId);
  if (!fs.existsSync(filePath)) return res.status(404).send('Croquis introuvable');
  return res.sendFile(filePath);
}

function renderSketchBlock({ scope, id, className = 'quote-work-card' }) {
  const cleanId = Number(id);
  const baseUrl = scope === 'quotes' ? `/sketches/quotes/${cleanId}.png` : `/sketches/measurements/${cleanId}.png`;
  return `
    <section class="${className} sketchpad-card" data-sketchpad data-sketch-scope="${escHtml(scope)}" data-sketch-id="${cleanId}" data-sketch-image-url="${baseUrl}">
      <div class="modern-section-title sketchpad-title">
        ${clientPageIcon('measurements', 'clients-title-icon')}
        <div>
          <h2>Croquis / notes manuscrites</h2>
          <p>Dessinez au doigt, au stylet ou à la souris.</p>
        </div>
      </div>
      <div class="sketchpad-surface">
        <canvas class="sketchpad-canvas" width="1100" height="420" aria-label="Zone de dessin manuscrit"></canvas>
      </div>
      <div class="sketchpad-actions">
        <button type="button" class="modern-secondary-btn" data-sketch-clear>Effacer</button>
        <button type="button" class="clients-submit-btn" data-sketch-save>Enregistrer</button>
        <span class="sketchpad-status" data-sketch-status></span>
      </div>
    </section>
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

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REDIRECT_URI = String(process.env.GOOGLE_REDIRECT_URI || '').trim();
const GOOGLE_CALENDAR_ID = String(process.env.GOOGLE_CALENDAR_ID || '').trim();
const GOOGLE_CALENDAR_TIME_ZONE = process.env.GOOGLE_CALENDAR_TIME_ZONE || 'Europe/Paris';

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
let googleSyncLocked = false;

function ensureGoogleCalendarConfig(res) {
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI && GOOGLE_CALENDAR_ID && GOOGLE_CALENDAR_ID !== 'primary') {
    return true;
  }

  res.status(500).send(`
    <h2>Configuration Google Agenda manquante</h2>
    <p>Renseignez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI et GOOGLE_CALENDAR_ID dans le fichier .env.</p>
    <p>GOOGLE_CALENDAR_ID doit designer l'agenda secondaire A2 Metal, jamais primary.</p>
    <a href="/agenda">Retour a l'agenda</a>
  `);
  return false;
}

function googleSyncOptions() {
  return { timeZone: GOOGLE_CALENDAR_TIME_ZONE };
}

function getLocalSyncMin() {
  return parisTodayStartLocal();
}

function getGoogleSyncTimeMin() {
  return parisTodayStartGoogleTimeMin();
}

function getLocalSyncEvents(syncMin) {
  return db.prepare(`
    SELECT *
    FROM events
    WHERE start_date IS NOT NULL
      AND COALESCE(NULLIF(end_date, ''), start_date) >= ?
    ORDER BY start_date ASC, id ASC
  `).all(syncMin);
}

async function getGoogleCalendarTarget(calendar) {
  if (GOOGLE_CALENDAR_ID === 'primary') {
    throw new Error('GOOGLE_CALENDAR_ID ne doit jamais valoir primary pour A2 Metal.');
  }

  const result = await calendar.calendarList.get({ calendarId: GOOGLE_CALENDAR_ID });
  return {
    id: result.data.id || GOOGLE_CALENDAR_ID,
    summary: result.data.summary || GOOGLE_CALENDAR_ID,
    timeZone: result.data.timeZone || GOOGLE_CALENDAR_TIME_ZONE
  };
}

function renderErrorList(errors) {
  if (!errors.length) return '<li>Aucune</li>';
  return errors.map((error) => `<li>${escHtml(error.message || String(error))}</li>`).join('');
}

function syncReportCounts(actions) {
  return {
    link: actions.link.length,
    importLocal: actions.importLocal.length,
    createGoogle: actions.createGoogle.length,
    updateLocal: actions.updateLocal.length,
    updateGoogle: actions.updateGoogle.length,
    deleteLocal: (actions.deleteLocal || []).length,
    ambiguous: actions.ambiguous.length,
    errors: actions.errors.length,
    googleDuplicates: actions.googleDuplicates.length
  };
}

function renderGoogleSyncSummary(req, report, options = {}) {
  const actions = report.preview.actions;
  const counts = syncReportCounts(actions);
  const added = counts.importLocal + counts.createGoogle;
  const updated = counts.link + counts.updateLocal + counts.updateGoogle;
  const deleted = counts.deleteLocal;
  const ignored = counts.ambiguous + counts.googleDuplicates;
  const errors = counts.errors;

  const content = `
    <div class="page-head app-dark-page-head">
      <div>
        <h1>Synchronisation Google Calendar</h1>
        <span>Agenda cible : ${escHtml(report.calendar.summary)} (${escHtml(report.calendar.id)})</span>
      </div>
    </div>

    <section class="panel-soft">
      <h2>Résumé</h2>
      ${options.message ? `<p>${escHtml(options.message)}</p>` : ''}
      <div class="dashboard-grid">
        <div class="stat-card"><strong>${added}</strong><span>Événements ajoutés</span></div>
        <div class="stat-card"><strong>${updated}</strong><span>Événements mis à jour</span></div>
        <div class="stat-card"><strong>${deleted}</strong><span>Événements supprimés localement</span></div>
        <div class="stat-card"><strong>${ignored}</strong><span>Événements ignorés</span></div>
        <div class="stat-card"><strong>${errors}</strong><span>Erreurs</span></div>
      </div>
    </section>

    ${actions.errors.length ? `
      <section class="panel-soft">
        <h2>Erreurs</h2>
        <ul>${renderErrorList(actions.errors)}</ul>
      </section>
    ` : ''}

    <div class="nav-actions"><a class="btn btn-secondary" href="/agenda">Retour à l'agenda</a></div>
  `;

  return pageTemplate(req, 'Synchronisation Google', content);
}

/* ===================== TEMPLATES ===================== */

function dashboardTemplate(req, content) {
  return pageTemplate(req, 'Dashboard', content);
}

function navIcon(name) {
  const icons = {
    'arrow-left': '<path d="m15 18-6-6 6-6"/><path d="M9 12h11"/>',
    dashboard: '<path d="M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z"/>',
    clients: '<path d="M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19"/><path d="M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M20 19v-1.2a3 3 0 0 0-2.4-2.9"/><path d="M15.5 5.3a3 3 0 0 1 0 5.4"/>',
    tasks: '<path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="m8 12 2.5 2.5L16 9"/>',
    calendar: '<path d="M7 3v4M17 3v4M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h3M8 16h6"/>',
    clientOrders: '<path d="M5 5h5l2 2h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 12h8M8 15h5"/>',
    supplierOrders: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><path d="M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>',
    quotes: '<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',
    documents: '<path d="M6 3h8l4 4v14H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M8 12h7M8 16h7"/><path d="M3 7v12"/>',
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
    documents: '<path d="M6 3h8l4 4v14H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h4M8 12h7M8 16h7"/><path d="M3 7v12"/>',
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
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m14 7 3 3"/>',
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
    Rentabilité: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m4 8 6-5 6 7 5-5"/>',
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
        { href: '/documents-entrants', label: 'Documents entrants', icon: 'documents' },
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
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="A2 METAL">

<title>${escHtml(title)}</title>

<link rel="stylesheet" href="/style.css?v=20260711-2">
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

  <a href="/documents-entrants"
     class="${req.path.startsWith('/documents-entrants') ? 'active' : ''}">
     ${navIcon('quotes')}<span class="nav-label">Documents entrants</span>
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
  purgeExpiredLocalAgendaEventsSafely();
  const todayIso = dateKeyInTimeZone(new Date(), APP_TIME_ZONE);
  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    timeZone: APP_TIME_ZONE,
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
      SELECT
        co.id,
        co.name,
        co.description,
        co.date,
        co.status,
        co.planned_hours,
        co.done_hours,
        co.chantier_status,
        co.chantier_progress,
        co.chantier_start_date,
        co.chantier_end_date,
        ROUND(COALESCE(SUM(ch.minutes_total), 0) / 60.0, 2) AS done_hours_calc,
        COUNT(ch.id) AS chantier_hours_count
      FROM client_orders co
      LEFT JOIN chantier_hours ch ON ch.client_order_id = co.id
      WHERE co.status != 'Terminée'
      GROUP BY co.id
      ORDER BY
        CASE
          WHEN co.chantier_end_date IS NOT NULL AND TRIM(co.chantier_end_date) != '' THEN co.chantier_end_date
          ELSE co.date
        END ASC,
        co.id DESC
      LIMIT 12
    `)
    .all();

  const activeSupplierOrders = db
    .prepare(`
      SELECT id, name, description, date, status
      FROM supplier_orders
      WHERE status IS NULL OR TRIM(status) = '' OR status != 'Terminée'
      ORDER BY date DESC, id DESC
      LIMIT 12
    `)
    .all();

  const pendingPurchases = db
    .prepare(`
      SELECT
        p.id,
        p.designation,
        p.category,
        p.qty,
        p.unit,
        p.reference,
        p.supplier,
        p.needed_date,
        p.status,
        co.id AS order_id,
        co.name AS client_name,
        co.description AS order_description
      FROM client_order_purchases p
      JOIN client_orders co ON co.id = p.client_order_id
      WHERE COALESCE(NULLIF(TRIM(p.status), ''), 'À commander') != 'Reçu'
      ORDER BY
        CASE COALESCE(NULLIF(TRIM(p.status), ''), 'À commander')
          WHEN 'À commander' THEN 0
          WHEN 'Commandé' THEN 1
          ELSE 2
        END,
        p.id DESC
      LIMIT 12
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
          const hasTrackedHours = Number(order.chantier_hours_count || 0) > 0;
          const done = hasTrackedHours
            ? Number(order.done_hours_calc || 0)
            : Number(order.done_hours || 0);
          const progress = getProgressFromChantierStatus(order.chantier_status);
          const gap = done - planned;
          const endDate = String(order.chantier_end_date || '').slice(0, 10);
          const isLate = endDate && endDate < todayIso;
          return `
        <article class="prototype-order-card prototype-carousel-slide">
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

  const supplierDashboardItems = [
    ...pendingPurchases.map((item) => ({
      key: `purchase-${item.id}`,
      source: 'Achat chantier',
      bucket: normalizePurchaseStatus(item.status) === 'À commander' ? 0 : 1,
      title: item.designation || 'Article',
      subtitle: `${item.client_name || 'Client'} · ${item.order_description || `Commande #${item.order_id}`}`,
      meta: [
        item.category || '',
        item.reference ? `Réf. ${item.reference}` : '',
        item.supplier || 'Fournisseur non renseigné',
        item.needed_date ? `Besoin ${formatDateShort(item.needed_date)}` : '',
      ].filter(Boolean).join(' · '),
      status: normalizePurchaseStatus(item.status),
      href: `/pc-folders/${encodeURIComponent(safeName(item.client_name))}/${encodeURIComponent(clientOrderFolderName({
        id: item.order_id,
        description: item.order_description,
      }))}/Commandes`,
    })),
    ...activeSupplierOrders.map((order) => {
      const status = String(order.status || 'En cours').trim() || 'En cours';
      return {
        key: `supplier-${order.id}`,
        source: 'Commande fournisseur',
        bucket: status === 'Terminée' ? 2 : 1,
        title: order.name || 'Commande fournisseur',
        subtitle: order.description || 'Aucune désignation',
        meta: `Date ${formatDateShort(order.date)}`,
        status,
        href: `/orders/suppliers#supplier-${order.id}`,
      };
    }),
  ]
    .sort((a, b) => a.bucket - b.bucket || String(a.title).localeCompare(String(b.title), 'fr'))
    .slice(0, 12);

  const supplierOrdersHtml = supplierDashboardItems.length
    ? supplierDashboardItems
        .map((item) => `
          <article class="prototype-supplier-order-card prototype-carousel-slide" id="dashboard-${escHtml(item.key)}">
            <header>
              <span class="prototype-order-icon">${kpiIcon('suppliers')}</span>
              <div>
                <em class="prototype-source-badge">${escHtml(item.source)}</em>
                <strong>${escHtml(item.title)}</strong>
                <small>${escHtml(item.subtitle)}</small>
              </div>
              <span class="prototype-status">${escHtml(item.status)}</span>
            </header>
            <div class="prototype-supplier-order-meta">
              <span>${escHtml(item.meta || 'Informations non renseignées')}</span>
            </div>
            <a class="prototype-open-button" href="${item.href}">Ouvrir</a>
          </article>
        `)
        .join('')
    : '<p class="prototype-empty">Aucune commande fournisseur ou achat actif.</p>';

  const renderDashboardCarousel = ({ title, href, linkLabel, itemsHtml, count, kind }) => `
    <div class="prototype-carousel" data-dashboard-carousel data-carousel-count="${count}">
      <div class="prototype-carousel-head">
        <div class="prototype-panel-head">
          <h2>${escHtml(title)}</h2>
          <a href="${href}">${escHtml(linkLabel)}</a>
        </div>
        <div class="prototype-carousel-controls" aria-label="Navigation ${escHtml(title)}">
          <button type="button" data-carousel-prev aria-label="Précédent">‹</button>
          <span data-carousel-counter>0 / ${count}</span>
          <button type="button" data-carousel-next aria-label="Suivant">›</button>
        </div>
      </div>
      <div class="prototype-carousel-track prototype-carousel-${kind}" data-carousel-track>
        ${itemsHtml}
      </div>
    </div>
  `;

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
          <div class="prototype-carousel-stack">
            <article class="prototype-panel prototype-orders-panel">
              ${renderDashboardCarousel({
                title: 'Commandes clients',
                href: '/orders/clients',
                linkLabel: 'Voir toutes les commandes',
                itemsHtml: orderChantiersHtml,
                count: orderChantiers.length,
                kind: 'clients',
              })}
            </article>

            <article class="prototype-panel prototype-supplier-orders-panel">
              ${renderDashboardCarousel({
                title: 'Commandes fournisseurs et achats',
                href: '/orders/suppliers',
                linkLabel: 'Voir toutes les commandes',
                itemsHtml: supplierOrdersHtml,
                count: supplierDashboardItems.length,
                kind: 'suppliers',
              })}
            </article>
          </div>

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
          document.querySelectorAll('[data-dashboard-carousel]').forEach(function(carousel){
            var track = carousel.querySelector('[data-carousel-track]');
            var prev = carousel.querySelector('[data-carousel-prev]');
            var next = carousel.querySelector('[data-carousel-next]');
            var counter = carousel.querySelector('[data-carousel-counter]');
            if (!track) return;
            var slides = Array.prototype.slice.call(track.querySelectorAll('.prototype-carousel-slide'));
            var total = slides.length;
            if (!total) {
              if (prev) prev.hidden = true;
              if (next) next.hidden = true;
              if (counter) counter.textContent = '0 / 0';
              return;
            }
            if (total <= 1) carousel.classList.add('is-single');

            function currentIndex(){
              var left = track.scrollLeft;
              var best = 0;
              var bestDistance = Infinity;
              slides.forEach(function(slide, index){
                var distance = Math.abs(slide.offsetLeft - left);
                if (distance < bestDistance) {
                  bestDistance = distance;
                  best = index;
                }
              });
              return best;
            }

            function update(){
              var index = currentIndex();
              if (counter) counter.textContent = (index + 1) + ' / ' + total;
              if (prev) prev.disabled = index <= 0;
              if (next) next.disabled = index >= total - 1;
            }

            function scrollToIndex(index){
              var target = slides[Math.max(0, Math.min(total - 1, index))];
              if (target) track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
            }

            if (prev) prev.addEventListener('click', function(){ scrollToIndex(currentIndex() - 1); });
            if (next) next.addEventListener('click', function(){ scrollToIndex(currentIndex() + 1); });
            track.addEventListener('scroll', function(){ window.requestAnimationFrame(update); }, { passive: true });
            window.addEventListener('resize', update);
            update();
          });
        })();

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
                <form method="POST" action="/tasks/done" class="modern-task-done-form">
                  <input type="hidden" name="id" value="${t.id}" />
                  <button class="modern-secondary-btn modern-task-done-btn" type="submit">✓ Terminer</button>
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
  purgeExpiredLocalAgendaEventsSafely();
  const requestedView = String(req.query.view || 'week').trim().toLowerCase();
  const agendaView = ['day', 'week', 'month'].includes(requestedView) ? requestedView : 'week';
  const requestedMonth = String(req.query.month || '').trim();

  const events = db.prepare(`
    SELECT *
    FROM events
    ORDER BY start_date ASC
  `).all();

  const now = new Date();
  const todayParts = dateKeyInTimeZone(now, APP_TIME_ZONE).split('-').map(Number);
  const todayStart = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);

  const tomorrow = new Date(todayStart);
  tomorrow.setDate(todayStart.getDate() + 1);

  const monday = new Date(todayStart);
  monday.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const nextMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 1);
  const selectedMonthStart = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
    ? new Date(Number(requestedMonth.slice(0, 4)), Number(requestedMonth.slice(5, 7)) - 1, 1)
    : new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  if (Number.isNaN(selectedMonthStart.getTime())) {
    selectedMonthStart.setFullYear(todayStart.getFullYear(), todayStart.getMonth(), 1);
  }
  selectedMonthStart.setHours(0, 0, 0, 0);
  const selectedNextMonth = new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() + 1, 1);
  const selectedMonthKey = `${selectedMonthStart.getFullYear()}-${String(selectedMonthStart.getMonth() + 1).padStart(2, '0')}`;

  function localDateTime(value) {
    return agendaEventRange.agendaDateTime(value, APP_TIME_ZONE);
  }

  function eventEndDate(event) {
    return agendaEventRange.agendaEventEnd(event, APP_TIME_ZONE);
  }

  function isAllDayAgendaEvent(event) {
    const startRaw = String(event?.start_date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(startRaw)) return true;
    const start = googleSync.normalizeAgendaDateTime(event?.start_date, APP_TIME_ZONE);
    const end = googleSync.normalizeAgendaDateTime(event?.end_date, APP_TIME_ZONE);
    return Boolean(start && end && start.slice(11, 16) === '00:00' && end.slice(11, 16) === '23:59');
  }

  function eventOverlapsDay(event, dayStart, dayEnd) {
    return agendaEventRange.eventOverlapsDay(event, dayStart, dayEnd, APP_TIME_ZONE);
  }

  function monthHref(monthDate) {
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
    return `/agenda?view=month&month=${key}`;
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

  function renderMonthAgendaEvent(event, dayStart) {
    const startDate = localDateTime(event.start_date);
    const endDate = eventEndDate(event);
    const isMultiDay = startDate && endDate && startDate.toDateString() !== endDate.toDateString();
    const showTime = startDate && startDate.toDateString() === dayStart.toDateString();
    const start = showTime && !isAllDayAgendaEvent(event)
      ? startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';
    return `
      <button
        type="button"
        class="planning-event planning-month-event ${escHtml(event.type || 'rdv')}"
        data-event-id="${event.id}"
        data-event-title="${escHtml(event.title || '')}"
        data-event-type="${escHtml(event.type || 'rdv')}"
        data-event-start="${escHtml(event.start_date || '')}"
        data-event-end="${escHtml(event.end_date || '')}"
      >
        ${start ? `<span class="planning-event-time">${escHtml(start)}</span>` : ''}
        <span class="planning-event-title">${isMultiDay ? '↔ ' : ''}${escHtml(event.title || 'Événement')}</span>
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
  const workDayLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

  function renderDayView() {
    const dayEvents = events.filter((event) => eventOverlapsDay(event, todayStart, tomorrow));
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
      const dayEvents = events.filter((event) => eventOverlapsDay(event, dayStart, dayEnd));

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
    const gridStart = new Date(selectedMonthStart);
    gridStart.setDate(selectedMonthStart.getDate() - ((selectedMonthStart.getDay() + 6) % 7));
    const gridEnd = new Date(selectedNextMonth);
    gridEnd.setDate(selectedNextMonth.getDate() - 1);
    const endWeekdayOffset = (gridEnd.getDay() + 6) % 7;
    gridEnd.setDate(gridEnd.getDate() + (4 - Math.min(endWeekdayOffset, 4)));

    const previousMonth = new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() - 1, 1);
    const followingMonth = new Date(selectedMonthStart.getFullYear(), selectedMonthStart.getMonth() + 1, 1);
    const monthTitle = selectedMonthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const weeks = [];
    for (let weekStart = new Date(gridStart); weekStart <= gridEnd; weekStart.setDate(weekStart.getDate() + 7)) {
      const days = [];
      for (let index = 0; index < 5; index += 1) {
        const dayStart = new Date(weekStart);
        dayStart.setDate(weekStart.getDate() + index);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayStart.getDate() + 1);
        const dayEvents = events
          .filter((event) => eventOverlapsDay(event, dayStart, dayEnd))
          .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
        const visibleEvents = dayEvents.slice(0, 3);
        const hiddenCount = dayEvents.length - visibleEvents.length;
        const isOutsideMonth = dayStart < selectedMonthStart || dayStart >= selectedNextMonth;
        const isToday = dayStart.toDateString() === todayStart.toDateString();

        days.push(`
          <div class="planning-month-workday${isToday ? ' today' : ''}${isOutsideMonth ? ' outside-month' : ''}">
            <div class="planning-month-header">
              <strong>${dayStart.toLocaleDateString('fr-FR', { day: '2-digit' })}</strong>
              <span>${dayStart.toLocaleDateString('fr-FR', { month: 'short' })}</span>
            </div>
            <div class="planning-events planning-month-events">
              ${visibleEvents.map((event) => renderMonthAgendaEvent(event, dayStart)).join('')}
              ${hiddenCount > 0 ? `<div class="planning-month-more">+${hiddenCount} autre${hiddenCount > 1 ? 's' : ''}</div>` : ''}
            </div>
          </div>
        `);
      }
      weeks.push(`<div class="planning-month-week">${days.join('')}</div>`);
    }

    return `
      <section class="planning-month-shell">
        <div class="planning-month-nav">
          <a class="btn btn-secondary" href="${monthHref(previousMonth)}">‹ Mois précédent</a>
          <div>
            <h2>${escHtml(monthTitle)}</h2>
            <span>Du lundi au vendredi</span>
          </div>
          <a class="btn btn-secondary" href="/agenda?view=month&month=${dateKeyInTimeZone(new Date(), APP_TIME_ZONE).slice(0, 7)}">Aujourd’hui</a>
          <a class="btn btn-secondary" href="${monthHref(followingMonth)}">Mois suivant ›</a>
        </div>
        <div class="planning-month-workgrid" aria-label="Agenda mensuel ${escHtml(monthTitle)}">
          <div class="planning-month-weekdays">
            ${workDayLabels.map((label) => `<div><span class="weekday-long">${label}</span><span class="weekday-short">${label[0]}</span></div>`).join('')}
          </div>
          ${weeks.join('')}
        </div>
      </section>
    `;
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
      <a class="${agendaView === 'month' ? 'active' : ''}" href="/agenda?view=month&month=${selectedMonthKey}">Mois</a>
    </nav>
  `;

  const googleSyncButton = `
    <form method="POST" action="/google/sync" class="agenda-sync-form" onsubmit="const b=this.querySelector('button'); if(b.disabled) return false; b.disabled=true; b.textContent='Synchronisation...';">
      <button class="btn btn-secondary" type="submit">
        Synchroniser maintenant
      </button>
    </form>
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

  const measurementTypeIcon = (name) => {
    const icons = {
      escalier: '<path d="M4 19h16M4 15h4v4M8 11h4v8M12 7h4v12M16 3h4v16"/>',
      compass: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/><path d="m15 9-2 5-5 2 2-5 5-2z"/>',
      rail: '<path d="M4 18V7M20 18V7M4 9h16M7 9v9M11 9v9M15 9v9M19 9v9"/>',
      gate: '<path d="M4 20V5M20 20V5M6 8h12M6 18h12M8 18V8M12 18V8M16 18V8"/>',
      fence: '<path d="M4 20V9l3-4 3 4v11M10 20V9l3-4 3 4v11M16 20V9l3-4 3 4v11"/><path d="M3 13h18M3 17h18"/>',
      pergola: '<path d="M4 9h16M6 9l2-4h8l2 4M7 9v11M17 9v11M5 20h14M9 9v4M12 9v4M15 9v4"/>',
      window: '<path d="M5 4h14v16H5zM12 4v16M5 12h14"/><path d="M8.5 4v16M15.5 4v16"/>',
      other: '<path d="M12 4v16M4 12h16"/><path d="M6 6l12 12M18 6 6 18"/>',
    };
    return `<svg class="measurement-card-svg" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.other}</svg>`;
  };

  const cards = [
    {
      href: '/outils/prises-cotes/escalier',
      icon: 'escalier',
      title: 'Escalier',
      desc: 'Fiche de prises de cotes Escalier',
    },
    {
      href: '/outils/prises-cotes/escalier-v2',
      icon: 'compass',
      title: 'Escalier V2',
      desc: 'Prise de cotes Escalier V2 (brouillon)',
    },
    {
      href: '/outils/prises-cotes/garde-corps',
      icon: 'rail',
      title: 'Garde-corps',
      desc: 'Longueurs, hauteurs, angles, supports et remplissages',
    },
    {
      href: '/outils/prises-cotes/portail',
      icon: 'gate',
      title: 'Portail',
      desc: 'Dimensions, sens d’ouverture, piliers et motorisation',
    },
    {
      href: '/outils/prises-cotes/cloture',
      icon: 'fence',
      title: 'Clôture',
      desc: 'Longueurs, hauteurs, poteaux, pentes et soubassements',
    },
    {
      href: '/outils/prises-cotes/pergola',
      icon: 'pergola',
      title: 'Pergola',
      desc: 'Emprise, hauteurs, poteaux, toiture et fixations',
    },
    {
      href: '/outils/prises-cotes/verriere',
      icon: 'window',
      title: 'Verrière',
      desc: 'Ouverture, divisions, supports, vitrage et pose',
    },
    {
      href: '/outils/prises-cotes/autres',
      icon: 'other',
      title: 'Autres',
      desc: 'Prise de cotes libre pour un ouvrage spécifique',
    },
  ]
    .map(
      (item) => `
      <a class="card" href="${item.href}">
        <div class="card-icon">${measurementTypeIcon(item.icon)}</div>
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

const measurementPhotoStorage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const measurementId = parseOptionalId(req.params.id);
      if (!measurementId) return cb(new Error('ID fiche invalide'));
      const row = db.prepare('SELECT id, module FROM measurements WHERE id = ?').get(measurementId);
      if (!row || row.module === 'Escalier V2') return cb(new Error('Fiche de mesure classique introuvable'));
      const dir = measurementPhotoFiles.measurementPhotoDir(MEASUREMENT_PHOTO_DIR, measurementId);
      ensureDir(dir);
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename(req, file, cb) {
    try {
      cb(null, measurementPhotoFiles.generatedStoredName(file));
    } catch (error) {
      cb(error);
    }
  }
});

const measurementPhotoUpload = multer({
  storage: measurementPhotoStorage,
  limits: { fileSize: measurementPhotoFiles.MAX_FILE_SIZE, files: 20 },
  fileFilter(req, file, cb) {
    try {
      measurementPhotoFiles.validatePhotoFile(file);
      cb(null, true);
    } catch (error) {
      cb(error);
    }
  }
});

app.get('/api/measurements/context', requireLogin, (req, res) => {
  const quoteId = parseOptionalId(req.query.quote_id);
  if (!quoteId) return res.status(400).json({ ok: false, error: 'ID devis invalide' });
  const quote = db.prepare('SELECT id, title, client_name FROM quotes WHERE id = ?').get(quoteId);
  if (!quote) return res.status(404).json({ ok: false, error: 'Devis introuvable' });
  return res.json({ ok: true, quote: {
    id: quote.id,
    client: String(quote.client_name || '').trim(),
    chantier: String(quote.title || '').trim()
  } });
});

app.get('/api/measurements/photo-recovery-access', requireLogin, (req, res) => {
  const measurementId = parseOptionalId(req.query.id);
  const isAdmin = req.session?.user?.role !== 'atelier';
  return res.json({ ok: true, allowed: Boolean(isAdmin && measurementId === 9) });
});

function measurementPhotoPublic(photo) {
  return {
    id: String(photo.id),
    measurementId: Number(photo.measurement_id),
    name: String(photo.original_name || 'Photo'),
    originalName: String(photo.original_name || 'Photo'),
    mimeType: String(photo.mime_type || ''),
    size: Number(photo.size || 0),
    caption: String(photo.caption || ''),
    hash: String(photo.sha256 || ''),
    createdAt: photo.created_at || null,
    url: `/api/measurements/${photo.measurement_id}/photos/${encodeURIComponent(photo.id)}/file`
  };
}

function listMeasurementPhotos(measurementId) {
  return db.prepare(`
    SELECT id, measurement_id, stored_name, original_name, mime_type, size, caption, sha256, created_at
    FROM measurement_photo_files
    WHERE measurement_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(measurementId).map(measurementPhotoPublic);
}

app.get('/api/measurements/:id/photos', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID fiche invalide' });
  const row = db.prepare('SELECT id, module FROM measurements WHERE id = ?').get(id);
  if (!row || row.module === 'Escalier V2') return res.status(404).json({ ok: false, error: 'Fiche classique introuvable' });
  return res.json({ ok: true, photos: listMeasurementPhotos(id) });
});

app.post('/api/measurements/:id/photos', requireLogin, (req, res) => {
  measurementPhotoUpload.array('photos', 20)(req, res, (uploadError) => {
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    const cleanupUploaded = () => uploadedFiles.forEach((file) => {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    });
    if (uploadError) {
      cleanupUploaded();
      return res.status(400).json({ ok: false, error: uploadError.message || 'Upload impossible' });
    }

    const id = parseOptionalId(req.params.id);
    if (!id || !uploadedFiles.length) {
      cleanupUploaded();
      return res.status(400).json({ ok: false, error: id ? 'Aucune photo recue' : 'ID fiche invalide' });
    }

    let metadataCommitted = false;
    try {
      const now = new Date().toISOString();
      const pending = [];
      const duplicateFiles = [];
      const hashesInBatch = new Set();
      for (const file of uploadedFiles) {
        const descriptor = measurementPhotoFiles.validatePhotoFile(file);
        const hash = measurementPhotoFiles.fileSha256(file.path);
        const existing = db.prepare('SELECT id FROM measurement_photo_files WHERE measurement_id = ? AND sha256 = ?').get(id, hash);
        if (existing || hashesInBatch.has(hash)) {
          duplicateFiles.push(file.path);
          continue;
        }
        hashesInBatch.add(hash);
        pending.push({
          id: crypto.randomUUID(),
          measurementId: id,
          storedName: path.basename(file.filename),
          originalName: descriptor.originalName,
          mimeType: descriptor.mimeType,
          size: Number(file.size || descriptor.size || 0),
          caption: '',
          hash,
          createdAt: now
        });
      }

      const insert = db.prepare(`
        INSERT INTO measurement_photo_files
          (id, measurement_id, stored_name, original_name, mime_type, size, caption, sha256, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction((items) => {
        items.forEach((photo) => insert.run(
          photo.id, photo.measurementId, photo.storedName, photo.originalName,
          photo.mimeType, photo.size, photo.caption, photo.hash, photo.createdAt
        ));
      })(pending);
      metadataCommitted = true;
      duplicateFiles.forEach((filePath) => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); });
      return res.json({ ok: true, photos: listMeasurementPhotos(id), duplicatesIgnored: duplicateFiles.length });
    } catch (error) {
      if (!metadataCommitted) cleanupUploaded();
      console.error('Erreur stockage photo prise de cote:', error);
      return res.status(500).json({ ok: false, error: 'Impossible de stocker la photo' });
    }
  });
});

app.patch('/api/measurements/:id/photos/:photoId', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  const photoId = String(req.params.photoId || '').trim();
  if (!id || !photoId) return res.status(400).json({ ok: false, error: 'Parametres invalides' });
  const caption = String(req.body?.caption || '').trim().slice(0, 300);
  const result = db.prepare('UPDATE measurement_photo_files SET caption = ? WHERE id = ? AND measurement_id = ?')
    .run(caption, photoId, id);
  if (!result.changes) return res.status(404).json({ ok: false, error: 'Photo introuvable' });
  return res.json({ ok: true, photos: listMeasurementPhotos(id) });
});

app.delete('/api/measurements/:id/photos/:photoId', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  const photoId = String(req.params.photoId || '').trim();
  if (!id || !photoId) return res.status(400).json({ ok: false, error: 'Parametres invalides' });
  const photo = db.prepare('SELECT * FROM measurement_photo_files WHERE id = ? AND measurement_id = ?').get(photoId, id);
  if (!photo) return res.status(404).json({ ok: false, error: 'Photo introuvable' });
  try {
    measurementPhotoFiles.removeOwnedFile(MEASUREMENT_PHOTO_DIR, id, photo.stored_name);
    db.prepare('DELETE FROM measurement_photo_files WHERE id = ? AND measurement_id = ?').run(photoId, id);
    return res.json({ ok: true, photos: listMeasurementPhotos(id) });
  } catch (error) {
    console.error('Erreur suppression photo prise de cote:', error);
    return res.status(500).json({ ok: false, error: 'Suppression photo impossible' });
  }
});

app.get('/api/measurements/:id/photos/:photoId/file', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  const photoId = String(req.params.photoId || '').trim();
  if (!id || !photoId) return res.status(400).send('Parametres invalides');
  const photo = db.prepare('SELECT * FROM measurement_photo_files WHERE id = ? AND measurement_id = ?').get(photoId, id);
  if (!photo) return res.status(404).send('Photo introuvable');
  try {
    const filePath = measurementPhotoFiles.photoFilePath(MEASUREMENT_PHOTO_DIR, id, photo.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).send('Fichier photo introuvable');
    res.type(photo.mime_type || 'application/octet-stream');
    return res.sendFile(filePath);
  } catch {
    return res.status(400).send('Chemin photo invalide');
  }
});

app.get('/api/measurements/escalier-v2/bootstrap', requireLogin, (req, res) => {
  const moduleName = 'Escalier V2';
  const requestedId = parseOptionalId(req.query.id);
  const clientOrderId = parseOptionalId(req.query.client_order_id);
  const prefill = {
    client: '',
    commande: '',
    client_order_id: clientOrderId,
  };
  let linkedDraftId = null;

  if (clientOrderId) {
    const order = db.prepare('SELECT id, name, description FROM client_orders WHERE id = ?').get(clientOrderId);
    if (order) {
      prefill.client = String(order.name || '').trim();
      prefill.commande = String(order.description || `Commande_${order.id}`).trim();
      const linked = db
        .prepare('SELECT id FROM measurements WHERE module = ? AND client_order_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1')
        .get(moduleName, clientOrderId);
      if (linked) linkedDraftId = linked.id;
    }
  }

  let currentDraftId = null;
  if (requestedId) {
    const exists = db.prepare('SELECT id FROM measurements WHERE id = ? AND module = ?').get(requestedId, moduleName);
    if (exists) currentDraftId = exists.id;
  }
  if (!currentDraftId && linkedDraftId) currentDraftId = linkedDraftId;

  res.json({
    module: moduleName,
    prefill,
    linkedDraftId,
    currentDraftId,
  });
});

app.get('/api/measurements/escalier-v2/list', requireLogin, (req, res) => {
  const moduleName = 'Escalier V2';
  const clientOrderId = parseOptionalId(req.query.client_order_id);
  const rows = clientOrderId
    ? db
        .prepare('SELECT * FROM measurements WHERE module = ? AND client_order_id = ? ORDER BY updated_at DESC, id DESC')
        .all(moduleName, clientOrderId)
    : db.prepare('SELECT * FROM measurements WHERE module = ? ORDER BY updated_at DESC, id DESC').all(moduleName);

  const items = rows.map((row) => {
    const payload = parseMeasurementData(row.data);
    const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
    return {
      id: row.id,
      recordName: row.record_name || `Fiche Escalier V2 #${row.id}`,
      client: row.client || fields.client || '',
      commande: fields.commande || '',
      chantier: row.chantier || fields.chantier || '',
      date: row.measure_date || fields.date || '',
      metreur: fields.metreur || '',
      referenceInterne: fields.reference_interne || '',
      typeEscalier: fields.type_escalier || 'Autre',
      statut: fields.statut || 'Brouillon',
      quote_id: parseOptionalId(row.quote_id),
      client_order_id: parseOptionalId(row.client_order_id),
      updatedAt: row.updated_at || row.created_at || null,
    };
  });

  res.json({ ok: true, items });
});

app.get('/api/measurements/escalier-v2/:id', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID invalide' });

  const row = db.prepare('SELECT * FROM measurements WHERE id = ? AND module = ?').get(id, 'Escalier V2');
  if (!row) return res.status(404).json({ ok: false, error: 'Fiche Escalier V2 introuvable' });

  const payload = parseMeasurementData(row.data);
  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};

  res.json({
    ok: true,
    item: {
      id: row.id,
      module: row.module,
      recordName: row.record_name,
      quote_id: parseOptionalId(row.quote_id),
      client_order_id: parseOptionalId(row.client_order_id),
      fields,
      photoSlots: buildEscalierV2PhotoPublicSlots(row.id, fields.photo_slots),
      updatedAt: row.updated_at || row.created_at || null,
    },
  });
});

app.delete('/api/measurements/escalier-v2/:id', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID invalide' });

  const row = db.prepare('SELECT * FROM measurements WHERE id = ? AND module = ?').get(id, 'Escalier V2');
  if (!row) return res.status(404).json({ ok: false, error: 'Fiche Escalier V2 introuvable' });

  try {
    const photoDirs = [
      measurementEscalierV2PhotoBaseDir(row),
      safeResolveInside(ESCALIER_V2_PHOTO_DIR, String(id)),
    ];
    const uniquePhotoDirs = Array.from(new Set(photoDirs.map((dir) => path.resolve(dir))));
    uniquePhotoDirs.forEach((dir) => removeStoragePathIfExists(dir));
    removeStoragePathIfExists(sketchPath('measurements', id));

    const result = db.prepare('DELETE FROM measurements WHERE id = ? AND module = ?').run(id, 'Escalier V2');
    if (!result.changes) return res.status(404).json({ ok: false, error: 'Fiche Escalier V2 introuvable' });

    return res.json({ ok: true, deletedId: id, redirect: '/outils/prises-cotes/escalier-v2' });
  } catch (error) {
    console.error('Erreur suppression fiche Escalier V2:', error);
    return res.status(500).json({ ok: false, error: 'Erreur suppression fiche Escalier V2' });
  }
});

app.get('/api/measurements/escalier-v2/:id/photos', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID invalide' });

  const row = db.prepare('SELECT * FROM measurements WHERE id = ? AND module = ?').get(id, 'Escalier V2');
  if (!row) return res.status(404).json({ ok: false, error: 'Fiche Escalier V2 introuvable' });

  const payload = parseMeasurementData(row.data);
  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
  return res.json({ ok: true, slots: buildEscalierV2PhotoPublicSlots(id, fields.photo_slots) });
});

app.post('/api/measurements/escalier-v2/:id/photos', requireLogin, (req, res) => {
  escalierV2PhotoUpload.array('photos', 30)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || 'Upload impossible' });
    }

    const id = parseOptionalId(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'ID invalide' });

    const row = db.prepare('SELECT * FROM measurements WHERE id = ? AND module = ?').get(id, 'Escalier V2');
    if (!row) return res.status(404).json({ ok: false, error: 'Fiche Escalier V2 introuvable' });

    if (!Array.isArray(req.files) || !req.files.length) {
      return res.status(400).json({ ok: false, error: 'Aucune photo recue' });
    }

    const category = normalizeEscalierV2Category(req.body?.category);
    const updated = updateEscalierV2PhotoSlots(id, (slots) => {
      const next = normalizeEscalierV2PhotoSlots(slots);
      const target = next.find((slot) => slot.category === category);
      if (!target) return next;

      req.files.forEach((file) => {
        target.photos.push({
          id: crypto.randomUUID(),
          fileName: path.basename(file.filename),
          caption: '',
          size: Number(file.size || 0),
          mimeType: String(file.mimetype || ''),
          createdAt: new Date().toISOString(),
        });
      });

      return next;
    });

    if (!updated) return res.status(404).json({ ok: false, error: 'Fiche Escalier V2 introuvable' });

    return res.json({ ok: true, slots: buildEscalierV2PhotoPublicSlots(id, updated.slots) });
  });
});

app.patch('/api/measurements/escalier-v2/:id/photos/:photoId', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  const photoId = String(req.params.photoId || '').trim();
  if (!id || !photoId) return res.status(400).json({ ok: false, error: 'Parametres invalides' });

  const caption = String(req.body?.caption || '').trim().slice(0, 300);
  const updated = updateEscalierV2PhotoSlots(id, (slots) => {
    const next = normalizeEscalierV2PhotoSlots(slots);
    next.forEach((slot) => {
      slot.photos.forEach((photo) => {
        if (photo.id === photoId) photo.caption = caption;
      });
    });
    return next;
  });

  if (!updated) return res.status(404).json({ ok: false, error: 'Fiche Escalier V2 introuvable' });
  return res.json({ ok: true, slots: buildEscalierV2PhotoPublicSlots(id, updated.slots) });
});

app.delete('/api/measurements/escalier-v2/:id/photos/:photoId', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  const photoId = String(req.params.photoId || '').trim();
  if (!id || !photoId) return res.status(400).json({ ok: false, error: 'Parametres invalides' });

  const row = db.prepare('SELECT * FROM measurements WHERE id = ? AND module = ?').get(id, 'Escalier V2');
  if (!row) return res.status(404).json({ ok: false, error: 'Fiche Escalier V2 introuvable' });

  const payload = parseMeasurementData(row.data);
  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
  const slots = normalizeEscalierV2PhotoSlots(fields.photo_slots);
  let removedFileName = null;

  slots.forEach((slot) => {
    slot.photos = slot.photos.filter((photo) => {
      if (photo.id !== photoId) return true;
      removedFileName = photo.fileName;
      return false;
    });
  });

  if (!removedFileName) return res.status(404).json({ ok: false, error: 'Photo introuvable' });

  const baseDir = measurementEscalierV2PhotoBaseDir(row);
  ensureDir(baseDir);
  const filePath = safeResolveInside(baseDir, path.basename(removedFileName));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  payload.fields = {
    ...fields,
    photo_slots: slots,
  };

  db.prepare('UPDATE measurements SET data = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(payload), new Date().toISOString(), id);

  return res.json({ ok: true, slots: buildEscalierV2PhotoPublicSlots(id, slots) });
});

app.get('/api/measurements/escalier-v2/:id/photos/:photoId/file', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  const photoId = String(req.params.photoId || '').trim();
  if (!id || !photoId) return res.status(400).send('Parametres invalides');

  const row = db.prepare('SELECT * FROM measurements WHERE id = ? AND module = ?').get(id, 'Escalier V2');
  if (!row) return res.status(404).send('Fiche Escalier V2 introuvable');

  const payload = parseMeasurementData(row.data);
  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {};
  const slots = normalizeEscalierV2PhotoSlots(fields.photo_slots);

  let fileName = null;
  slots.forEach((slot) => {
    slot.photos.forEach((photo) => {
      if (photo.id === photoId) fileName = photo.fileName;
    });
  });

  if (!fileName) return res.status(404).send('Photo introuvable');
  const filePath = safeResolveInside(measurementEscalierV2PhotoBaseDir(row), path.basename(fileName));
  if (!fs.existsSync(filePath)) return res.status(404).send('Fichier introuvable');
  return res.sendFile(filePath);
});

app.post('/api/measurements', requireLogin, (req, res) => {
  let body = req.body || {};
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  const { quoteId, orderId } = normalizeMeasurementLink(body.quote_id ?? fields.quote_id, body.client_order_id ?? fields.client_order_id);
  const id = parseOptionalId(body.server_id || body.id);
  const moduleName = String(body.module || body.moduleLabel || fields.module || 'Prise de cote').trim();
  const recordName = String(body.recordName || '').trim() || `Fiche ${moduleName.toLowerCase()} ${formatDateLabel(isoDate())}`;
  const client = String(fields.client || '').trim() || null;
  const chantier = String(fields.chantier || '').trim() || null;
  const measureDate = String(fields.date || '').trim() || null;
  const now = new Date().toISOString();

  if (id) {
    const existing = db.prepare('SELECT id FROM measurements WHERE id = ?').get(id);
    if (existing) {
      body = preserveTechnicalSketchesInMeasurementPayload(body, id);
      const data = JSON.stringify(body);
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
    body = preserveTechnicalSketchesInMeasurementPayload(body, byName.id);
    const data = JSON.stringify(body);
    db.prepare(`
      UPDATE measurements
      SET client = ?, chantier = ?, measure_date = ?, quote_id = ?, client_order_id = ?, data = ?, updated_at = ?
      WHERE id = ?
    `).run(client, chantier, measureDate, quoteId, orderId, data, now, byName.id);
    return res.json({ ok: true, id: byName.id });
  }

  const data = JSON.stringify(body);
  const info = db.prepare(`
    INSERT INTO measurements
      (module, record_name, client, chantier, measure_date, quote_id, client_order_id, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(moduleName, recordName, client, chantier, measureDate, quoteId, orderId, data, now, now);

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get('/api/measurements/:id', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID prise de cote invalide' });
  const measurement = db.prepare('SELECT * FROM measurements WHERE id = ?').get(id);
  if (!measurement) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });
  const quoteId = parseOptionalId(measurement.quote_id);
  const quote = quoteId ? db.prepare('SELECT id, title, client_name FROM quotes WHERE id = ?').get(quoteId) : null;
  return res.json({
    ok: true,
    measurement: measurementRoutes.buildMeasurementEditorPayload(measurement, quote),
    returnUrl: quoteId ? `/devis/${quoteId}#quote-section-measurements` : '/outils/prises-cotes'
  });
});

app.delete('/api/measurements/:id', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'ID prise de cote invalide' });

  const measurement = db.prepare('SELECT id FROM measurements WHERE id = ?').get(id);
  if (!measurement) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });

  try {
    removeStoragePathIfExists(sketchPath('measurements', id));
    removeStoragePathIfExists(safeResolveInside(MEASUREMENT_PHOTO_DIR, String(id)));
    const result = db.transaction((measurementId) => {
      db.prepare('DELETE FROM measurement_photo_files WHERE measurement_id = ?').run(measurementId);
      return db.prepare('DELETE FROM measurements WHERE id = ?').run(measurementId);
    })(id);
    if (!result.changes) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });
    return res.json({ ok: true, deletedId: id, redirect: '/outils/prises-cotes' });
  } catch (error) {
    console.error('Erreur suppression prise de cote:', error);
    return res.status(500).json({ ok: false, error: 'Erreur suppression prise de cote' });
  }
});

app.get('/api/measurements/:id/croquis', requireLogin, (req, res) => {
  const entry = readMeasurementForSketches(req.params.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });
  return res.json({
    ok: true,
    measurement: {
      id: entry.row.id,
      module: entry.row.module,
      recordName: entry.row.record_name,
    },
    sketches: entry.sketches.map((sketch, index) => ({
      id: sketch.id,
      title: sketch.title || `Croquis ${index + 1}`,
      preview: sketch.preview || '',
      updatedAt: sketch.updatedAt || null,
      url: `/outils/prises-cotes/${entry.id}/croquis/${encodeURIComponent(sketch.id)}`,
    })),
  });
});

app.post('/api/measurements/:id/croquis', requireLogin, (req, res) => {
  const entry = readMeasurementForSketches(req.params.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });
  const title = String(req.body?.title || '').trim() || `Croquis ${entry.sketches.length + 1}`;
  const sketch = {
    id: makeTechnicalSketchId(),
    title,
    data: {
      id: makeTechnicalSketchId(),
      title,
      strokes: [],
      annotations: [],
      backgroundImage: '',
      updatedAt: new Date().toISOString(),
    },
    preview: '',
    updatedAt: new Date().toISOString(),
  };
  const sketches = saveMeasurementTechnicalSketches(entry, entry.sketches.concat(sketch));
  const saved = sketches.find((item) => item.id === sketch.id) || sketch;
  return res.json({
    ok: true,
    sketch: saved,
    url: `/outils/prises-cotes/${entry.id}/croquis/${encodeURIComponent(saved.id)}`,
  });
});

app.get('/api/measurements/:id/croquis/:sketchId', requireLogin, (req, res) => {
  const entry = readMeasurementForSketches(req.params.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });
  const sketchId = String(req.params.sketchId || '').trim();
  const sketch = entry.sketches.find((item) => item.id === sketchId);
  if (!sketch) return res.status(404).json({ ok: false, error: 'Croquis introuvable' });
  const availablePhotos = String(entry.row.module || '') === 'Escalier V2'
    ? buildEscalierV2PhotoPublicSlots(entry.id, entry.fields.photo_slots)
    : [{
      category: 'Photos',
      count: Array.isArray(entry.payload.photos) ? entry.payload.photos.length : 0,
      photos: (Array.isArray(entry.payload.photos) ? entry.payload.photos : []).map((photo, index) => ({
        id: String(photo.id || photo.name || `photo-${index}`),
        fileName: String(photo.name || `Photo ${index + 1}`),
        caption: String(photo.caption || photo.name || `Photo ${index + 1}`),
        url: String(photo.dataUrl || photo.url || ''),
      })).filter((photo) => photo.url),
    }];
  return res.json({
    ok: true,
    measurement: {
      id: entry.row.id,
      module: entry.row.module,
      recordName: entry.row.record_name,
    },
    sketch,
    availablePhotos,
    returnUrl: `/outils/prises-cotes/${String(entry.row.module || '').toLowerCase().replace(/\s+/g, '-')}`,
  });
});

app.post('/api/measurements/:id/croquis/:sketchId', requireLogin, (req, res) => {
  const entry = readMeasurementForSketches(req.params.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });
  const sketchId = String(req.params.sketchId || '').trim();
  const index = entry.sketches.findIndex((item) => item.id === sketchId);
  if (index < 0) return res.status(404).json({ ok: false, error: 'Croquis introuvable' });

  const title = String(req.body?.title || entry.sketches[index].title || '').trim() || `Croquis ${index + 1}`;
  const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
  const preview = typeof req.body?.preview === 'string' ? req.body.preview : entry.sketches[index].preview;
  const sketches = entry.sketches.slice();
  sketches[index] = {
    id: sketchId,
    title,
    data,
    preview,
    updatedAt: new Date().toISOString(),
  };

  const saved = saveMeasurementTechnicalSketches(entry, sketches)[index];
  return res.json({ ok: true, sketch: saved });
});

app.delete('/api/measurements/:id/croquis/:sketchId', requireLogin, (req, res) => {
  const entry = readMeasurementForSketches(req.params.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });
  const sketchId = String(req.params.sketchId || '').trim();
  const sketches = entry.sketches.filter((item) => item.id !== sketchId);
  if (sketches.length === entry.sketches.length) return res.status(404).json({ ok: false, error: 'Croquis introuvable' });
  saveMeasurementTechnicalSketches(entry, sketches);
  return res.json({ ok: true, deletedId: sketchId });
});

app.get('/sketches/measurements/:id.png', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  const measurement = id ? db.prepare('SELECT id FROM measurements WHERE id = ?').get(id) : null;
  if (!measurement) return res.status(404).send('Prise de cote introuvable');
  return sendSketch('measurements', id, res);
});

app.post('/api/measurements/:id/sketch', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  const measurement = id ? db.prepare('SELECT id FROM measurements WHERE id = ?').get(id) : null;
  if (!measurement) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });

  try {
    const filePath = saveSketchPng('measurements', id, req.body?.image);
    return res.json({ ok: true, path: filePath });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Erreur sauvegarde croquis' });
  }
});

app.get('/outils/prises-cotes/fiche/:id', requireLogin, (req, res) => {
  const id = parseOptionalId(req.params.id);
  if (!id) return res.status(400).send('ID prise de cote invalide');

  const measurement = db.prepare('SELECT * FROM measurements WHERE id = ?').get(id);
  if (!measurement) return res.status(404).send('Prise de cote introuvable');

  const canonicalUrl = measurementRoutes.canonicalMeasurementUrl(measurement, { fromQuoteId: req.query.from_quote });
  if (canonicalUrl) return res.redirect(302, canonicalUrl);
  const linkedQuoteId = parseOptionalId(measurement.quote_id);
  const linkedQuote = linkedQuoteId
    ? db.prepare('SELECT id, title, client_name FROM quotes WHERE id = ?').get(linkedQuoteId)
    : null;
  const editorPayload = measurementRoutes.buildMeasurementEditorPayload(measurement, linkedQuote);

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
          <div><span>Client</span><strong>${escHtml(editorPayload.fields.client || '—')}</strong></div>
          <div><span>Chantier</span><strong>${escHtml(editorPayload.fields.chantier || '—')}</strong></div>
          <div><span>Date</span><strong>${escHtml(formatDateLabel(measurement.measure_date))}</strong></div>
        </div>
        <div class="nav-actions">
          <a class="btn btn-secondary" href="/outils/prises-cotes">Retour prises de cotes</a>
        </div>
      </section>

      ${renderSketchBlock({ scope: 'measurements', id, className: 'panel-soft' })}
      <script src="/sketchpad.js"></script>
      <script>
      window.initSketchPad && window.initSketchPad({
        root: document.querySelector('[data-sketchpad][data-sketch-scope="measurements"]'),
        getSaveUrl: function (root) {
          return '/api/measurements/' + root.dataset.sketchId + '/sketch';
        },
        getImageUrl: function (root) {
          return root.dataset.sketchImageUrl;
        }
      });
      </script>
      `
    )
  );
});

app.get('/outils/prises-cotes/recuperation-photos', requireAdmin, (req, res) => {
  res.send(pageTemplate(req, 'Récupération photos Portail', `
    <div class="page-head app-dark-page-head">
      <div>
        <h1>Récupération temporaire des photos</h1>
        <span>Fiche Portail #9 · devis #6 · 20/07/2026</span>
      </div>
    </div>
    <section class="panel-soft">
      <p><strong>Lecture locale uniquement.</strong> Cette page ne modifie ni le localStorage, ni la fiche, ni SQLite et n’envoie aucune photo au serveur.</p>
      <div id="photo-recovery-status" role="status">Analyse du stockage local de cet appareil…</div>
      <div class="nav-actions">
        <button type="button" class="btn btn-secondary" id="photo-recovery-rescan">Relire le stockage local</button>
        <button type="button" class="btn btn-primary" id="photo-recovery-download-all" hidden>Tout télécharger</button>
        <a class="btn btn-secondary" href="/outils/prises-cotes/portail?id=9&amp;from_quote=6">Retour vers la fiche Portail #9</a>
      </div>
      <div id="photo-recovery-results"></div>
    </section>
    <script src="/outils/prises-cotes/photo-recovery.js"></script>
    <script>
    (function () {
      'use strict';
      const status = document.getElementById('photo-recovery-status');
      const results = document.getElementById('photo-recovery-results');
      const rescan = document.getElementById('photo-recovery-rescan');
      const downloadAll = document.getElementById('photo-recovery-download-all');
      let recoveredPhotos = [];

      function addText(parent, tag, value) {
        const element = document.createElement(tag);
        element.textContent = String(value || '');
        parent.appendChild(element);
        return element;
      }

      function safeFileName(value, index) {
        const clean = String(value || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
        return clean || 'photo-portail-' + (index + 1) + '.jpg';
      }

      function downloadPhoto(photo, index) {
        const link = document.createElement('a');
        link.href = photo.dataUrl;
        link.download = safeFileName(photo.name, index);
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      function render() {
        results.replaceChildren();
        recoveredPhotos = [];
        let report;
        try {
          report = window.MeasurementPhotoRecovery.scanLocalStorage(window.localStorage, {
            id: 9, module: 'Portail', quoteId: 6, date: '2026-07-20'
          });
        } catch (error) {
          status.textContent = 'Impossible de lire le stockage local sur cet appareil : ' + (error.message || error);
          downloadAll.hidden = true;
          return;
        }

        const keys = document.createElement('section');
        keys.className = 'measurement-detail';
        addText(keys, 'h2', 'Clés trouvées');
        addText(keys, 'p', report.foundKeys.length ? report.foundKeys.join(' · ') : 'Aucune clé historique connue trouvée.');
        if (report.invalidKeys.length) addText(keys, 'p', 'Clés illisibles ignorées : ' + report.invalidKeys.join(' · '));
        results.appendChild(keys);

        report.records.forEach(function (record) {
          const section = document.createElement('section');
          section.className = 'panel-soft';
          addText(section, 'h2', record.recordName || 'Fiche Portail locale');
          addText(section, 'p', 'Clé : ' + record.key + ' · ID : ' + (record.id || 'non renseigné') + ' · Module : ' + (record.module || 'Portail') + ' · Devis : #' + (record.quoteId || 'non renseigné') + ' · Date : ' + (record.date || 'non renseignée'));
          addText(section, 'p', record.photos.length + ' photo(s) récupérable(s)');

          const gallery = document.createElement('div');
          gallery.className = 'measurement-linked-grid';
          record.photos.forEach(function (photo) {
            const index = recoveredPhotos.push(photo) - 1;
            const card = document.createElement('article');
            card.className = 'measurement-linked-card';
            const image = document.createElement('img');
            image.src = photo.dataUrl;
            image.alt = photo.caption || photo.name || 'Photo Portail récupérée';
            image.loading = 'lazy';
            image.style.cssText = 'display:block;width:100%;max-height:240px;object-fit:contain;border-radius:10px;';
            card.appendChild(image);
            addText(card, 'strong', photo.name || 'Photo sans nom');
            addText(card, 'span', photo.caption || 'Sans légende');
            const button = addText(card, 'button', 'Télécharger la photo');
            button.type = 'button';
            button.className = 'btn btn-primary';
            button.addEventListener('click', function () { downloadPhoto(photo, index); });
            gallery.appendChild(card);
          });
          section.appendChild(gallery);
          results.appendChild(section);
        });

        if (!report.photoCount) {
          const empty = document.createElement('section');
          empty.className = 'empty-state';
          addText(empty, 'strong', 'Aucune ancienne photo trouvée pour la fiche Portail #9 liée au devis #6 sur cet appareil.');
          addText(empty, 'p', 'Ouvrez cette même page sur l’iPhone qui a servi à prendre les photos. Le stockage local est propre à chaque appareil et navigateur.');
          results.appendChild(empty);
        }

        status.textContent = report.photoCount + ' photo(s) trouvée(s) pour la fiche ciblée. Aucune donnée n’a été envoyée ou modifiée.';
        const userAgent = navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|Edg|OPR/.test(userAgent);
        downloadAll.hidden = !report.photoCount || isIOS || isSafari;
      }

      rescan.addEventListener('click', render);
      downloadAll.addEventListener('click', function () {
        recoveredPhotos.forEach(function (photo, index) {
          window.setTimeout(function () { downloadPhoto(photo, index); }, index * 250);
        });
      });
      render();
    })();
    </script>
  `));
});

app.get('/outils/prises-cotes/escalier-v2', requireLogin, (req, res) => {
  const filePath = path.join(MEASUREMENTS_PUBLIC_DIR, 'escalier-v2.html');
  return res.sendFile(filePath);
});

app.get('/outils/prises-cotes/:module', requireLogin, (req, res, next) => {
  const moduleName = String(req.params.module || '').trim().toLowerCase();
  const fileName = MEASUREMENT_SHEETS[moduleName];

  if (!fileName) return next();

  const filePath = path.join(MEASUREMENTS_PUBLIC_DIR, fileName);
  return res.sendFile(filePath);
});

app.get('/outils/prises-cotes/:measurementId/croquis/:sketchId', requireLogin, (req, res, next) => {
  const measurementId = parseOptionalId(req.params.measurementId);
  const sketchId = String(req.params.sketchId || '').trim();
  if (!measurementId || !sketchId) return next();
  return res.sendFile(path.join(MEASUREMENTS_PUBLIC_DIR, 'croquis-technique.html'));
});

app.get('/outils/prises-cotes/:asset', requireLogin, (req, res, next) => {
  const asset = String(req.params.asset || '').trim();
  if (!MEASUREMENTS_ASSETS.has(asset)) return next();

  const filePath = path.join(MEASUREMENTS_PUBLIC_DIR, asset);
  return res.sendFile(filePath);
});

app.get('/outils/prises-cotes/technical-drawing/:asset', requireLogin, (req, res, next) => {
  const asset = String(req.params.asset || '').trim();
  if (!TECHNICAL_DRAWING_ASSETS.has(asset)) return next();

  const filePath = safeResolveInside(MEASUREMENTS_PUBLIC_DIR, 'technical-drawing', asset);
  return res.sendFile(filePath);
});

/* ===================== GOOGLE OAUTH ROUTES ===================== */

app.get('/google/auth', requireLogin, (req, res) => {
  if (!ensureGoogleCalendarConfig(res)) return;

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  });

  res.redirect(url);
});

app.get('/google/callback', requireLogin, async (req, res) => {
  if (!ensureGoogleCalendarConfig(res)) return;

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

// Synchronisation bidirectionnelle directe avec Google Agenda.
app.get('/google/sync', requireLogin, (req, res) => {
  res.redirect('/agenda');
});

app.post('/google/sync', requireLogin, async (req, res) => {
  if (!ensureGoogleCalendarConfig(res)) return;

  if (!req.session.googleTokens) {
    return res.redirect('/google/auth');
  }

  if (googleSyncLocked) {
    return res.status(409).send(pageTemplate(req, 'Synchronisation en cours', `
      <section class="panel-soft">
        <h1>Synchronisation deja en cours</h1>
        <p>Une autre synchronisation Google Agenda est en cours. Reessayez dans quelques instants.</p>
        <a class="btn btn-secondary" href="/agenda">Retour a l'agenda</a>
      </section>
    `));
  }

  googleSyncLocked = true;
  oauth2Client.setCredentials(req.session.googleTokens);

  const calendar = google.calendar({
    version: 'v3',
    auth: oauth2Client,
  });

  try {
    purgeExpiredLocalAgendaEventsSafely();
    const localSyncMin = getLocalSyncMin();
    const googleSyncTimeMin = getGoogleSyncTimeMin();
    const target = await getGoogleCalendarTarget(calendar);
    const googleResult = await googleSync.listGoogleCalendarEvents(calendar, GOOGLE_CALENDAR_ID, {
      timeMin: googleSyncTimeMin
    });
    const googleEvents = googleResult.items;
    const localEvents = getLocalSyncEvents(localSyncMin);
    const cancellations = googleSync.planGoogleCancellations(localEvents, googleEvents);
    const deleteCancelledLocal = db.prepare('DELETE FROM events WHERE id = ? AND google_event_id = ?');
    const applyGoogleCancellations = db.transaction((items) => {
      for (const item of items) {
        deleteCancelledLocal.run(item.id, String(item.google_event_id || '').trim());
      }
    });

    // Google a répondu avec succès sur toutes les pages : les suppressions
    // exactes sont appliquées avant tout envoi ou création vers Google.
    applyGoogleCancellations(cancellations.deleteLocal);

    const preview = googleSync.buildSyncPreview(
      cancellations.remainingLocalRows,
      cancellations.activeGoogleRows,
      googleSyncOptions()
    );
    preview.actions.deleteLocal = cancellations.deleteLocal;

    if (preview.actions.ambiguous.length || preview.actions.errors.length) {
      return res.status(409).send(renderGoogleSyncSummary(req, { calendar: target, preview }, {
        message: 'Synchronisation annulée : des ambiguïtés ou erreurs doivent être corrigées.'
      }));
    }

    const setGoogleEventId = db.prepare('UPDATE events SET google_event_id = ? WHERE id = ?');
    const updateLocalFromGoogle = db.prepare(`
      UPDATE events
      SET title = ?,
          start_date = ?,
          end_date = ?,
          type = ?,
          google_event_id = ?
      WHERE id = ?
    `);
    const insertLocalFromGoogle = db.prepare(`
      INSERT INTO events (
        title,
        start_date,
        end_date,
        google_event_id,
        type,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const item of preview.actions.link) {
      setGoogleEventId.run(item.google.normalized.id, item.local.normalized.rawId);
    }

    for (const item of preview.actions.updateLocal) {
      const g = item.google.normalized;
      updateLocalFromGoogle.run(
        g.title,
        g.start_date,
        g.end_date,
        item.local.row.type || 'chantier',
        g.id,
        item.local.normalized.rawId
      );
    }

    for (const item of preview.actions.importLocal) {
      const g = item.google.normalized;
      insertLocalFromGoogle.run(g.title, g.start_date, g.end_date, g.id, 'chantier', new Date().toISOString());
    }

    const recoverOrCreateGoogle = async (localItem) => {
      const body = googleSync.googleRequestBodyFromLocal(localItem.row, googleSyncOptions());
      if (!body) return null;

      if (cancellations.cancelledGoogleEventIds.has(localItem.normalized.googleEventId)) return null;

      const refreshedResult = await googleSync.listGoogleCalendarEvents(calendar, GOOGLE_CALENDAR_ID, {
        timeMin: googleSyncTimeMin
      });
      const refreshedCancellations = googleSync.planGoogleCancellations([localItem.row], refreshedResult.items);
      for (const deletedId of refreshedCancellations.cancelledGoogleEventIds) {
        cancellations.cancelledGoogleEventIds.add(deletedId);
      }
      if (refreshedCancellations.deleteLocal.length) {
        applyGoogleCancellations(refreshedCancellations.deleteLocal);
        return null;
      }
      const refreshedPreview = googleSync.buildSyncPreview(
        refreshedCancellations.remainingLocalRows,
        refreshedCancellations.activeGoogleRows,
        googleSyncOptions()
      );
      const relink = refreshedPreview.actions.link[0] || refreshedPreview.actions.updateGoogle[0];
      if (relink?.google?.normalized?.id) {
        setGoogleEventId.run(relink.google.normalized.id, localItem.normalized.rawId);
        return relink.google.normalized.id;
      }

      const created = await calendar.events.insert({
        calendarId: GOOGLE_CALENDAR_ID,
        requestBody: body
      });
      if (created.data.id) setGoogleEventId.run(created.data.id, localItem.normalized.rawId);
      return created.data.id || null;
    };

    const applyErrors = [];

    for (const item of preview.actions.updateGoogle) {
      const body = googleSync.googleRequestBodyFromLocal(item.local.row, googleSyncOptions());
      if (!body) continue;

      try {
        await calendar.events.update({
          calendarId: GOOGLE_CALENDAR_ID,
          eventId: item.google.normalized.id,
          requestBody: body
        });
      } catch (err) {
        if (googleSync.isNotFoundGoogleError(err)) {
          try {
            await recoverOrCreateGoogle(item.local);
          } catch (recoverErr) {
            console.error('Erreur recuperation lien Google Agenda :', recoverErr.response ? recoverErr.response.data : recoverErr);
            applyErrors.push(`Recuperation impossible pour ${item.local.normalized.title}`);
          }
        } else {
          console.error('Erreur mise a jour Google Agenda :', err.response ? err.response.data : err);
          applyErrors.push(`Mise a jour Google impossible pour ${item.local.normalized.title}`);
        }
      }
    }

    for (const item of preview.actions.createGoogle) {
      try {
        await recoverOrCreateGoogle(item.local);
      } catch (err) {
        console.error('Erreur creation Google Agenda :', err.response ? err.response.data : err);
        applyErrors.push(`Creation Google impossible pour ${item.local.normalized.title}`);
      }
    }

    preview.actions.errors.push(...applyErrors.map((message) => ({ message })));
    res.send(renderGoogleSyncSummary(req, { calendar: target, preview }, {
      message: applyErrors.length
        ? 'Synchronisation appliquée partiellement : certains événements sont en erreur.'
        : `Synchronisation appliquée. ${cancellations.deleteLocal.length} suppression(s) Google appliquée(s) localement.`
    }));
  } catch (err) {
    console.error('Erreur application Google Agenda :', err.response ? err.response.data : err);
    res.status(502).send(pageTemplate(req, 'Erreur Google Agenda', `
      <section class="panel-soft">
        <h1>Impossible d'appliquer la synchronisation</h1>
        <p>Google Agenda n'a pas repondu correctement. Aucune suppression automatique n'a ete executee.</p>
        <a class="btn btn-secondary" href="/agenda">Retour a l'agenda</a>
      </section>
    `));
  } finally {
    googleSyncLocked = false;
  }
});

app.get('/google/calendars', requireLogin, async (req, res) => {
  if (!ensureGoogleCalendarConfig(res)) return;

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

const clientsService = createClientsService({
  db,
  clientsRoot: CLIENT_PC_DIR,
  safeName,
  normalizeKey,
  joinPath: path.join,
  listDirectoryEntries(folderPath) {
    return fs.readdirSync(folderPath, { withFileTypes: true });
  },
  ensureDirectory: ensureDir
});
const clientsController = createClientsController({
  clientsService,
  renderListView: renderClientsListView,
  renderClientCard,
  pageTemplate,
  escapeHtml: escHtml,
  clientPageIcon,
  safeName
});
registerClientsRoutes(app, {
  requireLogin,
  handlers: {
    list: clientsController.showClients,
    create: clientsController.createClient,
    show: clientsController.showClient,
    delete: clientsController.deleteClient
  }
});
/* ===================== DOCUMENTS ENTRANTS ===================== */

async function analyzeIncomingDocumentFile(filePath, mimeType) {
  const analysis = await analyzeEbpFile(filePath, mimeType);
  if (!String(analysis.text || '').trim() && analysis.warning) throw new Error(String(analysis.warning).slice(0, 500));
  return analysis;
}

const scannerImporter = incomingDocuments.createScannerImporter({
  database: db,
  dirs: SCANNER_DIRS,
  intervalMs: SCANNER_IMPORT_INTERVAL_MS,
  maxFileSizeBytes: SCANNER_MAX_FILE_SIZE_BYTES,
  analyzeFile: analyzeIncomingDocumentFile,
  logger: console
});

function incomingDocumentById(rawId) {
  const id = Number(rawId || 0);
  if (!Number.isInteger(id) || id <= 0) return null;
  return db.prepare('SELECT * FROM incoming_documents WHERE id = ?').get(id) || null;
}

function incomingDocumentFile(row) {
  const storedName = path.basename(String(row?.stored_name || ''));
  if (!storedName) throw new Error('Fichier document invalide');
  const expected = incomingDocuments.safeResolveInside(SCANNER_DIRS.documents, storedName);
  if (path.resolve(String(row.stored_path || '')) !== path.resolve(expected)) throw new Error('Chemin document incohérent');
  if (!fs.existsSync(expected) || !fs.statSync(expected).isFile()) throw new Error('Fichier document introuvable');
  return expected;
}

app.get('/documents-entrants', requireAdmin, (req, res) => {
  const allowedStatuses = new Set(['', ...incomingDocuments.STATUSES]);
  const allowedTypes = new Set(['', ...incomingDocuments.DOCUMENT_TYPES]);
  const status = allowedStatuses.has(String(req.query.status || '')) ? String(req.query.status || '') : '';
  const type = allowedTypes.has(String(req.query.type || '')) ? String(req.query.type || '') : '';
  const period = ['7', '30', '90'].includes(String(req.query.period || '')) ? Number(req.query.period) : null;
  const search = String(req.query.search || '').trim().slice(0, 120);
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = 20;
  const where = [];
  const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (type) { where.push('document_type = ?'); params.push(type); }
  if (period) { where.push("received_at >= datetime('now', ?)"); params.push(`-${period} days`); }
  if (search) { where.push("(original_name LIKE ? OR supplier_name LIKE ? OR document_number LIKE ?)"); const term = `%${search}%`; params.push(term, term, term); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.prepare(`SELECT COUNT(*) AS count FROM incoming_documents ${whereSql}`).get(...params)?.count || 0);
  const rows = db.prepare(`SELECT * FROM incoming_documents ${whereSql} ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize);
  const counts = db.prepare(`SELECT
    SUM(CASE WHEN status = 'nouveau' THEN 1 ELSE 0 END) AS nouveaux,
    SUM(CASE WHEN document_type = 'a_classer' AND status != 'rejete' THEN 1 ELSE 0 END) AS a_classer,
    SUM(CASE WHEN status = 'erreur' THEN 1 ELSE 0 END) AS erreurs FROM incoming_documents`).get();
  const options = (values, selected) => values.map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${escHtml(value.replaceAll('_', ' '))}</option>`).join('');
  const cards = rows.length ? rows.map((doc) => `<article class="incoming-document-card">
    <header><div><span class="incoming-status is-${escHtml(doc.status)}">${escHtml(doc.status)}</span><h2>${escHtml(doc.original_name)}</h2><p>${formatDateTimeLabel(doc.received_at)} · ${formatFileSize(doc.file_size)} · ${escHtml(doc.source)}</p></div><strong>${doc.amount_ttc == null ? '—' : formatEuroFr(doc.amount_ttc)}</strong></header>
    <div class="incoming-document-meta"><span>Type <strong>${escHtml(doc.document_type.replaceAll('_', ' '))}</strong></span><span>Fournisseur <strong>${escHtml(doc.supplier_name || '—')}</strong></span><span>Numéro <strong>${escHtml(doc.document_number || '—')}</strong></span></div>
    ${doc.error_message ? `<p class="incoming-error">${escHtml(doc.error_message)}</p>` : ''}
    <div class="incoming-document-actions"><a class="modern-secondary-btn" href="/documents-entrants/${doc.id}/file">Ouvrir</a><a class="modern-secondary-btn" href="/documents-entrants/${doc.id}/file?download=1">Télécharger</a>
      <form method="POST" action="/documents-entrants/${doc.id}/reanalyze"><button class="modern-secondary-btn" type="submit">Relancer l’analyse</button></form>
      <details><summary class="clients-submit-btn">Classer</summary><form method="POST" action="/documents-entrants/${doc.id}/classify" class="incoming-classify-form">
        <label><span>Type</span><select name="document_type">${options(incomingDocuments.DOCUMENT_TYPES, doc.document_type)}</select></label><label><span>Fournisseur</span><input name="supplier_name" maxlength="255" value="${escHtml(doc.supplier_name || '')}"></label><label><span>Numéro</span><input name="document_number" maxlength="120" value="${escHtml(doc.document_number || '')}"></label><label><span>Date</span><input type="date" name="document_date" value="${escHtml(doc.document_date || '')}"></label><label><span>HT</span><input name="amount_ht" inputmode="decimal" value="${doc.amount_ht ?? ''}"></label><label><span>TVA</span><input name="amount_tva" inputmode="decimal" value="${doc.amount_tva ?? ''}"></label><label><span>TTC</span><input name="amount_ttc" inputmode="decimal" value="${doc.amount_ttc ?? ''}"></label><label class="incoming-wide"><span>Notes</span><textarea name="notes">${escHtml(doc.notes || '')}</textarea></label><button class="clients-submit-btn incoming-wide" type="submit">Valider le classement</button></form></details>
      <form method="POST" action="/documents-entrants/${doc.id}/reject" onsubmit="return confirm('Rejeter ce document sans supprimer son fichier ?')"><input type="hidden" name="reason" value="Rejet manuel"><button class="modern-danger-btn" type="submit">Rejeter</button></form>
    </div></article>`).join('') : '<p class="empty">Aucun document entrant pour ces filtres.</p>';
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const query = new URLSearchParams({ status, type, period: period || '', search }).toString();
  return res.send(pageTemplate(req, 'Documents entrants', `<div class="modern-page incoming-documents-page">
    <section class="modern-list-head"><div class="clients-create-head">${clientPageIcon('quotes', 'clients-title-icon')}<div><h1>Documents entrants</h1><span>Scans Ricoh et imports manuels à classer</span></div></div></section>
    <section class="incoming-summary"><div><strong>${Number(counts.nouveaux || 0)}</strong><span>Nouveaux</span></div><div><strong>${Number(counts.a_classer || 0)}</strong><span>À classer</span></div><div><strong>${Number(counts.erreurs || 0)}</strong><span>Erreurs</span></div></section>
    <details class="clients-create-card incoming-upload"><summary class="clients-submit-btn">Importer un document</summary><form method="POST" action="/documents-entrants/upload" enctype="multipart/form-data"><input type="file" name="document" accept="application/pdf,image/jpeg,image/png" required><button class="clients-submit-btn" type="submit">Importer</button><small>PDF, JPG ou PNG · ${Math.round(SCANNER_MAX_FILE_SIZE_BYTES / 1024 / 1024)} Mo maximum</small></form></details>
    <form class="incoming-filters" method="GET"><select name="status"><option value="">Tous les statuts</option>${options(incomingDocuments.STATUSES, status)}</select><select name="type"><option value="">Tous les types</option>${options(incomingDocuments.DOCUMENT_TYPES, type)}</select><select name="period"><option value="">Toute période</option><option value="7" ${period === 7 ? 'selected' : ''}>7 jours</option><option value="30" ${period === 30 ? 'selected' : ''}>30 jours</option><option value="90" ${period === 90 ? 'selected' : ''}>90 jours</option></select><input name="search" value="${escHtml(search)}" placeholder="Fournisseur, numéro, fichier"><button class="modern-secondary-btn">Filtrer</button></form>
    <section class="incoming-document-list">${cards}</section><nav class="incoming-pagination"><span>Page ${page} / ${pages}</span>${page > 1 ? `<a href="?${query}&page=${page - 1}">Précédent</a>` : ''}${page < pages ? `<a href="?${query}&page=${page + 1}">Suivant</a>` : ''}</nav>
  </div>`));
});

app.get('/documents-entrants/:id/file', requireAdmin, (req, res) => {
  const row = incomingDocumentById(req.params.id);
  if (!row) return res.status(404).send('Document introuvable');
  try {
    const filePath = incomingDocumentFile(row);
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(path.basename(row.original_name))}`);
    return res.sendFile(filePath);
  } catch (error) { return res.status(404).send(escHtml(error.message)); }
});

app.post('/documents-entrants/upload', requireAdmin, (req, res) => {
  scannerDocumentUpload.single('document')(req, res, async (uploadError) => {
    if (uploadError || !req.file) return res.status(400).send(escHtml(uploadError?.message || 'Document manquant'));
    const ext = path.extname(req.file.originalname).toLowerCase();
    const incomingName = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
    const incomingPath = incomingDocuments.safeResolveInside(SCANNER_DIRS.incoming, incomingName);
    try {
      fs.writeFileSync(incomingPath, req.file.buffer, { flag: 'wx' });
      await incomingDocuments.importDocument({ database: db, dirs: SCANNER_DIRS, sourcePath: incomingPath, originalName: req.file.originalname, source: 'upload', analyzeFile: analyzeIncomingDocumentFile, activeAnalyses: scannerImporter.activeAnalyses, maxFileSizeBytes: SCANNER_MAX_FILE_SIZE_BYTES });
      return res.redirect('/documents-entrants');
    } catch (error) { if (fs.existsSync(incomingPath)) fs.unlinkSync(incomingPath); return res.status(400).send(escHtml(error.message)); }
  });
});

app.post('/documents-entrants/:id/classify', requireAdmin, (req, res) => {
  const row = incomingDocumentById(req.params.id);
  if (!row) return res.status(404).send('Document introuvable');
  const type = String(req.body.document_type || '');
  if (!incomingDocuments.DOCUMENT_TYPES.includes(type)) return res.status(400).send('Type de document invalide');
  const clean = (value, max) => String(value || '').trim().slice(0, max) || null;
  const amount = (value) => { if (String(value ?? '').trim() === '') return null; const number = Number(String(value).replace(',', '.')); if (!Number.isFinite(number) || number < 0) throw new Error('Montant invalide'); return round2(number); };
  const date = clean(req.body.document_date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).send('Date invalide');
  try {
    const now = new Date().toISOString();
    db.prepare(`UPDATE incoming_documents SET document_type = ?, supplier_name = ?, document_number = ?, document_date = ?, amount_ht = ?, amount_tva = ?, amount_ttc = ?, notes = ?, status = 'classe', classified_at = ?, classified_by = ?, updated_at = ? WHERE id = ?`)
      .run(type, clean(req.body.supplier_name, 255), clean(req.body.document_number, 120), date, amount(req.body.amount_ht), amount(req.body.amount_tva), amount(req.body.amount_ttc), clean(req.body.notes, 4000), now, req.session.user.id, now, row.id);
    return res.redirect('/documents-entrants');
  } catch (error) { return res.status(400).send(escHtml(error.message)); }
});

app.post('/documents-entrants/:id/reanalyze', requireAdmin, async (req, res) => {
  const row = incomingDocumentById(req.params.id);
  if (!row) return res.status(404).send('Document introuvable');
  try { incomingDocumentFile(row); const result = await incomingDocuments.analyzeDocument(db, row, analyzeIncomingDocumentFile, scannerImporter.activeAnalyses); if (result.busy) return res.status(409).send('Analyse déjà en cours'); return res.redirect('/documents-entrants'); }
  catch (error) { return res.status(400).send(escHtml(error.message)); }
});

app.post('/documents-entrants/:id/reject', requireAdmin, (req, res) => {
  const row = incomingDocumentById(req.params.id);
  if (!row) return res.status(404).send('Document introuvable');
  db.prepare("UPDATE incoming_documents SET status = 'rejete', notes = ?, updated_at = ? WHERE id = ?").run(String(req.body.reason || 'Rejet manuel').trim().slice(0, 1000), new Date().toISOString(), row.id);
  return res.redirect('/documents-entrants?status=rejete');
});

/* ===================== COMMANDES CLIENTS ===================== */

async function renderEbpScanValidationPage(req, res, options) {
  const scanFileName = path.basename(String(options.scanFileName || ''));
  const scanOriginalName = path.basename(String(options.scanOriginalName || scanFileName));
  const mimeType = String(options.mimeType || 'application/pdf').trim();
  const scanSource = String(options.scanSource || 'upload').trim().toLowerCase();
  const incomingFileName = path.basename(String(options.incomingFileName || '')).trim();

  const scanPath = safeResolveInside(EBP_SCAN_DIR, scanFileName);
  const analysis = await analyzeEbpFile(scanPath, mimeType);
  const ocrText = String(analysis.ocrText || '').trim();
  const pdfText = String(analysis.pdfText || '').trim();
  const extractedText = String(analysis.text || '').trim();
  const ocrTextLength = ocrText.replace(/\s+/g, ' ').length;
  const pdfTextLength = pdfText.replace(/\s+/g, ' ').length;
  const pdfPageCount = Number(analysis.pdfPageCount || 0);
  const ocrTooShort = ocrTextLength < 40;
  const pdfTooShort = pdfTextLength < 40;
  const fields = extractEbpFieldsFromText(extractedText);
  const matched = findBestClientMatch(fields.client_name);
  const best = matched.best;
  const candidates = matched.candidates
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const descriptionProposed =
    fields.title
    || (fields.quote_number ? `Devis EBP ${fields.quote_number}` : 'Commande depuis devis EBP');
  const clientProposed = best?.name || fields.client_name || '';
  const dateProposed = fields.quote_date || isoDate();
  const amountHt = fields.amount_ht !== null ? String(fields.amount_ht) : '';
  const amountTtc = fields.amount_ttc !== null ? String(fields.amount_ttc) : '';
  const warning = analysis.warning
    || (analysis.source === 'pdf' && pdfPageCount > 1 ? `PDF ${pdfPageCount} pages analyse: toutes les pages texte ont ete lues.` : '')
    || (analysis.source === 'pdf' && pdfTooShort ? 'Le PDF est peu textuel: vérifiez les champs détectés.' : '')
    || (analysis.source === 'ocr' && ocrTooShort ? 'OCR vide ou trop court: vérifiez le fichier, puis corrigez les champs manuellement.' : '')
    || (!extractedText ? 'Analyse incertaine: vérifiez et corrigez les champs.' : '');
  const htMissingWithTtc = fields.amount_ht === null && fields.amount_ttc !== null;

  const optionsHtml = candidates
    .map((c) => {
      const selected = clientProposed && normalizeSearchText(c.name) === normalizeSearchText(clientProposed) ? ' selected' : '';
      const sourceLabel = c.sources.join('+');
      return `<option value="${escHtml(c.name)}"${selected}>${escHtml(c.name)} (${escHtml(sourceLabel)})</option>`;
    })
    .join('');

  return res.send(
    pageTemplate(
      req,
      'Validation scan devis EBP',
      `
      <div class="modern-page modern-client-orders-page">
        <section class="modern-list-head modern-client-orders-head">
          <div class="clients-create-head">
            ${clientPageIcon('quotes', 'clients-title-icon')}
            <div>
              <h1>Validation avant création</h1>
              <span>Aucune commande n'est créée automatiquement. Vérifiez les champs ci-dessous.</span>
            </div>
          </div>
        </section>

        <section class="clients-create-card modern-form-card modern-client-order-form">
          ${warning ? `<p class="info">${escHtml(warning)}</p>` : ''}
          ${htMissingWithTtc ? '<p class="info">Montant TTC détecté, mais aucun montant HT fiable. Renseignez le montant HT avant création si vous voulez afficher un prix chantier HT.</p>' : ''}

          <form method="POST" action="/orders/clients/scan-ebp/create" class="modern-client-order-add-form">
            <input type="hidden" name="scan_file" value="${escHtml(scanFileName)}" />
            <input type="hidden" name="scan_original_name" value="${escHtml(scanOriginalName || scanFileName)}" />
            <input type="hidden" name="scan_source" value="${escHtml(scanSource)}" />
            ${scanSource === 'incoming' ? `<input type="hidden" name="incoming_file" value="${escHtml(incomingFileName)}" />` : ''}

            <div class="modern-form-grid">
              <label class="clients-field">
                <span>Client détecté</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('user')}
                  <input name="detected_client" value="${escHtml(fields.client_name || '')}" />
                </div>
              </label>

              <label class="clients-field">
                <span>Client existant proposé</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('clients')}
                  <select name="existing_client">
                    <option value="">-- Aucun / créer nouveau --</option>
                    ${optionsHtml}
                  </select>
                </div>
              </label>

              <label class="clients-field">
                <span>Client final (modifiable)</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('user')}
                  <input name="client_name" value="${escHtml(clientProposed)}" required />
                </div>
              </label>

              <label class="clients-field">
                <span>Numéro devis</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('quotes')}
                  <input name="quote_number" value="${escHtml(fields.quote_number || '')}" />
                </div>
              </label>

              <label class="clients-field">
                <span>Date devis / commande</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('calendar')}
                  <input type="date" name="quote_date" value="${escHtml(dateProposed)}" />
                </div>
              </label>

              <label class="clients-field">
                <span>Intitulé commande proposé</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('folder')}
                  <input name="description" value="${escHtml(descriptionProposed)}" required />
                </div>
              </label>

              <label class="clients-field">
                <span>Montant HT (€)</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('postal')}
                  <input name="amount_ht" type="number" step="0.01" value="${escHtml(amountHt)}" />
                </div>
              </label>

              <label class="clients-field">
                <span>Montant TTC (€)</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('postal')}
                  <input name="amount_ttc" type="number" step="0.01" value="${escHtml(amountTtc)}" />
                </div>
              </label>

              <label class="clients-field">
                <span>Si client introuvable</span>
                <div class="clients-input-shell" style="display:flex;gap:8px;align-items:center;">
                  <input id="create_client_if_missing" type="checkbox" name="create_client_if_missing" value="1" checked />
                  <label for="create_client_if_missing" style="margin:0;">Créer le client automatiquement après validation</label>
                </div>
              </label>
            </div>

            <div class="modern-form-actions">
              <button type="submit" class="clients-submit-btn">
                <span>${clientPageIcon('add', 'clients-submit-icon')}</span>
                Créer la commande (validation manuelle)
              </button>
              <a class="modern-cancel-link" href="/orders/clients/scan-ebp">Recommencer</a>
            </div>
          </form>
        </section>
      </div>
      `
    )
  );
}

function renderQuoteMeasurementCreationLinks(quoteId) {
  const modules = ['Escalier', 'Portail', 'Clôture', 'Garde-corps', 'Pergola', 'Verrière', 'Autres'];
  return `<div class="nav-actions">${modules.map((moduleName) => `
    <a class="btn btn-secondary" href="${escHtml(measurementRoutes.newMeasurementUrl(moduleName, quoteId))}">+ ${escHtml(moduleName)}</a>
  `).join('')}</div>`;
}

async function renderEbpInvoiceValidationPage(req, res, options) {
  const orderId = Number(options.orderId || 0);
  const order = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).send('Commande introuvable');

  const sourceType = options.sourceType === 'existing' ? 'existing' : 'upload';
  const existing = sourceType === 'existing' ? validateExistingInvoiceFile(order, options.existingFileName) : null;
  const scanFileName = sourceType === 'upload' ? path.basename(String(options.scanFileName || '')) : '';
  const scanOriginalName = sourceType === 'upload'
    ? path.basename(String(options.scanOriginalName || scanFileName))
    : existing.fileName;
  const mimeType = sourceType === 'upload'
    ? String(options.mimeType || 'application/pdf').trim()
    : existing.mimeType;
  const scanPath = sourceType === 'upload'
    ? safeResolveInside(EBP_SCAN_DIR, scanFileName)
    : existing.filePath;
  const analysis = await analyzeEbpFile(scanPath, mimeType);
  const extractedText = String(analysis.text || '').trim();
  const fields = extractEbpInvoiceFieldsFromText(extractedText);
  const amountHt = fields.amount_ht !== null ? String(fields.amount_ht) : '';
  const vatAmount = fields.vat_amount !== null ? String(fields.vat_amount) : '';
  const amountTtc = fields.amount_ttc !== null ? String(fields.amount_ttc) : '';
  const totalsMismatch = fields.amount_ht !== null
    && fields.vat_amount !== null
    && fields.amount_ttc !== null
    && !invoiceTotalsAreConsistent(fields.amount_ht, fields.vat_amount, fields.amount_ttc);
  const warning = analysis.warning
    || (totalsMismatch ? 'Montants detectes incoherents: corrigez HT, TVA ou TTC avant validation.' : '')
    || (fields.amount_ht === null || fields.amount_ttc === null ? 'Montants non detectes automatiquement. Renseignez au minimum le montant HT avant validation.' : '')
    || (!extractedText ? 'Analyse incertaine: verifiez et corrigez les champs.' : '');

  return res.send(
    pageTemplate(req, 'Validation facture EBP', renderClientOrderInvoiceValidationView({
      order, warning, sourceType, scanFileName,
      existingFileName: existing ? existing.fileName : '',
      scanOriginalName, fields, amountHt, vatAmount, amountTtc,
      cancelUrl: getPurchaseOrderRedirect(order).replace('/Commandes', '/Factures'),
      defaultInvoiceDate: isoDate(), escapeHtml: escHtml, clientPageIcon
    }))
  );
}

app.get('/orders/clients/incoming-ebp', requireLogin, (req, res) => {
  const error = String(req.query.error || '').trim();
  const message = String(req.query.message || '').trim();
  const files = listIncomingEbpPdfFiles();

  const rows = files.length
    ? files.map((file) => {
      const openUrl = `/orders/clients/incoming-ebp/open?file=${encodeURIComponent(file.name)}`;
      return `
        <tr>
          <td data-label="Fichier PDF">${escHtml(file.name)}</td>
          <td data-label="Date d'ajout">${escHtml(formatDateTimeLabel(file.addedAt))}</td>
          <td data-label="Taille">${escHtml(formatFileSize(file.size))}</td>
          <td data-label="Actions">
            <div class="modern-form-actions ebp-file-actions" style="justify-content:flex-start;gap:8px;">
              <a class="modern-cancel-link ebp-open-link" href="${openUrl}">Ouvrir</a>
              <form method="POST" action="/orders/clients/scan-ebp/analyze-incoming" style="margin:0;">
                <input type="hidden" name="incoming_file" value="${escHtml(file.name)}" />
                <button type="submit" class="clients-submit-btn">
                  <span>${clientPageIcon('search', 'clients-submit-icon')}</span>
                  Scanner ce devis
                </button>
              </form>
            </div>
          </td>
        </tr>
      `;
    }).join('')
    : '<tr><td colspan="4" class="empty">Aucun PDF à traiter dans le dossier incoming.</td></tr>';

  const mobileCards = files.length
    ? files.map((file) => {
      const openUrl = `/orders/clients/incoming-ebp/open?file=${encodeURIComponent(file.name)}`;
      return `
        <article class="ebp-file-card">
          <div class="ebp-file-card-main">
            <h2>${escHtml(file.name)}</h2>
            <p><strong>Ajouté le</strong> ${escHtml(formatDateTimeLabel(file.addedAt))}</p>
            <p><strong>Taille :</strong> ${escHtml(formatFileSize(file.size))}</p>
          </div>
          <div class="ebp-file-card-actions">
            <a class="modern-cancel-link ebp-open-link" href="${openUrl}">Ouvrir</a>
            <form method="POST" action="/orders/clients/scan-ebp/analyze-incoming">
              <input type="hidden" name="incoming_file" value="${escHtml(file.name)}" />
              <button type="submit" class="clients-submit-btn">
                <span>${clientPageIcon('search', 'clients-submit-icon')}</span>
                Scanner ce devis
              </button>
            </form>
          </div>
        </article>
      `;
    }).join('')
    : '<div class="empty-state ebp-empty-state">Aucun PDF à traiter dans le dossier incoming.</div>';

  res.send(
    pageTemplate(
      req,
      'Devis EBP à traiter',
      `
      <div class="modern-page modern-client-orders-page ebp-page">
        <section class="modern-list-head modern-client-orders-head ebp-head">
          <div class="clients-create-head">
            ${clientPageIcon('quotes', 'clients-title-icon')}
            <div class="ebp-head-copy">
              <h1>Devis EBP à traiter</h1>
              <span class="ebp-source-label">Dossier source :</span>
              <span class="ebp-source-path">${escHtml(EBP_INCOMING_DIR)}</span>
            </div>
          </div>
        </section>

        <section class="clients-create-card modern-form-card modern-client-order-form ebp-card">
          ${error ? `<p class="error">${escHtml(error)}</p>` : ''}
          ${message ? `<p class="info">${escHtml(message)}</p>` : ''}

          <div class="ebp-files-wrapper">
            <table class="modern-list-table ebp-files-table">
              <thead>
                <tr>
                  <th>Fichier PDF</th>
                  <th>Date d'ajout</th>
                  <th>Taille</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>

          <div class="ebp-files-cards" aria-label="Liste mobile des devis EBP à traiter">
            ${mobileCards}
          </div>

          <div class="modern-form-actions ebp-page-actions">
            <a class="modern-cancel-link" href="/orders/clients">Retour commandes</a>
            <a class="clients-submit-btn" href="/orders/clients/scan-ebp">
              <span>${clientPageIcon('quotes', 'clients-submit-icon')}</span>
              Scanner via upload
            </a>
          </div>
        </section>
      </div>
      <script>
        (function(){
          var storageKey = 'incoming-ebp-scroll';
          try {
            var saved = window.sessionStorage.getItem(storageKey);
            if (saved) {
              window.requestAnimationFrame(function(){
                window.scrollTo(0, Number(saved) || 0);
                window.sessionStorage.removeItem(storageKey);
              });
            }
          } catch {}

          document.querySelectorAll('.ebp-open-link').forEach(function(link){
            link.addEventListener('click', function(){
              try {
                window.sessionStorage.setItem(storageKey, String(window.scrollY || window.pageYOffset || 0));
              } catch {}
            });
          });
        })();
      </script>
      `
    )
  );
});

app.get('/orders/clients/incoming-ebp/open', requireLogin, (req, res) => {
  const incomingFileName = safeIncomingPdfName(req.query.file || '');
  if (!incomingFileName) return res.status(400).send('Nom de fichier PDF invalide');

  const filePath = safeResolveInside(EBP_INCOMING_DIR, incomingFileName);
  if (!fs.existsSync(filePath)) return res.status(404).send('Fichier introuvable');

  const rawUrl = `/orders/clients/incoming-ebp/raw?file=${encodeURIComponent(incomingFileName)}`;
  const escapedTitle = escHtml(incomingFileName);

  return res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <link rel="stylesheet" href="/style.css?v=20260711-2">
</head>
<body class="incoming-pdf-viewer-body">
  <div class="incoming-pdf-viewer">
    <header class="incoming-pdf-viewer-header">
      <button type="button" class="incoming-pdf-back" onclick="goBackToIncomingList()">← Retour</button>
      <strong class="incoming-pdf-title">${escapedTitle}</strong>
      <a class="incoming-pdf-download" href="${rawUrl}" download="${escapedTitle}">Télécharger</a>
    </header>
    <main class="incoming-pdf-frame-wrap">
      <embed src="${rawUrl}" type="application/pdf" class="incoming-pdf-frame">
    </main>
  </div>
  <script>
    function goBackToIncomingList() {
      try {
        if (window.history.length > 1 && document.referrer) {
          window.history.back();
          return;
        }
      } catch {}
      window.location = '/orders/clients/incoming-ebp';
    }
  </script>
</body>
</html>
  `);
});

app.get('/orders/clients/incoming-ebp/raw', requireLogin, (req, res) => {
  const incomingFileName = safeIncomingPdfName(req.query.file || '');
  if (!incomingFileName) return res.status(400).send('Nom de fichier PDF invalide');

  const filePath = safeResolveInside(EBP_INCOMING_DIR, incomingFileName);
  if (!fs.existsSync(filePath)) return res.status(404).send('Fichier introuvable');

  const inlineName = safeSegment(incomingFileName || 'devis.pdf');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${inlineName}"`);
  return res.sendFile(filePath);
});

app.post('/orders/clients/scan-ebp/analyze-incoming', requireLogin, async (req, res) => {
  try {
    const incomingFileName = safeIncomingPdfName(req.body.incoming_file || '');
    if (!incomingFileName) {
      return res.redirect('/orders/clients/incoming-ebp?error=Nom+de+fichier+PDF+invalide');
    }

    const incomingPath = safeResolveInside(EBP_INCOMING_DIR, incomingFileName);
    if (!fs.existsSync(incomingPath)) {
      return res.redirect('/orders/clients/incoming-ebp?error=Fichier+incoming+introuvable');
    }

    const scanPath = uniqueFilePath(EBP_SCAN_DIR, incomingFileName);
    fs.copyFileSync(incomingPath, scanPath);

    return await renderEbpScanValidationPage(req, res, {
      scanFileName: path.basename(scanPath),
      scanOriginalName: incomingFileName,
      mimeType: 'application/pdf',
      scanSource: 'incoming',
      incomingFileName,
    });
  } catch (e) {
    return res.redirect(`/orders/clients/incoming-ebp?error=${encodeURIComponent(e.message || 'Analyse impossible')}`);
  }
});

app.get('/orders/clients/scan-ebp', requireLogin, (req, res) => {
  const error = String(req.query.error || '').trim();
  const message = String(req.query.message || '').trim();
  res.send(
    pageTemplate(
      req,
      'Scanner devis EBP',
      `
      <div class="modern-page modern-client-orders-page">
        <section class="modern-list-head modern-client-orders-head">
          <div class="clients-create-head">
            ${clientPageIcon('quotes', 'clients-title-icon')}
            <div>
              <h1>Scanner un devis EBP</h1>
              <span>Upload JPG, PNG, HEIC ou PDF puis validez les champs avant création.</span>
            </div>
          </div>
        </section>

        <section class="clients-create-card modern-form-card modern-client-order-form">
          ${error ? `<p class="error">${escHtml(error)}</p>` : ''}
          ${message ? `<p class="info">${escHtml(message)}</p>` : ''}
          <p class="info">Importer le PDF EBP plutôt qu’une photo recommandé. Si le PDF contient du texte sélectionnable, l’analyse sera plus fiable.</p>

          <form method="POST" action="/orders/clients/scan-ebp/analyze" enctype="multipart/form-data" class="modern-client-order-add-form">
            <div class="modern-form-grid">
              <label class="clients-field">
                <span>Fichier devis EBP</span>
                <div class="clients-input-shell">
                  ${clientPageIcon('folder')}
                  <input type="file" name="scan_file" accept="image/*,.pdf,application/pdf" required />
                </div>
              </label>
            </div>

            <div class="modern-form-actions">
              <button type="submit" class="clients-submit-btn">
                <span>${clientPageIcon('search', 'clients-submit-icon')}</span>
                Analyser le document
              </button>
              <a class="clients-submit-btn" href="/orders/clients/incoming-ebp">
                <span>${clientPageIcon('folder', 'clients-submit-icon')}</span>
                Devis EBP à traiter
              </a>
              <a class="modern-cancel-link" href="/orders/clients">Retour commandes</a>
            </div>
          </form>
        </section>
      </div>
      `
    )
  );
});

app.post('/orders/clients/scan-ebp/analyze', requireLogin, (req, res) => {
  ebpScanUpload.single('scan_file')(req, res, async (err) => {
    if (err) {
      return res.redirect(`/orders/clients/scan-ebp?error=${encodeURIComponent(err.message || 'Upload impossible')}`);
    }
    if (!req.file) {
      return res.redirect('/orders/clients/scan-ebp?error=Aucun+fichier+recu');
    }

    try {
      return await renderEbpScanValidationPage(req, res, {
        scanFileName: req.file.filename,
        scanOriginalName: req.file.originalname || req.file.filename,
        mimeType: req.file.mimetype,
        scanSource: 'upload',
      });
    } catch (e) {
      return res.redirect(`/orders/clients/scan-ebp?error=${encodeURIComponent(e.message || 'Analyse impossible')}`);
    }
  });
});

app.post('/orders/clients/scan-ebp/create', requireLogin, (req, res) => {
  try {
    const scannedFileName = path.basename(String(req.body.scan_file || ''));
    const scannedOriginalName = path.basename(String(req.body.scan_original_name || scannedFileName));
    const scanSource = String(req.body.scan_source || 'upload').trim().toLowerCase();
    const incomingFileName = safeIncomingPdfName(req.body.incoming_file || '');
    if (!scannedFileName) {
      return res.status(400).send('Fichier scanné manquant');
    }

    const scanPath = safeResolveInside(EBP_SCAN_DIR, scannedFileName);
    if (!fs.existsSync(scanPath)) {
      return res.status(400).send('Fichier scanné introuvable. Relancez le scan.');
    }

    const selectedExisting = String(req.body.existing_client || '').trim();
    const manualClient = String(req.body.client_name || '').trim();
    const finalClientName = selectedExisting || manualClient;
    if (!finalClientName) {
      return res.status(400).send('Nom client requis');
    }

    const createIfMissing = String(req.body.create_client_if_missing || '') === '1';
    const existingClientDb = db.prepare('SELECT id, name FROM clients WHERE lower(name) = lower(?) LIMIT 1').get(finalClientName);
    const safeClientFolder = safeName(finalClientName);
    const existingClientFolder = fs.existsSync(safeResolveInside(CLIENT_PC_DIR, safeClientFolder));

    if (!existingClientDb && !existingClientFolder && !createIfMissing) {
      return res.status(400).send('Client introuvable. Cochez "Créer le client" ou sélectionnez un client existant.');
    }

    if (!existingClientDb && createIfMissing) {
      db.prepare(
        `
        INSERT INTO clients (name, address, postal_code, city, email, phone, created_at)
        VALUES (?, NULL, NULL, NULL, NULL, NULL, ?)
      `
      ).run(finalClientName, new Date().toISOString());
    }

    const description = String(req.body.description || '').trim() || 'Commande depuis devis EBP';
    const quoteDate = String(req.body.quote_date || '').trim() || isoDate();
    const amountTtc = parseDecimalInput(req.body.amount_ttc, 0);
    const amountHt = parseDecimalInput(req.body.amount_ht, 0);
    const hasOnlyTtc = amountHt <= 0 && amountTtc > 0;
    if (hasOnlyTtc) {
      console.warn('Scan EBP: montant TTC détecté sans HT fiable, client_orders.price laissé à 0.');
    }
    const price = amountHt > 0 ? amountHt : 0;
    const vatRate = inferVatRateFromHtTtc(amountHt, amountTtc);

    const info = db.prepare(
      `
      INSERT INTO client_orders (
        name,
        description,
        date,
        price,
        vat_rate,
        planned_hours,
        chantier_status,
        chantier_start_date,
        chantier_end_date,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'En cours', ?)
    `
    ).run(
      finalClientName,
      description,
      quoteDate,
      price,
      vatRate,
      0,
      'À préparer',
      new Date().toISOString()
    );

    const orderId = info.lastInsertRowid;

    const internalDir = safeResolveInside(CLIENT_ORDER_FILES_DIR, String(orderId));
    ensureDir(internalDir);

    const clientDir = safeResolveInside(CLIENT_PC_DIR, safeClientFolder);
    ensureDir(clientDir);

    const orderFolderName = safeName(description && description.trim() !== '' ? description : `Commande_${orderId}`);
    const pcOrderDir = safeResolveInside(clientDir, orderFolderName);
    ensureDir(pcOrderDir);
    ensureStandardSubfolders(pcOrderDir);

    const devisDir = safeResolveInside(pcOrderDir, 'Devis');
    ensureDir(devisDir);
    const destinationPath = uniqueFilePath(devisDir, scannedOriginalName || scannedFileName);
    fs.copyFileSync(scanPath, destinationPath);

    if (scanSource === 'incoming') {
      if (!incomingFileName) {
        return res.status(400).send('Fichier incoming invalide');
      }

      const incomingPath = safeResolveInside(EBP_INCOMING_DIR, incomingFileName);
      if (fs.existsSync(incomingPath)) {
        ensureDir(EBP_INCOMING_PROCESSED_DIR);
        const treatedPath = uniqueFilePath(EBP_INCOMING_PROCESSED_DIR, incomingFileName);
        try {
          fs.renameSync(incomingPath, treatedPath);
        } catch {
          fs.copyFileSync(incomingPath, treatedPath);
          fs.unlinkSync(incomingPath);
        }
      }
    }

    try {
      fs.unlinkSync(scanPath);
    } catch {}

    return res.redirect(`/pc-folders/${encodeURIComponent(safeClientFolder)}/${encodeURIComponent(orderFolderName)}`);
  } catch (e) {
    return res.status(500).send(`Erreur création depuis scan EBP: ${escHtml(e.message || 'inconnue')}`);
  }
});

const scannerDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: SCANNER_MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (incomingDocuments.ALLOWED_EXTENSIONS.has(ext) && incomingDocuments.MIME_BY_EXT[ext] === mime) return cb(null, true);
    cb(new Error('Format non supporté. Utilisez PDF, JPG ou PNG.'));
  }
});

/* ===================== COMMANDES FOURNISSEURS ===================== */

app.get('/orders/suppliers', requireLogin, (req, res) => {
  const orders = db
    .prepare('SELECT * FROM supplier_orders ORDER BY date DESC, id DESC')
    .all();

  const activeCount = orders.filter((o) => String(o.status || 'En cours') !== 'Terminée').length;

  const chantierPurchases = db
    .prepare(`
      SELECT
        p.id,
        p.designation,
        p.category,
        p.qty,
        p.unit,
        p.reference,
        p.supplier,
        p.needed_date,
        p.status,
        co.id AS order_id,
        co.name AS client_name,
        co.description AS order_description
      FROM client_order_purchases p
      JOIN client_orders co ON co.id = p.client_order_id
      ORDER BY
        CASE COALESCE(NULLIF(TRIM(p.status), ''), 'À commander')
          WHEN 'À commander' THEN 0
          WHEN 'Commandé' THEN 1
          ELSE 2
        END,
        COALESCE(NULLIF(TRIM(p.needed_date), ''), '9999-12-31') ASC,
        p.id DESC
    `)
    .all();

  const statusFilter = ['todo', 'ordered', 'done'].includes(String(req.query.status || '').trim())
    ? String(req.query.status).trim()
    : 'all';
  const supplierFilter = String(req.query.supplier || 'all').trim() || 'all';
  const searchFilter = normalizeSearchText(req.query.q || '');

  const combinedSupplierItems = [
    ...chantierPurchases.map((item) => {
      const status = normalizePurchaseStatus(item.status);
      const bucket = status === 'À commander' ? 'todo' : status === 'Commandé' ? 'ordered' : 'done';
      const orderFolderName = clientOrderFolderName({
        id: item.order_id,
        description: item.order_description,
      });
      const orderUrl = `/pc-folders/${encodeURIComponent(safeName(item.client_name))}/${encodeURIComponent(orderFolderName)}/Commandes`;
      return {
        type: 'purchase',
        key: `purchase-${item.id}`,
        id: item.id,
        sourceLabel: 'Achat chantier',
        bucket,
        sortRank: bucket === 'todo' ? 0 : bucket === 'ordered' ? 1 : 2,
        status,
        supplier: String(item.supplier || '').trim(),
        title: item.designation || 'Article',
        subtitle: `${item.client_name || 'Client'} · ${item.order_description || `Commande #${item.order_id}`}`,
        meta: [
          item.category || 'Catégorie non renseignée',
          `${Number(item.qty || 0).toLocaleString('fr-FR')} ${item.unit || ''}`.trim(),
          item.reference ? `Réf. ${item.reference}` : 'Référence non renseignée',
          item.supplier || 'Fournisseur non renseigné',
          item.needed_date ? `Besoin ${formatDateLabel(item.needed_date)}` : 'Besoin non renseigné',
        ],
        searchText: normalizeSearchText([
          item.designation,
          item.category,
          item.reference,
          item.supplier,
          item.client_name,
          item.order_description,
        ].join(' ')),
        href: orderUrl,
      };
    }),
    ...orders.map((order) => {
      const status = String(order.status || 'En cours').trim() || 'En cours';
      const bucket = status === 'Terminée' ? 'done' : 'ordered';
      return {
        type: 'supplier',
        key: `supplier-${order.id}`,
        id: order.id,
        sourceLabel: 'Commande fournisseur',
        bucket,
        sortRank: bucket === 'ordered' ? 1 : 2,
        status,
        supplier: String(order.name || '').trim(),
        title: order.name || 'Commande fournisseur',
        subtitle: order.description || 'Aucune description',
        meta: [
          `Date ${formatDateLabel(order.date)}`,
          order.description || '',
        ].filter(Boolean),
        searchText: normalizeSearchText([order.name, order.description, order.date, status].join(' ')),
        href: `/orders/suppliers#supplier-${order.id}`,
      };
    }),
  ]
    .filter((item) => statusFilter === 'all' || item.bucket === statusFilter)
    .filter((item) => {
      if (supplierFilter === 'all') return true;
      if (supplierFilter === '__missing') return item.supplier === '';
      return item.supplier === supplierFilter;
    })
    .filter((item) => !searchFilter || item.searchText.includes(searchFilter))
    .sort((a, b) => a.sortRank - b.sortRank || String(a.supplier).localeCompare(String(b.supplier), 'fr') || String(a.title).localeCompare(String(b.title), 'fr'));

  const supplierChoices = Array.from(
    new Set(
      [
        ...orders.map((order) => String(order.name || '').trim()),
        ...chantierPurchases.map((item) => String(item.supplier || '').trim()),
      ]
    )
  ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

  const currentListUrl = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (supplierFilter !== 'all') params.set('supplier', supplierFilter);
    if (String(req.query.q || '').trim()) params.set('q', String(req.query.q).trim());
    const query = params.toString();
    return `/orders/suppliers${query ? `?${query}` : ''}#supplier-list`;
  };

  const supplierFilterOptions = [
    '<option value="all">Tous fournisseurs</option>',
    ...supplierChoices.map((supplier) => {
      const value = supplier ? supplier : '__missing';
      const label = supplier || 'Fournisseur non renseigné';
      return `<option value="${escHtml(value)}"${value === supplierFilter ? ' selected' : ''}>${escHtml(label)}</option>`;
    }),
  ].join('');

  const statusFilterOptions = [
    ['all', 'Tous'],
    ['todo', 'À commander'],
    ['ordered', 'Commandés'],
    ['done', 'Reçus ou terminés'],
  ]
    .map(([value, label]) => {
      return `<option value="${escHtml(value)}"${value === statusFilter ? ' selected' : ''}>${escHtml(label)}</option>`;
    })
    .join('');

  const combinedSupplierCards = combinedSupplierItems.length
    ? combinedSupplierItems
        .map((item) => {
          const isPurchase = item.type === 'purchase';
          const statusClass = isPurchase
            ? purchaseStatusClass(item.status)
            : item.status === 'Terminée' ? 'done' : 'ordered';
          const redirect = currentListUrl();
          return `
            <article class="supplier-purchase-card supplier-combined-card" id="${escHtml(item.key)}">
              <div class="supplier-purchase-context">
                <span class="supplier-source-badge ${isPurchase ? 'purchase' : 'supplier'}">${escHtml(item.sourceLabel)}</span>
                <strong>${escHtml(item.subtitle)}</strong>
              </div>
              <div class="supplier-purchase-main">
                <div>
                  <h3>${escHtml(item.title)}</h3>
                  <p>
                    ${item.meta.map((meta) => `<span>${escHtml(meta)}</span>`).join('')}
                  </p>
                </div>
                <span class="order-purchase-status ${statusClass}">${escHtml(item.status)}</span>
              </div>
              <div class="supplier-purchase-actions">
                <a class="supplier-purchase-link" href="${item.href}">${isPurchase ? 'Ouvrir chantier' : 'Ouvrir'}</a>
                ${isPurchase && item.status !== 'Commandé' ? `
                  <form method="POST" action="/orders/suppliers/purchases/${item.id}/status">
                    <input type="hidden" name="status" value="Commandé">
                    <input type="hidden" name="redirect" value="${escHtml(redirect)}">
                    <button type="submit">Marquer commandé</button>
                  </form>
                ` : ''}
                ${isPurchase && item.status !== 'Reçu' ? `
                  <form method="POST" action="/orders/suppliers/purchases/${item.id}/status">
                    <input type="hidden" name="status" value="Reçu">
                    <input type="hidden" name="redirect" value="${escHtml(redirect)}">
                    <button type="submit">Marquer reçu</button>
                  </form>
                ` : ''}
                ${!isPurchase && item.status !== 'Terminée' ? `
                  <form method="POST" action="/orders/suppliers/done">
                    <input type="hidden" name="id" value="${item.id}">
                    <button type="submit">Marquer terminé</button>
                  </form>
                ` : ''}
                ${!isPurchase ? `
                  <form method="POST" action="/orders/supplier/delete" onsubmit="return confirm('Supprimer cette commande ?');">
                    <input type="hidden" name="id" value="${item.id}">
                    <button class="modern-danger-btn" type="submit">${clientPageIcon('trash', 'modern-action-icon')} Supprimer</button>
                  </form>
                ` : ''}
              </div>
            </article>
          `;
        })
        .join('')
    : '<div class="empty-state">Aucune commande fournisseur ou achat ne correspond aux filtres.</div>';

  res.send(
    pageTemplate(req, 'Commandes fournisseurs', `
      <div class="modern-page supplier-modern-page">
        <section class="modern-list-head modern-client-orders-head supplier-modern-head">
          <div class="clients-create-head">
            ${clientPageIcon('supplierOrders', 'clients-title-icon')}
            <div>
              <h1>Commandes fournisseurs et achats</h1>
              <span>${orders.length} commande${orders.length > 1 ? 's' : ''} fournisseur · ${chantierPurchases.length} achat${chantierPurchases.length > 1 ? 's' : ''} chantier · ${activeCount} fournisseur${activeCount > 1 ? 's' : ''} en cours</span>
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

        <section class="supplier-purchases-section" id="supplier-list">
          <p class="supplier-list-summary">${combinedSupplierItems.length} élément${combinedSupplierItems.length > 1 ? 's' : ''} affiché${combinedSupplierItems.length > 1 ? 's' : ''}</p>
          <form method="GET" action="/orders/suppliers" class="supplier-purchase-filters">
            <label>
              <span>Statut</span>
              <select name="status" onchange="this.form.submit()">${statusFilterOptions}</select>
            </label>
            <label>
              <span>Fournisseur</span>
              <select name="supplier" onchange="this.form.submit()">${supplierFilterOptions}</select>
            </label>
            <label>
              <span>Recherche</span>
              <input name="q" value="${escHtml(String(req.query.q || ''))}" placeholder="Désignation, client, chantier, référence">
            </label>
            <button type="submit">Rechercher</button>
            <a href="/orders/suppliers#supplier-list">Réinitialiser</a>
          </form>
          <div class="supplier-purchase-list">
            ${combinedSupplierCards}
          </div>
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

app.post('/orders/suppliers/purchases/:purchaseId/status', requireLogin, (req, res) => {
  const purchaseId = Number(req.params.purchaseId || 0);
  const status = normalizePurchaseStatus(req.body.status);
  const redirect = String(req.body.redirect || '/orders/suppliers#supplier-list');
  const safeRedirect = redirect.startsWith('/orders/suppliers')
    ? redirect
    : '/orders/suppliers#supplier-list';

  const existing = db.prepare('SELECT id FROM client_order_purchases WHERE id = ?').get(purchaseId);
  if (!existing) return res.status(404).send('Article introuvable');

  db.prepare(`
    UPDATE client_order_purchases
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(status, new Date().toISOString(), purchaseId);

  res.redirect(safeRedirect);
});

/* ===================== PC FOLDERS (NAVIGATION) ===================== */

registerPcFoldersAliasRoute(app, {
  requireLogin,
  redirectPcFoldersToClients: clientsController.redirectPcFoldersToClients
});

registerClientFolderRoutes(app, {
  requireLogin,
  uploadSingleFile: pcUpload.single('file'),
  handlers: {
    showClientFolders: (req, res) => clientFolderNavigationController.showClientFolders(req, res),
    showClientOrderRootFolder: (req, res) => clientOrderFoldersController.showClientOrderRootFolder(req, res),
    showClientOrderFolder: (req, res) => clientOrderFoldersController.showClientOrderFolder(req, res),
    uploadClientOrderFolderFile: (req, res) => clientOrderFoldersController.uploadClientOrderFolderFile(req, res)
  }
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
/* ===================== DEVIS ===================== */

const quotesService = createQuotesService({
  db,
  clientsRoot: CLIENT_PC_DIR,
  listDirectoryEntries(folderPath) {
    return fs.readdirSync(folderPath, { withFileTypes: true });
  },
  roundAmount: round2,
  normalizeVatRate,
  normalizeQuoteStatus,
  formatDateLabel
});
const quotesController = createQuotesController({
  quotesService,
  renderQuotesListView,
  renderQuoteCreateView,
  pageTemplate,
  isoDate,
  escapeHtml: escHtml,
  quoteStatusClass,
  clientPageIcon,
  infoBar
});
registerQuoteRoutes(app, {
  requireLogin,
  handlers: {
    list: quotesController.showQuotesList,
    createForm: quotesController.showQuoteCreateForm,
    create: quotesController.createQuote
  }
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

app.get('/sketches/quotes/:id.png', requireLogin, (req, res) => {
  const quoteId = Number(req.params.id);
  const quote = Number.isFinite(quoteId) && quoteId > 0
    ? db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)
    : null;
  if (!quote) return res.status(404).send('Devis introuvable');
  return sendSketch('quotes', quoteId, res);
});

app.post('/api/devis/:id/sketch', requireLogin, (req, res) => {
  const quoteId = Number(req.params.id);
  const quote = Number.isFinite(quoteId) && quoteId > 0
    ? db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)
    : null;
  if (!quote) return res.status(404).json({ ok: false, error: 'Devis introuvable' });

  try {
    const filePath = saveSketchPng('quotes', quoteId, req.body?.image);
    return res.json({ ok: true, path: filePath });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Erreur sauvegarde croquis' });
  }
});

const OPENAI_QUOTE_REVIEW_MODEL = String(process.env.OPENAI_QUOTE_REVIEW_MODEL || 'gpt-4.1-mini').trim();
const QUOTE_AI_COST_FIELDS = [
  'cout_revient', 'cout_matiere', 'cout_sous_traitance', 'cout_galvanisation', 'cout_thermolaquage',
  'cout_motorisation', 'cout_accessoires', 'cout_transport', 'cout_consommables', 'cout_locations',
  'heures_etude', 'heures_atelier', 'heures_pose', 'cout_horaire'
];
function parseJsonArray(value) {
  try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

function getQuoteProfitability(quoteId) {
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
  if (!quote) return null;
  const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position ASC, id ASC').all(quoteId);
  const saved = db.prepare('SELECT * FROM quote_profitability_forecasts WHERE quote_id = ?').get(quoteId) || null;
  const adjustments = parseJsonArray(saved?.manual_adjustments_json);
  const calculations = projectProfitability.analyzeQuoteLines({ quote, lines, adjustments });
  return {
    quote, lines, saved, input: quote, calculations,
    historicalCost: Number(quote.cout_revient) > 0 ? Number(quote.cout_revient) : null,
    historicalForecastCosts: saved ? {
      materialCost: saved.material_cost, subcontractingCost: saved.subcontracting_cost,
      laborCost: saved.labor_cost, totalCost: saved.total_cost_price
    } : null,
    detectedCategories: projectProfitability.detectWorkCategories(quote, lines)
  };
}

function profitabilityPublic(context) {
  return {
    quoteId: context.quote.id,
    saved: context.saved,
    calculations: context.calculations,
    historicalCost: context.historicalCost,
    detectedCategories: context.detectedCategories,
    availableCategories: projectProfitability.WORK_CATEGORIES,
    lineCostCategories: projectProfitability.LINE_COST_CATEGORIES
  };
}

function quoteAiReviewPublic(row) {
  const parseJson = (value, fallback) => {
    try { return JSON.parse(String(value || '')); } catch { return fallback; }
  };
  const checks = parseJson(row.checks_json, {});
  const ai = parseJson(row.ai_response_json, {});
  return {
    id: row.id,
    quoteId: row.quote_id,
    riskLevel: row.risk_level,
    summary: {
      totalHT: row.total_ht,
      costPrice: row.cost_price,
      marginAmount: row.margin_amount,
      marginOnCost: row.margin_on_cost,
      marginOnSale: row.margin_on_sale,
      ...(checks.summary || {})
    },
    warnings: checks.warnings || [],
    positivePoints: checks.positivePoints || [],
    recommendation: checks.recommendation || '',
    ai: { used: Boolean(ai.used), message: String(ai.message || '') },
    modelName: row.model_name || null,
    createdAt: row.created_at
  };
}

function parseOpenAiJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

async function requestOpenAiQuoteReview(quote, lines, deterministic) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return { used: false, message: 'Analyse automatique effectuée sans interprétation IA.' };

  const systemPrompt = [
    'Tu es un contrôleur de devis spécialisé en métallerie, serrurerie et ouvrages métalliques sur mesure.',
    'Tu analyses sans modifier les prix et sans inventer de coûts.',
    'Les calculs financiers fournis par l’application sont fiables.',
    'Distingue les faits certains des points à vérifier et ne présente jamais une supposition comme une certitude.',
    'Réponds exclusivement en JSON valide avec les clés riskLevel, warnings, positivePoints et recommendation.'
  ].join(' ');
  const safePayload = {
    quoteNumber: quote.id,
    workDescription: String(quote.title || ''),
    lines: lines.map((line) => ({
      category: String(line.category || ''), label: String(line.label || ''),
      quantity: Number(line.qty || 0), unit: String(line.unit || ''),
      unitPriceHT: Number(line.unit_price || 0), totalHT: Number(line.total || 0)
    })),
    financialSummary: deterministic.summary,
    deterministicWarnings: deterministic.warnings
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_QUOTE_REVIEW_MODEL,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(safePayload) }] }
        ]
      }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}: ${String(payload?.error?.message || 'erreur API').slice(0, 300)}`);
    const parsed = parseOpenAiJson(quoteAiReview.extractResponseText(payload));
    return { used: true, review: quoteAiReview.sanitizeAiReview(parsed, deterministic.riskLevel), message: 'Interprétation IA effectuée.' };
  } finally {
    clearTimeout(timeout);
  }
}

app.get('/api/devis/:id/profitability', requireLogin, (req, res) => {
  const quoteId = parseOptionalId(req.params.id);
  if (!quoteId) return res.status(400).json({ success: false, error: 'ID devis invalide' });
  const context = getQuoteProfitability(quoteId);
  if (!context) return res.status(404).json({ success: false, error: 'Devis introuvable' });
  return res.json({ success: true, profitability: profitabilityPublic(context) });
});

app.post('/api/devis/:id/profitability', requireLogin, (req, res) => {
  const quoteId = parseOptionalId(req.params.id);
  if (!quoteId) return res.status(400).json({ success: false, error: 'ID devis invalide' });
  if (!db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)) return res.status(404).json({ success: false, error: 'Devis introuvable' });
  try {
    const requested = Array.isArray(req.body?.adjustments) ? req.body.adjustments : [];
    const adjustments = requested.slice(0, 50).map((item, index) => {
      const amount = Number(String(item?.amount ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Montant invalide pour l’ajustement ${index + 1}`);
      return { id: String(item.id || crypto.randomUUID()), label: String(item.label || '').trim() || 'Ajustement manuel',
        type: projectProfitability.LINE_COST_CATEGORIES.includes(item.type) ? item.type : 'divers', amount: round2(amount), lineId: parseOptionalId(item.lineId) };
    });
    const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ?').all(quoteId);
    for (const adjustment of adjustments) {
      if (adjustment.lineId && lines.some((line) => line.id === adjustment.lineId && (line.cost_total != null || line.cost_unit != null))) {
        throw new Error('Un ajustement ne peut pas doubler le coût déjà enregistré d’une ligne.');
      }
    }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO quote_profitability_forecasts (quote_id, manual_adjustments_json, notes, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(quote_id) DO UPDATE SET manual_adjustments_json=excluded.manual_adjustments_json,
        notes=excluded.notes, updated_at=excluded.updated_at, updated_by=excluded.updated_by
    `).run(quoteId, JSON.stringify(adjustments), String(req.body?.notes || '').trim(), now, now, parseOptionalId(req.session?.user?.id));
    return res.json({ success: true, profitability: profitabilityPublic(getQuoteProfitability(quoteId)) });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || 'Chiffrage invalide' });
  }
});

app.post('/api/devis/:id/profitability/analyze', requireLogin, runQuoteProfitabilityAnalysis);

async function runQuoteProfitabilityAnalysis(req, res) {
  const quoteId = parseOptionalId(req.params.id);
  if (!quoteId) return res.status(400).json({ success: false, error: 'ID devis invalide' });
  const context = getQuoteProfitability(quoteId);
  if (!context) return res.status(404).json({ success: false, error: 'Devis introuvable' });
  const { quote, lines, input, calculations: profitability } = context;
  const deterministic = quoteAiReview.calculateAutomaticLineReview(profitability, quote, lines);
  let aiResult = { used: false, message: 'Analyse automatique effectuée sans interprétation IA.' };
  try { aiResult = await requestOpenAiQuoteReview(input, lines, deterministic); }
  catch (error) { console.error('Erreur analyse IA devis:', error?.message || error); aiResult = { used: false, message: 'Interprétation IA indisponible. Les contrôles automatiques restent valides.' }; }
  const aiReview = aiResult.review || {};
  const review = { ...deterministic, riskLevel: aiReview.riskLevel || deterministic.riskLevel,
    warnings: Array.from(new Set(deterministic.warnings.concat(aiReview.warnings || []))),
    positivePoints: Array.from(new Set(deterministic.positivePoints.concat(aiReview.positivePoints || []))),
    recommendation: aiReview.recommendation || deterministic.recommendation };
  const createdAt = new Date().toISOString();
  const createdBy = parseOptionalId(req.session?.user?.id);
  db.prepare(`INSERT INTO quote_profitability_forecasts
    (quote_id, analysis_json, reliability_level, analyzed_at, engine_version, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(quote_id) DO UPDATE SET analysis_json=excluded.analysis_json, reliability_level=excluded.reliability_level,
      analyzed_at=excluded.analyzed_at, engine_version=excluded.engine_version, updated_at=excluded.updated_at, updated_by=excluded.updated_by`
  ).run(quoteId, JSON.stringify(profitability), profitability.reliability, createdAt, profitability.engineVersion, createdAt, createdAt, createdBy);
  const info = db.prepare(`INSERT INTO quote_ai_reviews
    (quote_id, risk_level, total_ht, cost_price, margin_amount, margin_on_cost, margin_on_sale, checks_json, ai_response_json, model_name, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(quoteId, review.riskLevel, review.summary.totalHT, review.summary.costPrice,
      review.summary.marginAmount, review.summary.marginOnCost, review.summary.marginOnSale, JSON.stringify(review),
      JSON.stringify({ used: aiResult.used, message: aiResult.message }), aiResult.used ? OPENAI_QUOTE_REVIEW_MODEL : null, createdAt, createdBy);
  return res.json({ success: true, review: { id: info.lastInsertRowid, ...review, ai: { used: aiResult.used, message: aiResult.message }, createdAt } });
}

app.post('/api/devis/:id/ai-review', requireLogin, runQuoteProfitabilityAnalysis);

app.get('/api/devis/:id/ai-reviews', requireLogin, (req, res) => {
  const quoteId = parseOptionalId(req.params.id);
  if (!quoteId) return res.status(400).json({ success: false, error: 'ID devis invalide' });
  if (!db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)) return res.status(404).json({ success: false, error: 'Devis introuvable' });
  const reviews = db.prepare('SELECT * FROM quote_ai_reviews WHERE quote_id = ? ORDER BY created_at DESC, id DESC').all(quoteId).map(quoteAiReviewPublic);
  return res.json({ success: true, reviews });
});

app.post('/devis/:id/ai-costs', requireLogin, (req, res) => {
  const quoteId = parseOptionalId(req.params.id);
  if (!quoteId) return res.status(400).send('ID devis invalide');
  if (!db.prepare('SELECT id FROM quotes WHERE id = ?').get(quoteId)) return res.status(404).send('Devis introuvable');
  try {
    const category = String(req.body?.work_category || '').trim();
    if (category && !projectProfitability.WORK_CATEGORIES.includes(category)) throw new Error('Catégorie d’ouvrage invalide');
    const values = QUOTE_AI_COST_FIELDS.map((field) => {
      const raw = String(req.body?.[field] ?? '').trim();
      if (!raw) return null;
      const value = Number(raw.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0) throw new Error(`Valeur invalide: ${field}`);
      return value;
    });
    db.transaction(() => {
      db.prepare(`UPDATE quotes SET ${QUOTE_AI_COST_FIELDS.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`).run(...values, quoteId);
      db.prepare('UPDATE quotes SET work_category = ? WHERE id = ?').run(category || null, quoteId);
    })();
  } catch (error) {
    return res.status(400).send(error.message || 'Coûts invalides');
  }
  return res.redirect(`/devis/${quoteId}#quote-ai-review-card`);
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
  const profitabilityContext = getQuoteProfitability(id);
  const profitabilitySaved = profitabilityContext.saved;
  const profitabilityForecast = profitabilityContext.calculations;
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

        <section id="quote-ai-review-card" class="quote-ai-review-card" data-quote-ai-review data-quote-id="${id}">
          <header class="quote-ai-review-head">
            <span class="quote-ai-review-icon" aria-hidden="true">${clientPageIcon('search')}</span>
            <div><h2>Rentabilité prévisionnelle</h2><p>Calculs financiers serveur et points de vigilance métier.</p></div>
            <span class="quote-ai-risk-badge is-${profitabilityForecast.status}" data-ai-risk>${profitabilityForecast.status === 'incomplete' ? 'Données incomplètes' : profitabilityForecast.critical ? 'Rouge critique' : profitabilityForecast.status === 'green' ? 'Vert' : profitabilityForecast.status === 'orange' ? 'Orange' : 'Rouge'}</span>
          </header>
          <div class="profitability-overview">
            ${[
              ['Prix de vente HT', profitabilityForecast.totalHT, 'money'],
              ['Coût matière détecté', profitabilityForecast.materialCost, 'money'],
              ['Sous-traitance détectée', profitabilityForecast.subcontractingCost, 'money'],
              ['Main-d’œuvre détectée', profitabilityForecast.laborCost, 'money'],
              ['Autres coûts détectés', profitabilityForecast.otherDetectedCost, 'money'],
              ['Ajustements manuels', profitabilityForecast.adjustmentsCost, 'money'],
              ['Coût total prévisionnel', profitabilityForecast.totalCost, 'money'],
              ['Marge prévisionnelle', profitabilityForecast.margin, 'optionalMoney'],
              ['Marge sur coût', profitabilityForecast.marginOnCost, 'percent'],
              ['Marge sur vente', profitabilityForecast.marginOnSale, 'percent'],
              ['Niveau de fiabilité', ({complete:'Complet',partial:'Partiel',incomplete:'Incomplet'})[profitabilityForecast.reliability], 'text'],
              ['Lignes sans coût', `${profitabilityForecast.counts.missing} / ${profitabilityForecast.counts.total}`, 'text'],
              ['Vente sans coût associé', profitabilityForecast.missingSaleHT, 'money']
            ].map(([label, value, type]) => `<div data-profitability-metric="${escHtml(label)}"><span>${label}</span><strong>${type === 'money' ? formatEuroFr(value) : type === 'optionalMoney' ? (value == null ? 'Non renseigné' : formatEuroFr(value)) : type === 'percent' ? (value == null ? 'Non calculable' : `${Number(value).toFixed(2)} %`) : type === 'hours' ? `${Number(value).toFixed(2)} h` : escHtml(value)}</strong></div>`).join('')}
          </div>
          <section class="profitability-line-analysis"><h3>Analyse des lignes du devis</h3><div class="profitability-line-table" role="table">
            ${profitabilityForecast.lines.map((line) => `<article class="profitability-line-row is-${line.status}" role="row"><div><span>Libellé</span><strong>${escHtml(line.label || 'Sans libellé')}</strong></div><div><span>Catégorie</span><strong>${escHtml(line.category)}</strong></div><div><span>Vente HT</span><strong>${formatEuroFr(line.saleHT)}</strong></div><div><span>Coût détecté</span><strong>${line.cost == null ? 'Coût non renseigné' : formatEuroFr(line.cost)}</strong></div><div><span>Marge</span><strong>${line.margin == null ? 'Non calculable' : formatEuroFr(line.margin)}</strong></div><div><span>Statut</span><strong>${line.status === 'missing' ? 'À compléter' : line.status === 'loss' ? 'Déficitaire' : 'Analysée'}</strong><small>${escHtml(line.origin)}</small></div></article>`).join('') || '<p class="profitability-empty">Aucune ligne à analyser.</p>'}
          </div></section>
          <div class="profitability-price-targets">
            ${[[20, 'minimum', profitabilityForecast.minimumPrice], [30, 'conseillé', profitabilityForecast.targetPrice], [35, 'confortable', profitabilityForecast.comfortablePrice]].map(([rate, label, price]) => `<div><span>Prix ${label} — marge ${rate} %</span><strong>${price == null ? 'Non calculable' : formatEuroFr(price)}</strong><small>${price == null ? 'Chiffrage requis.' : totalWithMargin >= price ? `Votre prix actuel est supérieur de ${formatEuroFr(totalWithMargin - price)}.` : `Il manque ${formatEuroFr(price - totalWithMargin)} pour atteindre cet objectif.`}</small></div>`).join('')}
          </div>
          <div class="quote-ai-actions">
            <button type="button" class="modern-secondary-btn" data-profitability-edit>Ajustements manuels</button>
            <button type="button" class="clients-submit-btn" data-ai-analyze>Réanalyser le devis</button>
            <button type="button" class="modern-secondary-btn" data-ai-history>Afficher l’historique</button>
          </div>
          <p class="quote-ai-status" data-ai-status>Aucune analyse chargée.</p>
          <div class="quote-ai-report" data-ai-report hidden>
            <div class="quote-ai-report-columns">
              <section><h3>Alertes et points à vérifier</h3><ul data-ai-warnings></ul></section>
              <section><h3>Points positifs</h3><ul data-ai-positive></ul></section>
            </div>
            <section class="quote-ai-recommendation"><h3>Recommandation</h3><p data-ai-recommendation></p></section>
            <p class="quote-ai-provider" data-ai-provider></p>
          </div>
          <div class="quote-ai-history" data-ai-history-list hidden></div>
          <div class="quote-profitability-editor" data-profitability-editor hidden>
            <form class="quote-profitability-form" data-profitability-form>
              <section class="profitability-adjustments"><h3>Ajustements manuels</h3><p>Ajoutez uniquement un coût absent des lignes du devis. Les coûts détectés automatiquement ne sont jamais remplacés.</p>
                <div data-adjustment-list>${parseJsonArray(profitabilitySaved?.manual_adjustments_json).map((item) => `<div class="profitability-adjustment-row" data-adjustment-row><label><span>Type</span><select data-adjustment-type>${projectProfitability.LINE_COST_CATEGORIES.map((type) => `<option value="${escHtml(type)}" ${item.type === type ? 'selected' : ''}>${escHtml(type)}</option>`).join('')}</select></label><label><span>Libellé</span><input data-adjustment-label value="${escHtml(item.label || '')}" required></label><label><span>Montant HT</span><input data-adjustment-amount type="number" min="0.01" step="0.01" inputmode="decimal" value="${escHtml(String(item.amount || ''))}" required></label><button type="button" class="modern-danger-btn" data-adjustment-remove>Supprimer</button></div>`).join('')}</div>
                <template data-adjustment-template><div class="profitability-adjustment-row" data-adjustment-row><label><span>Type</span><select data-adjustment-type>${projectProfitability.LINE_COST_CATEGORIES.map((type) => `<option value="${escHtml(type)}">${escHtml(type)}</option>`).join('')}</select></label><label><span>Libellé</span><input data-adjustment-label required></label><label><span>Montant HT</span><input data-adjustment-amount type="number" min="0.01" step="0.01" inputmode="decimal" required></label><button type="button" class="modern-danger-btn" data-adjustment-remove>Supprimer</button></div></template>
                <button type="button" class="modern-secondary-btn" data-adjustment-add>Ajouter un ajustement</button>
              </section>
              ${(profitabilityContext.historicalCost || profitabilityContext.historicalForecastCosts?.totalCost) ? `<p class="profitability-legacy">Ancienne donnée globale disponible (${formatEuroFr(profitabilityContext.historicalForecastCosts?.totalCost || profitabilityContext.historicalCost)}). Conservée pour l’historique, elle n’est pas ajoutée au calcul automatique.</p>` : ''}
              <label class="profitability-notes"><span>Notes</span><textarea name="notes" rows="3">${escHtml(profitabilitySaved?.notes || '')}</textarea></label>
              <div class="quote-ai-actions"><button class="clients-submit-btn" type="submit">Enregistrer les ajustements</button><button class="modern-secondary-btn" type="button" data-profitability-cancel>Annuler</button></div>
              <p class="quote-ai-status" data-profitability-status></p>
            </form>
          </div>
          <p class="quote-ai-disclaimer">Cette analyse est une aide au contrôle. La validation finale du devis reste sous la responsabilité de l’utilisateur.</p>
        </section>

        <script>
        (function () {
          var root = document.querySelector('[data-quote-ai-review]');
          if (!root) return;
          var quoteId = root.dataset.quoteId;
          var analyze = root.querySelector('[data-ai-analyze]');
          var historyButton = root.querySelector('[data-ai-history]');
          var status = root.querySelector('[data-ai-status]');
          var report = root.querySelector('[data-ai-report]');
          var historyList = root.querySelector('[data-ai-history-list]');
          var risk = root.querySelector('[data-ai-risk]');
          var editor = root.querySelector('[data-profitability-editor]');
          var editButton = root.querySelector('[data-profitability-edit]');
          var profitabilityForm = root.querySelector('[data-profitability-form]');
          var euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
          function text(value, fallback) { return value == null ? fallback : String(value); }
          function percent(value) { return value == null ? 'Non calculée' : Number(value).toFixed(2) + ' %'; }
          function fillList(selector, values, empty) {
            var list = root.querySelector(selector); list.innerHTML = '';
            var items = Array.isArray(values) && values.length ? values : [empty];
            items.forEach(function (value) { var li = document.createElement('li'); li.textContent = value; list.appendChild(li); });
          }
          function renderReview(review) {
            var summary = review.summary || {};
            risk.hidden = false; risk.className = 'quote-ai-risk-badge is-' + text(review.riskLevel, 'orange');
            risk.textContent = ({ incomplete: 'Données incomplètes', green: 'Vert', orange: 'Orange', red: 'Rouge' })[review.riskLevel] || 'À vérifier';
            var values = [
              ['Prix HT', euro.format(Number(summary.totalHT || 0))],
              ['Coût de revient', summary.costPrice ? euro.format(Number(summary.costPrice)) : 'Non renseigné'],
              ['Marge', summary.marginAmount == null ? 'Non calculée' : euro.format(Number(summary.marginAmount))],
              ['Marge sur coût', percent(summary.marginOnCost)], ['Marge sur vente', percent(summary.marginOnSale)],
              ['Prix minimum 20 %', summary.minimumPrice == null ? 'Non calculable' : euro.format(Number(summary.minimumPrice))],
              ['Prix conseillé 30 %', summary.targetPrice == null ? 'Non calculable' : euro.format(Number(summary.targetPrice))],
              ['Prix confortable 35 %', summary.comfortablePrice == null ? 'Non calculable' : euro.format(Number(summary.comfortablePrice))]
            ];
            fillList('[data-ai-warnings]', review.warnings, 'Aucune alerte supplémentaire.');
            fillList('[data-ai-positive]', review.positivePoints, 'Aucun point positif calculable avec les données disponibles.');
            root.querySelector('[data-ai-recommendation]').textContent = text(review.recommendation, 'Vérification manuelle recommandée.');
            root.querySelector('[data-ai-provider]').textContent = text(review.ai && review.ai.message, 'Analyse automatique effectuée sans interprétation IA.');
            report.hidden = false;
            status.textContent = 'Dernière analyse : ' + (review.createdAt ? new Date(review.createdAt).toLocaleString('fr-FR') : 'maintenant');
          }
          async function loadHistory(show) {
            try {
              var response = await fetch('/api/devis/' + quoteId + '/ai-reviews'); var data = await response.json();
              if (!response.ok || !data.success) throw new Error(data.error || 'Historique indisponible');
              if (data.reviews && data.reviews[0] && report.hidden) renderReview(data.reviews[0]);
              if (show) {
                historyList.innerHTML = '';
                if (!data.reviews.length) historyList.textContent = 'Aucune analyse enregistrée.';
                data.reviews.forEach(function (review) { var button = document.createElement('button'); button.type = 'button'; button.className = 'quote-ai-history-item'; button.textContent = new Date(review.createdAt).toLocaleString('fr-FR') + ' · ' + text(review.riskLevel, '').toUpperCase(); button.addEventListener('click', function () { renderReview(review); }); historyList.appendChild(button); });
                historyList.hidden = false;
              }
            } catch (error) { if (show) status.textContent = error.message || 'Historique indisponible'; }
          }
          analyze.addEventListener('click', async function () {
            analyze.disabled = true; analyze.setAttribute('aria-busy', 'true'); status.textContent = 'Analyse en cours…';
            try {
              var response = await fetch('/api/devis/' + quoteId + '/profitability/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); var data = await response.json();
              if (!response.ok || !data.success) throw new Error(data.error || 'Analyse impossible');
              renderReview(data.review); historyList.hidden = true;
            } catch (error) { status.textContent = error.message || 'Analyse impossible'; }
            finally { analyze.disabled = false; analyze.removeAttribute('aria-busy'); }
          });
          historyButton.addEventListener('click', function () { loadHistory(true); });
          editButton.addEventListener('click', function () { editor.hidden = false; editButton.disabled = true; editor.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
          root.querySelector('[data-profitability-cancel]').addEventListener('click', function () { editor.hidden = true; editButton.disabled = false; });
          var adjustmentList = root.querySelector('[data-adjustment-list]'); var adjustmentTemplate = root.querySelector('[data-adjustment-template]');
          function bindAdjustmentRow(row) { var remove = row.querySelector('[data-adjustment-remove]'); if (remove) remove.addEventListener('click', function () { row.remove(); }); }
          adjustmentList.querySelectorAll('[data-adjustment-row]').forEach(bindAdjustmentRow);
          root.querySelector('[data-adjustment-add]').addEventListener('click', function () { var row = adjustmentTemplate.content.firstElementChild.cloneNode(true); adjustmentList.appendChild(row); bindAdjustmentRow(row); row.querySelector('input').focus(); });
          profitabilityForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            var submit = profitabilityForm.querySelector('[type="submit"]'); var formStatus = root.querySelector('[data-profitability-status]');
            submit.disabled = true; formStatus.textContent = 'Enregistrement…';
            var body = { notes: new FormData(profitabilityForm).get('notes') || '', adjustments: [] };
            adjustmentList.querySelectorAll('[data-adjustment-row]').forEach(function (row) { body.adjustments.push({ type: row.querySelector('[data-adjustment-type]').value, label: row.querySelector('[data-adjustment-label]').value, amount: row.querySelector('[data-adjustment-amount]').value }); });
            try { var response = await fetch('/api/devis/' + quoteId + '/profitability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); var data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error || 'Enregistrement impossible'); location.reload(); }
            catch (error) { formStatus.textContent = error.message || 'Enregistrement impossible'; submit.disabled = false; }
          });
          loadHistory(false);
        })();
        </script>

        <section class="quote-collapsible-section" id="quote-section-add-line" data-quote-collapsible>
          <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-add-line-panel" data-quote-collapsible-toggle>
            <span class="quote-collapsible-title">
              ${clientPageIcon('add', 'quote-collapsible-icon')}
              <span>
                <strong>Ajouter une ligne / prestation</strong>
                <small>Matière, main-d'œuvre et calculateurs</small>
              </span>
            </span>
            <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
          </button>
          <div class="quote-collapsible-panel" id="quote-section-add-line-panel" hidden data-quote-collapsible-panel>
            <div class="quote-collapsible-content">
              <section class="quote-work-card quote-add-line-card quote-collapsible-inner-card">
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
          <input type="hidden" name="cost_category" id="quickMatCostCategory" value="matière acier">
          <input type="hidden" name="cost_unit" id="quickMatCostUnit" value="">
          <input type="hidden" name="cost_source" value="répertoire matières">

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
  <input id="matMargin" name="margin_pct" type="number" step="0.1" value="30">
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
const costUnit = document.getElementById('quickMatCostUnit');
const costCategory = document.getElementById('quickMatCostCategory');

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
    if (costUnit) costUnit.value = '';
    updateMaterialSummary(null);
    return;
  }

  if (found.unit){
    setMaterialUnit(found.unit);
  }

  if (Number.isFinite(found.price) && found.price > 0){
    if (costUnit) costUnit.value = found.price.toFixed(2);
    if (costCategory) {
      const descriptor = (found.type + ' ' + found.name).toLowerCase();
      costCategory.value = descriptor.includes('inox') ? 'inox' : descriptor.includes('alu') ? 'aluminium' : descriptor.includes('bois') ? 'bois' : 'matière acier';
    }

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
  if (!win) {
    alert('Impossible d\'ouvrir la fenêtre d\'impression.');
    return;
  }

  const printHtml = \`
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plan de coupe</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h2 { text-align: center; margin-bottom: 15px; }
    .bar-box { border: 1px solid #000; padding: 10px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h2>Plan de coupe</h2>
  \${result.innerHTML}
</body>
</html>\`;

  win.document.open();
  win.document.write(printHtml);
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
  if (!w) {
    alert('Impossible d\'ouvrir la fenêtre d\'impression.');
    return;
  }

  var printHtml = \`
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plan de découpe tôles</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    img { max-width: 100%; border: 1px solid #000; }
  </style>
</head>
<body>
  <h2>Plan de découpe tôles</h2>
  \${result}
  <img src="\${imgData}" alt="Plan de découpe">
</body>
</html>\`;

  w.document.open();
  w.document.write(printHtml);
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
        <select id="prest_type" name="cost_category" required>
          <option value="main-d’œuvre atelier">Main d’œuvre atelier</option>
          <option value="main-d’œuvre pose">Pose</option>
          <option value="sous-traitance">Laser / sous-traitance</option>
          <option value="galvanisation">Galvanisation</option>
          <option value="thermolaquage">Thermolaquage</option>
          <option value="matière acier">Matières</option>
          <option value="motorisation">Motorisation</option>
          <option value="déplacement">Déplacement</option>
          <option value="location">Location</option>
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
        <input id="prest_cost" name="cost_unit" type="number" min="0" step="0.01" value="" placeholder="Coût interne" />
        </div>
      </div>

      <div class="modern-field">
        <label>Marge (%)</label>
        <div class="clients-input-shell">
          ${clientPageIcon('add')}
        <input id="prest_margin" name="margin_pct" type="number" step="0.1" value="" placeholder="0" />
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
            </div>
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

<section class="quote-collapsible-stack" aria-label="Sections secondaires du devis">
  <section class="quote-collapsible-section" id="quote-section-measurements" data-quote-collapsible>
    <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-measurements-panel" data-quote-collapsible-toggle>
      <span class="quote-collapsible-title">
        ${clientPageIcon('measurements', 'quote-collapsible-icon')}
        <span>
          <strong>Prises de cotes</strong>
          <small>${linkedMeasurements.length} liée${linkedMeasurements.length > 1 ? 's' : ''}</small>
        </span>
      </span>
      <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="quote-collapsible-panel" id="quote-section-measurements-panel" hidden data-quote-collapsible-panel>
      <div class="quote-collapsible-content">
        <section class="quote-work-card measurement-linked-section quote-collapsible-inner-card">
          ${renderQuoteMeasurementCreationLinks(id)}
          ${renderMeasurementCards(linkedMeasurements, { fromQuoteId: id })}
        </section>
      </div>
    </div>
  </section>

  <section class="quote-collapsible-section" id="quote-section-notes" data-quote-collapsible>
    <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-notes-panel" data-quote-collapsible-toggle>
      <span class="quote-collapsible-title">
        ${clientPageIcon('postal', 'quote-collapsible-icon')}
        <span>
          <strong>Notes chantier</strong>
          <small>${quote.notes ? 'Notes renseignées' : 'Aucune note'}</small>
        </span>
      </span>
      <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="quote-collapsible-panel" id="quote-section-notes-panel" hidden data-quote-collapsible-panel>
      <div class="quote-collapsible-content">
        <article class="quote-work-card quote-collapsible-inner-card">

    <form method="POST" action="/devis/${id}/notes" class="quote-notes-form">
      <textarea name="notes" rows="8">${escHtml(quote.notes || '')}</textarea>
      <div class="modern-form-actions">
        <button type="submit" class="clients-submit-btn"><span>${clientPageIcon('add', 'clients-submit-icon')}</span>Enregistrer</button>
      </div>
    </form>
        </article>
      </div>
    </div>
  </section>

  <section class="quote-collapsible-section" id="quote-section-photos" data-quote-collapsible>
    <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-photos-panel" data-quote-collapsible-toggle>
      <span class="quote-collapsible-title">
        ${clientPageIcon('folder', 'quote-collapsible-icon')}
        <span>
          <strong>Photos et fichiers</strong>
          <small>Photos · ${photos.length}</small>
        </span>
      </span>
      <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="quote-collapsible-panel" id="quote-section-photos-panel" hidden data-quote-collapsible-panel>
      <div class="quote-collapsible-content">
        <article class="quote-work-card quote-collapsible-inner-card">

    <form method="POST" action="/devis/${id}/photo" enctype="multipart/form-data" class="quote-photo-form">
      <input type="file" name="photo" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" required>
      <button type="submit" class="modern-secondary-btn">Ajouter</button>
    </form>

    <div class="photo-grid quote-photo-grid">
      ${photosHtml || '<div class="empty-state">Aucune photo.</div>'}
    </div>
        </article>
      </div>
    </div>
  </section>

  <section class="quote-collapsible-section" id="quote-section-sketch" data-quote-collapsible>
    <button type="button" class="quote-collapsible-toggle" aria-expanded="false" aria-controls="quote-section-sketch-panel" data-quote-collapsible-toggle>
      <span class="quote-collapsible-title">
        ${clientPageIcon('measurements', 'quote-collapsible-icon')}
        <span>
          <strong>Croquis / notes manuscrites</strong>
          <small>Dessin au doigt, stylet ou souris</small>
        </span>
      </span>
      <span class="quote-collapsible-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>
    </button>
    <div class="quote-collapsible-panel" id="quote-section-sketch-panel" hidden data-quote-collapsible-panel>
      <div class="quote-collapsible-content">
        ${renderSketchBlock({ scope: 'quotes', id, className: 'quote-work-card quote-collapsible-inner-card' })}
      </div>
    </div>
  </section>
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
  const sections = Array.from(document.querySelectorAll('[data-quote-collapsible]'));
  if (!sections.length) return;

  function setSection(section, open) {
    const toggle = section.querySelector('[data-quote-collapsible-toggle]');
    const panel = section.querySelector('[data-quote-collapsible-panel]');
    if (!toggle || !panel) return;
    section.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      panel.hidden = false;
      window.requestAnimationFrame(function () {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      });
    } else {
      panel.style.maxHeight = panel.scrollHeight + 'px';
      window.requestAnimationFrame(function () {
        panel.style.maxHeight = '0px';
      });
      window.setTimeout(function () {
        if (toggle.getAttribute('aria-expanded') !== 'true') panel.hidden = true;
      }, 220);
    }
  }

  sections.forEach(function (section) {
    const toggle = section.querySelector('[data-quote-collapsible-toggle]');
    const panel = section.querySelector('[data-quote-collapsible-panel]');
    if (!toggle || !panel) return;
    panel.style.maxHeight = '0px';
    toggle.addEventListener('click', function () {
      const shouldOpen = toggle.getAttribute('aria-expanded') !== 'true';
      if (shouldOpen && window.matchMedia('(max-width: 768px)').matches) {
        sections.forEach(function (other) {
          if (other !== section) setSection(other, false);
        });
      }
      setSection(section, shouldOpen);
    });
  });

  const targetedSection = window.location.hash ? document.querySelector(window.location.hash) : null;
  if (targetedSection && targetedSection.matches('[data-quote-collapsible]')) {
    setSection(targetedSection, true);
    window.requestAnimationFrame(function () { targetedSection.scrollIntoView({ block: 'start' }); });
  }

  window.addEventListener('resize', function () {
    sections.forEach(function (section) {
      const toggle = section.querySelector('[data-quote-collapsible-toggle]');
      const panel = section.querySelector('[data-quote-collapsible-panel]');
      if (toggle && panel && toggle.getAttribute('aria-expanded') === 'true') {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });
})();
</script>

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
<script src="/sketchpad.js"></script>
<script>
window.initSketchPad && window.initSketchPad({
  root: document.querySelector('[data-sketchpad][data-sketch-scope="quotes"]'),
  getSaveUrl: function (root) {
    return '/api/devis/' + root.dataset.sketchId + '/sketch';
  },
  getImageUrl: function (root) {
    return root.dataset.sketchImageUrl;
  }
});
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

  res.send(pageTemplate(req, 'Modifier la ligne', `
    <main class="quote-line-editor-page">
      <header class="quote-line-editor-hero">
        <a href="/devis/${line.quote_id}" class="quote-line-editor-back" aria-label="Retour au devis">${clientPageIcon('arrow-left')}<span>Retour</span></a>
        <span class="quote-line-editor-hero-icon">${clientPageIcon('quotes')}</span>
        <div><p>Devis #${line.quote_id}</p><h1>Modifier la ligne</h1><span>${escHtml(line.label || 'Sans libellé')}</span></div>
      </header>
      <form method="POST" action="/devis/line/${line.id}/edit" id="quoteLineEditForm" class="quote-line-editor-card">
        <section class="quote-line-editor-section">
          <div class="quote-line-editor-section-head"><h2>Informations générales</h2><p>Identification et classement de la ligne.</p></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field field-wide"><span>Libellé</span><input name="label" value="${escHtml(line.label || '')}" required autocomplete="off"></label>
            <label class="quote-line-editor-field field-wide"><span>Catégorie de coût</span><select name="cost_category"><option value="">Détection automatique</option>${projectProfitability.LINE_COST_CATEGORIES.map((category) => `<option value="${escHtml(category)}" ${line.cost_category === category ? 'selected' : ''}>${escHtml(category)}</option>`).join('')}</select><small>Laissez vide pour utiliser la détection automatique.</small></label>
          </div>
        </section>
        <section class="quote-line-editor-section">
          <div class="quote-line-editor-section-head"><h2>Quantité</h2></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field"><span>Quantité</span><input name="qty" type="number" inputmode="decimal" min="0.01" step="0.01" value="${escHtml(String(line.qty))}" required></label>
            <label class="quote-line-editor-field"><span>Unité</span><input name="unit" value="${escHtml(line.unit || '')}" readonly><small>L’unité existante est conservée.</small></label>
          </div>
        </section>
        <section class="quote-line-editor-section">
          <div class="quote-line-editor-section-head"><h2>Coût d’achat</h2><p>Données internes utilisées par la rentabilité.</p></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field"><span>Prix d’achat unitaire</span><span class="quote-line-editor-input-unit"><input name="cost_unit" type="number" inputmode="decimal" min="0" step="0.01" value="${line.cost_unit == null ? '' : escHtml(String(line.cost_unit))}"><b>€</b></span><small>Coût réel payé par unité.</small></label>
            <label class="quote-line-editor-field"><span>Coût total explicite</span><span class="quote-line-editor-input-unit"><input name="cost_total" type="number" inputmode="decimal" min="0" step="0.01" value="${line.cost_total == null ? '' : escHtml(String(line.cost_total))}"><b>€</b></span><small>Prioritaire lorsqu’il est renseigné.</small></label>
          </div>
        </section>
        <section class="quote-line-editor-section">
          <div class="quote-line-editor-section-head"><h2>Règle de vente</h2><p>Le prix de vente reste calculé avec la formule actuelle du devis.</p></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field"><span>Marge</span><span class="quote-line-editor-input-unit"><input name="margin_pct" type="number" inputmode="decimal" step="0.1" value="${line.margin_pct == null ? '' : escHtml(String(line.margin_pct))}"><b>%</b></span><small>Pourcentage appliqué au prix d’achat.</small></label>
            <label class="quote-line-editor-field"><span>Coefficient</span><input name="coefficient" type="number" inputmode="decimal" min="0.01" step="0.01" value="${line.coefficient == null ? '' : escHtml(String(line.coefficient))}"><small>Multiplicateur enregistré pour la vente.</small></label>
            <label class="quote-line-editor-field field-wide"><span>Prix de vente unitaire</span><span class="quote-line-editor-input-unit"><input name="unit_price" type="number" inputmode="decimal" min="0" step="0.01" value="${escHtml(String(line.unit_price))}" required><b>€</b></span></label>
          </div>
        </section>
        <section class="quote-line-editor-section quote-line-editor-labor">
          <div class="quote-line-editor-section-head"><h2>Main-d’œuvre</h2><p>À renseigner uniquement pour une ligne de temps de travail.</p></div>
          <div class="quote-line-editor-grid">
            <label class="quote-line-editor-field"><span>Heures</span><span class="quote-line-editor-input-unit"><input name="hours" type="number" inputmode="decimal" min="0" step="0.01" value="${line.hours == null ? '' : escHtml(String(line.hours))}"><b>h</b></span></label>
            <label class="quote-line-editor-field"><span>Coût horaire interne</span><span class="quote-line-editor-input-unit"><input name="hourly_cost" type="number" inputmode="decimal" min="0" step="0.01" value="${line.hourly_cost == null ? '' : escHtml(String(line.hourly_cost))}"><b>€/h</b></span><small>Utilisé pour calculer le coût de la main-d’œuvre.</small></label>
          </div>
        </section>
        <aside class="quote-line-editor-summary" aria-live="polite"><h2>Synthèse</h2><dl><div><dt>Coût d’achat total</dt><dd data-line-summary-cost>Non calculable</dd></div><div><dt>Prix de vente HT</dt><dd data-line-summary-sale>Non calculable</dd></div><div><dt>Marge estimée</dt><dd data-line-summary-margin>Non calculable</dd></div><div><dt>Marge sur vente</dt><dd data-line-summary-rate>Non calculable</dd></div></dl></aside>
        <div class="quote-line-editor-actions"><a href="/devis/${line.quote_id}" class="modern-secondary-btn">Annuler</a><button type="submit" class="clients-submit-btn" data-line-save>Enregistrer</button></div>
      </form>
    </main>
    <script>(function(){var form=document.getElementById('quoteLineEditForm');if(!form)return;var cost=form.elements.cost_unit;var totalCost=form.elements.cost_total;var margin=form.elements.margin_pct;var price=form.elements.unit_price;var qty=form.elements.qty;var hours=form.elements.hours;var hourly=form.elements.hourly_cost;var save=form.querySelector('[data-line-save]');var euro=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});function number(input){if(!input||input.value==='')return null;var value=Number(input.value);return Number.isFinite(value)?value:null;}function updatePrice(){if(cost.value==='')return;var c=Number(cost.value);var m=margin.value===''?0:Number(margin.value);if(Number.isFinite(c)&&Number.isFinite(m))price.value=(c*(1+m/100)).toFixed(2);}function updateSummary(){var q=number(qty);var unitCost=number(cost);var explicitCost=number(totalCost);var h=number(hours);var rate=number(hourly);var unitSale=number(price);var purchase=explicitCost!==null?explicitCost:(unitCost!==null&&q!==null?unitCost*q:(h!==null&&rate!==null?h*rate:null));var sale=unitSale!==null&&q!==null?unitSale*q:null;var estimatedMargin=purchase!==null&&sale!==null?sale-purchase:null;var marginRate=estimatedMargin!==null&&sale>0?estimatedMargin/sale*100:null;form.querySelector('[data-line-summary-cost]').textContent=purchase===null?'Non calculable':euro.format(purchase);form.querySelector('[data-line-summary-sale]').textContent=sale===null?'Non calculable':euro.format(sale);form.querySelector('[data-line-summary-margin]').textContent=estimatedMargin===null?'Non calculable':euro.format(estimatedMargin);form.querySelector('[data-line-summary-rate]').textContent=marginRate===null?'Non calculable':marginRate.toFixed(2)+' %';}cost.addEventListener('input',function(){updatePrice();updateSummary();});margin.addEventListener('input',function(){updatePrice();updateSummary();});[totalCost,price,qty,hours,hourly].forEach(function(input){input.addEventListener('input',updateSummary);});form.addEventListener('submit',function(){save.disabled=true;save.setAttribute('aria-busy','true');save.textContent='Enregistrement…';});updateSummary();})();</script>
  `));

});
app.post('/devis/line/:id/edit', requireLogin, (req, res) => {

  const line = db
    .prepare('SELECT * FROM quote_lines WHERE id = ?')
    .get(req.params.id);
  if (!line) return res.status(404).send('Ligne introuvable');

  const qty = Number(req.body.qty || 0);
  const pu = Number(req.body.unit_price || 0);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(pu) || pu < 0) return res.status(400).send('Quantité ou prix de vente invalide');
  const costUnitRaw = String(req.body.cost_unit ?? '').trim();
  const costUnit = costUnitRaw === '' ? null : Number(costUnitRaw.replace(',', '.'));
  const optionalBodyNumber = (name) => { const raw = String(req.body[name] ?? '').trim(); return raw === '' ? null : Number(raw.replace(',', '.')); };
  const marginPct = optionalBodyNumber('margin_pct');
  const coefficient = optionalBodyNumber('coefficient');
  const costTotal = optionalBodyNumber('cost_total');
  const hours = optionalBodyNumber('hours');
  const hourlyCost = optionalBodyNumber('hourly_cost');
  const costCategory = String(req.body.cost_category || '').trim();
  if (costUnit !== null && (!Number.isFinite(costUnit) || costUnit < 0)) return res.status(400).send('Coût unitaire invalide');
  for (const [label, value] of [['marge', marginPct], ['coefficient', coefficient], ['coût total', costTotal], ['heures', hours], ['coût horaire', hourlyCost]]) {
    if (value !== null && (!Number.isFinite(value) || (label !== 'marge' && value < 0))) return res.status(400).send(`${label} invalide`);
  }
  if (costCategory && !projectProfitability.LINE_COST_CATEGORIES.includes(costCategory)) return res.status(400).send('Catégorie de coût invalide');

  db.prepare(`
    UPDATE quote_lines
    SET
      label = ?,
      qty = ?,
      unit_price = ?,
      total = ?,
      cost_unit = ?,
      cost_total = ?,
      margin_pct = ?,
      coefficient = ?,
      hours = ?,
      hourly_cost = ?,
      cost_category = ?,
      cost_source = ?
    WHERE id = ?
  `).run(
    req.body.label,
    qty,
    pu,
    qty * pu,
    costUnit,
    costTotal,
    marginPct,
    coefficient,
    hours,
    hourlyCost,
    costCategory || null,
    [costUnit, costTotal, marginPct, coefficient, hours, hourlyCost].every((value) => value === null) ? null : 'modification de la ligne',
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
  const costUnitRaw = String(req.body.cost_unit ?? '').trim();
  const costUnit = costUnitRaw === '' ? null : Number(costUnitRaw.replace(',', '.'));
  const lineMarginRaw = String(req.body.margin_pct ?? '').trim();
  const lineMargin = lineMarginRaw === '' ? null : Number(lineMarginRaw.replace(',', '.'));
  const optionalLineNumber = (name) => { const raw = String(req.body[name] ?? '').trim(); return raw === '' ? null : Number(raw.replace(',', '.')); };
  const coefficient = optionalLineNumber('coefficient');
  const costTotal = optionalLineNumber('cost_total');
  const submittedHours = optionalLineNumber('hours');
  const submittedHourlyCost = optionalLineNumber('hourly_cost');
  const costCategory = String(req.body.cost_category || '').trim();
  const hasLineCostInput = [costUnit, costTotal, lineMargin, coefficient, submittedHours, submittedHourlyCost].some((value) => value !== null);
  const costSource = String(req.body.cost_source || (hasLineCostInput ? 'saisie de la ligne' : '')).trim();

  if (!quote_id || !label || !unit || !Number.isFinite(qty) || !Number.isFinite(unit_price) || qty <= 0 || unit_price <= 0) {
    return res.status(400).send('Données ligne invalides');
  }
  if ((costUnit !== null && (!Number.isFinite(costUnit) || costUnit < 0)) || (lineMargin !== null && !Number.isFinite(lineMargin))) return res.status(400).send('Coût ou marge de ligne invalide');
  for (const value of [coefficient, costTotal, submittedHours, submittedHourlyCost]) if (value !== null && (!Number.isFinite(value) || value < 0)) return res.status(400).send('Donnée de coût invalide');

  const total = round2(qty * unit_price);

  db.prepare(
    `
    INSERT INTO quote_lines (quote_id, category, label, qty, unit, unit_price, total, cost_unit, cost_total, margin_pct, coefficient, hours, hourly_cost, cost_category, cost_source, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(quote_id, category || null, label, qty, unit, unit_price, total, costUnit, costTotal, lineMargin, coefficient,
    submittedHours ?? (['h', 'heure', 'heures'].includes(unit.toLowerCase()) ? qty : null),
    submittedHourlyCost ?? (['h', 'heure', 'heures'].includes(unit.toLowerCase()) ? costUnit : null),
    costCategory || null, costSource || null, 0, new Date().toISOString());

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
    INSERT INTO quote_lines (quote_id, category, label, qty, unit, unit_price, total, cost_unit, cost_category, cost_source, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(quote_id, category || null, label, qty, unit, unit_price, total, unit_price,
    projectProfitability.detectLineCostCategory({ category, label }), 'répertoire matières', 0, new Date().toISOString());

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

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
    if (!quote) return res.status(404).send('Devis introuvable');

    const structuredPlannedHours = Number(quote.heures_etude || 0)
      + Number(quote.heures_atelier || 0)
      + Number(quote.heures_pose || 0);
    if (structuredPlannedHours > 0) plannedHours = structuredPlannedHours;

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
  const createOrderWithForecast = db.transaction(() => {
    const orderInsert = db.prepare(
  `
  INSERT INTO client_orders
  (
    name,
    description,
    date,
    price,
    vat_rate,
    planned_hours,
    quote_id,
    work_category,
    status,
    created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'En cours', ?)
  `
    ).run(
      clientName, orderTitle, isoDate(), totalWithMargin, parseOptionalVatRate(quote.vat_rate),
      plannedHours, quoteId, projectProfitability.detectWorkCategory(quote, lines), new Date().toISOString()
    );
    const clientOrderId = Number(orderInsert.lastInsertRowid);
    saveProjectForecast({ ...quote, total_ht: totalWithMargin }, lines, clientOrderId);
    importMissingQuoteCostLines(clientOrderId, quoteId);
    db.prepare("UPDATE quotes SET status = 'Accepté' WHERE id = ?").run(quoteId);
    return clientOrderId;
  });
  createOrderWithForecast();

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

  removeStoragePathIfExists(safeResolveInside(QUOTE_PHOTO_DIR, String(quoteId)));
  removeStoragePathIfExists(sketchPath('quotes', quoteId));

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
  if (!win) {
    alert('Impossible d\\'ouvrir la fenêtre d\\'impression.');
    return;
  }

  var printHtml =
    '<!doctype html>' +
    '<html lang="fr">' +
      '<head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>Plan de coupe barres</title>' +
        '<style>' +
          'body{font-family:Arial,sans-serif;padding:20px;}' +
          'h2{text-align:center;margin-bottom:15px;}' +
          '.bar-box{border:1px solid #000;padding:10px;margin-bottom:8px;}' +
          '.print-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px;}' +
          '.print-toolbar a,.print-toolbar button{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:1px solid #999;border-radius:999px;background:#fff;color:#111;text-decoration:none;font:600 14px Arial,sans-serif;cursor:pointer;}' +
          '.print-toolbar button{background:#f3f4f6;}' +
          '@media print{.print-toolbar{display:none !important;}}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="print-toolbar">' +
          '<a href="/outils/logibarre">← Retour à LogiBarre</a>' +
          '<button type="button" onclick="window.print()">Imprimer</button>' +
        '</div>' +
        '<h2>Plan de coupe barres</h2>' +
        content +
      '</body>' +
    '</html>';

  win.document.open();
  win.document.write(printHtml);
  win.document.close();
  win.focus();
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
  if (!win) {
    alert('Impossible d\\'ouvrir la fenêtre d\\'impression.');
    return;
  }

  var printHtml =
    '<!doctype html>' +
    '<html lang="fr">' +
      '<head>' +
        '<meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>Plan de découpe tôles</title>' +
        '<style>' +
          'body{font-family:Arial,sans-serif;padding:20px;}' +
          'h2{text-align:center;margin-bottom:15px;}' +
          '.sheet-box{border:1px solid #000;padding:10px;margin-bottom:8px;}' +
          '.print-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:12px;}' +
          '.print-toolbar a,.print-toolbar button{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:1px solid #999;border-radius:999px;background:#fff;color:#111;text-decoration:none;font:600 14px Arial,sans-serif;cursor:pointer;}' +
          '.print-toolbar button{background:#f3f4f6;}' +
          '@media print{.print-toolbar{display:none !important;}}' +
        '</style>' +
      '</head>' +
      '<body>' +
        '<div class="print-toolbar">' +
          '<a href="/outils/logitole">← Retour à LogiTôle</a>' +
          '<button type="button" onclick="window.print()">Imprimer</button>' +
        '</div>' +
        '<h2>Plan de découpe tôles</h2>' +
        content +
      '</body>' +
    '</html>';

  win.document.open();
  win.document.write(printHtml);
  win.document.close();
  win.focus();
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
app.post('/agenda/delete', requireLogin, async (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.body.id);

  if (event?.google_event_id && req.session.googleTokens) {
    try {
      oauth2Client.setCredentials(req.session.googleTokens);
      const calendar = google.calendar({
        version: 'v3',
        auth: oauth2Client
      });
      await calendar.events.delete({
        calendarId: GOOGLE_CALENDAR_ID,
        eventId: event.google_event_id
      });
    } catch (err) {
      const status = err.response?.status || err.code;
      if (status !== 404 && status !== 410) {
        console.error('Erreur suppression Google Agenda :', err.response ? err.response.data : err);
        return res.status(502).json({ success: false, error: 'Erreur suppression Google Agenda' });
      }
    }
  }

  db.prepare('DELETE FROM events WHERE id = ?').run(req.body.id);
  res.json({ success: true });
});

const clientOrderProfitabilityController = createClientOrderProfitabilityController({
  db,
  pageTemplate,
  escapeHtml: escHtml,
  formatEuroFr,
  isoDate,
  getClientOrderFinancialSnapshot: clientOrderFinancialSnapshot.getClientOrderFinancialSnapshot,
  validateClientOrderCostLine: clientOrderCostLines.validateLine,
  clientOrderForecastData,
  projectProfitabilityForOrder,
  renderClientOrderProfitabilityView,
  clientPageIcon,
  pcFolderIcon,
  calculateCostLine: clientOrderCostLines.calculateLine,
  laborCategories: clientOrderCostLines.LABOR_CATEGORIES,
  materialUnits: clientOrderCostLines.MATERIAL_UNITS,
  clientOrderFolderUrl,
  roundAmount: round2,
  clientOrderDetailRedirect,
  importMissingQuoteCostLines,
  actualCostTypes: projectProfitability.ACTUAL_COST_TYPES
});
const clientOrderPurchaseService = createClientOrderPurchaseService({ db });
const clientOrderPurchasesController = createClientOrderPurchasesController({
  purchaseService: clientOrderPurchaseService,
  parseDecimalInput,
  normalizePurchaseStatus,
  getPurchaseOrderRedirect
});
const clientOrderInvoiceService = createClientOrderInvoiceService({ db });
const clientOrderInvoicesController = createClientOrderInvoicesController({
  invoiceService: clientOrderInvoiceService,
  uploadInvoice: (req, res, callback) => ebpScanUpload.single('invoice_file')(req, res, callback),
  renderValidationPage: renderEbpInvoiceValidationPage,
  validateExistingInvoiceFile,
  basename: path.basename,
  getPurchaseOrderRedirect,
  parseDecimalInput,
  hasDecimalInput,
  roundAmount: round2,
  invoiceTotalsAreConsistent,
  fileSha256,
  safeResolveInside,
  scanDirectory: EBP_SCAN_DIR,
  fileExists: fs.existsSync,
  clientOrderInvoicesDir,
  uniqueFilePath,
  copyFile: fs.copyFileSync,
  deleteFile: fs.unlinkSync,
  getClientOrderFinancialSnapshot: (orderId) => clientOrderFinancialSnapshot.getClientOrderFinancialSnapshot(db, orderId),
  renderClientOrderInvoicesView,
  escapeHtml: escHtml,
  formatEuroFr,
  clientPageIcon,
  pcFolderIcon,
  isoDate
});
const clientOrderHoursService = createClientOrderHoursService({ db });
const clientOrderHoursController = createClientOrderHoursController({
  hoursService: clientOrderHoursService,
  findOrderByFolder: findClientOrderByFolder,
  safeName,
  safeSegment,
  parseDuration: parseChantierHoursDuration,
  allowedCategories: projectProfitability.HOUR_CATEGORIES,
  formatMinutes: fmtMinutes,
  formatDurationLabel: formatChantierDurationLabel,
  pageTemplate,
  renderHoursView: renderClientOrderHoursView,
  escapeHtml: escHtml,
  clientPageIcon,
  pcFolderIcon,
  isoDate
});
const clientOrderAgendaService = createClientOrderAgendaService({ db, normalizeChantierStatus });
const clientOrderAgendaController = createClientOrderAgendaController({ agendaService: clientOrderAgendaService });
const clientOrderService = createClientOrderService({ db });
const clientOrderFolderService = createClientOrderFolderService({
  orderService: clientOrderService,
  safeName,
  joinPath: path.join,
  supportedFolderTypes: STANDARD_SUBFOLDERS
});
const clientFolderNavigationService = createClientFolderNavigationService({
  clientsRoot: CLIENT_PC_DIR,
  safeName,
  joinPath: path.join,
  folderExists(folderPath) {
    return fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory();
  },
  listDirectoryEntries(folderPath) {
    try {
      return fs.readdirSync(folderPath, { withFileTypes: true });
    } catch {
      return [];
    }
  },
  clientOrderFolderService
});
const clientFolderNavigationController = createClientFolderNavigationController({
  navigationService: clientFolderNavigationService,
  renderView: renderClientFolderNavigationView,
  pageTemplate,
  escapeHtml: escHtml,
  pcFolderIcon
});
const clientOrderFoldersController = createClientOrderFoldersController({
  folderService: clientOrderFolderService,
  hoursController: clientOrderHoursController,
  purchaseService: clientOrderPurchaseService,
  invoiceController: clientOrderInvoicesController,
  baseDir: CLIENT_PC_DIR,
  folderExists(folderPath) {
    return fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory();
  },
  listFiles(folderPath) {
    return fs.readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  },
  extensionName: path.extname,
  baseName: path.basename,
  invoiceExtensions: EBP_SCAN_ALLOWED_EXT,
  fileIconName: pcFileIconName,
  renderFolderView: renderClientOrderFolderView,
  renderRootFolderView: renderClientOrderRootFolderView,
  renderFilesList: renderClientOrderFilesList,
  renderPurchasesBlock,
  pageTemplate,
  escapeHtml: escHtml,
  clientPageIcon,
  pcFolderIcon,
  normalizePurchaseStatus,
  purchaseStatusClass,
  purchaseStatusOptions,
  formatDateLabel,
  ensureStandardSubfolders,
  workshopFolderTypes: ['Plans', 'Photos', 'Commandes', 'Heure chantier'],
  listMeasurements(orderId) {
    return db.prepare('SELECT * FROM measurements WHERE client_order_id = ? ORDER BY updated_at DESC, id DESC').all(orderId);
  },
  renderMeasurements: renderMeasurementCards,
  chantierStatusOptions,
  safeName
});
const clientOrdersController = createClientOrdersController({
  orderService: clientOrderService,
  renderListView: renderClientOrdersListView,
  pageTemplate,
  parseOptionalVatRate,
  normalizeChantierStatus,
  parsePositiveNumber,
  parseOptionalId,
  parseDecimalInput,
  isoDate,
  importMissingQuoteCostLines,
  safeName,
  getProgressFromChantierStatus,
  getFinancialSnapshot: (orderId) => clientOrderFinancialSnapshot.getClientOrderFinancialSnapshot(db, orderId),
  listClientFolders() {
    try {
      return fs.readdirSync(CLIENT_PC_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  },
  formatEuroFr,
  roundAmount: round2,
  chantierStatusClass,
  chantierStatusOptions,
  escapeHtml: escHtml,
  clientPageIcon,
  pcFolderIcon,
  ensureOrderFolders({ orderId, name, description }) {
    const internalDir = path.join(CLIENT_ORDER_FILES_DIR, String(orderId));
    console.log('CLIENT_ORDER_FILES_DIR =', CLIENT_ORDER_FILES_DIR);
    console.log('internalDir =', internalDir);
    try {
      console.log('CLIENT_ORDER_FILES_DIR isDirectory =',
        fs.existsSync(CLIENT_ORDER_FILES_DIR) ? fs.statSync(CLIENT_ORDER_FILES_DIR).isDirectory() : 'NOT EXISTS');
    } catch (error) {
      console.log('STAT ERROR =', error.message);
    }
    ensureDir(internalDir);
    const clientDir = path.join(CLIENT_PC_DIR, safeName(name));
    ensureDir(clientDir);
    const orderFolderName = safeName(description && description.trim() !== '' ? description : `Commande_${orderId}`);
    const pcOrderDir = path.join(clientDir, orderFolderName);
    ensureDir(pcOrderDir);
    ensureStandardSubfolders(pcOrderDir);
  }
});

registerClientOrderRoutes(app, {
  requireLogin,
  handlers: {
    list: clientOrdersController.listClientOrders,
    create: clientOrdersController.createClientOrder,
    update: clientOrdersController.updateClientOrder,
    done: clientOrdersController.completeClientOrder,
    updateChantier: clientOrdersController.updateClientOrderStatus,
    profitabilityPage: clientOrderProfitabilityController.showProfitability,
    profitabilityApi: clientOrderProfitabilityController.getProfitabilityApi,
    createActualCost: clientOrderProfitabilityController.addActualCost,
    deleteActualCost: clientOrderProfitabilityController.deleteActualCost,
    createCostLine: clientOrderProfitabilityController.addBudgetLine,
    editCostLine: clientOrderProfitabilityController.updateBudgetLine,
    duplicateCostLine: clientOrderProfitabilityController.duplicateBudgetLine,
    deleteCostLine: clientOrderProfitabilityController.deleteBudgetLine,
    importQuoteCostLines: clientOrderProfitabilityController.importBudgetFromQuote,
    analyzeInvoice: clientOrderInvoicesController.analyzeInvoice,
    analyzeExistingInvoice: clientOrderInvoicesController.analyzeExistingInvoice,
    createInvoice: clientOrderInvoicesController.createClientOrderInvoice,
    deleteInvoice: clientOrderInvoicesController.deleteClientOrderInvoice,
    addPurchase: clientOrderPurchasesController.addPurchase,
    updatePurchase: clientOrderPurchasesController.updatePurchase,
    deletePurchase: clientOrderPurchasesController.deletePurchase,
    showOrderHoursFolder: clientOrderHoursController.showOrderHoursFolder,
    createOrderHourEntry: clientOrderHoursController.createOrderHourEntry,
    deleteOrderHourEntry: clientOrderHoursController.deleteOrderHourEntry,
    exportOrderHours: clientOrderHoursController.exportOrderHours,
    updatePlannedHours: clientOrderHoursController.updatePlannedHours,
    addClientOrderToAgenda: clientOrderAgendaController.addClientOrderToAgenda
  }
});

/* ===================== START ===================== */

purgeExpiredLocalAgendaEventsSafely();
const agendaPurgeTimer = setInterval(purgeExpiredLocalAgendaEventsSafely, 60 * 60 * 1000);
if (typeof agendaPurgeTimer.unref === 'function') agendaPurgeTimer.unref();

if (SCANNER_IMPORT_ENABLED) scannerImporter.start();
else console.log('[scanner-import] service désactivé par SCANNER_IMPORT_ENABLED=false');

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`Serveur démarré sur ${HOST}:${PORT}`);
});

let shuttingDown = false;
function shutdownServer(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[scanner-import] arrêt demandé (${signal})`);
  scannerImporter.stop();
  clearInterval(agendaPurgeTimer);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGTERM', () => shutdownServer('SIGTERM'));
process.once('SIGINT', () => shutdownServer('SIGINT'));
