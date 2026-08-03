'use strict';
function createMeasurementStorageService({ parseMeasurementData, preserveTechnicalSketches }={}) { return { loadMeasurementData: parseMeasurementData, preserveTechnicalSketches }; }
module.exports={createMeasurementStorageService};
