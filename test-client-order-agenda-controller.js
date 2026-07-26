'use strict';
const assert = require('assert');
const { createClientOrderAgendaController } = require('./controllers/clientOrderAgendaController');
const redirects = [];
const service = { getOrder: () => ({ id: 7 }), preparePoseEvent: () => ({ baseTitle: 'Pose', startIso: 'x' }),
  findDuplicate: () => null, createPoseEvent() {} };
const controller = createClientOrderAgendaController({ agendaService: service });
controller.addClientOrderToAgenda({ params: { id: 7 }, body: {} }, { redirect: (url) => redirects.push(url) });
assert.strictEqual(redirects[0], '/orders/clients?poseAgendaStatus=created&poseAgendaOrderId=7');
service.findDuplicate = () => ({ id: 1 });
controller.addClientOrderToAgenda({ params: { id: 7 }, body: {} }, { redirect: (url) => redirects.push(url) });
assert.strictEqual(redirects[1], '/orders/clients?poseAgendaStatus=exists&poseAgendaOrderId=7');
console.log('OK - contrôleur agenda commande');
