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
const { createEbpParserHelpers } = require('./lib/ebpParserHelpers');
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
const { createUserService } = require('./services/userService');
const { createAuthService } = require('./services/authService');
const { createTwoFactorService } = require('./services/twoFactorService');
const { createAuthEmailService } = require('./services/authEmailService');
const { createAuthController } = require('./controllers/authController');
const { createTwoFactorView } = require('./views/twoFactorView');
const { registerAuthRoutes } = require('./routes/auth');
const { bootstrapDatabase } = require('./database/bootstrapDatabase');
const { createClientOrderProfitabilityService } = require('./services/clientOrderProfitabilityService');
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
const { registerPcFilesRoutes } = require('./routes/pcFiles');
const { createPcFilesService } = require('./services/pcFilesService');
const { createPcFilesController } = require('./controllers/pcFilesController');
const { renderPcFilePreviewView } = require('./views/pcFilePreviewView');
const { createPcFileUpload } = require('./middleware/pcFileUpload');
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
const { registerWorkshopToolsRoutes } = require('./routes/workshopTools');
const { createWorkshopToolsController } = require('./controllers/workshopToolsController');
const { renderLogibarreView } = require('./views/logibarreView');
const { renderBarreaudageView } = require('./views/barreaudageView');
const { renderLogitoleView } = require('./views/logitoleView');
const { registerTasksPageRoutes, registerTasksMutationRoutes } = require('./routes/tasks');
const { createTasksService } = require('./services/tasksService');
const { createTasksController } = require('./controllers/tasksController');
const { renderTasksListView } = require('./views/tasksListView');
const { renderTaskCard } = require('./views/taskCardView');
const { registerDashboardRoutes } = require('./routes/dashboard');
const { createDashboardService } = require('./services/dashboardService');
const { createDashboardWeatherService } = require('./services/dashboardWeatherService');
const { createDashboardController } = require('./controllers/dashboardController');
const { createDashboardWeatherController } = require('./controllers/dashboardWeatherController');
const { renderDashboardView } = require('./views/dashboardView');
const { renderDashboardClassicView } = require('./views/dashboardClassicView');
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
const { createSketchPngService } = require('./services/sketchPngService');
const { createMeasurementLegacySketchService } = require('./services/measurementLegacySketchService');
const { createMeasurementAssetsService } = require('./services/measurementAssetsService');
const { createMeasurementPhotoRecoveryService } = require('./services/measurementPhotoRecoveryService');
const { createMeasurementLegacyController } = require('./controllers/measurementLegacyController');
const { renderMeasurementPhotoRecoveryView } = require('./views/measurementPhotoRecoveryView');
const {
  registerMeasurementRecoveryAccessRoute,
  registerMeasurementLegacySketchRoutes,
  registerMeasurementPhotoRecoveryPageRoute,
  registerMeasurementLegacyModulePageRoute,
  registerMeasurementLegacyAssetRoutes
} = require('./routes/measurementLegacy');

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
const ebpParserHelpers = createEbpParserHelpers({ normalizeSearchText, roundAmount: round2 });
const ebpDocumentParserService = createEbpDocumentParserService({ parseEbpQuoteText, parseEbpInvoiceText, parserHelpers: ebpParserHelpers });

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

const clientOrderProfitabilityService = createClientOrderProfitabilityService({
  db,
  projectProfitability,
  clientOrderCostLines,
  safeName,
  clientOrderFolderName,
  getClientOrderFinancialSnapshot: clientOrderFinancialSnapshot.getClientOrderFinancialSnapshot
});

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

bootstrapDatabase(db, { incomingDocuments, logger: console, dbPath });

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
const pcFilesService = createPcFilesService({
  fs,
  clientPcDir: CLIENT_PC_DIR,
  standardSubfolders: STANDARD_SUBFOLDERS,
  safeName,
  safeResolveInside,
  ensureDir
});
const pcUpload = createPcFileUpload({ multer, pcFilesService, safeSegment });
const pcFilesController = createPcFilesController({
  pcFilesService,
  renderPreviewView: renderPcFilePreviewView
});
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

const userService = createUserService({ db });
const authService = createAuthService({ userService });
const twoFactorService = createTwoFactorService({
  crypto,
  sessionSecret: SESSION_SECRET,
  allowedEmails: MFA_ALLOWED_EMAILS,
  codeTtlMs: MFA_CODE_TTL_MS,
  maxCodeAttempts: MFA_MAX_CODE_ATTEMPTS,
  lockMs: MFA_LOCK_MS,
  resendCooldownMs: MFA_RESEND_COOLDOWN_MS,
  requestWindowMs: MFA_REQUEST_WINDOW_MS,
  maxRequestsPerWindow: MFA_MAX_REQUESTS_PER_WINDOW
});
const authEmailService = createAuthEmailService({
  nodemailer,
  smtpHost: SMTP_HOST,
  smtpPort: SMTP_PORT,
  smtpSecure: SMTP_SECURE,
  smtpUser: SMTP_USER,
  smtpPass: SMTP_PASS,
  smtpFrom: SMTP_FROM,
  codeTtlMinutes: MFA_CODE_TTL_MINUTES
});
const twoFactorView = createTwoFactorView({ escapeHtml: escHtml });
const authController = createAuthController({
  authService,
  twoFactorService,
  authEmailService,
  twoFactorView,
  loginFilePath: path.join(__dirname, 'public', 'login.html'),
  getClientIp: (req) => String(req.ip || req.socket?.remoteAddress || 'unknown'),
  logger: console
});

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

registerAuthRoutes(app, { requirePendingMfa, controller: authController });

/* ===================== DASHBOARD ===================== */
const dashboardService = createDashboardService({
  db,
  dateKeyInTimeZone,
  timeZone: APP_TIME_ZONE
});
const dashboardWeatherService = createDashboardWeatherService({
  fetch,
  AbortController,
  setTimeout,
  clearTimeout
});
const dashboardViewDependencies = {
  escHtml,
  safeName,
  getProgressFromChantierStatus,
  formatHours,
  normalizePurchaseStatus,
  clientOrderFolderName
};
const dashboardController = createDashboardController({
  dashboardService,
  agendaService,
  renderDashboardView,
  renderDashboardClassicView,
  pageTemplate,
  viewDependencies: dashboardViewDependencies
});
const dashboardWeatherController = createDashboardWeatherController({
  weatherService: dashboardWeatherService
});
registerDashboardRoutes(app, {
  requireLogin,
  dashboardController,
  weatherController: dashboardWeatherController
});
/* ===================== TASKS ===================== */
const tasksService = createTasksService({ db });
const tasksController = createTasksController({
  tasksService,
  renderTasksListView,
  renderTaskCard,
  pageTemplate,
  viewDependencies: { escHtml, clientPageIcon }
});
registerTasksPageRoutes(app, {
  requireLogin,
  handlers: tasksController
});
/* ===================== AGENDA ===================== */
registerAgendaPageRoute(app, { requireLogin, controller: agendaController });
/* ===================== PRISES DE COTES ===================== */

const measurementTechnicalDrawingService = createMeasurementTechnicalDrawingService({ db, parseOptionalId, parseMeasurementData, randomUUID: () => crypto.randomUUID(), buildStairPhotoSlots: buildEscalierV2PhotoPublicSlots });
const sketchPngService = createSketchPngService({ fs, sketchesDir: SKETCHES_DIR, safeResolveInside, ensureDir });
const measurementLegacySketchService = createMeasurementLegacySketchService({ db, parseOptionalId, sketchPngService });
const measurementAssetsService = createMeasurementAssetsService({ path, publicDir: MEASUREMENTS_PUBLIC_DIR, sheets: MEASUREMENT_SHEETS, assets: MEASUREMENTS_ASSETS, technicalDrawingAssets: TECHNICAL_DRAWING_ASSETS, safeResolveInside });
const measurementPhotoRecoveryService = createMeasurementPhotoRecoveryService({ parseOptionalId });
const measurementLegacyController = createMeasurementLegacyController({ sketchService: measurementLegacySketchService, assetsService: measurementAssetsService, recoveryService: measurementPhotoRecoveryService, renderRecoveryView: renderMeasurementPhotoRecoveryView, pageTemplate });
const measurementsService = createMeasurementsService({ db, parseOptionalId, normalizeMeasurementLink, preserveTechnicalSketches: measurementTechnicalDrawingService.preserve, formatDateLabel, isoDate, measurementRoutes, removeStoragePathIfExists, sketchPath: sketchPngService.getPath, safeResolveInside, measurementPhotoDir: MEASUREMENT_PHOTO_DIR });
const measurementViewDependencies = { escHtml, clientPageIcon, measurementTitle, measurementLinkBadge, measurementRoutes, formatDateLabel, renderSketchBlock, renderMeasurementCards: (rows) => renderCommonMeasurementCards(rows, { escHtml, measurementTitle, measurementLinkBadge, measurementRoutes }) };
const measurementsController = createMeasurementsController({ s: measurementsService, renderList: renderMeasurementsListView, renderDetail: renderMeasurementDetailShellView, pageTemplate, viewDeps: measurementViewDependencies, parseOptionalId, normalizeQuoteStatus, measurementRoutes, measurementTitle });
registerMeasurementsListRoutes(app, { requireLogin, c: measurementsController });
const measurementPhotoUpload = createMeasurementPhotoUpload({ multer, db, parseOptionalId, photoFiles: measurementPhotoFiles, photoDir: MEASUREMENT_PHOTO_DIR, ensureDir });
registerMeasurementContextRoute(app, { requireLogin, c: measurementsController });
registerMeasurementRecoveryAccessRoute(app, { requireLogin, controller: measurementLegacyController });

const measurementPhotosService = createMeasurementPhotosService({ db, fs, path, crypto, photoFiles: measurementPhotoFiles, photoDir: MEASUREMENT_PHOTO_DIR });
const measurementPhotosController = createMeasurementPhotosController({ s: measurementPhotosService, parseOptionalId, upload: (req, res, callback) => measurementPhotoUpload.array('photos', 20)(req, res, callback), fs, logger: console });
registerMeasurementPhotoRoutes(app, { requireLogin, c: measurementPhotosController });
const measurementStairV2Service = createMeasurementStairV2Service({ db, parseOptionalId, parseMeasurementData, buildPhotoSlots: buildEscalierV2PhotoPublicSlots, photoBaseDir: measurementEscalierV2PhotoBaseDir, safeResolveInside, photoRoot: ESCALIER_V2_PHOTO_DIR, path, removeStoragePathIfExists, sketchPath: sketchPngService.getPath });
const measurementStairV2PhotosService = createMeasurementStairV2PhotosService({ db, fs, path, crypto, parseMeasurementData, normalizeCategory: normalizeEscalierV2Category, normalizeSlots: normalizeEscalierV2PhotoSlots, buildPublicSlots: buildEscalierV2PhotoPublicSlots, photoBaseDir: measurementEscalierV2PhotoBaseDir, safeResolveInside, ensureDir });
const escalierV2PhotoUpload = createMeasurementStairV2Upload({ multer, path, parseOptionalId, getMeasurement: measurementStairV2Service.get, photoBaseDir: measurementEscalierV2PhotoBaseDir, ensureDir, safeSegment });
const measurementStairV2Controller = createMeasurementStairV2Controller({ s: measurementStairV2Service, photos: measurementStairV2PhotosService, parseOptionalId, upload: (req, res, callback) => escalierV2PhotoUpload.array('photos', 30)(req, res, callback), fs, path, publicDir: MEASUREMENTS_PUBLIC_DIR, logger: console });
registerMeasurementStairV2ApiRoutes(app, { requireLogin, c: measurementStairV2Controller });
registerMeasurementPersistenceRoutes(app, { requireLogin, c: measurementsController });
const measurementTechnicalDrawingController = createMeasurementTechnicalDrawingController({ service: measurementTechnicalDrawingService, path, publicDir: MEASUREMENTS_PUBLIC_DIR });
registerMeasurementTechnicalDrawingApiRoutes(app, { requireLogin, c: measurementTechnicalDrawingController });
registerMeasurementLegacySketchRoutes(app, { requireLogin, controller: measurementLegacyController });

registerMeasurementDetailRoute(app, { requireLogin, c: measurementsController });
registerMeasurementPhotoRecoveryPageRoute(app, { requireAdmin, controller: measurementLegacyController });

registerMeasurementStairV2PageRoute(app, { requireLogin, c: measurementStairV2Controller });
registerMeasurementLegacyModulePageRoute(app, { requireLogin, controller: measurementLegacyController });

registerMeasurementTechnicalDrawingPageRoute(app, { requireLogin, c: measurementTechnicalDrawingController });
registerMeasurementLegacyAssetRoutes(app, { requireLogin, controller: measurementLegacyController });

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
  const fields = ebpDocumentParserService.parseInvoice(extractedText);
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
const ebpValidationService = createEbpValidationService({ path, safeResolveInside, scanDir: EBP_SCAN_DIR, textExtractionService: documentTextExtractionService, extractQuoteFields: ebpDocumentParserService.parseQuote, findBestClientMatch, normalizeSearchText, isoDate });
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
    uploadClientOrderFolderFile: pcFilesController.uploadFile
  }
});

registerPcFilesRoutes(app, {
  requireLogin,
  handlers: {
    showFilePreview: pcFilesController.showFilePreview,
    serveRawFile: pcFilesController.serveRawFile
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
    return sketchPngService.getPath('quotes', quoteId);
  },
  saveQuoteSketchPng(quoteId, image) {
    return sketchPngService.save('quotes', quoteId, image);
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
  saveProjectForecast: clientOrderProfitabilityService.saveProjectForecast,
  importMissingQuoteCostLines: clientOrderProfitabilityService.importMissingQuoteCostLines
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

/* ===================== OUTILS ATELIER ===================== */
const workshopToolsController = createWorkshopToolsController({
  pageTemplate,
  renderLogibarreView,
  renderBarreaudageView,
  renderLogitoleView,
  viewDependencies: { clientPageIcon }
});
registerWorkshopToolsRoutes(app, {
  requireLogin,
  handlers: workshopToolsController
});
/* ===================== ERREURS ===================== */

process.on('uncaughtException', (err) => console.error('❌ uncaughtException:', err));
process.on('unhandledRejection', (err) => console.error('❌ unhandledRejection:', err));

app.use((err, req, res, next) => {
  console.error('❌ Express error:', err);
  res.status(500).send('Erreur serveur (voir console).');
});
/* ===================== TÂCHES ===================== */
registerTasksMutationRoutes(app, {
  requireLogin,
  handlers: tasksController
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
  getClientOrderFinancialSnapshot: clientOrderProfitabilityService.getFinancialSnapshot,
  validateClientOrderCostLine: clientOrderCostLines.validateLine,
  clientOrderForecastData: clientOrderProfitabilityService.getOrderForecastData,
  projectProfitabilityForOrder: clientOrderProfitabilityService.getOrderProfitability,
  renderClientOrderProfitabilityView,
  clientPageIcon,
  pcFolderIcon,
  calculateCostLine: clientOrderCostLines.calculateLine,
  laborCategories: clientOrderCostLines.LABOR_CATEGORIES,
  materialUnits: clientOrderCostLines.MATERIAL_UNITS,
  clientOrderFolderUrl: clientOrderProfitabilityService.clientOrderFolderUrl,
  roundAmount: round2,
  clientOrderDetailRedirect: clientOrderProfitabilityService.clientOrderDetailRedirect,
  importMissingQuoteCostLines: clientOrderProfitabilityService.importMissingQuoteCostLines,
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
  getClientOrderFinancialSnapshot: clientOrderProfitabilityService.getFinancialSnapshot,
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
  chantierStatusOptions
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
  importMissingQuoteCostLines: clientOrderProfitabilityService.importMissingQuoteCostLines,
  safeName,
  getProgressFromChantierStatus,
  getFinancialSnapshot: clientOrderProfitabilityService.getFinancialSnapshot,
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
