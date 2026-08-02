'use strict';
const assert = require('assert');
const { createWorksitesController } = require('./controllers/worksitesController');
const controller = createWorksitesController();
for (const name of ['showWorksites', 'createWorksite', 'showWorksite', 'updateWorksite']) {
  const res = { redirect(value) { this.value = value; return this; } };
  assert.strictEqual(controller[name]({}, res), res);
  assert.strictEqual(res.value, '/orders/clients');
}
console.log('OK - contrôleur chantiers');
