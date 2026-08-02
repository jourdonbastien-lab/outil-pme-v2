'use strict';

const assert = require('assert');
const fs = require('fs');
const reviewEngine = require('./lib/quoteAiReview');

function lines(total) {
  return [{ category: 'Fabrication', label: 'Escalier acier', qty: 1, unit: 'forfait', unit_price: total, total }];
}

const green = reviewEngine.calculateQuoteReview({ title: 'Escalier intérieur', cout_revient: 6000, vat_rate: 20 }, lines(10000));
assert.strictEqual(green.riskLevel, 'green');
assert.strictEqual(green.summary.marginAmount, 4000);
assert.strictEqual(green.summary.marginOnSale, 40);
assert.strictEqual(green.summary.marginOnCost, 66.67);
assert.strictEqual(green.summary.costSource, 'existing', 'cout_revient existant doit avoir priorite');

const orange = reviewEngine.calculateQuoteReview({ title: 'Ouvrage intérieur', cout_revient: 7500 }, lines(10000));
assert.strictEqual(orange.riskLevel, 'orange');
assert.strictEqual(orange.summary.marginOnSale, 25);

const absent = reviewEngine.calculateQuoteReview({ title: 'Portail motorisé' }, lines(10000));
assert.strictEqual(absent.riskLevel, 'red');
assert(absent.warnings.some((warning) => warning.includes('pas encore renseigné')));
assert(absent.warnings.some((warning) => warning.includes('motorisation')));

const loss = reviewEngine.calculateQuoteReview({ cout_revient: 12000 }, lines(10000));
assert.strictEqual(loss.riskLevel, 'red');
assert.strictEqual(loss.summary.marginAmount, -2000);

const breakdown = reviewEngine.calculateQuoteReview({
  cout_matiere: 2000, cout_transport: 200, heures_etude: 2, heures_atelier: 10, heures_pose: 4, cout_horaire: 50
}, lines(5000));
assert.strictEqual(breakdown.summary.laborCost, 800);
assert.strictEqual(breakdown.summary.costPrice, 3000);
assert.strictEqual(breakdown.summary.costSource, 'breakdown');

const underestimated = reviewEngine.calculateQuoteReview({ cout_matiere: 1000, heures_atelier: 2, cout_horaire: 50 }, lines(5000));
assert(underestimated.checks.some((check) => check.code === 'very_low_hours'));
assert(underestimated.checks.some((check) => check.code === 'missing_consumables'));

const mismatch = reviewEngine.calculateQuoteReview({ cout_revient: 50 }, [{ qty: -1, unit_price: 100, total: 100 }]);
assert.strictEqual(mismatch.riskLevel, 'red');
assert(mismatch.checks.some((check) => check.code === 'negative_line'));
assert(mismatch.checks.some((check) => check.code === 'line_total_mismatch'));

const automaticReview = reviewEngine.calculateAutomaticLineReview({
  status: 'incomplete', reliability: 'incomplete', totalHT: 10000, lineSaleTotal: 10000,
  counts: { total: 1, analyzed: 0, missing: 1 }, missingSaleHT: 10000,
  materialCost: 0, subcontractingCost: 0, laborCost: 0, otherDetectedCost: 0, detectedCost: 0,
  adjustmentsCost: 0, lines: [{ id: 1, label: 'Acier', category: 'matière acier', saleHT: 10000, cost: null, status: 'missing', significant: true }]
}, {}, [{ id: 1, label: 'Acier' }]);
assert.strictEqual(automaticReview.riskLevel, 'incomplete');
assert(automaticReview.checks.some((check) => check.code === 'line_without_cost'));
assert(automaticReview.checks.some((check) => check.code === 'material_without_cost'));

(async () => {
  let called = false;
  const withoutKey = await reviewEngine.requestOpenAiInterpretation({
    apiKey: '', model: 'test-model', safePayload: {}, deterministicRisk: 'orange',
    fetchImpl: async () => { called = true; }
  });
  assert.strictEqual(called, false, 'sans cle, aucun appel externe ne doit etre fait');
  assert.strictEqual(withoutKey.used, false);

  let requestBody = null;
  const withKey = await reviewEngine.requestOpenAiInterpretation({
    apiKey: 'test-key', model: 'test-model', deterministicRisk: 'orange',
    safePayload: { workDescription: 'Portail', financialSummary: { totalHT: 1000 } },
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify({ riskLevel: 'green', warnings: ['Vérifier'], positivePoints: [], recommendation: 'Contrôler.' }) }) };
    }
  });
  assert.strictEqual(withKey.used, true);
  assert.strictEqual(withKey.review.riskLevel, 'orange', 'l IA ne doit pas abaisser le risque déterministe');
  assert.strictEqual(requestBody.model, 'test-model');
  assert(!JSON.stringify(requestBody).includes('client@email'), 'aucune coordonnee client ne doit etre envoyee');

  await assert.rejects(() => reviewEngine.requestOpenAiInterpretation({
    apiKey: 'test-key', model: 'test-model', safePayload: {}, deterministicRisk: 'green',
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'indisponible' } }) })
  }), /OpenAI HTTP 500/);

  const server = fs.readFileSync('server.js', 'utf8');
  const aiRoutes = fs.readFileSync('routes/quoteAiAnalysis.js', 'utf8');
  const aiService = fs.readFileSync('services/quoteAiAnalysisService.js', 'utf8');
  assert(server.includes('CREATE TABLE IF NOT EXISTS quote_ai_reviews'));
  assert(aiRoutes.includes("app.post('/api/devis/:id/ai-review', requireLogin"));
  assert(aiRoutes.includes("app.get('/api/devis/:id/ai-reviews', requireLogin"));
  assert(server.includes('Réanalyser le devis'));
  assert(server.includes('Cette analyse est une aide au contrôle'));
  const openAiPayloadStart = aiService.indexOf('const safePayload = {', aiService.indexOf('async function requestOpenAiQuoteReview'));
  const openAiPayloadEnd = aiService.indexOf('const controller = new AbortControllerImpl()', openAiPayloadStart);
  const openAiPayload = aiService.slice(openAiPayloadStart, openAiPayloadEnd);
  assert(!/client_name|client_email|client_phone|client_address|technicalNotes/.test(openAiPayload), 'aucune donnée client ou note libre ne doit être envoyée à OpenAI');
  const routeStart = aiService.indexOf('async function reviewQuote');
  const routeEnd = aiService.indexOf('function listQuoteAiReviews', routeStart);
  const analysisRoute = aiService.slice(routeStart, routeEnd);
  assert(!analysisRoute.includes('UPDATE quotes'), 'analyser ne doit jamais modifier le devis');
  assert(!analysisRoute.includes('UPDATE quote_lines'), 'analyser ne doit jamais modifier les lignes');
  assert(analysisRoute.includes('INSERT INTO quote_ai_reviews'), 'l historique doit etre enregistre');
  assert(aiRoutes.includes("app.post('/api/devis/:id/profitability/analyze', requireLogin"));

  console.log('OK - contrôle automatique des devis');
})().catch((error) => { console.error(error); process.exitCode = 1; });
