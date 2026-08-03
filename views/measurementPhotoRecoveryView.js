'use strict';

function renderMeasurementPhotoRecoveryView() {
  return `
    <div class="page-head app-dark-page-head">
      <div>
        <h1>Récupération temporaire des photos</h1>
        <span>Fiche Portail #9 · devis #6 · 20/07/2026</span>
      </div>
    </div>
    <section class="panel-soft">
      <p><strong>Lecture locale uniquement.</strong> Cette page ne modifie ni le localStorage, ni la fiche, ni SQLite et n’envoie aucune photo au serveur.</p>
      <div id="photo-recovery-status" role="status">Analyse du stockage local de cet appareil…</div>
      <div class="nav-actions">
        <button type="button" class="btn btn-secondary" id="photo-recovery-rescan">Relire le stockage local</button>
        <button type="button" class="btn btn-primary" id="photo-recovery-download-all" hidden>Tout télécharger</button>
        <a class="btn btn-secondary" href="/outils/prises-cotes/portail?id=9&amp;from_quote=6">Retour vers la fiche Portail #9</a>
      </div>
      <div id="photo-recovery-results"></div>
    </section>
    <script src="/outils/prises-cotes/photo-recovery.js"></script>
    <script>
    (function () {
      'use strict';
      const status = document.getElementById('photo-recovery-status');
      const results = document.getElementById('photo-recovery-results');
      const rescan = document.getElementById('photo-recovery-rescan');
      const downloadAll = document.getElementById('photo-recovery-download-all');
      let recoveredPhotos = [];

      function addText(parent, tag, value) {
        const element = document.createElement(tag);
        element.textContent = String(value || '');
        parent.appendChild(element);
        return element;
      }

      function safeFileName(value, index) {
        const clean = String(value || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
        return clean || 'photo-portail-' + (index + 1) + '.jpg';
      }

      function downloadPhoto(photo, index) {
        const link = document.createElement('a');
        link.href = photo.dataUrl;
        link.download = safeFileName(photo.name, index);
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      function render() {
        results.replaceChildren();
        recoveredPhotos = [];
        let report;
        try {
          report = window.MeasurementPhotoRecovery.scanLocalStorage(window.localStorage, {
            id: 9, module: 'Portail', quoteId: 6, date: '2026-07-20'
          });
        } catch (error) {
          status.textContent = 'Impossible de lire le stockage local sur cet appareil : ' + (error.message || error);
          downloadAll.hidden = true;
          return;
        }

        const keys = document.createElement('section');
        keys.className = 'measurement-detail';
        addText(keys, 'h2', 'Clés trouvées');
        addText(keys, 'p', report.foundKeys.length ? report.foundKeys.join(' · ') : 'Aucune clé historique connue trouvée.');
        if (report.invalidKeys.length) addText(keys, 'p', 'Clés illisibles ignorées : ' + report.invalidKeys.join(' · '));
        results.appendChild(keys);

        report.records.forEach(function (record) {
          const section = document.createElement('section');
          section.className = 'panel-soft';
          addText(section, 'h2', record.recordName || 'Fiche Portail locale');
          addText(section, 'p', 'Clé : ' + record.key + ' · ID : ' + (record.id || 'non renseigné') + ' · Module : ' + (record.module || 'Portail') + ' · Devis : #' + (record.quoteId || 'non renseigné') + ' · Date : ' + (record.date || 'non renseignée'));
          addText(section, 'p', record.photos.length + ' photo(s) récupérable(s)');

          const gallery = document.createElement('div');
          gallery.className = 'measurement-linked-grid';
          record.photos.forEach(function (photo) {
            const index = recoveredPhotos.push(photo) - 1;
            const card = document.createElement('article');
            card.className = 'measurement-linked-card';
            const image = document.createElement('img');
            image.src = photo.dataUrl;
            image.alt = photo.caption || photo.name || 'Photo Portail récupérée';
            image.loading = 'lazy';
            image.style.cssText = 'display:block;width:100%;max-height:240px;object-fit:contain;border-radius:10px;';
            card.appendChild(image);
            addText(card, 'strong', photo.name || 'Photo sans nom');
            addText(card, 'span', photo.caption || 'Sans légende');
            const button = addText(card, 'button', 'Télécharger la photo');
            button.type = 'button';
            button.className = 'btn btn-primary';
            button.addEventListener('click', function () { downloadPhoto(photo, index); });
            gallery.appendChild(card);
          });
          section.appendChild(gallery);
          results.appendChild(section);
        });

        if (!report.photoCount) {
          const empty = document.createElement('section');
          empty.className = 'empty-state';
          addText(empty, 'strong', 'Aucune ancienne photo trouvée pour la fiche Portail #9 liée au devis #6 sur cet appareil.');
          addText(empty, 'p', 'Ouvrez cette même page sur l’iPhone qui a servi à prendre les photos. Le stockage local est propre à chaque appareil et navigateur.');
          results.appendChild(empty);
        }

        status.textContent = report.photoCount + ' photo(s) trouvée(s) pour la fiche ciblée. Aucune donnée n’a été envoyée ou modifiée.';
        const userAgent = navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /Safari/.test(userAgent) && !/Chrome|CriOS|Edg|OPR/.test(userAgent);
        downloadAll.hidden = !report.photoCount || isIOS || isSafari;
      }

      rescan.addEventListener('click', render);
      downloadAll.addEventListener('click', function () {
        recoveredPhotos.forEach(function (photo, index) {
          window.setTimeout(function () { downloadPhoto(photo, index); }, index * 250);
        });
      });
      render();
    })();
    </script>
  `;
}

module.exports = { renderMeasurementPhotoRecoveryView };
