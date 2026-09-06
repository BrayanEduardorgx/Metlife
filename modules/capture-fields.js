function normalizeText(v, key) {
  return MetlifeFormCore.normalize(v, key).trim();
}
function renderFields() {
  $('#fields').innerHTML = fields
    .map(
      (f) =>
        `<div class="field ${f.span === 2 ? 'span-2' : ''}"><label for="${f.key}"><span>${f.label}</span><span class="cell-tag">CELDA ${f.cell}</span></label><div class="input-wrap ${['poliza', 'nombre', 'telefono'].includes(f.key) ? 'with-lookup' : ''}">${f.options ? `<select id="${f.key}" name="${f.key}" >${f.options.map((o) => `<option value="${o}">${o || 'SELECCIONAR'}</option>`).join('')}</select>` : `<input id="${f.key}" name="${f.key}" type="text" ${f.type === 'email' ? 'inputmode="email"' : ''} placeholder="${f.placeholder || ''}"  ${f.disabled ? 'disabled' : ''} autocomplete="off" />${f.voice ? `<span class="tools">${['poliza', 'nombre', 'telefono'].includes(f.key) ? `<button type="button" class="tool-btn lookup-client" data-key="${f.key}" title="Buscar cliente" aria-label="Buscar cliente por ${f.label}"><svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>` : ''}<button type="button" class="tool-btn voice" data-key="${f.key}" title="Dictar" aria-label="Dictar ${f.label}"><svg class="mic-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></button><button type="button" class="tool-btn clear-field" data-key="${f.key}" title="Vaciar campo" aria-label="Vaciar ${f.label}"><svg class="trash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></span>` : ''}`}</div>${f.help ? `<small class="field-help">${f.help}</small>` : ''}</div>`,
    )
    .join('');
}
