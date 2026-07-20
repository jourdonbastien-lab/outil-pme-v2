'use strict';

const PROFITABILITY_RULES = Object.freeze({
  minimumMarginOnSale: 20,
  targetMarginOnSale: 30,
  comfortableMarginOnSale: 35,
  defaultHourlyCost: 55
});

const COST_FIELDS = Object.freeze({
  material: 'cout_matiere',
  laserCutting: 'cout_decoupe_laser',
  subcontracting: 'cout_sous_traitance',
  galvanizing: 'cout_galvanisation',
  powderCoating: 'cout_thermolaquage',
  motorization: 'cout_motorisation',
  accessories: 'cout_accessoires',
  transport: 'cout_transport',
  consumables: 'cout_consommables',
  rental: 'cout_locations',
  other: 'autres_couts'
});

const WORK_CATEGORIES = Object.freeze([
  'escalier', 'garde-corps', 'portail', 'portillon', 'clôture', 'pergola',
  'verrière', 'charpente', 'mobilier', 'motorisation', 'dépannage', 'autre'
]);

const PROFITABILITY_STATUS = Object.freeze({ incomplete: 'incomplete', green: 'green', orange: 'orange', red: 'red' });

const LINE_COST_CATEGORIES = Object.freeze([
  'matière acier', 'inox', 'aluminium', 'bois', 'vitrage', 'quincaillerie', 'accessoires',
  'motorisation', 'galvanisation', 'thermolaquage', 'sous-traitance', 'main-d’œuvre atelier',
  'main-d’œuvre pose', 'déplacement', 'location', 'divers'
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

function marginMetrics(revenue, cost, hasCost = true) {
  const safeRevenue = round2(revenue);
  const safeCost = round2(cost);
  const margin = hasCost ? round2(safeRevenue - safeCost) : null;
  return {
    revenue: safeRevenue,
    cost: safeCost,
    margin,
    marginOnCost: hasCost && safeCost > 0 ? round2((margin / safeCost) * 100) : null,
    marginOnSale: hasCost && safeRevenue > 0 && safeCost > 0 ? round2((margin / safeRevenue) * 100) : null
  };
}

function priceForMargin(cost, rate) {
  const safeCost = nonNegative(cost);
  const safeRate = finite(rate);
  if (!safeCost || safeRate >= 100) return null;
  return round2(safeCost / (1 - safeRate / 100));
}

function profitabilityLevel(metrics, rules = PROFITABILITY_RULES) {
  if (metrics.marginOnSale === null) return PROFITABILITY_STATUS.incomplete;
  if (metrics.cost > metrics.revenue && metrics.revenue >= 0) return PROFITABILITY_STATUS.red;
  if (metrics.marginOnSale < rules.minimumMarginOnSale) return PROFITABILITY_STATUS.red;
  if (metrics.marginOnSale < rules.targetMarginOnSale) return 'orange';
  return 'green';
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
}

function detectWorkCategories(quote, lines = []) {
  const text = normalizeText([quote?.title, ...(lines || []).flatMap((line) => [line.category, line.label])].filter(Boolean).join(' '));
  const candidates = [
    ['garde-corps', ['garde-corps', 'garde corps']],
    ['portillon', ['portillon']], ['portail', ['portail']], ['escalier', ['escalier']],
    ['clôture', ['cloture']], ['pergola', ['pergola']], ['verrière', ['verriere']],
    ['charpente', ['charpente']], ['mobilier', ['mobilier']], ['motorisation', ['motorisation', 'motorise']],
    ['dépannage', ['depannage', 'reparation']]
  ];
  const found = candidates.filter(([, words]) => words.some((word) => text.includes(word))).map(([category]) => category);
  return found.length ? found : ['autre'];
}

function detectWorkCategory(quote, lines = []) { return detectWorkCategories(quote, lines)[0]; }

function normalizeUnit(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function optionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function detectLineCostCategory(line = {}) {
  const recorded = normalizeText(line.cost_category || line.category);
  const text = normalizeText(`${recorded} ${line.label || ''}`);
  const candidates = [
    ['main-d’œuvre pose', ['pose', 'installation']], ['main-d’œuvre atelier', ['main d’œuvre', 'main-d’œuvre', 'atelier', 'fabrication']],
    ['déplacement', ['deplacement', 'transport', 'manutention']], ['sous-traitance', ['sous-traitance', 'sous traitance', 'laser', 'decoupe']],
    ['galvanisation', ['galvan']], ['thermolaquage', ['thermolaqu', 'peinture poudre']], ['motorisation', ['motoris']],
    ['vitrage', ['vitrage', 'verre']], ['quincaillerie', ['quincaillerie', 'fixation']], ['accessoires', ['accessoire', 'cellule', 'telecommande', 'cremaillere']],
    ['location', ['location', 'nacelle']], ['inox', ['inox']], ['aluminium', ['aluminium', 'alu']], ['bois', ['bois']],
    ['matière acier', ['matiere', 'matière', 'acier', 'tube', 'tole', 'tôle', 'hea', 'ipe']]
  ];
  return candidates.find(([, words]) => words.some((word) => text.includes(normalizeText(word))))?.[0] || 'divers';
}

function analyzeQuoteLines({ quote = {}, lines = [], adjustments = [], rules = PROFITABILITY_RULES } = {}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const saleTotalFromLines = round2(safeLines.reduce((sum, line) => sum + nonNegative(line.total || (finite(line.qty) * finite(line.unit_price))), 0));
  const quoteMargin = finite(quote.margin_pct);
  const explicitTotal = Number(quote.total_ht);
  const totalHT = Number.isFinite(explicitTotal) ? round2(explicitTotal) : round2(saleTotalFromLines * (1 + quoteMargin / 100));
  const defaultHourlyCost = nonNegative(quote.cout_horaire) || rules.defaultHourlyCost;
  const categoryCosts = Object.fromEntries(LINE_COST_CATEGORIES.map((category) => [category, 0]));
  const analyzedLines = safeLines.map((line) => {
    const qty = nonNegative(line.qty);
    const saleHT = round2(line.total ?? qty * nonNegative(line.unit_price));
    const category = detectLineCostCategory(line);
    const unit = normalizeUnit(line.unit);
    const isLabor = category.startsWith('main-d’œuvre') || ['h', 'heure', 'heures'].includes(unit);
    const storedTotalCost = optionalNumber(line.cost_total);
    const storedUnitCost = optionalNumber(line.cost_unit);
    const storedHours = optionalNumber(line.hours);
    const storedHourlyCost = optionalNumber(line.hourly_cost);
    let cost = null;
    let hours = null;
    let origin = 'coût non disponible';
    if (Number.isFinite(storedTotalCost) && storedTotalCost >= 0) {
      cost = round2(storedTotalCost); origin = 'montant enregistré';
    } else if (Number.isFinite(storedUnitCost) && storedUnitCost >= 0 && qty > 0) {
      cost = round2(qty * storedUnitCost); origin = 'coût unitaire × quantité';
    } else if (isLabor) {
      hours = Number.isFinite(storedHours) && storedHours >= 0 ? storedHours : (['h', 'heure', 'heures'].includes(unit) ? qty : null);
      if (hours !== null) {
        const hourlyCost = Number.isFinite(storedHourlyCost) && storedHourlyCost > 0 ? storedHourlyCost : defaultHourlyCost;
        cost = round2(hours * hourlyCost);
        origin = Number.isFinite(storedHourlyCost) && storedHourlyCost > 0 ? 'heures × coût horaire de la ligne' : 'heures × coût horaire interne par défaut';
      }
    }
    if (cost !== null) categoryCosts[category] = round2(categoryCosts[category] + cost);
    const margin = cost === null ? null : round2(saleHT - cost);
    const marginOnSale = cost !== null && saleHT > 0 && cost > 0 ? round2((margin / saleHT) * 100) : null;
    return {
      id: Number(line.id) || null, label: String(line.label || ''), recordedCategory: String(line.category || ''), category,
      qty, unit: String(line.unit || ''), saleHT, cost, margin, marginOnSale, hours,
      status: cost === null ? 'missing' : (cost > saleHT ? 'loss' : 'analyzed'), origin,
      significant: saleHT > 0 && (saleHT >= totalHT * 0.05 || ['matière acier', 'inox', 'aluminium', 'main-d’œuvre atelier', 'main-d’œuvre pose', 'sous-traitance'].includes(category))
    };
  });
  const validAdjustments = (Array.isArray(adjustments) ? adjustments : []).filter((item) => {
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return false;
    const linked = Number(item?.lineId);
    return !linked || !analyzedLines.some((line) => line.id === linked && line.cost !== null);
  }).map((item) => ({ id: String(item.id || ''), label: String(item.label || 'Ajustement'), type: String(item.type || 'divers'), amount: round2(item.amount), lineId: Number(item.lineId) || null }));
  const detectedCost = round2(analyzedLines.reduce((sum, line) => sum + (line.cost ?? 0), 0));
  const adjustmentsCost = round2(validAdjustments.reduce((sum, item) => sum + item.amount, 0));
  const totalCost = round2(detectedCost + adjustmentsCost);
  const missingLines = analyzedLines.filter((line) => line.cost === null && line.saleHT > 0);
  const significantMissing = missingLines.filter((line) => line.significant);
  const reliability = !missingLines.length ? 'complete' : significantMissing.length ? 'incomplete' : 'partial';
  const metricsReliable = !missingLines.length && totalCost > 0;
  const metrics = marginMetrics(totalHT, totalCost, metricsReliable);
  const status = metricsReliable ? profitabilityLevel(metrics, rules) : PROFITABILITY_STATUS.incomplete;
  const laborCategories = ['main-d’œuvre atelier', 'main-d’œuvre pose'];
  const materialCategories = ['matière acier', 'inox', 'aluminium', 'bois', 'vitrage', 'quincaillerie', 'accessoires', 'motorisation'];
  const materialCost = round2(materialCategories.reduce((sum, category) => sum + categoryCosts[category], 0));
  const laborCost = round2(laborCategories.reduce((sum, category) => sum + categoryCosts[category], 0));
  const subcontractingCost = categoryCosts['sous-traitance'];
  const otherDetectedCost = round2(detectedCost - materialCost - laborCost - subcontractingCost);
  return {
    engineVersion: 2, totalHT, lineSaleTotal: saleTotalFromLines, status, critical: metricsReliable && totalCost > totalHT,
    reliability, counts: { total: analyzedLines.length, analyzed: analyzedLines.length - missingLines.length, missing: missingLines.length },
    missingSaleHT: round2(missingLines.reduce((sum, line) => sum + line.saleHT, 0)), lines: analyzedLines,
    categoryCosts, materialCost, subcontractingCost, laborCost, otherDetectedCost, detectedCost,
    adjustments: validAdjustments, adjustmentsCost, totalCost, margin: metrics.margin,
    marginOnCost: metrics.marginOnCost, marginOnSale: metrics.marginOnSale,
    minimumPrice: metricsReliable ? priceForMargin(totalCost, rules.minimumMarginOnSale) : null,
    targetPrice: metricsReliable ? priceForMargin(totalCost, rules.targetMarginOnSale) : null,
    comfortablePrice: metricsReliable ? priceForMargin(totalCost, rules.comfortableMarginOnSale) : null
  };
}

function calculateForecast(quote = {}, lines = [], rules = PROFITABILITY_RULES) {
  const lineTotalHT = round2((lines || []).reduce((sum, line) => sum + finite(line.total, finite(line.qty) * finite(line.unit_price)), 0));
  const explicitTotalHT = Number(quote.total_ht);
  const totalHT = Number.isFinite(explicitTotalHT) && explicitTotalHT >= 0 ? round2(explicitTotalHT) : lineTotalHT;
  const hours = {
    study: nonNegative(quote.heures_etude), workshop: nonNegative(quote.heures_atelier), installation: nonNegative(quote.heures_pose),
    transport: nonNegative(quote.heures_transport), sav: nonNegative(quote.heures_sav)
  };
  hours.total = round2(hours.study + hours.workshop + hours.installation + hours.transport + hours.sav);
  const hourlyCost = nonNegative(quote.cout_horaire) || rules.defaultHourlyCost;
  const laborCost = round2(hours.total * hourlyCost);
  const breakdown = {};
  for (const [key, field] of Object.entries(COST_FIELDS)) breakdown[key] = nonNegative(quote[field]);
  breakdown.labor = laborCost;
  const detailedCost = round2(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  const storedCost = nonNegative(quote.cout_revient);
  const forecastCost = detailedCost > 0 ? detailedCost : storedCost;
  const costSource = detailedCost > 0 ? 'breakdown' : (storedCost > 0 ? 'existing' : 'missing');
  const hasCost = costSource !== 'missing';
  const metrics = marginMetrics(totalHT, forecastCost, hasCost);
  let categories = Array.isArray(quote.work_categories) ? quote.work_categories.filter((item) => WORK_CATEGORIES.includes(item)) : [];
  if (!categories.length) categories = WORK_CATEGORIES.includes(quote.work_category) ? [quote.work_category] : detectWorkCategories(quote, lines);
  return {
    totalHT, breakdown, hours, hourlyCost, laborCost, forecastCost,
    costSource,
    margin: metrics.margin, marginOnCost: metrics.marginOnCost, marginOnSale: metrics.marginOnSale,
    riskLevel: hasCost ? profitabilityLevel(metrics, rules) : PROFITABILITY_STATUS.incomplete,
    critical: hasCost && forecastCost > totalHT, category: categories[0], categories,
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
  PROFITABILITY_RULES, PROFITABILITY_STATUS, COST_FIELDS, WORK_CATEGORIES, HOUR_CATEGORIES, ACTUAL_COST_TYPES,
  round2, marginMetrics, priceForMargin, profitabilityLevel, detectWorkCategory,
  LINE_COST_CATEGORIES, detectWorkCategories, detectLineCostCategory, analyzeQuoteLines,
  calculateForecast, buildForecastSnapshot, calculateActual
};
