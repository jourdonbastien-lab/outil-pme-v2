'use strict';

function registerMeasurementRecoveryAccessRoute(app, { requireLogin, controller }) {
  app.get('/api/measurements/photo-recovery-access', requireLogin, controller.getPhotoRecoveryAccess);
}

function registerMeasurementLegacySketchRoutes(app, { requireLogin, controller }) {
  app.get('/sketches/measurements/:id.png', requireLogin, controller.getLegacySketch);
  app.post('/api/measurements/:id/sketch', requireLogin, controller.saveLegacySketch);
}

function registerMeasurementPhotoRecoveryPageRoute(app, { requireAdmin, controller }) {
  app.get('/outils/prises-cotes/recuperation-photos', requireAdmin, controller.showPhotoRecoveryPage);
}

function registerMeasurementLegacyModulePageRoute(app, { requireLogin, controller }) {
  app.get('/outils/prises-cotes/:module', requireLogin, controller.showModulePage);
}

function registerMeasurementLegacyAssetRoutes(app, { requireLogin, controller }) {
  app.get('/outils/prises-cotes/:asset', requireLogin, controller.serveMeasurementAsset);
  app.get('/outils/prises-cotes/technical-drawing/:asset', requireLogin, controller.serveTechnicalDrawingAsset);
}

module.exports = {
  registerMeasurementRecoveryAccessRoute,
  registerMeasurementLegacySketchRoutes,
  registerMeasurementPhotoRecoveryPageRoute,
  registerMeasurementLegacyModulePageRoute,
  registerMeasurementLegacyAssetRoutes
};
