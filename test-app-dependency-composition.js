'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'outil-pme-app-'));
process.env.OUTIL_PME_STORAGE_DIR = root;
process.env.OUTIL_PME_DB_PATH = path.join(root, 'data', 'app.db');
process.env.SCANNER_IMPORT_ENABLED = 'false';
const { createApplication } = require('./app/createApplication');
const originalLog = console.log;
console.log = () => {};
let runtime;
try {
  runtime = createApplication();
} finally {
  console.log = originalLog;
}
assert(runtime.app);
assert(runtime.db);
assert(runtime.sessionStore);
assert(runtime.agendaService);
assert(runtime.incomingDocumentsImportService);
assert.strictEqual(runtime.scannerImportEnabled, false);
assert.strictEqual(runtime.db.name, process.env.OUTIL_PME_DB_PATH);
runtime.db.close();
fs.rmSync(root, { recursive: true, force: true });
console.log('OK - composition dépendances application');
process.exit(0);
