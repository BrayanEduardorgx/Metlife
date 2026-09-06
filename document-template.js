/* Geometry only: no names, policy numbers or photographs are bundled. */
(function (root) {
  'use strict';
  const reference = { width: 1200, height: 1600 };
  const anchors = {
    poliza: [920.5, 254.5],
    paterno: [231, 354.5],
    materno: [645, 343.5],
    nombres: [1014.5, 324.5],
    telefono: [125, 427.5],
    correo: [447.5, 419.5],
    trabajo: [686.5, 472.5],
    suma: [232, 711],
    comunidad: [347.5, 1547.5],
    footerDate: [373.5, 1546],
  };
  const areas = {
    vendida: [430, 137, 414, 94],
    poliza: [970, 234, 169, 40],
    paterno: [104, 290, 236, 54],
    materno: [514, 276, 240, 59],
    nombres: [811, 275, 329, 43],
    curp: [144, 365, 325, 39],
    rfc: [519, 358, 242, 44],
    telefono: [160, 403, 202, 38],
    correo: [477, 390, 320, 42],
    trabajo: [772, 449, 426, 36],
    suma: [166, 717, 150, 30],
    primaExcedente: [275, 968, 90, 39],
    comunidad: [144, 1489, 582, 51],
  };
  const boxes = {
    NUEVA: [359, 253, 21, 21],
    INCREMENTO: [514, 247, 22, 23],
    INCLUSION: [662, 242, 23, 23],
  };
  const point = (matrix, x, y) => ({
    x: matrix[0] * x + matrix[1] * y + matrix[2],
    y: matrix[3] * x + matrix[4] * y + matrix[5],
  });
  function solve(rows, values) {
    const m = [0, 1, 2].map((i) => [
      ...[0, 1, 2].map((j) => rows.reduce((s, r) => s + r[i] * r[j], 0)),
      rows.reduce((s, r, k) => s + r[i] * values[k], 0),
    ]);
    for (let i = 0; i < 3; i++) {
      let pivot = i;
      for (let j = i + 1; j < 3; j++) if (Math.abs(m[j][i]) > Math.abs(m[pivot][i])) pivot = j;
      if (Math.abs(m[pivot][i]) < 1e-9) return null;
      [m[i], m[pivot]] = [m[pivot], m[i]];
      const scale = m[i][i];
      for (let k = i; k < 4; k++) m[i][k] /= scale;
      for (let j = 0; j < 3; j++)
        if (j !== i) {
          const factor = m[j][i];
          for (let k = i; k < 4; k++) m[j][k] -= factor * m[i][k];
        }
    }
    return m.map((r) => r[3]);
  }
  function fit(pairs) {
    const rows = pairs.map((p) => [p.from[0] / 1200, p.from[1] / 1600, 1]);
    const x = solve(
        rows,
        pairs.map((p) => p.to[0]),
      ),
      y = solve(
        rows,
        pairs.map((p) => p.to[1]),
      );
    return x && y ? [x[0] / 1200, x[1] / 1600, x[2], y[0] / 1200, y[1] / 1600, y[2]] : null;
  }
  function transformRect(matrix, area, width, height) {
    const [x, y, w, h] = area,
      corners = [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ].map((p) => point(matrix, ...p));
    const left = Math.max(0, Math.min(...corners.map((p) => p.x))),
      top = Math.max(0, Math.min(...corners.map((p) => p.y)));
    return {
      left: left / width,
      top: top / height,
      width: Math.max(0, Math.min(width, Math.max(...corners.map((p) => p.x))) - left) / width,
      height: Math.max(0, Math.min(height, Math.max(...corners.map((p) => p.y))) - top) / height,
    };
  }
  function locate(regions, width, height, words = []) {
    regions = [...regions];
    if (!regions.some((r) => r.key === 'comunidad' && r.label.y0 > height * 0.7)) {
      const date = words.find(
        (w) => /^fecha[:.]?$/i.test(w.text) && w.bbox.y0 > height * 0.8 && w.bbox.x1 < width * 0.65,
      );
      if (date) regions.push({ key: 'footerDate', label: date.bbox });
    }
    const header = words.some((w) => /^incremento$/i.test(w.text) && w.bbox.y0 < height * 0.25);
    const enough = (p) =>
      p.length >= 5 &&
      p.some((v) => ['comunidad', 'footerDate'].includes(v.key)) &&
      (p.some((v) => v.key === 'suma') ||
        (header &&
          p.length >= 6 &&
          ['paterno', 'materno', 'nombres'].every((k) => p.some((v) => v.key === k))));
    // Require landmarks across the complete page, not merely a matching image aspect.
    const pairs = [];
    for (const [key, from] of Object.entries(anchors)) {
      const candidates = regions.filter(
        (r) =>
          r.key === key &&
          (['comunidad', 'footerDate'].includes(key)
            ? r.label.y0 > height * 0.7
            : key === 'suma'
              ? r.label.y0 > height * 0.3 && r.label.y0 < height * 0.65
              : r.label.y0 < height * 0.42),
      );
      if (!candidates.length) continue;
      candidates.sort(
        (a, b) =>
          Math.abs((a.label.y0 + a.label.y1) / 2 / height - from[1] / 1600) -
          Math.abs((b.label.y0 + b.label.y1) / 2 / height - from[1] / 1600),
      );
      const b = candidates[0].label;
      pairs.push({ key, from, to: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] });
    }
    if (!enough(pairs)) return null;
    let best = [];
    for (let a = 0; a < pairs.length - 2; a++)
      for (let b = a + 1; b < pairs.length - 1; b++)
        for (let c = b + 1; c < pairs.length; c++) {
          const matrix = fit([pairs[a], pairs[b], pairs[c]]);
          if (!matrix) continue;
          const inliers = pairs.filter((p) => {
            const v = point(matrix, ...p.from);
            return Math.hypot((v.x - p.to[0]) / width, (v.y - p.to[1]) / height) < 0.017;
          });
          if (inliers.length > best.length) best = inliers;
        }
    if (!enough(best)) return null;
    const matrix = fit(best);
    if (
      !matrix ||
      matrix[0] <= 0 ||
      matrix[4] <= 0 ||
      Math.abs(matrix[1] / matrix[4]) > 0.35 ||
      Math.abs(matrix[3] / matrix[0]) > 0.35
    )
      return null;
    const rects = {};
    for (const [key, area] of Object.entries(areas))
      rects[key] = transformRect(matrix, area, width, height);
    if (Object.values(rects).some((r) => r.width <= 0.01 || r.height <= 0.005)) return null;
    return { id: 'proteccion-futura-20', matrix, rects, matched: best.length };
  }
  function toReference(rect, template, width, height) {
    const m = template.matrix,
      det = m[0] * m[4] - m[1] * m[3];
    if (Math.abs(det) < 1e-8) return null;
    const inverse = [
      m[4] / det,
      -m[1] / det,
      (m[1] * m[5] - m[4] * m[2]) / det,
      -m[3] / det,
      m[0] / det,
      (m[3] * m[2] - m[0] * m[5]) / det,
    ];
    return transformRect(
      inverse,
      [rect.left * width, rect.top * height, rect.width * width, rect.height * height],
      1200,
      1600,
    );
  }
  function hasWriting(image) {
    const { data, width, height } = image,
      hist = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4)
      hist[Math.round((data[i] + data[i + 1] + data[i + 2]) / 3)]++;
    let total = 0,
      background = 255;
    for (let i = 0; i < 256; i++) {
      total += hist[i];
      if (total >= width * height * 0.8) {
        background = i;
        break;
      }
    }
    const threshold = Math.max(45, Math.min(175, background - 45)),
      seen = new Uint8Array(width * height),
      stack = [];
    const dark = (p) => (data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2]) / 3 < threshold;
    for (let seed = 0; seed < seen.length; seed++) {
      if (seen[seed] || !dark(seed)) continue;
      seen[seed] = 1;
      stack.push(seed);
      let count = 0,
        left = width,
        right = 0,
        top = height,
        bottom = 0;
      while (stack.length) {
        const p = stack.pop(),
          x = p % width,
          y = Math.floor(p / width);
        count++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        for (const next of [
          x > 0 ? p - 1 : -1,
          x < width - 1 ? p + 1 : -1,
          y > 0 ? p - width : -1,
          y < height - 1 ? p + width : -1,
        ])
          if (next >= 0 && !seen[next] && dark(next)) {
            seen[next] = 1;
            stack.push(next);
          }
      }
      const w = right - left + 1,
        h = bottom - top + 1;
      if (
        count >= 5 &&
        w >= 2 &&
        h >= Math.max(3, height * 0.13) &&
        !(w > width * 0.5 && h < height * 0.2)
      )
        return true;
    }
    return false;
  }
  function classifyBox(image, rect) {
    const { data, width, height } = image;
    const x0 = Math.max(0, Math.floor(rect.left * width)),
      y0 = Math.max(0, Math.floor(rect.top * height));
    const w = Math.max(1, Math.round(rect.width * width)),
      h = Math.max(1, Math.round(rect.height * height));
    // Ignore the blue printed border and inspect the inner portion for pen strokes.
    let ink = 0,
      total = 0;
    for (let y = y0 + Math.ceil(h * 0.22); y < Math.min(height, y0 + h * 0.78); y++)
      for (let x = x0 + Math.ceil(w * 0.22); x < Math.min(width, x0 + w * 0.78); x++) {
        const i = (y * width + x) * 4,
          r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        total++;
        if ((r + g + b) / 3 < 125) ink++;
      }
    return total ? ink / total : 0;
  }
  function readBoxes(image, template) {
    const scores = Object.entries(boxes).map(([value, area]) => ({
      value,
      score: classifyBox(image, transformRect(template.matrix, area, image.width, image.height)),
    }));
    const marked = scores.filter((s) => s.score >= 0.09).map((s) => s.value);
    return {
      value: marked[0] || '',
      marked,
      scores,
      warning:
        marked.length > 1
          ? 'Hay varias casillas marcadas; se eligió la primera. Revisa NEGOCIO.'
          : marked.length
            ? ''
            : 'No se distingue una marca en las casillas; revisa NEGOCIO.',
    };
  }
  const api = {
    toReference,
    hasWriting,
    locate,
    readBoxes,
    classifyBox,
    transformRect,
    reference,
    areas,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetlifeTemplate = api;
})(typeof window !== 'undefined' ? window : globalThis);
