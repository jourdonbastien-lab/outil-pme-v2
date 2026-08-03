'use strict';

function createClientOrderProfitabilityService(dependencies = {}) {
  const {
    db, projectProfitability, clientOrderCostLines, safeName, clientOrderFolderName,
    getClientOrderFinancialSnapshot, createDate = () => new Date()
  } = dependencies;

  function parseJsonObject(value, fallback = {}) {
    try {
      const parsed = JSON.parse(String(value || ''));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function getProjectForecast(clientOrderId) {
    const row = db.prepare(`
      SELECT * FROM project_profitability_forecasts
      WHERE client_order_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(clientOrderId);
    if (!row) return null;
    const snapshot = parseJsonObject(row.snapshot_json, {});
    if (Object.keys(snapshot).length) return { ...snapshot, forecastId: row.id };
    return {
      forecastId: row.id,
      quoteId: row.quote_id,
      totalHT: Number(row.total_ht || 0),
      breakdown: {
        material: Number(row.material_cost || 0), subcontracting: Number(row.subcontracting_cost || 0),
        galvanizing: Number(row.galvanizing_cost || 0), powderCoating: Number(row.powder_coating_cost || 0),
        motorization: Number(row.motorization_cost || 0), accessories: Number(row.accessories_cost || 0),
        transport: Number(row.transport_cost || 0), consumables: Number(row.consumables_cost || 0),
        rental: Number(row.rental_cost || 0)
      },
      hours: { study: Number(row.study_hours || 0), workshop: Number(row.workshop_hours || 0), installation: Number(row.installation_hours || 0) },
      hourlyCost: Number(row.hourly_cost || projectProfitability.PROFITABILITY_RULES.defaultHourlyCost),
      forecastCost: Number(row.forecast_cost || 0), margin: Number(row.forecast_margin || 0),
      marginOnSale: row.forecast_margin_rate === null ? null : Number(row.forecast_margin_rate), category: row.work_category || 'autre'
    };
  }

  function saveProjectForecast(quote, lines, clientOrderId) {
    const snapshot = projectProfitability.buildForecastSnapshot(quote, lines);
    db.prepare(`
      INSERT INTO project_profitability_forecasts
        (quote_id, client_order_id, total_ht, material_cost, subcontracting_cost, galvanizing_cost,
         powder_coating_cost, motorization_cost, accessories_cost, transport_cost, consumables_cost,
         rental_cost, study_hours, workshop_hours, installation_hours, hourly_cost, forecast_cost,
         forecast_margin, forecast_margin_rate, work_category, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      quote.id, clientOrderId, snapshot.totalHT, snapshot.breakdown.material, snapshot.breakdown.subcontracting,
      snapshot.breakdown.galvanizing, snapshot.breakdown.powderCoating, snapshot.breakdown.motorization,
      snapshot.breakdown.accessories, snapshot.breakdown.transport, snapshot.breakdown.consumables,
      snapshot.breakdown.rental, snapshot.hours.study, snapshot.hours.workshop, snapshot.hours.installation,
      snapshot.hourlyCost, snapshot.forecastCost, snapshot.margin, snapshot.marginOnSale, snapshot.category,
      JSON.stringify(snapshot), createDate().toISOString()
    );
    return snapshot;
  }

  function getOrderHours(order) {
    return db.prepare(`
      SELECT * FROM chantier_hours
      WHERE client_order_id = ? OR (client_order_id IS NULL AND client = ? AND order_name = ?)
    `).all(order.id, safeName(order.name), safeName(order.description || `Commande_${order.id}`));
  }

  function getActualCosts(clientOrderId) {
    return db.prepare('SELECT * FROM project_actual_costs WHERE client_order_id = ? ORDER BY cost_date DESC, id DESC').all(clientOrderId);
  }

  function getOrderInvoices(clientOrderId) {
    return db.prepare('SELECT * FROM client_order_invoices WHERE client_order_id = ? ORDER BY invoice_date DESC, id DESC').all(clientOrderId);
  }

  function getOrderProfitability(order) {
    const forecast = getProjectForecast(order.id);
    const hours = getOrderHours(order);
    const costs = getActualCosts(order.id);
    const invoices = getOrderInvoices(order.id);
    return { forecast, hours, costs, invoices, actual: projectProfitability.calculateActual({ order, forecast, hours, costs, invoices }) };
  }

  function importMissingQuoteCostLines(clientOrderId, quoteId) {
    const orderId = Number(clientOrderId || 0);
    const linkedQuoteId = Number(quoteId || 0);
    if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(linkedQuoteId) || linkedQuoteId <= 0) {
      return { imported: 0, available: 0 };
    }
    const quoteLines = db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position, id').all(linkedQuoteId);
    const excluded = new Set(db.prepare('SELECT source_quote_line_id FROM client_order_cost_line_exclusions WHERE client_order_id = ?').all(orderId).map((row) => Number(row.source_quote_line_id)));
    const insert = db.prepare(`
      INSERT OR IGNORE INTO client_order_cost_lines
        (client_order_id, line_type, category, designation, quantity, unit, unit_cost_ht, unit_sale_ht,
         planned_minutes, hourly_cost_ht, hourly_sale_ht, notes, source_type, source_quote_line_id,
         sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quote', ?, ?, ?, ?)
    `);
    let imported = 0;
    db.transaction(() => {
      quoteLines.forEach((quoteLine, index) => {
        if (excluded.has(Number(quoteLine.id))) return;
        const line = clientOrderCostLines.quoteLineToCostLine(quoteLine);
        const note = line.incomplete_cost ? 'Coût à compléter : le devis ne contient pas de coût d’achat fiable.' : null;
        const result = insert.run(orderId, line.line_type, line.category, line.designation, line.quantity, line.unit,
          line.unit_cost_ht, line.unit_sale_ht, line.planned_minutes, line.hourly_cost_ht, line.hourly_sale_ht,
          note, quoteLine.id, Number(quoteLine.position || index), createDate().toISOString(), createDate().toISOString());
        imported += Number(result.changes || 0);
      });
    })();
    return { imported, available: quoteLines.length };
  }

  function getOrderForecastData(order) {
    const lines = db.prepare('SELECT * FROM client_order_cost_lines WHERE client_order_id = ? ORDER BY sort_order, id').all(order.id);
    const actualMinutes = Number(db.prepare(`
      SELECT COALESCE(SUM(minutes_total), 0) AS total FROM chantier_hours
      WHERE client_order_id = ? OR (client_order_id IS NULL AND client = ? AND order_name = ?)
    `).get(order.id, safeName(order.name), clientOrderFolderName(order))?.total || 0);
    const actualMaterialRows = db.prepare("SELECT amount_ht FROM project_actual_costs WHERE client_order_id = ? AND cost_type = 'material'").all(order.id);
    const actualMaterialCost = actualMaterialRows.length ? actualMaterialRows.reduce((sum, row) => sum + Number(row.amount_ht || 0), 0) : null;
    const quoteLines = order.quote_id
      ? db.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position, id').all(order.quote_id)
      : [];
    return { lines, quoteLines, summary: clientOrderCostLines.summarize(lines, order.price, actualMinutes, actualMaterialCost) };
  }

  function getFinancialSnapshot(orderId) {
    return getClientOrderFinancialSnapshot(db, orderId);
  }

  function clientOrderDetailRedirect(order) {
    return `/orders/client/${order.id}/profitability#order-budget`;
  }

  function clientOrderFolderUrl(order) {
    return `/pc-folders/${encodeURIComponent(safeName(order.name))}/${encodeURIComponent(clientOrderFolderName(order))}`;
  }

  return {
    getOrderProfitability, getProjectForecast, saveProjectForecast,
    getActualCosts, getOrderHours, getOrderInvoices, getOrderForecastData,
    importMissingQuoteCostLines, getFinancialSnapshot,
    clientOrderDetailRedirect, clientOrderFolderUrl
  };
}

module.exports = { createClientOrderProfitabilityService };
