'use strict';
const assert = require('assert');
const { createQuotesService } = require('./services/quotesService');

function makeDb({ quotes = [], totals = [], clients = [], failClients = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        all() {
          calls.push(['all', sql]);
          if (/FROM quotes/.test(sql)) return quotes;
          if (/FROM quote_lines/.test(sql)) return totals;
          if (/FROM clients/.test(sql)) {
            if (failClients) throw new Error('clients');
            return clients;
          }
          return [];
        },
        run(...values) {
          calls.push(['run', sql, values]);
          return { lastInsertRowid: 42 };
        }
      };
    }
  };
}
function create(options = {}) {
  const errors = [];
  const db = options.db || makeDb(options);
  const service = createQuotesService({
    db,
    clientsRoot: '/clients',
    listDirectoryEntries() {
      if (options.failFolders) throw new Error('folders');
      return options.entries || [];
    },
    roundAmount: (value) => Math.round(value * 100) / 100,
    normalizeVatRate: (value) => Number(value) || 20,
    normalizeQuoteStatus: (value) => value || 'Brouillon',
    formatDateLabel: (value) => `DATE:${value}`,
    logError(...args) { errors.push(args); }
  });
  return { service, db, errors };
}
assert.throws(() => createQuotesService({}), /Base devis/);
{
  const { service } = create();
  assert.deepStrictEqual(service.listQuotes(), []);
}
{
  const { service } = create({
    quotes: [
      { id: 2, title: null, client_name: null, status: null, vat_rate: 20, created_at: '2026-07-02' },
      { id: 1, title: 'Portail', client_name: 'Dupont', status: 'Envoyé', vat_rate: 10, created_at: '2026-07-01' }
    ],
    totals: [{ quote_id: 2, total_ht: 100 }, { quote_id: 1, total_ht: 50 }]
  });
  const quotes = service.listQuotes();
  assert.deepStrictEqual(quotes.map((quote) => quote.id), [2, 1]);
  assert.strictEqual(quotes[0].displayTitle, 'Sans titre');
  assert.strictEqual(quotes[0].displayClientName, 'Client non renseigné');
  assert.strictEqual(quotes[0].totalTtc, 120);
  assert.strictEqual(quotes[1].totalTtc, 55);
  assert.strictEqual(quotes[1].displayDate, 'DATE:2026-07-01');
}
{
  const entries = [
    { name: 'DUPONT', isDirectory: () => true },
    { name: 'Société André', isDirectory: () => true },
    { name: 'file', isDirectory: () => false }
  ];
  const { service } = create({ clients: [{ name: 'Dupont' }, { name: 'L’Atelier' }], entries });
  assert.deepStrictEqual(service.getQuoteCreationData().clients, ['Dupont', 'L’Atelier', 'Société André']);
}
{
  const state = create({ failClients: true, failFolders: true });
  assert.deepStrictEqual(state.service.getQuoteCreationData(), { clients: [] });
  assert.strictEqual(state.errors.length, 2);
  assert.strictEqual(state.errors[0][0], 'Erreur lecture clients DB:');
  assert.strictEqual(state.errors[1][0], 'Erreur lecture clients PC:');
}
{
  const { service, db } = create();
  const id = service.createQuote({
    title: 'Portail',
    clientName: 'Dupont',
    clientEmail: '',
    clientPhone: '06',
    clientAddress: '',
    quoteDate: '2026-07-27'
  });
  assert.strictEqual(id, 42);
  const insert = db.calls.find((call) => call[0] === 'run');
  assert(/INSERT INTO quotes/.test(insert[1]));
  assert(/'Brouillon', 20/.test(insert[1]));
  assert.deepStrictEqual(insert[2], ['Portail', 'Dupont', null, '06', null, '2026-07-27T00:00:00.000Z']);
  assert(!db.calls.some((call) => /quote_lines|quote_photos/.test(call[1])));
}
console.log('OK - service liste et création devis');
