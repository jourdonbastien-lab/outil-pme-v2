'use strict';
const assert = require('assert');
const fs = require('fs');
const { createClientFolderNavigationController } = require('./controllers/clientFolderNavigationController');

assert.throws(() => createClientFolderNavigationController({}), /Service navigation/);
let viewModel;
const controller = createClientFolderNavigationController({
  navigationService: {
    buildClientFolderNavigationModel(client) {
      return client === 'Absent'
        ? { client, exists: false, folders: [] }
        : { client, exists: true, folders: [{ folderName: 'Portail' }] };
    }
  },
  renderView(model) { viewModel = model; return 'HTML'; },
  pageTemplate: (_req, title, html) => `${title}:${html}`,
  escapeHtml: String,
  pcFolderIcon: () => ''
});
let sent;
controller.showClientFolders({
  params: { client: 'Client' }, session: { user: { role: 'atelier' } }
}, { send: (body) => { sent = body; } });
assert.strictEqual(sent, 'Client : Client:HTML');
assert.strictEqual(viewModel.isWorkshop, true);
let status;
let message;
controller.showClientFolders({ params: { client: 'Absent' }, session: {} }, {
  status(code) { status = code; return this; },
  send(body) { message = body; }
});
assert.strictEqual(status, 404);
assert.strictEqual(message, 'Client introuvable sur le PC');
const source = fs.readFileSync('controllers/clientFolderNavigationController.js', 'utf8');
assert(!/db\.prepare|new Database|<article/.test(source));
console.log('OK - contrôleur navigation dossiers clients');
