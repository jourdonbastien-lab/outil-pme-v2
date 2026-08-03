'use strict';

function createShutdownHandler(runtime, dependencies = {}) {
  const {
    processObject = process,
    clearIntervalImpl = clearInterval,
    setTimeoutImpl = setTimeout,
    logger = console
  } = dependencies;
  let shuttingDown = false;

  return function shutdownServer(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`[scanner-import] arrêt demandé (${signal})`);
    runtime.incomingDocumentsImportService.stopAutomaticImport();
    clearIntervalImpl(runtime.agendaPurgeTimer);
    runtime.httpServer.close(() => processObject.exit(0));
    setTimeoutImpl(() => processObject.exit(1), 10000).unref();
  };
}

module.exports = { createShutdownHandler };
