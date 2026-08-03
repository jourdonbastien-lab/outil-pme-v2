'use strict';
const assert = require('assert');
const { createShutdownHandler } = require('./app/shutdown');
const order = []; const timeout = { unref: () => order.push('timeout.unref') };
const runtime = { agendaPurgeTimer: {}, incomingDocumentsImportService: { stopAutomaticImport: () => order.push('scanner.stop') }, httpServer: { close(callback) { order.push('server.close'); callback(); } } };
const shutdown = createShutdownHandler(runtime, { processObject: { exit: (code) => order.push(`exit:${code}`) }, clearIntervalImpl: () => order.push('interval.clear'), setTimeoutImpl: (callback, delay) => { order.push(`timeout:${delay}`); return timeout; }, logger: { log: (message) => order.push(message) } });
shutdown('SIGTERM'); shutdown('SIGINT');
assert.deepStrictEqual(order, ['[scanner-import] arrêt demandé (SIGTERM)', 'scanner.stop', 'interval.clear', 'server.close', 'exit:0', 'timeout:10000', 'timeout.unref']);
console.log('OK - arrêt propre application');
