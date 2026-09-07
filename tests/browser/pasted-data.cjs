const assert = require('node:assert/strict');
module.exports = async function pastedData(page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedInstructions = text;
        },
        readText: async () => {
          throw Error('Permission denied');
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Copiar instrucciones', exact: true }).click();
  await page.waitForFunction(() => !!window.copiedInstructions);
  assert((await page.evaluate(() => window.copiedInstructions)).includes('"datos"'));
  const original = await page.locator('#nombre').inputValue();
  await page.getByRole('button', { name: 'Pegar datos', exact: true }).click();
  await page.screenshot({
    path: require('node:path').resolve(__dirname, '../../.qa/paste-data-mobile.png'),
  });
  await page.locator('#pasteDataText').fill('respuesta incompleta');
  await page.getByRole('button', { name: 'Revisar datos', exact: true }).click();
  assert(await page.locator('#pasteDataDialog').evaluate((dialog) => dialog.open));
  assert((await page.locator('#pasteDataStatus').textContent()).includes('No se reconoció'));
  assert.equal(await page.locator('#nombre').inputValue(), original);
  await page.locator('#pasteDataText').fill(
    JSON.stringify({
      datos: {
        poliza: '',
        paterno: 'PÉREZ',
        materno: 'LÓPEZ',
        nombres: 'ELENA',
        telefono: '0012345678',
        suma: '125000.50',
        rfc: 'SABE800311',
        prima: '',
        fecha: '11/09/2026',
        negocio: 'NUEVA',
      },
      dudas: ['Revisar CURP', '<img src=x onerror=alert(1)>'],
    }),
  );
  await page.getByRole('button', { name: 'Revisar datos', exact: true }).click();
  assert.equal(await page.locator('#scan-telefono').inputValue(), '0012345678');
  assert.equal(await page.locator('#scan-rfc').inputValue(), 'SABE800311');
  assert.equal(await page.locator('#scan-prima').inputValue(), '');
  assert.equal(await page.locator('#scan-suma').inputValue(), '125,000.50');
  assert.equal(await page.locator('#scanPasteNotes img').count(), 0);
  assert((await page.locator('#scanPasteNotes').textContent()).includes('<img'));
  assert.equal(await page.locator('#nombre').inputValue(), original);
  await page.locator('#applyScanBtn').click();
  assert.equal(await page.locator('#nombre').inputValue(), 'PÉREZ LÓPEZ ELENA');
  assert.equal(await page.locator('#poliza').inputValue(), '');
  assert.equal(await page.locator('#telefono').inputValue(), '0012345678');
  assert.equal(await page.locator('#prima').inputValue(), '');
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw Error('Denied');
    };
  });
  await page.getByRole('button', { name: 'Copiar instrucciones', exact: true }).click();
  assert(await page.locator('#instructionsDialog').evaluate((dialog) => dialog.open));
  assert((await page.locator('#instructionsText').inputValue()).includes('"datos"'));
  await page.locator('#closeInstructionsBtn').click();
  console.log(
    'PASS pasted transcription: copy, clipboard fallback, invalid input, safe review, incomplete data and form transfer',
  );
};
