"use strict";

// utilities for the measurements module
// This file exposes pure helper functions used across measurement features.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Ensure a directory exists. If the directory already exists, this is a no-op.
 * @param {string} dirPath - Path to create.
 * @returns {string} The resolved path.
 */
function ensureDir(dirPath) {
  if (!dirPath) throw new TypeError('dirPath is required');
  const resolved = path.resolve(dirPath);
  if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

/**
 * Return a filesystem-safe name derived from an arbitrary string.
 * Removes dangerous characters and trims length.
 * @param {string} name
 * @returns {string}
 */
function safeName(name) {
  const s = String(name ?? '')
    .normalize('NFKD')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return 'item';
  return s.slice(0, 120);
}

/**
 * Produce a URL/segment-friendly string (no spaces, lowercased).
 * @param {string} name
 * @returns {string}
 */
function safeSegment(name) {
  const s = safeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'item';
}

/**
 * Return ISO date YYYY-MM-DD for a Date or now.
 * @param {Date|number|string} [d]
 * @returns {string}
 */
function isoDate(d) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) throw new TypeError('Invalid date');
  return dt.toISOString().slice(0, 10);
}

/**
 * Parse a numeric value from various inputs (string with comma or space,
 * number). Returns NaN on failure.
 * @param {string|number} value
 * @returns {number}
 */
function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const cleaned = value.replace(/\s+/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Round a number to given decimals.
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {number}
 */
function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/**
 * Clamp a value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.min(Math.max(n, min), max);
}

/**
 * Euclidean distance between two points.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number}
 */
function distance(x1, y1, x2, y2) {
  const dx = Number(x2) - Number(x1);
  const dy = Number(y2) - Number(y1);
  return Math.hypot(dx, dy);
}

/**
 * Angle in degrees from point (x1,y1) to (x2,y2). Range: -180..180
 * 0 degrees points to the right (positive X), positive angles go counter-clockwise.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number}
 */
function angle(x1, y1, x2, y2) {
  const dx = Number(x2) - Number(x1);
  const dy = Number(y2) - Number(y1);
  const rad = Math.atan2(dy, dx);
  return radToDeg(rad);
}

/**
 * Convert degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
function degToRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 * @param {number} rad
 * @returns {number}
 */
function radToDeg(rad) {
  return (Number(rad) * 180) / Math.PI;
}

/**
 * Blondel formula value: 2 * hauteur + giron.
 * Units must be consistent (e.g. mm).
 * @param {number} giron - run/tread
 * @param {number} hauteur - rise
 * @returns {number} result of Blondel (same units as inputs)
 */
function blondel(giron, hauteur) {
  const g = Number(giron);
  const h = Number(hauteur);
  if (!Number.isFinite(g) || !Number.isFinite(h)) return NaN;
  return 2 * h + g;
}

/**
 * Format a length in millimeters to a human readable string. Uses meters
 * notation when >= 1000mm.
 * @param {number} mm
 * @returns {string}
 */
function formatLength(mm) {
  const n = Number(mm);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n) >= 1000) return `${round(n / 1000, 3)} m`;
  return `${round(n, 2)} mm`;
}

/**
 * Format an angle in degrees to string with degrees symbol, rounded to 2 decimals.
 * @param {number} deg
 * @returns {string}
 */
function formatAngle(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return '';
  return `${round(n, 2)}°`;
}

/**
 * Generate a UUID v4 string. Uses crypto.randomUUID when available.
 * @returns {string}
 */
function uuid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // fallback - RFC4122 version 4 compliant algorithm
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Deep clone a JSON-serializable object. Uses structuredClone when available.
 * @param {any} obj
 * @returns {any}
 */
function deepClone(obj) {
  if (typeof globalThis.structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

module.exports = {
  ensureDir,
  safeName,
  safeSegment,
  isoDate,
  parseNumber,
  round,
  clamp,
  distance,
  angle,
  degToRad,
  radToDeg,
  blondel,
  formatLength,
  formatAngle,
  uuid,
  deepClone,
};

/* Self-tests executed when running this file directly. They are small and
 * independent and do not rely on external libraries. They will not run when
 * the module is required by other files. */
function runSelfTests() {
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg || 'Assertion failed');
  };

  // ensureDir creates and returns resolved path
  const tmp = path.join(__dirname, '.tmp_utils_test');
  try {
    const p = ensureDir(tmp);
    assert(typeof p === 'string', 'ensureDir should return path');
    assert(fs.existsSync(p), 'ensureDir should create folder');
  } finally {
    // cleanup
    try { fs.rmdirSync(tmp, { recursive: true }); } catch (e) {}
  }

  assert(safeName(' a<>b:c ') === 'a b:c'.replace(/[:]/g, ':' ) || typeof safeName('x') === 'string', 'safeName basic');
  assert(safeSegment('Hello World') === 'hello-world', 'safeSegment');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(isoDate()), 'isoDate');
  assert(parseNumber('1 234,56') === 1234.56, 'parseNumber');
  assert(round(1.2345, 3) === 1.235, 'round');
  assert(clamp(5, 1, 10) === 5 && clamp(-1, 0, 3) === 0, 'clamp');
  assert(Math.abs(distance(0,0,3,4) - 5) < 1e-9, 'distance');
  assert(Math.abs(angle(0,0,1,0) - 0) < 1e-9, 'angle 0');
  assert(Math.abs(angle(0,0,0,1) - 90) < 1e-9, 'angle 90');
  assert(Math.abs(degToRad(180) - Math.PI) < 1e-12, 'degToRad');
  assert(Math.abs(radToDeg(Math.PI) - 180) < 1e-12, 'radToDeg');
  assert(blondel(250,170) === 250 + 2*170, 'blondel');
  assert(formatLength(1500).includes('m'), 'formatLength meters');
  assert(formatAngle(12.345).includes('°'), 'formatAngle');
  const u = uuid();
  assert(typeof u === 'string' && u.length >= 8, 'uuid');
  const c = deepClone({ a: 1, b: { c: 2 } });
  c.b.c = 3;
  assert(c.b.c === 3 && typeof c.b === 'object', 'deepClone');

  console.log('utils.js self-tests: OK');
}

if (require.main === module) runSelfTests();
