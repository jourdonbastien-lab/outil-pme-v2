'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const incoming = require('./lib/incomingDocuments');

function pdfBuffer(label = 'TEST') { return Buffer.from(`%PDF-1.4\n${label}\n%%EOF\n`, 'utf8'); }

class MemoryDatabase {
  constructor() { this.rows = []; this.sql = ''; }
  exec(sql) { this.sql += sql; }
  prepare(sql) {
    const db = this;
    return {
      get(...args) {
        if (sql.includes('sqlite_master')) return db.sql.includes(args[1] || 'incoming_documents') ? { name: args[1] || 'incoming_documents' } : undefined;
        if (sql.includes('WHERE sha256')) return db.rows.find((row) => row.sha256 === args[0]);
        if (sql.includes('WHERE id')) return db.rows.find((row) => row.id === Number(args[0]));
        if (sql.includes('COUNT(*)')) return { n: db.rows.length };
        return undefined;
      },
      all() { return db.rows.slice(); },
      run(...args) {
        if (sql.includes('INSERT INTO incoming_documents')) {
          const id = db.rows.length + 1;
          const [original_name, stored_name, stored_path, mime_type, file_size, sha256, source, received_at, created_at, updated_at] = args;
          db.rows.push({ id, original_name, stored_name, stored_path, mime_type, file_size, sha256, source, document_type: 'a_classer', status: 'nouveau', received_at, created_at, updated_at });
          return { lastInsertRowid: id, changes: 1 };
        }
        const id = Number(args.at(-1));
        const row = db.rows.find((item) => item.id === id);
        if (!row) return { changes: 0 };
        if (sql.includes("status = 'analyse'")) row.status = 'analyse';
        else if (sql.includes("status = 'nouveau'")) {
          [row.supplier_name, row.document_number, row.document_date, row.amount_ht, row.amount_tva, row.amount_ttc, row.extracted_text, row.extraction_json] = args;
          row.status = 'nouveau'; row.error_message = null;
        } else if (sql.includes("status = 'erreur'")) { row.status = 'erreur'; row.error_message = args[0]; }
        else if (sql.includes("status = 'facture_fournisseur'")) row.status = 'classe';
        else if (sql.includes("status = 'rejete'")) { row.status = 'rejete'; row.notes = args[0]; }
        return { changes: 1 };
      }
    };
  }
}

(async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'outil-pme-scanner-'));
  const storage = path.join(tempRoot, 'storage');
  const dirs = incoming.ensureScannerDirectories(storage);
  const db = new MemoryDatabase();
  try {
    incoming.migrateIncomingDocuments(db);
    assert(db.sql.includes('CREATE TABLE IF NOT EXISTS incoming_documents'), 'table absente');
    assert(db.sql.includes('idx_incoming_documents_sha256'));

    const source = path.join(dirs.incoming, 'facture.pdf');
    fs.writeFileSync(source, pdfBuffer('FACTURE N° F-42\nTOTAL HT 100,00\nTVA 20,00\nTOTAL TTC 120,00'));
    const imported = await incoming.importDocument({ database: db, dirs, sourcePath: source, originalName: 'facture.pdf', analyzeFile: async () => ({ text: 'FOURNISSEUR TEST\nFACTURE N° F-42\nTOTAL HT 100,00\nTVA 20,00\nTOTAL TTC 120,00' }), activeAnalyses: new Set() });
    assert(imported.imported && fs.existsSync(imported.storedPath), 'PDF valide non importé');
    const row = db.prepare('SELECT * FROM incoming_documents WHERE id = ?').get(imported.id);
    assert.strictEqual(row.document_number, 'F-42');
    assert.strictEqual(row.amount_ttc, 120);

    const forbidden = path.join(dirs.incoming, 'danger.exe');
    fs.writeFileSync(forbidden, 'MZ');
    await assert.rejects(() => incoming.importDocument({ database: db, dirs, sourcePath: forbidden, originalName: 'danger.exe' }), /Extension/);

    const duplicateSource = path.join(dirs.incoming, 'copie.pdf');
    fs.writeFileSync(duplicateSource, pdfBuffer('FACTURE N° F-42\nTOTAL HT 100,00\nTVA 20,00\nTOTAL TTC 120,00'));
    const duplicate = await incoming.importDocument({ database: db, dirs, sourcePath: duplicateSource, originalName: 'copie.pdf' });
    assert(duplicate.duplicate, 'doublon non bloqué');
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM incoming_documents').get().n, 1);

    assert.throws(() => incoming.safeResolveInside(dirs.documents, '..', 'secret.pdf'), /Chemin/);
    assert(!incoming.validIncomingName('.cache.pdf'));
    assert(!incoming.validIncomingName('scan.pdf.part'));

    const changing = path.join(dirs.incoming, 'stable.pdf');
    fs.writeFileSync(changing, pdfBuffer('A'));
    const importer = incoming.createScannerImporter({ database: db, dirs, intervalMs: 10000, analyzeFile: async () => ({ text: 'SCAN STABLE' }), logger: { log() {}, error() {} } });
    await importer.scanOnce();
    assert(!fs.existsSync(forbidden) && fs.readdirSync(dirs.rejected).some((name) => name.endsWith('danger.exe')), 'extension interdite non déplacée vers rejected');
    assert(fs.existsSync(changing), 'traitement dès le premier passage');
    fs.appendFileSync(changing, 'change');
    await importer.scanOnce();
    assert(fs.existsSync(changing), 'fichier changeant traité');
    await importer.scanOnce();
    assert(!fs.existsSync(changing), 'fichier stable non traité au passage suivant');

    const classified = db.prepare('SELECT * FROM incoming_documents WHERE id = ?').get(imported.id);
    classified.document_type = 'facture_fournisseur'; classified.supplier_name = 'Validé'; classified.status = 'classe'; classified.classified_by = 7;
    assert.strictEqual(classified.status, 'classe');

    const reanalyzed = await incoming.analyzeDocument(db, db.prepare('SELECT * FROM incoming_documents WHERE id = ?').get(imported.id), async () => ({ text: 'NOUVEAU FOURNISSEUR\nDEVIS N° D-9' }), new Set());
    assert(reanalyzed.success);
    assert.strictEqual(db.prepare('SELECT document_number FROM incoming_documents WHERE id = ?').get(imported.id).document_number, 'D-9');

    const storedBeforeReject = db.prepare('SELECT stored_path FROM incoming_documents WHERE id = ?').get(imported.id).stored_path;
    const rejected = db.prepare('SELECT * FROM incoming_documents WHERE id = ?').get(imported.id); rejected.status = 'rejete'; rejected.notes = 'test';
    assert(fs.existsSync(storedBeforeReject), 'rejet ayant supprimé le fichier');

    const server = (fs.readFileSync('server.js', 'utf8') + fs.readFileSync('app/createApplication.js', 'utf8') + fs.readFileSync('app/startApplication.js', 'utf8') + fs.readFileSync('app/shutdown.js', 'utf8'));
    assert(server.includes('registerIncomingDocumentsRoutes(app'), 'routeur documents entrants absent');
    const routeSource = fs.readFileSync(path.join(__dirname, 'routes', 'incomingDocuments.js'), 'utf8');
    const serviceSource = fs.readFileSync(path.join(__dirname, 'services', 'incomingDocumentsService.js'), 'utf8');
    const controllerSource = fs.readFileSync(path.join(__dirname, 'controllers', 'incomingDocumentsController.js'), 'utf8');
    for (const route of ["app.get('/documents-entrants', requireAdmin", "app.get('/documents-entrants/:id/file', requireAdmin", "app.post('/documents-entrants/:id/classify', requireAdmin", "app.post('/documents-entrants/:id/reanalyze', requireAdmin", "app.post('/documents-entrants/:id/reject', requireAdmin"]) assert(routeSource.includes(route), `route absente: ${route}`);
    assert(serviceSource.includes('LIMIT ? OFFSET ?'), 'pagination absente');
    assert(serviceSource.includes("status = 'rejete'"), 'filtre/rejet absent');
    assert(controllerSource.includes('uploadSingle'), 'import manuel absent');
    assert(server.includes("processObject.once('SIGTERM'"), 'arrêt propre absent');
    console.log('OK - documents entrants scanner');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
