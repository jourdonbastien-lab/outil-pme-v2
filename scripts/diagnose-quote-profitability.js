'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const profitability = require('../lib/projectProfitability');

const dbPath = path.resolve(process.env.OUTIL_PME_DB_PATH || path.join(__dirname, '..', 'storage', 'data', 'app.db'));
const db = new Database(dbPath, { readonly: true });
const requestedId = Number(process.argv[2] || 0);
const quote = requestedId > 0
  ? db.prepare('SELECT * FROM quotes WHERE id = ?').get(requestedId)
  : db.prepare('SELECT * FROM quotes ORDER BY id DESC LIMIT 1').get();

if (!quote) {
  console.error(`Aucun devis disponible dans ${dbPath}`);
  process.exitCode = 1;
} else {
  const columns = db.prepare('PRAGMA table_info(quote_lines)').all().map((column) => column.name);
  const lines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position, id').all(quote.id);
  const analysis = profitability.analyzeQuoteLines({ quote, lines });
  console.log(JSON.stringify({
    database: dbPath,
    quoteId: quote.id,
    quoteLineColumns: columns,
    rawLines: lines,
    detectedLines: analysis.lines.map((line) => ({
      id: line.id,
      label: line.label,
      purchaseUnitPrice: line.purchaseUnitPrice,
      purchaseTotal: line.purchaseTotal,
      saleUnitPrice: line.saleUnitPrice,
      saleTotal: line.saleTotal,
      quantity: line.quantity,
      marginInput: line.marginInput,
      coefficientInput: line.coefficientInput,
      detectedCost: line.detectedCost,
      costSource: line.costSource
    }))
  }, null, 2));
}
