'use strict';

function createMeasurementPhotoRecoveryService({ parseOptionalId }) {
  function getRecoveryAccessContext({ id, role }) {
    const measurementId = parseOptionalId(id);
    const isAdmin = role !== 'atelier';
    return { ok: true, allowed: Boolean(isAdmin && measurementId === 9) };
  }

  return { getRecoveryAccessContext };
}

module.exports = { createMeasurementPhotoRecoveryService };
