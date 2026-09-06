const { test, before, after } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-metlife',
    database: {
      rules: fs.readFileSync('database.rules.json', 'utf8'),
      host: '127.0.0.1',
      port: Number(
        (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':').at(-1),
      ),
    },
  });
});
after(async () => {
  await env?.cleanup();
});
const record = {
  _id: 'r',
  _schema: 1,
  _batch: 'demo',
  _activeBatch: 'demo',
  _search: { poliza: 'A', nombre: 'DEMO', rfc: '', curp: '' },
  nombre: 'DEMO',
};
test('cloud adapter saves, indexes, versions and archives against real rules', async () => {
  const createCloud = require('../../cloud-store.js'),
    db = env.authenticatedContext('cloud-admin', { role: 'admin' }).database(),
    store = new Map(),
    cloud = createCloud({
      db,
      storage: {
        getItem: (key) => store.get(key) || null,
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key),
      },
      getUser: () => ({ uid: 'cloud-admin' }),
      getRole: () => 'admin',
    });
  try {
    await cloud.start('cloud-admin');
    const initial = await cloud.saveRecord({
      _id: 'integration',
      _batch: 'test',
      nombre: 'DEMO LÓPEZ',
      telefono: '0012345678',
    });
    await cloud.updateRecord(
      { ...initial, nombre: 'DEMO LÓPEZ MARÍA' },
      cloud.recordRevision(initial),
    );
    assert.equal((await cloud.searchClients('nombre', 'pez mar')).items.length, 1);
    assert.equal(Object.keys((await cloud.fetchRecord('integration', true))._versions).length, 2);
    await cloud.saveHistory({
      id: 'integration-history',
      batch: 'test',
      name: 'PRUEBA',
      recordCount: 1,
    });
    assert(cloud.state.history.some((h) => h.id === 'integration-history'));
  } finally {
    cloud.stop();
  }
});
test('anonymous and unassigned accounts cannot read client records', async () => {
  await assertFails(env.unauthenticatedContext().database().ref('records').once('value'));
  await assertFails(env.authenticatedContext('unknown').database().ref('records').once('value'));
});
test('reader can consult but cannot create or modify records or history', async () => {
  const db = env.authenticatedContext('reader', { role: 'lector' }).database();
  await assertSucceeds(db.ref('records').once('value'));
  await assertFails(db.ref('records/r').set(record));
  await assertFails(db.ref('history/h').set({ id: 'h', name: 'X' }));
});
test('editor can create and edit but only admin can trash and restore', async () => {
  const editor = env.authenticatedContext('editor', { role: 'editor' }).database(),
    admin = env.authenticatedContext('admin', { role: 'admin' }).database();
  await assertSucceeds(editor.ref('records/r').set(record));
  await assertSucceeds(editor.ref('records/r/nombre').set('MODIFICADO'));
  await assertFails(editor.ref('records/r/_deletedAt').set(Date.now()));
  await assertSucceeds(admin.ref('records/r/_deletedAt').set(Date.now()));
  await assertFails(editor.ref('records/r/_deletedAt').set(null));
  await assertSucceeds(admin.ref('records/r/_deletedAt').set(null));
  await assertFails(editor.ref('records/r').remove());
});
test('private workspaces, preferences and pending drafts are isolated by account', async () => {
  const a = env.authenticatedContext('a', { role: 'editor' }).database(),
    b = env.authenticatedContext('b', { role: 'admin' }).database();
  for (const root of ['workspaces', 'preferences', 'pendingDrafts']) {
    await assertSucceeds(a.ref(root + '/a/example').set('own'));
    await assertFails(b.ref(root + '/a').once('value'));
    await assertFails(b.ref(root + '/a/example').set('foreign'));
  }
});
test('roles cannot be elevated from the client database', async () => {
  const db = env.authenticatedContext('editor', { role: 'editor' }).database();
  await assertFails(db.ref('roles/editor').set('admin'));
  await assertFails(db.ref('settings/auditStorage').set(1));
});
test('only admins can soft-delete archives', async () => {
  const db = env.authenticatedContext('editor', { role: 'editor' }).database(),
    admin = env.authenticatedContext('admin', { role: 'admin' }).database();
  await assertSucceeds(db.ref('history/file').set({ id: 'file', name: 'DEMO' }));
  await assertFails(db.ref('history/file/_deletedAt').set(1));
  await assertSucceeds(admin.ref('history/file/_deletedAt').set(1));
  assert.ok(true);
});
test('encrypted backup can be restored and verified in the demo emulator', async () => {
  const { pack } = require('../../scripts/backup-core.cjs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    { promisify } = require('node:util'),
    exec = promisify(require('node:child_process').execFile);
  const key = crypto.randomBytes(32),
    proof = { records: { proof: { nombre: 'PRUEBA DE RESTAURACIÓN', telefono: '0012345678' } } },
    file = path.resolve('.qa/restore-proof.backup');
  fs.mkdirSync('.qa', { recursive: true });
  fs.writeFileSync(file, pack(proof, key));
  await exec(process.execPath, ['scripts/backup.cjs', 'restore-emulator', file], {
    env: {
      ...process.env,
      METLIFE_PROJECT: 'demo-metlife',
      METLIFE_DATABASE_URL: 'https://demo-metlife.firebaseio.com',
      METLIFE_BACKUP_KEY: key.toString('base64'),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    assert.deepEqual((await context.database().ref().once('value')).val(), proof);
  });
  fs.unlinkSync(file);
});
