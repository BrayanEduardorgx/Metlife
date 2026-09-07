(function () {
  let loaded = false,
    job;
  function load() {
    if (loaded) return Promise.resolve();
    if (job) return job;
    job = (async () => {
      for (const src of [
        'document-core.js',
        'document-template.js',
        'transcription-core.js',
        'document-scanner.js',
      ])
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = src;
          script.onload = resolve;
          script.onerror = () => {
            script.remove();
            reject(Error('No se pudo cargar el escáner. Vuelve a intentarlo.'));
          };
          document.head.append(script);
        });
      loaded = true;
    })().catch((error) => {
      job = null;
      throw error;
    });
    return job;
  }
  for (const id of [
    'openCameraBtn',
    'uploadDocumentBtn',
    'nativeCameraBtn',
    'copyInstructionsBtn',
    'pasteDataBtn',
  ])
    document.getElementById(id).addEventListener(
      'click',
      (event) => {
        if (loaded) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const button = event.currentTarget;
        button.disabled = true;
        load()
          .then(() => {
            button.disabled = false;
            button.click();
          })
          .catch((error) => {
            button.disabled = false;
            document.getElementById('scanStatus').textContent = error.message;
          });
      },
      true,
    );
  window.addEventListener('metlife:scan-next', (event) => {
    if (loaded) return;
    event.stopImmediatePropagation();
    load()
      .then(() => window.dispatchEvent(new Event('metlife:scan-next')))
      .catch((error) => showToast('Escáner', error.message, true));
  });
  window.metlifeScannerLoader = { load };
  for (const id of ['documentFile', 'cameraFile'])
    document.getElementById(id)?.addEventListener(
      'change',
      (event) => {
        if (loaded) return;
        event.stopImmediatePropagation();
        const input = event.currentTarget;
        load()
          .then(() => input.dispatchEvent(new Event('change', { bubbles: true })))
          .catch((error) => showToast('Escáner', error.message, true));
      },
      true,
    );
})();
