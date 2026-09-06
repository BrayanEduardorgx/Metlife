# MetLife Archivador

Página publicada: https://metlife-6d467.web.app

Mejoras de rendimiento (desarrollo): `history` contiene solo metadatos; los registros exportados y el binario XLSX se consultan bajo demanda en `historyContent/{id}/{version}`. Se mantienen como máximo las dos últimas copias binarias por archivo y una caché en memoria de tres archivos. La migración inicial conserva los archivos existentes. Las versiones de cambios de clientes no se recortan.

Excel se genera en `excel-worker.js` mediante una copia local de SheetJS 0.18.5 (`vendor/`, con su licencia). El formulario permanece disponible y permite cancelar la tarea; no se carga SheetJS en la página principal. La generación se serializa y reutiliza un único worker. Cancelar una exportación no elimina los registros ya guardados.

La lupa de NOMBRE acepta cualquier fragmento, sin distinguir acentos, y TELÉFONO tiene su propia lupa para buscar números completos o parciales. Estas búsquedas recorren páginas del directorio ligero `clientDirectory` y cargan la ficha completa solo para las coincidencias. Póliza, RFC y CURP conservan sus consultas indexadas. El directorio se actualiza con cada edición o eliminación y las actualizaciones pendientes pueden repararse al recuperar la conexión.

«Agregar seleccionados a un Excel» permite incorporar varios clientes al Excel actual, uno nuevo o uno anterior. Presenta resultados parciales si un cliente cambió o pertenece a otro archivo guardado. El filtro «Solo clientes sin Excel guardado» facilita seleccionarlos. Una operación de lote actualiza su Excel al finalizar.

Validación específica: `node .qa/performance-browser.cjs` usa Firebase simulado y un worker/XLSX reales; comprueba la descarga, el contenido de 17 columnas, acentos, ceros iniciales, exclusión de notas, cancelación, búsqueda y operaciones por lotes. `node --test tests/cloud-store.test.cjs` verifica además migración, carga bajo demanda, conservación de versiones binarias y conflictos.

Conservación de clientes (desarrollo): eliminar un Excel del historial o usar «Quitar del Excel» conserva el mismo cliente en la nube. Las búsquedas por póliza o nombre abarcan todos los archivos y los clientes sin Excel. «Eliminar cliente» sí lo envía a la papelera por 3 meses. Los clientes eliminados junto con un archivo por versiones anteriores se recuperan automáticamente al iniciar, cuando su registro y la referencia al archivo todavía existen; las eliminaciones individuales no se revierten.

Los datos recuperados muestran Editar (naranja), Eliminar (rojo) y, si no tienen archivo guardado, Agregar a un Excel. Al actualizar se muestra un aviso persistente con el nombre del archivo afectado o indicando que el registro quedó solo en la nube. Se puede incorporar el mismo registro, sin duplicarlo, al Excel actual, a uno nuevo o a un archivo anterior. Para cambiar de archivo un registro que todavía pertenece a un Excel guardado, primero se usa Quitar del Excel.

Registros recientes muestra inicialmente la actividad de toda la nube, en grupos de 50, con opción Excel actual. Las búsquedas del formulario consultan el índice completo sin depender de esos 50 registros. El historial tiene un botón Actualizar Excel, además de la actualización automática. Los índices de `_activityAt` y `history/batch` están incluidos en `database.rules.json`; el próximo despliegue debe incluir base de datos y hosting.

Prueba de conservación y archivos: `node .qa/client-retention-browser.cjs` (datos y generación XLSX simulados, sin clientes reales).

Cambios del formulario (desarrollo): los avisos de datos incompletos permiten confirmar con un segundo clic en Guardar; cualquier cambio vuelve a activar la revisión. Póliza puede dejarse vacía con «No tengo póliza». RFC y CURP ofrecen su prefijo de hasta 10 caracteres como sugerencia seleccionable. El correo elimina acentos y ofrece Gmail/Hotmail. El dictado inserta texto en el cursor y puede detenerse pulsando de nuevo el micrófono; también está disponible para importes.

«Guardar Excel en historial» conserva los registros y una copia XLSX en Firebase sin descargarla. Requiere conexión y que haya cargado la biblioteca Excel. Una vez archivado, su copia se actualiza automáticamente al agregar, modificar, restaurar o eliminar registros desde la aplicación. Si falla, el formulario muestra el error y permite reintentar. El historial permite ver, modificar, descargar con otro nombre y eliminar. El borrador de edición conserva la referencia al registro para actualizarlo al continuar en otro dispositivo.

El nombre del Excel de destino aparece sobre el formulario. «Notas y opciones de captura» permite escribir notas internas (excluidas del Excel) y activar el resumen antes de guardar. Ctrl + G guarda; Enter avanza entre campos y Shift + Enter retrocede. El dictado muestra el campo activo y un botón Detener. Cada campo indica su origen y cambia a Manual al corregirse. Deshacer recupera la captura anterior a limpiar, vaciar, importar o copiar un cliente. «Nueva póliza de este cliente» conserva identidad y contacto, dejando vacíos los datos de la nueva póliza y sus notas.

Los registros tienen una marca Por revisar basada en los avisos actuales, filtros por fecha, vendedor, negocio, comunidad y revisión, y total de primas de los resultados. «Historial de cambios» conserva versiones desde esta actualización, fecha y usuario de cada modificación; restaurar una versión agrega un cambio nuevo sin borrar las versiones posteriores. Los registros anteriores muestran una versión de referencia en su primera modificación. La aplicación avisa al salir con escrituras pendientes y evita cerrar sesión o cambiar de archivo hasta que se completen.

Pruebas de estas funciones: `node .qa/productivity-browser.cjs` y `node --test tests/cloud-store.test.cjs`. La prueba de navegador usa datos, dictado y XLSX simulados, sin escrituras en producción.

Validación adicional: `node --test tests/form-core.test.cjs` y `node .qa/form-browser.cjs`. Esta última usa Firebase, reconocimiento de voz y generación XLSX simulados; comprueba también la descarga del archivo guardado y su nombre sin escribir datos en producción.

## Uso

Entra desde un celular, tableta o computadora con internet e inicia sesión. No hace falta que la computadora de desarrollo esté encendida.

Los registros y el historial se guardan en Firebase Realtime Database. El archivo abierto y el borrador se sincronizan al entrar con la misma cuenta. Las zonas del escáner son compartidas. No se mantienen copias persistentes de datos de clientes en localStorage.

El escaneo gratuito se ejecuta en cada dispositivo. Permite cámara, carga de imágenes y revisión antes de llenar el formulario. La letra a mano requiere revisión; la descarga inicial del lector puede tardar. Ver docs/escaneo-gratuito.md y docs/sincronizacion.md.

## Desarrollo

node server.mjs

Abrir http://localhost:4173. La autenticación y los datos siguen usando Firebase. El servidor local no es necesario para usar la página publicada.

## Validación

node --test tests/cloud-store.test.cjs tests/document-core.test.cjs tests/document-template.test.cjs

Las pruebas, documentación y herramientas de .qa están excluidas del despliegue.

## Herramientas de captura

Mostrar datos en el formulario permite corregir la lectura y ampliar sus recortes. Guardar y escanear siguiente confirma el registro en la nube antes de reabrir la cámara. Hay avisos de formato, comparación de coincidencias, capturas pendientes, nombres frecuentes de VENDIDA, marcas de copiado y papelera con recuperación durante 3 meses. La búsqueda por póliza o nombre consulta páginas de resultados en la nube.

Prueba funcional: node .qa/workflow-browser.cjs (datos simulados, sin escrituras de clientes en producción). Despliegue: firebase.cmd deploy --only database,hosting --project metlife-6d467.
