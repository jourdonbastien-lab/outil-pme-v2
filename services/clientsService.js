'use strict';

function createClientsService(dependencies) {
  const {
    db,
    clientsRoot,
    safeName,
    normalizeKey,
    joinPath,
    listDirectoryEntries,
    ensureDirectory,
    now = () => new Date().toISOString(),
    logError = console.error
  } = dependencies || {};

  if (!db || typeof db.prepare !== 'function') throw new TypeError('Base clients manquante.');
  if (!clientsRoot) throw new TypeError('Dossier clients manquant.');
  if (typeof safeName !== 'function') throw new TypeError('Normalisation de dossier manquante.');
  if (typeof normalizeKey !== 'function') throw new TypeError('Normalisation client manquante.');
  if (typeof joinPath !== 'function') throw new TypeError('Résolution de chemin manquante.');
  if (typeof listDirectoryEntries !== 'function') throw new TypeError('Lecture des dossiers clients manquante.');
  if (typeof ensureDirectory !== 'function') throw new TypeError('Création de dossier client manquante.');

  function listClients() {
    return db.prepare('SELECT * FROM clients ORDER BY created_at DESC, id DESC').all();
  }

  function listClientFolders() {
    try {
      return listDirectoryEntries(clientsRoot)
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error) {
      logError('Erreur lecture clients_pc :', error);
      return [];
    }
  }

  function buildMergedClientList() {
    const databaseClients = listClients();
    const databaseByName = new Map();
    databaseClients.forEach((client) => databaseByName.set(normalizeKey(client.name), client));
    const folderNames = listClientFolders();
    const merged = [];

    for (const client of databaseClients) {
      const folder = safeName(client.name);
      // Effet historique conservé : le rendu garantit le dossier d'un client SQLite.
      ensureDirectory(joinPath(clientsRoot, folder));
      merged.push({
        id: client.id,
        name: client.name,
        address: client.address,
        postal_code: client.postal_code,
        city: client.city,
        email: client.email,
        phone: client.phone,
        folder,
        source: 'db',
        databaseClient: client,
        folderName: folder,
        displayName: client.name,
        normalizedName: normalizeKey(client.name),
        existsInDatabase: true,
        folderExists: true,
        isDatabaseOnly: !folderNames.some((name) => normalizeKey(name) === normalizeKey(client.name)),
        isFolderOnly: false,
        urls: { folder: `/pc-folders/${encodeURIComponent(folder)}` }
      });
    }

    for (const folder of folderNames) {
      if (!databaseByName.has(normalizeKey(folder))) {
        merged.push({
          id: null,
          name: folder,
          address: '',
          postal_code: '',
          city: '',
          email: '',
          phone: '',
          folder,
          source: 'pc',
          databaseClient: null,
          folderName: folder,
          displayName: folder,
          normalizedName: normalizeKey(folder),
          existsInDatabase: false,
          folderExists: true,
          isDatabaseOnly: false,
          isFolderOnly: true,
          urls: { folder: `/pc-folders/${encodeURIComponent(folder)}` }
        });
      }
    }

    merged.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
    return merged;
  }

  function findClientByName(name) {
    return db.prepare('SELECT id FROM clients WHERE LOWER(name) = LOWER(?)').get(name);
  }

  function createClient(input) {
    const existing = findClientByName(input.name);
    if (!existing) {
      db.prepare(`
        INSERT INTO clients (name, address, postal_code, city, email, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.name,
        input.address || null,
        input.postal_code || null,
        input.city || null,
        input.email || null,
        input.phone || null,
        now()
      );
    }
    const folder = safeName(input.name);
    ensureDirectory(joinPath(clientsRoot, folder));
    return { existing: Boolean(existing), folder };
  }

  function deleteClient(id) {
    return db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  }

  return { listClients, listClientFolders, buildMergedClientList, findClientByName, createClient, deleteClient };
}

module.exports = { createClientsService };
