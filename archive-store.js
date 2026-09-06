(function (root) {
  const core =
    root.MetlifeArchiveCore ||
    (typeof require === 'function' ? require('./archive-core.js') : null);
  function createArchiveStore({ db, requireCloud, revision, isCurrent = () => true }) {
    const cache = new Map();
    function metadata(file) {
      return Object.fromEntries(
        Object.entries(file).filter(([key]) => !['snapshot', 'xlsxBase64'].includes(key)),
      );
    }
    async function prepare(file) {
      const meta = metadata(file);
      if (file.xlsxBase64 === undefined && file.snapshot === undefined) return meta;
      const version = revision();
      await db
        .ref('historyContent/' + file.id + '/' + version)
        .set({ snapshot: file.snapshot || [], xlsxBase64: file.xlsxBase64 || '' });
      return {
        ...meta,
        _contentVersion: version,
        _fingerprint: core.fingerprint(file.snapshot || []),
        _hasContent: !!file.xlsxBase64,
      };
    }
    async function save(file) {
      requireCloud();
      const hasPayload = file.xlsxBase64 !== undefined || file.snapshot !== undefined,
        meta = await prepare(file);
      let obsolete = null;
      const result = await db.ref('history/' + file.id).transaction(
        (current) => {
          if (current?._deletedAt && file._deletedAt !== null) return;
          const next = { ...metadata(current || {}), ...meta };
          if (current && !hasPayload)
            for (const key of [
              '_contentVersion',
              '_fingerprint',
              '_hasContent',
              '_previousContentVersion',
            ]) {
              if (current[key] !== undefined) next[key] = current[key];
              else delete next[key];
            }
          if (hasPayload && current?._contentVersion) {
            obsolete = current._previousContentVersion || null;
            next._previousContentVersion = current._contentVersion;
          }
          return next;
        },
        undefined,
        false,
      );
      if (!result.committed) {
        if (hasPayload)
          await db.ref('historyContent/' + file.id + '/' + meta._contentVersion).set(null);
        throw Error('El archivo fue eliminado en otro dispositivo.');
      }
      if (obsolete)
        await db
          .ref('historyContent/' + file.id + '/' + obsolete)
          .set(null)
          .catch(() => {});
      cache.delete(file.id);
    }
    async function refresh(file, expectedUpdated) {
      requireCloud();
      const meta = await prepare(file);
      let obsolete = null;
      const result = await db.ref('history/' + file.id).transaction(
        (current) => {
          if (!current || current._deletedAt || current.updated !== expectedUpdated) return;
          obsolete = current._previousContentVersion || null;
          return {
            ...metadata(current),
            recordCount: meta.recordCount,
            updated: meta.updated,
            _contentVersion: meta._contentVersion,
            _previousContentVersion: current._contentVersion || null,
            _fingerprint: meta._fingerprint,
            _hasContent: meta._hasContent,
          };
        },
        undefined,
        false,
      );
      if (!result.committed && meta._contentVersion)
        await db.ref('historyContent/' + file.id + '/' + meta._contentVersion).set(null);
      if (result.committed && obsolete)
        await db
          .ref('historyContent/' + file.id + '/' + obsolete)
          .set(null)
          .catch(() => {});
      cache.delete(file.id);
      return result.committed;
    }
    async function content(id, retry = true) {
      requireCloud();
      const meta = (await db.ref('history/' + id).once('value')).val();
      if (!meta || meta._deletedAt) throw Error('El archivo ya no está disponible.');
      if (cache.get(id)?._contentVersion === meta._contentVersion && meta._contentVersion)
        return { ...cache.get(id), ...meta };
      const payload = meta._contentVersion
        ? (await db.ref('historyContent/' + id + '/' + meta._contentVersion).once('value')).val()
        : {};
      if (!payload && retry) return content(id, false);
      if (!payload) throw Error('La copia Excel cambió. Vuelve a descargarla.');
      const result = { snapshot: [], ...meta, ...payload };
      if (cache.size >= 3) cache.delete(cache.keys().next().value);
      cache.set(id, result);
      return result;
    }
    async function migrate() {
      if ((await db.ref('settings/archiveStorage').once('value')).val() === 1) return;
      let after = null;
      while (isCurrent()) {
        let query = db.ref('history').orderByKey();
        if (after) query = query.startAfter(after);
        const entries = Object.entries(
          (await query.limitToFirst(10).once('value')).val() || {},
        ).sort(([a], [b]) => a.localeCompare(b));
        if (!entries.length) break;
        for (const [id, file] of entries) {
          if (!isCurrent()) return;
          if (file.xlsxBase64 === undefined && file.snapshot === undefined) continue;
          const meta = await prepare({ ...file, id });
          const result = await db.ref('history/' + id).transaction(
            (current) => {
              if (
                !current ||
                current.xlsxBase64 !== file.xlsxBase64 ||
                JSON.stringify(current.snapshot) !== JSON.stringify(file.snapshot)
              )
                return;
              return {
                ...metadata(current),
                _contentVersion: meta._contentVersion,
                _fingerprint: meta._fingerprint,
                _hasContent: meta._hasContent,
              };
            },
            undefined,
            false,
          );
          if (!result.committed)
            await db.ref('historyContent/' + id + '/' + meta._contentVersion).set(null);
        }
        after = entries.at(-1)[0];
        if (entries.length < 10) break;
      }
      if (isCurrent()) await db.ref('settings/archiveStorage').set(1);
    }
    return { save, refresh, content, migrate, metadata, clear: () => cache.clear() };
  }
  if (typeof module !== 'undefined') module.exports = createArchiveStore;
  else root.createMetlifeArchiveStore = createArchiveStore;
})(typeof window !== 'undefined' ? window : globalThis);
