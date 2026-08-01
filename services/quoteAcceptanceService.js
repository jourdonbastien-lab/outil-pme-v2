'use strict';

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createQuoteAcceptanceService(dependencies = {}) {
  const {
    db, fs, path, clientsRoot, safeName, uniqueFolder, ensureDir, ensureStandardSubfolders,
    round2, isoDate, parseOptionalVatRate, detectWorkCategory, saveProjectForecast,
    importMissingQuoteCostLines, createDate = () => new Date(), log = console.log
  } = dependencies;
  if (!db || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
    throw new TypeError('Base acceptation devis manquante.');
  }
  for (const [name, dependency] of Object.entries({
    safeName, uniqueFolder, ensureDir, ensureStandardSubfolders, round2, isoDate,
    parseOptionalVatRate, detectWorkCategory, saveProjectForecast, importMissingQuoteCostLines
  })) {
    if (typeof dependency !== 'function') throw new TypeError(`Dépendance acceptation devis manquante : ${name}.`);
  }
  if (!fs || typeof fs.writeFileSync !== 'function') throw new TypeError('Accès fichiers acceptation devis manquant.');
  if (!path || typeof path.join !== 'function') throw new TypeError('Gestion chemins acceptation devis manquante.');
  if (!clientsRoot) throw new TypeError('Racine clients acceptation devis manquante.');

  function acceptQuote(quoteId) {
    const lines = db.prepare(`
      SELECT *
      FROM quote_lines
      WHERE quote_id = ?
    `).all(quoteId);
    log('LIGNES DU DEVIS :');
    log(JSON.stringify(lines, null, 2));

    let plannedHours = 0;
    for (const line of lines) {
      const label = String(line.label || '').toLowerCase();
      if (label.includes('main')) plannedHours += Number(line.qty || 0);
    }

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
    if (!quote) throw createHttpError(404, 'Devis introuvable');

    const structuredPlannedHours = Number(quote.heures_etude || 0)
      + Number(quote.heures_atelier || 0)
      + Number(quote.heures_pose || 0);
    if (structuredPlannedHours > 0) plannedHours = structuredPlannedHours;

    const clientName = String(quote.client_name || '').trim();
    if (!clientName) throw createHttpError(400, 'Client manquant sur le devis');
    const orderTitle = String(quote.title || '').trim();
    if (!orderTitle) throw createHttpError(400, 'Titre du devis manquant');
    const safeClient = safeName(clientName);

    const totalLines = db.prepare('SELECT total FROM quote_lines WHERE quote_id = ?').all(quoteId);
    const total = totalLines.reduce((sum, line) => sum + (Number(line.total) || 0), 0);
    const marginPct = Number(quote.margin_pct ?? 0);
    const totalWithMargin = round2(total * (1 + marginPct / 100));

    const existing = db.prepare('SELECT id FROM clients WHERE LOWER(name) = LOWER(?)').get(clientName);
    if (!existing) {
      db.prepare(`
        INSERT INTO clients (name, email, phone, address, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        clientName,
        quote.client_email || null,
        quote.client_phone || null,
        quote.client_address || null,
        createDate().toISOString()
      );
    }

    const clientDir = path.join(clientsRoot, safeClient);
    ensureDir(clientDir);
    const safeOrder = uniqueFolder(clientDir, safeName(orderTitle));
    const orderDir = path.join(clientDir, safeOrder);
    ensureDir(orderDir);
    ensureStandardSubfolders(orderDir);
    const devisDir = path.join(orderDir, 'Devis');

    let descriptif = '';
    descriptif += `CLIENT : ${clientName}\n`;
    descriptif += `PROJET : ${orderTitle}\n`;
    descriptif += `DATE : ${createDate().toLocaleDateString('fr-FR')}\n\n`;
    descriptif += 'DESCRIPTIF DU DEVIS\n';
    descriptif += '===================\n\n';
    for (const line of lines) {
      descriptif += `${line.qty || 1} x ${line.label || ''}`;
      if (line.unit_price) descriptif += ` - ${line.unit_price} €`;
      descriptif += '\n';
    }
    descriptif += '\n';
    descriptif += `TOTAL : ${totalWithMargin.toFixed(2)} €\n`;
    fs.writeFileSync(path.join(devisDir, 'Descriptif devis.txt'), descriptif, 'utf8');

    log('HEURES PREVUES =', plannedHours);
    log('quoteId =', quoteId);
    log('plannedHours =', plannedHours);
    log('clientName =', clientName);
    log('orderTitle =', orderTitle);

    const createOrderWithForecast = db.transaction(() => {
      const orderInsert = db.prepare(`
        INSERT INTO client_orders
        (
          name, description, date, price, vat_rate, planned_hours, quote_id,
          work_category, status, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'En cours', ?)
      `).run(
        clientName, orderTitle, isoDate(), totalWithMargin, parseOptionalVatRate(quote.vat_rate),
        plannedHours, quoteId, detectWorkCategory(quote, lines), createDate().toISOString()
      );
      const clientOrderId = Number(orderInsert.lastInsertRowid);
      saveProjectForecast({ ...quote, total_ht: totalWithMargin }, lines, clientOrderId);
      importMissingQuoteCostLines(clientOrderId, quoteId);
      db.prepare("UPDATE quotes SET status = 'Accepté' WHERE id = ?").run(quoteId);
      return clientOrderId;
    });
    const clientOrderId = createOrderWithForecast();
    return { clientOrderId, safeClient, safeOrder };
  }

  return { acceptQuote };
}

module.exports = { createQuoteAcceptanceService };
