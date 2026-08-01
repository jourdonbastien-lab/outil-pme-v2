'use strict';

function createQuoteAcceptanceController({ acceptanceService, logError = console.error } = {}) {
  if (!acceptanceService || typeof acceptanceService.acceptQuote !== 'function') {
    throw new TypeError('Service acceptation devis manquant.');
  }

  function acceptQuote(req, res) {
    try {
      const result = acceptanceService.acceptQuote(Number(req.params.id));
      return res.redirect(
        '/pc-folders/' + encodeURIComponent(result.safeClient) + '/' + encodeURIComponent(result.safeOrder)
      );
    } catch (error) {
      if (error && (error.statusCode === 400 || error.statusCode === 404)) {
        return res.status(error.statusCode).send(error.message);
      }
      logError('❌ Erreur accept devis:', error);
      return res.status(500).send('Erreur serveur lors de l’acceptation (voir console).');
    }
  }

  return { acceptQuote };
}

module.exports = { createQuoteAcceptanceController };
