'use strict';

const PROFITABILITY_RULES = Object.freeze({
  minimumMarginOnSale: 20,
  targetMarginOnSale: 30,
  comfortableMarginOnSale: 35,
  defaultHourlyCost: 55
});

const COST_FIELDS = Object.freeze({
  material: 'cout_matiere',
  subcontracting: 'cout_sous_traitance',
  galvanizing: 'cout_galvanisation',
  powderCoating: 'cout_thermolaquage',
  motorization: 'cout_motorisation',
  accessories: 'cout_accessoires',
  transport: 'cout_transport',
  consumables: 'cout_consommables',
  rental: 'cout_locations'
});

const WORK_CATEGORIES = Object.freeze([
  'escalier', 'garde-corps', 'portail', 'portillon', 'clôture', 'pergola',
  'verrière', 'charpente', 'mobilier', 'sous-traitance', 'dépannage', 'autre'
]);

const HOUR_CATEGORIES = Object.freeze(['etude', 'atelier', 'pose', 'transport', 'sav', 'autre']);
const ACTUAL_COST_TYPES = Object.freeze([...Object.keys(COST_FIELDS), 'other']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value) {
  return Math.max(0, finite(value));
}

function round2(value) {
  return Math.round((finite(value) + Number.EPSILON) * 100) / 100;
}

function marginMetrics(revenue, cost) {
  const safeRevenue = round2(revenue);
  const safeCost = round2(cost);
  const margin = round2(safeRevenue - safeCost);
  return {
    revenue: safeRevenue,
    cost: safeCost,
    margin,
    marginOnCost: safeCost > 0 ? round2((margin / safeCost) * 100) : null,
    marginOnSale: safeRevenue > 0 ? round2((margin / safeRevenue) * 100) : null
  };
}

function priceForMargin(cost, rate) {
  const safeCost = nonNegative(cost);
  const safeRate = finite(rate);
  if (!safeCost || safeRate >= 100) return null;
  return round2(safeCost / (1 - safeRate / 100));
}

function profitabilityLevel(metrics, rules = PROFITABILITY_RULES) {
  if (metrics.cost > metrics.revenue && metrics.revenue >= 0) return 'red-critical';
  if (metrics.marginOnSale === null || metrics.marginOnSale < rules.minimumMarginOnSale) return 'red';
  if (metrics.marginOnSale < rules.targetMarginOnSale) return 'orange';
  return 'green';
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
}

function detectWorkCategory(quote, lines = []) {
  const text = normalizeText([quote?.title, ...(lines || []).flatMap((line) => [line.category, line.label])].filter(Boolean).join(' '));
  const candidates = [
    ['garde-corps', ['garde-corps', 'garde corps']], ['sous-traitance', ['sous-traitance', 'sous traitance']],
    ['portillon', ['portillon']], ['portail', ['portail']], ['escalier', ['escalier']],
    ['clôture', ['cloture']], ['pergola', ['pergola']], ['verrière', ['verriere']],
    ['charpente', ['charpente']], ['mobilier', ['mobilier']], ['dépannage', ['depannage', 'reparation']]
  ];
  return candidates.find(([, words]) => words.some((word) => text.includes(word)))?.[0] || 'autre';
}

function calculateForecast(quote = {}, lines = [], rules = PROFITABILITY_RULES) {
  const lineTotalHT = round2((lines || []).reduce((sum, line) => sum + finite(line.total, finite(line.qty) * finite(line.unit_price)), 0));
  const explicitTotalHT = Number(quote.total_ht);
  const totalHT = Number.isFinite(explicitTotalHT) && explicitTotalHT >= 0 ? round2(explicitTotalHT) : lineTotalHT;
  const hours = {
    study: nonNegative(quote.heures_etude), workshop: nonNegative(quote.heures_atelier), installation: nonNegative(quote.heures_pose)
  };
  hours.total = round2(hours.study + hours.workshop + hours.installation);
  const hourlyCost = nonNegative(quote.cout_horaire) || rules.defaultHourlyCost;
  const laborCost = round2(hours.total * hourlyCost);
  const breakdown = {};
  for (const [key, field] of Object.entries(COST_FIELDS)) breakdown[key] = nonNegative(quote[field]);
  breakdown.labor = laborCost;
  const detailedCost = round2(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  const storedCost = nonNegative(quote.cout_revient);
  const forecastCost = detailedCost > 0 ? detailedCost : storedCost;
  const costSource = detailedCost > 0 ? 'breakdown' : (storedCost > 0 ? 'existing' : 'missing');
  const metrics = marginMetrics(totalHT, forecastCost);
  const category = WORK_CATEGORIES.includes(quote.work_category) ? quote.work_category : detectWorkCategory(quote, lines);
  return {
    totalHT, breakdown, hours, hourlyCost, laborCost, forecastCost,
    costSource,
    margin: metrics.margin, marginOnCost: metrics.marginOnCost, marginOnSale: metrics.marginOnSale,
    riskLevel: costSource === 'missing' ? 'red' : profitabilityLevel(metrics, rules), category,
    minimumPrice: priceForMargin(forecastCost, rules.minimumMarginOnSale),
    targetPrice: priceForMargin(forecastCost, rules.targetMarginOnSale),
    comfortablePrice: priceForMargin(forecastCost, rules.comfortableMarginOnSale)
  };
}

function buildForecastSnapshot(quote, lines, rules = PROFITABILITY_RULES) {
  const forecast = calculateForecast(quote, lines, rules);
  return { ...forecast, quoteId: Number(quote.id) || null, capturedAt: new Date().toISOString(), rules: { ...rules } };
}

function calculateActual({ order = {}, forecast = null, hours = [], costs = [], invoices = [] } = {}) {
  const hourlyCost = nonNegative(forecast?.hourlyCost) || PROFITABILITY_RULES.defaultHourlyCost;
  const hoursByCategory = Object.fromEntries(HOUR_CATEGORIES.map((category) => [category, 0]));
  for (const row of hours || []) {
    const category = HOUR_CATEGORIES.includes(row.category) ? row.category : 'autre';
    hoursByCategory[category] += nonNegative(row.minutes_total) / 60;
  }
  for (const key of Object.keys(hoursByCategory)) hoursByCategory[key] = round2(hoursByCategory[key]);
  const actualHours = round2(Object.values(hoursByCategory).reduce((sum, value) => sum + value, 0));
  const laborCost = round2(actualHours * hourlyCost);
  const costsByType = Object.fromEntries(ACTUAL_COST_TYPES.map((type) => [type, 0]));
  for (const row of costs || []) {
    const type = ACTUAL_COST_TYPES.includes(row.cost_type) ? row.cost_type : 'other';
    costsByType[type] += nonNegative(row.amount_ht);
  }
  for (const key of Object.keys(costsByType)) costsByType[key] = round2(costsByType[key]);
  const purchasesCost = round2(Object.values(costsByType).reduce((sum, value) => sum + value, 0));
  const actualCost = round2(purchasesCost + laborCost);
  const invoicedHT = round2((invoices || []).reduce((sum, invoice) => sum + nonNegative(invoice.amount_ht), 0));
  const revenueHT = invoicedHT;
  const metrics = marginMetrics(revenueHT, actualCost);
  const forecastHours = nonNegative(forecast?.hours?.total ?? order.planned_hours);
  const hourVariance = round2(actualHours - forecastHours);
  const hourVariancePct = forecastHours > 0 ? round2((hourVariance / forecastHours) * 100) : null;
  const forecastCost = nonNegative(forecast?.forecastCost);
  const costVariance = round2(actualCost - forecastCost);
  const costVariancePct = forecastCost > 0 ? round2((costVariance / forecastCost) * 100) : null;
  const varianceCandidates = [
    ...Object.entries(costsByType).map(([type, value]) => ({ type, variance: round2(value - nonNegative(forecast?.breakdown?.[type])) })),
    { type: 'labor', variance: round2(laborCost - nonNegative(forecast?.laborCost)) }
  ].sort((a, b) => b.variance - a.variance);
  return {
    revenueHT, invoicedHT, costsByType, purchasesCost, laborCost, actualCost,
    margin: metrics.margin, marginOnSale: metrics.marginOnSale, riskLevel: profitabilityLevel(metrics),
    hoursByCategory, actualHours, forecastHours, hourVariance, hourVariancePct,
    forecastCost, costVariance, costVariancePct,
    forecastMargin: forecast?.margin ?? null,
    forecastMarginOnSale: forecast?.marginOnSale ?? null,
    marginPointVariance: forecast?.marginOnSale === null || forecast?.marginOnSale === undefined || metrics.marginOnSale === null
      ? null : round2(metrics.marginOnSale - forecast.marginOnSale),
    mainVarianceCause: varianceCandidates[0]?.variance > 0 ? varianceCandidates[0] : null
  };
}

module.exports = {
  PROFITABILITY_RULES, COST_FIELDS, WORK_CATEGORIES, HOUR_CATEGORIES, ACTUAL_COST_TYPES,
  round2, marginMetrics, priceForMargin, profitabilityLevel, detectWorkCategory,
  calculateForecast, buildForecastSnapshot, calculateActual
};
