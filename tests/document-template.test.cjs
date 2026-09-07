const { test } = require('node:test');
const assert = require('node:assert/strict');
const template = require('../document-template.js'),
  core = require('../document-core.js');
test('handwriting preprocessing preserves colored ink without changing the source crop', () => {
  const width = 80,
    height = 30,
    data = new Uint8ClampedArray(width * height * 4).fill(220);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (let y = 6; y < 20; y++)
    for (let x = 20; x < 24; x++) {
      const i = (y * width + x) * 4;
      data[i] = 170;
      data[i + 1] = 90;
      data[i + 2] = 150;
    }
  const before = new Uint8ClampedArray(data),
    result = template.prepareWriting({ data, width, height });
  assert.deepEqual(data, before);
  assert(template.hasWriting(result));
  assert(result.width < width);
  assert(result.height < height);
  assert.equal(result.data.length, result.width * result.height * 4);
  assert(result.data.some((level, index) => index % 4 !== 3 && level < 80));
});
const landmarks = {
  poliza: [920.5, 254.5],
  paterno: [231, 354.5],
  materno: [645, 343.5],
  nombres: [1014.5, 324.5],
  telefono: [125, 427.5],
  correo: [447.5, 419.5],
  trabajo: [686.5, 472.5],
  suma: [232, 711],
  comunidad: [347.5, 1547.5],
};
function regions(scale = 1, dx = 0, dy = 0) {
  return Object.entries(landmarks).map(([key, [x, y]]) => ({
    key,
    label: {
      x0: x * scale + dx - 30,
      y0: y * scale + dy - 7,
      x1: x * scale + dx + 30,
      y1: y * scale + dy + 7,
    },
  }));
}
test('aligns complete template after scaling/translation and ignores beneficiary labels', () => {
  const data = regions(0.8, 50, 30);
  data.push({ key: 'paterno', label: { x0: 400, x1: 520, y0: 810, y1: 825 } });
  const result = template.locate(data, 1200, 1600);
  assert(result);
  assert.equal(result.matched, 9);
  assert(Math.abs(result.rects.poliza.left * 1200 - (970 * 0.8 + 50)) < 0.01);
  assert(result.rects.comunidad.top > 0.7);
});
test('requires multiple matching labels including bottom place and BAS', () => {
  assert.equal(
    template.locate(
      regions().filter((r) => r.key !== 'comunidad'),
      1200,
      1600,
    ),
    null,
  );
  assert.equal(template.locate(regions().slice(0, 3), 1200, 1600), null);
  const broken = regions();
  broken.forEach((r, i) => {
    r.label.x0 += i * i * 90;
    r.label.x1 += i * i * 90;
  });
  assert.equal(template.locate(broken, 1200, 1600), null);
});
test('blank blue printed box is not a selection; dark pen inside is', () => {
  const width = 24,
    height = 24,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  const put = (x, y, r, g, b) => {
    const p = (y * width + x) * 4;
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
  };
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) if (x < 4 || x > 19 || y < 4 || y > 19) put(x, y, 20, 135, 190);
  const rect = { left: 0, top: 0, width: 1, height: 1 };
  assert.equal(template.classifyBox({ data, width, height }, rect), 0);
  for (let n = 5; n < 19; n++) for (let t = -1; t <= 1; t++) put(n, n + t, 40, 40, 40);
  assert(template.classifyBox({ data, width, height }, rect) > 0.09);
});
test('municipality excludes birth place, state abbreviation and handwritten date without spaces', () => {
  const result = core.extractText(
    'Lugar y fecha de nacimiento: Ciudad equivocada 01/01/1990\nNombre de la Empresa: ESCUELA\nLugar y fecha: Jesús Carranza, Ver. A 11de Noviembre de 2025',
  );
  assert.equal(result.values.comunidad, 'JESÚS CARRANZA');
});
test('hosting excludes reference documents', () => {
  const config = require('../firebase.json');
  assert(config.hosting.ignore.includes('ejemplo poliza.jpeg'));
  assert(config.hosting.ignore.includes('ejemplos/**'));
  assert(config.hosting.ignore.includes('.qa/**'));
});

test('blank writing line stays empty but a handwritten stroke is detected', () => {
  const width = 100,
    height = 30,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  function ink(x, y) {
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 30;
  }
  for (let x = 0; x < 100; x++) ink(x, 26);
  assert.equal(template.hasWriting({ data, width, height }), false);
  for (let y = 8; y < 26; y++) for (let x = 30; x < 33; x++) ink(x, y);
  assert.equal(template.hasWriting({ data, width, height }), true);
});

test('two marked boxes choose the first with a review warning', () => {
  const width = 1200,
    height = 1600,
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const [cx, cy] of [
    [370, 263],
    [525, 258],
  ])
    for (let y = cy - 4; y < cy + 4; y++)
      for (let x = cx - 4; x < cx + 4; x++) {
        const i = (y * width + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 25;
      }
  const result = template.readBoxes({ data, width, height }, { matrix: [1, 0, 0, 0, 1, 0] });
  assert.equal(result.value, 'NUEVA');
  assert.equal(result.marked.length, 2);
  assert(result.warning);
});
test('saved corrections follow translation on a different photo', () => {
  const current = template.locate(regions(0.8, 50, 30), 1200, 1600);
  const rect = { left: 0.2, top: 0.25, width: 0.15, height: 0.03 };
  const ref = template.toReference(rect, current, 1200, 1600);
  const recovered = template.transformRect(
    current.matrix,
    [ref.left * 1200, ref.top * 1600, ref.width * 1200, ref.height * 1600],
    1200,
    1600,
  );
  for (const k of Object.keys(rect)) assert(Math.abs(recovered[k] - rect[k]) < 1e-8);
});

test('seller writing has its own upper area, independent of ink color', () => {
  const located = template.locate(regions(), 1200, 1600);
  assert(located.rects.vendida.top + located.rects.vendida.height < located.rects.poliza.top);
  for (const ink of [
    [170, 90, 150],
    [30, 55, 140],
    [100, 100, 100],
  ]) {
    const width = 100,
      height = 40,
      data = new Uint8ClampedArray(width * height * 4).fill(235);
    for (let y = 8; y < 29; y++)
      for (let x = 30; x < 34; x++) {
        const i = (y * width + x) * 4;
        data[i] = ink[0];
        data[i + 1] = ink[1];
        data[i + 2] = ink[2];
      }
    assert(template.hasWriting({ data, width, height }));
  }
});
