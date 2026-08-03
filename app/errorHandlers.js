'use strict';

function registerProcessErrorHandlers(processObject = process, logger = console) {
  processObject.on('uncaughtException', (err) => logger.error('❌ uncaughtException:', err));
  processObject.on('unhandledRejection', (err) => logger.error('❌ unhandledRejection:', err));
}

function registerExpressErrorHandler(app, logger = console) {
  app.use((err, req, res, next) => {
    logger.error('❌ Express error:', err);
    res.status(500).send('Erreur serveur (voir console).');
  });
}

module.exports = { registerProcessErrorHandlers, registerExpressErrorHandler };
