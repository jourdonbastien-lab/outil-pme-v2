'use strict';

function createMeasurementLegacySketchService({ db, parseOptionalId, sketchPngService }) {
  function findMeasurement(id) {
    const measurementId = parseOptionalId(id);
    return measurementId
      ? db.prepare('SELECT id FROM measurements WHERE id = ?').get(measurementId)
      : null;
  }

  function getMeasurementSketch(id) {
    const measurement = findMeasurement(id);
    if (!measurement) return { error: 'measurement-not-found' };
    const filePath = sketchPngService.find('measurements', measurement.id);
    return filePath ? { filePath } : { error: 'sketch-not-found' };
  }

  function saveMeasurementSketch(id, image) {
    const measurement = findMeasurement(id);
    if (!measurement) return { error: 'measurement-not-found' };
    return { filePath: sketchPngService.save('measurements', measurement.id, image) };
  }

  return { getMeasurementSketch, saveMeasurementSketch };
}

module.exports = { createMeasurementLegacySketchService };
