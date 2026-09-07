# Escaneo gratuito y búsqueda

El OCR se ejecuta en el navegador con Tesseract.js 6.0.1 (español). No usa una API de pago, no se envían imágenes a Gemini/OpenAI y no se guardan fotografías. Se descargan bibliotecas y modelos públicos. La cámara se detiene al capturar, cerrar o salir de la página.

## Uso

1. Abrir cámara o subir JPG, PNG o WebP (hasta 20 MB).
2. Revisar la orientación y pulsar Analizar documento. Letra a mano por zonas es la opción predeterminada y sigue siendo experimental.
3. El formato Protección Futura 20 se reconoce por varias etiquetas impresas distribuidas en la hoja. Se ajustan las zonas de escritura y las tres casillas superiores. Las etiquetas sirven para ubicar los datos, no para rellenarlos. Si no hay suficientes referencias, se usan las zonas recordadas compatibles o se pide seleccionar zonas manualmente.
4. Para una línea que faltó, pulsar Leer zona, seleccionar SOLO la escritura y elegir Lectura rápida o Leer letra a mano.
5. Si está marcada Recordar las zonas, se guarda en Firebase únicamente la geometría del recorte (sin imagen ni texto), compartida entre dispositivos. Las siguientes fotografías completas, derechas y del mismo formato/aspecto reutilizan esos recortes.
6. Pasar al formulario o al cuadro Autollenar con texto. Nada se guarda como registro hasta pulsar Guardar registro.

La lectura por zonas usa Transformers.js 2.17.2 y Xenova/trocr-small-handwritten en un Web Worker. Es experimental: el modelo de Microsoft fue ajustado para líneas manuscritas en inglés, no para pólizas mexicanas completas. La descarga inicial puede ser grande y la velocidad depende del dispositivo. No garantiza RFC, CURP, correos, números ni nombres correctos. El OCR clásico tampoco garantiza lectura de manuscritos.

En Protección Futura 20, las casillas se leen buscando tinta en el interior de sus recuadros, sin contar el borde impreso. Si hay varias marcas se elige la primera y aparece un aviso. En otros formatos se usan marcas explícitas del texto OCR. NEGOCIO queda vacío si no se distingue una marca. Sombras, fotografías inclinadas y trazos tenues pueden causar errores.

## Reglas de campos

La revisión sigue el orden del formulario: póliza; apellido paterno, materno y nombres; negocio; suma; prima excedente; vendida; teléfono; fecha; RFC; CURP; correo; trabajo; comunidad. Los campos manuales mantienen sus posiciones en el formulario y Excel.

VENDIDA se intenta extraer de la zona superior de la hoja, encima de las casillas, sin exigir un color de tinta concreto. El valor es opcional en la lectura: se puede corregir o completar manualmente. Nunca se incluye un nombre fijo en la plantilla.

- Póliza: N.º de póliza; vacía si no se leyó contenido.
- Nombre: apellido paterno + apellido materno + nombres. La búsqueda conserva este orden, ignora mayúsculas, espacios repetidos y acentos.
- Suma: Suma asegurada básica (BAS).
- Prima excedente, celular, RFC, CURP, email y nombre de la empresa: sus apartados respectivos.
- Comunidad: texto de Lugar y fecha, retirando la fecha si se reconoce su separación.
- Fecha: únicamente la fecha de solicitud en Lugar y fecha al pie; se convierte a día/mes/año. No se toma la fecha de nacimiento.
- PRIMA, MEDIO y TALÓN/CUENTA comienzan vacíos y pueden completarse manualmente en la misma revisión. Al pasar al formulario se conservan. ESTATUS permanece deshabilitado y vacío. No se toman sueldo, otras coberturas ni beneficiarios.

Los recortes para lectura se aclaran y se eliminan márgenes blancos; la evidencia visible conserva la foto original. También se intenta leer manuscritos en los campos numéricos. Se compara la lectura manuscrita con Tesseract por zona. Cuando difieren, se muestran un aviso y botones para elegir las alternativas y el campo queda vacío hasta revisarlo, incluidos nombres y apellidos. Coincidir no garantiza exactitud: siempre hay que comprobar con el recorte. No se reconstruyen letras ilegibles a partir de otros campos ni se incorporan valores fijos del ejemplo.

La revisión comparte formato y dictado con el formulario normal: importes, fecha DD/MM/AAAA, teléfono de diez dígitos, correo sin acentos y sugerencias Gmail/Hotmail. El dictado inserta en el cursor y conserva el texto anterior. Cada campo editable permite vaciarlo; los campos de opciones usan selectores. RFC/CURP ofrecen el prefijo de diez caracteres del otro campo sin aplicarlo automáticamente. Los datos incompletos muestran avisos y pueden conservarse. Enter avanza y Shift+Enter retrocede; Ctrl+G en la revisión pasa los datos al formulario para continuar su guardado habitual. La búsqueda desde póliza, teléfono o un componente del nombre abre el cliente de la nube en el formulario normal, conservando la revisión del escaneo. No guarda ni elimina registros al pulsar Vaciar.

La lupa busca en todos los registros recibidos de la nube, incluidos otros lotes del historial. Una coincidencia se carga; varias muestran una lista paginada; ninguna muestra aviso naranja. Recuperar no modifica el registro original ni guarda automáticamente otro.

## Validación y límites

Pruebas: `npm run check` y `npm run test:browser`. Se calibró la geometría con la foto proporcionada en el proyecto. La prueba privada `.qa/sample-browser.cjs` usa esa foto contra una base de datos simulada, nunca contra los registros reales. Comprueba alineación, casilla marcada, revisión, selección de candidatos y campos manuales. La lectura manuscrita por zonas con comparación tardó aproximadamente 52 segundos en la computadora de prueba, sin errores de ejecución. La transcripción completa NO está validada como precisa: persisten campos vacíos y caracteres incorrectos, especialmente códigos, importes y escritura cursiva. Se probó también un modelo mayor y se descartó porque empeoró los resultados. La comprobación de funcionamiento no equivale a exactitud de transcripción. Los tiempos dependen del equipo y de la descarga inicial.

Fuentes: https://github.com/naptha/tesseract.js/blob/master/docs/api.md ; https://huggingface.co/Xenova/trocr-small-handwritten ; https://huggingface.co/microsoft/trocr-small-handwritten

## Plantilla y privacidad de la referencia

`document-template.js` contiene únicamente coordenadas y reglas, sin transcripciones ni fotografías. Firebase Hosting excluye `ejemplo poliza.jpeg`, `ejemplos/**`, `**/ejemplo*` y `.qa/**`. No se publica el ejemplo ni las salidas de prueba. Las correcciones de zonas del formato se guardan respecto de la plantilla y se ajustan a las referencias de cada nueva foto; las zonas antiguas absolutas se siguen usando en el lector general. El municipio procede de Lugar y fecha al pie, nunca del lugar de nacimiento. Se omiten fecha y abreviatura Ver. cuando se reconocen.
