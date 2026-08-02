'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const os = require('os'); const Database = require('better-sqlite3');
const incoming = require('./lib/incomingDocuments'); const { createIncomingDocumentsService } = require('./services/incomingDocumentsService');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'incoming-service-')); const dirs = incoming.ensureScannerDirectories(root); const db = new Database(':memory:'); incoming.migrateIncomingDocuments(db);
const service = createIncomingDocumentsService({ db, fs, path, incomingDocuments: incoming, scannerDirs: dirs, round2: (v) => Math.round(v * 100) / 100, now: () => '2026-08-02T12:00:00.000Z' });
assert.deepStrictEqual(service.listDocuments().rows, []);
const filePath = path.join(dirs.documents, 'stored.pdf'); fs.writeFileSync(filePath, '%PDF-1.4');
db.prepare(`INSERT INTO incoming_documents (original_name,stored_name,stored_path,mime_type,file_size,sha256,source,document_type,status,received_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run("devis été.pdf", 'stored.pdf', filePath, 'application/pdf', 8, 'hash', 'upload', 'a_classer', 'nouveau', '2026-08-02', '2026-08-02', '2026-08-02');
const row = service.getDocumentById(1); assert.strictEqual(row.original_name, "devis été.pdf"); assert.strictEqual(service.getDocumentById('x'), null); assert.strictEqual(service.resolveDocumentFile(row), filePath);
let list = service.listDocuments({ status: 'nouveau', period: '7', search: 'été', page: '1' }); assert.strictEqual(list.total, 1); assert.strictEqual(list.counts.nouveaux, 1);
assert.deepStrictEqual(service.classifyDocument(row, { document_type: 'bad' }, 2), { error: 'Type de document invalide' });
assert.deepStrictEqual(service.classifyDocument(row, { document_type: 'devis_fournisseur', amount_ht: '12,345', document_date: '2026-08-02' }, 2), { success: true });
assert.strictEqual(service.getDocumentById(1).amount_ht, 12.35); service.rejectDocument(row, 'Refus'); assert.strictEqual(service.getDocumentById(1).status, 'rejete');
assert.throws(() => service.resolveDocumentFile({ stored_name: '../x', stored_path: '/tmp/x' }), /incohérent|introuvable/);
db.close(); fs.rmSync(root, { recursive: true, force: true }); console.log('OK - service documents entrants');
