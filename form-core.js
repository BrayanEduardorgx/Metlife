(function (root) {
  const plain = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  function normalize(value, key) {
    if (key === 'correo') return plain(value).toLowerCase().replace(/\s/g, '');
    return String(value ?? '').toLocaleUpperCase('es-MX');
  }
  function prefix(value) {
    return normalize(value, 'rfc').replace(/\s/g, '').slice(0, 10);
  }
  function issues(item, fields) {
    const result = [];
    for (const f of fields) {
      const v = String(item[f.key] || '').trim();
      let reason = '';
      if ((f.required || ['rfc', 'curp'].includes(f.key)) && !v) reason = 'sin datos';
      else if (v) {
        if (f.key === 'nombre' && v.split(/\s+/).length < 3)
          reason = 'revisa que incluya apellidos y nombres';
        if (f.key === 'rfc' && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v))
          reason = 'incompleto o con formato por revisar';
        if (f.key === 'curp' && !/^[A-ZÑ]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(v))
          reason = 'incompleta o con formato por revisar';
        if (f.key === 'telefono' && !/^\d{10}$/.test(v)) reason = 'se esperan 10 dígitos';
        if (f.key === 'correo' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
          reason = 'dirección incompleta';
        if (
          ['money', 'decimal'].includes(f.type) &&
          (!/^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, '')) || Number(v.replace(/,/g, '')) < 0)
        )
          reason = 'importe por revisar';
        if (f.key === 'fecha') {
          const [d, m, y] = v.split('/').map(Number),
            date = new Date(y, m - 1, d);
          if (
            !/^\d{2}\/\d{2}\/\d{4}$/.test(v) ||
            date.getFullYear() !== y ||
            date.getMonth() !== m - 1 ||
            date.getDate() !== d
          )
            reason = 'fecha inválida';
        }
      }
      if (reason) result.push({ key: f.key, message: f.label + ': ' + reason });
    }
    return result;
  }
  function insert(value, spoken, position, words) {
    const before = value.slice(0, position),
      after = value.slice(position);
    const addition =
      (words && before && !/\s$/.test(before) ? ' ' : '') +
      spoken +
      (words && after && !/^\s/.test(after) ? ' ' : '');
    return { value: before + addition + after, position: before.length + addition.length };
  }
  function spokenNumber(value) {
    const words = plain(value)
      .toLowerCase()
      .replace(/pesos?|centavos?/g, '')
      .trim();
    if (/\d/.test(words))
      return words
        .replace(/\b(punto|coma|con)\b/g, '.')
        .replace(/,(?=\d{3}(?:\D|$))/g, '')
        .replace(/,/g, '.')
        .replace(/[^\d.]/g, '');
    const units = {
      cero: 0,
      un: 1,
      uno: 1,
      una: 1,
      dos: 2,
      tres: 3,
      cuatro: 4,
      cinco: 5,
      seis: 6,
      siete: 7,
      ocho: 8,
      nueve: 9,
      diez: 10,
      once: 11,
      doce: 12,
      trece: 13,
      catorce: 14,
      quince: 15,
      dieciseis: 16,
      diecisiete: 17,
      dieciocho: 18,
      diecinueve: 19,
      veinte: 20,
      veintiuno: 21,
      veintidos: 22,
      veintitres: 23,
      veinticuatro: 24,
      veinticinco: 25,
      veintiseis: 26,
      veintisiete: 27,
      veintiocho: 28,
      veintinueve: 29,
      treinta: 30,
      cuarenta: 40,
      cincuenta: 50,
      sesenta: 60,
      setenta: 70,
      ochenta: 80,
      noventa: 90,
      cien: 100,
      ciento: 100,
      doscientos: 200,
      trescientos: 300,
      cuatrocientos: 400,
      quinientos: 500,
      seiscientos: 600,
      setecientos: 700,
      ochocientos: 800,
      novecientos: 900,
    };
    function integer(text) {
      let total = 0,
        group = 0,
        found = false;
      for (const word of text.trim().split(/\s+/)) {
        if (word === 'y' || !word) continue;
        if (word in units) {
          group += units[word];
          found = true;
        } else if (word === 'mil') {
          total += (group || 1) * 1000;
          group = 0;
          found = true;
        } else if (['millon', 'millones'].includes(word)) {
          total = (total + group || 1) * 1000000;
          group = 0;
          found = true;
        } else return null;
      }
      return found ? total + group : null;
    }
    const parts = words.split(/\s+(?:punto|coma|con)\s+/),
      whole = integer(parts[0]);
    if (whole === null) return '';
    if (!parts[1]) return String(whole);
    const fraction = integer(parts[1]);
    if (fraction === null) return '';
    const tokens = parts[1].trim().split(/\s+/);
    const decimal = tokens.every((t) => t in units && units[t] < 10)
      ? tokens.map((t) => units[t]).join('')
      : String(fraction).padStart(2, '0');
    return whole + '.' + decimal;
  }
  root.MetlifeFormCore = { normalize, prefix, issues, insert, spokenNumber };
  if (typeof module !== 'undefined') module.exports = root.MetlifeFormCore;
})(typeof window === 'undefined' ? globalThis : window);
