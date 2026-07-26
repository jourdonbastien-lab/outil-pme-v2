'use strict';
const assert = require('assert');
const { createClientOrderHoursController } = require('./controllers/clientOrderHoursController');
assert.throws(() => createClientOrderHoursController({}), /Service heures/);
const entries = [];
const service = {
  resolveOrderId: () => 7, createHourEntry: (v) => entries.push(v), deleteHourEntry() {},
  updatePlannedHours() {}, listHoursForOrder: () => [], sumHoursSince: () => 0
};
const controller = createClientOrderHoursController({
  hoursService: service, findOrderByFolder: () => ({ id: 7, planned_hours: 2 }), safeName: String,
  safeSegment: String, parseDuration: () => ({ minutesTotal: 75 }), allowedCategories: ['pose'],
  formatMinutes: String, formatDurationLabel: String,
  pageTemplate: (_req, _title, html) => html, renderHoursView: () => 'HTML',
  escapeHtml: String, clientPageIcon: () => '', pcFolderIcon: () => '', isoDate: () => '2026-07-26'
});
let redirect;
controller.createOrderHourEntry({ body: { client: 'C', order: 'O', work_date: '2026-07-26', category: 'pose' } },
  { redirect: (url) => { redirect = url; } });
assert.strictEqual(entries[0].minutesTotal, 75);
assert(redirect.endsWith('/Heure%20chantier'));
console.log('OK - contrôleur heures commandes');
