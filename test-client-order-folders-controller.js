'use strict';
const assert = require('assert');
const { createClientOrderFoldersController } = require('./controllers/clientOrderFoldersController');
assert.throws(() => createClientOrderFoldersController({}), /Service dossiers/);
const controller = createClientOrderFoldersController({
  folderService: {
    isSupportedFolderType: (type) => type === 'Plans',
    getClientOrderFolderContext: () => ({ client: 'Client', order: 'Portail', type: 'Plans', orderDb: { id: 7 }, folderPath: '/folder' }),
    getClientOrderRootContext: () => ({ client: 'Client', order: 'Portail', orderDb: { id: 7 }, folderPath: '/folder' }),
    listSupportedFolderTypes: () => ['Plans', 'Photos']
  },
  hoursController: { showOrderHoursFolder() {} }, purchaseService: { listPurchasesByOrderId: () => [] },
  invoiceController: {}, baseDir: '/base', folderExists: () => true, listFiles: () => ['plan.pdf'],
  extensionName: () => '.pdf', baseName: String, invoiceExtensions: new Set(), fileIconName: () => 'file',
  renderFolderView: () => 'HTML', renderFilesList: () => 'FILES', renderPurchasesBlock: () => '',
  renderRootFolderView: () => 'ROOT',
  pageTemplate: (_req, _title, html) => html, escapeHtml: String, clientPageIcon: () => '', pcFolderIcon: () => '',
  normalizePurchaseStatus: String, purchaseStatusClass: String, purchaseStatusOptions: String, formatDateLabel: String,
  ensureStandardSubfolders() {}, workshopFolderTypes: ['Plans'], listMeasurements: () => [],
  renderMeasurements: () => '', chantierStatusOptions: () => ''
});
let sent;
controller.showClientOrderFolder({ params: { client: 'Client', order: 'Portail', type: 'Plans' } }, {
  send: (html) => { sent = html; }, status: () => ({ send() {} })
});
assert.strictEqual(sent, 'HTML');
let status;
controller.showClientOrderFolder({ params: { type: 'Croquis' } }, {
  status: (code) => { status = code; return { send() {} }; }
});
assert.strictEqual(status, 400);
controller.showClientOrderRootFolder({
  params: { client: 'Client', order: 'Portail' }, session: { user: { role: 'atelier' } }
}, { send: (html) => { sent = html; }, status: () => ({ send() {} }) });
assert.strictEqual(sent, 'ROOT');
console.log('OK - contrôleur dossiers commandes clients');
