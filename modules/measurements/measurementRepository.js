"use strict";

/**
 * modules/measurements/measurementRepository.js
 *
 * Repository layer for measurements. Provides an in-memory store and a thin
 * abstraction so a persistence driver (e.g. better-sqlite3) can be wired later
 * without changing callers. This file does NOT create or modify any DB
 * schema. It exposes CRUD and search operations and serialization helpers.
 */

const model = require('./model');

/**
 * Create a repository instance.
 *
 * options:
 * - driver: optional object implementing { loadAll(), save(item), update(id,item), remove(id) }
 *   If provided, the repository will delegate persistence to the driver. The
 *   driver is optional; when absent the repository uses an in-memory Map.
 *
 * @param {object} [options]
 */
function createRepository(options = {}) {
  const driver = options.driver || null;
  const store = new Map(); // in-memory store: id => measurement

  async function create(attrs = {}) {
    const m = model.createMeasurement(attrs);
    store.set(m.id, m);
    if (driver && typeof driver.save === 'function') {
      try { await driver.save(m); } catch (e) { /* do not fail repository on driver error */ }
    }
    return m;
  }

  async function update(id, changes = {}) {
    if (!store.has(id)) return null;
    const current = store.get(id);
    const merged = Object.assign({}, current, changes);
    // ensure metadata
    merged.metadata = merged.metadata || {};
    merged.metadata.updated_at = new Date().toISOString();
    store.set(id, merged);
    if (driver && typeof driver.update === 'function') {
      try { await driver.update(id, merged); } catch (e) { }
    }
    return merged;
  }

  async function remove(id) {
    const existed = store.delete(id);
    if (driver && typeof driver.remove === 'function') {
      try { await driver.remove(id); } catch (e) { }
    }
    return existed;
  }

  function findById(id) {
    return store.has(id) ? JSON.parse(JSON.stringify(store.get(id))) : null;
  }

  function findAll() {
    return Array.from(store.values()).map((v) => JSON.parse(JSON.stringify(v)));
  }

  function findByClient(clientName) {
    const q = String(clientName || '').toLowerCase();
    return findAll().filter((m) => (m.client || '').toString().toLowerCase().includes(q));
  }

  function findByOrder(orderRef) {
    const q = String(orderRef || '').toLowerCase();
    return findAll().filter((m) => (m.commande || '').toString().toLowerCase().includes(q));
  }

  function findByStatus(status) {
    const q = String(status || '').toLowerCase();
    return findAll().filter((m) => (m.statut || '').toString().toLowerCase() === q);
  }

  function findByType(type) {
    const q = String(type || '').toLowerCase();
    return findAll().filter((m) => (m.type || '').toString().toLowerCase() === q);
  }

  function search(text) {
    const q = String(text || '').toLowerCase();
    return findAll().filter((m) => {
      return (m.number || '').toString().toLowerCase().includes(q)
        || (m.client || '').toString().toLowerCase().includes(q)
        || (m.chantier || '').toString().toLowerCase().includes(q)
        || (m.commande || '').toString().toLowerCase().includes(q);
    });
  }

  function exists(id) {
    return store.has(id);
  }

  function count() {
    return store.size;
  }

  function serialize(measurement) {
    try { return JSON.stringify(measurement); } catch (e) { return null; }
  }

  function deserialize(json) {
    try { return JSON.parse(json); } catch (e) { return null; }
  }

  /**
   * Load initial items into the repository (memory). Driver load is only
   * invoked if driver.loadAll exists. This does not create DB tables.
   */
  async function loadInitial(items = []) {
    if (driver && typeof driver.loadAll === 'function') {
      try {
        const rows = await driver.loadAll();
        rows.forEach((r) => { if (r && r.id) store.set(r.id, r); });
        return;
      } catch (e) { /* fallback to provided items */ }
    }
    items.forEach((it) => { if (it && it.id) store.set(it.id, it); });
  }

  return {
    create,
    update,
    remove,
    findById,
    findAll,
    findByClient,
    findByOrder,
    findByStatus,
    findByType,
    search,
    exists,
    count,
    serialize,
    deserialize,
    loadInitial,
    // expose internal store for testing only (copy)
    _dump: () => Array.from(store.values()).map((v) => JSON.parse(JSON.stringify(v))),
  };
}

module.exports = { createRepository };

/* Self-tests */
async function runSelfTests() {
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const repo = createRepository();
  // create
  const a = await repo.create({ type: 'test', client: 'Client A', commande: 'ORD-1' });
  assert(a && a.id, 'create returns object with id');
  // find
  const byId = repo.findById(a.id);
  assert(byId && byId.id === a.id, 'findById works');
  // count
  assert(repo.count() === 1, 'count is 1');
  // exists
  assert(repo.exists(a.id), 'exists true');
  // update
  const updated = await repo.update(a.id, { client: 'Client B' });
  assert(updated.client === 'Client B', 'update modifies client');
  // findByClient
  const found = repo.findByClient('Client B');
  assert(found.length === 1, 'findByClient returns 1');
  // search
  const sr = repo.search('ORD-1');
  assert(sr.length === 1, 'search finds order');
  // serialize/deserialize
  const s = repo.serialize(updated);
  const d = repo.deserialize(s);
  assert(d && d.id === updated.id, 'serialize/deserialize roundtrip');
  // remove
  const rem = await repo.remove(a.id);
  assert(rem === true, 'remove returns true');
  assert(repo.count() === 0, 'count after remove 0');

  console.log('measurementRepository.js self-tests: OK');
}

if (require.main === module) runSelfTests().catch((e) => { console.error(e); process.exit(1); });
