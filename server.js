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
const { createQuoteLinesService } = require('./services/quoteLinesService');
const { createQuoteLinesController } = require('./controllers/quoteLinesController');
const { renderQuoteLineEditView } = require('./views/quoteLineEditView');
const { registerQuoteLineEditRoutes, registerQuoteLineMutationRoutes } = require('./routes/quoteLines');
const { createQuoteSettingsService } = require('./services/quoteSettingsService');
const { createQuoteSettingsController } = require('./controllers/quoteSettingsController');
const { registerQuoteHeaderSettingsRoutes, registerQuoteFooterSettingsRoutes } = require('./routes/quoteSettings');
const { createQuoteAttachmentsService } = require('./services/quoteAttachmentsService');
const { createQuoteAttachmentsController } = require('./controllers/quoteAttachmentsController');
const {
  registerQuoteAttachmentUploadRoute,
  registerQuoteAttachmentDeleteRoute,
  registerQuoteAttachmentFileRoute
} = require('./routes/quoteAttachments');
const { createQuoteSketchesService } = require('./services/quoteSketchesService');
const { createQuoteSketchesController } = require('./controllers/quoteSketchesController');
const { registerQuoteSketchRoutes } = require('./routes/quoteSketches');
const { createQuoteAcceptanceService } = require('./services/quoteAcceptanceService');
const { createQuoteAcceptanceController } = require('./controllers/quoteAcceptanceController');
const { registerQuoteAcceptanceRoute } = require('./routes/quoteAcceptance');
const { createQuoteProfitabilityService } = require('./services/quoteProfitabilityService');
const { createQuoteProfitabilityController } = require('./controllers/quoteProfitabilityController');
const { registerQuoteProfitabilityRoutes } = require('./routes/quoteProfitability');
const { createQuoteAiAnalysisService } = require('./services/quoteAiAnalysisService');
const { createQuoteAiAnalysisController } = require('./controllers/quoteAiAnalysisController');
const { registerQuoteAiAnalysisRoutes } = require('./routes/quoteAiAnalysis');
const { createQuoteDetailService } = require('./services/quoteDetailService');
const { createQuoteDetailController } = require('./controllers/quoteDetailController');
const { renderQuoteDetailView } = require('./views/quoteDetailView');
const { registerQuoteDetailRoute } = require('./routes/quoteDetail');
const { createSupplierOrdersService } = require('./services/supplierOrdersService');
const { createSupplierOrdersController } = require('./controllers/supplierOrdersController');
const { renderSupplierOrdersListView } = require('./views/supplierOrdersListView');
const { renderSupplierOrderCard } = require('./views/supplierOrderCardView');
const { registerSupplierOrderRoutes, registerSupplierOrderCompletionRoutes } = require('./routes/supplierOrders');
const { createMaterialsService } = require('./services/materialsService');
const { createMaterialsController } = require('./controllers/materialsController');
const { renderMaterialsListView } = require('./views/materialsListView');
const { renderMaterialCard } = require('./views/materialCardView');
const { renderMaterialDetailView } = require('./views/materialDetailView');
const { registerMaterialsRoutes } = require('./routes/materials');
const { createWorksitesService } = require('./services/worksitesService');
const { createWorksitesController } = require('./controllers/worksitesController');
const { renderWorksitesListView } = require('./views/worksitesListView');
const { renderWorksiteCard } = require('./views/worksiteCardView');
const { renderWorksiteDetailView } = require('./views/worksiteDetailView');
const { registerWorksitesRoutes } = require('./routes/worksites');
const { createIncomingDocumentsService } = require('./services/incomingDocumentsService');
const { createIncomingDocumentsImportService } = require('./services/incomingDocumentsImportService');
const { createIncomingDocumentsOcrService } = require('./services/incomingDocumentsOcrService');
const { createIncomingDocumentsController } = require('./controllers/incomingDocumentsController');
const { renderIncomingDocumentsListView } = require('./views/incomingDocumentsListView');
const { renderIncomingDocumentCard } = require('./views/incomingDocumentCardView');
const { registerIncomingDocumentsRoutes } = require('./routes/incomingDocuments');
const { createDocumentTextExtractionService } = require('./services/documentTextExtractionService');
const { createEbpDocumentParserService } = require('./services/ebpDocumentParserService');
const { createEbpIncomingService } = require('./services/ebpIncomingService');
const { createEbpScannerService } = require('./services/ebpScannerService');
const { createEbpValidationService } = require('./services/ebpValidationService');
const { createEbpScannerController } = require('./controllers/ebpScannerController');
const { renderEbpIncomingView, renderEbpIncomingFileView } = require('./views/ebpIncomingView');
const { renderEbpScannerView } = require('./views/ebpScannerView');
const { renderEbpValidationView } = require('./views/ebpValidationView');
const { registerEbpScannerRoutes } = require('./routes/ebpScanner');
const { createEbpScannerUpload } = require('./services/ebpScannerUpload');
const { createAgendaService } = require('./services/agendaService');
const { createGoogleCalendarService } = require('./services/googleCalendarService');
const { createAgendaSyncService } = require('./services/agendaSyncService');
const { createAgendaController } = require('./controllers/agendaController');
const { createGoogleCalendarController } = require('./controllers/googleCalendarController');
const { renderAgendaView } = require('./views/agendaView');
const {
  renderGoogleConfigurationError,
  renderGoogleSyncLockedView,
  renderGoogleSyncErrorView,
  renderGoogleSyncSummary
} = require('./views/googleCalendarView');
const { registerAgendaPageRoute, registerAgendaMutationRoutes } = require('./routes/agenda');
const { registerGoogleCalendarRoutes } = require('./routes/googleCalendar');
const { createMeasurementsService } = require('./services/measurementsService');
const { createMeasurementPhotosService } = require('./services/measurementPhotosService');
const { createMeasurementPhotoUpload } = require('./services/measurementPhotoUpload');
const { createMeasurementsController } = require('./controllers/measurementsController');
const { createMeasurementPhotosController } = require('./controllers/measurementPhotosController');
const { renderMeasurementsListView } = require('./views/measurementsListView');
const { renderMeasurementCards: renderCommonMeasurementCards } = require('./views/measurementCardView');
const { renderMeasurementDetailShellView } = require('./views/measurementDetailShellView');
const { registerMeasurementsListRoutes, registerMeasurementContextRoute, registerMeasurementPersistenceRoutes, registerMeasurementDetailRoute } = require('./routes/measurements');
const { registerMeasurementPhotoRoutes } = require('./routes/measurementPhotos');
const { createMeasurementStairV2Service } = require('./services/measurementStairV2Service');
const { createMeasurementStairV2PhotosService } = require('./services/measurementStairV2PhotosService');
const { createMeasurementStairV2Upload } = require('./middleware/measurementStairV2Upload');
const { createMeasurementStairV2Controller } = require('./controllers/measurementStairV2Controller');
const { registerMeasurementStairV2ApiRoutes, registerMeasurementStairV2PageRoute } = require('./routes/measurementStairV2');
const { createMeasurementTechnicalDrawingService } = require('./services/measurementTechnicalDrawingService');
const { createMeasurementTechnicalDrawingController } = require('./controllers/measurementTechnicalDrawingController');
const { registerMeasurementTechnicalDrawingApiRoutes, registerMeasurementTechnicalDrawingPageRoute } = require('./routes/measurementTechnicalDrawing');

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
const documentTextExtractionService = createDocumentTextExtractionService({
  fs, path, pdfParse, tesseractJs, heicConvert, sharp,
  pdfDebugPath: EBP_SCAN_LAST_PDF_TEXT_PATH,
  logger: console
});
const ebpDocumentParserService = createEbpDocumentParserService({ parseEbpQuoteText, parseEbpInvoiceText });

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
  const parsedEbp = ebpDocumentParserService.parseQuote(text);
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
  const parsed = ebpDocumentParserService.parseInvoice(text);
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

const ebpScanUpload = createEbpScannerUpload({ multer, path, scanDir: EBP_SCAN_DIR, ensureDir, safeSegment,
  allowedExtensions: EBP_SCAN_ALLOWED_EXT, allowedMime: EBP_SCAN_ALLOWED_MIME,
  maxFileSizeBytes: EBP_SCAN_MAX_FILE_SIZE_BYTES });
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
  return renderCommonMeasurementCards(rows, {
    escHtml, measurementTitle, measurementLinkBadge, measurementRoutes, options
  });
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
const agendaService = createAgendaService({
  db,
  googleSync,
  dateKeyInTimeZone,
  timeZone: APP_TIME_ZONE,
  logger: console
});
const googleCalendarService = createGoogleCalendarService({
  google,
  oauth2Client,
  clientId: GOOGLE_CLIENT_ID,
  clientSecret: GOOGLE_CLIENT_SECRET,
  redirectUri: GOOGLE_REDIRECT_URI,
  calendarId: GOOGLE_CALENDAR_ID,
  timeZone: GOOGLE_CALENDAR_TIME_ZONE,
  logger: console
});
const agendaSyncService = createAgendaSyncService({
  agendaService,
  googleCalendarService,
  googleSync,
  logger: console
});
const agendaController = createAgendaController({
  agendaService,
  googleCalendarService,
  renderAgendaView,
  pageTemplate,
  viewDependencies: {
    escHtml,
    clientPageIcon,
    dateKeyInTimeZone,
    agendaEventRange,
    googleSync,
    timeZone: APP_TIME_ZONE
  }
});
const googleCalendarController = createGoogleCalendarController({
  googleCalendarService,
  agendaSyncService,
  pageTemplate,
  renderConfigurationError: renderGoogleConfigurationError,
  renderSyncLockedView: renderGoogleSyncLockedView,
  renderSyncErrorView: renderGoogleSyncErrorView,
  renderSyncSummary: renderGoogleSyncSummary,
  viewDependencies: { escHtml },
  logger: console
});
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
  agendaService.purgeExpiredEventsSafely();
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
registerAgendaPageRoute(app, { requireLogin, controller: agendaController });
/* ===================== PRISES DE COTES ===================== */

const measurementTechnicalDrawingService = createMeasurementTechnicalDrawingService({ db, parseOptionalId, parseMeasurementData, randomUUID: () => crypto.randomUUID(), buildStairPhotoSlots: buildEscalierV2PhotoPublicSlots });
const measurementsService = createMeasurementsService({ db, parseOptionalId, normalizeMeasurementLink, preserveTechnicalSketches: measurementTechnicalDrawingService.preserve, formatDateLabel, isoDate, measurementRoutes, removeStoragePathIfExists, sketchPath, safeResolveInside, measurementPhotoDir: MEASUREMENT_PHOTO_DIR });
const measurementViewDependencies = { escHtml, clientPageIcon, measurementTitle, measurementLinkBadge, measurementRoutes, formatDateLabel, renderSketchBlock, renderMeasurementCards: (rows) => renderCommonMeasurementCards(rows, { escHtml, measurementTitle, measurementLinkBadge, measurementRoutes }) };
const measurementsController = createMeasurementsController({ s: measurementsService, renderList: renderMeasurementsListView, renderDetail: renderMeasurementDetailShellView, pageTemplate, viewDeps: measurementViewDependencies, parseOptionalId, normalizeQuoteStatus, measurementRoutes, measurementTitle });
registerMeasurementsListRoutes(app, { requireLogin, c: measurementsController });
const measurementPhotoUpload = createMeasurementPhotoUpload({ multer, db, parseOptionalId, photoFiles: measurementPhotoFiles, photoDir: MEASUREMENT_PHOTO_DIR, ensureDir });
registerMeasurementContextRoute(app, { requireLogin, c: measurementsController });
app.get('/api/measurements/photo-recovery-access', requireLogin, (req, res) => {
  const measurementId = parseOptionalId(req.query.id);
  const isAdmin = req.session?.user?.role !== 'atelier';
  return res.json({ ok: true, allowed: Boolean(isAdmin && measurementId === 9) });
});

const measurementPhotosService = createMeasurementPhotosService({ db, fs, path, crypto, photoFiles: measurementPhotoFiles, photoDir: MEASUREMENT_PHOTO_DIR });
const measurementPhotosController = createMeasurementPhotosController({ s: measurementPhotosService, parseOptionalId, upload: (req, res, callback) => measurementPhotoUpload.array('photos', 20)(req, res, callback), fs, logger: console });
registerMeasurementPhotoRoutes(app, { requireLogin, c: measurementPhotosController });
const measurementStairV2Service = createMeasurementStairV2Service({ db, parseOptionalId, parseMeasurementData, buildPhotoSlots: buildEscalierV2PhotoPublicSlots, photoBaseDir: measurementEscalierV2PhotoBaseDir, safeResolveInside, photoRoot: ESCALIER_V2_PHOTO_DIR, path, removeStoragePathIfExists, sketchPath });
const measurementStairV2PhotosService = createMeasurementStairV2PhotosService({ db, fs, path, crypto, parseMeasurementData, normalizeCategory: normalizeEscalierV2Category, normalizeSlots: normalizeEscalierV2PhotoSlots, buildPublicSlots: buildEscalierV2PhotoPublicSlots, photoBaseDir: measurementEscalierV2PhotoBaseDir, safeResolveInside, ensureDir });
const escalierV2PhotoUpload = createMeasurementStairV2Upload({ multer, path, parseOptionalId, getMeasurement: measurementStairV2Service.get, photoBaseDir: measurementEscalierV2PhotoBaseDir, ensureDir, safeSegment });
const measurementStairV2Controller = createMeasurementStairV2Controller({ s: measurementStairV2Service, photos: measurementStairV2PhotosService, parseOptionalId, upload: (req, res, callback) => escalierV2PhotoUpload.array('photos', 30)(req, res, callback), fs, path, publicDir: MEASUREMENTS_PUBLIC_DIR, logger: console });
registerMeasurementStairV2ApiRoutes(app, { requireLogin, c: measurementStairV2Controller });
registerMeasurementPersistenceRoutes(app, { requireLogin, c: measurementsController });
const measurementTechnicalDrawingController = createMeasurementTechnicalDrawingController({ service: measurementTechnicalDrawingService, path, publicDir: MEASUREMENTS_PUBLIC_DIR });
registerMeasurementTechnicalDrawingApiRoutes(app, { requireLogin, c: measurementTechnicalDrawingController });
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

registerMeasurementDetailRoute(app, { requireLogin, c: measurementsController });
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

registerMeasurementStairV2PageRoute(app, { requireLogin, c: measurementStairV2Controller });
app.get('/outils/prises-cotes/:module', requireLogin, (req, res, next) => {
  const moduleName = String(req.params.module || '').trim().toLowerCase();
  const fileName = MEASUREMENT_SHEETS[moduleName];

  if (!fileName) return next();

  const filePath = path.join(MEASUREMENTS_PUBLIC_DIR, fileName);
  return res.sendFile(filePath);
});

registerMeasurementTechnicalDrawingPageRoute(app, { requireLogin, c: measurementTechnicalDrawingController });
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

registerGoogleCalendarRoutes(app, { requireLogin, controller: googleCalendarController });
/* ===================== CHANTIERS ===================== */

const worksitesService = createWorksitesService({ db, normalizeChantierStatus, parsePositiveNumber });
const worksitesController = createWorksitesController({
  worksitesService, renderWorksitesListView, renderWorksiteDetailView, pageTemplate,
  viewDependencies: { escHtml, formatHours, chantierStatusOptions, statuses: CHANTIER_STATUSES, renderWorksiteCard }
});
registerWorksitesRoutes(app, {
  requireLogin,
  handlers: {
    list: worksitesController.showWorksites,
    create: worksitesController.createWorksite,
    detail: worksitesController.showWorksite,
    update: worksitesController.updateWorksite
  }
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

const incomingDocumentsOcrService = createIncomingDocumentsOcrService({
  analyzeEbpFile: documentTextExtractionService.extractTextFromFile
});
const incomingDocumentsImportService = createIncomingDocumentsImportService({
  db, fs, path, crypto, incomingDocuments, scannerDirs: SCANNER_DIRS,
  maxFileSizeBytes: SCANNER_MAX_FILE_SIZE_BYTES, intervalMs: SCANNER_IMPORT_INTERVAL_MS,
  analyzeFile: incomingDocumentsOcrService.extractTextFromDocument, logger: console
});
const incomingDocumentsDomainService = createIncomingDocumentsService({
  db, fs, path, incomingDocuments, scannerDirs: SCANNER_DIRS, round2
});
const incomingDocumentsController = createIncomingDocumentsController({
  documentsService: incomingDocumentsDomainService, importService: incomingDocumentsImportService,
  renderListView: renderIncomingDocumentsListView, pageTemplate, path, escHtml,
  maxFileSizeBytes: SCANNER_MAX_FILE_SIZE_BYTES,
  uploadSingle: (req, res, callback) => scannerDocumentUpload.single('document')(req, res, callback),
  viewDependencies: { escHtml, clientPageIcon, renderIncomingDocumentCard, formatDateTimeLabel, formatFileSize, formatEuroFr }
});
registerIncomingDocumentsRoutes(app, {
  requireAdmin,
  handlers: {
    list: incomingDocumentsController.showIncomingDocuments,
    file: incomingDocumentsController.serveDocumentFile,
    upload: incomingDocumentsController.uploadDocument,
    classify: incomingDocumentsController.classifyDocument,
    reanalyze: incomingDocumentsController.reanalyzeDocument,
    reject: incomingDocumentsController.rejectDocument
  }
});

/* ===================== COMMANDES CLIENTS ===================== */

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
  const analysis = await documentTextExtractionService.extractTextFromFile(scanPath, mimeType);
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

const ebpIncomingService = createEbpIncomingService({ fs, path, incomingDir: EBP_INCOMING_DIR, scanDir: EBP_SCAN_DIR, safeResolveInside, uniqueFilePath, ensureDir });
const ebpValidationService = createEbpValidationService({ path, safeResolveInside, scanDir: EBP_SCAN_DIR, textExtractionService: documentTextExtractionService, extractQuoteFields: extractEbpFieldsFromText, findBestClientMatch, normalizeSearchText, isoDate });
const ebpScannerService = createEbpScannerService({ db, fs, path, scanDir: EBP_SCAN_DIR, incomingDir: EBP_INCOMING_DIR, incomingProcessedDir: EBP_INCOMING_PROCESSED_DIR, clientRoot: CLIENT_PC_DIR, clientOrderFilesDir: CLIENT_ORDER_FILES_DIR, safeResolveInside, safeName, uniqueFilePath, ensureDir, ensureStandardSubfolders, parseDecimalInput, inferVatRateFromHtTtc, isoDate, safeIncomingPdfName: ebpIncomingService.safeIncomingPdfName, logger: console });
const ebpScannerController = createEbpScannerController({ incomingService: ebpIncomingService, validationService: ebpValidationService, scannerService: ebpScannerService, renderIncomingView: renderEbpIncomingView, renderIncomingFileView: renderEbpIncomingFileView, renderScannerView: renderEbpScannerView, renderValidationView: renderEbpValidationView, pageTemplate, viewDependencies: { escHtml, clientPageIcon, formatDateTimeLabel, formatFileSize }, uploadSingle: (req, res, callback) => ebpScanUpload.single('scan_file')(req, res, callback), path, safeSegment, incomingDir: EBP_INCOMING_DIR });
registerEbpScannerRoutes(app, { requireLogin, handlers: { incoming: ebpScannerController.showIncoming, open: ebpScannerController.openIncoming, raw: ebpScannerController.rawIncoming, analyzeIncoming: ebpScannerController.analyzeIncoming, scanner: ebpScannerController.showScanner, analyze: ebpScannerController.analyzeUpload, create: ebpScannerController.createOrder } });

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

const supplierOrdersService = createSupplierOrdersService({
  db,
  normalizeSearchText,
  normalizePurchaseStatus,
  clientOrderFolderName,
  safeName,
  formatDateLabel,
  isoDate
});
const supplierOrdersController = createSupplierOrdersController({
  supplierOrdersService,
  renderSupplierOrdersListView,
  pageTemplate,
  viewDependencies: { escHtml, clientPageIcon, purchaseStatusClass, renderSupplierOrderCard }
});

/* ===================== COMMANDES FOURNISSEURS ===================== */

registerSupplierOrderRoutes(app, {
  requireLogin,
  handlers: {
    list: supplierOrdersController.showSupplierOrders,
    create: supplierOrdersController.createSupplierOrder,
    delete: supplierOrdersController.deleteSupplierOrder,
    updatePurchaseStatus: supplierOrdersController.updatePurchaseStatus
  }
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
const quoteLinesService = createQuoteLinesService({
  db,
  roundAmount: round2,
  calculateSheetWeight: calcSheetKg,
  detectLineCostCategory: projectProfitability.detectLineCostCategory
});
const quoteLinesController = createQuoteLinesController({
  quoteLinesService,
  renderQuoteLineEditView,
  pageTemplate,
  escapeHtml: escHtml,
  clientPageIcon,
  lineCostCategories: projectProfitability.LINE_COST_CATEGORIES
});
const quoteAttachmentsService = createQuoteAttachmentsService({
  photosRoot: QUOTE_PHOTO_DIR,
  safeResolveInside,
  basename: path.basename,
  fileExists: fs.existsSync,
  deleteFile: fs.unlinkSync,
  removeStoragePath: removeStoragePathIfExists,
  readDirectory: fs.readdirSync
});
const quoteAttachmentsController = createQuoteAttachmentsController({
  attachmentsService: quoteAttachmentsService,
  uploadPhoto(req, res, callback) {
    return quotePhotoUpload.single('photo')(req, res, callback);
  }
});
const quoteSketchesService = createQuoteSketchesService({
  db,
  quoteSketchPath(quoteId) {
    return sketchPath('quotes', quoteId);
  },
  saveQuoteSketchPng(quoteId, image) {
    return saveSketchPng('quotes', quoteId, image);
  },
  fileExists: fs.existsSync,
  removeStoragePath: removeStoragePathIfExists
});
const quoteSketchesController = createQuoteSketchesController({
  sketchesService: quoteSketchesService
});
const quoteSettingsService = createQuoteSettingsService({
  db,
  removeQuotePhotos: quoteAttachmentsService.deleteAllQuotePhotos,
  removeQuoteSketch: quoteSketchesService.deleteQuoteSketch
});
const quoteSettingsController = createQuoteSettingsController({
  quoteSettingsService,
  normalizeQuoteStatus
});
const quoteAcceptanceService = createQuoteAcceptanceService({
  db,
  fs,
  path,
  clientsRoot: CLIENT_PC_DIR,
  safeName,
  uniqueFolder,
  ensureDir,
  ensureStandardSubfolders,
  round2,
  isoDate,
  parseOptionalVatRate,
  detectWorkCategory: projectProfitability.detectWorkCategory,
  saveProjectForecast,
  importMissingQuoteCostLines
});
const quoteAcceptanceController = createQuoteAcceptanceController({
  acceptanceService: quoteAcceptanceService
});
registerQuoteHeaderSettingsRoutes(app, {
  requireLogin,
  handlers: {
    notes: quoteSettingsController.updateQuoteNotes,
    status: quoteSettingsController.updateQuoteStatus,
    vat: quoteSettingsController.updateQuoteVat
  }
});
// PAGE DEVIS (EXISTANT) + RECHERCHE MATIÈRE
registerQuoteAttachmentUploadRoute(app, {
  requireLogin,
  handlers: { upload: quoteAttachmentsController.uploadQuotePhoto }
});

registerQuoteSketchRoutes(app, {
  requireLogin,
  handlers: {
    serve: quoteSketchesController.serveQuoteSketch,
    save: quoteSketchesController.saveQuoteSketch
  }
});

const OPENAI_QUOTE_REVIEW_MODEL = String(process.env.OPENAI_QUOTE_REVIEW_MODEL || 'gpt-4.1-mini').trim();
const QUOTE_AI_COST_FIELDS = [
  'cout_revient', 'cout_matiere', 'cout_sous_traitance', 'cout_galvanisation', 'cout_thermolaquage',
  'cout_motorisation', 'cout_accessoires', 'cout_transport', 'cout_consommables', 'cout_locations',
  'heures_etude', 'heures_atelier', 'heures_pose', 'cout_horaire'
];
const quoteProfitabilityService = createQuoteProfitabilityService({
  db,
  projectProfitability,
  parseOptionalId,
  round2,
  randomUUID: crypto.randomUUID
});
const quoteProfitabilityController = createQuoteProfitabilityController({
  profitabilityService: quoteProfitabilityService,
  parseOptionalId
});
const quoteAiAnalysisService = createQuoteAiAnalysisService({
  db,
  profitabilityService: quoteProfitabilityService,
  quoteAiReview,
  projectProfitability,
  costFields: QUOTE_AI_COST_FIELDS,
  model: OPENAI_QUOTE_REVIEW_MODEL,
  getApiKey: () => process.env.OPENAI_API_KEY,
  fetchImpl: fetch,
  AbortControllerImpl: AbortController,
  parseOptionalId
});
const quoteAiAnalysisController = createQuoteAiAnalysisController({
  aiAnalysisService: quoteAiAnalysisService,
  parseOptionalId
});
const quoteDetailService = createQuoteDetailService({
  db,
  quoteAttachmentsService,
  quoteSketchesService,
  quoteProfitabilityService,
  round2,
  normalizeVatRate,
  normalizeQuoteStatus,
  quotePhotoDirectory: (quoteId) => safeResolveInside(QUOTE_PHOTO_DIR, String(quoteId)),
  fileExists: fs.existsSync
});
const quoteDetailController = createQuoteDetailController({
  quoteDetailService,
  renderQuoteDetailView,
  pageTemplate,
  viewDependencies: {
    escHtml,
    clientPageIcon,
    formatDateLabel,
    quoteStatusClass,
    quoteStatusOptions,
    quoteVatOptions,
    formatEuroFr,
    projectProfitability,
    renderQuoteMeasurementCreationLinks,
    renderMeasurementCards,
    renderSketchBlock
  }
});

registerQuoteProfitabilityRoutes(app, {
  requireLogin,
  handlers: {
    get: quoteProfitabilityController.getQuoteProfitability,
    save: quoteProfitabilityController.saveQuoteCostForecast
  }
});
registerQuoteAiAnalysisRoutes(app, {
  requireLogin,
  handlers: {
    review: quoteAiAnalysisController.reviewQuote,
    list: quoteAiAnalysisController.listQuoteAiReviews,
    applyCosts: quoteAiAnalysisController.applyQuoteAiCosts
  }
});

registerQuoteDetailRoute(app, {
  requireLogin,
  handler: quoteDetailController.showQuoteDetail
});
registerQuoteAttachmentDeleteRoute(app, {
  requireLogin,
  handlers: { delete: quoteAttachmentsController.deleteQuotePhoto }
});
registerQuoteLineEditRoutes(app, {
  requireLogin,
  handlers: {
    editForm: quoteLinesController.showQuoteLineEditForm,
    update: quoteLinesController.updateQuoteLine
  }
});
registerQuoteAttachmentFileRoute(app, {
  requireLogin,
  handlers: { serve: quoteAttachmentsController.serveQuotePhoto }
});
registerQuoteLineMutationRoutes(app, {
  requireLogin,
  handlers: {
    create: quoteLinesController.createQuoteLine,
    delete: quoteLinesController.deleteQuoteLine,
    createMaterial: quoteLinesController.createMaterialQuoteLine
  }
});

// ACCEPTER DEVIS
registerQuoteAcceptanceRoute(app, {
  requireLogin,
  handlers: { accept: quoteAcceptanceController.acceptQuote }
});

registerQuoteFooterSettingsRoutes(app, {
  requireLogin,
  handlers: {
    margin: quoteSettingsController.updateQuoteMargin,
    delete: quoteSettingsController.deleteQuote
  }
});

/* ===================== MATIÈRES ===================== */
const materialsService = createMaterialsService({ db, parseDecimalInput });
const materialsController = createMaterialsController({
  materialsService,
  renderMaterialsListView,
  renderMaterialDetailView,
  pageTemplate,
  formatDateLabel,
  viewDependencies: { escHtml, clientPageIcon, renderMaterialCard }
});
registerMaterialsRoutes(app, {
  requireLogin,
  requireAdmin,
  handlers: {
    list: materialsController.showMaterials,
    create: materialsController.createMaterial,
    updateFromBody: materialsController.updateMaterialFromBody,
    seed: materialsController.seedMaterials,
    delete: materialsController.deleteMaterial,
    detail: materialsController.showMaterial,
    update: materialsController.updateMaterial
  }
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
registerSupplierOrderCompletionRoutes(app, {
  requireLogin,
  handlers: {
    complete: supplierOrdersController.completeSupplierOrder,
    delete: supplierOrdersController.deleteSupplierOrder
  }
});
registerAgendaMutationRoutes(app, { requireLogin, controller: agendaController });
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

agendaService.purgeExpiredEventsSafely();
const agendaPurgeTimer = setInterval(agendaService.purgeExpiredEventsSafely, 60 * 60 * 1000);
if (typeof agendaPurgeTimer.unref === 'function') agendaPurgeTimer.unref();

if (SCANNER_IMPORT_ENABLED) incomingDocumentsImportService.startAutomaticImport();
else console.log('[scanner-import] service désactivé par SCANNER_IMPORT_ENABLED=false');

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`Serveur démarré sur ${HOST}:${PORT}`);
});

let shuttingDown = false;
function shutdownServer(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[scanner-import] arrêt demandé (${signal})`);
  incomingDocumentsImportService.stopAutomaticImport();
  clearInterval(agendaPurgeTimer);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGTERM', () => shutdownServer('SIGTERM'));
process.once('SIGINT', () => shutdownServer('SIGINT'));
