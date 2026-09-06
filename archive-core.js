(function (root) {
  const keys = (
    root.MetlifeFields ||
    (typeof require === 'function' ? require('./modules/field-schema.js') : null)
  ).keys;
  const rowsFor = (list) => list.map((r) => keys.map((k) => String(r[k] ?? '')));
  function fingerprint(list) {
    let a = 2166136261,
      b = 5381;
    const text = JSON.stringify(
      list.map((r) => [r._id || '', ...keys.map((k) => String(r[k] ?? ''))]),
    );
    for (let i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return (
      list.length + ':' + text.length + ':' + (a >>> 0).toString(16) + ':' + (b >>> 0).toString(16)
    );
  }
  const api = { keys, rowsFor, fingerprint };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MetlifeArchiveCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
