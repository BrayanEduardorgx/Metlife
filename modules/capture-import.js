function formatDate(v) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/');
}
function setField(key, value, remember = true) {
  const el = $(`#${key}`);
  if (!el) return;
  if (remember) fieldUndo[key] = el.value;
  const f = fields.find((x) => x.key === key);
  const v = formatFieldValue(value, f || { key });
  if (el.value !== v) el.value = v;
  updateSuggestions();
}
function formatFieldValue(value, f) {
  let v = MetlifeFormCore.normalize(value, f.key);
  if (f?.type === 'dateText') v = formatDate(v);
  if (f?.type === 'tel') v = v.replace(/\D/g, '');
  if (f?.type === 'money') v = formatMoney(v);
  if (f?.type === 'decimal') v = v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  return v;
}
function formatMoney(v) {
  const clean = String(v).replace(/[^\d.]/g, '');
  if (!clean) return '';
  const [a, b] = clean.split('.');
  return Number(a).toLocaleString('en-US') + (b !== undefined ? '.' + b.slice(0, 2) : '');
}
function draft() {
  const d = {};
  fields.forEach((f) => (d[f.key] = $(`#${f.key}`)?.value || ''));
  return d;
}
async function saveDraft(force = false) {
  clearTimeout(window.draftTimer);
  if (writingDraft) {
    markDraftDirty();
    return false;
  }
  if (!draftDirty) markDraftDirty();
  if (pendingWorkspace && !force) {
    $('#draftStatus').textContent = 'Revisa el borrador';
    return false;
  }
  const version = draftVersion;
  writingDraft = true;
  $('#draftStatus').textContent = 'Guardando en nube…';
  try {
    const saved = await cloud.saveWorkspace(
      {
        batch,
        draft: draft(),
        metadata: typeof captureMetadata === 'function' ? captureMetadata() : {},
        editingRecord,
        pendingId: activePendingId,
        pendingRevision: activePendingRevision,
      },
      force ? undefined : draftBaseRevision,
    );
    draftBaseRevision = saved.revision;
    if (version === draftVersion) {
      draftDirty = false;
      pendingWorkspace = null;
      $('#cloudConflict').classList.add('hidden');
      $('#draftStatus').textContent = 'En la nube';
    } else window.draftTimer = setTimeout(saveDraft, 0);
    return true;
  } catch (error) {
    if (error.code === 'draft-conflict') {
      pendingWorkspace = cloud.state.workspace;
      $('#cloudConflict').classList.remove('hidden');
      $('#draftStatus').textContent = 'Revisa el borrador';
    } else $('#draftStatus').textContent = 'Pendiente de nube';
    return false;
  } finally {
    writingDraft = false;
  }
}
function loadDraft() {
  if (cloud.state.ready) applySharedWorkspace(cloud.state.workspace);
}
function clearForm() {
  stopVoice();
  editingRecord = null;
  reviewSignature = null;
  $('#saveReview').hidden = true;
  activePendingId = null;
  activePendingRevision = null;
  clearTimeout(window.draftTimer);
  window.dispatchEvent(new Event('metlife:form-reset'));
  $('#clientForm').reset();
  fieldUndo = {};
  queueDraftSave();
}
function parsePositionalImport(text) {
  let values = [];
  if (text.includes('\t')) values = text.split(/\t|\r?\n/);
  else if (text.includes('\n')) values = text.split(/\r?\n/);
  else if (text.includes('|')) values = text.split('|');
  else if (text.includes(';')) values = text.split(';');
  values = values.map((v) => v.trim());
  while (values.length && !values[0]) values.shift();
  while (values.length && !values.at(-1)) values.pop();
  const editable = fields.filter((f) => f.key !== 'estatus');
  const target = values.length === fields.length ? fields : editable;
  if (values.length !== target.length) return 0;
  target.forEach((field, index) => {
    if (field.key !== 'estatus') setField(field.key, values[index]);
  });
  return target.filter((f) => f.key !== 'estatus').length;
}
function parseImport() {
  const text = $('#importText').value.trim();
  if (!text) return showToast('Falta el texto', 'Pega primero los datos del cliente.');
  const keys = Object.keys(labels).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `(?:^|[,\\n])\\s*(${keys.join('|')})[ \\t]*:[ \\t]*(.*?)(?=\\s*(?:,|\\n)\\s*(?:${keys.join('|')})\\s*:|$)`,
    'giu',
  );
  let match,
    count = 0;
  while ((match = pattern.exec(text)) !== null) {
    const label = match[1].toLocaleUpperCase('es-MX');
    const key = labels[label];
    if (key && key !== 'estatus') {
      setField(key, match[2].replace(/,$/, ''));
      count++;
    }
  }
  if (!count) count = parsePositionalImport(text);
  saveDraft();
  checkDuplicate();
  showToast(
    count ? 'Formulario completado' : 'No se reconoció la estructura',
    count
      ? `${count} campos encontrados. Revisa la información antes de guardar.`
      : 'Sin etiquetas, pega los 16 valores en el orden del formulario, uno por renglón, tabulación o separados con |.',
  );
}
