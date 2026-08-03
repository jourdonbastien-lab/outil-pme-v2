'use strict';

function createDashboardService({ db, dateKeyInTimeZone, timeZone, now = () => new Date() }) {
  if (!db || typeof db.prepare !== 'function') throw new Error('db est requis');

  function getClassicDashboardData() {
    const upcomingEvents = db.prepare(`
      SELECT *
      FROM events
      WHERE start_date IS NOT NULL
        AND title IS NOT NULL
        AND title != ''
        AND datetime(start_date) >= datetime('now')
      ORDER BY start_date ASC
      LIMIT 5
    `).all();
    const todoTasks = db.prepare("SELECT * FROM tasks WHERE status != 'Terminée' ORDER BY created_at DESC LIMIT 5").all();
    const clientOrders = db.prepare(`
      SELECT *
      FROM client_orders
      WHERE status != 'Terminée'
      ORDER BY date DESC, id DESC
      LIMIT 5
    `).all().map((order) => {
      const realMinutes = db.prepare(`
        SELECT COALESCE(SUM(minutes_total),0) AS total
        FROM chantier_hours
        WHERE client = ?
        AND order_name = ?
      `).get(order.name, order.description);
      const actualHours = Number(realMinutes.total || 0) / 60;
      const plannedHours = Number(order.planned_hours || 0);
      return { ...order, chantierStatus: plannedHours > 0 && actualHours > plannedHours ? '🔴' : '🟢' };
    });
    const supplierOrders = db.prepare('SELECT * FROM supplier_orders ORDER BY date DESC, id DESC LIMIT 5').all();
    return { upcomingEvents, todoTasks, clientOrders, supplierOrders };
  }

  function getModernDashboardData() {
    const todayIso = dateKeyInTimeZone(now(), timeZone);
    const todayLabel = now().toLocaleDateString('fr-FR', {
      timeZone, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    const openTasks = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'Terminée'").get().c;
    const eventsToday = db.prepare("SELECT COUNT(*) AS c FROM events WHERE start_date LIKE ?").get(`${todayIso}%`).c;
    const clientsCount = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
    const openClientOrders = db.prepare("SELECT COUNT(*) AS c FROM client_orders WHERE status != 'Terminée'").get().c;
    const activeOrderChantiers = db.prepare(`
      SELECT COUNT(*) AS c
      FROM client_orders
      WHERE status != 'Terminée'
      AND COALESCE(chantier_status, 'À préparer') NOT IN ('Terminé', 'Facturé')
    `).get().c;
    const quotesToFollowCount = db.prepare(`
      SELECT COUNT(*) AS c
      FROM quotes
      WHERE COALESCE(NULLIF(TRIM(status), ''), 'Brouillon') IN ('Brouillon', 'Envoyé', 'Accepté')
    `).get().c;
    const waitingSupplierOrders = db.prepare(`
      SELECT COUNT(*) AS c
      FROM supplier_orders
      WHERE status IS NULL OR TRIM(status) = '' OR status != 'Terminée'
    `).get().c;
    const todayEvents = db.prepare(`
      SELECT title, start_date, end_date, type
      FROM events
      WHERE start_date LIKE ?
      ORDER BY datetime(start_date) ASC
      LIMIT 6
    `).all(`${todayIso}%`);
    const upcomingEvents = db.prepare(`
      SELECT title, start_date, end_date, type
      FROM events
      WHERE datetime(start_date) >= datetime('now', 'localtime')
      ORDER BY datetime(start_date) ASC
      LIMIT 5
    `).all();
    const orderChantiers = db.prepare(`
      SELECT
        co.id, co.name, co.description, co.date, co.status, co.planned_hours, co.done_hours,
        co.chantier_status, co.chantier_progress, co.chantier_start_date, co.chantier_end_date,
        ROUND(COALESCE(SUM(ch.minutes_total), 0) / 60.0, 2) AS done_hours_calc,
        COUNT(ch.id) AS chantier_hours_count
      FROM client_orders co
      LEFT JOIN chantier_hours ch ON ch.client_order_id = co.id
      WHERE co.status != 'Terminée'
      GROUP BY co.id
      ORDER BY
        CASE
          WHEN co.chantier_end_date IS NOT NULL AND TRIM(co.chantier_end_date) != '' THEN co.chantier_end_date
          ELSE co.date
        END ASC,
        co.id DESC
      LIMIT 12
    `).all();
    const activeSupplierOrders = db.prepare(`
      SELECT id, name, description, date, status
      FROM supplier_orders
      WHERE status IS NULL OR TRIM(status) = '' OR status != 'Terminée'
      ORDER BY date DESC, id DESC
      LIMIT 12
    `).all();
    const pendingPurchases = db.prepare(`
      SELECT
        p.id, p.designation, p.category, p.qty, p.unit, p.reference, p.supplier,
        p.needed_date, p.status, co.id AS order_id, co.name AS client_name,
        co.description AS order_description
      FROM client_order_purchases p
      JOIN client_orders co ON co.id = p.client_order_id
      WHERE COALESCE(NULLIF(TRIM(p.status), ''), 'À commander') != 'Reçu'
      ORDER BY
        CASE COALESCE(NULLIF(TRIM(p.status), ''), 'À commander')
          WHEN 'À commander' THEN 0
          WHEN 'Commandé' THEN 1
          ELSE 2
        END,
        p.id DESC
      LIMIT 12
    `).all();
    return {
      todayIso, todayLabel, openTasks, eventsToday, clientsCount, openClientOrders,
      activeOrderChantiers, quotesToFollowCount, waitingSupplierOrders, todayEvents,
      upcomingEvents, orderChantiers, activeSupplierOrders, pendingPurchases
    };
  }

  return { getModernDashboardData, getClassicDashboardData };
}

module.exports = { createDashboardService };
