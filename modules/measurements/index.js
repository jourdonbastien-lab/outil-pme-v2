"use strict";

// Module: modules/measurements/index.js
// Purpose: provide an isolated Express router for the "Prises de cotes" module.
// Constraints: this file must not contain business logic, must not modify other
// parts of the application, must not create DB tables or add dependencies.

const path = require('path');
const express = require('express');

/**
 * Build and return an Express Router configured for the measurements module.
 *
 * options: object allowing dependency injection. Supported keys (optional):
 * - db: a database handle (e.g. better-sqlite3 Database)
 * - pageTemplate: function to render pages
 * - requireLogin: middleware function to protect routes
 * - uploadsDir: path where uploads/photos will be stored
 *
 * Note: none of the injected dependencies are used inside this file; they are
 * accepted so the caller can provide them later and to keep the router fully
 * testable and isolated.
 *
 * @param {object} options
 * @returns {express.Router}
 */
function buildRouter(options = {}) {
  const router = express.Router();

  // store injected dependencies for potential later use by nested modules
  // keep a shallow copy to avoid accidental mutation of the original object
  const deps = Object.assign({}, options);

  // Serve static assets from the module's public directory. This keeps the
  // module self-contained and allows the host application to mount the router
  // without copying files.
  const publicDir = path.join(__dirname, 'public');
  router.use('/measurements/static', express.static(publicDir));

  // Basic health-check route (no business logic). This allows the host app
  // to verify the router is mounted and reachable.
  router.get('/measurements/ping', (req, res) => {
    res.json({ ok: true, module: 'measurements' });
  });

  // Export the deps object on the router so downstream modules can access the
  // injected services if needed. This is a non-invasive pattern that keeps
  // index.js free of business logic while enabling integration.
  router.locals = router.locals || {};
  router.locals.measurements = { deps };

  return router;
}

/**
 * Placeholder migration function. By contract this function accepts a DB
 * handle and will ensure required tables exist. Per constraints, it MUST NOT
 * perform any DDL or modify the database at this stage — it should be a
 * no-op so the host application can call it safely.
 *
 * Keep the function present and callable so later steps can implement
 * migrations while tests and integrations can call it without side effects.
 *
 * @param {object} db - injected database handle
 */
function ensureTables(db) {
  // intentionally empty: migrations will be added later following the
  // project's migration guidelines. No DB operations must occur here.
}

module.exports = {
  buildRouter,
  ensureTables,
};
