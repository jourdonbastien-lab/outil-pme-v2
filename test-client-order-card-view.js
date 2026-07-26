'use strict';
const assert = require('assert');
const fs = require('fs');
const { renderClientOrderCard } = require('./views/clientOrderCardView');
const card = {
  order: { id: 7, name: '<Client>', description: 'Portail', chantier_progress: 50 },
  statusLabel: 'En cours', chantierStatus: 'En pose', chantierStatusClass: 'chantier-status-2',
  progress: 75, actualHours: 4.5, plannedHours: 4, isOverHours: true,
  plannedEndDate: '2026-07-30', isLate: true, isPoseStatus: true, poseEvent: null,
  poseAgendaTitle: 'Pose - Client - Portail', folderUrl: '/pc-folders/Client/Portail',
  hoursUrl: '/pc-folders/Client/Portail/Heure%20chantier', dateLabel: '2026-07-20',
  amountHtLabel: '1 000 € HT', invoicedHtLabel: '200 €', remainingHtLabel: '800 €',
  vatLabel: 'TVA : 20 %', amountTtcLabel: '1 200 € TTC', editPriceValue: '1000.00',
  vatRate: 20
};
const context = {
  isWorkshop: false, availableQuotes: [], escapeHtml: (v) => String(v).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  clientPageIcon: () => '<svg></svg>', pcFolderIcon: () => '<svg></svg>',
  chantierStatusOptions: () => '<option>En pose</option>'
};
let html = renderClientOrderCard(card, context);
assert(html.includes('modern-client-order-card'));
assert(html.includes('action="/orders/client/7/add-agenda-pose"'));
assert(html.includes('action="/orders/client/7/update"'));
assert(html.includes('action="/orders/client/done"'));
assert(html.includes('Montant commande HT') && html.includes('Retard'));
assert(html.includes('&lt;Client&gt;'));
html = renderClientOrderCard(card, { ...context, isWorkshop: true });
assert(!html.includes('Montant commande HT') && !html.includes('name="price"'));
const source = fs.readFileSync('views/clientOrderCardView.js', 'utf8');
assert(!/db\.prepare|fs\.|req\.|res\./.test(source));
console.log('OK - vue carte commande client');
