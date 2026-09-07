const assert = require('node:assert/strict');
module.exports = async function scannerFields(page) {
  await page.evaluate(() => {
    window.Tesseract = {
      createWorker: async () => ({
        setParameters: async () => {},
        recognize: async () => ({ data: { text: '', blocks: [] } }),
        terminate: async () => {},
      }),
    };
    window.SpeechRecognition = class {
      start() {
        window.scanTestRecognition = this;
      }
      abort() {
        this.onend?.();
      }
    };
  });
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 600, 800);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page
    .locator('#documentFile')
    .setInputFiles({
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image, 'base64'),
    });
  await page.waitForFunction(() => !document.querySelector('#analyzeDocumentBtn').disabled);
  await page.locator('#analyzeDocumentBtn').click();
  await page.waitForFunction(() => !document.querySelector('#applyScanBtn').disabled);
  assert(await page.locator('#scan-estatus').isDisabled());
  const original = await page.locator('#nombre').inputValue();
  await page.locator('#scan-paterno').fill('perez');
  await page.locator('#scan-materno').fill('lopez');
  await page.locator('#scan-nombres').fill('ana');
  await page.locator('#scan-nombres').evaluate((input) => {
    input.focus();
    input.setSelectionRange(1, 1);
  });
  await page.locator('#scan-nombres').press('x');
  assert.equal(await page.locator('#scan-nombres').inputValue(), 'AXNA');
  assert.equal(await page.locator('#scan-nombres').evaluate((input) => input.selectionStart), 2);
  await page.locator('#scan-nombres').fill('ANA SOFIA');
  await page.locator('#scan-nombres').evaluate((input) => input.setSelectionRange(3, 3));
  await page.getByRole('button', { name: 'Dictar NOMBRES', exact: true }).click();
  await page.evaluate(() => {
    const result = [{ transcript: 'maria' }];
    result.isFinal = true;
    scanTestRecognition.onresult({ resultIndex: 0, results: [result] });
  });
  assert.equal(await page.locator('#scan-nombres').inputValue(), 'ANA MARIA SOFIA');
  await page.getByRole('button', { name: 'Dictar NOMBRES', exact: true }).click();
  await page.locator('#scan-suma').fill('125000.50');
  assert.equal(await page.locator('#scan-suma').inputValue(), '125,000.50');
  await page.locator('#scan-prima').fill('250.75');
  await page.locator('#scan-primaExcedente').fill('60.25');
  await page.locator('#scan-medio').selectOption('FISICA');
  await page.locator('#scan-talon').selectOption('TALON');
  await page.locator('#scan-negocio').selectOption('INCREMENTO');
  await page.locator('#scan-fecha').fill('11092026');
  assert.equal(await page.locator('#scan-fecha').inputValue(), '11/09/2026');
  await page.locator('#scan-telefono').fill('0012345678');
  assert.equal(await page.locator('#scan-telefono').inputValue(), '0012345678');
  await page.locator('#scan-rfc').fill('sabe800311ln2');
  await page.locator('#scan-suggest-curp').click();
  assert.equal(await page.locator('#scan-curp').inputValue(), 'SABE800311');
  assert((await page.locator('#scan-curp').locator('..').textContent()).includes('incompleta'));
  await page.locator('#scan-correo').fill('Jósé');
  assert.deepEqual(
    await page
      .locator('#scan-email-suggestions option')
      .evaluateAll((options) => options.map((o) => o.value)),
    ['jose@gmail.com', 'jose@hotmail.com'],
  );
  await page.locator('#scan-correo').fill('Jósé@Gmáil.com');
  assert.equal(await page.locator('#scan-correo').inputValue(), 'jose@gmail.com');
  await page.locator('#scan-rfc').press('Enter');
  assert(await page.locator('#scan-curp').evaluate((input) => input === document.activeElement));
  assert.equal(await page.locator('#nombre').inputValue(), original);
  await page.locator('#scan-poliza').fill('B2');
  await page
    .locator('#scan-poliza')
    .locator('..')
    .getByRole('button', { name: 'Buscar cliente', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelector('#poliza').value === 'B2');
  assert.equal(await page.locator('#scan-prima').inputValue(), '250.75');
  await page
    .locator('#scan-poliza')
    .locator('..')
    .getByRole('button', { name: 'No tengo póliza', exact: true })
    .click();
  assert.equal(await page.locator('#scan-poliza').inputValue(), '');
  await page.locator('#applyScanBtn').click();
  assert.equal(await page.locator('#nombre').inputValue(), 'PEREZ LOPEZ ANA MARIA SOFIA');
  for (const [key, value] of Object.entries({
    prima: '250.75',
    primaExcedente: '60.25',
    medio: 'FISICA',
    talon: 'TALON',
    curp: 'SABE800311',
    fecha: '11/09/2026',
    telefono: '0012345678',
    suma: '125,000.50',
  }))
    assert.equal(await page.locator('#' + key).inputValue(), value);
  console.log(
    'PASS scan fields: cursor and voice insertion, search, clear, dropdowns, manual amounts, date, phone, optional identifiers and email suggestions',
  );
};
