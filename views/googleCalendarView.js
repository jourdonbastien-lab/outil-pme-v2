'use strict';

function renderGoogleConfigurationError() {
  return `
    <h2>Configuration Google Agenda manquante</h2>
    <p>Renseignez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI et GOOGLE_CALENDAR_ID dans le fichier .env.</p>
    <p>GOOGLE_CALENDAR_ID doit designer l'agenda secondaire A2 Metal, jamais primary.</p>
    <a href="/agenda">Retour a l'agenda</a>
  `;
}

function renderGoogleSyncLockedView() {
  return `
      <section class="panel-soft">
        <h1>Synchronisation deja en cours</h1>
        <p>Une autre synchronisation Google Agenda est en cours. Reessayez dans quelques instants.</p>
        <a class="btn btn-secondary" href="/agenda">Retour a l'agenda</a>
      </section>
    `;
}

function renderGoogleSyncErrorView() {
  return `
      <section class="panel-soft">
        <h1>Impossible d'appliquer la synchronisation</h1>
        <p>Google Agenda n'a pas repondu correctement. Aucune suppression automatique n'a ete executee.</p>
        <a class="btn btn-secondary" href="/agenda">Retour a l'agenda</a>
      </section>
    `;
}

function renderErrorList(errors, escHtml) {
  if (!errors.length) return '<li>Aucune</li>';
  return errors.map((error) => `<li>${escHtml(error.message || String(error))}</li>`).join('');
}

function syncReportCounts(actions) {
  return {
    link: actions.link.length,
    importLocal: actions.importLocal.length,
    createGoogle: actions.createGoogle.length,
    updateLocal: actions.updateLocal.length,
    updateGoogle: actions.updateGoogle.length,
    deleteLocal: (actions.deleteLocal || []).length,
    ambiguous: actions.ambiguous.length,
    errors: actions.errors.length,
    googleDuplicates: actions.googleDuplicates.length,
  };
}

function renderGoogleSyncSummary(report, options = {}, { escHtml }) {
  const actions = report.preview.actions;
  const counts = syncReportCounts(actions);
  const added = counts.importLocal + counts.createGoogle;
  const updated = counts.link + counts.updateLocal + counts.updateGoogle;
  const deleted = counts.deleteLocal;
  const ignored = counts.ambiguous + counts.googleDuplicates;
  const errors = counts.errors;

  return `
    <div class="page-head app-dark-page-head">
      <div>
        <h1>Synchronisation Google Calendar</h1>
        <span>Agenda cible : ${escHtml(report.calendar.summary)} (${escHtml(report.calendar.id)})</span>
      </div>
    </div>

    <section class="panel-soft">
      <h2>Résumé</h2>
      ${options.message ? `<p>${escHtml(options.message)}</p>` : ''}
      <div class="dashboard-grid">
        <div class="stat-card"><strong>${added}</strong><span>Événements ajoutés</span></div>
        <div class="stat-card"><strong>${updated}</strong><span>Événements mis à jour</span></div>
        <div class="stat-card"><strong>${deleted}</strong><span>Événements supprimés localement</span></div>
        <div class="stat-card"><strong>${ignored}</strong><span>Événements ignorés</span></div>
        <div class="stat-card"><strong>${errors}</strong><span>Erreurs</span></div>
      </div>
    </section>

    ${actions.errors.length ? `
      <section class="panel-soft">
        <h2>Erreurs</h2>
        <ul>${renderErrorList(actions.errors, escHtml)}</ul>
      </section>
    ` : ''}

    <div class="nav-actions"><a class="btn btn-secondary" href="/agenda">Retour à l'agenda</a></div>
  `;
}

module.exports = {
  renderGoogleConfigurationError,
  renderGoogleSyncLockedView,
  renderGoogleSyncErrorView,
  renderGoogleSyncSummary,
  syncReportCounts,
};
