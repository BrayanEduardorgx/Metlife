(function () {
  const skip = textNode('a', 'Ir al formulario');
  skip.href = '#nombre';
  skip.className = 'skip-link';
  document.body.prepend(skip);
  get('recordsBody').closest('table').setAttribute('aria-label', 'Clientes registrados');
  for (const th of document.querySelectorAll('.records-card thead th')) th.scope = 'col';
  get('searchInput').setAttribute('aria-label', 'Filtrar registros cargados por póliza o nombre');
  get('savedFilters').setAttribute('aria-label', 'Mis filtros guardados');
  function applyPermissions() {
    if (!metlifeState.role) return;
    const canWrite = metlifeAccess.allows('write'),
      canDelete = metlifeAccess.allows('delete');
    for (const button of document.querySelectorAll(
      '.record-trash,.history-action.delete,#deleteSelectedClient',
    )) {
      button.hidden = !canDelete;
    }
    for (const button of document.querySelectorAll(
      '.record-edit,.record-detach,.record-attach,.history-action.refresh,.history-action.rename,#editSelectedClient,#bulkEditBtn,#bulkAttachBtn,#attachSelectedClient,#saveHistoryBtn,#archiveRecordsBtn,#newExcelBtn,#clientForm button[type="submit"]',
    )) {
      if (!canWrite) {
        if (!button.dataset.permissionDisabled)
          button.dataset.permissionWasDisabled = String(button.disabled);
        button.dataset.permissionDisabled = 'true';
        button.disabled = true;
        button.title = 'Tu cuenta tiene permiso de consulta.';
      } else if (button.dataset.permissionDisabled) {
        button.disabled = button.dataset.permissionWasDisabled === 'true';
        delete button.dataset.permissionDisabled;
        delete button.dataset.permissionWasDisabled;
        button.removeAttribute('title');
      }
    }
  }
  metlifeUI.afterRecords.add(applyPermissions);
  metlifeUI.afterHistory.add(applyPermissions);
  window.addEventListener('metlife:cloud-change', applyPermissions);
  const previousDialogFocus = new WeakMap();
  document.addEventListener(
    'click',
    () => {
      for (const dialog of document.querySelectorAll('dialog:not([open])'))
        previousDialogFocus.set(dialog, document.activeElement);
    },
    true,
  );
  document.addEventListener(
    'close',
    (e) => {
      if (e.target instanceof HTMLDialogElement) {
        const previous = previousDialogFocus.get(e.target);
        if (previous?.isConnected) previous.focus();
      }
    },
    true,
  );
})();
