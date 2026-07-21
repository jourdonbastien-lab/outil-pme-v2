'use strict';

function createClientOrderProfitabilityController(dependencies = {}) {
  const requiredFunctions = [
    'pageTemplate', 'escapeHtml', 'formatEuroFr', 'isoDate',
    'getClientOrderFinancialSnapshot', 'validateClientOrderCostLine',
    'clientOrderForecastData', 'projectProfitabilityForOrder',
    'renderOrderProfitabilityOverview', 'renderClientOrderForecastCard',
    'renderOrderHoursTracking', 'clientOrderFolderUrl',
    'clientOrderDetailRedirect', 'importMissingQuoteCostLines'
  ];
  if (!dependencies.db || typeof dependencies.db.prepare !== 'function') {
    throw new Error('createClientOrderProfitabilityController: db is required');
  }
  for (const name of requiredFunctions) {
    if (typeof dependencies[name] !== 'function') {
      throw new Error(`createClientOrderProfitabilityController: ${name} is required`);
    }
  }
  if (!Array.isArray(dependencies.actualCostTypes)) {
    throw new Error('createClientOrderProfitabilityController: actualCostTypes is required');
  }

  const {
    db, pageTemplate, escapeHtml, formatEuroFr, isoDate,
    getClientOrderFinancialSnapshot, validateClientOrderCostLine,
    clientOrderForecastData, projectProfitabilityForOrder,
    renderOrderProfitabilityOverview, renderClientOrderForecastCard,
    renderOrderHoursTracking, clientOrderFolderUrl,
    clientOrderDetailRedirect, importMissingQuoteCostLines, actualCostTypes
  } = dependencies;

  function requireClientOrderForCostLine(req, res) {
    const orderId = Number(req.params.orderId || 0);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      res.status(400).send('Identifiant de commande invalide');
      return null;
    }
    const order = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
    if (!order) {
      res.status(404).send('Commande introuvable');
      return null;
    }
    return order;
  }

  function showProfitability(req, res) {
    const orderId = Number(req.params.orderId || 0);
    if (!Number.isInteger(orderId) || orderId <= 0) return res.status(400).send('Identifiant de commande invalide');
    const order = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).send('Commande introuvable');
    const forecastData = clientOrderForecastData(order);
    forecastData.importStatus = req.query.importStatus;
    const realData = projectProfitabilityForOrder(order);
    const financialSnapshot = getClientOrderFinancialSnapshot(db, order.id);
    const content = `<div class="pc-modern-page order-profitability-page">
      <section class="pc-modern-hero order-profitability-hero">
        <div><span>Commande #${order.id}</span><h1>Budget de la commande</h1><p>${escapeHtml(order.name || 'Client')} · ${escapeHtml(order.description || `Commande_${order.id}`)}</p></div>
        <div class="pc-modern-actions"><span class="order-profitability-status">${escapeHtml(order.chantier_status || order.status || 'En cours')}</span><strong>${formatEuroFr(order.price)} HT</strong><a class="modern-cancel-link" href="${clientOrderFolderUrl(order)}">← Retour à la commande</a></div>
      </section>
      ${renderOrderProfitabilityOverview(order, financialSnapshot)}
      ${renderClientOrderForecastCard(order, forecastData, financialSnapshot)}
      ${renderOrderHoursTracking(order, realData, financialSnapshot)}
    </div>`;
    return res.send(pageTemplate(req, `Budget - ${order.description || order.id}`, content));
  }

  function getProfitabilityApi(req, res) {
    const orderId = Number(req.params.id || 0);
    const order = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable' });
    const result = projectProfitabilityForOrder(order);
    const financialSnapshot = getClientOrderFinancialSnapshot(db, orderId);
    return res.json({ success: true, orderId, forecast: result.forecast, actual: result.actual, costs: result.costs, financialSnapshot });
  }

  function addActualCost(req, res) {
    const orderId = Number(req.params.id || 0);
    const order = db.prepare('SELECT id FROM client_orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable' });
    const costType = String(req.body.cost_type || '').trim();
    const amountHT = Number(req.body.amount_ht);
    const source = String(req.body.source || 'manual').trim() === 'supplier_invoice' ? 'supplier_invoice' : 'manual';
    const supplierInvoiceId = req.body.supplier_invoice_id ? Number(req.body.supplier_invoice_id) : null;
    if (!actualCostTypes.includes(costType)) return res.status(400).json({ success: false, error: 'Type de coût invalide' });
    if (!Number.isFinite(amountHT) || amountHT < 0) return res.status(400).json({ success: false, error: 'Montant HT invalide' });
    if (supplierInvoiceId !== null && (!Number.isInteger(supplierInvoiceId) || supplierInvoiceId <= 0)) return res.status(400).json({ success: false, error: 'Facture fournisseur invalide' });
    try {
      const info = db.prepare(`
        INSERT INTO project_actual_costs
          (client_order_id, cost_type, description, amount_ht, supplier_invoice_id, source, cost_date, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, costType, String(req.body.description || '').trim() || null, amountHT, supplierInvoiceId,
        source, String(req.body.cost_date || '').trim() || isoDate(), new Date().toISOString(), req.session?.user?.id || null);
      return res.status(201).json({ success: true, id: Number(info.lastInsertRowid) });
    } catch (error) {
      if (String(error.message || '').includes('UNIQUE')) return res.status(409).json({ success: false, error: 'Cette facture fournisseur est déjà rattachée.' });
      console.error('Erreur ajout coût réel', error);
      return res.status(500).json({ success: false, error: 'Enregistrement impossible' });
    }
  }

  function deleteActualCost(req, res) {
    const orderId = Number(req.params.id || 0);
    const costId = Number(req.params.costId || 0);
    const result = db.prepare('DELETE FROM project_actual_costs WHERE id = ? AND client_order_id = ?').run(costId, orderId);
    if (!result.changes) return res.status(404).json({ success: false, error: 'Coût introuvable pour cette commande' });
    return res.json({ success: true });
  }

  function addBudgetLine(req, res) {
    const order = requireClientOrderForCostLine(req, res);
    if (!order) return;
    try {
      const line = validateClientOrderCostLine({ ...req.body, source_type: 'manual' });
      db.prepare(`
        INSERT INTO client_order_cost_lines
          (client_order_id, line_type, category, designation, quantity, unit, unit_cost_ht, unit_sale_ht,
           planned_minutes, hourly_cost_ht, hourly_sale_ht, supplier, notes, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
      `).run(order.id, line.line_type, line.category, line.designation, line.quantity, line.unit,
        line.unit_cost_ht, line.unit_sale_ht, line.planned_minutes, line.hourly_cost_ht,
        line.hourly_sale_ht, line.supplier, line.notes, new Date().toISOString(), new Date().toISOString());
      return res.redirect(clientOrderDetailRedirect(order));
    } catch (error) {
      return res.status(400).send(escapeHtml(error.message || 'Ligne invalide'));
    }
  }

  function updateBudgetLine(req, res) {
    const order = requireClientOrderForCostLine(req, res);
    if (!order) return;
    const lineId = Number(req.params.lineId || 0);
    const existing = db.prepare('SELECT * FROM client_order_cost_lines WHERE id = ? AND client_order_id = ?').get(lineId, order.id);
    if (!existing) return res.status(404).send('Ligne introuvable pour cette commande');
    try {
      const line = validateClientOrderCostLine({ ...req.body, source_type: existing.source_type });
      db.prepare(`
        UPDATE client_order_cost_lines SET line_type = ?, category = ?, designation = ?, quantity = ?, unit = ?,
          unit_cost_ht = ?, unit_sale_ht = ?, planned_minutes = ?, hourly_cost_ht = ?, hourly_sale_ht = ?,
          supplier = ?, notes = ?, updated_at = ? WHERE id = ? AND client_order_id = ?
      `).run(line.line_type, line.category, line.designation, line.quantity, line.unit, line.unit_cost_ht,
        line.unit_sale_ht, line.planned_minutes, line.hourly_cost_ht, line.hourly_sale_ht,
        line.supplier, line.notes, new Date().toISOString(), lineId, order.id);
      return res.redirect(clientOrderDetailRedirect(order));
    } catch (error) {
      return res.status(400).send(escapeHtml(error.message || 'Ligne invalide'));
    }
  }

  function duplicateBudgetLine(req, res) {
    const order = requireClientOrderForCostLine(req, res);
    if (!order) return;
    const source = db.prepare('SELECT * FROM client_order_cost_lines WHERE id = ? AND client_order_id = ?').get(Number(req.params.lineId || 0), order.id);
    if (!source) return res.status(404).send('Ligne introuvable pour cette commande');
    db.prepare(`
      INSERT INTO client_order_cost_lines
        (client_order_id, line_type, category, designation, quantity, unit, unit_cost_ht, unit_sale_ht,
         planned_minutes, hourly_cost_ht, hourly_sale_ht, supplier, notes, source_type, source_quote_line_id,
         sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?, ?)
    `).run(order.id, source.line_type, source.category, `${source.designation} (copie)`.slice(0, 255),
      source.quantity, source.unit, source.unit_cost_ht, source.unit_sale_ht, source.planned_minutes,
      source.hourly_cost_ht, source.hourly_sale_ht, source.supplier, source.notes, source.sort_order,
      new Date().toISOString(), new Date().toISOString());
    return res.redirect(clientOrderDetailRedirect(order));
  }

  function deleteBudgetLine(req, res) {
    const order = requireClientOrderForCostLine(req, res);
    if (!order) return;
    const lineId = Number(req.params.lineId || 0);
    const existing = db.prepare('SELECT source_quote_line_id FROM client_order_cost_lines WHERE id = ? AND client_order_id = ?').get(lineId, order.id);
    if (existing?.source_quote_line_id) db.prepare('INSERT OR IGNORE INTO client_order_cost_line_exclusions (client_order_id, source_quote_line_id, excluded_at) VALUES (?, ?, ?)').run(order.id, existing.source_quote_line_id, new Date().toISOString());
    const result = db.prepare('DELETE FROM client_order_cost_lines WHERE id = ? AND client_order_id = ?').run(lineId, order.id);
    if (!result.changes) return res.status(404).send('Ligne introuvable pour cette commande');
    return res.redirect(clientOrderDetailRedirect(order));
  }

  function importBudgetFromQuote(req, res) {
    const order = requireClientOrderForCostLine(req, res);
    if (!order) return;
    if (!order.quote_id) return res.redirect(`/orders/client/${order.id}/profitability?importStatus=no-quote#order-budget`);
    const result = importMissingQuoteCostLines(order.id, order.quote_id);
    return res.redirect(`/orders/client/${order.id}/profitability?importStatus=${result.imported > 0 ? `imported-${result.imported}` : 'none'}#order-budget`);
  }

  return {
    showProfitability, getProfitabilityApi, addActualCost, deleteActualCost,
    addBudgetLine, updateBudgetLine, duplicateBudgetLine, deleteBudgetLine,
    importBudgetFromQuote
  };
}

module.exports = { createClientOrderProfitabilityController };
