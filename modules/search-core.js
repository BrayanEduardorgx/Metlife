(function (root) {
  const normalize = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  const encode = (value) =>
    Array.from(value)
      .map((c) => c.codePointAt(0).toString(16).padStart(6, '0'))
      .join('');
  function grams(text) {
    const tokens = new Set();
    for (let size = 1; size <= 3; size++)
      for (let i = 0; i <= text.length - size; i++) tokens.add(encode(text.slice(i, i + size)));
    return [...tokens];
  }
  const api = { normalize, encode, grams };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MetlifeSearchCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
