'use strict';
const assert = require('assert');
const { createQuoteAcceptanceController } = require('./controllers/quoteAcceptanceController');

let behavior = 'success';
const errors = [];
const controller = createQuoteAcceptanceController({
  acceptanceService: {
    acceptQuote(id) {
      assert.strictEqual(id, behavior === 'invalid' ? 0 : 7);
      if (behavior === 'missing') throw Object.assign(new Error('Devis introuvable'), { statusCode: 404 });
      if (behavior === 'invalid') throw Object.assign(new Error('Devis introuvable'), { statusCode: 404 });
      if (behavior === 'client') throw Object.assign(new Error('Client manquant sur le devis'), { statusCode: 400 });
      if (behavior === 'failure') throw new Error('SQL');
      return { safeClient: 'Client été', safeOrder: 'Portail / A' };
    }
  },
  logError: (...args) => errors.push(args)
});
function response() {
  return {
    code: 200, body: null, location: null,
    status(code) { this.code = code; return this; },
    send(body) { this.body = body; return this; },
    redirect(location) { this.location = location; return this; }
  };
}
let res = response();
controller.acceptQuote({ params: { id: '7' } }, res);
assert.strictEqual(res.location, '/pc-folders/Client%20%C3%A9t%C3%A9/Portail%20%2F%20A');
behavior = 'missing'; res = response();
controller.acceptQuote({ params: { id: '7' } }, res);
assert.deepStrictEqual([res.code, res.body], [404, 'Devis introuvable']);
behavior = 'client'; res = response();
controller.acceptQuote({ params: { id: '7' } }, res);
assert.deepStrictEqual([res.code, res.body], [400, 'Client manquant sur le devis']);
behavior = 'invalid'; res = response();
controller.acceptQuote({ params: { id: '0' } }, res);
assert.deepStrictEqual([res.code, res.body], [404, 'Devis introuvable']);
behavior = 'failure'; res = response();
controller.acceptQuote({ params: { id: '7' } }, res);
assert.deepStrictEqual([res.code, res.body], [500, 'Erreur serveur lors de l’acceptation (voir console).']);
assert.strictEqual(errors.length, 1);
console.log('OK - contrôleur acceptation devis');
