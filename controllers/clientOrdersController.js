'use strict';

function createClientOrdersController(deps) {
  const {
    orderService, renderListView, pageTemplate, parseOptionalVatRate, normalizeChantierStatus,
    parsePositiveNumber, parseOptionalId, parseDecimalInput, isoDate,
    importMissingQuoteCostLines, ensureOrderFolders, safeName, getProgressFromChantierStatus,
    getFinancialSnapshot, listClientFolders, formatEuroFr, roundAmount,
    chantierStatusClass, chantierStatusOptions, escapeHtml, clientPageIcon, pcFolderIcon
  } = deps;
  if (!orderService) throw new TypeError('Service commandes clients manquant.');
  if (typeof renderListView !== 'function') throw new TypeError('Vue liste commandes manquante.');

  function listClientOrders(req, res) {
    const isWorkshop = req.session?.user?.role === 'atelier';
    const orders = orderService.listActiveOrders();
    const availableQuotes = isWorkshop ? [] : orderService.listAvailableQuotes();
    const financialSnapshots = new Map(orders.map((order) => [
      Number(order.id), getFinancialSnapshot(order.id)
    ]));
    const totalAmount = orders.reduce((sum, order) =>
      sum + financialSnapshots.get(Number(order.id)).revenue.remainingToInvoiceExVat, 0);

    const hoursByOrderId = new Map();
    const legacyHours = new Map();
    orderService.listHoursTotals().forEach((row) => {
      const minutes = Number(row.total_minutes || 0);
      const orderId = Number(row.client_order_id || 0);
      if (Number.isFinite(orderId) && orderId > 0) {
        hoursByOrderId.set(orderId, (hoursByOrderId.get(orderId) || 0) + minutes);
      } else {
        legacyHours.set(`${String(row.client || '')}\u0000${String(row.order_name || '')}`, minutes);
      }
    });

    const buildPoseTitle = (order) => {
      const name = String(order.description || '').trim() || `Commande #${order.id}`;
      return `Pose - ${String(order.name || '').trim()} - ${name}`;
    };
    const poseEvents = orderService.listPoseEvents();
    const poseByOrderId = new Map();
    orders.forEach((order) => {
      if (normalizeChantierStatus(order.chantier_status) !== 'En pose') return;
      const title = buildPoseTitle(order);
      const event = poseEvents.find((item) => String(item.title || '') === title || String(item.title || '').startsWith(`${title} · `));
      if (event) poseByOrderId.set(Number(order.id), event);
    });

    const today = isoDate();
    const cardModels = orders.map((order) => {
      const clientFolder = safeName(order.name);
      const orderFolder = safeName(order.description && order.description.trim() !== '' ? order.description : `Commande_${order.id}`);
      const folderUrl = `/pc-folders/${encodeURIComponent(clientFolder)}/${encodeURIComponent(orderFolder)}`;
      const amountHt = Number(order.price || 0);
      const snapshot = financialSnapshots.get(Number(order.id));
      const vatRate = parseOptionalVatRate(order.vat_rate);
      const amountTtc = vatRate !== null ? roundAmount(amountHt * (1 + vatRate / 100)) : null;
      const actualMinutes = (hoursByOrderId.get(Number(order.id)) || 0)
        + (legacyHours.get(`${clientFolder}\u0000${orderFolder}`) || 0);
      const actualHours = actualMinutes / 60;
      const plannedHours = Number(order.planned_hours || 0);
      const chantierStatus = normalizeChantierStatus(order.chantier_status);
      const progress = getProgressFromChantierStatus(chantierStatus);
      const plannedEndDate = String(order.chantier_end_date || '').slice(0, 10);
      return {
        order,
        statusLabel: order.status || 'En cours',
        chantierStatus,
        chantierStatusClass: chantierStatusClass(chantierStatus),
        progress,
        actualHours,
        plannedHours,
        isOverHours: plannedHours > 0 && actualHours > plannedHours,
        plannedEndDate,
        isLate: Boolean(plannedEndDate && plannedEndDate < today),
        isPoseStatus: chantierStatus === 'En pose',
        poseEvent: poseByOrderId.get(Number(order.id)) || null,
        poseAgendaTitle: buildPoseTitle(order),
        folderUrl,
        hoursUrl: `${folderUrl}/Heure%20chantier`,
        dateLabel: String(order.date || '').slice(0, 10),
        amountHtLabel: amountHt > 0 ? `${formatEuroFr(amountHt)} HT` : 'Non renseigné',
        invoicedHtLabel: formatEuroFr(snapshot.revenue.invoicedExVat),
        remainingHtLabel: formatEuroFr(snapshot.revenue.remainingToInvoiceExVat),
        vatLabel: vatRate !== null ? `TVA : ${vatRate} %` : 'TVA non renseignée',
        vatRate,
        amountTtcLabel: amountHt > 0 && amountTtc !== null ? `${formatEuroFr(amountTtc)} TTC` : 'TTC non calculé',
        editPriceValue: amountHt > 0 ? amountHt.toFixed(2) : ''
      };
    });

    const poseStatus = String(req.query.poseAgendaStatus || '').trim();
    const poseOrderId = Number(req.query.poseAgendaOrderId || 0);
    const poseAgendaFlash = poseStatus === 'created'
      ? 'Événement de pose ajouté à l’agenda.'
      : poseStatus === 'exists'
        ? (poseOrderId > 0 ? `Un événement de pose existe déjà pour la commande #${poseOrderId}.` : 'Un événement de pose existe déjà pour cette commande.')
        : poseStatus === 'error' ? 'Impossible d’ajouter l’événement de pose. Vérifiez les champs.' : '';
    const orderUpdateStatus = String(req.query.orderUpdate || '').trim();
    const orderUpdateFlash = orderUpdateStatus === 'ok' ? 'Commande mise à jour.'
      : orderUpdateStatus === 'notfound' ? 'Commande introuvable.'
        : orderUpdateStatus === 'error' ? 'Impossible de mettre à jour la commande.' : '';
    const html = renderListView({
      orders: cardModels,
      isAtelier: isWorkshop,
      totalAmount,
      formatEuroFr,
      clientPageIcon,
      pcFolderIcon,
      poseAgendaFlash,
      orderUpdateFlash,
      orderUpdateStatus,
      escapeHtml,
      preClient: String(req.query.client || '').trim(),
      chantierStatusOptions,
      availableQuotes,
      clientFolders: listClientFolders()
    });
    return res.send(pageTemplate(req, 'Commandes clients', html));
  }
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
