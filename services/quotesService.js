'use strict';

function createQuotesService(dependencies) {
  const {
    db,
    clientsRoot,
    listDirectoryEntries,
    roundAmount,
    normalizeVatRate,
    normalizeQuoteStatus,
    formatDateLabel,
    logError = console.error
  } = dependencies || {};
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base devis manquante.');
  if (!clientsRoot) throw new TypeError('Dossier clients manquant.');
  if (typeof listDirectoryEntries !== 'function') throw new TypeError('Lecture dossiers clients manquante.');
  if (typeof roundAmount !== 'function') throw new TypeError('Arrondi montants manquant.');
  if (typeof normalizeVatRate !== 'function') throw new TypeError('Normalisation TVA manquante.');
  if (typeof normalizeQuoteStatus !== 'function') throw new TypeError('Normalisation statut devis manquante.');
  if (typeof formatDateLabel !== 'function') throw new TypeError('Formatage date devis manquant.');

  function listQuotes() {
    const quotes = db.prepare('SELECT * FROM quotes ORDER BY id DESC').all();
    const quoteTotals = db
      .prepare(`
        SELECT quote_id, COALESCE(SUM(total), 0) AS total_ht
        FROM quote_lines
        GROUP BY quote_id
      `)
      .all()
      .reduce((map, row) => {
        map.set(Number(row.quote_id), Number(row.total_ht || 0));
        return map;
      }, new Map());

    return quotes.map((quote) => {
      const totalHt = quoteTotals.get(Number(quote.id)) || 0;
      const vatAmount = roundAmount(totalHt * (normalizeVatRate(quote.vat_rate) / 100));
      const totalTtc = roundAmount(totalHt + vatAmount);
      return {
        ...quote,
        displayTitle: quote.title || 'Sans titre',
        displayClientName: quote.client_name || 'Client non renseigné',
        displayDate: formatDateLabel(quote.created_at),
        normalizedStatus: normalizeQuoteStatus(quote.status),
        totalHt,
        totalTtc
      };
    });
  }

  function getQuoteCreationData() {
    let databaseClients = [];
    try {
      databaseClients = db
        .prepare("SELECT name FROM clients WHERE name IS NOT NULL AND TRIM(name) != '' ORDER BY name COLLATE NOCASE")
        .all()
        .map((row) => String(row.name).trim());
    } catch (error) {
      logError('Erreur lecture clients DB:', error);
    }

    let folderClients = [];
    try {
      folderClients = listDirectoryEntries(clientsRoot)
        .filter((entry) => entry.isDirectory())
        .map((entry) => String(entry.name).trim())
        .filter(Boolean);
    } catch (error) {
      logError('Erreur lecture clients PC:', error);
    }

    const seen = new Set();
    const clients = [...databaseClients, ...folderClients]
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

    return { clients };
  }

  function createQuote(input) {
    const info = db.prepare(`
      INSERT INTO quotes
      (title, client_name, client_email, client_phone, client_address, status, vat_rate, created_at)
      VALUES (?, ?, ?, ?, ?, 'Brouillon', 20, ?)
    `).run(
      input.title,
      input.clientName,
      input.clientEmail || null,
      input.clientPhone || null,
      input.clientAddress || null,
      `${input.quoteDate}T00:00:00.000Z`
    );
    return info.lastInsertRowid;
  }

  return { listQuotes, getQuoteCreationData, createQuote };
}

module.exports = { createQuotesService };
