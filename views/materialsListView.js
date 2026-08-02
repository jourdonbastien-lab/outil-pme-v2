'use strict';

function renderMaterialsListView(data, { escHtml, clientPageIcon, renderMaterialCard }) {
  const { q, totalMaterials, materials, isAdmin, seeded, saved, added } = data;
  const groupedMaterials = materials.reduce((groups, material) => {
    const type = String(material.type || 'Sans type').trim() || 'Sans type';
    if (!groups[type]) groups[type] = [];
    groups[type].push(material);
    return groups;
  }, {});
  const materialGroups = Object.keys(groupedMaterials).length
    ? Object.keys(groupedMaterials)
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map((type) => {
          const rows = groupedMaterials[type]
            .map((material) => renderMaterialCard(material, { escHtml, type }))
            .join('');
          return (
            '<section class="materials-category">' +
              '<header>' +
                '<h2>' + escHtml(type) + '</h2>' +
                '<span>' + groupedMaterials[type].length + ' matière(s)</span>' +
              '</header>' +
              '<div class="materials-compact-list">' + rows + '</div>' +
            '</section>'
          );
        })
        .join('')
    : '<div class="empty-state material-empty-state">' + (q ? 'Aucune matière trouvée.' : 'Aucune matière enregistrée') + '</div>';

  return (
    '<div class="materials-page modern-page">' +
      '<section class="materials-hero">' +
        '<div class="clients-create-head">' +
          clientPageIcon('materials', 'clients-create-icon') +
          '<div>' +
            '<h1>Bibliothèque matière</h1>' +
          '</div>' +
        '</div>' +
        '<div class="materials-hero-actions">' +
          '<span class="materials-count">' + totalMaterials + ' matière(s)</span>' +
          (isAdmin
            ? '<form method="POST" action="/materials/seed" class="materials-seed-form">' +
                (seeded ? '<span>' + added + ' matière(s) ajoutée(s)</span>' : '') +
              '</form>'
            : '') +
        '</div>' +
      '</section>' +
    (seeded ? '<div class="success-message">Bibliothèque matière préremplie. Vous pouvez maintenant renseigner vos tarifs.</div>' : '') +
    (saved ? '<div class="success-message">Matière enregistrée.</div>' : '') +
    '<section class="clients-create-card materials-add-card is-collapsed" data-materials-add-card>' +
      '<button type="button" class="materials-add-toggle" aria-expanded="false" aria-controls="materials-add-panel" data-materials-add-toggle>' +
        '<span class="materials-add-title">' + clientPageIcon('add', 'clients-create-icon') + '<span>Ajouter une matière</span></span>' +
        '<span class="materials-add-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span>' +
      '</button>' +
      '<div class="materials-add-panel" id="materials-add-panel" hidden data-materials-add-panel>' +
        '<form method="POST" action="/materials" class="materials-add-form">' +
          '<div class="clients-form-grid">' +
            '<label class="clients-field"><span>Type</span><div class="clients-input-shell">' + clientPageIcon('materials') + '<input name="type" required placeholder="Ex: Tubes carrés acier"></div></label>' +
            '<label class="clients-field"><span>Nom</span><div class="clients-input-shell">' + clientPageIcon('postal') + '<input name="name" required placeholder="Ex: 40x40x2"></div></label>' +
            '<label class="clients-field"><span>Unité</span><div class="clients-input-shell">' + clientPageIcon('materials') + '<input name="unit" placeholder="ml, m², pièce"></div></label>' +
            '<label class="clients-field"><span>Prix (€)</span><div class="clients-input-shell">' + clientPageIcon('postal') + '<input name="price" inputmode="decimal" placeholder="0.00"></div></label>' +
            '<label class="clients-field"><span>kg / m</span><div class="clients-input-shell">' + clientPageIcon('logibarre') + '<input name="kg_per_m" inputmode="decimal" placeholder="Optionnel"></div></label>' +
            '<label class="clients-field"><span>Densité</span><div class="clients-input-shell">' + clientPageIcon('database') + '<input name="density" inputmode="decimal" placeholder="Optionnel"></div></label>' +
          '</div>' +
          '<div class="clients-submit-row"><button type="submit" class="clients-submit-btn">' + clientPageIcon('add', 'clients-submit-icon') + 'Ajouter la matière</button></div>' +
        '</form>' +
      '</div>' +
    '</section>' +
    '<form method="GET" action="/materials" class="materials-search-form">' +
      '<div class="materials-search-shell">' + clientPageIcon('search', 'materials-search-icon') + '<input name="q" value="' + escHtml(q) + '" placeholder="Rechercher par type, nom ou unité..." autocomplete="off" /></div>' +
      '<button type="submit" class="clients-submit-btn materials-search-btn">Rechercher</button>' +
      (q ? '<a class="materials-reset-btn" href="/materials">Réinitialiser</a>' : '') +
    '</form>' +
    '<div class="materials-groups">' + materialGroups + '</div>' +
    '<script>' +
      '(function(){' +
        'var card=document.querySelector("[data-materials-add-card]");' +
        'if(!card)return;' +
        'var toggle=card.querySelector("[data-materials-add-toggle]");' +
        'var panel=card.querySelector("[data-materials-add-panel]");' +
        'if(!toggle||!panel)return;' +
        'toggle.addEventListener("click",function(){' +
          'var isOpen=toggle.getAttribute("aria-expanded")==="true";' +
          'toggle.setAttribute("aria-expanded",String(!isOpen));' +
          'if(isOpen){card.classList.remove("is-open");card.classList.add("is-collapsed");window.setTimeout(function(){if(toggle.getAttribute("aria-expanded")!=="true")panel.hidden=true;},230);}' +
          'else{panel.hidden=false;window.requestAnimationFrame(function(){card.classList.add("is-open");card.classList.remove("is-collapsed");});}' +
        '});' +
      '})();' +
    '</script>' +
    '</div>'
  );
}

module.exports = { renderMaterialsListView };
