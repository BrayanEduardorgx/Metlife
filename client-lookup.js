(function () {
  'use strict';
  let controller = new AbortController();
  let searchGeneration = 0,
    cursor = null,
    searchKey = '',
    searchText = '';
  function status(message, warning = false) {
    $('#clientLookup').classList.remove('hidden');
    $('#lookupStatus').textContent = message;
    $('#lookupStatus').classList.toggle('warning', warning);
  }
  function reset(clear = false) {
    controller.abort();
    controller = new AbortController();
    searchGeneration++;
    cursor = null;
    $('#lookupResults').replaceChildren();
    $('#clientLookup').classList.add('hidden');
    $('#lookupMoreBtn').classList.add('hidden');
    if (clear) {
      window.metlifeSelectedClient = null;
      window.renderSelectedClient?.();
    }
  }
  async function load(item, key) {
    const generation = searchGeneration,
      current = await cloud.fetchRecord(item._id);
    if (generation !== searchGeneration) return;
    if (!current || current._deletedAt)
      return status('Este cliente ya no está disponible. Actualiza la búsqueda.', true);
    if (
      fields.some((f) => f.key !== key && $('#' + f.key).value) &&
      !confirm('¿Reemplazar el formulario por los datos de este cliente?')
    )
      return;
    clearTimeout(window.draftTimer);
    stopVoice();
    window.dispatchEvent(new Event('metlife:form-reset'));
    activePendingId = null;
    activePendingRevision = null;
    fields.forEach((f) => setField(f.key, f.key === 'estatus' ? '' : current[f.key] || '', false));
    fieldUndo = {};
    editingRecord = null;
    loadMetadata(current);
    window.metlifeSelectedClient = current;
    window.renderSelectedClient?.();
    saveDraft();
    checkDuplicate();
    updateCaptureContext();
    status(
      'Se muestran todos los datos del cliente. Pulsa Editar para actualizar este mismo registro o Eliminar para enviarlo a la papelera.',
    );
    $('#nombre').focus();
  }
  async function page(more = false) {
    const token = searchGeneration;
    $('#lookupMoreBtn').disabled = true;
    status('Buscando en todos los clientes de la nube…');
    try {
      const result = await metlifeOperations.measure('Búsqueda', () =>
        cloud.searchClients(
          searchKey,
          searchText,
          more ? cursor : null,
          20,
          false,
          controller.signal,
        ),
      );
      if (token !== searchGeneration) return;
      cursor = result.cursor;
      for (const item of result.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lookup-result';
        const name = document.createElement('strong');
        name.textContent = item.nombre || 'Sin nombre';
        const detail = document.createElement('small');
        detail.textContent =
          'Póliza: ' + (item.poliza || 'Sin dato') + ' · ' + clientFileLabel(item);
        button.append(name, detail);
        button.onclick = () => load(item, searchKey).catch((error) => status(error.message, true));
        $('#lookupResults').append(button);
      }
      $('#lookupMoreBtn').classList.toggle('hidden', !cursor);
      if (!$('#lookupResults').children.length)
        status(
          'No hay coincidencias. Prueba con una póliza, un teléfono o cualquier parte del nombre.',
          true,
        );
      else {
        status(
          $('#lookupResults').children.length +
            ' coincidencias. La búsqueda incluye archivos anteriores y clientes sin Excel.',
        );
        if (!more && !cursor && result.items.length === 1) await load(result.items[0], searchKey);
      }
    } catch (error) {
      if (token === searchGeneration)
        status('No se pudo completar la búsqueda: ' + error.message, true);
    } finally {
      if (token === searchGeneration) $('#lookupMoreBtn').disabled = false;
    }
  }
  function search(key, query) {
    reset(true);
    searchKey = key;
    searchText = String(query ?? $('#' + key).value).trim();
    if (!searchText)
      return status(
        key === 'nombre'
          ? 'Escribe cualquier parte del nombre o de los apellidos.'
          : key === 'telefono'
            ? 'Escribe el teléfono o algunos de sus dígitos.'
            : 'Escribe la póliza.',
        true,
      );
    page();
  }
  $('#fields').addEventListener('click', (event) => {
    const b = event.target.closest('.lookup-client');
    if (b) search(b.dataset.key);
  });
  $('#fields').addEventListener('input', (event) => {
    if (['poliza', 'nombre', 'telefono'].includes(event.target.id)) reset(false);
  });
  $('#lookupMoreBtn').onclick = () => page(true);
  window.metlifeLookupSearch = (key, query) => {
    search(key, query);
    $('#clientLookup').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  window.addEventListener('metlife:form-reset', () => reset(true));
})();
