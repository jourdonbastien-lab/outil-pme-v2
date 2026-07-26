'use strict';

function createClientOrdersController(deps) {
  const {
    orderService, renderListPage, parseOptionalVatRate, normalizeChantierStatus,
    parsePositiveNumber, parseOptionalId, parseDecimalInput, isoDate,
    importMissingQuoteCostLines, ensureOrderFolders, safeName, getProgressFromChantierStatus
  } = deps;
  if (!orderService) throw new TypeError('Service commandes clients manquant.');
  if (typeof renderListPage !== 'function') throw new TypeError('Rendu liste commandes manquant.');

  const listClientOrders = (req, res) => renderListPage(req, res);
  function createClientOrder(req, res) {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const quoteId = parseOptionalId(req.body.quote_id);
    if (quoteId && !orderService.quoteExists(quoteId)) return res.status(400).send('Devis lié introuvable');
    if (!name) return res.status(400).send('Nom client requis');
    const info = orderService.createOrder({
      name, description, date: String(req.body.date || '').trim() || isoDate(),
      price: req.body.price ? parseFloat(req.body.price) : 0,
      vatRate: parseOptionalVatRate(req.body.vat_rate) || 20,
      plannedHours: parsePositiveNumber(req.body.planned_hours),
      chantierStatus: normalizeChantierStatus(req.body.chantier_status),
      startDate: String(req.body.chantier_start_date || '').trim() || null,
      endDate: String(req.body.chantier_end_date || '').trim() || null, quoteId
    });
    const orderId = Number(info.lastInsertRowid);
    if (quoteId) importMissingQuoteCostLines(orderId, quoteId);
    ensureOrderFolders({ orderId, name, description });
    return res.redirect('/orders/clients');
  }
  function updateClientOrder(req, res) {
    try {
      const orderId = Number(req.params.id || 0);
      if (!Number.isFinite(orderId) || orderId <= 0) return res.redirect('/orders/clients?orderUpdate=notfound');
      const existing = orderService.getOrderById(orderId);
      if (!existing) return res.redirect('/orders/clients?orderUpdate=notfound');
      const values = {
        date: String(req.body.date || '').trim() || existing.date || isoDate(),
        plannedHours: parsePositiveNumber(req.body.planned_hours),
        endDate: String(req.body.chantier_end_date || '').trim() || null,
        chantierStatus: normalizeChantierStatus(req.body.chantier_status || existing.chantier_status),
        progress: Math.max(0, Math.min(100, parseDecimalInput(req.body.chantier_progress, Number(existing.chantier_progress || 0))))
      };
      if (req.session?.user?.role === 'atelier') orderService.updateOrderForAtelier(orderId, values);
      else {
        values.price = parseDecimalInput(req.body.price, 0);
        values.vatRate = parseOptionalVatRate(req.body.vat_rate);
        values.quoteId = parseOptionalId(req.body.quote_id);
        if (values.quoteId && !orderService.quoteExists(values.quoteId)) return res.redirect('/orders/clients?orderUpdate=error');
        orderService.updateOrderForAdmin(orderId, values, () => {
          if (values.quoteId && Number(existing.quote_id || 0) !== values.quoteId) {
            importMissingQuoteCostLines(orderId, values.quoteId);
          }
        });
      }
      return res.redirect('/orders/clients?orderUpdate=ok');
    } catch (error) {
      console.error('Erreur modification commande client', error);
      return res.redirect('/orders/clients?orderUpdate=error');
    }
  }
  function completeClientOrder(req, res) {
    orderService.completeOrder(req.body.id);
    return res.redirect('/orders/clients');
  }
  function updateClientOrderStatus(req, res) {
    const orderId = Number(req.params.id || 0);
    const existing = orderService.getOrderById(orderId);
    if (!existing) return res.status(404).send('Commande introuvable');
    const status = normalizeChantierStatus(req.body.chantier_status || existing.chantier_status);
    const has = (name) => Object.prototype.hasOwnProperty.call(req.body, name);
    orderService.updateChantier(orderId, {
      status,
      plannedHours: has('planned_hours') ? parsePositiveNumber(req.body.planned_hours) : Number(existing.planned_hours || 0),
      doneHours: has('done_hours') ? parsePositiveNumber(req.body.done_hours) : Number(existing.done_hours || 0),
      progress: getProgressFromChantierStatus(status),
      startDate: has('chantier_start_date') ? String(req.body.chantier_start_date || '').trim() || null : existing.chantier_start_date || null,
      endDate: has('chantier_end_date') ? String(req.body.chantier_end_date || '').trim() || null : existing.chantier_end_date || null,
      notes: has('chantier_notes') ? String(req.body.chantier_notes || '').trim() || null : existing.chantier_notes || null
    });
    const orderFolder = safeName(existing.description && existing.description.trim() !== '' ? existing.description : `Commande_${existing.id}`);
    return res.redirect(`/pc-folders/${encodeURIComponent(safeName(existing.name))}/${encodeURIComponent(orderFolder)}`);
  }
  return { listClientOrders, createClientOrder, updateClientOrder, completeClientOrder, updateClientOrderStatus };
}

module.exports = { createClientOrdersController };
