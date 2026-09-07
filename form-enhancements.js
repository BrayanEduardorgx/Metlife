let reviewSignature = null,
  activeRecognition = null;
function recoveredDraftEntry() {
  const value = document.getElementById('recoveredDraftSelect').value;
  const option = [...document.getElementById('recoveredDraftSuggestions').options].find(
    (o) => o.value === value,
  );
  return option ? cloud.state.workspace.recoveredDrafts?.[option.dataset.id] : null;
}
function renderRecoveredDrafts(recovered) {
  document
    .getElementById('recoveredDrafts')
    .classList.toggle('hidden', !Object.keys(recovered).length);
  const list = document.getElementById('recoveredDraftSuggestions');
  list.replaceChildren();
  Object.entries(recovered).forEach(([id, entry], index) => {
    const option = document.createElement('option');
    option.dataset.id = id;
    option.value = [
      entry.draft?.nombre || 'Borrador',
      entry.draft?.poliza,
      String(entry.recoveredAt || '').slice(0, 10),
      '(' + (index + 1) + ')',
    ]
      .filter(Boolean)
      .join(' · ');
    list.append(option);
  });
  document.getElementById('restoreRecoveredDraft').disabled = !recoveredDraftEntry();
}
function normalizeInput(input, field, local = false) {
  const raw = input.value,
    start = input.selectionStart,
    end = input.selectionEnd;
  if (local) input.value = formatFieldValue(raw, field);
  else setField(field.key, raw, false);
  if (start === null) return;
  const position = (offset) => {
    if (['money', 'decimal', 'tel', 'dateText'].includes(field.type)) {
      const significant = (c) => /[\d.]/.test(c),
        count = [...raw.slice(0, offset)].filter(significant).length;
      if (!count) return 0;
      let seen = 0;
      for (let i = 0; i < input.value.length; i++)
        if (significant(input.value[i]) && ++seen === count) return i + 1;
      return input.value.length;
    }
    return MetlifeFormCore.normalize(raw.slice(0, offset), field.key).length;
  };
  input.setSelectionRange(position(start), position(end));
}
function updateSuggestions() {
  for (const [target, source] of [
    ['curp', 'rfc'],
    ['rfc', 'curp'],
  ]) {
    const button = document.getElementById('suggest-' + target);
    if (!button) continue;
    const value = MetlifeFormCore.prefix(document.getElementById(source).value);
    button.hidden = !value;
    button.textContent = 'Usar ' + value + ' de ' + source.toUpperCase();
    button.dataset.value = value;
  }
  const input = document.getElementById('correo'),
    list = document.getElementById('emailSuggestions');
  if (list && input) {
    const user = input.value.split('@')[0];
    list.replaceChildren();
    if (user)
      for (const domain of ['gmail.com', 'hotmail.com']) {
        const o = document.createElement('option');
        o.value = user + '@' + domain;
        list.append(o);
      }
  }
}
function confirmReview() {
  const item = draft(),
    issues = MetlifeFormCore.issues(item, fields),
    signature = JSON.stringify(item),
    box = document.getElementById('saveReview');
  if (!issues.length || reviewSignature === signature) {
    box.hidden = true;
    return true;
  }
  reviewSignature = signature;
  box.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = 'Revisa estos datos antes de guardar';
  box.append(title);
  const list = document.createElement('ul');
  for (const issue of issues) {
    const li = document.createElement('li'),
      button = document.createElement('button');
    button.type = 'button';
    button.className = 'link-btn';
    button.textContent = issue.message;
    button.onclick = () => document.getElementById(issue.key).focus();
    li.append(button);
    list.append(li);
  }
  box.append(list);
  const hint = document.createElement('p');
  hint.textContent =
    'No es obligatorio completarlos. Si están así en tu documento, vuelve a pulsar Guardar para conservarlos tal como están. Si haces cambios, volveremos a revisarlos.';
  box.append(hint);
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}
function stopVoice() {
  if (activeRecognition) {
    const rec = activeRecognition;
    activeRecognition = null;
    rec.abort();
  }
}
function startVoice(key, target = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition)
    return showToast(
      'Dictado no disponible',
      'Usa Chrome o Edge y permite el acceso al micrófono.',
    );
  const input = target.input || document.getElementById(key),
    button = target.button || document.querySelector('.voice[data-key="' + key + '"]');
  if (activeRecognition?.fieldKey === input.id) {
    stopVoice();
    return;
  }
  stopVoice();
  const mode = (target.field || fields.find((f) => f.key === key)).voice,
    rec = new Recognition();
  rec.fieldKey = input.id;
  activeRecognition = rec;
  let position = input.selectionStart ?? input.value.length;
  rec.lang = 'es-MX';
  rec.interimResults = false;
  rec.continuous = true;
  button.classList.add('listening');
  button.title = 'Escuchando; pulsa para detener';
  const track = () => {
    position = input.selectionStart ?? input.value.length;
  };
  input.addEventListener('input', track);
  input.addEventListener('select', track);
  rec.onresult = (event) => {
    if (activeRecognition !== rec) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (!event.results[i].isFinal) continue;
      let spoken = event.results[i][0].transcript.trim();
      if (['chars', 'digits'].includes(mode))
        spoken = spoken
          .replace(/\b(guion|espacio)\b/gi, (m) => (m.toLowerCase() === 'guion' ? '-' : ''))
          .replace(/\s/g, '');
      if (mode === 'digits') spoken = spoken.replace(/\D/g, '');
      if (mode === 'number') spoken = MetlifeFormCore.spokenNumber(spoken);
      if (mode === 'date') spoken = MetlifeFormCore.spokenDate(spoken);
      if (mode === 'email')
        spoken = spoken
          .replace(/\s*arroba\s*/gi, '@')
          .replace(/\s*punto\s*/gi, '.')
          .replace(/\s/g, '');
      if (!spoken) continue;
      const next = MetlifeFormCore.insert(input.value, spoken, position, mode === 'words');
      input.value = next.value;
      input.setSelectionRange(next.position, next.position);
      input.dispatchEvent(
        new CustomEvent('input', { bubbles: true, detail: { source: 'Dictado' } }),
      );
      position = input.selectionStart;
    }
  };
  rec.onerror = (event) => {
    if (event.error !== 'aborted')
      showToast(
        'No se pudo escuchar',
        'Revisa el permiso del micrófono e inténtalo de nuevo.',
        true,
      );
  };
  rec.onend = () => {
    button.classList.remove('listening');
    button.title = 'Dictar';
    input.removeEventListener('input', track);
    input.removeEventListener('select', track);
    if (activeRecognition === rec) activeRecognition = null;
  };
  try {
    rec.start();
  } catch {
    rec.onend();
    showToast('No se pudo iniciar el dictado', 'Inténtalo de nuevo.', true);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const policy = document.createElement('button');
  policy.type = 'button';
  policy.className = 'link-btn';
  policy.textContent = 'No tengo póliza · dejar en blanco';
  policy.onclick = () => {
    rememberUndo('Campo de poliza vaciado');
    setField('poliza', '');
    queueDraftSave();
    checkDuplicate();
  };
  document.getElementById('poliza').closest('.field').append(policy);
  for (const key of ['rfc', 'curp']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'suggest-' + key;
    button.className = 'link-btn field-suggestion';
    button.hidden = true;
    button.onclick = () => {
      const input = document.getElementById(key);
      if (
        input.value &&
        input.value !== button.dataset.value &&
        !confirm('¿Reemplazar este campo por la sugerencia?')
      )
        return;
      rememberUndo('Sugerencia aplicada');
      setField(key, button.dataset.value);
      input.dispatchEvent(
        new CustomEvent('input', { bubbles: true, detail: { source: 'Sugerencia' } }),
      );
      input.focus();
    };
    document.getElementById(key).closest('.field').append(button);
  }
  const list = document.createElement('datalist');
  list.id = 'emailSuggestions';
  document.body.append(list);
  document.getElementById('correo').setAttribute('list', list.id);
  updateSuggestions();
  document
    .getElementById('clientForm')
    .addEventListener('compositionend', (event) =>
      event.target.dispatchEvent(new Event('input', { bubbles: true })),
    );
  document.getElementById('recordsBody').addEventListener('click', (event) => {
    const button = event.target.closest('.record-edit');
    if (!button) return;
    const item = records().find((r) => r._id === button.dataset.id);
    if (!item) return;
    if (
      Object.values(draft()).some(Boolean) &&
      !confirm('¿Reemplazar el formulario para modificar este registro?')
    )
      return;
    clearForm();
    editingRecord = { ...item };
    fields.forEach((f) => setField(f.key, item[f.key] || '', false));
    loadMetadata(item);
    updateCaptureContext();
    queueDraftSave();
    checkDuplicate();
    document.getElementById('clientForm').scrollIntoView({ behavior: 'smooth' });
    showToast('Modificando registro', 'Al guardar se actualizará este registro.');
  });
});
