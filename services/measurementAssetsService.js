'use strict';

function createMeasurementAssetsService({ path, publicDir, sheets, assets, technicalDrawingAssets, safeResolveInside }) {
  function resolveModulePage(module) {
    const moduleName = String(module || '').trim().toLowerCase();
    const fileName = sheets[moduleName];
    return fileName ? path.join(publicDir, fileName) : null;
  }

  function resolveMeasurementAsset(assetValue) {
    const asset = String(assetValue || '').trim();
    return assets.has(asset) ? path.join(publicDir, asset) : null;
  }

  function resolveTechnicalDrawingAsset(assetValue) {
    const asset = String(assetValue || '').trim();
    return technicalDrawingAssets.has(asset)
      ? safeResolveInside(publicDir, 'technical-drawing', asset)
      : null;
  }

  return { resolveModulePage, resolveMeasurementAsset, resolveTechnicalDrawingAsset };
}

module.exports = { createMeasurementAssetsService };
