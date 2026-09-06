(function (root) {
  const { normalize, encode, grams } =
    root.MetlifeSearchCore ||
    (typeof require === 'function' ? require('./modules/search-core.js') : null);
  function createDirectory({ db, requireCloud, emit = () => {}, isCurrent = () => true }) {
    async function sync(record) {
      if (!record) return;
      const seq = record._directorySeq || 0;
      const value = {
        id: record._id,
        seq,
        active: !record._deletedAt,
        nombre: normalize(record.nombre),
        telefono: String(record.telefono || '').replace(/\D/g, ''),
        poliza: normalize(record.poliza),
      };
      try {
        if (value.active) {
          const updates = {};
          for (const key of ['nombre', 'telefono'])
            for (const token of grams(value[key]))
              updates[key + '/' + token + '/' + record._id] = true;
          if (Object.keys(updates).length) await db.ref('clientSearch').update(updates);
        }
        await db
          .ref('clientDirectory/' + record._id)
          .transaction((current) => (current?.seq > seq ? undefined : value), undefined, false);
        await db
          .ref('records/' + record._id)
          .transaction(
            (current) =>
              current && (current._directorySeq || 0) === seq && current._directoryPending
                ? { ...current, _directoryPending: null }
                : undefined,
            undefined,
            false,
          );
        return true;
      } catch (error) {
        emit('search-index-error', error.message);
        return false;
      }
    }
    async function prepare() {
      if ((await db.ref('settings/clientDirectory').once('value')).val() !== 2) {
        let after = null;
        while (isCurrent()) {
          let query = db.ref('records').orderByKey();
          if (after) query = query.startAfter(after);
          const entries = Object.entries(
            (await query.limitToFirst(100).once('value')).val() || {},
          ).sort(([a], [b]) => a.localeCompare(b));
          if (!entries.length) break;
          for (const [id, item] of entries) {
            if (!isCurrent()) return;
            if (!(await sync({ ...item, _id: id })))
              throw Error('No se pudo preparar la busqueda. Revisa la conexion.');
          }
          after = entries.at(-1)[0];
          if (entries.length < 100) break;
        }
        if (isCurrent()) await db.ref('settings/clientDirectory').set(2);
      }
      await repair();
    }
    async function repair() {
      for (let page = 0; page < 10 && isCurrent(); page++) {
        const items = Object.values(
          (
            await db
              .ref('records')
              .orderByChild('_directoryPending')
              .equalTo(true)
              .limitToFirst(100)
              .once('value')
          ).val() || {},
        );
        if (!items.length) return;
        await Promise.all(items.map(sync));
        if (items.length < 100) return;
      }
    }
    async function search(key, text, cursor = null, pageSize = 20, signal) {
      requireCloud();
      const abort = () => {
        if (signal?.aborted) {
          const e = Error('Búsqueda cancelada');
          e.name = 'AbortError';
          throw e;
        }
      };
      const term = key === 'telefono' ? String(text).replace(/\D/g, '') : normalize(text);
      if (!term) return { items: [], cursor: null };
      let after = cursor?.after || null,
        items = [];
      const queryKey = key + ':' + term;
      if (cursor && cursor.query !== queryKey)
        throw Error('La búsqueda cambió. Vuelve a iniciarla.');
      while (isCurrent()) {
        abort();
        let query = db.ref('clientSearch/' + key + '/' + encode(term.slice(0, 3))).orderByKey();
        if (after) query = query.startAfter(after);
        const rows = Object.entries((await query.limitToFirst(200).once('value')).val() || {}).sort(
          ([a], [b]) => a.localeCompare(b),
        );
        if (!rows.length) return { items, cursor: null };
        for (let offset = 0; offset < rows.length; offset++) {
          abort();
          const [id] = rows[offset];
          const item = (await db.ref('clientDirectory/' + id).once('value')).val();
          abort();
          after = id;
          const matches = item?.active && String(item[key] || '').includes(term);
          if (matches) {
            const record = (await db.ref('records/' + id).once('value')).val();
            const actual =
              key === 'telefono'
                ? String(record?.telefono || '').replace(/\D/g, '')
                : normalize(record?.nombre);
            if (record && !record._deletedAt && actual.includes(term)) items.push(record);
          }
          if (items.length === pageSize) return { items, cursor: { after, query: queryKey } };
        }
        if (rows.length < 200) return { items, cursor: null };
      }
      return { items: [], cursor: null };
    }
    return { sync, prepare, repair, search };
  }
  if (typeof module !== 'undefined') module.exports = createDirectory;
  else root.createMetlifeClientDirectory = createDirectory;
})(typeof window !== 'undefined' ? window : globalThis);
