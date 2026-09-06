(function (root) {
  const read = (tree, path) =>
    path
      .split('/')
      .filter(Boolean)
      .reduce((v, k) => v?.[k], tree) ?? null;
  const cmp = (a, b) =>
    a === b
      ? 0
      : a == null
        ? -1
        : b == null
          ? 1
          : typeof a === 'number' && typeof b === 'number'
            ? a - b
            : String(a) < String(b)
              ? -1
              : 1;
  function select(value, q = {}) {
    if (!q.order) return value;
    let rows = Object.entries(value || {}).map(([key, value]) => ({
      key,
      value,
      sort: q.order === 'key' ? key : read(value, q.order),
    }));
    rows.sort((a, b) => cmp(a.sort, b.sort) || cmp(a.key, b.key));
    rows = rows.filter(
      (r) =>
        (q.equal === undefined || cmp(r.sort, q.equal) === 0) &&
        (q.start === undefined || cmp(r.sort, q.start) >= 0) &&
        (q.after === undefined ||
          cmp(r.sort, q.after) > 0 ||
          (cmp(r.sort, q.after) === 0 && q.afterKey !== undefined && cmp(r.key, q.afterKey) > 0)) &&
        (q.end === undefined || cmp(r.sort, q.end) <= 0),
    );
    if (q.first) rows = rows.slice(0, q.first);
    if (q.last) rows = rows.slice(-q.last);
    return rows.length ? Object.fromEntries(rows.map((r) => [r.key, r.value])) : null;
  }
  const api = { read, select };
  if (typeof module !== 'undefined') module.exports = api;
  else root.QAQuery = api;
})(typeof window !== 'undefined' ? window : globalThis);
