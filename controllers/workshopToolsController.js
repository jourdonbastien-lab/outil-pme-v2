'use strict';

function createWorkshopToolsController({
  pageTemplate,
  renderLogibarreView,
  renderBarreaudageView,
  renderLogitoleView,
  viewDependencies
}) {
  if (typeof pageTemplate !== 'function') throw new Error('pageTemplate est requis');
  if (typeof renderLogibarreView !== 'function') throw new Error('renderLogibarreView est requis');
  if (typeof renderBarreaudageView !== 'function') throw new Error('renderBarreaudageView est requis');
  if (typeof renderLogitoleView !== 'function') throw new Error('renderLogitoleView est requis');

  function showLogibarre(req, res) {
    res.send(pageTemplate(req, 'Logibarre', renderLogibarreView(viewDependencies)));
  }

  function showBarreaudage(req, res) {
    res.send(pageTemplate(req, 'Barreaudage', renderBarreaudageView(viewDependencies)));
  }

  function showLogitole(req, res) {
    res.send(pageTemplate(req, 'Logitôle', renderLogitoleView(viewDependencies)));
  }

  return { showLogibarre, showBarreaudage, showLogitole };
}

module.exports = { createWorkshopToolsController };
