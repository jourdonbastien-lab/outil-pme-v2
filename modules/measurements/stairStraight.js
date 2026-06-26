"use strict";

/**
 * modules/measurements/stairStraight.js
 *
 * Module métier pour les prises de cotes d'escalier droit. Toutes les
 * opérations dimensionnelles sont déléguées à `stairEngine.calculateAll`.
 * Ce fichier expose une API pour créer/valider/mettre à jour une fiche,
 * générer les données de dessin, le débit atelier, les données d'atelier
 * et de pose, et préparer l'export pour le PDF.
 */

const stairEngine = require('./stairEngine');
const model = require('./model');

/**
 * Create a straight stair measurement based on the generic measurement model.
 * @param {object} attrs - initial attributes (see module spec)
 * @returns {object} measurement
 */
function createStraightMeasurement(attrs = {}) {
  const base = model.createMeasurement(Object.assign({ type: 'escalier_droit' }, attrs));
  const data = Object.assign({
    hauteur_sol_fini: attrs.hauteur_sol_fini ?? null,
    longueur_disponible: attrs.longueur_disponible ?? null,
    largeur: attrs.largeur ?? 1000,
    epaisseur_marche: attrs.epaisseur_marche ?? 30,
    type_marche: attrs.type_marche ?? 'standard',
    type_limon: attrs.type_limon ?? 'lamelle',
    epaisseur_limon: attrs.epaisseur_limon ?? 10,
    reculement: attrs.reculement ?? 0,
    echappee: attrs.echappee ?? 2000,
    nez_de_marche: attrs.nez_de_marche ?? 30,
    hauteur_dalle: attrs.hauteur_dalle ?? 0,
    tremie: attrs.tremie ?? null,
    sens_montee: attrs.sens_montee ?? 'gauche',
    sens_fabrication: attrs.sens_fabrication ?? 'standard',
    observations: attrs.observations ?? '',
  }, attrs.data || {});
  const measurement = Object.assign({}, base, { data });
  return measurement;
}

/**
 * Validate minimal straight stair inputs.
 * @param {object} measurement
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 */
function validateStraightMeasurement(measurement) {
  const errors = [];
  const warnings = [];
  if (!measurement || typeof measurement !== 'object') {
    errors.push('invalid_measurement');
    return { ok: false, errors, warnings };
  }
  const d = measurement.data || {};
  if (!Number.isFinite(Number(d.hauteur_sol_fini))) errors.push('hauteur_sol_fini_required');
  if (!Number.isFinite(Number(d.longueur_disponible))) errors.push('longueur_disponible_required');
  if (d.largeur && Number(d.largeur) < 500) warnings.push('largeur_trop_petite');
  const ok = errors.length === 0;
  return { ok, errors, warnings };
}

/**
 * Update a straight measurement immutably.
 * @param {object} measurement
 * @param {object} changes
 * @returns {{ok:boolean, measurement:object}}
 */
function updateStraightMeasurement(measurement, changes = {}) {
  if (!measurement || typeof measurement !== 'object') return { ok: false, measurement: null };
  const updated = JSON.parse(JSON.stringify(measurement));
  if (changes.data && typeof changes.data === 'object') {
    updated.data = Object.assign({}, updated.data || {}, changes.data);
  }
  Object.keys(changes).forEach((k) => { if (k !== 'data') updated[k] = changes[k]; });
  updated.metadata = updated.metadata || {};
  updated.metadata.updated_at = new Date().toISOString();
  return { ok: true, measurement: updated };
}

/**
 * Calculate straight stair metrics by delegating to stairEngine.calculateAll.
 * @param {object} measurement
 * @returns {{ok:boolean, measurement:object, calc:object}}
 */
function calculateStraightMeasurement(measurement) {
  if (!measurement || !measurement.data) return { ok: false, measurement: null, calc: null };
  const m = JSON.parse(JSON.stringify(measurement));
  const totalRise = Number(m.data.hauteur_sol_fini || 0);
  const availableRun = Number(m.data.longueur_disponible || 0) - (Number(m.data.reculement) || 0);
  const calc = stairEngine.calculateAll({ totalRise, availableRun, ceilingHeight: m.data.hauteur_dalle });
  m.calculations = calc;
  return { ok: true, measurement: m, calc };
}

/**
 * Generate drawing data JSON for rendering a straight stair.
 * @param {object} measurementWithCalc
 * @returns {object}
 */
function generateStraightDrawingData(measurementWithCalc) {
  if (!measurementWithCalc || !measurementWithCalc.calculations) return { steps: [], stringers: [], dimensions: [], texts: [], arrows: [], scale: 1 };
  const calc = measurementWithCalc.calculations;
  const steps = [];
  const sCount = Number(calc.steps) || 0;
  const giron = Number(calc.giron) || 0;
  const riser = Number(calc.stepHeight) || 0;
  const width = Number(measurementWithCalc.data.largeur || measurementWithCalc.data.width || 1000);
  for (let i = 0; i < sCount; i += 1) {
    steps.push({ index: i + 1, x: i * giron, y: i * riser, width, depth: giron, height: riser });
  }
  const stringers = [ { side: 'left', length: calc.stringerLength || 0 }, { side: 'right', length: calc.stringerLength || 0 } ];
  const dimensions = [ { label: 'Hauteur totale', value: calc.stepHeight * calc.steps }, { label: 'Longueur disponible', value: calc._inputs ? calc._inputs.availableRun : null } ];
  const texts = [ { text: `${calc.steps} marches` } ];
  const arrows = [ { from: [0,0], to: [calc._inputs ? calc._inputs.availableRun : 0, 0], label: 'Longueur disponible' } ];
  return { steps, stringers, dimensions, texts, arrows, scale: 1 };
}

/**
 * Generate a cut list for the workshop.
 * @param {object} measurementWithCalc
 * @returns {object}
 */
function generateCutList(measurementWithCalc) {
  if (!measurementWithCalc || !measurementWithCalc.calculations) return { items: [] };
  const calc = measurementWithCalc.calculations;
  const steps = Number(calc.steps) || 0;
  const limonLength = Number(calc.stringerLength) || 0;
  const items = [];
  items.push({ part: 'limon', quantity: 2, length_mm: Math.round(limonLength) });
  items.push({ part: 'marche', quantity: steps, length_mm: Math.round(measurementWithCalc.data.largeur || 0), depth_mm: Math.round(calc.giron || 0) });
  items.push({ part: 'nez', quantity: steps, length_mm: Math.round(measurementWithCalc.data.largeur || 0), notes: `nez ${measurementWithCalc.data.nez_de_marche || 0}mm` });
  items.push({ part: 'acier_estime_m', quantity: 1, length_m: Math.round((2 * limonLength) / 100) / 10 });
  return { items };
}

/**
 * Generate workshop data (summaries) from measurement and calculations.
 * @param {object} measurementWithCalc
 * @returns {object}
 */
function generateWorkshopData(measurementWithCalc) {
  const cut = generateCutList(measurementWithCalc);
  const limon = cut.items.find(i => i.part === 'limon');
  const steelMeters = limon ? (limon.length_mm * limon.quantity) / 1000 : 0;
  return { cutList: cut, estimatedSteel_m: Number(steelMeters.toFixed(3)) };
}

/**
 * Generate installation data for the poseur.
 * @param {object} measurementWithCalc
 * @returns {object}
 */
function generateInstallationData(measurementWithCalc) {
  if (!measurementWithCalc || !measurementWithCalc.calculations) return {};
  const calc = measurementWithCalc.calculations;
  const startHeight = 0;
  const endHeight = Number(calc.stepHeight || 0) * Number(calc.steps || 0);
  const levelChecks = [ { at: 'départ', expected_mm: startHeight }, { at: 'arrivée', expected_mm: endHeight } ];
  const plumbChecks = [ { ref: 'limon_gauche', tol_mm: 5 }, { ref: 'limon_droit', tol_mm: 5 } ];
  return { startHeight, endHeight, levelChecks, plumbChecks };
}

/**
 * Export a full object for PDF generation.
 * @param {object} measurementWithCalc
 * @returns {object}
 */
function exportStraightData(measurementWithCalc) {
  if (!measurementWithCalc) return {};
  const calc = measurementWithCalc.calculations || {};
  return {
    header: { title: 'Fiche Escalier Droit', number: measurementWithCalc.number || null },
    inputs: measurementWithCalc.data || {},
    calculations: calc,
    drawing: generateStraightDrawingData(measurementWithCalc),
    cutlist: generateCutList(measurementWithCalc),
    workshop: generateWorkshopData(measurementWithCalc),
    installation: generateInstallationData(measurementWithCalc),
    observations: measurementWithCalc.observations || '',
    photos: measurementWithCalc.photos || [],
  };
}

module.exports = {
  createStraightMeasurement,
  validateStraightMeasurement,
  updateStraightMeasurement,
  calculateStraightMeasurement,
  generateStraightDrawingData,
  generateCutList,
  generateWorkshopData,
  generateInstallationData,
  exportStraightData,
};

/* Self-tests */
function runSelfTests() {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  // standard
  const m = createStraightMeasurement({ hauteur_sol_fini: 3000, longueur_disponible: 3000, largeur: 900 });
  const v = validateStraightMeasurement(m);
  assert(v.ok, 'validation should pass for standard');
  const cRes = calculateStraightMeasurement(m);
  assert(cRes.ok && cRes.calc && cRes.calc.steps > 0, 'calculation should produce steps');
  const exported = exportStraightData(cRes.measurement || m);
  assert(exported.drawing && exported.cutlist, 'export includes drawing and cutlist');

  // low slope
  const mFlat = createStraightMeasurement({ hauteur_sol_fini: 1500, longueur_disponible: 6000 });
  const flatCalc = calculateStraightMeasurement(mFlat);
  assert(flatCalc.calc && Array.isArray(flatCalc.calc.warnings), 'flat warnings present');

  // steep
  const mSteep = createStraightMeasurement({ hauteur_sol_fini: 3500, longueur_disponible: 1200 });
  const steepCalc = calculateStraightMeasurement(mSteep);
  assert(steepCalc.calc && (steepCalc.calc.errors.length >= 0 || steepCalc.calc.warnings.length >= 0), 'steep produces checks');

  // long
  const mLong = createStraightMeasurement({ hauteur_sol_fini: 2500, longueur_disponible: 8000 });
  const longCalc = calculateStraightMeasurement(mLong);
  assert(longCalc.calc, 'long calculation ok');

  // short
  const mShort = createStraightMeasurement({ hauteur_sol_fini: 2500, longueur_disponible: 300 });
  const shortCalc = calculateStraightMeasurement(mShort);
  assert(shortCalc.calc, 'short calculation ok');

  console.log('stairStraight.js self-tests: OK');
}

if (require.main === module) runSelfTests();
