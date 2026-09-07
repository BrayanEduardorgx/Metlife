const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../document-core.js');
test('conflicting handwritten amounts and identifiers require review instead of automatic capture', () => {
  const disputed = core.reconcileReadings('suma', '6000000000', '600,000.00');
  assert.equal(disputed.value, '');
  assert.equal(disputed.doubt, true);
  assert.equal(disputed.candidates.length, 2);
  assert.equal(core.reconcileReadings('suma', '100,000', '100000.00').value, '100000');
  assert.equal(core.reconcileReadings('rfc', 'ABCD010101XYZ', 'ABCD010101XY2').value, '');
  assert.equal(core.reconcileReadings('correo', 'unreadable', '').value, '');
});
test('application date comes from the handwritten footer, never date of birth', () => {
  assert.equal(
    core.valuesToForm({ comunidad: 'Villa Ejemplo, Ver. A 11de Noviembre de 2025' }).fecha,
    '11/11/2025',
  );
  assert.equal(core.sanitize('fecha', 'Lugar y fecha de nacimiento: 07/01/1994'), '');
  assert.equal(core.sanitize('fecha', '31 de Febrero de 2025'), '');
  assert.equal(core.valuesToForm({ fecha: '', comunidad: 'Villa Ejemplo, 11/11/2025' }).fecha, '');
  assert.equal(
    core.valuesToForm({ comunidad: 'Villa Ejemplo, Ver. A 11de Noviembre de 2025' }).comunidad,
    'VILLA EJEMPLO',
  );
});
test('name uses paternal, maternal, given names; manual fields remain empty', () => {
  const form = core.valuesToForm({
    paterno: 'Pérez',
    materno: 'López',
    nombres: 'José Luis',
    poliza: ' az 123 ',
    suma: '100,000.50',
    primaExcedente: '239,92',
    telefono: '(012) 345-6789',
    prima: '123',
    medio: 'PRO',
    vendida: 'JUAN',
    fecha: '01/01/2026',
    talon: 'TALON',
    estatus: 'ACTIVO',
    correo: 'JOSE@EXAMPLE.COM',
  });
  assert.equal(form.nombre, 'PÉREZ LÓPEZ JOSÉ LUIS');
  assert.equal(form.poliza, 'AZ123');
  assert.equal(form.suma, '100000.50');
  assert.equal(form.primaExcedente, '239.92');
  assert.equal(form.telefono, '0123456789');
  assert.equal(form.correo, 'jose@example.com');
  core.manual.forEach((k) => assert.equal(form[k], ''));
});
test('reads specified labels without leaking blank policy or unrelated fields', () => {
  const text =
    'N° de póliza:\nApellido paterno: PEREZ\nApellido materno: LOPEZ\nNombres: JOSE LUIS\nRFC: PELJ800101ABC\nCURP: PELJ800101HVZRRN01\nSuma asegurada básica (BAS): 100,000\nPRIMA: 350\nPrima excedente:\nCelular: 0123456789\nEmail: test@example.com\nNombre de la empresa:\nLugar y fecha: Las Choapas, 4 de septiembre de 2026';
  const { values } = core.extractText(text);
  assert.equal(values.poliza, '');
  assert.equal(values.primaExcedente, '');
  assert.equal(values.paterno, 'PEREZ');
  assert.equal(values.trabajo, '');
  assert.equal(values.comunidad, 'LAS CHOAPAS');
  assert.equal(values.suma, '100000');
  assert.equal(values.correo, 'test@example.com');
  assert.equal(core.valuesToForm(values).nombre, 'PEREZ LOPEZ JOSE LUIS');
});
test('checkboxes do not choose an unmarked printed option', () => {
  assert.equal(
    core.extractText('Póliza nueva [ ] Incremento [ ] Inclusión [ ]').values.negocio,
    '',
  );
  assert.equal(
    core.extractText('[X] Póliza nueva [ ] Incremento [ ] Inclusión').values.negocio,
    'NUEVA',
  );
  assert.equal(
    core.extractText('[ ] Póliza nueva [X] Incremento [ ] Inclusión').values.negocio,
    'INCREMENTO',
  );
});
test('searches all batches, accents and spacing; exact policy first; no surname reordering', () => {
  const records = [
    { poliza: 'AB1234', nombre: 'PEREZ LOPEZ JUAN', _batch: 'old' },
    { poliza: 'AB123', nombre: 'PÉREZ LÓPEZ JUAN', _batch: 'new' },
  ];
  assert.equal(core.searchClients(records, 'nombre', ' pérez   lopez juan ').length, 2);
  assert.equal(core.searchClients(records, 'nombre', 'JUAN PEREZ').length, 0);
  assert.equal(core.searchClients(records, 'poliza', 'ab123')[0].poliza, 'AB123');
  assert.equal(core.searchClients(records, 'poliza', 'NOTFOUND').length, 0);
  assert.equal(core.searchClients(records, 'nombre', '').length, 0);
});
test('invalid OCR amount remains blank; blanks do not shift fields', () => {
  assert.equal(core.sanitize('suma', 'ILEGIBLE'), '');
  assert.equal(core.sanitize('primaExcedente', ''), '');
  assert.equal(core.sanitize('suma', '1.000,25'), '1000.25');
  assert.equal(core.valuesToForm({}).nombre, '');
});

test('printed name labels in columns pick nearby writing without swapping surnames', () => {
  const w = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });
  const words = [
    w('Apellido', 10, 100, 65, 110),
    w('paterno', 70, 100, 125, 110),
    w('Apellido', 200, 100, 255, 110),
    w('materno', 260, 100, 315, 110),
    w('Nombres', 400, 100, 480, 110),
    w('PEREZ', 10, 120, 80, 132),
    w('LOPEZ', 200, 120, 270, 132),
    w('JOSE', 400, 120, 450, 132),
    w('LUIS', 460, 120, 500, 132),
  ];
  const data = {
    text: 'Apellido paterno Apellido materno Nombres\nPEREZ LOPEZ JOSE LUIS',
    blocks: [{ paragraphs: [{ lines: [{ words }] }] }],
  };
  const result = core.extractLayout(data, 800, 1000);
  assert.equal(result.values.paterno, 'PEREZ');
  assert.equal(result.values.materno, 'LOPEZ');
  assert.equal(result.values.nombres, 'JOSE LUIS');
});

test('Autollenar preserves empty PRIMA before PRIMA EXCEDENTE', () => {
  const vm = require('node:vm'),
    fs = require('node:fs');
  const src = fs.readFileSync(require.resolve('../modules/capture-import.js'), 'utf8');
  const nodes = {};
  const document = { querySelector: (key) => (nodes[key] ??= { value: '' }) };
  const context = vm.createContext({
    document,
    labels: require('../modules/field-schema.js').labels,
    $: (key) => document.querySelector(key),
  });
  const parser = src.slice(src.indexOf('function parseImport()'));
  context.setField = (key, value) => (document.querySelector('#' + key).value = value);
  context.saveDraft = () => {};
  context.checkDuplicate = () => {};
  context.showToast = () => {};
  context.parsePositionalImport = () => 0;
  document.querySelector('#importText').value =
    'PÓLIZA: TEST123\nNOMBRE: PEREZ LOPEZ JOSE\nPRIMA: \nPRIMA EXCEDENTE: 25.50\nMEDIO: \nVENDIDA: \nRFC: ABC123\nTALÓN O CUENTA BANCARIA: ';
  vm.runInContext(parser + '\nparseImport()', context);
  assert.equal(document.querySelector('#prima').value, '');
  assert.equal(document.querySelector('#primaExcedente').value, '25.50');
  assert.equal(document.querySelector('#medio').value, '');
  assert.equal(document.querySelector('#vendida').value, '');
});

test('VENDIDA is an optional scanned name, separate from the client and manual fields', () => {
  const form = core.valuesToForm({
    paterno: 'Pérez',
    materno: 'López',
    nombres: 'Ana',
    vendida: ' asesora de prueba ',
    prima: '25',
    medio: 'FISICA',
    fecha: '01/01/2026',
    talon: 'TALON',
  });
  assert.equal(form.vendida, 'ASESORA DE PRUEBA');
  assert.equal(form.nombre, 'PÉREZ LÓPEZ ANA');
  core.manual.forEach((key) => assert.equal(form[key], ''));
  assert.equal(core.valuesToForm({}).vendida, '');
  assert.equal(
    core.extractText('VENDIDA: Asesora Prueba\nCelular: 0123456789').values.vendida,
    'ASESORA PRUEBA',
  );
});

test('inline value proof crops its own writing instead of the following field', () => {
  const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });
  const data = {
    text: 'N° de póliza: TEST123\nApellido paterno: PEREZ',
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  word('N°', 10, 10, 25, 25),
                  word('de', 30, 10, 45, 25),
                  word('póliza:', 50, 10, 90, 25),
                  word('TEST123', 100, 10, 180, 25),
                  word('Apellido', 10, 45, 70, 60),
                  word('paterno:', 75, 45, 130, 60),
                  word('PEREZ', 140, 45, 190, 60),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const result = core.extractLayout(data, 500, 700);
  const rect = result.regions.find((r) => r.key === 'poliza').rect;
  assert(rect.left >= 90);
  assert(rect.top + rect.height < 45);
});
