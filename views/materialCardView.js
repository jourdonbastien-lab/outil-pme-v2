'use strict';

function renderMaterialCard(material, { escHtml, type }) {
  const priceValue = Number(material.price || 0).toFixed(2);
  return (
    '<a class="material-list-row" href="/materials/' + material.id + '">' +
      '<div class="material-list-main">' +
        '<strong>' + escHtml(String(material.name || 'Matière')) + '</strong>' +
        '<span>' + escHtml(type) + '</span>' +
      '</div>' +
      '<div class="material-list-meta">' +
        '<span>' + priceValue + ' €</span>' +
        '<small>' + escHtml(String(material.unit || '—')) + '</small>' +
      '</div>' +
      '<b aria-hidden="true">›</b>' +
    '</a>'
  );
}

module.exports = { renderMaterialCard };
