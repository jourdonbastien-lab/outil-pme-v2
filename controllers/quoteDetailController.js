'use strict';

function createQuoteDetailController({ quoteDetailService, renderQuoteDetailView, pageTemplate, viewDependencies } = {}) {
  if (!quoteDetailService || typeof quoteDetailService.getQuoteDetail !== 'function') throw new TypeError('Service détail devis manquant.');
  if (typeof renderQuoteDetailView !== 'function' || typeof pageTemplate !== 'function') throw new TypeError('Rendu détail devis manquant.');

  function showQuoteDetail(req, res) {
    const id = Number(req.params.id);
    const detail = quoteDetailService.getQuoteDetail(id);
    if (!detail) return res.status(404).send('Devis introuvable');
    return res.send(pageTemplate(req, `Devis #${id}`, renderQuoteDetailView(detail, viewDependencies)));
  }

  return { showQuoteDetail };
}

module.exports = { createQuoteDetailController };
