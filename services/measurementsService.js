'use strict';

function createMeasurementsService(d = {}) {
  const { db, parseOptionalId, normalizeMeasurementLink, preserveTechnicalSketches,
    formatDateLabel, isoDate, measurementRoutes, removeStoragePathIfExists,
    sketchPath, safeResolveInside, measurementPhotoDir, now = () => new Date().toISOString() } = d;

  const listMeasurements = () => db.prepare('SELECT * FROM measurements ORDER BY updated_at DESC, id DESC LIMIT 12').all();
  const getMeasurementById = (id) => db.prepare('SELECT * FROM measurements WHERE id = ?').get(id);
  const getQuote = (id) => db.prepare('SELECT id, title, client_name FROM quotes WHERE id = ?').get(id);

  function linkOptions() {
    const quotes = db.prepare('SELECT id, title, client_name, status FROM quotes ORDER BY id DESC').all();
    const clientOrders = db.prepare('SELECT id, name, description, status FROM client_orders ORDER BY id DESC').all();
    return { quotes, clientOrders };
  }

  function quoteContext(quoteId) {
    return db.prepare('SELECT id, title, client_name FROM quotes WHERE id = ?').get(quoteId);
  }

  function saveMeasurement(input) {
    let body = input || {};
    const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const { quoteId, orderId } = normalizeMeasurementLink(body.quote_id ?? fields.quote_id, body.client_order_id ?? fields.client_order_id);
    const id = parseOptionalId(body.server_id || body.id);
    const moduleName = String(body.module || body.moduleLabel || fields.module || 'Prise de cote').trim();
    const recordName = String(body.recordName || '').trim() || `Fiche ${moduleName.toLowerCase()} ${formatDateLabel(isoDate())}`;
    const client = String(fields.client || '').trim() || null;
    const chantier = String(fields.chantier || '').trim() || null;
    const measureDate = String(fields.date || '').trim() || null;
    const timestamp = now();
    if (id && getMeasurementById(id)) {
      body = preserveTechnicalSketches(body, id);
      db.prepare(`UPDATE measurements SET module = ?, record_name = ?, client = ?, chantier = ?, measure_date = ?, quote_id = ?, client_order_id = ?, data = ?, updated_at = ? WHERE id = ?`)
        .run(moduleName, recordName, client, chantier, measureDate, quoteId, orderId, JSON.stringify(body), timestamp, id);
      return id;
    }
    const byName = db.prepare('SELECT id FROM measurements WHERE module = ? AND record_name = ?').get(moduleName, recordName);
    if (byName) {
      body = preserveTechnicalSketches(body, byName.id);
      db.prepare('UPDATE measurements SET client = ?, chantier = ?, measure_date = ?, quote_id = ?, client_order_id = ?, data = ?, updated_at = ? WHERE id = ?')
        .run(client, chantier, measureDate, quoteId, orderId, JSON.stringify(body), timestamp, byName.id);
      return byName.id;
    }
    return db.prepare(`INSERT INTO measurements (module, record_name, client, chantier, measure_date, quote_id, client_order_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(moduleName, recordName, client, chantier, measureDate, quoteId, orderId, JSON.stringify(body), timestamp, timestamp).lastInsertRowid;
  }

  function editorPayload(row) {
    const quoteId = parseOptionalId(row.quote_id);
    const quote = quoteId ? getQuote(quoteId) : null;
    return { measurement: measurementRoutes.buildMeasurementEditorPayload(row, quote), returnUrl: quoteId ? `/devis/${quoteId}#quote-section-measurements` : '/outils/prises-cotes', quote };
  }

  function deleteMeasurement(id) {
    removeStoragePathIfExists(sketchPath('measurements', id));
    removeStoragePathIfExists(safeResolveInside(measurementPhotoDir, String(id)));
    return db.transaction((measurementId) => {
      db.prepare('DELETE FROM measurement_photo_files WHERE measurement_id = ?').run(measurementId);
      return db.prepare('DELETE FROM measurements WHERE id = ?').run(measurementId);
    })(id);
  }

  return { listMeasurements, getMeasurementById, getQuote, linkOptions, quoteContext, saveMeasurement, editorPayload, deleteMeasurement };
}
module.exports = { createMeasurementsService };
