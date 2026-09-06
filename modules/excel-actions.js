async function exportExcel(batchId = batch) {
  if (typeof batchId !== 'string') batchId = batch;
  const saved = historyFiles().find((f) => f.batch === batchId),
    requested = prompt(
      'Nombre del archivo antes de descargar:',
      saved?.name || 'METLIFE_' + batchId,
    );
  if (requested === null || !requested.trim()) return;
  const fileName = requested
    .trim()
    .replace(/\.xlsx$/i, '')
    .replace(/[\\/:*?"<>|]/g, '-');
  try {
    const list = await cloud.fetchBatch(batchId);
    if (!list.length) return showToast('Excel vacio', 'Guarda al menos un registro.');
    let data;
    const keys = window.metlifeExportKeys?.() || fields.map((f) => f.key),
      standard = JSON.stringify(keys) === JSON.stringify(fields.map((f) => f.key));
    if (standard && saved?._hasContent && sameArchive(saved, list)) {
      const content = await cloud.fetchHistoryContent(saved.id);
      if (sameArchive(content, list)) data = content.xlsxBase64;
    }
    if (!data)
      data = standard
        ? await workbookFor(list)
        : await metlifeExcel.generate(
            keys.map((k) => fields.find((f) => f.key === k).label),
            list.map((r) => keys.map((k) => String(r[k] ?? ''))),
          );
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
      url = URL.createObjectURL(
        new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ),
      link = document.createElement('a');
    link.href = url;
    link.download = fileName + '.xlsx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showToast('No se pudo descargar', error.message, true);
  }
}
function renderHistory() {
  const files = historyFiles()
    .slice()
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));
  $('#historyEmpty').style.display = files.length ? 'none' : 'flex';
  $('#historyList').style.display = files.length ? 'grid' : 'none';
  $('#historyList').innerHTML = files
    .map(
      (f) =>
        `<article class="history-item ${f.batch === batch ? 'current' : ''}" data-batch="${f.batch}"><div class="history-info"><div class="history-file-icon">▦</div><div><strong>${escapeHtml(f.name)}</strong><div class="history-meta"><span>${new Date(f.updated).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</span><span>${f.recordCount} ${f.recordCount === 1 ? 'registro' : 'registros'}</span>${f.batch === batch ? '<span class="current-badge">ABIERTO</span>' : ''}</div></div></div><div class="history-actions"><button class="history-action view" type="button">Ver</button><button class="history-action download" type="button">Descargar</button><button class="history-action rename" type="button">Modificar</button><button class="history-action delete" type="button">Eliminar</button></div></article>`,
    )
    .join('');
  const count = visibleRecords().length;
  const archived = archivedCurrent();
  $('#newExcelBtn').disabled =
    !cloud.state.ready || !cloud.state.connected || (count > 0 && !archived);
  $('#newExcelBtn').title = $('#newExcelBtn').disabled
    ? 'Guarda primero el Excel actual en el historial'
    : 'Crear un Excel nuevo';
  $('#historyHint').textContent = !count
    ? 'El archivo debe tener al menos un registro.'
    : archived
      ? 'Este archivo ya está guardado. Puedes actualizar su nombre o contenido.'
      : 'Hay cambios pendientes: guarda este Excel antes de crear uno nuevo.';
  if (archived && !$('#historyName').value) $('#historyName').value = archived.name;
  metlifeUI.afterHistory.forEach((fn) => fn());
}
function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
async function saveCurrentToHistory() {
  const name = $('#historyName').value.trim() || `METLIFE_${batch}`,
    count = visibleRecords().length;
  if (!count)
    return showToast('No hay registros', 'Agrega al menos un cliente antes de guardar este Excel.');
  if (!name) {
    $('#historyName').focus();
    return showToast('Escribe un nombre', 'El archivo necesita un nombre.');
  }
  const existing = historyFiles().find((f) => f.batch === batch),
    now = new Date().toISOString();
  const file = existing
    ? { ...existing, name, recordCount: count, updated: now }
    : { id: 'hist_' + batch, batch, name, recordCount: count, created: now, updated: now };
  $('#saveHistoryBtn').disabled = true;
  try {
    const list = await cloud.fetchBatch(file.batch);
    file.recordCount = list.length;
    file.snapshot = archiveSnapshot(list);
    file.xlsxBase64 = await workbookFor(list);
    await cloud.saveHistory(file);
    showToast('Historial guardado en la nube', name);
  } catch (error) {
    showToast('No se guardó el historial', error.message, true);
  } finally {
    $('#saveHistoryBtn').disabled = false;
  }
}
