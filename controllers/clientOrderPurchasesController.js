'use strict';

function createClientOrderPurchasesController(dependencies = {}) {
  for (const name of ['purchaseService', 'parseDecimalInput', 'normalizePurchaseStatus', 'getPurchaseOrderRedirect']) {
    const value = dependencies[name];
    if ((name === 'purchaseService' && (!value || typeof value.getOrder !== 'function')) || (name !== 'purchaseService' && typeof value !== 'function')) {
      throw new Error(`createClientOrderPurchasesController: ${name} is required`);
    }
  }
  const { purchaseService, parseDecimalInput, normalizePurchaseStatus, getPurchaseOrderRedirect } = dependencies;
  const optional = (value) => String(value || '').trim() || null;
  const input = (body, designation) => ({
    designation,
    category: optional(body.category),
    qty: parseDecimalInput(body.qty, 1),
    unit: optional(body.unit),
    reference: optional(body.reference),
    supplier: optional(body.supplier),
    neededDate: optional(body.needed_date),
    note: optional(body.note),
    status: normalizePurchaseStatus(body.status),
    now: new Date().toISOString()
  });

  function addPurchase(req, res) {
    const orderId = Number(req.params.id || 0);
    const order = purchaseService.getOrder(orderId);
    if (!order) return res.status(404).send('Commande introuvable');
    const designation = String(req.body.designation || '').trim();
    if (!designation) return res.status(400).send('Désignation requise');
    purchaseService.createPurchase(orderId, input(req.body, designation));
    res.redirect(getPurchaseOrderRedirect(order));
  }

  function updatePurchase(req, res) {
    const orderId = Number(req.params.id || 0);
    const purchaseId = Number(req.params.purchaseId || 0);
    const order = purchaseService.getOrder(orderId);
    if (!order) return res.status(404).send('Commande introuvable');
    if (!purchaseService.getPurchase(purchaseId, orderId)) return res.status(404).send('Article introuvable');
    const designation = String(req.body.designation || '').trim();
    if (!designation) return res.status(400).send('Désignation requise');
    purchaseService.updatePurchase(orderId, purchaseId, input(req.body, designation));
    res.redirect(getPurchaseOrderRedirect(order));
  }

  function deletePurchase(req, res) {
    const orderId = Number(req.params.id || 0);
    const purchaseId = Number(req.params.purchaseId || 0);
    const order = purchaseService.getOrder(orderId);
    if (!order) return res.status(404).send('Commande introuvable');
    purchaseService.deletePurchase(orderId, purchaseId);
    res.redirect(getPurchaseOrderRedirect(order));
  }

  return { addPurchase, updatePurchase, deletePurchase };
}

module.exports = { createClientOrderPurchasesController };
