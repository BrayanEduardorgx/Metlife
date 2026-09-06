(function () {
  const queue = [];
  let active = null,
    worker = null,
    serial = 0,
    timer = null;
  function status(message) {
    const panel = document.getElementById('excelTaskStatus');
    if (!panel) return;
    panel.hidden = !active;
    document.getElementById('excelTaskMessage').textContent = message || '';
  }
  function finish(error, data) {
    clearTimeout(timer);
    if (error) {
      worker?.terminate();
      worker = null;
    }
    const job = active;
    active = null;
    status('');
    if (job) {
      if (error) job.reject(error);
      else job.resolve(data);
    }
    start();
  }
  function start() {
    if (active || !queue.length) return;
    active = queue.shift();
    status('Preparando Excel en segundo plano…');
    try {
      if (!worker) worker = new Worker('excel-worker.js');
      worker.onerror = () =>
        finish(
          Error('No se pudo iniciar el generador Excel. Recarga la página y vuelve a intentarlo.'),
        );
      worker.onmessage = ({ data }) => {
        if (!active || data.id !== active.id) return;
        if (data.progress) status(data.progress);
        else finish(data.error ? Error(data.error) : null, data.data);
      };
      timer = setTimeout(
        () =>
          finish(Error('El Excel tardó demasiado en generarse. Inténtalo con menos registros.')),
        120000,
      );
      worker.postMessage({ id: active.id, headers: active.headers, rows: active.rows });
    } catch (error) {
      finish(error);
    }
  }
  window.metlifeExcel = {
    generate(headers, rows) {
      return new Promise((resolve, reject) => {
        queue.push({ id: ++serial, headers, rows, resolve, reject });
        start();
      });
    },
    get busy() {
      return !!active || !!queue.length;
    },
    cancel() {
      if (active)
        finish(Error('Generación de Excel cancelada. Los registros siguen guardados en la nube.'));
    },
  };
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('cancelExcelTask').onclick = () => window.metlifeExcel.cancel();
  });
})();
