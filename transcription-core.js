(function (root) {
  'use strict';
  const keys = [
    'poliza',
    'paterno',
    'materno',
    'nombres',
    'negocio',
    'suma',
    'prima',
    'primaExcedente',
    'medio',
    'vendida',
    'telefono',
    'fecha',
    'rfc',
    'curp',
    'correo',
    'trabajo',
    'comunidad',
    'talon',
  ];
  const instructions = `Transcribe el documento adjunto para llenar un formulario de póliza. Usa el texto impreso solo para localizar cada apartado y extrae los valores escritos a mano. No inventes ni completes letras, cifras, nombres, RFC o CURP. Conserva los datos parciales legibles; si no puedes leer un campo, déjalo vacío y explica la duda en "dudas". Si recibes la hoja completa y recortes, son referencias del MISMO documento: no dupliques registros. Si hay documentos de personas distintas, pide que se envíe uno a la vez.

Reglas de ubicación:
- poliza: N.º de póliza, arriba a la derecha; no confundir con el nombre comercial del formato.
- paterno, materno y nombres: sus tres apartados separados, sin reordenar ni confundir con beneficiarios.
- negocio: solo la casilla marcada: NUEVA, INCREMENTO o INCLUSION. Si hay varias o es dudosa, vacío y una duda.
- suma: solo SUMA ASEGURADA BÁSICA (BAS), sin sumar ni tomar otras coberturas.
- primaExcedente: solo PRIMA EXCEDENTE.
- vendida: nombre manuscrito arriba de las casillas; no es el nombre del cliente.
- telefono, rfc, curp, correo y trabajo: celular, RFC, CURP, email y nombre de la empresa respectivamente.
- comunidad y fecha: Lugar y fecha al PIE del documento, nunca lugar o fecha de nacimiento. Separa municipio y fecha; fecha DD/MM/AAAA.
- prima, medio y talon: vacíos para completarlos manualmente; no usar el descuento al pie como prima. No extraer estatus, sueldo, padecimientos, firma ni beneficiarios.

Devuelve únicamente UN objeto JSON con esta estructura, sin introducción, tablas ni comentarios. Todos los valores de "datos" deben ser textos, incluso teléfonos e importes, para conservar ceros iniciales. Importes sin separador de miles, con punto decimal. Correo en minúsculas y sin acentos. No corrijas nombres por su parecido con otros. Incluye observaciones y alternativas únicamente en "dudas", nunca dentro de los valores:
${JSON.stringify({ datos: Object.fromEntries(keys.map((key) => [key, ''])), dudas: [] }, null, 2)}`;
  function parse(text) {
    const raw = String(text || '')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    if (!raw) throw Error('Pega primero los datos.');
    if (raw.length > 60000)
      throw Error('El texto es demasiado largo. Pega solo la respuesta de un documento.');
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      throw Error(
        'No se reconoció el formato. Copia la respuesta completa, desde la primera { hasta la última }.',
      );
    }
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw Error('Pega los datos de un solo documento.');
    const source = result.datos;
    if (!source || typeof source !== 'object' || Array.isArray(source))
      throw Error(
        'Falta el apartado datos. Usa las instrucciones para obtener el formato correcto.',
      );
    const values = {},
      warnings = [];
    let recognized = 0;
    for (const key of keys) {
      if (!Object.hasOwn(source, key)) continue;
      if (typeof source[key] !== 'string')
        throw Error(
          'El campo ' +
            key +
            ' debe ser texto entre comillas. Así se conservan ceros y datos incompletos.',
        );
      if (source[key].length > 500)
        throw Error('El campo ' + key + ' es demasiado largo. Coloca las observaciones en dudas.');
      values[key] = source[key].trim();
      if (
        values[key] &&
        ['suma', 'prima', 'primaExcedente'].includes(key) &&
        !/^\d+(?:\.\d{1,2})?$/.test(values[key])
      )
        throw Error(
          'Revisa ' +
            key +
            ': usa solo números, sin separador de miles y con punto decimal. Coloca las dudas fuera del importe.',
        );
      if (values[key] && key === 'telefono' && !/^\d+$/.test(values[key]))
        throw Error(
          'Revisa telefono: conserva los dígitos como texto y coloca los caracteres ilegibles en dudas.',
        );
      recognized++;
    }
    if (!recognized || !Object.values(values).some(Boolean))
      throw Error(
        'No hay datos para incorporar. Revisa la respuesta o completa los campos manualmente.',
      );
    if (Object.keys(source).some((key) => !keys.includes(key)))
      warnings.push('Se omitieron campos que no pertenecen al formulario.');
    if (
      result.dudas !== undefined &&
      (!Array.isArray(result.dudas) ||
        result.dudas.some((v) => typeof v !== 'string' || v.length > 1000) ||
        result.dudas.length > 50)
    )
      throw Error('El apartado dudas debe ser una lista de observaciones breves.');
    return { values, doubts: [...warnings, ...(result.dudas || [])] };
  }
  const api = { keys, instructions, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MetlifeTranscription = api;
})(typeof window === 'undefined' ? globalThis : window);
