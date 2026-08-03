'use strict';

const { createShutdownHandler } = require('./shutdown');

function startApplication(runtime, dependencies = {}) {
  const {
    processObject = process,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
    setTimeoutImpl = setTimeout,
    logger = console
  } = dependencies;

  runtime.agendaService.purgeExpiredEventsSafely();
  runtime.agendaPurgeTimer = setIntervalImpl(runtime.agendaService.purgeExpiredEventsSafely, 60 * 60 * 1000);
  if (typeof runtime.agendaPurgeTimer.unref === 'function') runtime.agendaPurgeTimer.unref();

  if (runtime.scannerImportEnabled) runtime.incomingDocumentsImportService.startAutomaticImport();
  else logger.log('[scanner-import] service désactivé par SCANNER_IMPORT_ENABLED=false');

  runtime.httpServer = runtime.app.listen(runtime.port, runtime.host, () => {
    logger.log(`Serveur démarré sur ${runtime.host}:${runtime.port}`);
  });

  runtime.shutdown = createShutdownHandler(runtime, { processObject, clearIntervalImpl, setTimeoutImpl, logger });
  processObject.once('SIGTERM', () => runtime.shutdown('SIGTERM'));
  processObject.once('SIGINT', () => runtime.shutdown('SIGINT'));
  return runtime.httpServer;
}

module.exports = { startApplication };
