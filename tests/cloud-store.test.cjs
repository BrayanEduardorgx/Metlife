const { test } = require('node:test'),
  assert = require('node:assert/strict');
const createCloud = require('../cloud-store.js');
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const { select } = require('./support/query.js');
class MemoryDB {
  constructor(initial = {}) {
    this.data = { ...initial, '.info': { connected: true } };
    this.listeners = new Set();
    this.reads = [];
  }
  read(path) {
    return (
      path
        .split('/')
        .filter(Boolean)
        .reduce((v, k) => v?.[k], this.data) ?? null
    );
  }
  write(path, value) {
    const keys = path.split('/').filter(Boolean);
    let target = this.data;
    for (const key of keys.slice(0, -1)) target = target[key] ??= {};
    if (value === null) delete target[keys.at(-1)];
    else target[keys.at(-1)] = clone(value);
  }
  publish() {
    for (const { path, fn, q } of this.listeners)
      fn({ val: () => clone(select(this.read(path), q)) });
  }
  ref(path = '', q = {}) {
    const db = this;
    const snap = () => ({ val: () => clone(select(db.read(path), q)) });
    return {
      orderByKey: () => db.ref(path, { ...q, order: 'key' }),
      orderByChild: (order) => db.ref(path, { ...q, order }),
      equalTo: (equal) => db.ref(path, { ...q, equal }),
      startAt: (start) => db.ref(path, { ...q, start }),
      startAfter: (after, afterKey) => db.ref(path, { ...q, after, afterKey }),
      endAt: (end) => db.ref(path, { ...q, end }),
      limitToFirst: (first) => db.ref(path, { ...q, first }),
      limitToLast: (last) => db.ref(path, { ...q, last }),
      once: async () => {
        db.reads.push({ path, q });
        return snap();
      },
      on(event, fn) {
        db.listeners.add({ path, fn, q });
        queueMicrotask(() => fn(snap()));
      },
      off(event, fn) {
        for (const l of db.listeners) if (l.path === path && l.fn === fn) db.listeners.delete(l);
      },
      set: async (value) => {
        db.write(path, value);
        db.publish();
      },
      update: async (updates) => {
        for (const [key, value] of Object.entries(updates))
          db.write([path, key].filter(Boolean).join('/'), value);
        db.publish();
      },
      transaction: async (updater) => {
        const next = updater(clone(db.read(path)));
        if (next === undefined) return { committed: false, snapshot: snap() };
        db.write(path, next);
        db.publish();
        return { committed: true, snapshot: { val: () => clone(next) } };
      },
    };
  }
}
function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    map,
  };
}
const make = (db, storage = memoryStorage(), uid = 'user1') =>
  createCloud({ db, storage, getUser: () => ({ uid }) });
test('active archive pages on the server while exports still fetch its complete membership', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const batch = a.state.workspace.batch;
  for (let i = 0; i < 63; i++)
    await a.saveRecord({
      _id: 'page_' + String(i).padStart(3, '0'),
      _batch: batch,
      nombre: 'DEMO ' + i,
    });
  assert.equal(a.state.records.length, 50);
  assert.equal(a.state.recordsHasMore, true);
  assert.equal((await a.fetchBatch(batch)).length, 63);
  await a.setBatch(batch, 100);
  assert.equal(a.state.records.length, 63);
  assert.equal(a.state.recordsHasMore, false);
  a.stop();
});
test('audit migration removes full version history from records and loads it on demand', async () => {
  const db = new MemoryDB({
      records: {
        old: {
          _id: 'old',
          _batch: 'old-batch',
          nombre: 'DEMO',
          _versions: { version: { data: { nombre: 'ANTERIOR' }, at: '2026-01-01' } },
        },
      },
    }),
    a = make(db);
  await a.start('user1');
  assert.equal(db.read('records/old/_versions'), null);
  db.reads = [];
  const current = await a.fetchRecord('old');
  assert.equal(current._versions, null);
  assert(!db.reads.some((r) => r.path.startsWith('recordVersions/')));
  assert.equal((await a.fetchRecord('old', true))._versions.version.data.nombre, 'ANTERIOR');
  a.stop();
});
test('substring search uses postings and cancels before issuing additional reads', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  await a.saveRecord({ _id: 'index', _batch: 'test', nombre: 'PÉREZ LÓPEZ MARÍA' });
  db.reads = [];
  assert.equal((await a.searchClients('nombre', 'pez mar')).items[0]._id, 'index');
  assert(db.reads.some((r) => r.path.startsWith('clientSearch/nombre/')));
  assert(!db.reads.some((r) => r.path === 'clientDirectory'));
  const controller = new AbortController();
  controller.abort();
  const before = db.reads.length;
  await assert.rejects(a.searchClients('nombre', 'pez', null, 20, false, controller.signal), {
    name: 'AbortError',
  });
  assert.equal(db.reads.length, before);
  a.stop();
});
test('bulk edits preserve concurrent changes and return explicit partial results', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const first = await a.saveRecord({ _id: 'bulk1', _batch: 'test', nombre: 'UNO' }),
    second = await a.saveRecord({ _id: 'bulk2', _batch: 'test', nombre: 'DOS' });
  await a.updateRecord({ ...second, comunidad: 'OTRO DISPOSITIVO' }, a.recordRevision(second));
  const result = await a.bulkUpdate([first, second], { comunidad: 'ZONA' });
  assert.equal(result.success.length, 1);
  assert.equal(result.failed.length, 1);
  assert.equal((await a.fetchRecord('bulk2')).comunidad, 'OTRO DISPOSITIVO');
  await assert.rejects(a.bulkUpdate([first], { nombre: 'NO' }), /no permitido/);
  a.stop();
});
test('daily summary counts active records across archives independently of loaded pages', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const now = new Date().toISOString(),
    day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  await a.saveRecord({
    _id: 'summary',
    _batch: 'other',
    nombre: 'DEMO',
    _saved: now,
    _needsReview: true,
  });
  await a.savePending({ draft: { nombre: 'PENDIENTE' } });
  const result = await a.dailySummary(day);
  assert.equal(result.created, 1);
  assert.equal(result.review, 1);
  assert.equal(result.pending, 1);
  a.stop();
});
test('independent devices receive records, history, account draft, batch and scan zones', async () => {
  const db = new MemoryDB(),
    s1 = memoryStorage(),
    s2 = memoryStorage(),
    a = make(db, s1),
    b = make(db, s2);
  await a.start('user1');
  await b.start('user1');
  await a.saveWorkspace({ batch: 'batch1' });
  await a.setBatch('batch1');
  await b.setBatch('batch1');
  await a.saveRecord({ _id: 'r1', _batch: 'batch1', nombre: 'DEMO' });
  assert.equal(b.state.records[0].nombre, 'DEMO');
  await a.saveHistory({ id: 'h1', batch: 'batch1', name: 'ARCHIVO' });
  assert.equal(b.state.history[0].name, 'ARCHIVO');
  await a.saveWorkspace(
    { batch: 'batch1', draft: { poliza: 'ABC123' } },
    a.state.workspace.revision,
  );
  assert.equal(b.state.workspace.batch, 'batch1');
  assert.equal(b.state.workspace.draft.poliza, 'ABC123');
  await a.saveZone('paterno', {
    rect: { left: 0.1, top: 0.2, width: 0.2, height: 0.1 },
    mode: 'fast',
    aspect: 0.8,
  });
  assert.deepEqual(a.state.zones, b.state.zones);
  for (const key of [
    'metlife_records_v1',
    'metlife_draft_v1',
    'metlife_excel_history_v1',
    'metlife_batch_v1',
    'metlife_document_regions_v1',
  ]) {
    assert.equal(s1.getItem(key), null);
    assert.equal(s2.getItem(key), null);
  }
  const c = make(db, memoryStorage());
  await c.start('user1');
  assert.equal(c.state.workspace.draft.poliza, 'ABC123');
  a.stop();
  b.stop();
  c.stop();
});
test('concurrent draft saves detect conflicts and cannot silently overwrite another device', async () => {
  const db = new MemoryDB(),
    a = make(db),
    b = make(db);
  await a.start('user1');
  await b.start('user1');
  const revision = a.state.workspace.revision;
  await a.saveWorkspace({ draft: { nombre: 'FIRST' } }, revision);
  await assert.rejects(b.saveWorkspace({ draft: { nombre: 'SECOND' } }, revision), {
    code: 'draft-conflict',
  });
  assert.equal(a.state.workspace.draft.nombre, 'FIRST');
  await b.saveWorkspace({ draft: { nombre: 'SECOND' } });
  assert.equal(a.state.workspace.draft.nombre, 'SECOND');
  a.stop();
  b.stop();
});
test('legacy data is migrated once before caches are purged, retaining an older draft as cloud backup', async () => {
  const db = new MemoryDB({
    workspaces: { user1: { batch: 'cloud', draft: { nombre: 'CURRENT' }, revision: 'x' } },
  });
  const storage = memoryStorage({
    metlife_records_v1: JSON.stringify([{ poliza: 'LEGACY' }]),
    metlife_draft_v1: JSON.stringify({ nombre: 'OLD LOCAL' }),
    metlife_excel_history_v1: JSON.stringify([{ id: 'old', batch: 'old', name: 'OLD' }]),
    metlife_batch_v1: 'old',
  });
  const a = make(db, storage);
  await a.start('user1');
  assert.equal((await a.fetchBatch('old')).length, 1);
  assert.equal((await a.fetchBatch('old'))[0].poliza, 'LEGACY');
  assert.equal(a.state.workspace.draft.nombre, 'CURRENT');
  assert.equal(Object.values(a.state.workspace.recoveredDrafts)[0].draft.nombre, 'OLD LOCAL');
  assert.equal(storage.getItem('metlife_draft_v1'), null);
  a.stop();
});
test('old migrated cache cannot resurrect deleted records; offline writes fail without claiming success', async () => {
  const db = new MemoryDB(),
    storage = memoryStorage({
      metlife_records_v1: JSON.stringify([{ _id: 'deleted', poliza: 'STALE' }]),
      metlife_firebase_migrated_v1: '1',
    }),
    a = make(db, storage);
  await a.start('user1');
  assert.equal(a.state.records.length, 0);
  db.write('.info/connected', false);
  db.publish();
  await assert.rejects(a.saveRecord({ _id: 'new' }), /Sin conexión/);
  assert.equal(db.read('records/new'), null);
  a.stop();
});
test('independent history writes never replace the history root', async () => {
  const db = new MemoryDB(),
    a = make(db),
    b = make(db);
  await a.start('user1');
  await b.start('user1');
  await Promise.all([
    a.saveHistory({ id: 'a', batch: 'a' }),
    b.saveHistory({ id: 'b', batch: 'b' }),
  ]);
  assert.equal(a.state.history.length, 2);
  await a.deleteHistory({ id: 'a', batch: 'a' });
  assert.equal(b.state.history.length, 1);
  assert.equal(b.state.history[0].id, 'b');
  a.stop();
  b.stop();
});
module.exports = { MemoryDB, memoryStorage };

test('history metadata excludes Excel contents; legacy payload migrates and is fetched only on demand', async () => {
  const snapshot = [{ _id: 'x', nombre: 'CLIENTE' }],
    db = new MemoryDB({
      history: {
        legacy: {
          id: 'legacy',
          batch: 'one',
          name: 'UNO',
          updated: 'one',
          recordCount: 1,
          snapshot,
          xlsxBase64: 'WORKBOOK',
        },
      },
    }),
    a = make(db);
  await a.start('user1');
  assert.equal(a.state.history[0].snapshot, undefined);
  assert.equal(a.state.history[0].xlsxBase64, undefined);
  assert.equal(db.read('history/legacy/xlsxBase64'), null);
  assert.equal((await a.fetchHistoryContent('legacy')).xlsxBase64, 'WORKBOOK');
  a.stop();
  db.reads = [];
  const b = make(db);
  await b.start('user1');
  assert(!db.reads.some((r) => r.path.startsWith('historyContent')));
  assert(![...db.listeners].some((l) => l.path.startsWith('historyContent')));
  const loaded = await b.fetchHistoryContent('legacy');
  assert.deepEqual(loaded.snapshot, snapshot);
  const oldMeta = { ...b.state.history[0] };
  await b.refreshHistory(
    { ...oldMeta, updated: 'two', snapshot: [{ _id: 'x', nombre: 'CAMBIO' }], xlsxBase64: 'NEW' },
    'one',
  );
  await b.saveHistory({ ...oldMeta, name: 'RENOMBRADO', updated: 'three' });
  assert.equal((await b.fetchHistoryContent('legacy')).xlsxBase64, 'NEW');
  b.stop();
});
test('archive replacement keeps at most two binary versions and preserves the latest data', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  for (let i = 0; i < 5; i++)
    await a.saveHistory({
      id: 'f',
      batch: 'b',
      name: 'F',
      updated: String(i),
      recordCount: 1,
      snapshot: [{ _id: 'r', nombre: 'VERSION ' + i }],
      xlsxBase64: 'XLSX' + i,
    });
  assert.equal(Object.keys(db.read('historyContent/f')).length, 2);
  assert.equal((await a.fetchHistoryContent('f')).snapshot[0].nombre, 'VERSION 4');
  a.stop();
});
test('substring name and phone search ignores accents and updates after changes and deletion', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const item = await a.saveRecord({
    _id: 'substring',
    _batch: '__cloud__',
    nombre: 'PÉREZ LÓPEZ MARÍA',
    telefono: '0123456789',
  });
  assert.equal((await a.searchClients('nombre', 'pez mar')).items[0]._id, item._id);
  assert.equal((await a.searchClients('telefono', '4567')).items[0]._id, item._id);
  const changed = await a.updateRecord(
    { ...item, nombre: 'JUANA RUIZ', telefono: '9988776655' },
    a.recordRevision(item),
  );
  assert.equal((await a.searchClients('nombre', 'maria')).items.length, 0);
  assert.equal((await a.searchClients('telefono', '4567')).items.length, 0);
  assert.equal((await a.searchClients('nombre', 'ruiz')).items.length, 1);
  await a.trashRecord(changed);
  assert.equal((await a.searchClients('nombre', 'ruiz')).items.length, 0);
  a.stop();
});
test('bulk attachment reports individual conflicts and is idempotent for records already in target', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  await a.saveHistory({ id: 'target', batch: 'target', name: 'TARGET' });
  await a.saveHistory({ id: 'source', batch: 'source', name: 'SOURCE' });
  const ok = await a.saveRecord({ _id: 'ok', _batch: '__cloud__', nombre: 'OK' }),
    stale = await a.saveRecord({ _id: 'stale', _batch: '__cloud__', nombre: 'STALE' }),
    owned = await a.saveRecord({ _id: 'owned', _batch: 'source', nombre: 'OWNED' });
  await a.updateRecord({ ...stale, nombre: 'CHANGED' }, a.recordRevision(stale));
  const counts = [];
  const result = await a.attachRecords([ok, stale, owned, ok], 'target', (n) => counts.push(n));
  assert.equal(result.success.length, 1);
  assert.deepEqual(result.failed.map((f) => f.id).sort(), ['owned', 'stale']);
  assert.equal(counts.at(-1), 3);
  assert.equal((await a.fetchBatch('source')).length, 1);
  assert.equal((await a.attachRecords([ok], 'target')).success.length, 1);
  assert.equal((await a.fetchBatch('target')).length, 1);
  a.stop();
});

test('deleting an Excel retains searchable clients; detach and attach preserve identity and data', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const file = { id: 'old-file', batch: 'old', name: 'ANTERIOR', updated: '1' };
  await a.saveHistory(file);
  await a.saveHistory({ id: 'new-file', batch: 'new', name: 'NUEVO', updated: '1' });
  const item = await a.saveRecord({
    _id: 'kept',
    _batch: 'old',
    _saved: new Date().toISOString(),
    poliza: 'KEEP1',
    nombre: 'PEREZ ANA',
    _notes: 'Conservar',
  });
  await a.deleteHistory(file);
  assert.equal((await a.fetchBatch('old')).length, 0);
  const found = (await a.searchClients('poliza', 'KEEP1')).items[0];
  assert.equal(found._id, 'kept');
  assert.equal(found._batch, '__cloud__');
  assert.equal(found._notes, 'Conservar');
  assert.equal((await a.listTrash()).items.length, 0);
  const changed = await a.updateRecord(
    { ...found, nombre: 'PEREZ ANA NUEVO' },
    a.recordRevision(found),
  );
  assert.equal(changed._batch, '__cloud__');
  assert(a.state.recent.some((r) => r._id === 'kept'));
  const attached = await a.attachRecord('kept', 'new', a.recordRevision(changed));
  assert.equal((await a.fetchBatch('new'))[0]._id, 'kept');
  await assert.rejects(a.attachRecord('kept', 'new', a.recordRevision(changed)), /cambió/);
  const detached = await a.detachRecord(attached);
  assert.equal((await a.fetchBatch('new')).length, 0);
  assert.equal((await a.searchClients('nombre', 'PEREZ')).items[0]._id, 'kept');
  await a.trashRecord(detached);
  assert.equal((await a.searchClients('poliza', 'KEEP1')).items.length, 0);
  a.stop();
});
test('migration recovers clients removed by an old Excel deletion but preserves explicit client deletions', async () => {
  const when = Date.now() - 120 * 86400000,
    db = new MemoryDB({
      history: { old: { id: 'old', batch: 'old', _deletedAt: when } },
      records: {
        fromFile: {
          _id: 'fromFile',
          _batch: 'old',
          poliza: 'RECOVER',
          _deletedAt: when,
          _expiresAt: when + 30 * 86400000,
          _trashFile: { id: 'old', batch: 'old' },
        },
        explicit: {
          _id: 'explicit',
          _batch: 'old',
          poliza: 'DELETED',
          _deletedAt: when,
          _expiresAt: when + 30 * 86400000,
        },
      },
      settings: { searchSchema: 1 },
    }),
    a = make(db);
  await a.start('user1');
  assert.equal((await a.searchClients('poliza', 'RECOVER')).items[0]._batch, '__cloud__');
  assert.equal((await a.searchClients('poliza', 'DELETED')).items.length, 0);
  assert.equal(a.state.history.length, 0);
  a.stop();
});
test('recent cloud activity is bounded and includes updated clients from older Excel files', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  for (let i = 0; i < 55; i++)
    await a.saveRecord({
      _id: 'recent' + i,
      _batch: 'batch' + i,
      _saved: new Date(1700000000000 + i * 1000).toISOString(),
      nombre: 'CLIENTE ' + i,
    });
  assert.equal(a.state.recent.length, 50);
  assert.equal(a.state.recentHasMore, true);
  const old = await a.fetchRecord('recent0');
  await a.updateRecord({ ...old, nombre: 'ACTUALIZADO' }, a.recordRevision(old));
  assert(a.state.recent.some((r) => r._id === 'recent0'));
  await a.loadRecent(100);
  assert.equal(a.state.recent.length, 55);
  a.stop();
});

test('record versions retain actor and notes; restoring preserves newer history and rejects stale revisions', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const first = await a.saveRecord({
    _id: 'audit',
    _batch: a.state.workspace.batch,
    nombre: 'UNO',
    _notes: 'Nota inicial',
    _sources: { nombre: 'Manual' },
  });
  const created = Object.keys((await a.fetchRecord('audit', true))._versions)[0];
  let edited = await a.updateRecord(
    { ...first, nombre: 'DOS', _notes: 'Nota nueva' },
    a.recordRevision(first),
  );
  edited = await a.fetchRecord('audit', true);
  assert.equal(Object.keys(edited._versions).length, 2);
  assert.equal(edited._versions[created].data.nombre, 'UNO');
  assert.equal(edited._versions[created].actor, 'user1');
  const restored = await a.restoreVersion('audit', created, a.recordRevision(edited));
  assert.equal(restored.nombre, 'UNO');
  assert.equal(restored._notes, 'Nota inicial');
  assert.equal(Object.keys((await a.fetchRecord('audit', true))._versions).length, 3);
  await assert.rejects(a.restoreVersion('audit', created, a.recordRevision(edited)), /cambió/);
  a.stop();
});
test('automatic archive update cannot revive deleted files or overwrite concurrent renames', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const file = { id: 'auto', batch: 'auto', name: 'Inicial', updated: 'one' };
  await a.saveHistory(file);
  await a.saveHistory({ ...file, name: 'Nuevo nombre', updated: 'two' });
  assert.equal(
    await a.refreshHistory(
      { ...file, updated: 'three', snapshot: [], xlsxBase64: 'test', recordCount: 0 },
      'one',
    ),
    false,
  );
  assert.equal(a.state.history[0].name, 'Nuevo nombre');
  await a.deleteHistory(a.state.history[0]);
  assert.equal(await a.refreshHistory({ ...file, updated: 'four' }, 'two'), false);
  assert.equal(a.state.history.length, 0);
  a.stop();
});

test('indexed search pages across archives and does not load the complete record root on startup', async () => {
  const records = {};
  for (let i = 0; i < 47; i++) {
    const id = 'r' + String(i).padStart(3, '0');
    records[id] = {
      _id: id,
      _batch: i % 2 ? 'old' : 'current',
      _saved: '2026-01-01',
      nombre: 'PÉREZ LÓPEZ ANA',
      poliza: 'P' + i,
      rfc: 'DEMO010101XYZ',
    };
  }
  const db = new MemoryDB({
      records,
      workspaces: { user1: { batch: 'current', draft: {}, revision: 'r' } },
    }),
    a = make(db);
  await a.start('user1');
  assert(a.state.records.every((r) => r._batch === 'current'));
  assert(
    db.reads.filter((r) => r.path === 'records').every((r) => (r.q.order && r.q.first) || r.q.last),
  );
  let cursor = null,
    ids = [];
  do {
    const page = await a.searchClients('nombre', 'perez lopez', cursor);
    assert(page.items.length <= 20);
    ids.push(...page.items.map((r) => r._id));
    cursor = page.cursor;
  } while (cursor);
  assert.equal(ids.length, 47);
  assert.equal(new Set(ids).size, 47);
  assert.equal((await a.searchClients('nombre', 'ANA PEREZ')).items.length, 0);
  assert.equal((await a.findDuplicates({ rfc: 'demo010101xyz' })).length, 20);
  a.stop();
});
test('copied flags sync, failed stale updates cannot overwrite edits, and edited records become pending', async () => {
  const db = new MemoryDB(),
    a = make(db),
    b = make(db);
  await a.start('user1');
  await b.start('user1');
  const item = await a.saveRecord({
    _id: 'r1',
    _batch: a.state.workspace.batch,
    _saved: '2026-01-01',
    poliza: 'P1',
    nombre: 'UNO',
  });
  assert.equal(await a.markCopied([item]), 1);
  assert(b.state.records[0]._copiedAt);
  const edited = await a.updateRecord({ ...item, nombre: 'DOS' }, a.recordRevision(item));
  assert.equal(b.state.records[0]._copiedAt, null);
  assert.equal(await b.markCopied([item]), 0);
  await assert.rejects(
    b.updateRecord({ ...item, nombre: 'STALE' }, b.recordRevision(item)),
    /cambió/,
  );
  assert.equal((await a.searchClients('nombre', 'DOS')).items[0]._id, 'r1');
  assert.equal((await a.searchClients('nombre', 'UNO')).items.length, 0);
  a.stop();
  b.stop();
});
test('trash hides client searches and supports restoration until expiry without losing the original batch', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const item = await a.saveRecord({
    _id: 'r1',
    _batch: a.state.workspace.batch,
    _saved: '2026-01-01',
    poliza: 'P1',
  });
  await a.trashRecord(item);
  assert.equal(a.state.records.length, 0);
  assert.equal((await a.searchClients('poliza', 'P1')).items.length, 0);
  assert.equal((await a.listTrash()).items.length, 1);
  await a.restoreRecord('r1');
  assert.equal(a.state.records[0]._batch, item._batch);
  assert.equal((await a.searchClients('poliza', 'P1')).items.length, 1);
  await a.trashRecord(a.state.records[0]);
  db.write('records/r1/_expiresAt', Date.now() - 1);
  await assert.rejects(a.restoreRecord('r1'), /venció/);
  a.stop();
});
test('multiple pending drafts and seller names sync, and stale pending edits are rejected', async () => {
  const db = new MemoryDB(),
    a = make(db),
    b = make(db);
  await a.start('user1');
  await b.start('user1');
  const one = await a.savePending({
      batch: 'one',
      name: 'UNO',
      draft: { nombre: 'A' },
      reason: 'FALTA PRIMA',
    }),
    two = await a.savePending({ batch: 'two', name: 'DOS', draft: { nombre: 'B' } });
  assert.equal(b.state.pending.length, 2);
  const changed = await b.savePending({ ...one, reason: 'REVISAR RFC' }, one.revision);
  await assert.rejects(a.removePending(one.id, one.revision), /cambió/);
  await a.removePending(two.id, two.revision);
  assert.equal(b.state.pending[0].revision, changed.revision);
  await a.saveSeller('Toño nuevo');
  assert(b.state.sellers.some((s) => s.name === 'TOÑO NUEVO'));
  assert.equal(a.state.workspace.draft.nombre, undefined);
  a.stop();
  b.stop();
});

test('trash retains three calendar months including legacy entries and clamps month ends', async () => {
  const db = new MemoryDB(),
    a = make(db);
  await a.start('user1');
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse('2026-01-31T12:00:00Z');
    const item = await a.saveRecord({ _id: 'months', _batch: a.state.workspace.batch });
    await a.trashRecord(item);
    assert.equal(db.read('records/months/_expiresAt'), Date.parse('2026-04-30T12:00:00Z'));
    db.write('records/legacy', {
      _id: 'legacy',
      _batch: item._batch,
      _deletedAt: Date.now(),
      _expiresAt: Date.now() + 30 * 86400000,
    });
    Date.now = () => Date.parse('2026-04-15T12:00:00Z');
    assert.equal((await a.listTrash()).items.length, 2);
    await a.restoreRecord('legacy');
    Date.now = () => Date.parse('2026-04-30T12:00:00Z');
    assert.equal((await a.listTrash()).items.length, 0);
    await assert.rejects(a.restoreRecord('months'), /venció/);
  } finally {
    Date.now = originalNow;
    a.stop();
  }
});
