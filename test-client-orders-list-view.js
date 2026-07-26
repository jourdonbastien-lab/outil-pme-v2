'use strict';
const assert = require('assert');
const { renderClientOrdersListView } = require('./views/clientOrdersListView');
const base = {
  orders: [], isAtelier: false, totalAmount: 0, formatEuroFr: () => '0,00 €',
  clientPageIcon: () => '<svg></svg>', poseAgendaFlash: '', orderUpdateFlash: '', orderUpdateStatus: '',
  escapeHtml: String, preClient: '', chantierStatusOptions: () => '<option>À préparer</option>',
  quoteOptions: () => '<option>Aucun devis lié</option>', pcFoldersOptions: '', cards: '<p class="empty">Aucune commande client.</p>'
};
let html = renderClientOrdersListView(base);
assert(html.includes('<h1>Commandes clients</h1>'));
assert(html.includes('method="POST" action="/orders/client"'));
assert(html.includes('id="new-client-order"'));
assert(html.includes('Aucune commande client.'));
html = renderClientOrdersListView({ ...base, orders: [{ id: 1 }, { id: 2 }], cards: '<article class="order-card"></article>' });
assert(html.includes('2 commandes en cours'));
assert(html.includes('modern-client-orders-grid'));
console.log('OK - vue liste commandes clients');
