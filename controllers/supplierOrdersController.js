'use strict';

function createSupplierOrdersController({ supplierOrdersService, renderSupplierOrdersListView, pageTemplate, viewDependencies } = {}) {
  if (!supplierOrdersService) throw new TypeError('Service commandes fournisseurs manquant.');
  if (typeof renderSupplierOrdersListView !== 'function' || typeof pageTemplate !== 'function') throw new TypeError('Rendu commandes fournisseurs manquant.');
  function showSupplierOrders(req, res) {
    const data = supplierOrdersService.listSupplierOrders(req.query);
    return res.send(pageTemplate(req, 'Commandes fournisseurs', renderSupplierOrdersListView(data, viewDependencies)));
  }
  function createSupplierOrder(req, res) {
    supplierOrdersService.createSupplierOrder(req.body);
    return res.redirect('/orders/suppliers');
  }
  function deleteSupplierOrder(req, res) {
    supplierOrdersService.deleteSupplierOrder(req.body.id);
    return res.redirect('/orders/suppliers');
  }
  function completeSupplierOrder(req, res) {
    supplierOrdersService.completeSupplierOrder(req.body.id);
    return res.redirect('/orders/suppliers');
  }
  function updatePurchaseStatus(req, res) {
    const purchaseId = Number(req.params.purchaseId || 0);
    const redirect = String(req.body.redirect || '/orders/suppliers#supplier-list');
    const safeRedirect = redirect.startsWith('/orders/suppliers') ? redirect : '/orders/suppliers#supplier-list';
    if (!supplierOrdersService.updatePurchaseStatus(purchaseId, req.body.status)) return res.status(404).send('Article introuvable');
    return res.redirect(safeRedirect);
  }
  return { showSupplierOrders, createSupplierOrder, deleteSupplierOrder, completeSupplierOrder, updatePurchaseStatus };
}

module.exports = { createSupplierOrdersController };
