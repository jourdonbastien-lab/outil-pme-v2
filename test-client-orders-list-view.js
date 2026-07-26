'use strict';
const assert = require('assert');
const { renderClientOrdersListView } = require('./views/clientOrdersListView');
const base = {
  orders: [], isAtelier: false, totalAmount: 0, formatEuroFr: () => '0,00 €',
  clientPageIcon: () => '<svg></svg>', poseAgendaFlash: '', orderUpdateFlash: '', orderUpdateStatus: '',
  escapeHtml: String, preClient: '', chantierStatusOptions: () => '<option>À préparer</option>',
  availableQuotes: [], clientFolders: [], pcFolderIcon: () => '<svg></svg>'
};
let html = renderClientOrdersListView(base);
assert(html.includes('<h1>Commandes clients</h1>'));
assert(html.includes('method="POST" action="/orders/client"'));
assert(html.includes('id="new-client-order"'));
assert(html.includes('Aucune commande client.'));
const card = {
  order: { id: 1, name: 'Client', description: 'Portail' }, statusLabel: 'En cours',
  chantierStatus: 'À préparer', chantierStatusClass: 'chantier-status-0', progress: 0,
  actualHours: 0, plannedHours: 0, isOverHours: false, plannedEndDate: '', isLate: false,
  isPoseStatus: false, poseEvent: null, poseAgendaTitle: '', folderUrl: '/folder', hoursUrl: '/hours',
  dateLabel: '', amountHtLabel: 'Non renseigné', invoicedHtLabel: '0 €', remainingHtLabel: '0 €',
  vatLabel: 'TVA non renseignée', vatRate: null, amountTtcLabel: 'TTC non calculé', editPriceValue: ''
};
html = renderClientOrdersListView({ ...base, orders: [card, { ...card, order: { ...card.order, id: 2 } }] });
assert(html.includes('2 commandes en cours'));
assert(html.includes('modern-client-orders-grid'));
console.log('OK - vue liste commandes clients');
