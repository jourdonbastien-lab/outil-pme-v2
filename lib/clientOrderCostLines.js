'use strict';

const LINE_TYPES = Object.freeze(['labor', 'material', 'other']);
const SOURCE_TYPES = Object.freeze(['manual', 'quote']);
const LABOR_CATEGORIES = Object.freeze(['Étude', 'Fabrication', 'Soudure', 'Finition', 'Pose', 'Déplacement', 'Sous-traitance', 'Autre']);
const MATERIAL_UNITS = Object.freeze(['u', 'ml', 'm²', 'kg', 'forfait']);

function parseFrenchNumber(value, fallback = null) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function limited(value, max) {
  return String(value || '').trim().slice(0, max);
}

function validateLine(input = {}) {
  const lineType = String(input.line_type || '').trim();
  if (!LINE_TYPES.includes(lineType)) throw new Error('Type de ligne invalide.');
  const designation = limited(input.designation, 255);
  if (!designation) throw new Error('La désignation est obligatoire.');
  const category = limited(input.category, 100);
  const supplier = limited(input.supplier, 255);
  const notes = limited(input.notes, 2000);
  const sourceType = SOURCE_TYPES.includes(String(input.source_type || 'manual')) ? String(input.source_type || 'manual') : 'manual';
  const quantity = parseFrenchNumber(input.quantity, lineType === 'labor' ? 0 : 1);
  const unitCostHT = parseFrenchNumber(input.unit_cost_ht, 0);
  const unitSaleHT = parseFrenchNumber(input.unit_sale_ht, 0);
  const hourlyCostHT = parseFrenchNumber(input.hourly_cost_ht, 0);
  const hourlySaleHT = parseFrenchNumber(input.hourly_sale_ht, 0);
  let plannedMinutes = Number.parseInt(String(input.planned_minutes ?? ''), 10);
  if (lineType === 'labor' && (input.planned_hours !== undefined || !Number.isFinite(plannedMinutes))) {
    const hours = parseFrenchNumber(input.planned_hours, 0);
    plannedMinutes = Math.round(hours * 60);
  }
  if (!Number.isFinite(plannedMinutes)) plannedMinutes = 0;
  for (const [label, value] of Object.entries({ quantité: quantity, durée: plannedMinutes, achat: unitCostHT, vente: unitSaleHT, coûtHoraire: hourlyCostHT, venteHoraire: hourlySaleHT })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} doit être un nombre positif ou nul.`);
  }
  const unit = limited(input.unit, 30) || (lineType === 'labor' ? 'h' : 'u');
  return {
    line_type: lineType, category: category || null, designation,
    quantity: lineType === 'labor' ? 0 : quantity, unit,
    unit_cost_ht: lineType === 'labor' ? 0 : unitCostHT,
    unit_sale_ht: lineType === 'labor' ? 0 : unitSaleHT,
    planned_minutes: lineType === 'labor' ? plannedMinutes : 0,
    hourly_cost_ht: lineType === 'labor' ? hourlyCostHT : 0,
    hourly_sale_ht: lineType === 'labor' ? hourlySaleHT : 0,
    supplier: supplier || null, notes: notes || null, source_type: sourceType
  };
}

function calculateLine(line = {}) {
  const type = LINE_TYPES.includes(line.line_type) ? line.line_type : 'other';
  const hours = type === 'labor' ? Math.max(0, Number(line.planned_minutes || 0)) / 60 : 0;
  const quantity = type === 'labor' ? 0 : Math.max(0, Number(line.quantity || 0));
  const cost = type === 'labor'
    ? round2(hours * Math.max(0, Number(line.hourly_cost_ht || 0)))
    : round2(quantity * Math.max(0, Number(line.unit_cost_ht || 0)));
  const sale = type === 'labor'
    ? round2(hours * Math.max(0, Number(line.hourly_sale_ht || 0)))
    : round2(quantity * Math.max(0, Number(line.unit_sale_ht || 0)));
  return { cost, sale, margin: round2(sale - cost), hours: round2(hours) };
}

function quoteLineToCostLine(line = {}) {
  const unit = String(line.unit || '').trim().toLocaleLowerCase('fr-FR');
  const category = limited(line.cost_category || line.category, 100);
  const designation = limited(line.label || 'Ligne du devis', 255);
  const search = `${category} ${designation}`.toLocaleLowerCase('fr-FR');
  const laborWords = ['main-d’œuvre', "main-d'oeuvre", 'main d’œuvre', "main d'oeuvre", 'fabrication', 'pose', 'étude', 'atelier', 'déplacement'];
  const otherWords = ['sous-traitance', 'galvanisation', 'thermolaquage', 'transport', 'location', 'forfait'];
  const isLabor = Number(line.hours || 0) > 0 || ['h', 'heure', 'heures'].includes(unit) || laborWords.some((word) => search.includes(word));
  const isOther = !isLabor && otherWords.some((word) => search.includes(word));
  const lineType = isLabor ? 'labor' : isOther ? 'other' : 'material';
  const hours = Math.max(0, parseFrenchNumber(line.hours, isLabor ? parseFrenchNumber(line.qty, 0) : 0) || 0);
  const quantity = lineType === 'labor' ? 0 : Math.max(0, parseFrenchNumber(line.qty, 1) || 0);
  const reliableCostTotal = Math.max(0, parseFrenchNumber(line.cost_total, 0) || 0);
  const explicitUnitCost = Math.max(0, parseFrenchNumber(line.cost_unit, 0) || 0);
  const unitCost = explicitUnitCost || (quantity > 0 ? round2(reliableCostTotal / quantity) : 0);
  const hourlyCost = Math.max(0, parseFrenchNumber(line.hourly_cost, 0) || 0) || (hours > 0 ? round2(reliableCostTotal / hours) : unitCost);
  return {
    line_type: lineType,
    category: category || null,
    designation,
    quantity,
    unit: lineType === 'labor' ? 'h' : limited(line.unit, 30) || (lineType === 'other' ? 'forfait' : 'u'),
    unit_cost_ht: lineType === 'labor' ? 0 : unitCost,
    unit_sale_ht: lineType === 'labor' ? 0 : Math.max(0, parseFrenchNumber(line.unit_price, 0) || 0),
    planned_minutes: lineType === 'labor' ? Math.round(hours * 60) : 0,
    hourly_cost_ht: lineType === 'labor' ? hourlyCost : 0,
    hourly_sale_ht: lineType === 'labor' ? Math.max(0, parseFrenchNumber(line.unit_price, 0) || 0) : 0,
    incomplete_cost: lineType === 'labor'
      ? !(hourlyCost > 0)
      : !(unitCost > 0)
  };
}

function summarize(lines = [], contractPrice = 0, actualMinutes = 0, actualMaterialCost = null) {
  const groups = {
    labor: { cost: 0, sale: 0, margin: 0, hours: 0, count: 0 },
    material: { cost: 0, sale: 0, margin: 0, hours: 0, count: 0 },
    other: { cost: 0, sale: 0, margin: 0, hours: 0, count: 0 }
  };
  for (const line of lines || []) {
    const type = LINE_TYPES.includes(line.line_type) ? line.line_type : 'other';
    const calculated = calculateLine(line);
    for (const field of ['cost', 'sale', 'margin', 'hours']) groups[type][field] = round2(groups[type][field] + calculated[field]);
    groups[type].count += 1;
  }
  const totalCost = round2(Object.values(groups).reduce((sum, group) => sum + group.cost, 0));
  const totalSale = round2(Object.values(groups).reduce((sum, group) => sum + group.sale, 0));
  const margin = round2(totalSale - totalCost);
  const contract = round2(Math.max(0, Number(contractPrice || 0)));
  const actualHours = round2(Math.max(0, Number(actualMinutes || 0)) / 60);
  return {
    groups, totalCost, totalSale, margin,
    marginRate: totalCost > 0 ? round2((margin / totalCost) * 100) : null,
    markupRate: totalSale > 0 ? round2((margin / totalSale) * 100) : null,
    plannedHours: groups.labor.hours, actualHours,
    hoursVariance: round2(actualHours - groups.labor.hours),
    actualLaborCost: round2(actualHours * (groups.labor.hours > 0 ? groups.labor.cost / groups.labor.hours : 0)),
    actualMaterialCost: actualMaterialCost === null ? null : round2(actualMaterialCost),
    contractPrice: contract, contractVariance: round2(contract - totalSale)
  };
}

module.exports = { LINE_TYPES, SOURCE_TYPES, LABOR_CATEGORIES, MATERIAL_UNITS, parseFrenchNumber, validateLine, calculateLine, quoteLineToCostLine, summarize };
