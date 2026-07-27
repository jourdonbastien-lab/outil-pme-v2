'use strict';

function renderClientCard(client, context) {
  const { escapeHtml, clientPageIcon } = context;
  return `
<div class="client-card-modern">

  <a class="client-card-link"
     href="/pc-folders/${encodeURIComponent(client.folder)}">

    <div class="client-header">
      <div class="client-name">
        ${escapeHtml(client.name)}
      </div>

      <span class="client-source">
        ${clientPageIcon(client.source === 'pc' ? 'folder' : 'database', 'client-source-icon')}
        ${client.source === 'pc' ? 'PC' : 'DB'}
      </span>
    </div>

    <div class="client-infos">

      ${client.city ? `
        <div>${clientPageIcon('building', 'client-info-icon')} ${escapeHtml(client.city)}</div>
      ` : ''}

      ${client.phone ? `
        <div>${clientPageIcon('phone', 'client-info-icon')} ${escapeHtml(client.phone)}</div>
      ` : ''}

      ${client.email ? `
        <div>${clientPageIcon('mail', 'client-info-icon')} ${escapeHtml(client.email)}</div>
      ` : ''}

    </div>

  </a>

  ${client.source === 'db' ? `
  <form method="POST"
        action="/clients/delete"
        onsubmit="return confirm('Supprimer définitivement ce client ?');">

    <input type="hidden" name="id" value="${client.id}">

    <button class="client-delete-btn">
      ${clientPageIcon('trash', 'client-delete-icon')}
    </button>

  </form>
  ` : ''}

</div>
        `;
}

module.exports = { renderClientCard };
