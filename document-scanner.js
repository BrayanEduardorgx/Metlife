(function () {
  'use strict';
  const core = window.MetlifeDocument;
  const reviewDefs = fields.flatMap((field) => {
    if (field.key === 'nombre')
      return ['paterno', 'materno', 'nombres'].map((key) =>
        core.definitions.find((d) => d.key === key),
      );
    if (field.key === 'negocio')
      return [
        {
          key: 'negocio',
          label: 'NEGOCIO',
          source: 'Casillas: póliza nueva, incremento o inclusión.',
        },
      ];
    const def = core.definitions.find((d) => d.key === field.key);
    return def
      ? [
          {
            ...def,
            label: field.label,
            source:
              field.key === 'vendida'
                ? 'Nombre escrito en la zona superior de la hoja, en cualquier color de tinta o lápiz.'
                : field.key === 'fecha'
                  ? 'Fecha escrita en Lugar y fecha al pie de la hoja.'
                  : 'En la hoja: ' + def.label,
          },
        ]
      : [];
  });
  let stream = null,
    cameraGeneration = 0,
    canvas = null,
    worker = null,
    workerPromise = null,
    scriptPromise = null,
    handWorker = null,
    handJob = null;
  let busy = false,
    generation = 0,
    timeout = null,
    cropKey = null,
    cropRect = null,
    dragStart = null,
    regions = [],
    reviewReady = false;
  let detectedTemplate = null,
    proofs = {};
  let readingChecks = {};
  let zones = window.metlifeCloud?.state.zones || {};
  window.addEventListener('metlife:zones', (event) => {
    zones = event.detail || {};
  });
  const status = (message, warning = false) => {
    $('#scanStatus').textContent = message;
    $('#scanStatus').classList.toggle('warning', warning);
  };
  const el = (id) => document.getElementById(id);
  function setBusy(value) {
    busy = value;
    $('.scan-card').setAttribute('aria-busy', String(value));
    for (const id of [
      'openCameraBtn',
      'uploadDocumentBtn',
      'rotateDocumentBtn',
      'removeDocumentBtn',
      'analyzeDocumentBtn',
      'applyScanBtn',
      'scanTextBtn',
      'readCropBtn',
      'readCropFastBtn',
      'forgetScanZones',
      'nativeCameraBtn',
      'scanReadingMode',
    ])
      el(id).disabled = value;
    $('#cancelScanBtn').classList.toggle('hidden', !value);
    document
      .querySelectorAll(
        '.read-zone, .scan-review-field input, .scan-review-field select, .crop-coordinates input',
      )
      .forEach((input) => (input.disabled = value));
  }
  function stopCamera() {
    cameraGeneration++;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    $('#documentVideo').srcObject = null;
    $('#cameraPanel').classList.add('hidden');
    $('#captureDocumentBtn').disabled = true;
    $('#openCameraBtn').disabled = busy;
  }
  async function openCamera(deviceId) {
    if (busy) return;
    generation++;
    stopCamera();
    const id = ++cameraGeneration;
    if (!navigator.mediaDevices?.getUserMedia) {
      $('#cameraFile').click();
      return;
    }
    $('#openCameraBtn').disabled = true;
    status('Abriendo cámara…');
    try {
      let media;
      const video =
        typeof deviceId === 'string'
          ? { deviceId: { exact: deviceId } }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 2560 },
              height: { ideal: 1920 },
            };
      try {
        media = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      } catch (error) {
        if (error.name !== 'OverconstrainedError') throw error;
        media = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      if (id !== cameraGeneration) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = media;
      $('#documentVideo').srcObject = media;
      $('#cameraPanel').classList.remove('hidden');
      await $('#documentVideo').play();
      if (id !== cameraGeneration) return;
      $('#captureDocumentBtn').disabled = false;
      $('#nativeCameraBtn').classList.add('hidden');
      status('Encuadra toda la hoja y pulsa Tomar foto.');
      try {
        const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === 'videoinput',
        );
        if (id !== cameraGeneration) return;
        $('#cameraSelect').replaceChildren();
        cameras.forEach((device, index) => {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || 'Cámara ' + (index + 1);
          $('#cameraSelect').append(option);
        });
        $('#cameraSelect').value = media.getVideoTracks()[0].getSettings().deviceId || '';
        $('#cameraSelector').classList.toggle('hidden', cameras.length < 2);
      } catch {
        $('#cameraSelector').classList.add('hidden');
      }
    } catch (error) {
      if (id !== cameraGeneration) return;
      stopCamera();
      $('#nativeCameraBtn').classList.remove('hidden');
      status(
        error.name === 'NotAllowedError'
          ? 'Permite el acceso a la cámara o usa Subir foto.'
          : 'No se pudo abrir la cámara. Puedes subir una foto del documento.',
        true,
      );
    }
  }
  function makeCanvas(image, width, height) {
    const c = document.createElement('canvas');
    const scale = Math.min(1, 2600 / Math.max(width, height));
    c.width = Math.round(width * scale);
    c.height = Math.round(height * scale);
    const context = c.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, c.width, c.height);
    context.drawImage(image, 0, 0, c.width, c.height);
    return c;
  }
  function clearReview() {
    proofs = {};
    readingChecks = {};
    detectedTemplate = null;
    reviewReady = false;
    $('#scanRawText').value = '';
    regions = [];
    $('#scanReview').classList.add('hidden');
    $('#scanReviewFields').replaceChildren();
  }
  function showPreview() {
    clearReview();
    $('#documentPreview').src = canvas.toDataURL('image/jpeg', 0.92);
    $('#documentPreviewPanel').classList.remove('hidden');
    status('Foto lista. Pulsa Analizar documento. La letra a mano puede necesitar correcciones.');
  }
  async function loadPhoto(file) {
    if (!file || busy) return;
    if (file.type && !file.type.startsWith('image/')) {
      status('Selecciona una foto del documento.', true);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      status('La foto es demasiado grande. Usa una imagen de menos de 20 MB.', true);
      return;
    }
    stopCamera();
    const id = ++generation;
    setBusy(true);
    status('Preparando imagen…');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (id !== generation) return;
      if (img.naturalWidth * img.naturalHeight > 50000000) throw Error('size');
      canvas = makeCanvas(img, img.naturalWidth, img.naturalHeight);
      showPreview();
    } catch {
      if (id === generation)
        status('No se pudo abrir la foto. Prueba otra imagen JPG más pequeña.', true);
    } finally {
      URL.revokeObjectURL(url);
      if (id === generation) setBusy(false);
    }
  }
  function loadScript() {
    if (window.Tesseract) return Promise.resolve();
    if (!scriptPromise)
      scriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          scriptPromise = null;
          reject(Error('No se pudo descargar el lector. Revisa tu conexión.'));
        };
        document.head.appendChild(script);
      });
    return scriptPromise;
  }
  async function getReader(id) {
    if (worker) return worker;
    if (!workerPromise) {
      const pending = (async () => {
        await loadScript();
        if (id !== generation) throw Error('cancelled');
        const reader = await Tesseract.createWorker('spa', 1, {
          logger: (event) => {
            if (!busy) return;
            if (event.status === 'recognizing text')
              status(
                'Leyendo documento en este dispositivo: ' +
                  Math.round((event.progress || 0) * 100) +
                  ' %.',
              );
            else status('Preparando lector gratuito. La primera descarga puede tardar…');
          },
        });
        if (id !== generation) {
          await reader.terminate();
          throw Error('cancelled');
        }
        worker = reader;
        return reader;
      })();
      workerPromise = pending;
      pending.then(
        () => {
          if (workerPromise === pending) workerPromise = null;
        },
        () => {
          if (workerPromise === pending) workerPromise = null;
        },
      );
    }
    return workerPromise;
  }
  function cancel(message = 'Lectura cancelada. Puedes intentarlo de nuevo.') {
    generation++;
    clearTimeout(timeout);
    const old = worker;
    worker = null;
    workerPromise = null;
    old?.terminate().catch(() => {});
    if (handJob) {
      handJob.reject(Error('cancelled'));
      handJob = null;
    }
    handWorker?.terminate();
    handWorker = null;
    setBusy(false);
    status(message, true);
  }
  function startJob(limit = 90000) {
    const id = ++generation;
    setBusy(true);
    clearTimeout(timeout);
    timeout = setTimeout(
      () => cancel('La lectura tardó demasiado. Prueba una foto más clara o una zona pequeña.'),
      limit,
    );
    return id;
  }
  function finish(id) {
    if (id !== generation) return;
    clearTimeout(timeout);
    setBusy(false);
  }
  function readHand(crop, id) {
    if (!handWorker) {
      handWorker = new Worker('handwriting-worker.js', { type: 'module' });
      handWorker.onmessage = (event) => {
        const data = event.data;
        if (!handJob || data.id !== handJob.id) return;
        if (data.progress !== undefined) {
          $('#cropStatus').textContent =
            'Descargando lector de letra a mano: ' + data.progress + ' % del archivo actual.';
          status('Preparando lector de letra a mano: ' + data.progress + ' % del archivo actual.');
          return;
        }
        const job = handJob;
        handJob = null;
        data.error ? job.reject(Error(data.error)) : job.resolve(data.text);
      };
      handWorker.onerror = () => {
        const job = handJob;
        handJob = null;
        handWorker?.terminate();
        handWorker = null;
        job?.reject(
          Error(
            'El lector de letra a mano no está disponible en este navegador. Usa Lectura rápida.',
          ),
        );
      };
    }
    return new Promise((resolve, reject) => {
      handJob = { id, resolve, reject };
      const prepared = window.MetlifeTemplate.prepareWriting(
        crop.getContext('2d').getImageData(0, 0, crop.width, crop.height),
      );
      const pixels = prepared.data.buffer;
      handWorker.postMessage({ id, pixels, width: prepared.width, height: prepared.height }, [
        pixels,
      ]);
    });
  }
  function validRect(rect) {
    return (
      rect &&
      ['left', 'top', 'width', 'height'].every((k) => Number.isFinite(rect[k])) &&
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.left + rect.width <= 1.001 &&
      rect.top + rect.height <= 1.001
    );
  }
  function cropImage(rect) {
    const c = document.createElement('canvas');
    const w = Math.max(1, Math.round(rect.width * canvas.width)),
      h = Math.max(1, Math.round(rect.height * canvas.height)),
      scale = Math.min(2, 1200 / w),
      padding = 16;
    c.width = Math.round(w * scale) + padding * 2;
    c.height = Math.round(h * scale) + padding * 2;
    const context = c.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, c.width, c.height);
    context.drawImage(
      canvas,
      rect.left * canvas.width,
      rect.top * canvas.height,
      w,
      h,
      padding,
      padding,
      c.width - padding * 2,
      c.height - padding * 2,
    );
    return c;
  }
  function hasInk(c) {
    return window.MetlifeTemplate.hasWriting(
      c.getContext('2d').getImageData(0, 0, c.width, c.height),
    );
  }
  async function analyze() {
    if (!canvas || busy) return;
    stopCamera();
    clearReview();
    const id = startJob(),
      started = performance.now();
    status('Preparando lectura gratuita…');
    let values = {},
      partial = false;
    try {
      const reader = await getReader(id);
      if (id !== generation) return;
      await reader.setParameters({
        tessedit_pageseg_mode: '11',
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: '',
      });
      const { data } = await reader.recognize(canvas, {}, { text: true, blocks: true });
      if (id !== generation) return;
      $('#scanRawText').value = data.text || '';
      const result = core.extractLayout(data, canvas.width, canvas.height);
      regions = result.regions;
      values = result.values;
      detectedTemplate =
        window.MetlifeTemplate?.locate(
          regions,
          canvas.width,
          canvas.height,
          core.flattenWords(data),
        ) || null;
      let jobs = [];
      if (detectedTemplate) {
        const mark = window.MetlifeTemplate.readBoxes(
          canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height),
          detectedTemplate,
        );
        values = { negocio: mark.value };
        result.warning = mark.warning;
        jobs = core.definitions
          .filter((def) => detectedTemplate.rects[def.key])
          .map((def) => {
            const key = def.key,
              rect = detectedTemplate.rects[key];
            return [key, rect];
          })
          .map(([key, rect]) => {
            const saved = zones[key];
            if (saved?.template === detectedTemplate.id && validRect(saved.templateRect)) {
              const r = saved.templateRect;
              rect = window.MetlifeTemplate.transformRect(
                detectedTemplate.matrix,
                [r.left * 1200, r.top * 1600, r.width * 1200, r.height * 1600],
                canvas.width,
                canvas.height,
              );
            }
            return [
              key,
              {
                rect,
                mode:
                  saved?.template === detectedTemplate.id
                    ? saved.mode
                    : $('#scanReadingMode').value,
              },
            ];
          });
        // Align template-relative corrections to each new photo. Ignore old absolute crops here.
        regions = jobs.map(([key, zone]) => ({
          key,
          rect: {
            left: zone.rect.left * canvas.width,
            top: zone.rect.top * canvas.height,
            width: zone.rect.width * canvas.width,
            height: zone.rect.height * canvas.height,
          },
        }));
      } else {
        values = {};
        result.warning =
          'No se identificaron todas las zonas del formato. Selecciona la escritura con «Leer zona»; el texto impreso no se trasladará como dato del cliente.';
        jobs = Object.entries(zones).filter(
          ([key, zone]) =>
            core.definitions.some((d) => d.key === key) &&
            validRect(zone.rect) &&
            Math.abs((zone.aspect || 0) - canvas.width / canvas.height) < 0.06,
        );
      }
      if (jobs.length) {
        clearTimeout(timeout);
        timeout = setTimeout(
          () =>
            cancel(
              'La lectura tardó demasiado. Conservamos lo leído; puedes corregirlo o usar Lectura rápida.',
            ),
          240000,
        );
      }
      showReview(values);
      setBusy(true);
      let handUnavailable = false;
      for (let i = 0; i < jobs.length; i++) {
        const [key, zone] = jobs[i],
          crop = cropImage(zone.rect);
        values[key] = '';
        status(
          (detectedTemplate ? 'Formato Protección Futura 20. ' : '') +
            'Leyendo ' +
            (i + 1) +
            ' de ' +
            jobs.length +
            ': ' +
            core.definitions.find((d) => d.key === key).label,
        );
        if (hasInk(crop)) {
          try {
            let text;
            const numeric = ['suma', 'primaExcedente', 'telefono'].includes(key);
            if (zone.mode === 'hand' && !handUnavailable) {
              try {
                text = await readHand(crop, id);
              } catch (error) {
                if (id !== generation) return;
                handUnavailable = true;
                partial = true;
              }
            }
            await reader.setParameters({
              tessedit_pageseg_mode: '7',
              tessedit_char_whitelist: numeric ? '0123456789., ' : '',
            });
            const prepared = window.MetlifeTemplate.prepareWriting(
              crop.getContext('2d').getImageData(0, 0, crop.width, crop.height),
            );
            const clean = document.createElement('canvas');
            clean.width = prepared.width;
            clean.height = prepared.height;
            clean
              .getContext('2d')
              .putImageData(new ImageData(prepared.data, prepared.width, prepared.height), 0, 0);
            const fast = (await reader.recognize(clean)).data.text;
            if (id !== generation) return;
            readingChecks[key] = core.reconcileReadings(key, text, fast);
            values[key] = readingChecks[key].value;
          } catch {
            if (id !== generation) return;
            partial = true;
          }
        }
        const input = el('scan-' + key);
        if (input) input.value = values[key];
      }
      showReview(values);
      const seconds = Math.round((performance.now() - started) / 1000);
      status(
        (detectedTemplate ? 'Formato Protección Futura 20. ' : '') +
          'Lectura terminada en ' +
          seconds +
          ' s. ' +
          (partial ? 'Algunas zonas necesitaron lectura rápida o quedaron pendientes. ' : '') +
          (result.warning || 'Revisa cada dato antes de pasarlo al formulario.'),
        true,
      );
    } catch (error) {
      if (id === generation) {
        showReview(values);
        status('No se completó la lectura. Puedes revisar lo recuperado. ' + error.message, true);
      }
    } finally {
      finish(id);
    }
  }
  function proofFor(key) {
    if (proofs[key]) return proofs[key];
    if (!canvas) return null;
    let rect;
    if (key === 'negocio' && detectedTemplate)
      rect = window.MetlifeTemplate.transformRect(
        detectedTemplate.matrix,
        [349, 230, 420, 70],
        canvas.width,
        canvas.height,
      );
    else {
      const zone = regions.find((r) => r.key === key)?.rect;
      if (zone)
        rect = {
          left: zone.left / canvas.width,
          top: zone.top / canvas.height,
          width: zone.width / canvas.width,
          height: zone.height / canvas.height,
        };
    }
    return (proofs[key] = {
      src:
        rect && validRect(rect)
          ? cropImage(rect).toDataURL('image/jpeg', 0.9)
          : $('#documentPreview').src,
      full: !rect,
    });
  }
  function proofButton(key, label) {
    const proof = proofFor(key);
    if (!proof) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'proof-button';
    button.setAttribute('aria-label', 'Ampliar foto: ' + label);
    const img = document.createElement('img');
    img.src = proof.src;
    img.alt = 'Documento: ' + label;
    const caption = document.createElement('span');
    caption.textContent = proof.full ? 'Ver hoja completa' : 'Ampliar ' + label.toLowerCase();
    button.append(img, caption);
    button.onclick = () => {
      $('#scanImageTitle').textContent = label;
      $('#scanImageLarge').src = proof.src;
      $('#scanImageDialog').showModal();
    };
    return button;
  }
  function attachFormProofs() {
    document.querySelectorAll('.field-proof').forEach((node) => node.remove());
    for (const field of fields) {
      const keys = field.key === 'nombre' ? ['paterno', 'materno', 'nombres'] : [field.key];
      if (!keys.some((key) => reviewDefs.some((d) => d.key === key))) continue;
      const box = document.createElement('div');
      box.className = 'field-proof';
      for (const key of keys) {
        const def = reviewDefs.find((d) => d.key === key);
        if (def) {
          const button = proofButton(key, def.label);
          if (button) box.append(button);
        }
      }
      el(field.key).closest('.field').append(box);
    }
  }
  function showReview(values) {
    const fragment = document.createDocumentFragment();
    reviewDefs.forEach((def) => {
      const box = document.createElement('div');
      box.className = 'scan-review-field';
      const label = document.createElement('label');
      label.htmlFor = 'scan-' + def.key;
      label.textContent = def.label;
      const input = document.createElement(def.key === 'negocio' ? 'select' : 'input');
      input.id = 'scan-' + def.key;
      if (def.key === 'negocio')
        for (const value of ['', 'NUEVA', 'INCREMENTO', 'INCLUSION']) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent =
            value === 'NUEVA'
              ? 'PÓLIZA NUEVA'
              : value === 'INCLUSION'
                ? 'INCLUSIÓN'
                : value || 'REVISAR CASILLA';
          input.append(option);
        }
      else input.type = 'text';
      input.value = values[def.key] || '';
      input.autocomplete = 'off';
      box.append(label, input);
      if (def.source) {
        const source = document.createElement('small');
        source.textContent = def.source;
        box.append(source);
      }
      const hint = document.createElement('small');
      hint.textContent = input.value
        ? 'Lectura sugerida: comprueba con la foto.'
        : def.key === 'vendida'
          ? 'Si no se distingue el nombre, escríbelo manualmente.'
          : 'Sin lectura: puede estar vacío o ser ilegible.';
      if (
        (def.key === 'correo' && input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) ||
        (def.key === 'telefono' && input.value && input.value.length !== 10)
      ) {
        hint.textContent = 'Revisa este dato: el formato leído no parece completo.';
        hint.className = 'scan-doubt';
      }
      box.append(hint);
      const check = readingChecks[def.key];
      if (check?.doubt) {
        hint.textContent =
          'Los lectores no coinciden. Comprueba la escritura en el recorte y elige o corrige el dato.';
        hint.className = 'scan-doubt';
        for (const candidate of check.candidates) {
          const choose = document.createElement('button');
          choose.type = 'button';
          choose.className = 'secondary scan-candidate';
          choose.textContent = 'Usar: ' + candidate;
          choose.onclick = () => {
            input.value = candidate;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            hint.textContent = 'Seleccionado por ti. Revisa antes de pasar al formulario.';
          };
          box.append(choose);
        }
      }
      if (def.key !== 'negocio') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'link-btn read-zone';
        button.textContent = 'Leer zona';
        button.onclick = () => openCrop(def);
        box.append(button);
      }
      const photo = proofButton(def.key, def.label);
      if (photo) {
        const proof = document.createElement('div');
        proof.className = 'scan-proof';
        proof.append(photo);
        box.append(proof);
      }
      fragment.append(box);
    });
    $('#scanReviewFields').replaceChildren(fragment);
    $('#scanReview').classList.remove('hidden');
    reviewReady = true;
  }
  function reviewed() {
    const values = {};
    reviewDefs.forEach((def) => (values[def.key] = el('scan-' + def.key)?.value || ''));
    return core.valuesToForm(values);
  }
  function approveReplace() {
    return (
      !fields.some((f) => $('#' + f.key).value) ||
      confirm(
        '¿Reemplazar el formulario con esta lectura? Los campos que completarás manualmente quedarán vacíos.',
      )
    );
  }
  function applyReview() {
    if (busy || !reviewReady || !approveReplace()) return;
    const values = reviewed();
    clearForm();
    fields.forEach((f) => setField(f.key, values[f.key] || '', false, 'Escaneado'));
    attachFormProofs();
    saveDraft();
    checkDuplicate();
    $('#clientForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#poliza').focus({ preventScroll: true });
    showToast(
      'Lectura incorporada',
      'Revisa los datos y completa los campos manuales antes de guardar.',
    );
  }
  function textReview() {
    if (busy || !reviewReady || !approveReplace()) return;
    const values = reviewed();
    clearForm();
    // Explicitly include every column, including empty and final values.
    $('#importText').value = fields
      .map((f) => (f.key === 'nombre' ? 'NOMBRE' : f.label) + ': ' + (values[f.key] || ''))
      .join('\n');
    $('#importBody').style.display = 'block';
    $('#toggleImport').textContent = 'Ocultar';
    saveDraft();
    $('#importText').focus();
    $('#importText').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Texto listo', 'Pulsa Completar formulario para incorporar la lectura.');
  }
  function drawCrop() {
    const display = $('#cropCanvas'),
      context = display.getContext('2d');
    context.drawImage(canvas, 0, 0, display.width, display.height);
    if (cropRect) {
      context.strokeStyle = '#00a88f';
      context.lineWidth = 3;
      context.fillStyle = 'rgba(0,168,143,.15)';
      context.fillRect(
        cropRect.left * display.width,
        cropRect.top * display.height,
        cropRect.width * display.width,
        cropRect.height * display.height,
      );
      context.strokeRect(
        cropRect.left * display.width,
        cropRect.top * display.height,
        cropRect.width * display.width,
        cropRect.height * display.height,
      );
    }
  }
  function syncCropInputs() {
    for (const key of ['left', 'top', 'width', 'height'])
      el('crop' + key[0].toUpperCase() + key.slice(1)).value = (cropRect[key] * 100).toFixed(1);
  }
  function openCrop(def) {
    if (busy || !canvas) return;
    cropKey = def.key;
    $('#cropTitle').textContent = 'Leer zona: ' + def.label;
    $('#cropStatus').textContent = '';
    const suggested = regions.find((r) => r.key === def.key)?.rect;
    cropRect =
      !detectedTemplate &&
      validRect(zones[def.key]?.rect) &&
      Math.abs((zones[def.key].aspect || 0) - canvas.width / canvas.height) < 0.06
        ? { ...zones[def.key].rect }
        : suggested
          ? {
              left: suggested.left / canvas.width,
              top: suggested.top / canvas.height,
              width: suggested.width / canvas.width,
              height: suggested.height / canvas.height,
            }
          : { left: 0.1, top: 0.1, width: 0.7, height: 0.08 };
    const display = $('#cropCanvas');
    display.width = Math.min(1000, canvas.width);
    display.height = Math.round((display.width * canvas.height) / canvas.width);
    syncCropInputs();
    drawCrop();
    $('#scanCropDialog').showModal();
  }
  function point(event) {
    const rect = $('#cropCanvas').getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }
  $('#cropCanvas').onpointerdown = (event) => {
    if (busy) return;
    dragStart = point(event);
    $('#cropCanvas').setPointerCapture(event.pointerId);
  };
  $('#cropCanvas').onpointermove = (event) => {
    if (!dragStart || busy) return;
    const p = point(event);
    cropRect = {
      left: Math.min(p.x, dragStart.x),
      top: Math.min(p.y, dragStart.y),
      width: Math.abs(p.x - dragStart.x),
      height: Math.abs(p.y - dragStart.y),
    };
    syncCropInputs();
    drawCrop();
  };
  $('#cropCanvas').onpointerup = () => {
    dragStart = null;
  };
  $('#cropCanvas').onpointercancel = () => {
    dragStart = null;
  };
  for (const key of ['Left', 'Top', 'Width', 'Height'])
    el('crop' + key).oninput = () => {
      if (busy) return;
      const values = {};
      for (const name of ['Left', 'Top', 'Width', 'Height'])
        values[name.toLowerCase()] = Number(el('crop' + name).value) / 100;
      if (validRect(values)) {
        cropRect = values;
        drawCrop();
      }
    };
  async function readCrop(mode) {
    if (busy || !validRect(cropRect)) return;
    const id = startJob(240000);
    $('#cropStatus').textContent =
      mode === 'hand' ? 'Preparando lector de letra a mano…' : 'Leyendo zona…';
    try {
      const crop = cropImage(cropRect);
      let text,
        fast = '';
      if (hasInk(crop)) {
        if (mode === 'hand') text = await readHand(crop, id);
        {
          const reader = await getReader(id);
          await reader.setParameters({
            tessedit_pageseg_mode: '7',
            tessedit_char_whitelist: ['suma', 'primaExcedente', 'telefono'].includes(cropKey)
              ? '0123456789., '
              : '',
          });
          fast = (await reader.recognize(crop)).data.text;
        }
      }
      if (id !== generation) return;
      readingChecks[cropKey] = core.reconcileReadings(cropKey, text, fast);
      el('scan-' + cropKey).value = readingChecks[cropKey].value;
      proofs[cropKey] = { src: crop.toDataURL('image/jpeg', 0.9), full: false };
      const current = Object.fromEntries(
        reviewDefs.map((def) => [def.key, el('scan-' + def.key).value]),
      );
      showReview(current);
      let zoneSaved = true;
      if ($('#rememberScanZones').checked) {
        try {
          await window.metlifeCloud.saveZone(cropKey, {
            rect: { ...cropRect },
            mode,
            aspect: canvas.width / canvas.height,
            ...(detectedTemplate
              ? {
                  template: detectedTemplate.id,
                  templateRect: window.MetlifeTemplate.toReference(
                    cropRect,
                    detectedTemplate,
                    canvas.width,
                    canvas.height,
                  ),
                }
              : {}),
          });
        } catch {
          zoneSaved = false;
        }
      }
      $('#scanCropDialog').close();
      status(
        zoneSaved
          ? 'Zona leída. Si elegiste recordarla, ya está disponible en la nube para los otros dispositivos. Revisa el resultado.'
          : 'Zona leída, pero su posición no se guardó en la nube. Revisa internet y vuelve a guardarla.',
        true,
      );
    } catch (error) {
      if (id === generation) $('#cropStatus').textContent = error.message;
    } finally {
      finish(id);
    }
  }
  $('#openCameraBtn').onclick = openCamera;
  $('#closeCameraBtn').onclick = stopCamera;
  $('#documentVideo').onloadeddata = () => {
    if (stream) $('#captureDocumentBtn').disabled = false;
  };
  $('#captureDocumentBtn').onclick = () => {
    const video = $('#documentVideo');
    if (!video.videoWidth || busy) return;
    generation++;
    canvas = makeCanvas(video, video.videoWidth, video.videoHeight);
    stopCamera();
    showPreview();
  };
  $('#uploadDocumentBtn').onclick = () => $('#documentFile').click();
  for (const id of ['documentFile', 'cameraFile'])
    el(id).onchange = (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      loadPhoto(file);
    };
  $('#rotateDocumentBtn').onclick = () => {
    if (!canvas || busy) return;
    generation++;
    const rotated = document.createElement('canvas');
    rotated.width = canvas.height;
    rotated.height = canvas.width;
    const context = rotated.getContext('2d');
    context.translate(rotated.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(canvas, 0, 0);
    canvas = rotated;
    showPreview();
  };
  $('#removeDocumentBtn').onclick = () => {
    if (busy) return;
    generation++;
    canvas = null;
    $('#documentPreview').removeAttribute('src');
    $('#documentPreviewPanel').classList.add('hidden');
    clearReview();
    status('Toma una foto o selecciona una imagen para comenzar.');
  };
  $('#analyzeDocumentBtn').onclick = analyze;
  $('#cancelScanBtn').onclick = () => cancel();
  $('#applyScanBtn').onclick = applyReview;
  $('#scanTextBtn').onclick = textReview;
  $('#readCropBtn').onclick = () => readCrop('hand');
  $('#readCropFastBtn').onclick = () => readCrop('fast');
  $('#closeCropBtn').onclick = () => {
    if (busy) cancel();
    $('#scanCropDialog').close();
  };
  $('#scanCropDialog').addEventListener('cancel', () => {
    if (busy) cancel();
  });
  $('#forgetScanZones').onclick = async () => {
    try {
      await window.metlifeCloud.clearZones();
      status('Las zonas se quitaron de la nube. Puedes definirlas de nuevo con Leer zona.');
    } catch (error) {
      status(error.message, true);
    }
  };
  $('#cameraSelect').onchange = (event) => openCamera(event.target.value);
  $('#nativeCameraBtn').onclick = () => $('#cameraFile').click();
  $('#closeScanImage').onclick = () => $('#scanImageDialog').close();
  window.addEventListener('metlife:form-reset', () => {
    document.querySelectorAll('.field-proof').forEach((node) => node.remove());
    $('#scanImageDialog').close();
    $('#scanImageLarge').removeAttribute('src');
  });
  window.addEventListener('metlife:scan-next', () => {
    if (busy) cancel();
    $('#removeDocumentBtn').click();
    openCamera();
    $('#scanTitle').scrollIntoView({ behavior: 'smooth' });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
  });
  window.addEventListener('pagehide', () => {
    stopCamera();
    cancel();
    canvas = null;
  });
})();
