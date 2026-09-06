function recordSelectionKey(r) {
  return JSON.stringify([r._batch, r._id || [r._saved, ...fields.map((f) => r[f.key] ?? '')]]);
}
function filteredRecords() {
  const q = $('#searchInput').value.trim().toUpperCase(),
    filter = $('#copiedFilter')?.value || 'all';
  return tableRecords().filter(
    (r) =>
      (filter === 'all' || (filter === 'copied' ? !!r._copiedAt : !r._copiedAt)) &&
      (!q ||
        String(r.poliza || '')
          .toUpperCase()
          .includes(q) ||
        String(r.nombre || '')
          .toUpperCase()
          .includes(q)),
  );
}
function updateRecordSelection() {
  const current = tableRecords();
  const valid = new Set(current.map(recordSelectionKey));
  for (const key of selectedRecords) if (!valid.has(key)) selectedRecords.delete(key);
  const list = filteredRecords();
  const count = list.filter((r) => selectedRecords.has(recordSelectionKey(r))).length;
  const all = $('#selectAllRecords');
  all.disabled = !list.length;
  all.checked = !!list.length && count === list.length;
  all.indeterminate = count > 0 && count < list.length;
  $('#selectAllLabel').textContent = $('#searchInput').value.trim()
    ? 'Seleccionar resultados'
    : cloud.state.recordsHasMore || cloud.state.recentHasMore
      ? 'Seleccionar cargados'
      : 'Seleccionar todos';
  $('#selectionCount').textContent = selectedRecords.size + ' seleccionados de ' + current.length;
  $('#copyRecordsBtn').disabled = !selectedRecords.size;
}
const recordRows = new Map();
function renderRecords() {
  updateRecordSelection();
  const list = filteredRecords(),
    shown = list.slice().reverse().slice(0, recordsPageSize),
    body = $('#recordsBody'),
    keep = new Set();
  $('#recordCount').textContent = visibleRecords().length + (cloud.state.recordsHasMore ? '+' : '');
  $('#emptyState').style.display = list.length ? 'none' : 'block';
  $('#emptyState h3').textContent = cloud.state.recordsLoading
    ? 'Cargando registros…'
    : 'No hay registros para mostrar';
  $('#emptyState p').textContent = cloud.state.recordsLoading
    ? 'Consultando el archivo en la nube.'
    : 'Prueba otro filtro o guarda un nuevo registro.';
  let position = body.firstElementChild;
  for (const r of shown) {
    const selection = recordSelectionKey(r),
      checked = selectedRecords.has(selection),
      file = historyFiles().find((f) => f.batch === r._batch),
      location = file
        ? 'Archivo: ' + file.name
        : r._batch === batch
          ? 'Excel actual (sin archivar)'
          : 'Solo en la nube · sin Excel guardado';
    const signature = JSON.stringify([r, checked, location]),
      old = recordRows.get(r._id);
    let row = old?.signature === signature ? old.row : null;
    if (!row) {
      if (old) {
        if (position === old.row) position = old.row.nextElementSibling;
        old.row.remove();
      }
      row = document.createElement('tr');
      row.dataset.id = r._id;
      row.className = checked ? 'selected' : '';
      const cell = document.createElement('td');
      cell.className = 'selection-cell';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'record-select';
      check.dataset.recordKey = encodeURIComponent(selection);
      check.checked = checked;
      check.setAttribute('aria-label', 'Seleccionar registro ' + (r.nombre || r.poliza || ''));
      cell.append(check);
      row.append(cell);
      for (const key of [
        'poliza',
        'nombre',
        'negocio',
        'suma',
        'prima',
        'fecha',
        'rfc',
        'comunidad',
      ]) {
        const td = document.createElement('td');
        td.textContent = r[key] || '';
        row.append(td);
      }
      const status = document.createElement('td');
      status.textContent = r._copiedAt
        ? 'Copiado ' + new Date(r._copiedAt).toLocaleDateString('es-MX')
        : 'Pendiente';
      row.append(status);
      const actions = document.createElement('td');
      for (const [cls, label] of [
        ['record-edit', 'Modificar'],
        ['record-trash', 'Eliminar cliente'],
        ...(r._copiedAt ? [['record-uncopy', 'Marcar pendiente']] : []),
        ['record-copy-client', 'Nueva póliza de este cliente'],
        ['record-versions', 'Historial de cambios'],
        [
          !file && r._batch !== batch ? 'record-attach' : 'record-detach',
          !file && r._batch !== batch ? 'Agregar a un Excel' : 'Quitar del Excel',
        ],
      ]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'link-btn ' + cls;
        b.dataset.id = r._id;
        b.textContent = label;
        actions.append(b);
      }
      const hint = document.createElement('small');
      hint.className = 'source-hint';
      hint.textContent = location;
      actions.append(hint);
      row.append(actions);
      const issues = MetlifeFormCore.issues(r, fields);
      if (issues.length) {
        const badge = document.createElement('span');
        badge.className = 'review-badge';
        badge.textContent = 'Por revisar';
        badge.title = issues.map((i) => i.message).join('\n');
        row.children[2].append(badge);
      }
      if (r._notes) {
        const badge = document.createElement('span');
        badge.className = 'source-hint';
        badge.textContent = 'Con notas';
        row.children[2].append(badge);
      }
      recordRows.set(r._id, { signature, row });
    }
    keep.add(r._id);
    if (row !== position) body.insertBefore(row, position);
    else position = position.nextElementSibling;
  }
  for (const [id, entry] of recordRows)
    if (!keep.has(id)) {
      entry.row.remove();
      recordRows.delete(id);
    }
  const isCloud = $('#recordScope')?.value === 'cloud';
  $('#recordsMoreBtn').classList.toggle(
    'hidden',
    isCloud ? !cloud.state.recentHasMore : !cloud.state.recordsHasMore,
  );
  $('#recordsPageStatus').textContent =
    'Mostrando ' +
    shown.length +
    ' registros cargados' +
    (isCloud ? ' de la nube' : ' de este Excel');
  const latest = visibleRecords().at(-1);
  $('#lastSaved').textContent = latest
    ? new Date(latest._saved).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : '—';
  metlifeUI.afterRecords.forEach((fn) => fn());
  renderHistory();
}
