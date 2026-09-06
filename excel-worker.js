/* SheetJS runs only in this worker, leaving the form responsive. */
importScripts('vendor/xlsx.full.min.js');
self.onmessage = (event) => {
  const { id, headers, rows } = event.data;
  try {
    self.postMessage({ id, progress: 'Preparando ' + rows.length + ' registros…' });
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet['!cols'] = headers.map((title, index) => {
      let width = title.length + 2;
      for (const row of rows) width = Math.max(width, String(row[index] ?? '').length + 2);
      return { wch: Math.min(60, width) };
    });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'REGISTROS');
    self.postMessage({ id, progress: 'Generando archivo Excel…' });
    const data = XLSX.write(book, { bookType: 'xlsx', type: 'base64', compression: true });
    self.postMessage({ id, data });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
