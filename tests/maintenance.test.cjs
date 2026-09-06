const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const { pack, unpack } = require('../scripts/backup-core.cjs');
test('encrypted backups preserve data and reject corruption or the wrong key', () => {
  const key = crypto.randomBytes(32),
    data = { records: { sample: { nombre: 'DEMOSTRACIÓN', telefono: '0012345678' } } },
    backup = pack(data, key);
  assert.deepEqual(unpack(backup, key), data);
  assert(!backup.toString().includes('DEMOSTRACIÓN'));
  assert.throws(() => unpack(backup, crypto.randomBytes(32)));
  const broken = JSON.parse(backup.toString());
  broken.sha256 = 'bad';
  assert.throws(() => unpack(Buffer.from(JSON.stringify(broken)), key), /verificación/);
});
test('field schema and Excel share the same ordered field keys', () => {
  const schema = require('../modules/field-schema.js'),
    archive = require('../archive-core.js');
  assert.deepEqual(
    archive.keys,
    schema.fields.map((f) => f.key),
  );
  assert.equal(new Set(archive.keys).size, 17);
});
test('substring search keys support accents and Firebase-reserved punctuation', () => {
  const core = require('../modules/search-core.js');
  assert.equal(core.normalize('López María'), 'LOPEZ MARIA');
  assert(core.grams('LOPEZ MARIA').includes(core.encode('EZ ')));
  assert(!/[.#$[\]/]/.test(core.encode('A.#$[]/')));
});
