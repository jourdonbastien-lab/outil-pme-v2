'use strict';

function createMeasurementLegacyController(dependencies) {
  const { sketchService, assetsService, recoveryService, renderRecoveryView, pageTemplate } = dependencies;

  function getLegacySketch(req, res) {
    const result = sketchService.getMeasurementSketch(req.params.id);
    if (result.error === 'measurement-not-found') return res.status(404).send('Prise de cote introuvable');
    if (result.error) return res.status(404).send('Croquis introuvable');
    return res.sendFile(result.filePath);
  }

  function saveLegacySketch(req, res) {
    try {
      const result = sketchService.saveMeasurementSketch(req.params.id, req.body?.image);
      if (result.error) return res.status(404).json({ ok: false, error: 'Prise de cote introuvable' });
      return res.json({ ok: true, path: result.filePath });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ ok: false, error: error.message || 'Erreur sauvegarde croquis' });
    }
  }

  function showModulePage(req, res, next) {
    const filePath = assetsService.resolveModulePage(req.params.module);
    return filePath ? res.sendFile(filePath) : next();
  }

  function serveMeasurementAsset(req, res, next) {
    const filePath = assetsService.resolveMeasurementAsset(req.params.asset);
    return filePath ? res.sendFile(filePath) : next();
  }

  function serveTechnicalDrawingAsset(req, res, next) {
    const filePath = assetsService.resolveTechnicalDrawingAsset(req.params.asset);
    return filePath ? res.sendFile(filePath) : next();
  }

  function getPhotoRecoveryAccess(req, res) {
    return res.json(recoveryService.getRecoveryAccessContext({
      id: req.query.id,
      role: req.session?.user?.role
    }));
  }

  function showPhotoRecoveryPage(req, res) {
    return res.send(pageTemplate(req, 'Récupération photos Portail', renderRecoveryView()));
  }

  return {
    getLegacySketch,
    saveLegacySketch,
    showModulePage,
    serveMeasurementAsset,
    serveTechnicalDrawingAsset,
    getPhotoRecoveryAccess,
    showPhotoRecoveryPage
  };
}

module.exports = { createMeasurementLegacyController };
