'use strict';

function createPcFilesService(dependencies = {}) {
  const {
    fs,
    clientPcDir,
    standardSubfolders,
    safeName,
    safeResolveInside,
    ensureDir
  } = dependencies;

  function resolveFileContext(params = {}) {
    const client = encodeURIComponent(params.client);
    const order = encodeURIComponent(params.order);
    const type = encodeURIComponent(params.type);
    const file = encodeURIComponent(params.file);

    return {
      client,
      order,
      type,
      file,
      isPdf: file.toLowerCase().endsWith('.pdf'),
      rawUrl: `/pc-file-raw/${client}/${order}/${type}/${file}`
    };
  }

  function resolveRawFile(params = {}) {
    try {
      const client = safeName(params.client);
      const order = safeName(params.order);
      const type = String(params.type || '').trim();
      const file = decodeURIComponent(params.file || '');

      if (!standardSubfolders.includes(type)) return { error: 'invalid-type' };

      const filePath = safeResolveInside(clientPcDir, client, order, type, file);
      if (!fs.existsSync(filePath)) return { error: 'missing' };

      return { filePath };
    } catch {
      return { error: 'invalid-path' };
    }
  }

  function resolveUploadContext(params = {}, options = {}) {
    const client = safeName(params.client);
    const order = safeName(params.order);
    const type = String(params.type || '').trim();

    if (!client || !order || !type) throw new Error('Dossier cible invalide');
    if (!standardSubfolders.includes(type)) throw new Error('Type de dossier interdit');

    const directory = safeResolveInside(clientPcDir, client, order, type);
    if (options.createDirectory) ensureDir(directory);

    return {
      client,
      order,
      type,
      directory,
      redirectUrl: `/pc-folders/${encodeURIComponent(client)}/${encodeURIComponent(order)}/${encodeURIComponent(type)}`
    };
  }

  return { resolveFileContext, resolveRawFile, resolveUploadContext };
}

module.exports = { createPcFilesService };
