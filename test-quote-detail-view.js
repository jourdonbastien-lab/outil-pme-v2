'use strict';
const assert = require('assert');
const { renderQuoteDetailView } = require('./views/quoteDetailView');
const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const data = {
  id: 7,
  quote: { title: 'Portail <Nord>', client_name: 'Léa & Fils', created_at: '2026-08-02', status: 'Brouillon', notes: 'Note <test>' },
  photos: ['photo été.jpg', 'plan.pdf'], materials: [],
  lines: [{ id: 2, category: 'Matière', label: 'Acier <brut>', qty: 1, unit: 'u', unit_price: 100, total: 100 }],
  total: 100, acceptDisabled: false, marginPct: 0, totalWithMargin: 100,
  profitabilityContext: {}, profitabilitySaved: null,
  profitabilityForecast: { status: 'incomplete', critical: false, reliability: 'incomplete', totalHT: 100, totalCost: 0,
    materialCost: 0, subcontractingCost: 0, laborCost: 0, otherDetectedCost: 0, adjustmentsCost: 0,
    margin: null, marginOnCost: null, marginOnSale: null, missingSaleHT: 100, minimumPrice: 0, targetPrice: 0,
    comfortablePrice: 0, counts: { missing: 1, complete: 0 }, lines: [] },
  vatRate: 20, tva: 20, totalTtc: 120, quoteStatus: 'Brouillon', linkedMeasurements: []
};
const deps = {
  escHtml: escapeHtml, clientPageIcon: () => '<svg></svg>', formatDateLabel: (v) => v,
  quoteStatusClass: () => 'status-draft', quoteStatusOptions: () => '<option>Brouillon</option>',
  quoteVatOptions: () => '<option>20</option>', formatEuroFr: (v) => `${Number(v || 0).toFixed(2)} €`,
  projectProfitability: { LINE_COST_CATEGORIES: ['matière acier'] },
  renderQuoteMeasurementCreationLinks: () => '<a>Créer prise</a>', renderMeasurementCards: () => '<div>Mesures</div>',
  renderSketchBlock: () => '<div data-sketchpad></div>'
};
const html = renderQuoteDetailView(data, deps);
for (const marker of [
  'quote-work-page', 'quote-ai-review-card', 'quote-section-add-line', 'quickMatForm', 'prestForm',
  'quote-section-measurements', 'quote-section-notes', 'quote-section-photos', 'quote-section-sketch',
  '/devis/7/status', '/devis/7/accept', '/devis/7/delete', '/devis/7/vat', '/devis/7/notes',
  '/devis/7/photo', '/devis/line', '/devis/line/delete', '/devis/line/2/edit',
  '/api/devis/' + "' + quoteId + '" + '/profitability/analyze', '/sketchpad.js', 'window.initSketchPad'
]) assert(html.includes(marker), marker);
assert(html.includes('Portail &lt;Nord&gt;'));
assert(html.includes('Léa &amp; Fils'));
assert(html.includes('Acier &lt;brut&gt;'));
assert(html.includes('/quote-photos/7/photo%20%C3%A9t%C3%A9.jpg'));
assert(html.includes('<svg'));
console.log('OK - vue détail devis');
