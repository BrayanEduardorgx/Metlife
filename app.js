const STORAGE = {
  records: 'metlife_records_v1',
  draft: 'metlife_draft_v1',
  session: 'metlife_session_v1',
  batch: 'metlife_batch_v1',
  credentials: 'metlife_credentials_v1',
  theme: 'metlife_theme_v1',
  history: 'metlife_excel_history_v1',
};
const firebaseApp = window.firebase?.apps?.length
  ? window.firebase.app()
  : window.firebase?.initializeApp(window.METLIFE_FIREBASE_CONFIG);
const firebaseAuth = firebaseApp?.auth();
const firebaseDb = firebaseApp?.database();
if (window.METLIFE_ENV === 'development') {
  firebaseAuth?.useEmulator?.('http://127.0.0.1:9099', { disableWarnings: true });
  firebaseDb?.useEmulator?.('127.0.0.1', 9000);
}
const fields = MetlifeFields.fields,
  labels = MetlifeFields.labels;
const $ = (s) => document.querySelector(s);
let fieldUndo = {};

const selectedRecords = metlifeState.selection;

const cloud = window.createMetlifeCloud({
  db: firebaseDb,
  storage: localStorage,
  getUser: () => firebaseAuth?.currentUser,
  getRole: () => metlifeState.role,
  emit: handleCloudEvent,
});
window.metlifeCloud = cloud;
metlifeState.cloud = cloud.state;
const cloudRenderQueue = new Set();
let cloudRenderFrame;
function scheduleCloudRender(type) {
  cloudRenderQueue.add(type);
  if (cloudRenderFrame) return;
  cloudRenderFrame = requestAnimationFrame(() => {
    cloudRenderFrame = null;
    const queued = new Set(cloudRenderQueue);
    cloudRenderQueue.clear();
    if (queued.has('records')) {
      renderRecords();
      checkDuplicate();
    }
    if (queued.has('history')) renderHistory();
  });
}
function handleCloudEvent(type, value) {
  window.dispatchEvent(new CustomEvent('metlife:cloud-change', { detail: { type, value } }));
  if (type === 'records') {
    scheduleCloudRender('records');
  }
  if (type === 'history') scheduleCloudRender('history');
  if (type === 'zones') window.dispatchEvent(new CustomEvent('metlife:zones', { detail: value }));
  if (type === 'workspace') {
    if (value.revision === draftBaseRevision) return;
    renderRecoveredDrafts(value.recoveredDrafts || {});
    if (value.source === cloud.session && cloud.state.ready) return;
    if (draftDirty) {
      pendingWorkspace = value;
      $('#cloudConflict').classList.remove('hidden');
    } else applySharedWorkspace(value);
  }
  if (type === 'status' || type === 'ready') {
    $('#cloudStatus').textContent = cloud.state.connected
      ? cloud.state.ready
        ? 'Conectado a la nube'
        : 'Cargando datos de la nube…'
      : 'Sin conexión';
    $('.sync-pill').classList.toggle('offline', !cloud.state.connected);
    renderHistory();
    if (
      type === 'status' &&
      cloud.state.ready &&
      cloud.state.connected &&
      draftDirty &&
      !pendingWorkspace &&
      !writingDraft
    )
      saveDraft();
  }
  if (type === 'error')
    showToast('No se pudo sincronizar', 'Revisa tu conexión e inténtalo de nuevo.', true);
}
function applySharedWorkspace(value) {
  stopVoice();
  editingRecord = value.editingRecord || null;
  reviewSignature = null;
  $('#saveReview').hidden = true;
  clearTimeout(window.draftTimer);
  batch = value.batch || batch;
  activePendingId = value.pendingId || null;
  activePendingRevision = value.pendingRevision || null;
  recordsPageSize = 50;
  fields.forEach((f) => setField(f.key, value.draft?.[f.key] || '', false));
  fieldUndo = {};
  draftDirty = false;
  draftBaseRevision = value.revision;
  pendingWorkspace = null;
  $('#cloudConflict').classList.add('hidden');
  $('#draftStatus').textContent = Object.values(value.draft || {}).some(Boolean)
    ? 'En la nube'
    : 'Sin cambios';
  $('#historyName').value = historyFiles().find((f) => f.batch === batch)?.name || '';
  renderRecords();
  checkDuplicate();
  window.dispatchEvent(new Event('metlife:form-reset'));
}
function markDraftDirty() {
  if (!draftDirty) draftBaseRevision = cloud.state.workspace.revision;
  draftDirty = true;
  draftVersion++;
}
function queueDraftSave() {
  markDraftDirty();
  $('#draftStatus').textContent = 'Guardando en nube…';
  clearTimeout(window.draftTimer);
  window.draftTimer = setTimeout(saveDraft, 500);
}

function records() {
  return [
    ...new Map(
      [
        ...(window.metlifeSelectedClient ? [window.metlifeSelectedClient] : []),
        ...(cloud.state.recent || []),
        ...cloud.state.records,
      ].map((r) => [r._id, r]),
    ).values(),
  ];
}
async function shareRecord(item) {
  return cloud.saveRecord(item);
}
async function subscribeFirebase() {
  await metlifeAccess.load(firebaseAuth.currentUser);
  return cloud.start(firebaseAuth.currentUser.uid);
}
function visibleRecords() {
  return cloud.state.records.filter((r) => r._batch === batch);
}
function tableRecords() {
  return $('#recordScope')?.value === 'cloud' ? cloud.state.recent || [] : visibleRecords();
}
function historyFiles() {
  return cloud.state.history;
}
function sameArchive(file, list) {
  if (file._fingerprint) return file._fingerprint === MetlifeArchiveCore.fingerprint(list);
  return file.snapshot
    ? JSON.stringify(file.snapshot.map((r) => [r._id, ...fields.map((f) => r[f.key] || '')])) ===
        JSON.stringify(list.map((r) => [r._id, ...fields.map((f) => r[f.key] || '')]))
    : file.recordCount === list.length &&
        list.every((r) => String(r._updated || r._saved || '') <= String(file.updated || ''));
}
function archivedCurrent() {
  return historyFiles().find(
    (f) =>
      f.batch === batch &&
      (cloud.state.recordsHasMore
        ? f._hasContent && !archiveErrors.has(batch)
        : sameArchive(f, visibleRecords())),
  );
}
function clipboardRows(list) {
  return list.map((r) =>
    fields.map((f) =>
      String(f.key === 'estatus' ? '' : (r[f.key] ?? '')).replace(/[\t\r\n]+/g, ' '),
    ),
  );
}
async function copySelectedRecords() {
  updateRecordSelection();
  const list = tableRecords()
    .filter((r) => selectedRecords.has(recordSelectionKey(r)))
    .sort((a, b) => String(a._saved || '').localeCompare(String(b._saved || '')));
  if (!list.length)
    return showToast(
      'Selecciona registros',
      'Marca las palomitas de los registros que quieres copiar.',
    );
  const rows = clipboardRows(list);
  const text = rows
    .map((row) =>
      row
        .map((value) => (value.includes('"') ? '"' + value.replace(/"/g, '""') + '"' : value))
        .join('\t'),
    )
    .join('\r\n');
  // Rich clipboard preserves text and leading zeroes when pasted into Excel.
  const html =
    '<html><body><table>' +
    rows
      .map(
        (row) =>
          '<tr>' +
          row
            .map((value) => '<td style="mso-number-format:\'\\@\'">' + escapeHtml(value) + '</td>')
            .join('') +
          '</tr>',
      )
      .join('') +
    '</table></body></html>';
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
      } catch {
        await navigator.clipboard.writeText(text);
      }
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(area);
      const previous = document.activeElement;
      try {
        area.select();
        if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
      } finally {
        area.remove();
        previous?.focus();
      }
    }
    try {
      const marked = await cloud.markCopied(list);
      showToast(
        'Registros copiados',
        list.length +
          ' filas listas para pegar desde la columna A. ' +
          marked +
          ' marcadas como copiadas.',
      );
    } catch (error) {
      showToast(
        'Datos copiados; marca pendiente',
        'El portapapeles sí contiene los datos, pero no se pudo guardar la marca en la nube. ' +
          error.message,
        true,
      );
    }
  } catch {
    showToast(
      'No se pudo copiar',
      'Permite el acceso al portapapeles y vuelve a pulsar Copiar seleccionados.',
      true,
    );
  }
}
function showToast(title, detail, warning = false) {
  $('#toast strong').textContent = title;
  $('#toast small').textContent = detail;
  $('#toast').classList.toggle('warning', warning);
  $('#toast').classList.add('show');
  setTimeout(() => $('#toast').classList.remove('show'), 3300);
}
function duplicateMatch(item) {
  const checks = [
    ['poliza', 'póliza'],
    ['rfc', 'RFC'],
    ['curp', 'CURP'],
  ];
  for (const [key, label] of checks) {
    const value = normalizeText(item[key] || '', key);
    if (value && records().some((r) => normalizeText(r[key] || '', key) === value))
      return { record: records().find((r) => normalizeText(r[key] || '', key) === value), label };
  }
  return null;
}
function checkDuplicate() {
  const warning = $('#duplicateWarning');
  if (!warning) return null;
  const match = duplicateMatch(draft());
  warning.classList.toggle('show', !!match);
  warning.textContent = match
    ? `⚠ Posible cliente repetido: la ${match.label} ya pertenece a ${match.record.nombre || 'un cliente registrado'}. Revisa los datos antes de guardar.`
    : '';
  window.metlifeWorkflow?.validate();
  window.metlifeWorkflow?.scheduleDuplicates();
  return match;
}
async function changeBatch(nextBatch, reset = false) {
  if (draftDirty && !(await saveDraft()))
    throw Error('Primero resuelve o guarda el borrador pendiente.');
  const saved = await cloud.saveWorkspace(
    {
      batch: nextBatch,
      draft: reset ? {} : draft(),
      metadata: reset ? {} : captureMetadata(),
      editingRecord: reset ? null : editingRecord,
      pendingId: reset ? null : activePendingId,
      pendingRevision: reset ? null : activePendingRevision,
    },
    cloud.state.workspace.revision,
  );
  await cloud.setBatch(nextBatch);
  applySharedWorkspace(saved);
}
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark', dark);
  $('.theme-icon').textContent = dark ? '☀' : '☾';
  $('.theme-label').textContent = dark ? 'Modo claro' : 'Modo oscuro';
  $('#themeToggle').setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
  document.querySelector('meta[name="theme-color"]').content = dark ? '#071d26' : '#008f8c';
}
function openApp(user) {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userName').textContent = user.toUpperCase();
}

applyTheme(localStorage.getItem(STORAGE.theme) || 'light');
renderFields();
loadDraft();
renderRecords();
const remembered = JSON.parse(localStorage.getItem(STORAGE.credentials) || 'null');
if (remembered) {
  $('#loginUser').value = remembered.user || '';
  $('#rememberLogin').checked = true;
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = $('#loginUser').value.trim().toLowerCase();
  const password = $('#loginPassword').value;
  $('#loginError').textContent = '';
  try {
    await firebaseAuth.setPersistence(
      $('#rememberLogin').checked
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION,
    );
    await firebaseAuth.signInWithEmailAndPassword(user, password);
    if ($('#rememberLogin').checked)
      localStorage.setItem(STORAGE.credentials, JSON.stringify({ user }));
    else localStorage.removeItem(STORAGE.credentials);
  } catch {
    $('#loginError').textContent = 'Correo o contraseña incorrectos.';
    $('#loginPassword').focus();
  }
});
firebaseAuth?.onAuthStateChanged(async (user) => {
  if (user) {
    $('#loginError').textContent = 'Cargando tu espacio desde la nube…';
    try {
      await subscribeFirebase();
      if (firebaseAuth.currentUser?.uid === user.uid) {
        openApp(user.email);
        $('#loginError').textContent = '';
      }
    } catch {
      $('#loginError').textContent =
        'No se pudieron cargar los datos de la nube. Revisa internet y vuelve a entrar.';
    }
  } else {
    cloud.stop();
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
  }
});
$('#passwordToggle').onclick = () => {
  const input = $('#loginPassword');
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  $('#passwordToggle').classList.toggle('password-visible', !visible);
  $('#passwordToggle').title = visible ? 'Mostrar contraseña' : 'Ocultar contraseña';
  $('#passwordToggle').setAttribute('aria-label', $('#passwordToggle').title);
};
$('#themeToggle').onclick = () => {
  const theme = document.body.classList.contains('dark') ? 'light' : 'dark';
  localStorage.setItem(STORAGE.theme, theme);
  applyTheme(theme);
};
$('#logoutBtn').onclick = async () => {
  if (
    draftDirty &&
    !(await saveDraft()) &&
    !confirm('Hay cambios que no llegaron a la nube. ¿Cerrar sesión y descartar esos cambios?')
  )
    return;
  draftDirty = false;
  clearTimeout(window.draftTimer);
  cloud.stop();
  await firebaseAuth?.signOut();
  location.reload();
};
$('#clientForm').addEventListener('input', (e) => {
  const f = fields.find((x) => x.key === e.target.name);
  if (!f) return;
  fieldUndo[f.key] = e.target.value;
  if (!e.isComposing && (f.type || !f.options)) normalizeInput(e.target, f);
  reviewSignature = null;
  $('#saveReview').hidden = true;
  checkDuplicate();
  queueDraftSave();
});
$('#clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const buttons = [...$('#clientForm').querySelectorAll('button[type="submit"]')];
  if (buttons.some((b) => b.disabled)) return;
  if (pendingWorkspace)
    return showToast('Revisa el borrador', 'Resuelve primero el cambio de otro dispositivo.', true);
  if (summaryOpen) return;
  if (!(await requestSaveSummary())) return;
  if (!confirmReview()) return;
  const submittedVersion = draftVersion,
    item = draft(),
    pendingId = activePendingId,
    pendingRevision = activePendingRevision,
    next = e.submitter?.id === 'saveNextBtn';
  Object.assign(item, captureMetadata());
  item.estatus = '';
  item._batch = batch;
  item._saved = new Date().toISOString();
  item._id = 'record_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  buttons.forEach((b) => (b.disabled = true));
  try {
    const matches = editingRecord ? [] : await cloud.findDuplicates(item);
    let choice = editingRecord ? { action: 'update', record: editingRecord } : { action: 'create' };
    if (matches.length) choice = await window.metlifeWorkflow.chooseDuplicate(matches, item);
    if (!choice) return;
    const savedRecord =
      choice.action === 'update'
        ? await cloud.updateRecord(
            { ...item, _id: choice.record._id },
            cloud.recordRevision(choice.record),
          )
        : await shareRecord(item);
    let pendingWarning = '';
    if (pendingId) {
      try {
        await cloud.removePending(pendingId, pendingRevision);
      } catch (error) {
        pendingWarning = error.message;
      }
    }
    const unchanged = draftVersion === submittedVersion;
    if (unchanged) {
      clearForm();
      forgetUndo();
    }
    checkDuplicate();
    renderRecords();
    showToast(
      choice.action === 'update'
        ? 'Registro actualizado en la nube'
        : 'Registro guardado en la nube',
      pendingWarning || 'Disponible desde los otros dispositivos con acceso.',
      !!pendingWarning,
    );
    if (choice.action === 'update') {
      try {
        await notifyClientUpdate(savedRecord);
      } catch (error) {
        showToast(
          'Registro actualizado en la nube',
          'No se pudo actualizar el aviso del archivo: ' + error.message,
          true,
        );
      }
    }
    if (next && unchanged) window.dispatchEvent(new Event('metlife:scan-next'));
  } catch (error) {
    showToast('El registro no se guardó', error.message, true);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
});
$('#fields').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.classList.contains('voice')) startVoice(b.dataset.key);
  if (b.classList.contains('clear-field')) {
    clearTimeout(window.draftTimer);
    setField(b.dataset.key, '', false);
    delete fieldUndo[b.dataset.key];
    saveDraft();
    checkDuplicate();
    $('#' + b.dataset.key).focus();
  }
});
$('#parseBtn').onclick = parseImport;
$('#clearBtn').onclick = clearForm;
$('#downloadBtn').onclick = exportExcel;
$('#searchInput').oninput = renderRecords;
$('#copyRecordsBtn').onclick = copySelectedRecords;
$('#selectAllRecords').onchange = (e) => {
  filteredRecords().forEach((r) => {
    const key = recordSelectionKey(r);
    if (e.target.checked) selectedRecords.add(key);
    else selectedRecords.delete(key);
  });
  renderRecords();
};
$('#recordsBody').addEventListener('change', (e) => {
  if (!e.target.matches('.record-select')) return;
  const key = decodeURIComponent(e.target.dataset.recordKey);
  if (e.target.checked) selectedRecords.add(key);
  else selectedRecords.delete(key);
  e.target.closest('tr').classList.toggle('selected', e.target.checked);
  updateRecordSelection();
});
$('#saveHistoryBtn').onclick = saveCurrentToHistory;
$('#archiveRecordsBtn').onclick = async () => {
  const name = prompt(
    'Nombre para guardar este Excel en el historial:',
    $('#historyName').value || `METLIFE_${batch}`,
  );
  if (name === null || !name.trim()) return;
  $('#historyName').value = name.trim();
  $('#archiveRecordsBtn').disabled = true;
  try {
    await saveCurrentToHistory();
  } finally {
    $('#archiveRecordsBtn').disabled = false;
  }
};
$('#historyName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveCurrentToHistory();
  }
});
$('#historyList').addEventListener('click', async (e) => {
  const button = e.target.closest('.history-action');
  if (!button || button.disabled) return;
  const batchId = button.closest('.history-item').dataset.batch,
    file = historyFiles().find((f) => f.batch === batchId);
  if (!file) return;
  button.disabled = true;
  try {
    if (button.classList.contains('view')) {
      await changeBatch(batchId);
      $('.records-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('Archivo abierto', file.name);
    }
    if (button.classList.contains('download')) await exportExcel(batchId);
    if (button.classList.contains('rename')) {
      await changeBatch(batchId);
      $('.records-card').scrollIntoView({ behavior: 'smooth' });
      const name = prompt('Nuevo nombre para el archivo:', file.name);
      if (name === null) return;
      const clean = name.trim().toLocaleUpperCase('es-MX');
      if (!clean) return;
      await cloud.saveHistory({ ...file, name: clean, updated: new Date().toISOString() });
      showToast('Nombre actualizado', clean);
    }
    if (button.classList.contains('delete')) {
      if (
        !confirm(
          '¿Eliminar el Excel "' +
            file.name +
            '" del historial? Sus clientes se conservarán en la nube y seguirán disponibles al buscar por póliza o nombre.',
        )
      )
        return;
      await cloud.deleteHistory(file);
      if (batch === batchId)
        await changeBatch(new Date().toISOString().slice(0, 10) + '_' + Date.now(), true);
      showToast(
        'Excel eliminado; clientes conservados',
        'Puedes buscarlos en la nube y agregarlos a otro Excel cuando quieras.',
      );
    }
  } catch (error) {
    showToast('No se completó la acción', error.message, true);
  } finally {
    button.disabled = false;
  }
});
$('#newExcelBtn').onclick = async () => {
  if (visibleRecords().length && !archivedCurrent())
    return showToast(
      'Guarda primero en el historial',
      'Conserva este archivo antes de crear otro.',
    );
  if (
    visibleRecords().length &&
    !confirm('¿Comenzar un archivo nuevo? El actual está guardado en el historial.')
  )
    return;
  try {
    if (cloud.state.recordsHasMore) {
      const file = historyFiles().find((f) => f.batch === batch);
      const all = await cloud.fetchBatch(batch);
      if (all.length && (!file || !sameArchive(file, all)))
        throw Error('Actualiza el Excel actual en el historial antes de crear uno nuevo.');
    }
    await changeBatch(new Date().toISOString().slice(0, 10) + '_' + Date.now(), true);
    showToast(
      'Nuevo Excel listo',
      'También estará disponible al entrar con tu cuenta desde otro dispositivo.',
    );
  } catch (error) {
    showToast('No se pudo cambiar de archivo', error.message, true);
  }
};
$('#loadCloudDraft').onclick = () =>
  applySharedWorkspace(pendingWorkspace || cloud.state.workspace);
$('#keepOwnDraft').onclick = () => saveDraft(true);
$('#recoveredDraftSelect').oninput = () => {
  $('#restoreRecoveredDraft').disabled = !recoveredDraftEntry();
};
$('#restoreRecoveredDraft').onclick = () => {
  const entry = recoveredDraftEntry();
  if (!entry) return;
  if (
    fields.some((f) => $('#' + f.key).value) &&
    !confirm('¿Reemplazar el formulario por este borrador recuperado?')
  )
    return;
  applySharedWorkspace({
    ...cloud.state.workspace,
    batch: entry.batch,
    draft: entry.draft,
    editingRecord: null,
  });
  $('#recoveredDraftSelect').value = '';
  $('#restoreRecoveredDraft').disabled = true;
  queueDraftSave();
};
window.addEventListener('beforeunload', (event) => {
  if (draftDirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
$('#toggleImport').onclick = () => {
  const body = $('#importBody');
  const hidden = body.style.display === 'none';
  body.style.display = hidden ? 'block' : 'none';
  $('#toggleImport').textContent = hidden ? 'Ocultar' : 'Mostrar';
};

function setSidebarOpen(open) {
  $('#sidebarPanel').classList.toggle('hidden', !open);
  $('#sidebarBackdrop').classList.toggle('hidden', !open);
  $('#sidebarToggle').setAttribute('aria-expanded', String(open));
  const label = open ? 'Ocultar men\u00fa lateral' : 'Mostrar men\u00fa lateral';
  $('#sidebarToggle').setAttribute('aria-label', label);
  $('#sidebarToggle').title = label;
  if (open) $('#sidebarClose').focus();
  else $('#sidebarToggle').focus();
}
$('#sidebarToggle').onclick = () => setSidebarOpen($('#sidebarPanel').classList.contains('hidden'));
$('#sidebarClose').onclick = () => setSidebarOpen(false);
$('#sidebarBackdrop').onclick = () => setSidebarOpen(false);
$('#sidebarArchivador').onclick = () => setSidebarOpen(false);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sidebarPanel').classList.contains('hidden')) setSidebarOpen(false);
});
