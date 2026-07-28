'use strict';

function businessError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function createQuoteLinesService(dependencies) {
  const { db, roundAmount, calculateSheetWeight, detectLineCostCategory, now = () => new Date().toISOString() } = dependencies || {};
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base lignes devis manquante.');
  if (typeof roundAmount !== 'function') throw new TypeError('Arrondi lignes devis manquant.');

  function getQuoteLineById(id) {
    return db.prepare('SELECT * FROM quote_lines WHERE id = ?').get(id);
  }

  function createQuoteLine(line) {
    const total = roundAmount(line.qty * line.unitPrice);
    const laborUnit = ['h', 'heure', 'heures'].includes(line.unit.toLowerCase());
    const result = db.prepare(`
      INSERT INTO quote_lines (quote_id, category, label, qty, unit, unit_price, total, cost_unit, cost_total, margin_pct, coefficient, hours, hourly_cost, cost_category, cost_source, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      line.quoteId, line.category || null, line.label, line.qty, line.unit, line.unitPrice, total,
      line.costUnit, line.costTotal, line.marginPct, line.coefficient,
      line.hours ?? (laborUnit ? line.qty : null),
      line.hourlyCost ?? (laborUnit ? line.costUnit : null),
      line.costCategory || null, line.costSource || null, 0, now()
    );
    return { id: result.lastInsertRowid, quoteId: line.quoteId };
  }

  function createMaterialQuoteLine(input) {
    const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(input.materialId);
    if (!material) throw businessError(404, 'Matière introuvable');
    const type = String(material.type || '');
    const number = (value) => Number(value || 0) || 0;
    let label = material.name || 'Matière';
    let qty = 0;
    let unit = material.unit || '';
    const unitPrice = Number(material.price || 0);

    if (type === 'tube') {
      const length = number(input.lenM);
      if (length <= 0) throw businessError(400, 'Longueur (m) requise');
      qty = length;
      unit = 'm';
    } else if (type === 'beam') {
      const length = number(input.lenM);
      const kgPerMeter = number(material.kg_per_m);
      if (length <= 0) throw businessError(400, 'Longueur (m) requise');
      if (kgPerMeter <= 0) throw businessError(400, 'kg/m manquant dans le répertoire');
      qty = length * kgPerMeter;
      unit = 'kg';
      label = `${material.name} (${length.toFixed(2)} m)`;
    } else if (type === 'sheet') {
      const thickness = number(input.thMm);
      const width = number(input.wMm);
      const length = number(input.lMm);
      const density = number(material.density) || 7.85;
      if (thickness <= 0 || width <= 0 || length <= 0) throw businessError(400, 'Dimensions tôle requises');
      qty = calculateSheetWeight({ th_mm: thickness, w_mm: width, l_mm: length, density });
      unit = 'kg';
      label = `${material.name} ${thickness}mm (${width}x${length})`;
    } else {
      throw businessError(400, 'Type matière invalide (tube/beam/sheet)');
    }
    if (qty <= 0 || unitPrice <= 0) throw businessError(400, 'Quantité ou prix invalide');

    const total = roundAmount(qty * unitPrice);
    const result = db.prepare(`
      INSERT INTO quote_lines (quote_id, category, label, qty, unit, unit_price, total, cost_unit, cost_category, cost_source, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.quoteId, input.category || null, label, qty, unit, unitPrice, total, unitPrice,
      detectLineCostCategory({ category: input.category, label }), 'répertoire matières', 0, now()
    );
    return { id: result.lastInsertRowid, quoteId: input.quoteId };
  }

  function updateQuoteLine(id, line) {
    db.prepare(`
      UPDATE quote_lines
      SET label = ?, qty = ?, unit_price = ?, total = ?, cost_unit = ?, cost_total = ?,
          margin_pct = ?, coefficient = ?, hours = ?, hourly_cost = ?, cost_category = ?, cost_source = ?
      WHERE id = ?
    `).run(
      line.label, line.qty, line.unitPrice, line.qty * line.unitPrice, line.costUnit, line.costTotal,
      line.marginPct, line.coefficient, line.hours, line.hourlyCost, line.costCategory || null,
      [line.costUnit, line.costTotal, line.marginPct, line.coefficient, line.hours, line.hourlyCost]
        .every((value) => value === null) ? null : 'modification de la ligne',
      id
    );
  }

  function deleteQuoteLine(id, quoteId) {
    return db.prepare('DELETE FROM quote_lines WHERE id = ? AND quote_id = ?').run(id, quoteId);
  }

  return { getQuoteLineById, createQuoteLine, createMaterialQuoteLine, updateQuoteLine, deleteQuoteLine };
}

module.exports = { createQuoteLinesService };
