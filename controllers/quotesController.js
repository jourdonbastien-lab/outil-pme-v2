'use strict';

function createQuotesController(dependencies) {
  const {
    quotesService,
    renderQuotesListView,
    renderQuoteCreateView,
    pageTemplate,
    isoDate,
    escapeHtml,
    quoteStatusClass,
    clientPageIcon,
    infoBar
  } = dependencies || {};
  if (!quotesService) throw new TypeError('Service devis manquant.');
  if (typeof renderQuotesListView !== 'function') throw new TypeError('Vue liste devis manquante.');
  if (typeof renderQuoteCreateView !== 'function') throw new TypeError('Vue création devis manquante.');
  if (typeof pageTemplate !== 'function') throw new TypeError('Template de page manquant.');
  if (typeof isoDate !== 'function') throw new TypeError('Date devis manquante.');

  function showQuotesList(req, res) {
    const quotes = quotesService.listQuotes();
    const html = renderQuotesListView({ quotes, escapeHtml, quoteStatusClass, clientPageIcon, infoBar });
    return res.send(pageTemplate(req, 'Devis', html));
  }

  function showQuoteCreateForm(req, res) {
    const creationData = quotesService.getQuoteCreationData();
    const html = renderQuoteCreateView({
      ...creationData,
      quoteDate: isoDate(),
      escapeHtml,
      clientPageIcon
    });
    return res.send(pageTemplate(req, 'Nouveau devis', html));
  }

  function createQuote(req, res) {
    const existingClient = String(req.body.existing_client || '').trim();
    const title = String(req.body.title || '').trim();
    const quoteDate = String(req.body.quote_date || '').trim() || isoDate();
    if (!title) return res.status(400).send('❌ Titre du devis requis');

    let clientName = existingClient;
    if (!clientName) {
      const prospectName = String(req.body.prospect_name || '').trim();
      if (!prospectName) return res.status(400).send('❌ Nom du prospect requis');
      clientName = prospectName;
    }

    const quoteId = quotesService.createQuote({
      title,
      clientName,
      quoteDate,
      clientEmail: String(req.body.prospect_email || '').trim(),
      clientPhone: String(req.body.prospect_phone || '').trim(),
      clientAddress: String(req.body.prospect_address || '').trim()
    });
    return res.redirect('/devis/' + quoteId);
  }

  return { showQuotesList, showQuoteCreateForm, createQuote };
}

module.exports = { createQuotesController };
