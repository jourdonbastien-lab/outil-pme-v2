'use strict';

function createSupplierOrdersService(dependencies = {}) {
  const {
    db, normalizeSearchText, normalizePurchaseStatus, clientOrderFolderName,
    safeName, formatDateLabel, isoDate, now = () => new Date().toISOString()
  } = dependencies;
  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base commandes fournisseurs manquante.');
  for (const [name, fn] of Object.entries({ normalizeSearchText, normalizePurchaseStatus, clientOrderFolderName, safeName, formatDateLabel, isoDate })) {
    if (typeof fn !== 'function') throw new TypeError(`Dépendance commandes fournisseurs manquante : ${name}.`);
  }

  function listSupplierOrders(query = {}) {
    const orders = db.prepare('SELECT * FROM supplier_orders ORDER BY date DESC, id DESC').all();
    const activeCount = orders.filter((order) => String(order.status || 'En cours') !== 'Terminée').length;
    const chantierPurchases = db.prepare(`
      SELECT
        p.id, p.designation, p.category, p.qty, p.unit, p.reference, p.supplier,
        p.needed_date, p.status, co.id AS order_id, co.name AS client_name,
        co.description AS order_description
      FROM client_order_purchases p
      JOIN client_orders co ON co.id = p.client_order_id
      ORDER BY
        CASE COALESCE(NULLIF(TRIM(p.status), ''), 'À commander')
          WHEN 'À commander' THEN 0
          WHEN 'Commandé' THEN 1
          ELSE 2
        END,
        COALESCE(NULLIF(TRIM(p.needed_date), ''), '9999-12-31') ASC,
        p.id DESC
    `).all();
    const statusFilter = ['todo', 'ordered', 'done'].includes(String(query.status || '').trim())
      ? String(query.status).trim() : 'all';
    const supplierFilter = String(query.supplier || 'all').trim() || 'all';
    const searchFilter = normalizeSearchText(query.q || '');
    const combinedSupplierItems = [
      ...chantierPurchases.map((item) => {
        const status = normalizePurchaseStatus(item.status);
        const bucket = status === 'À commander' ? 'todo' : status === 'Commandé' ? 'ordered' : 'done';
        const orderFolderName = clientOrderFolderName({ id: item.order_id, description: item.order_description });
        return {
          type: 'purchase', key: `purchase-${item.id}`, id: item.id, sourceLabel: 'Achat chantier', bucket,
          sortRank: bucket === 'todo' ? 0 : bucket === 'ordered' ? 1 : 2, status,
          supplier: String(item.supplier || '').trim(), title: item.designation || 'Article',
          subtitle: `${item.client_name || 'Client'} · ${item.order_description || `Commande #${item.order_id}`}`,
          meta: [
            item.category || 'Catégorie non renseignée',
            `${Number(item.qty || 0).toLocaleString('fr-FR')} ${item.unit || ''}`.trim(),
            item.reference ? `Réf. ${item.reference}` : 'Référence non renseignée',
            item.supplier || 'Fournisseur non renseigné',
            item.needed_date ? `Besoin ${formatDateLabel(item.needed_date)}` : 'Besoin non renseigné'
          ],
          searchText: normalizeSearchText([item.designation, item.category, item.reference, item.supplier, item.client_name, item.order_description].join(' ')),
          href: `/pc-folders/${encodeURIComponent(safeName(item.client_name))}/${encodeURIComponent(orderFolderName)}/Commandes`
        };
      }),
      ...orders.map((order) => {
        const status = String(order.status || 'En cours').trim() || 'En cours';
        const bucket = status === 'Terminée' ? 'done' : 'ordered';
        return {
          type: 'supplier', key: `supplier-${order.id}`, id: order.id, sourceLabel: 'Commande fournisseur',
          bucket, sortRank: bucket === 'ordered' ? 1 : 2, status, supplier: String(order.name || '').trim(),
          title: order.name || 'Commande fournisseur', subtitle: order.description || 'Aucune description',
          meta: [`Date ${formatDateLabel(order.date)}`, order.description || ''].filter(Boolean),
          searchText: normalizeSearchText([order.name, order.description, order.date, status].join(' ')),
          href: `/orders/suppliers#supplier-${order.id}`
        };
      })
    ]
      .filter((item) => statusFilter === 'all' || item.bucket === statusFilter)
      .filter((item) => supplierFilter === 'all' || (supplierFilter === '__missing' ? item.supplier === '' : item.supplier === supplierFilter))
      .filter((item) => !searchFilter || item.searchText.includes(searchFilter))
      .sort((a, b) => a.sortRank - b.sortRank || String(a.supplier).localeCompare(String(b.supplier), 'fr') || String(a.title).localeCompare(String(b.title), 'fr'));
    const supplierChoices = Array.from(new Set([
      ...orders.map((order) => String(order.name || '').trim()),
      ...chantierPurchases.map((item) => String(item.supplier || '').trim())
    ])).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    return { orders, activeCount, chantierPurchases, statusFilter, supplierFilter, searchFilter, combinedSupplierItems, supplierChoices, query };
  }

  function createSupplierOrder({ name, description, date }) {
    return db.prepare(`INSERT INTO supplier_orders (name, description, date, created_at) VALUES (?, ?, ?, ?)`)
      .run(String(name || '').trim(), String(description || '').trim() || null, String(date || '').trim() || isoDate(), now());
  }
  function deleteSupplierOrder(id) { return db.prepare('DELETE FROM supplier_orders WHERE id = ?').run(id); }
  function completeSupplierOrder(id) { return db.prepare("UPDATE supplier_orders SET status = 'Terminée' WHERE id = ?").run(id); }
  function updatePurchaseStatus(purchaseId, status) {
    if (!db.prepare('SELECT id FROM client_order_purchases WHERE id = ?').get(purchaseId)) return null;
    db.prepare('UPDATE client_order_purchases SET status = ?, updated_at = ? WHERE id = ?')
      .run(normalizePurchaseStatus(status), now(), purchaseId);
    return true;
  }
  return { listSupplierOrders, createSupplierOrder, deleteSupplierOrder, completeSupplierOrder, updatePurchaseStatus };
}

module.exports = { createSupplierOrdersService };
