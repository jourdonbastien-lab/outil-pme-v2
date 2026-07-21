'use strict';
function createClientOrderInvoiceService({ db } = {}) {
  if (!db || typeof db.prepare !== 'function') throw new Error('createClientOrderInvoiceService: db is required');
  return {
    getOrderById(id) { return db.prepare('SELECT * FROM client_orders WHERE id = ?').get(id); },
    listInvoicesByOrderId(id) { return db.prepare('SELECT * FROM client_order_invoices WHERE client_order_id = ? ORDER BY invoice_date DESC, id DESC').all(id); },
    listAnalyzedFileNames(id) { return db.prepare('SELECT stored_file_name FROM client_order_invoices WHERE client_order_id = ? AND stored_file_name IS NOT NULL AND stored_file_name != ?').all(id, ''); },
    getInvoiceById(invoiceId, orderId) { return db.prepare('SELECT * FROM client_order_invoices WHERE id = ? AND client_order_id = ?').get(invoiceId, orderId); },
    findDuplicate(orderId, invoiceNumber, fileHash) {
      return db.prepare(`
        SELECT id FROM client_order_invoices
        WHERE client_order_id = ? AND (
          (invoice_number IS NOT NULL AND invoice_number != '' AND lower(invoice_number) = lower(?))
          OR file_hash = ?
        ) LIMIT 1
      `).get(orderId, invoiceNumber, fileHash);
    },
    createInvoice(invoice) {
      return db.prepare(`
        INSERT INTO client_order_invoices
          (client_order_id, invoice_number, invoice_date, client_name, amount_ht, vat_amount, amount_ttc, stored_file_name, original_file_name, file_hash, source_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoice.orderId, invoice.invoiceNumber || null, invoice.invoiceDate, invoice.clientName,
        invoice.amountHt, invoice.vatAmount, invoice.amountTtc, invoice.storedFileName,
        invoice.originalFileName, invoice.fileHash, invoice.sourceType, invoice.createdAt);
    },
    deleteInvoiceRecord(invoiceId, orderId) {
      return db.prepare('DELETE FROM client_order_invoices WHERE id = ? AND client_order_id = ?').run(invoiceId, orderId);
    }
  };
}
module.exports = { createClientOrderInvoiceService };
