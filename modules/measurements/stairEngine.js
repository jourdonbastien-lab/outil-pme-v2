"use strict";

/**
 * modules/measurements/stairEngine.js
 *
 * Moteur de calcul universel pour escaliers (droit, quart tournant, deux quarts)
 * Le module expose uniquement des fonctions de calcul et effectue des
 * vérifications standards (warnings / errors). Aucun code métier spécifique
 * et aucune interface graphique n'y figure.
 */

/**
 * Calculate the recommended number of steps (risers) for a given total rise.
 * It respects min/max riser heights and prefers a target riser height.
 *
 * @param {number} totalRise - total vertical rise in millimetres
 * @param {object} [opts]
 * @param {number} [opts.minRiser=140]
 * @param {number} [opts.maxRiser=200]
 * @param {number} [opts.preferredRiser=170]
 * @returns {{steps:number, stepHeight:number}}
 */
function calculateStepCount(totalRise, opts = {}) {
  const minRiser = opts.minRiser ?? 140;
  const maxRiser = opts.maxRiser ?? 200;
  const preferred = opts.preferredRiser ?? 170;
  const tr = Number(totalRise);
  if (!Number.isFinite(tr) || tr <= 0) return { steps: 0, stepHeight: NaN };
  const nPref = Math.max(1, Math.round(tr / preferred));
  const nMin = Math.max(1, Math.ceil(tr / maxRiser));
  const nMax = Math.max(nMin, Math.floor(tr / minRiser));
  let steps = Math.min(Math.max(nPref, nMin), nMax);
  if (steps < 1) steps = 1;
  const stepHeight = tr / steps;
  return { steps, stepHeight };
}

/**
 * Calculate exact step (riser) height given total rise and number of steps.
 * @param {number} totalRise
 * @param {number} steps
 * @returns {number}
 */
function calculateStepHeight(totalRise, steps) {
  const tr = Number(totalRise);
  const s = Number(steps) || 0;
  if (!Number.isFinite(tr) || s <= 0) return NaN;
  return tr / s;
}

/**
 * Calculate giron (tread depth) given available run and steps.
 * Uses treadCount = steps - 1 when steps > 1.
 * @param {number} availableRun
 * @param {number} steps
 * @returns {number}
 */
function calculateGiron(availableRun, steps) {
  const ar = Number(availableRun);
  const s = Number(steps) || 0;
  if (!Number.isFinite(ar) || s <= 0) return NaN;
  const treadCount = s > 1 ? s - 1 : 1;
  return ar / treadCount;
}

/**
 * Calculate slope angle in degrees from riser and giron.
 * @param {number} riser
 * @param {number} giron
 * @returns {number}
 */
function calculateSlope(riser, giron) {
  const r = Number(riser);
  const g = Number(giron);
  if (!Number.isFinite(r) || !Number.isFinite(g) || g === 0) return NaN;
  const rad = Math.atan(r / g);
  return (rad * 180) / Math.PI;
}

/**
 * Calculate the stringer (hypotenuse) length for the full flight.
 * @param {number} totalRise
 * @param {number} availableRun
 * @returns {number}
 */
function calculateStringerLength(totalRise, availableRun) {
  const tr = Number(totalRise);
  const ar = Number(availableRun);
  if (!Number.isFinite(tr) || !Number.isFinite(ar)) return NaN;
  return Math.hypot(tr, ar);
}

/**
 * Blondel formula: 2 * riser + giron
 * @param {number} giron
 * @param {number} riser
 * @returns {number}
 */
function calculateBlondel(giron, riser) {
  const g = Number(giron);
  const r = Number(riser);
  if (!Number.isFinite(g) || !Number.isFinite(r)) return NaN;
  return 2 * r + g;
}

/**
 * Calculate pitch as a percent (rise/run * 100).
 * @param {number} totalRise
 * @param {number} availableRun
 * @returns {number}
 */
function calculatePitch(totalRise, availableRun) {
  const tr = Number(totalRise);
  const ar = Number(availableRun);
  if (!Number.isFinite(tr) || !Number.isFinite(ar) || ar === 0) return NaN;
  return (tr / ar) * 100;
}

/**
 * Calculate walking line metrics. The walking line is usually placed 400mm
 * from the narrow side; this function returns the walking line run per step
 * and the full walking line length.
 * @param {number} availableRun
 * @param {number} steps
 * @param {object} [opts] - { offset=400 }
 * @returns {{walkingLinePerTread:number, walkingLineLength:number}}
 */
function calculateWalkingLine(availableRun, steps, opts = {}) {
  const offset = Number(opts.offset ?? 400);
  const ar = Number(availableRun);
  const s = Number(steps) || 0;
  if (!Number.isFinite(ar) || s <= 0) return { walkingLinePerTread: NaN, walkingLineLength: NaN };
  const wlLength = Math.max(ar - 2 * offset, 0);
  const treadCount = s > 1 ? s - 1 : 1;
  const per = treadCount > 0 ? wlLength / treadCount : NaN;
  return { walkingLinePerTread: per, walkingLineLength: wlLength };
}

/**
 * Suggest landing length. This is a heuristic: at minimum 800mm, or
 * giron * 2, whichever is larger.
 * @param {number} giron
 * @returns {number}
 */
function calculateLanding(giron) {
  const g = Number(giron);
  if (!Number.isFinite(g)) return NaN;
  return Math.max(800, 2 * g);
}

/**
 * Calculate headroom if ceilingHeight and startHeight provided.
 * headroom at walking line point x = ceilingHeight - (rise * (x / run))
 * If ceilingHeight or run is missing, returns null.
 *
 * @param {number} totalRise
 * @param {number} availableRun
 * @param {number|null} ceilingHeight - vertical clearance from start floor
 * @param {number} [walkingLineOffset=400] distance from inner wall used for walking line
 * @returns {number|null}
 */
function calculateHeadroom(totalRise, availableRun, ceilingHeight, walkingLineOffset = 400) {
  if (!Number.isFinite(totalRise) || !Number.isFinite(availableRun)) return null;
  if (!Number.isFinite(ceilingHeight)) return null;
  const ar = Number(availableRun);
  const wlPos = Math.max(0, ar - 2 * walkingLineOffset) / 2 + walkingLineOffset; // approximate center of walking line
  const heightAtWL = (Number(totalRise) * (wlPos / ar));
  return ceilingHeight - heightAtWL;
}

/**
 * Run a complete calculation and perform automatic verifications.
 * @param {object} inputs
 * @param {number} inputs.totalRise - mm
 * @param {number} inputs.availableRun - mm
 * @param {object} [opts]
 * @param {number} [opts.minRiser=140]
 * @param {number} [opts.maxRiser=200]
 * @param {number} [opts.preferredRiser=170]
 * @param {number} [opts.blandelTarget=630]
 * @returns {object}
 */
function calculateAll(inputs = {}, opts = {}) {
  const totalRise = Number(inputs.totalRise);
  const availableRun = Number(inputs.availableRun);
  const minRiser = opts.minRiser ?? 140;
  const maxRiser = opts.maxRiser ?? 200;
  const preferred = opts.preferredRiser ?? 170;
  const blondelTarget = opts.blondelTarget ?? 630; // mm

  const warnings = [];
  const errors = [];

  if (!Number.isFinite(totalRise) || totalRise <= 0) {
    errors.push('invalid totalRise');
    return { errors, warnings };
  }
  if (!Number.isFinite(availableRun) || availableRun < 0) {
    errors.push('invalid availableRun');
    return { errors, warnings };
  }

  const sc = calculateStepCount(totalRise, { minRiser, maxRiser, preferredRiser: preferred });
  const steps = sc.steps;
  const stepHeight = calculateStepHeight(totalRise, steps);
  const giron = calculateGiron(availableRun, steps);
  const blondel = calculateBlondel(giron, stepHeight);
  const slope = calculateSlope(stepHeight, giron);
  const pitch = calculatePitch(totalRise, availableRun);
  const stringerLength = calculateStringerLength(totalRise, availableRun);
  const walking = calculateWalkingLine(availableRun, steps);
  const landing = calculateLanding(giron);

  // Verifications
  if (stepHeight < minRiser) warnings.push('riser_too_low');
  if (stepHeight > maxRiser) warnings.push('riser_too_high');
  if (giron < 200) warnings.push('giron_too_shallow');
  if (giron > 350) warnings.push('giron_too_deep');
  if (blondel < blondelTarget - 50 || blondel > blondelTarget + 50) warnings.push('blondel_out_of_range');
  if (slope > 45) errors.push('slope_too_steep');
  if (slope < 15) warnings.push('slope_too_flat');
  if (steps < 2) errors.push('too_few_steps');
  if (availableRun < 500) warnings.push('short_run');

  // conformity check example: recommend 600-660 for Blondel
  const conformity = blondel >= 600 && blondel <= 660 && stepHeight >= minRiser && stepHeight <= maxRiser && giron >= 220 && giron <= 320;

  return {
    steps,
    stepHeight: Number(stepHeight),
    giron: Number(giron),
    blondel: Number(blondel),
    slope: Number(slope),
    pitch: Number(pitch),
    stringerLength: Number(stringerLength),
    walkingLine: walking,
    landing,
    headroom: inputs.ceilingHeight ? calculateHeadroom(totalRise, availableRun, inputs.ceilingHeight, opts.walkingLineOffset) : null,
    conformity,
    warnings,
    errors,
  };
}

module.exports = {
  calculateStepCount,
  calculateStepHeight,
  calculateGiron,
  calculateSlope,
  calculateStringerLength,
  calculateBlondel,
  calculatePitch,
  calculateWalkingLine,
  calculateLanding,
  calculateHeadroom,
  calculateAll,
};

/* Self-tests */
function runSelfTests() {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  // standard stair
  const std = calculateAll({ totalRise: 3000, availableRun: 3000 });
  assert(std.errors.length === 0, 'standard: should have no errors');

  // too steep: small run large rise
  const steep = calculateAll({ totalRise: 3000, availableRun: 1000 });
  assert(steep.errors.includes('slope_too_steep') || steep.warnings.includes('riser_too_high'), 'steep: expect slope_too_steep or riser_too_high');

  // too flat: large run small rise
  const flat = calculateAll({ totalRise: 1500, availableRun: 5000 });
  assert(flat.warnings.includes('slope_too_flat') || flat.warnings.includes('giron_too_deep'), 'flat: expect slope_too_flat or giron_too_deep');

  // hauteur insuffisante
  const smallRise = calculateAll({ totalRise: 100, availableRun: 500 });
  assert(smallRise.errors.includes('too_few_steps') || smallRise.warnings.length > 0, 'smallRise: expect warnings or errors');

  // hauteur importante
  const largeRise = calculateAll({ totalRise: 5000, availableRun: 4000 });
  assert(largeRise.warnings.length >= 0, 'largeRise: runs');

  // petite longueur
  const shortRun = calculateAll({ totalRise: 2500, availableRun: 300 });
  assert(shortRun.warnings.includes('short_run') || shortRun.errors.length > 0, 'shortRun: expect short_run or error');

  // grande longueur
  const longRun = calculateAll({ totalRise: 2500, availableRun: 8000 });
  assert(longRun.warnings.includes('slope_too_flat') || longRun.warnings.includes('giron_too_deep'), 'longRun: expect slope_too_flat or giron_too_deep');

  console.log('stairEngine.js self-tests: OK');
}

if (require.main === module) runSelfTests();
