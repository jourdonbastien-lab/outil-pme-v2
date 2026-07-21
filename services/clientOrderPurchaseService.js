'use strict';

function createClientOrderPurchaseService({ db } = {}) {
  if (!db || typeof db.prepare !== 'function') throw new Error('createClientOrderPurchaseService: db is required');

  return {
    getOrder(orderId) {
      return db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
    },
    getPurchase(purchaseId, orderId) {
      return db.prepare('SELECT id FROM client_order_purchases WHERE id = ? AND client_order_id = ?').get(purchaseId, orderId);
    },
    createPurchase(orderId, purchase) {
      return db.prepare(`
        INSERT INTO client_order_purchases
          (client_order_id, designation, category, qty, unit, reference, supplier, needed_date, note, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(orderId, purchase.designation, purchase.category, purchase.qty, purchase.unit, purchase.reference,
        purchase.supplier, purchase.neededDate, purchase.note, purchase.status, purchase.now, purchase.now);
    },
    updatePurchase(orderId, purchaseId, purchase) {
      return db.prepare(`
        UPDATE client_order_purchases
        SET designation = ?, category = ?, qty = ?, unit = ?, reference = ?, supplier = ?,
            needed_date = ?, note = ?, status = ?, updated_at = ?
        WHERE id = ? AND client_order_id = ?
      `).run(purchase.designation, purchase.category, purchase.qty, purchase.unit, purchase.reference,
        purchase.supplier, purchase.neededDate, purchase.note, purchase.status, purchase.now, purchaseId, orderId);
    },
    deletePurchase(orderId, purchaseId) {
      return db.prepare('DELETE FROM client_order_purchases WHERE id = ? AND client_order_id = ?').run(purchaseId, orderId);
    }
  };
}

module.exports = { createClientOrderPurchaseService };
