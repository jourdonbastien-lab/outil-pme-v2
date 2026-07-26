'use strict';

function createClientOrderAgendaController({ agendaService }) {
  if (!agendaService) throw new TypeError('Service agenda commande manquant.');

  function addClientOrderToAgenda(req, res) {
    const orderId = Number(req.params.id || 0);
    if (!Number.isFinite(orderId) || orderId <= 0) return res.redirect('/orders/clients?poseAgendaStatus=error');
    const order = agendaService.getOrder(orderId);
    if (!order) return res.redirect('/orders/clients?poseAgendaStatus=error');
    const event = agendaService.preparePoseEvent(order, req.body);
    if (event.error === 'status') return res.redirect('/orders/clients?poseAgendaStatus=error');
    if (event.error) return res.redirect(`/orders/clients?poseAgendaStatus=error&poseAgendaOrderId=${orderId}`);
    if (agendaService.findDuplicate(event)) {
      return res.redirect(`/orders/clients?poseAgendaStatus=exists&poseAgendaOrderId=${orderId}`);
    }
    agendaService.createPoseEvent(event);
    return res.redirect(`/orders/clients?poseAgendaStatus=created&poseAgendaOrderId=${orderId}`);
  }

  return { addClientOrderToAgenda };
}

module.exports = { createClientOrderAgendaController };
