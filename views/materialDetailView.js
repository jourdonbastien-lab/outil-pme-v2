'use strict';

function renderMaterialDetailView({ material, id, saved, createdLabel }, { escHtml, clientPageIcon }) {
  const priceValue = Number(material.price || 0).toFixed(2);
  const kgValue = material.kg_per_m !== null && material.kg_per_m !== undefined ? escHtml(String(material.kg_per_m)) : '';
  const densityValue = material.density !== null && material.density !== undefined ? escHtml(String(material.density)) : '';
  return (
    '<div class="materials-page material-detail-page modern-page">' +
    '<section class="materials-hero material-detail-hero">' +
      '<div class="clients-create-head">' + clientPageIcon('materials', 'clients-create-icon') + '<div>' +
        '<span>' + escHtml(String(material.type || 'Matière')) + '</span>' +
        '<h1>' + escHtml(String(material.name || 'Matière')) + '</h1>' +
      '</div></div>' +
      '<a class="materials-reset-btn" href="/materials">Retour matières</a>' +
    '</section>' +
    (saved ? '<div class="success-message">Matière enregistrée.</div>' : '') +
    '<section class="material-detail-card">' +
      '<div class="material-detail-summary"><span>' + escHtml(String(material.type || '').toUpperCase()) + '</span><strong>' + escHtml(String(material.name || '')) + '</strong></div>' +
      '<div class="material-detail-grid">' +
        '<div><span>Unité</span><strong>' + escHtml(String(material.unit || '—')) + '</strong></div>' +
        '<div><span>Prix</span><strong>' + priceValue + ' €</strong></div>' +
        '<div><span>kg/m</span><strong>' + (kgValue || '—') + '</strong></div>' +
        '<div><span>Densité</span><strong>' + (densityValue || '—') + '</strong></div>' +
        '<div><span>Créée le</span><strong>' + escHtml(createdLabel) + '</strong></div>' +
      '</div>' +
    '</section>' +
    '<form method="POST" action="/materials/' + id + '" class="clients-create-card material-detail-form">' +
      '<div class="clients-create-head">' + clientPageIcon('postal', 'clients-create-icon') + '<div><span>Tarifs</span><h2>Modifier les informations</h2></div></div>' +
      '<div class="clients-form-grid">' +
        '<label class="clients-field"><span>Unité</span><div class="clients-input-shell">' + clientPageIcon('materials') + '<input name="unit" value="' + escHtml(String(material.unit || '')) + '"></div></label>' +
        '<label class="clients-field"><span>Prix (€)</span><div class="clients-input-shell">' + clientPageIcon('postal') + '<input name="price" value="' + priceValue + '" inputmode="decimal"></div></label>' +
        '<label class="clients-field"><span>kg / m</span><div class="clients-input-shell">' + clientPageIcon('logibarre') + '<input name="kg_per_m" value="' + kgValue + '" inputmode="decimal"></div></label>' +
        '<label class="clients-field"><span>Densité</span><div class="clients-input-shell">' + clientPageIcon('database') + '<input name="density" value="' + densityValue + '" inputmode="decimal"></div></label>' +
      '</div>' +
      '<div class="clients-submit-row"><button type="submit" class="clients-submit-btn">' + clientPageIcon('check', 'clients-submit-icon') + 'Enregistrer</button></div>' +
    '</form>' +
    '<form method="POST" action="/materials/delete" class="material-delete-form" onsubmit="return confirm(\'Supprimer cette matière ?\');">' +
      '<input type="hidden" name="id" value="' + id + '">' +
      '<button type="submit" class="modern-danger-btn">' + clientPageIcon('trash', 'modern-action-icon') + 'Supprimer la matière</button>' +
    '</form>' +
    '</div>'
  );
}

module.exports = { renderMaterialDetailView };
