'use strict';

const assert = require('assert');
const { createEbpScannerController } = require('./controllers/ebpScannerController');

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    sendFile(filePath) {
      this.sentFile = filePath;
      return this;
    },
  };
}

const incomingService = {
  listIncomingFiles: () => [{ name: 'devis.pdf' }],
  resolveIncomingFile: () => ({ name: 'devis.pdf', filePath: '/incoming/devis.pdf' }),
  copyIncomingForAnalysis: () => ({ name: 'devis.pdf', scanFileName: 'scan-devis.pdf' }),
};

const controller = createEbpScannerController({
  incomingService,
  validationService: { buildQuoteValidationData: async () => ({}) },
  scannerService: { createOrder: () => ({ redirect: '/done' }) },
  renderIncomingView: ({ files }) => `INCOMING:${files[0].name}`,
  renderIncomingFileView: (name) => `FILE:${name}`,
  renderScannerView: () => 'SCANNER',
  renderValidationView: () => 'VALIDATION',
  pageTemplate: (req, title, html) => `${title}:${html}`,
  viewDependencies: { escHtml: String },
  uploadSingle: (req, res, callback) => callback(null),
  path: {},
  safeSegment: String,
  incomingDir: '/incoming',
});

(async () => {
  let response = createResponse();
  controller.showIncoming({ query: {} }, response);
  assert.strictEqual(response.body, 'Devis EBP à traiter:INCOMING:devis.pdf');

  response = createResponse();
  controller.openIncoming({ query: { file: 'devis.pdf' } }, response);
  assert.strictEqual(response.body, 'FILE:devis.pdf');

  response = createResponse();
  controller.rawIncoming({ query: { file: 'devis.pdf' } }, response);
  assert.strictEqual(response.headers['Content-Type'], 'application/pdf');
  assert.strictEqual(response.sentFile, '/incoming/devis.pdf');

  response = createResponse();
  await controller.analyzeIncoming({ body: { incoming_file: 'devis.pdf' } }, response);
  assert.strictEqual(response.body, 'Validation scan devis EBP:VALIDATION');

  console.log('OK - contrôleur incoming EBP');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
