const test = require('node:test'),
  assert = require('node:assert/strict');
const core = require('../transcription-core.js');
test('pasted transcription preserves blank fields, leading zeroes and incomplete identifiers', () => {
  const source = {
    datos: {
      poliza: '',
      paterno: 'PÉREZ',
      telefono: '0012345678',
      rfc: 'SABE800311',
      suma: '100000.50',
      prima: '',
    },
    dudas: ['Revisar el apellido.'],
  };
  const result = core.parse('```json\n' + JSON.stringify(source) + '\n```');
  assert.deepEqual(result.values, source.datos);
  assert.deepEqual(result.doubts, source.dudas);
});
test('malformed or multiple documents do not become partial imports', () => {
  for (const value of [
    '',
    'texto suelto',
    '[{"datos":{}}]',
    '{"datos":{}}',
    '{"datos":{"telefono":123456789}}',
    '{"datos":{"rfc":{"value":"ABC"}}}',
    '{"datos":{"rfc":"ABC"},"dudas":"revisar"}',
  ])
    assert.throws(() => core.parse(value));
});
test('extra keys never enter form values and observations remain plain text', () => {
  assert.throws(() => core.parse('{"datos":{"suma":"100?000"}}'));
  assert.throws(() => core.parse('{"datos":{"telefono":"001?345678"}}'));
  const result = core.parse(
    '{"datos":{"paterno":"PEREZ","estatus":"ACTIVO","__proto__":{"polluted":true}},"dudas":["<img src=x onerror=alert(1)>"]}',
  );
  assert.deepEqual(result.values, { paterno: 'PEREZ' });
  assert.equal(result.values.polluted, undefined);
  assert.equal(result.doubts.length, 2);
});
test('copy instructions include every field and distinguish the source of each amount', () => {
  const structure = JSON.parse(core.instructions.slice(core.instructions.indexOf('{')));
  assert.deepEqual(Object.keys(structure.datos), core.keys);
  assert(core.instructions.includes('SUMA ASEGURADA BÁSICA (BAS)'));
  assert(core.instructions.includes('no usar el descuento al pie como prima'));
});
