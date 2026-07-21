'use strict';

const clientOrderCostLines = require('./clientOrderCostLines');
const projectProfitability = require('./projectProfitability');

function normalizeNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const number = Number(String(value).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function roundAmount(value) {
  return Math.round((normalizeNumber(value) + Number.EPSILON) * 100) / 100;
}

function calculateRemainingToInvoice(expectedExVat, invoicedExVat) {
  return roundAmount(Math.max(roundAmount(expectedExVat) - roundAmount(invoicedExVat), 0));
}

function calculateMargin(revenue, cost) {
  const safeRevenue = roundAmount(revenue);
  const amount = roundAmount(safeRevenue - roundAmount(cost));
  return { amount, rate: safeRevenue > 0 ? roundAmount((amount / safeRevenue) * 100) : 0 };
}

function addCostCategories(categories = {}) {
  const normalized = {
    material: roundAmount(categories.material),
    labor: roundAmount(categories.labor),
    subcontracting: roundAmount(categories.subcontracting),
    other: roundAmount(categories.other)
  };
  return { ...normalized, total: roundAmount(Object.values(normalized).reduce((sum, value) => sum + value, 0)) };
}

function calculateRemainingHours(budgeted, actual) {
  return roundAmount(Math.max(normalizeNumber(budgeted) - normalizeNumber(actual), 0));
}

function isSubcontractingLine(line = {}) {
  const text = `${line.category || ''} ${line.designation || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
  return /sous[- ]?traitance/.test(text);
}

function budgetFromLines(lines = []) {
  const categories = { material: 0, labor: 0, subcontracting: 0, other: 0 };
  let budgetedHours = 0;
  for (const line of lines) {
    const calculated = clientOrderCostLines.calculateLine(line);
    if (line.line_type === 'labor') {
      categories.labor += calculated.cost;
      budgetedHours += calculated.hours;
    } else if (isSubcontractingLine(line)) {
      categories.subcontracting += calculated.cost;
    } else if (line.line_type === 'material') {
      categories.material += calculated.cost;
    } else {
      categories.other += calculated.cost;
    }
  }
  return { budget: addCostCategories(categories), budgetedHours: roundAmount(budgetedHours), source: 'client_order_cost_lines' };
}

function parseLegacyForecast(row) {
  if (!row) return null;
  try {
    const parsed = JSON.parse(String(row.snapshot_json || ''));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  return {
    breakdown: {
      material: row.material_cost,
      subcontracting: row.subcontracting_cost,
      galvanizing: row.galvanizing_cost,
      powderCoating: row.powder_coating_cost,
      motorization: row.motorization_cost,
      accessories: row.accessories_cost,
      transport: row.transport_cost,
      consumables: row.consumables_cost,
      rental: row.rental_cost
    },
    hours: { study: row.study_hours, workshop: row.workshop_hours, installation: row.installation_hours },
    hourlyCost: row.hourly_cost,
    laborCost: roundAmount(normalizeNumber(row.hourly_cost) * (
      normalizeNumber(row.study_hours) + normalizeNumber(row.workshop_hours) + normalizeNumber(row.installation_hours)
    )),
    forecastCost: row.forecast_cost
  };
}

function budgetFromLegacyForecast(row, order = {}) {
  const forecast = parseLegacyForecast(row);
  if (!forecast) {
    return {
      budget: addCostCategories(),
      budgetedHours: roundAmount(order.planned_hours),
      hourlyCost: projectProfitability.PROFITABILITY_RULES.defaultHourlyCost,
      source: 'none'
    };
  }
  const breakdown = forecast.breakdown || {};
  const material = normalizeNumber(breakdown.material);
  const subcontracting = normalizeNumber(breakdown.subcontracting);
  const labor = normalizeNumber(forecast.laborCost);
  const known = material + subcontracting + labor;
  const total = normalizeNumber(forecast.forecastCost);
  const explicitOther = Object.entries(breakdown)
    .filter(([key]) => !['material', 'subcontracting', 'labor'].includes(key))
    .reduce((sum, [, value]) => sum + normalizeNumber(value), 0);
  const other = explicitOther > 0 ? explicitOther : Math.max(total - known, 0);
  const hours = forecast.hours || {};
  const budgetedHours = normalizeNumber(hours.total)
    || Object.values(hours).reduce((sum, value) => sum + normalizeNumber(value), 0)
    || normalizeNumber(order.planned_hours);
  return {
    budget: addCostCategories({ material, labor, subcontracting, other }),
    budgetedHours: roundAmount(budgetedHours),
    hourlyCost: normalizeNumber(forecast.hourlyCost) || projectProfitability.PROFITABILITY_RULES.defaultHourlyCost,
    source: 'project_profitability_forecasts'
  };
}

function buildClientOrderFinancialSnapshot({ order = {}, budgetLines = [], invoices = [], hours = [], actualCosts = [], legacyForecast = null } = {}) {
  const warnings = [];
  const expectedExVat = roundAmount(order.price);
  const invoiceIds = new Set();
  const invoicedExVat = roundAmount(invoices.reduce((sum, invoice) => {
    const id = Number(invoice.id || 0);
    if (id > 0 && invoiceIds.has(id)) return sum;
    if (id > 0) invoiceIds.add(id);
    return sum + normalizeNumber(invoice.amount_ht);
  }, 0));
  if (invoicedExVat > expectedExVat) warnings.push('Le montant facturé HT dépasse le chiffre d’affaires prévu HT.');

  const budgetData = budgetLines.length
    ? budgetFromLines(budgetLines)
    : budgetFromLegacyForecast(legacyForecast, order);
  const actualHours = roundAmount(hours.reduce((sum, row) => sum + normalizeNumber(row.minutes_total) / 60, 0));
  const averageBudgetHourlyCost = budgetData.budgetedHours > 0 && budgetData.budget.labor > 0
    ? budgetData.budget.labor / budgetData.budgetedHours
    : 0;
  const hourlyCost = averageBudgetHourlyCost
    || budgetData.hourlyCost
    || projectProfitability.PROFITABILITY_RULES.defaultHourlyCost;
  const actualCategories = { material: 0, labor: roundAmount(actualHours * hourlyCost), subcontracting: 0, other: 0 };
  for (const cost of actualCosts) {
    const type = String(cost.cost_type || 'other');
    if (type === 'material') actualCategories.material += normalizeNumber(cost.amount_ht);
    else if (type === 'subcontracting') actualCategories.subcontracting += normalizeNumber(cost.amount_ht);
    else actualCategories.other += normalizeNumber(cost.amount_ht);
  }
  const actual = addCostCategories(actualCategories);
  const forecastMargin = calculateMargin(expectedExVat, budgetData.budget.total);
  const actualMargin = calculateMargin(invoicedExVat, actual.total);

  return {
    clientOrderId: Number(order.id || 0),
    revenue: {
      expectedExVat,
      invoicedExVat,
      remainingToInvoiceExVat: calculateRemainingToInvoice(expectedExVat, invoicedExVat)
    },
    budget: budgetData.budget,
    actual,
    margin: {
      forecastAmount: forecastMargin.amount,
      forecastRate: forecastMargin.rate,
      actualAmount: actualMargin.amount,
      actualRate: actualMargin.rate
    },
    hours: {
      budgeted: budgetData.budgetedHours,
      actual: actualHours,
      remaining: calculateRemainingHours(budgetData.budgetedHours, actualHours)
    },
    warnings,
    sources: {
      expectedRevenue: 'client_orders.price',
      invoicedRevenue: 'client_order_invoices.amount_ht',
      budget: budgetData.source,
      actualLaborRate: averageBudgetHourlyCost > 0 ? 'client_order_cost_lines labor weighted average' : budgetData.source === 'project_profitability_forecasts' ? 'project_profitability_forecasts.hourly_cost' : 'projectProfitability.PROFITABILITY_RULES.defaultHourlyCost',
      actualCosts: 'project_actual_costs.amount_ht'
    }
  };
}

function getClientOrderFinancialSnapshot(db, clientOrderId) {
  const orderId = Number(clientOrderId || 0);
  if (!Number.isInteger(orderId) || orderId <= 0) throw new Error('Identifiant de commande invalide.');
  const order = db.prepare('SELECT * FROM client_orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const budgetLines = db.prepare('SELECT * FROM client_order_cost_lines WHERE client_order_id = ? ORDER BY sort_order, id').all(orderId);
  const invoices = db.prepare('SELECT id, amount_ht FROM client_order_invoices WHERE client_order_id = ? ORDER BY id').all(orderId);
  const hours = db.prepare(`
    SELECT id, minutes_total FROM chantier_hours
    WHERE client_order_id = ?
       OR (client_order_id IS NULL AND client = ? AND order_name IN (?, ?))
    ORDER BY id
  `).all(orderId, String(order.name || ''), String(order.description || ''), `Commande_${orderId}`);
  const actualCosts = db.prepare('SELECT id, cost_type, amount_ht FROM project_actual_costs WHERE client_order_id = ? ORDER BY id').all(orderId);
  const legacyForecast = budgetLines.length ? null : db.prepare(`
    SELECT * FROM project_profitability_forecasts
    WHERE client_order_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
  `).get(orderId);
  return buildClientOrderFinancialSnapshot({ order, budgetLines, invoices, hours, actualCosts, legacyForecast });
}

module.exports = {
  normalizeNumber,
  roundAmount,
  calculateRemainingToInvoice,
  calculateMargin,
  addCostCategories,
  calculateRemainingHours,
  budgetFromLines,
  budgetFromLegacyForecast,
  buildClientOrderFinancialSnapshot,
  getClientOrderFinancialSnapshot
};
