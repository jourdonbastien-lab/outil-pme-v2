"use strict";

/**
 * measurements/model.js
 *
 * Modèle de données commun pour les prises de cotes. Ce module expose une API
 * simple pour créer, mettre à jour, valider, sérialiser et désérialiser une
 * fiche de prise de cotes. Il est volontairement indépendant et ne contient
 * aucune logique métier spécifique (escaliers, portails, garde-corps, ...).
 */

const crypto = require('crypto');

// Internal counter used to produce human-friendly numbers. This is process-
// local only and will reset on restart; the real sequence should be provided
// by the database in production. Keeping it here satisfies the requirement of
// an "automatic number" without touching the DB.
let _dailyCounter = { key: null, seq: 0 };

/**
 * Generate a UUID v4 string.
 * @returns {string}
 */
function _uuid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Return ISO date-time string for now.
 * @returns {string}
 */
function _nowIso() {
  return new Date().toISOString();
}

/**
 * Generate an automatic human-friendly number for a measurement.
 * Format: PM-YYYYMMDD-0001
 * @returns {string}
 */
function _nextNumber() {
  const d = new Date();
  const key = d.toISOString().slice(0, 10).replace(/-/g, '');
  if (_dailyCounter.key !== key) {
    _dailyCounter.key = key;
    _dailyCounter.seq = 1;
  } else {
    _dailyCounter.seq += 1;
  }
  const seq = String(_dailyCounter.seq).padStart(4, '0');
  return `PM-${key}-${seq}`;
}

/**
 * Deep clone a JSON-serializable object.
 * @param {any} obj
 * @returns {any}
 */
function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj === undefined ? null : obj));
}

/**
 * Create a new, empty measurement fiche with sensible defaults.
 * The function does not persist anything.
 *
 * @param {object} attrs - initial attributes (type, utilisateur, client, chantier, commande)
 * @returns {object} measurement
 */
function createMeasurement(attrs = {}) {
  const now = _nowIso();
  const measurement = {
    id: _uuid(),
    number: _nextNumber(),
    type: String(attrs.type || 'divers'),
    statut: 'A faire',
    date: attrs.date ? String(attrs.date) : now.slice(0, 10),
    utilisateur: attrs.utilisateur || null,
    client: attrs.client || null,
    chantier: attrs.chantier || null,
    commande: attrs.commande || null,
    observations: {
      remarques: attrs.observations && attrs.observations.remarques ? String(attrs.observations.remarques) : '',
      notes_atelier: attrs.observations && attrs.observations.notes_atelier ? String(attrs.observations.notes_atelier) : '',
      notes_pose: attrs.observations && attrs.observations.notes_pose ? String(attrs.observations.notes_pose) : '',
    },
    photos: Array.isArray(attrs.photos) ? _deepClone(attrs.photos) : [],
    drawings: Array.isArray(attrs.drawings) ? _deepClone(attrs.drawings) : [],
    calculations: attrs.calculations && typeof attrs.calculations === 'object' ? _deepClone(attrs.calculations) : {},
    pdf: attrs.pdf && typeof attrs.pdf === 'object' ? _deepClone(attrs.pdf) : {},
    signatures: {
      client: attrs.signatures && attrs.signatures.client ? _deepClone(attrs.signatures.client) : null,
      technicien: attrs.signatures && attrs.signatures.technicien ? _deepClone(attrs.signatures.technicien) : null,
    },
    metadata: {
      created_at: now,
      updated_at: now,
    },
  };
  return measurement;
}

/**
 * Validate a measurement: update its statut to 'Validé' and record validator info.
 * This function returns a new object (immutably) and does not persist.
 *
 * @param {object} measurement
 * @param {object} info - { by: string, at: ISOString }
 * @returns {{ok:boolean, measurement:object}} result
 */
function validateMeasurement(measurement, info = {}) {
  if (!measurement || typeof measurement !== 'object') return { ok: false, measurement: null };
  const m = _deepClone(measurement);
  m.statut = 'Validé';
  m.validated_by = info.by || null;
  m.validated_at = info.at || _nowIso();
  m.metadata = m.metadata || {};
  m.metadata.updated_at = _nowIso();
  return { ok: true, measurement: m };
}

/**
 * Update a measurement with provided changes. Returns a new measurement
 * object; original is left untouched.
 *
 * @param {object} measurement
 * @param {object} changes - shallow merge into measurement
 * @returns {{ok:boolean, measurement:object}}
 */
function updateMeasurement(measurement, changes = {}) {
  if (!measurement || typeof measurement !== 'object') return { ok: false, measurement: null };
  const m = _deepClone(measurement);
  // shallow merge of top-level keys
  Object.keys(changes).forEach((k) => {
    m[k] = _deepClone(changes[k]);
  });
  m.metadata = m.metadata || {};
  m.metadata.updated_at = _nowIso();
  return { ok: true, measurement: m };
}

/**
 * Serialize a measurement to a JSON string.
 * @param {object} measurement
 * @returns {string|null}
 */
function serializeMeasurement(measurement) {
  try {
    return JSON.stringify(measurement);
  } catch (e) {
    return null;
  }
}

/**
 * Deserialize from JSON string back to a measurement object. Missing fields
 * are filled with sensible defaults.
 * @param {string} json
 * @returns {object|null}
 */
function deserializeMeasurement(json) {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    // ensure id and number exist
    if (!obj.id) obj.id = _uuid();
    if (!obj.number) obj.number = _nextNumber();
    obj.metadata = obj.metadata || { created_at: _nowIso(), updated_at: _nowIso() };
    return obj;
  } catch (e) {
    return null;
  }
}

module.exports = {
  createMeasurement,
  validateMeasurement,
  updateMeasurement,
  serializeMeasurement,
  deserializeMeasurement,
};

/* Self-tests for the model. They do not use throws; failures are reported
 * and the process exits with code 1 if any test fails. */
function runSelfTests() {
  const failures = [];

  const m1 = createMeasurement({ type: 'escalier_droit', utilisateur: 'tech1', client: 'Client A', chantier: 'Site A', commande: 'CMD-1' });
  if (!m1 || typeof m1 !== 'object') failures.push('createMeasurement did not return an object');
  if (!m1.id) failures.push('createMeasurement missing id');
  if (!m1.number) failures.push('createMeasurement missing number');
  if (m1.statut !== 'A faire') failures.push('createMeasurement default statut incorrect');

  const upd = updateMeasurement(m1, { observations: { remarques: 'Mesure OK' } });
  if (!upd.ok) failures.push('updateMeasurement returned ok=false');
  if (!upd.measurement || upd.measurement.observations.remarques !== 'Mesure OK') failures.push('updateMeasurement did not apply changes');
  if (m1.observations.remarques === 'Mesure OK') failures.push('updateMeasurement mutated original');

  const val = validateMeasurement(upd.measurement, { by: 'chef' });
  if (!val.ok) failures.push('validateMeasurement returned ok=false');
  if (val.measurement.statut !== 'Validé') failures.push('validateMeasurement did not set statut');
  if (!val.measurement.validated_by) failures.push('validateMeasurement did not set validated_by');

  const s = serializeMeasurement(val.measurement);
  if (typeof s !== 'string' || s.length === 0) failures.push('serializeMeasurement failed');
  const d = deserializeMeasurement(s);
  if (!d || d.id !== val.measurement.id) failures.push('deserializeMeasurement failed to preserve id');

  if (failures.length === 0) {
    console.log('model.js self-tests: OK');
  } else {
    console.error('model.js self-tests: FAIL');
    failures.forEach((f) => console.error('- ', f));
    process.exitCode = 1;
  }
}

if (require.main === module) runSelfTests();
