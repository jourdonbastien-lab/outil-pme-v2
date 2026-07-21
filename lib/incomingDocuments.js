'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const MIME_BY_EXT = Object.freeze({ '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' });
const DOCUMENT_TYPES = Object.freeze(['a_classer', 'devis_fournisseur', 'facture_fournisseur', 'bon_enlevement', 'bon_livraison', 'autre']);
const STATUSES = Object.freeze(['nouveau', 'analyse', 'classe', 'erreur', 'rejete']);

function safeResolveInside(baseDir, ...parts) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...parts);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error('Chemin scanner invalide');
  return target;
}

function ensureScannerDirectories(storageDir) {
  const root = safeResolveInside(storageDir, 'scanner');
  const dirs = { root };
  for (const name of ['incoming', 'processing', 'documents', 'rejected', 'temp']) {
    dirs[name] = safeResolveInside(root, name);
    fs.mkdirSync(dirs[name], { recursive: true });
  }
  return dirs;
}

function migrateIncomingDocuments(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS incoming_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL, stored_name TEXT NOT NULL, stored_path TEXT NOT NULL,
      mime_type TEXT, file_size INTEGER NOT NULL DEFAULT 0, sha256 TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'scanner', document_type TEXT NOT NULL DEFAULT 'a_classer',
      status TEXT NOT NULL DEFAULT 'nouveau', supplier_name TEXT, document_number TEXT,
      document_date TEXT, amount_ht REAL, amount_tva REAL, amount_ttc REAL,
      extracted_text TEXT, extraction_json TEXT, notes TEXT, error_message TEXT,
      received_at TEXT NOT NULL, processed_at TEXT, classified_at TEXT, classified_by INTEGER,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_incoming_documents_status ON incoming_documents(status);
    CREATE INDEX IF NOT EXISTS idx_incoming_documents_received ON incoming_documents(received_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_incoming_documents_sha256 ON incoming_documents(sha256);
  `);
}

function detectFileType(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 12);
  if (header.subarray(0, 5).toString('ascii') === '%PDF-') return { ext: '.pdf', mime: 'application/pdf' };
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: '.png', mime: 'image/png' };
  return null;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function internalName(ext, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${stamp}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

function validIncomingName(name) {
  const value = String(name || '');
  if (!value || value.startsWith('.') || value.startsWith('~') || /\.(tmp|part|crdownload)$/i.test(value)) return false;
  return ALLOWED_EXTENSIONS.has(path.extname(value).toLowerCase());
}

function parseGeneralFields(text) {
  const raw = String(text || '');
  const number = raw.match(/\b(?:facture|devis|bon)\s*(?:n[°o]|num(?:éro)?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i)?.[1] || null;
  const dateMatch = raw.match(/\b(\d{2})[/.\-](\d{2})[/.\-](20\d{2})\b/);
  const amount = (label) => {
    const match = raw.match(new RegExp(`${label}\\s*[:\\-]?\\s*([0-9][0-9 .]*[,.][0-9]{2})`, 'i'));
    return match ? Number(match[1].replace(/\s/g, '').replace(',', '.')) : null;
  };
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return {
    supplier_name: lines.find((line) => /[A-Za-zÀ-ÿ]{3}/.test(line) && line.length <= 120) || null,
    document_number: number,
    document_date: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null,
    amount_ht: amount('(?:total\\s*)?HT'), amount_tva: amount('TVA'), amount_ttc: amount('(?:total\\s*)?TTC')
  };
}

async function analyzeDocument(database, row, analyzeFile, active = new Set()) {
  if (active.has(Number(row.id))) return { busy: true };
  active.add(Number(row.id));
  const now = new Date().toISOString();
  try {
    database.prepare("UPDATE incoming_documents SET status = 'analyse', updated_at = ? WHERE id = ?").run(now, row.id);
    const analysis = await analyzeFile(row.stored_path, row.mime_type);
    const fields = parseGeneralFields(analysis.text);
    database.prepare(`UPDATE incoming_documents SET status = 'nouveau', supplier_name = ?, document_number = ?, document_date = ?,
      amount_ht = ?, amount_tva = ?, amount_ttc = ?, extracted_text = ?, extraction_json = ?, error_message = NULL,
      processed_at = ?, updated_at = ? WHERE id = ?`).run(fields.supplier_name, fields.document_number, fields.document_date,
      fields.amount_ht, fields.amount_tva, fields.amount_ttc, String(analysis.text || ''), JSON.stringify({ ...analysis, text: undefined, detected: fields }), now, now, row.id);
    return { success: true };
  } catch (error) {
    database.prepare("UPDATE incoming_documents SET status = 'erreur', error_message = ?, processed_at = ?, updated_at = ? WHERE id = ?")
      .run(String(error.message || 'Analyse impossible').slice(0, 500), now, now, row.id);
    return { success: false, error };
  } finally {
    active.delete(Number(row.id));
  }
}

async function importDocument({ database, dirs, sourcePath, originalName, source = 'scanner', analyzeFile, activeAnalyses, maxFileSizeBytes = 25 * 1024 * 1024 }) {
  const ext = path.extname(String(originalName || sourcePath)).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error('Extension non autorisée');
  const sourceStat = fs.statSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.size <= 0) throw new Error('Fichier vide ou invalide');
  if (sourceStat.size > maxFileSizeBytes) throw new Error('Fichier trop volumineux');
  const processingName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const processingPath = safeResolveInside(dirs.processing, processingName);
  fs.renameSync(sourcePath, processingPath);
  try {
    const detected = detectFileType(processingPath);
    if (!detected || (detected.ext !== ext && !(detected.ext === '.jpg' && ext === '.jpeg'))) throw new Error('Signature de fichier invalide');
    const hash = sha256File(processingPath);
    const duplicate = database.prepare('SELECT id FROM incoming_documents WHERE sha256 = ?').get(hash);
    if (duplicate) { fs.unlinkSync(processingPath); return { duplicate: true, id: duplicate.id }; }
    const storedName = internalName(detected.ext);
    const storedPath = safeResolveInside(dirs.documents, storedName);
    fs.renameSync(processingPath, storedPath);
    const stat = fs.statSync(storedPath);
    const now = new Date().toISOString();
    const result = database.prepare(`INSERT INTO incoming_documents
      (original_name, stored_name, stored_path, mime_type, file_size, sha256, source, document_type, status, received_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'a_classer', 'nouveau', ?, ?, ?)`).run(path.basename(originalName), storedName, storedPath, detected.mime, stat.size, hash, source, now, now, now);
    const row = database.prepare('SELECT * FROM incoming_documents WHERE id = ?').get(result.lastInsertRowid);
    const analysisResult = analyzeFile ? await analyzeDocument(database, row, analyzeFile, activeAnalyses) : null;
    return { imported: true, id: Number(result.lastInsertRowid), storedPath, analysisError: analysisResult?.success === false };
  } catch (error) {
    if (fs.existsSync(processingPath)) fs.renameSync(processingPath, safeResolveInside(dirs.rejected, processingName));
    throw error;
  }
}

function createScannerImporter({ database, dirs, analyzeFile, intervalMs = 10000, maxFileSizeBytes = 25 * 1024 * 1024, logger = console }) {
  const observations = new Map();
  const activeAnalyses = new Set();
  let running = false;
  let timer = null;
  async function scanOnce() {
    if (running) return;
    running = true;
    try {
      const names = fs.readdirSync(dirs.incoming);
      for (const name of names) {
        const hiddenOrTemporary = !name || name.startsWith('.') || name.startsWith('~') || /\.(tmp|part|crdownload)$/i.test(name);
        if (hiddenOrTemporary) continue;
        if (!validIncomingName(name)) {
          const sourcePath = safeResolveInside(dirs.incoming, name);
          if (fs.statSync(sourcePath).isFile()) {
            const rejectedName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            fs.renameSync(sourcePath, safeResolveInside(dirs.rejected, rejectedName));
            logger.error(`[scanner-import] extension rejetée: ${path.basename(name)}`);
          }
          continue;
        }
        const filePath = safeResolveInside(dirs.incoming, name);
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        const previous = observations.get(name);
        observations.set(name, { size: stat.size, mtimeMs: stat.mtimeMs });
        if (!previous || previous.size !== stat.size || previous.mtimeMs !== stat.mtimeMs) continue;
        observations.delete(name);
        logger.log(`[scanner-import] fichier détecté: ${path.basename(name)}`);
        try {
          const result = await importDocument({ database, dirs, sourcePath: filePath, originalName: name, source: 'scanner', analyzeFile, activeAnalyses, maxFileSizeBytes });
          logger.log(`[scanner-import] ${result.duplicate ? 'doublon ignoré' : 'import réussi'}: ${path.basename(name)}`);
          if (result.analysisError) logger.error(`[scanner-import] erreur d’analyse: ${path.basename(name)}`);
        } catch (error) { logger.error(`[scanner-import] fichier rejeté: ${path.basename(name)} (${String(error.message).slice(0, 160)})`); }
      }
    } finally { running = false; }
  }
  function start() { if (timer) return; logger.log(`[scanner-import] service démarré (${intervalMs} ms)`); timer = setInterval(scanOnce, intervalMs); timer.unref?.(); }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return { start, stop, scanOnce, observations, activeAnalyses };
}

module.exports = { ALLOWED_EXTENSIONS, MIME_BY_EXT, DOCUMENT_TYPES, STATUSES, safeResolveInside, ensureScannerDirectories,
  migrateIncomingDocuments, detectFileType, sha256File, validIncomingName, parseGeneralFields, analyzeDocument,
  importDocument, createScannerImporter };
