/* Optional tools share the canonical cloud API and stay collapsed until requested. */
(function () {
  const section = document.createElement('section');
  section.className = 'workflow-card';
  section.innerHTML =
    '<details id="workspaceTools"><summary>Herramientas y resumen</summary><div class="workflow-actions"><button type="button" id="dailySummaryBtn" class="secondary">Resumen del día</button><button type="button" id="saveFilterBtn" class="secondary">Guardar filtros actuales</button><button type="button" id="exportTemplateBtn" class="secondary">Plantilla de exportación</button><button type="button" id="bulkEditBtn" class="secondary">Editar seleccionados</button></div><label>Mis filtros guardados<select id="savedFilters"><option value="">Seleccionar filtro</option></select></label><button type="button" id="deleteFilterBtn" class="link-btn">Eliminar filtro seleccionado</button><div id="dailySummary" role="status" hidden></div><details><summary>Operaciones pendientes</summary><div id="operationsList" aria-live="polite"></div></details><details><summary>Rendimiento de esta sesión</summary><p>Duraciones locales; no contienen nombres ni datos de clientes.</p><div id="performanceList"></div></details><p id="accountRole" role="status"></p></details>';
  document.querySelector('.records-card').before(section);
  let preferences = { favorites: {}, filters: {} },
    preferenceUser = null,
    preferenceRef = null,
    preferenceListener = null;
  const filterIds = [
    'searchInput',
    'copiedFilter',
    'recordScope',
    'filterFrom',
    'filterTo',
    'filterSeller',
    'filterBusiness',
    'filterCommunity',
    'filterReview',
  ];
  const prefsPath = () => firebaseDb.ref('preferences/' + cloud.state.uid);
  async function savePreference(path, value) {
    cloud.requireCloud();
    await metlifeOperations.run('preference:' + path, 'Guardar preferencia', () =>
      firebaseDb.ref('preferences/' + cloud.state.uid + '/' + path).set(value),
    );
  }
  function renderPreferences() {
    const select = get('savedFilters'),
      previous = select.value;
    select.replaceChildren(new Option('Seleccionar filtro', ''));
    for (const [id, item] of Object.entries(preferences.filters || {}))
      select.append(new Option(item.name, id));
    select.value = previous;
    renderHistory();
  }
  window.addEventListener('metlife:cloud-change', (e) => {
    if (e.detail.type === 'ready' && preferenceUser !== cloud.state.uid) {
      preferenceUser = cloud.state.uid;
      preferenceRef = prefsPath();
      preferenceListener = (snap) => {
        preferences = snap.val() || {};
        renderPreferences();
      };
      preferenceRef.on('value', preferenceListener);
    }
    if (e.detail.type === 'status' && !cloud.state.uid) {
      if (preferenceRef) preferenceRef.off('value', preferenceListener);
      preferenceRef = preferenceListener = null;
      preferences = {};
      preferenceUser = null;
      metlifeOperations.clear();
    }
  });
  metlifeUI.afterHistory.add(() => {
    const list = get('historyList');
    for (const row of list.children) {
      const id = row.dataset.batch,
        favorite = !!preferences.favorites?.[id],
        button = textNode('button', favorite ? '★ Favorito' : '☆ Favorito');
      button.className = 'history-action favorite';
      button.type = 'button';
      button.setAttribute('aria-pressed', String(favorite));
      button.onclick = () =>
        savePreference('favorites/' + id, favorite ? null : true).catch((e) =>
          showToast('Favorito', e.message, true),
        );
      row.querySelector('.history-actions').prepend(button);
    }
    const rows = [...list.children];
    rows.sort(
      (a, b) =>
        Number(!!preferences.favorites?.[b.dataset.batch]) -
        Number(!!preferences.favorites?.[a.dataset.batch]),
    );
    for (const row of rows) list.append(row);
  });
  get('saveFilterBtn').onclick = async () => {
    const name = prompt('Nombre de este filtro:');
    if (!name?.trim()) return;
    try {
      await savePreference('filters/filter_' + Date.now(), {
        name: name.trim().slice(0, 80),
        values: Object.fromEntries(filterIds.map((id) => [id, get(id).value])),
      });
    } catch (e) {
      showToast('Filtros', e.message, true);
    }
  };
  get('savedFilters').onchange = () => {
    const item = preferences.filters?.[get('savedFilters').value];
    if (!item) return;
    for (const id of filterIds)
      if (item.values?.[id] !== undefined) get(id).value = item.values[id];
    selectedRecords.clear();
    recordsPageSize = 50;
    renderRecords();
  };
  get('deleteFilterBtn').onclick = () => {
    const id = get('savedFilters').value;
    if (id && confirm('¿Eliminar este filtro guardado?'))
      savePreference('filters/' + id, null).catch((e) => showToast('Filtros', e.message, true));
  };
  const day = (value) =>
    new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  get('dailySummaryBtn').onclick = async () => {
    const button = get('dailySummaryBtn');
    button.disabled = true;
    try {
      const result = await metlifeOperations.run('summary', 'Resumen diario', () =>
          cloud.dailySummary(day(Date.now())),
        ),
        box = get('dailySummary');
      box.hidden = false;
      box.textContent =
        'Hoy: ' +
        result.created +
        ' capturas · ' +
        result.updated +
        ' registros corregidos · ' +
        result.review +
        ' registros activos por revisar con actividad hoy. ' +
        result.pending +
        ' capturas pendientes en tu cuenta.';
    } catch (e) {
      showToast('Resumen', e.message, true);
    } finally {
      button.disabled = false;
    }
  };
  function renderOperations() {
    const box = get('operationsList');
    box.replaceChildren();
    for (const item of metlifeOperations.entries.values()) {
      const row = textNode(
        'p',
        item.label + ': ' + (item.status === 'running' ? 'En curso' : item.message),
      );
      if (item.status === 'failed') {
        const retry = textNode('button', 'Reintentar');
        retry.type = 'button';
        retry.className = 'secondary';
        retry.onclick = () => item.retry().catch(() => {});
        row.append(retry);
      }
      box.append(row);
    }
    for (const [id, error] of archiveErrors) {
      const row = textNode('p', 'Excel ' + currentExcelLabel(id) + ': ' + error),
        retry = textNode('button', 'Actualizar');
      retry.type = 'button';
      retry.onclick = () => refreshArchive(id);
      row.append(retry);
      box.append(row);
    }
    if (draftDirty)
      box.append(textNode('p', 'El borrador tiene cambios pendientes de sincronizar.'));
    if (!box.children.length) box.append(textNode('p', 'No hay operaciones pendientes.'));
    const metrics = get('performanceList');
    metrics.replaceChildren();
    for (const [name, item] of metlifeOperations.metrics)
      metrics.append(
        textNode(
          'p',
          name +
            ': última ' +
            Math.round(item.last) +
            ' ms · promedio ' +
            Math.round(item.total / item.count) +
            ' ms · ' +
            item.count +
            ' operaciones',
        ),
      );
  }
  window.addEventListener('metlife:operations', renderOperations);
  window.addEventListener('metlife:cloud-change', renderOperations);
  renderOperations();
  const templateDialog = makeDialog('exportTemplateDialog', 'Plantilla de exportación');
  get('exportTemplateBtn').onclick = () => {
    templateDialog.replaceChildren(textNode('h2', 'Columnas y orden del Excel'));
    const list = document.createElement('div');
    list.id = 'templateColumns';
    const order = preferences.exportKeys || fields.map((f) => f.key);
    for (const key of [...order, ...fields.map((f) => f.key).filter((k) => !order.includes(k))]) {
      const field = fields.find((f) => f.key === key);
      if (!field) continue;
      const row = document.createElement('div'),
        label = textNode('label', field.label),
        check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = order.includes(key);
      check.dataset.key = key;
      label.prepend(check);
      const up = textNode('button', '↑'),
        down = textNode('button', '↓');
      for (const [button, direction] of [
        [up, -1],
        [down, 1],
      ]) {
        button.type = 'button';
        button.setAttribute('aria-label', (direction < 0 ? 'Subir ' : 'Bajar ') + field.label);
        button.onclick = () => {
          if (direction < 0 && row.previousElementSibling)
            list.insertBefore(row, row.previousElementSibling);
          if (direction > 0 && row.nextElementSibling)
            list.insertBefore(row.nextElementSibling, row);
        };
      }
      row.append(label, up, down);
      list.append(row);
    }
    const save = textNode('button', 'Guardar plantilla'),
      close = textNode('button', 'Cancelar');
    save.type = close.type = 'button';
    save.className = 'primary';
    close.onclick = () => templateDialog.close();
    save.onclick = async () => {
      const keys = [...list.querySelectorAll('input:checked')].map((i) => i.dataset.key);
      if (!keys.length)
        return showToast('Plantilla vacía', 'Selecciona al menos una columna.', true);
      save.disabled = true;
      try {
        await savePreference('exportKeys', keys);
        templateDialog.close();
      } catch (e) {
        showToast('Plantilla', e.message, true);
      } finally {
        save.disabled = false;
      }
    };
    templateDialog.append(list, save, close);
    templateDialog.showModal();
  };
  window.metlifeExportKeys = () => preferences.exportKeys || fields.map((f) => f.key);
  const editDialog = makeDialog('bulkEditDialog', 'Edición múltiple con vista previa');
  get('bulkEditBtn').onclick = () => {
    const selected = tableRecords().filter((r) => selectedRecords.has(recordSelectionKey(r)));
    if (!selected.length)
      return showToast('Selecciona registros', 'Marca los clientes que quieres modificar.');
    editDialog.replaceChildren(textNode('h2', 'Modificar ' + selected.length + ' registros'));
    const key = document.createElement('select');
    key.id = 'bulkEditField';
    for (const field of fields.filter((f) =>
      ['vendida', 'comunidad', 'fecha', 'negocio', 'medio', 'trabajo'].includes(f.key),
    ))
      key.append(new Option(field.label, field.key));
    const value = document.createElement('input');
    value.id = 'bulkEditValue';
    value.setAttribute('aria-label', 'Nuevo valor');
    key.setAttribute('aria-label', 'Campo a modificar');
    const preview = textNode('button', 'Ver cambios'),
      apply = textNode('button', 'Confirmar cambios'),
      close = textNode('button', 'Cancelar'),
      result = textNode('div', '');
    result.setAttribute('role', 'status');
    preview.type = apply.type = close.type = 'button';
    apply.hidden = true;
    let patch,
      active = false;
    const invalidate = () => {
      patch = null;
      apply.hidden = true;
      result.replaceChildren();
    };
    key.onchange = value.oninput = invalidate;
    preview.onclick = () => {
      let normalized = MetlifeFormCore.normalize(value.value, key.value).trim();
      if (key.value === 'fecha') normalized = formatDate(normalized);
      patch = { [key.value]: normalized };
      result.replaceChildren();
      for (const record of selected) {
        result.append(
          textNode(
            'p',
            (record.nombre || record.poliza || 'Sin nombre') +
              ': ' +
              (record[key.value] || 'Sin dato') +
              ' → ' +
              (normalized || 'Sin dato'),
          ),
        );
        const issues = MetlifeFormCore.issues({ ...record, ...patch }, fields);
        if (issues.length)
          result.append(
            textNode('p', 'Revisar: ' + issues.map((issue) => issue.message).join(' · ')),
          );
      }
      result.append(
        textNode(
          'p',
          'Se actualizarán estos clientes y sus archivos. Los datos incompletos se permiten; revisa los valores antes de confirmar.',
        ),
      );
      apply.hidden = false;
    };
    close.onclick = () => editDialog.close();
    editDialog.oncancel = (e) => {
      if (active) e.preventDefault();
    };
    apply.onclick = async () => {
      if (!patch || active) return;
      active = true;
      apply.disabled = close.disabled = key.disabled = value.disabled = preview.disabled = true;
      const affected = new Set(selected.map((record) => record._batch));
      try {
        for (const id of affected) {
          heldArchives.add(id);
          clearTimeout(archiveTimers.get(id));
          archiveTimers.delete(id);
          if (archiveJobs.has(id)) await archiveJobs.get(id);
        }
        const outcome = await metlifeOperations.run('bulk-edit', 'Edición múltiple', () =>
          cloud.bulkUpdate(selected, patch),
        );
        for (const id of affected) heldArchives.delete(id);
        for (const id of new Set(outcome.success.map((r) => r._batch))) await refreshArchive(id);
        result.replaceChildren(
          textNode(
            'p',
            outcome.success.length + ' actualizados · ' + outcome.failed.length + ' sin modificar',
          ),
        );
        for (const failure of outcome.failed)
          result.append(textNode('p', failure.name + ': ' + failure.message));
        apply.hidden = true;
        selectedRecords.clear();
        renderRecords();
      } catch (e) {
        result.textContent = e.message;
      } finally {
        for (const id of affected) heldArchives.delete(id);
        active = false;
        apply.disabled = close.disabled = key.disabled = value.disabled = preview.disabled = false;
      }
    };
    editDialog.append(key, value, preview, result, apply, close);
    editDialog.showModal();
  };
  window.addEventListener('beforeunload', (e) => {
    if ([...metlifeOperations.entries.values()].some((item) => item.status === 'running')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
