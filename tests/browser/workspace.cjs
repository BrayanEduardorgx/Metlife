const fs = require('fs'),
  http = require('http'),
  path = require('path'),
  assert = require('assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
let data = { '.info': { connected: true } },
  clients = new Set();
const read = (p) =>
  p
    .split('/')
    .filter(Boolean)
    .reduce((v, k) => v?.[k], data) ?? null;
function write(p, v) {
  const keys = p.split('/').filter(Boolean);
  let t = data;
  for (const k of keys.slice(0, -1)) t = t[k] ??= {};
  if (v === null) delete t[keys.at(-1)];
  else t[keys.at(-1)] = structuredClone(v);
}
const publish = () => {
  for (const client of clients) client.write('data: ' + JSON.stringify(data) + '\n\n');
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/qa/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    res.write('data: ' + JSON.stringify(data) + '\n\n');
    return;
  }
  if (url.pathname === '/qa/value') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(read(url.searchParams.get('path'))));
  }
  if (url.pathname === '/qa/write') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const change = JSON.parse(body);
    let committed = true;
    if (
      change.operation === 'transaction' &&
      JSON.stringify(change.before) !== JSON.stringify(read(change.path))
    )
      committed = false;
    else if (change.operation === 'update') {
      for (const [k, v] of Object.entries(change.value))
        write([change.path, k].filter(Boolean).join('/'), v);
    } else write(change.path, change.value);
    if (committed) publish();
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ committed, value: read(change.path) }));
  }
  try {
    const filename = path.join(root, url.pathname === '/' ? 'index.html' : url.pathname);
    let body = fs.readFileSync(filename);
    if (url.pathname === '/') {
      let html = body
        .toString()
        .replace(/<script src="https:[^>]+><\/script>/g, '')
        .replace(/<link[^>]+https:[^>]+>/g, '')
        .replace(
          '<script src="cloud-store.js">',
          '<script src="tests/support/query.js"></script><script src="tests/support/cloud-shim.js"></script><script src="cloud-store.js">',
        );
      body = Buffer.from(html);
    }
    res.writeHead(200, {
      'Content-Type': filename.endsWith('.js')
        ? 'text/javascript'
        : filename.endsWith('.css')
          ? 'text/css'
          : filename.endsWith('.png')
            ? 'image/png'
            : 'text/html',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
(async () => {
  fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
  await new Promise((r) => server.listen(4189, '127.0.0.1', r));
  const browser = await chromium.launch({
    ...(process.platform === 'win32'
      ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }
      : {}),
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
      errors = [];
    let contentRequests = 0;
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept('REPORTE PRUEBA'));
    page.on('request', (r) => {
      if (decodeURIComponent(r.url()).includes('path=historyContent/')) contentRequests++;
    });
    await page.goto('http://127.0.0.1:4189');
    await page.locator('#app').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => typeof window.XLSX), 'undefined');
    await page.evaluate(async () => {
      await cloud.saveHistory({
        id: 'owned-file',
        batch: 'owned',
        name: 'EXCEL ANTERIOR',
        updated: 'one',
        recordCount: 0,
      });
      await cloud.saveRecord({
        _id: 'alpha',
        _batch: '__cloud__',
        _saved: new Date().toISOString(),
        nombre: 'PÉREZ LÓPEZ MARÍA',
        telefono: '0012345678',
        poliza: 'A1',
        _notes: 'NO EXPORTAR',
      });
      await cloud.saveRecord({
        _id: 'beta',
        _batch: '__cloud__',
        _saved: new Date().toISOString(),
        nombre: 'JUAN RUIZ',
        telefono: '9988776655',
        poliza: 'B2',
      });
      await cloud.saveRecord({
        _id: 'owned',
        _batch: 'owned',
        _saved: new Date().toISOString(),
        nombre: 'CLIENTE ARCHIVADO',
        poliza: 'C3',
      });
    });
    await page.waitForFunction(() => cloud.state.history.some((f) => f._hasContent));
    await page.locator('#nombre').fill('pez mar');
    await page.locator('.lookup-client[data-key="nombre"]').click();
    await page.waitForFunction(
      () => document.querySelector('#nombre').value === 'PÉREZ LÓPEZ MARÍA',
    );
    await page.locator('#clearBtn').click();
    await page.locator('#telefono').fill('01234');
    await page.locator('.lookup-client[data-key="telefono"]').click();
    await page.waitForFunction(
      () => document.querySelector('#nombre').value === 'PÉREZ LÓPEZ MARÍA',
    );
    await page.locator('#clearBtn').click();
    await page.locator('#selectAllRecords').check();
    await page.locator('#bulkAttachBtn').click();
    await page.locator('#bulkAttachTarget').selectOption('__new__');
    await page.locator('#bulkAttachName').fill('LOTE NUEVO');
    await page
      .locator('#bulkAttachDialog')
      .getByRole('button', { name: 'Agregar clientes', exact: true })
      .click();
    await page.locator('#bulkAttachDialog').waitFor({ state: 'hidden' });
    assert(
      (await page.locator('#recordLocationNotice').textContent()).includes('Se agregaron 2 de 3'),
    );
    assert(
      (await page.locator('#recordLocationNotice').textContent()).includes('CLIENTE ARCHIVADO'),
    );
    assert.equal(await page.evaluate(async () => (await cloud.fetchBatch('owned')).length), 1);
    const target = await page.evaluate(
      () => cloud.state.history.find((f) => f.name === 'LOTE NUEVO').batch,
    );
    assert.equal(
      await page.evaluate(() =>
        cloud.state.history.every((f) => f.xlsxBase64 === undefined && f.snapshot === undefined),
      ),
      true,
    );
    await page.waitForFunction(
      () => !draftDirty && !writingDraft && !archiveJobs.size && !archiveTimers.size,
    );
    contentRequests = 0;
    await page.reload();
    await page.locator('#app').waitFor({ state: 'visible' });
    assert.equal(contentRequests, 0);
    const pendingDownload = page.waitForEvent('download');
    await page.locator('.history-item[data-batch="' + target + '"] .download').click();
    const download = await pendingDownload;
    assert.equal(download.suggestedFilename(), 'REPORTE PRUEBA.xlsx');
    const filename = path.join(root, '.qa', 'performance-report.xlsx');
    await download.saveAs(filename);
    assert(contentRequests > 0);
    const XLSX = require('../../vendor/xlsx.full.min.js'),
      book = XLSX.read(fs.readFileSync(filename), { type: 'buffer' }),
      rows = XLSX.utils.sheet_to_json(book.Sheets.REGISTROS, { header: 1 });
    assert.equal(rows.length, 3);
    assert.equal(rows[1].length, 17);
    assert(rows.some((row) => row.includes('0012345678')));
    assert(rows.some((row) => row.includes('PÉREZ LÓPEZ MARÍA')));
    assert(!JSON.stringify(rows).includes('NO EXPORTAR'));

    assert.equal(await page.evaluate(() => typeof window.MetlifeDocument), 'undefined');
    await page.locator('#workspaceTools > summary').click();
    await page.locator('.history-item[data-batch="owned"] .favorite').click();
    await page.waitForFunction(
      () => document.querySelector('#historyList').firstElementChild.dataset.batch === 'owned',
    );
    await page.locator('#searchInput').fill('PÉREZ');
    await page.locator('#saveFilterBtn').click();
    await page.waitForFunction(() => document.querySelector('#savedFilters').options.length === 2);
    await page.locator('#searchInput').fill('');
    await page.locator('#savedFilters').selectOption({ label: 'REPORTE PRUEBA' });
    assert.equal(await page.locator('#searchInput').inputValue(), 'PÉREZ');
    await page.locator('#searchInput').fill('');
    await page.locator('#dailySummaryBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('#dailySummary').textContent.includes('3 capturas'),
    );
    await page.evaluate(() => {
      selectedRecords.clear();
      for (const r of tableRecords().filter((r) => ['alpha', 'beta'].includes(r._id)))
        selectedRecords.add(recordSelectionKey(r));
      renderRecords();
    });
    await page.locator('#bulkEditBtn').click();
    await page.locator('#bulkEditField').selectOption('comunidad');
    await page.locator('#bulkEditValue').fill('ZONA NUEVA');
    await page
      .locator('#bulkEditDialog')
      .getByRole('button', { name: 'Ver cambios', exact: true })
      .click();
    assert((await page.locator('#bulkEditDialog').textContent()).includes('JUAN RUIZ'));
    await page
      .locator('#bulkEditDialog')
      .getByRole('button', { name: 'Confirmar cambios', exact: true })
      .click();
    await page.waitForFunction(() =>
      document.querySelector('#bulkEditDialog').textContent.includes('2 actualizados'),
    );
    await page
      .locator('#bulkEditDialog')
      .getByRole('button', { name: 'Cancelar', exact: true })
      .click();
    assert.equal(
      await page.evaluate(async () => (await cloud.fetchRecord('alpha')).comunidad),
      'ZONA NUEVA',
    );
    assert.equal(
      await page.evaluate(async () => (await cloud.fetchRecord('owned')).comunidad || ''),
      '',
    );
    await page.evaluate(() => (window.unchangedRow = document.querySelector('tr[data-id="beta"]')));
    await page.evaluate(async () => {
      const r = await cloud.fetchRecord('alpha');
      await cloud.updateRecord({ ...r, trabajo: 'OTRA OFICINA' }, cloud.recordRevision(r));
    });
    await page.waitForTimeout(100);
    assert(
      await page.evaluate(
        () => window.unchangedRow === document.querySelector('tr[data-id="beta"]'),
      ),
    );
    await page.locator('#exportTemplateBtn').click();
    await page.locator('#templateColumns input').evaluateAll((inputs) =>
      inputs.forEach((i) => {
        i.checked = ['nombre', 'telefono'].includes(i.dataset.key);
      }),
    );
    await page.locator('#templateColumns input[data-key="telefono"]').evaluate((input) => {
      const row = input.closest('div');
      for (let i = 0; i < 10; i++) row.querySelector('button').click();
    });
    await page
      .locator('#exportTemplateDialog')
      .getByRole('button', { name: 'Guardar plantilla', exact: true })
      .click();
    await page.locator('#exportTemplateDialog').waitFor({ state: 'hidden' });
    const customPending = page.waitForEvent('download');
    await page.locator('.history-item[data-batch="' + target + '"] .download').click();
    const custom = await customPending,
      customPath = path.join(root, '.qa', 'custom-columns.xlsx');
    await custom.saveAs(customPath);
    const customBook = XLSX.read(fs.readFileSync(customPath), { type: 'buffer' }),
      customRows = XLSX.utils.sheet_to_json(customBook.Sheets.REGISTROS, { header: 1 });
    assert.deepEqual(customRows[0], ['TELÉFONO', 'NOMBRE COMPLETO']);
    assert(customRows.some((r) => r[0] === '0012345678'));
    assert.equal(
      await page.evaluate(
        async (id) =>
          Object.keys(
            (await cloud.fetchHistoryContent(cloud.state.history.find((f) => f.batch === id).id))
              .snapshot[0],
          ).length,
        target,
      ),
      18,
    );
    await page.evaluate(async () => {
      let attempt = 0;
      try {
        await metlifeOperations.run('retry-proof', 'Prueba de reintento', async () => {
          if (!attempt++) throw Error('Fallo simulado');
        });
      } catch {}
    });
    await page
      .locator('#workspaceTools details')
      .filter({ hasText: 'Operaciones pendientes' })
      .locator('summary')
      .click();
    await page
      .locator('#operationsList')
      .getByRole('button', { name: 'Reintentar', exact: true })
      .click();
    await page.waitForFunction(() => !metlifeOperations.entries.has('retry-proof'));
    await page.evaluate(async () => {
      await metlifeScannerLoader.load();
    });
    assert.equal(await page.evaluate(() => typeof window.MetlifeDocument), 'object');
    await page.evaluate(() => {
      metlifeState.role = 'lector';
      renderRecords();
    });
    assert(await page.locator('#clientForm .save-btn').isDisabled());
    assert(await page.locator('.record-trash').first().isHidden());
    assert(
      await page.evaluate(async () => {
        try {
          await cloud.saveRecord({ _id: 'forbidden', _batch: batch });
          return false;
        } catch {
          return true;
        }
      }),
    );
    await page.evaluate(() => {
      metlifeState.role = 'admin';
      renderRecords();
    });
    assert(await page.locator('#clientForm .save-btn').isEnabled());
    assert.equal(await page.locator('#recordsBody tr').count(), 3);
    console.log(
      'PASS favorites; saved filters; daily summary; bulk edit preview; unchanged DOM rows; ordered export templates; retry center; lazy scanner; reader permissions',
    );
    await page.evaluate(() => {
      const headers = MetlifeArchiveCore.keys;
      const rows = Array.from({ length: 100000 }, (_, i) =>
        headers.map((_, j) => 'DATO ' + i + ' ' + j),
      );
      window.qaWorkerDone = false;
      window.qaWorkerError = '';
      window.metlifeExcel
        .generate(headers, rows)
        .then(() => (window.qaWorkerDone = true))
        .catch((e) => (window.qaWorkerError = e.message));
    });
    await page.locator('#excelTaskStatus').waitFor({ state: 'visible' });
    await page.locator('#nombre').fill('PUEDO SEGUIR ESCRIBIENDO');
    await page.locator('#cancelExcelTask').click();
    await page.waitForFunction(() => !!window.qaWorkerError);
    assert((await page.evaluate(() => window.qaWorkerError)).includes('cancelada'));
    assert.equal(await page.locator('#nombre').inputValue(), 'PUEDO SEGUIR ESCRIBIENDO');
    assert.equal(
      await page.evaluate(
        async () =>
          (await cloud.fetchBatch(cloud.state.history.find((f) => f.name === 'LOTE NUEVO').batch))
            .length,
      ),
      2,
    );
    const generated = await page.evaluate(
      async () => await metlifeExcel.generate(['PRUEBA'], [['DESPUES DE CANCELAR']]),
    );
    assert.equal(
      XLSX.utils.sheet_to_json(XLSX.read(generated, { type: 'base64' }).Sheets.REGISTROS, {
        header: 1,
      })[1][0],
      'DESPUES DE CANCELAR',
    );
    await require('./scanner-fields.cjs')(page);
    const pastePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    pastePage.on('pageerror', (e) => errors.push(e.message));
    pastePage.on('dialog', (d) => d.accept());
    await pastePage.goto('http://127.0.0.1:4189');
    await pastePage.locator('#app').waitFor({ state: 'visible' });
    assert.equal(await pastePage.evaluate(() => typeof window.MetlifeTranscription), 'undefined');
    await require('./pasted-data.cjs')(pastePage);
    await pastePage.close();
    await page.locator('#scanReview').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(root, '.qa', 'scanner-fields-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#scanReview').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(root, '.qa', 'scanner-fields-mobile.png') });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(root, '.qa', 'workspace-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      'PASS lightweight metadata and on-demand content; substring/phone lookup; bulk partial success; real XLSX in worker preserves text and excludes notes; responsive form, cancellation and worker restart',
    );
  } finally {
    await browser.close();
    for (const c of clients) c.end();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  for (const c of clients) c.end();
  server.close();
  process.exitCode = 1;
});
