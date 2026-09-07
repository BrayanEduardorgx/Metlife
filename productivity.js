/* Capture tools; customer data remains in memory and the authenticated cloud. */
let undoCapture = null;
const archiveJobs = new Map(),
  archiveErrors = new Map(),
  archiveTimers = new Map();
const summaryPreference = 'metlife_show_save_summary_v1';
const get = (id) => document.getElementById(id);
const textNode = (tag, text) => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};
function captureMetadata() {
  return {
    _notes: get('internalNotes').value,
    _sources: { ...fieldSources },
    _needsReview: MetlifeFormCore.issues(draft(), fields).length > 0,
  };
}
function loadMetadata(item = {}) {
  fieldSources = { ...(item._sources || {}) };
  get('internalNotes').value = item._notes || '';
  renderSources();
}
function markSource(key, source) {
  if (!fields.some((f) => f.key === key)) return;
  fieldSources[key] = source;
  renderSources();
}
function renderSources() {
  for (const f of fields) {
    let hint = get('source-' + f.key);
    if (!hint) {
      hint = textNode('small', '');
      hint.id = 'source-' + f.key;
      hint.className = 'source-hint';
      get(f.key).closest('.field').append(hint);
    }
    hint.textContent = get(f.key).value
      ? 'Origen: ' + (fieldSources[f.key] || 'Sin identificar')
      : '';
    hint.hidden = !hint.textContent;
  }
}
function rememberUndo(label) {
  undoCapture = {
    batch,
    values: draft(),
    metadata: captureMetadata(),
    editingRecord,
    activePendingId,
    activePendingRevision,
  };
  get('undoDescription').textContent = label;
  get('undoPanel').hidden = false;
}
function forgetUndo() {
  undoCapture = null;
  get('undoPanel').hidden = true;
}
const baseSetField = setField;
setField = function (key, value, remember = true, source) {
  baseSetField(key, value, remember);
  if (source) markSource(key, source);
  else if (remember) markSource(key, 'Manual');
};
const baseClearForm = clearForm;
clearForm = function () {
  baseClearForm();
  loadMetadata();
  summarySignature = null;
  get('showSaveSummary').checked = localStorage.getItem(summaryPreference) === 'true';
  updateCaptureContext();
};
const baseApplyWorkspace = applySharedWorkspace;
applySharedWorkspace = function (value) {
  baseApplyWorkspace(value);
  loadMetadata(value.metadata || {});
  summarySignature = null;
  forgetUndo();
  updateCaptureContext();
};
get('clearBtn').onclick = () => {
  rememberUndo('Formulario limpiado');
  clearForm();
};
get('undoBtn').onclick = () => {
  if (!undoCapture || undoCapture.batch !== batch) return;
  const old = undoCapture;
  stopVoice();
  fields.forEach((f) => setField(f.key, old.values[f.key] || '', false));
  loadMetadata(old.metadata);
  editingRecord = old.editingRecord;
  activePendingId = old.activePendingId;
  activePendingRevision = old.activePendingRevision;
  reviewSignature = null;
  summarySignature = null;
  get('saveReview').hidden = true;
  forgetUndo();
  queueDraftSave();
  checkDuplicate();
  updateCaptureContext();
};
get('fields').addEventListener(
  'click',
  (e) => {
    if (e.target.closest('.clear-field')) rememberUndo('Campo vaciado');
  },
  true,
);
get('clientForm').addEventListener(
  'input',
  (e) => {
    if (fields.some((f) => f.key === e.target.id)) {
      markSource(e.target.id, e.detail?.source || 'Manual');
      summarySignature = null;
    }
  },
  true,
);
get('clientForm').addEventListener('input', renderSources);
get('internalNotes').oninput = () => {
  summarySignature = null;
  queueDraftSave();
};
get('showSaveSummary').checked = localStorage.getItem(summaryPreference) === 'true';
get('showSaveSummary').onchange = () => {
  localStorage.setItem(summaryPreference, String(get('showSaveSummary').checked));
  summarySignature = null;
};
get('stopVoiceBtn').onclick = stopVoice;
function renderVoiceStatus() {
  const key = activeRecognition?.fieldKey;
  get('voiceStatus').hidden = !key;
  get('voiceStatusText').textContent = key
    ? 'Escuchando: ' + (document.querySelector('label[for="' + key + '"]')?.textContent || key)
    : '';
}
const baseStartVoice = startVoice,
  baseStopVoice = stopVoice;
startVoice = function (key, target) {
  baseStartVoice(key, target);
  renderVoiceStatus();
  if (activeRecognition) {
    const rec = activeRecognition,
      end = rec.onend;
    rec.onend = () => {
      end?.();
      renderVoiceStatus();
    };
  }
};
stopVoice = function () {
  baseStopVoice();
  renderVoiceStatus();
};
function makeDialog(id, title) {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'workflow-dialog';
  dialog.setAttribute('aria-label', title);
  dialog.append(textNode('h2', title));
  document.body.append(dialog);
  return dialog;
}
const summaryDialog = makeDialog('saveSummaryDialog', 'Resumen antes de guardar');
async function requestSaveSummary() {
  if (!get('showSaveSummary').checked) return true;
  const signature = JSON.stringify([draft(), captureMetadata(), batch, editingRecord?._id]);
  if (summarySignature === signature) return true;
  if (summaryOpen) return false;
  summaryOpen = true;
  summaryDialog.replaceChildren(textNode('h2', 'Resumen antes de guardar'));
  summaryDialog.append(
    textNode('p', 'Excel: ' + currentExcelLabel(editingRecord?._batch || batch)),
  );
  const table = document.createElement('table');
  table.className = 'summary-table';
  for (const f of fields.filter((f) => !f.disabled)) {
    const row = document.createElement('tr');
    row.append(textNode('th', f.label), textNode('td', get(f.key).value || 'Sin dato'));
    table.append(row);
  }
  summaryDialog.append(
    table,
    textNode('p', 'Notas internas: ' + (get('internalNotes').value || 'Sin notas')),
  );
  const actions = document.createElement('div');
  actions.className = 'workflow-actions';
  const cancel = textNode('button', 'Corregir'),
    confirm = textNode('button', 'Confirmar guardado');
  cancel.type = confirm.type = 'button';
  cancel.className = 'secondary';
  confirm.className = 'primary';
  actions.append(cancel, confirm);
  summaryDialog.append(actions);
  return new Promise((resolve) => {
    const finish = (approved) => {
      summaryOpen = false;
      summaryDialog.close();
      summaryDialog.oncancel = null;
      const unchanged =
        signature === JSON.stringify([draft(), captureMetadata(), batch, editingRecord?._id]);
      if (approved && unchanged) summarySignature = signature;
      else if (approved) showToast('El formulario cambió', 'Revisa de nuevo el resumen.', true);
      resolve(approved && unchanged);
    };
    cancel.onclick = () => finish(false);
    confirm.onclick = () => finish(true);
    summaryDialog.oncancel = (e) => {
      e.preventDefault();
      finish(false);
    };
    summaryDialog.showModal();
  });
}
document.addEventListener(
  'keydown',
  (e) => {
    if (
      get('app').classList.contains('hidden') ||
      document.querySelector('dialog[open]') ||
      e.isComposing
    )
      return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (e.target.closest('#scanReview')) {
        if (!get('applyScanBtn').disabled) get('applyScanBtn').click();
        return;
      }
      if (!get('clientForm').querySelector('.save-btn').disabled)
        get('clientForm').requestSubmit(get('clientForm').querySelector('.save-btn'));
      return;
    }
    if (e.key === 'Enter' && e.target.closest('#fields') && e.target.matches('input,select')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const editable = fields.map((f) => get(f.key)).filter((el) => !el.disabled),
        index = editable.indexOf(e.target),
        next = editable[index + (e.shiftKey ? -1 : 1)];
      (next || get('clientForm').querySelector('.save-btn')).focus();
    }
  },
  true,
);
function currentExcelLabel(id = batch) {
  return historyFiles().find((f) => f.batch === id)?.name || 'METLIFE_' + id;
}
function updateCaptureContext() {
  get('currentExcelName').textContent =
    'Estás guardando en: ' + currentExcelLabel(editingRecord?._batch || batch);
  get('editingStatus').textContent = editingRecord
    ? 'Modificando: ' + (editingRecord.nombre || editingRecord.poliza || 'registro')
    : '';
  const file = historyFiles().find((f) => f.batch === batch);
  const error = archiveErrors.get(batch);
  get('archiveSyncStatus').textContent = error
    ? 'Excel pendiente de actualizar: ' + error
    : archiveJobs.has(batch) || archiveTimers.has(batch)
      ? 'Actualizando Excel…'
      : file
        ? 'Excel del historial actualizado automáticamente'
        : 'Guarda este Excel en el historial para conservar y actualizar su copia automáticamente.';
  get('retryArchiveBtn').hidden = !error;
}
async function workbookFor(list) {
  return metlifeOperations.measure('Generar Excel', () =>
    window.metlifeExcel.generate(
      fields.map((f) => f.label),
      MetlifeArchiveCore.rowsFor(list),
    ),
  );
}
function archiveSnapshot(list) {
  return list.map((r) =>
    Object.fromEntries(['_id', ...fields.map((f) => f.key)].map((k) => [k, r[k] || ''])),
  );
}
async function refreshArchive(id) {
  if (archiveJobs.has(id)) return archiveJobs.get(id);
  const job = (async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const file = historyFiles().find((f) => f.batch === id);
        if (!file) {
          archiveErrors.delete(id);
          return;
        }
        const list = await cloud.fetchBatch(id);
        if (sameArchive(file, list) && file._hasContent) {
          archiveErrors.delete(id);
          return;
        }
        const updated = {
          ...file,
          _fingerprint: MetlifeArchiveCore.fingerprint(list),
          snapshot: archiveSnapshot(list),
          recordCount: list.length,
          xlsxBase64: await workbookFor(list),
          updated: new Date().toISOString(),
        };
        if (await cloud.refreshHistory(updated, file.updated)) {
          const latest = await cloud.fetchBatch(id);
          if (sameArchive(updated, latest)) {
            archiveErrors.delete(id);
            return;
          }
        }
      }
      throw Error('Hay cambios simultáneos. Vuelve a actualizar.');
    } catch (error) {
      archiveErrors.set(id, error.message);
    } finally {
      archiveJobs.delete(id);
      updateCaptureContext();
    }
  })();
  archiveJobs.set(id, job);
  updateCaptureContext();
  await job;
  archiveJobs.delete(id);
  updateCaptureContext();
}
function scheduleArchive(id) {
  if (!id || !historyFiles().some((f) => f.batch === id) || !cloud.state.ready) return;
  clearTimeout(archiveTimers.get(id));
  archiveTimers.set(
    id,
    setTimeout(() => {
      archiveTimers.delete(id);
      refreshArchive(id);
    }, 250),
  );
  updateCaptureContext();
}
get('retryArchiveBtn').onclick = () => refreshArchive(batch);
function captureWritePending() {
  return [
    ...get('clientForm').querySelectorAll('button[type="submit"]'),
    get('pendingConfirm'),
    get('saveHistoryBtn'),
    get('archiveRecordsBtn'),
  ].some((b) => b?.disabled);
}
function unfinishedWrites() {
  return (
    window.metlifeExcel.busy ||
    draftDirty ||
    writingDraft ||
    archiveJobs.size > 0 ||
    archiveTimers.size > 0 ||
    archiveErrors.size > 0 ||
    captureWritePending()
  );
}
async function settleBeforeLeaving() {
  if (window.metlifeExcel.busy)
    throw Error('Espera a que termine el Excel o cancela su generacion.');
  if (captureWritePending())
    throw Error('Espera a que termine de guardarse el registro o archivo.');
  if (writingDraft) throw Error('El borrador se está guardando. Espera un momento.');
  if (draftDirty && !(await saveDraft()))
    throw Error('Hay cambios pendientes del borrador. Revisa la conexión antes de salir.');
  for (const [id, timer] of archiveTimers) {
    clearTimeout(timer);
    archiveTimers.delete(id);
    await refreshArchive(id);
  }
  await Promise.all([...archiveJobs.values()]);
  if (archiveErrors.size)
    throw Error(
      'Hay una copia Excel pendiente de actualizar. Pulsa Reintentar actualización antes de salir.',
    );
}
const baseChangeBatch = changeBatch;
changeBatch = async function (id, reset = false) {
  if (
    (reset || id !== batch) &&
    Object.values(draft()).some(Boolean) &&
    !confirm(
      'Tienes una captura en el formulario. ¿Cambiar de archivo? Guarda como pendiente si quieres conservarla por separado.',
    )
  )
    throw Error('Cambio de archivo cancelado.');
  await settleBeforeLeaving();
  await baseChangeBatch(id, reset);
  forgetUndo();
  updateCaptureContext();
};
get('logoutBtn').onclick = async () => {
  try {
    await settleBeforeLeaving();
    stopVoice();
    clearTimeout(window.draftTimer);
    await firebaseAuth.signOut();
    cloud.stop();
    location.reload();
  } catch (error) {
    showToast('No se cerró la sesión', error.message, true);
  }
};
window.addEventListener('beforeunload', (e) => {
  if (unfinishedWrites()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
window.addEventListener('metlife:cloud-change', (e) => {
  const { type, value } = e.detail;
  if (type === 'archive-dirty') scheduleArchive(value);
  if (['records', 'ready'].includes(type) && !cloud.state.recordsHasMore) {
    const file = historyFiles().find((f) => f.batch === batch);
    if (file && (!file._hasContent || !sameArchive(file, visibleRecords()))) scheduleArchive(batch);
  }
  if (['ready', 'status'].includes(type) && cloud.state.ready && cloud.state.connected)
    for (const id of archiveErrors.keys()) scheduleArchive(id);
  if (['history', 'workspace', 'ready'].includes(type)) {
    updateCaptureContext();
    if (type === 'history' && cloud.state.ready && !cloud.state.recordsLoading) {
      const f = historyFiles().find((f) => f.batch === batch);
      if (f && !cloud.state.recordsHasMore && !sameArchive(f, visibleRecords()))
        scheduleArchive(batch);
    }
  }
});

const filters = document.createElement('details');
filters.className = 'record-filters';
filters.innerHTML =
  '<summary>Filtros de registros</summary><div class="filter-grid"><label>Desde<input id="filterFrom" type="date"></label><label>Hasta<input id="filterTo" type="date"></label><label>Vendedor<input id="filterSeller" placeholder="Nombre de VENDIDA"></label><label>Negocio<select id="filterBusiness"><option value="">Todos</option><option>NUEVA</option><option>INCREMENTO</option><option>INCLUSION</option></select></label><label>Comunidad<input id="filterCommunity"></label><label>Revisión<select id="filterReview"><option value="all">Todos</option><option value="review">Por revisar</option><option value="complete">Sin avisos</option></select></label><button id="clearRecordFilters" type="button" class="secondary">Limpiar filtros</button></div>';
document.querySelector('.records-toolbar').before(filters);
const totals = textNode('p', '');
totals.id = 'recordTotals';
totals.className = 'capture-context';
filters.after(totals);
const baseFilteredRecords = filteredRecords;
function reviewIssues(item) {
  return MetlifeFormCore.issues(item, fields);
}
filteredRecords = function () {
  const normalize = (value) =>
    MetlifeFormCore.normalize(value, 'nombre')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  return baseFilteredRecords().filter((r) => {
    const parts = String(r.fecha || '').split('/'),
      date = parts.length === 3 ? parts.reverse().join('-') : '';
    const review = get('filterReview').value;
    return (
      (!get('filterFrom').value || (date && date >= get('filterFrom').value)) &&
      (!get('filterTo').value || (date && date <= get('filterTo').value)) &&
      normalize(r.vendida || '').includes(normalize(get('filterSeller').value)) &&
      normalize(r.comunidad || '').includes(normalize(get('filterCommunity').value)) &&
      (!get('filterBusiness').value || r.negocio === get('filterBusiness').value) &&
      (review === 'all' ||
        (review === 'review' ? reviewIssues(r).length > 0 : !reviewIssues(r).length))
    );
  });
};
for (const input of filters.querySelectorAll('input,select'))
  input.addEventListener('input', () => {
    recordsPageSize = 50;
    renderRecords();
  });
get('clearRecordFilters').onclick = () => {
  for (const input of filters.querySelectorAll('input,select'))
    input.value = input.id === 'filterReview' ? 'all' : '';
  renderRecords();
};
metlifeUI.afterRecords.add(() => {
  const list = filteredRecords(),
    sum = list.reduce((total, r) => {
      const value = String(r.prima || '').replace(/,/g, '');
      return total + (/^\d+(\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : 0);
    }, 0);
  get('recordTotals').textContent =
    list.length +
    ' registros encontrados · Total de primas: ' +
    (sum / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  updateCaptureContext();
});
const versionsDialog = makeDialog('versionsDialog', 'Historial de cambios');
async function openVersions(id) {
  versionsDialog.replaceChildren(
    textNode('h2', 'Historial de cambios'),
    textNode('p', 'Cargando…'),
  );
  versionsDialog.showModal();
  try {
    const item = await cloud.fetchRecord(id, true);
    if (!item || item._deletedAt) throw Error('El registro ya no está disponible.');
    versionsDialog.replaceChildren(
      textNode('h2', 'Historial: ' + (item.nombre || item.poliza || 'registro')),
    );
    const close = textNode('button', 'Cerrar');
    close.className = 'secondary';
    close.onclick = () => versionsDialog.close();
    versionsDialog.append(close);
    const versions = Object.entries(item._versions || {})
      .reverse()
      .sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)));
    if (!versions.length)
      versionsDialog.append(textNode('p', 'Este registro todavía no tiene cambios registrados.'));
    for (let index = 0; index < versions.length; index++) {
      const [key, version] = versions[index],
        previous = versions[index + 1]?.[1].data || {};
      const detail = document.createElement('details');
      detail.append(
        textNode(
          'summary',
          version.action +
            ' · ' +
            (version.at ? new Date(version.at).toLocaleString('es-MX') : 'Sin fecha') +
            ' · ' +
            version.actor,
        ),
      );
      const table = document.createElement('table');
      table.className = 'summary-table';
      for (const field of [...fields, { key: '_notes', label: 'NOTAS INTERNAS' }]) {
        const before = previous[field.key] || '',
          after = version.data[field.key] || '';
        if (before !== after) {
          const row = document.createElement('tr');
          row.append(
            textNode('th', field.label),
            textNode('td', before || 'Sin dato'),
            textNode('td', after || 'Sin dato'),
          );
          table.append(row);
        }
      }
      detail.append(textNode('p', 'Dato · Valor anterior · Valor de esta versión'), table);
      const restore = textNode('button', 'Recuperar esta versión');
      restore.className = 'secondary';
      restore.type = 'button';
      restore.onclick = async () => {
        if (
          !confirm('¿Restaurar esta versión? El cambio actual quedará conservado en el historial.')
        )
          return;
        restore.disabled = true;
        try {
          await cloud.restoreVersion(id, key, cloud.recordRevision(item));
          versionsDialog.close();
          showToast('Versión recuperada', 'El historial conserva también este cambio.');
        } catch (error) {
          showToast('No se recuperó la versión', error.message, true);
        } finally {
          restore.disabled = false;
        }
      };
      detail.append(restore);
      versionsDialog.append(detail);
    }
  } catch (error) {
    versionsDialog.replaceChildren(textNode('p', error.message));
    const close = textNode('button', 'Cerrar');
    close.onclick = () => versionsDialog.close();
    versionsDialog.append(close);
  }
}
get('recordsBody').addEventListener('click', (e) => {
  const version = e.target.closest('.record-versions');
  if (version) openVersions(version.dataset.id);
  const copy = e.target.closest('.record-copy-client');
  if (!copy) return;
  const item = records().find((r) => r._id === copy.dataset.id);
  if (!item) return;
  if (
    Object.values(draft()).some(Boolean) &&
    !confirm('¿Reemplazar la captura para crear una nueva póliza de este cliente?')
  )
    return;
  rememberUndo('Cliente copiado para una nueva póliza');
  clearForm();
  for (const key of ['nombre', 'rfc', 'curp', 'telefono', 'correo', 'trabajo', 'comunidad'])
    setField(key, item[key] || '', false, 'Cliente copiado');
  queueDraftSave();
  checkDuplicate();
  get('poliza').focus();
  updateCaptureContext();
  showToast('Nueva póliza', 'Completa póliza, importes y los demás datos del nuevo registro.');
});
const oldParseClick = get('parseBtn').onclick;
get('parseBtn').onclick = () => {
  rememberUndo('Datos importados');
  const before = draft();
  oldParseClick();
  for (const f of fields) if (before[f.key] !== get(f.key).value) markSource(f.key, 'Importado');
  queueDraftSave();
};
loadMetadata(cloud.state.workspace.metadata || {});
renderRecords();
updateCaptureContext();
