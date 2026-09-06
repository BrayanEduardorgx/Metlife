(function (root) {
  function createAudit({ db, emit = () => {} }) {
    async function flush(item) {
      if (!item) return true;
      const entries = { ...item._versions, ...item._auditPending };
      if (!Object.keys(entries).length) return true;
      try {
        await db.ref('recordVersions/' + item._id).update(entries);
        await db.ref('records/' + item._id).transaction(
          (current) => {
            if (!current) return;
            const pending = { ...current._auditPending },
              legacy = { ...current._versions };
            for (const [key, value] of Object.entries(entries)) {
              if (JSON.stringify(pending[key]) === JSON.stringify(value)) delete pending[key];
              if (JSON.stringify(legacy[key]) === JSON.stringify(value)) delete legacy[key];
            }
            return {
              ...current,
              _auditPending: Object.keys(pending).length ? pending : null,
              _versions: Object.keys(legacy).length ? legacy : null,
            };
          },
          undefined,
          false,
        );
        return true;
      } catch (error) {
        emit('audit-error', error.message);
        return false;
      }
    }
    async function migrate() {
      if ((await db.ref('settings/auditStorage').once('value')).val() === 1) return;
      let after;
      while (true) {
        let query = db.ref('records').orderByKey();
        if (after) query = query.startAfter(after);
        const rows = Object.entries((await query.limitToFirst(100).once('value')).val() || {}).sort(
          ([a], [b]) => a.localeCompare(b),
        );
        for (const [id, item] of rows)
          if (!(await flush({ ...item, _id: id })))
            throw Error('Historial de cambios pendiente de migración.');
        if (rows.length < 100) break;
        after = rows.at(-1)[0];
      }
      await db.ref('settings/auditStorage').set(1);
    }
    async function versions(id) {
      return (await db.ref('recordVersions/' + id).once('value')).val() || {};
    }
    return { flush, migrate, versions };
  }
  if (typeof module !== 'undefined') module.exports = createAudit;
  else root.createMetlifeAuditStore = createAudit;
})(typeof window !== 'undefined' ? window : globalThis);
