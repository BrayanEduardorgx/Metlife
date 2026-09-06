# Trabajo desde otros dispositivos

La página pública se sirve desde Firebase Hosting y no depende de server.mjs ni de una computadora encendida en casa. Cada navegador compatible puede solicitar acceso a su cámara por HTTPS. Se prefiere la cámara trasera, se ofrece selección cuando hay varias y una alternativa de captura nativa o carga de foto.

## Datos en la nube

- records: registros compartidos entre usuarios autorizados, como antes.
- history: solo metadatos del historial, incluido el identificador de versión y la huella de los datos exportados. Cada archivo se escribe por su ID, evitando reemplazar la lista completa desde un dispositivo.
- historyContent/{id}/{version}: copia binaria XLSX y datos exportados. Se lee únicamente al solicitar un archivo. Las actualizaciones conservan la versión actual y la anterior, y un cambio de nombre no sustituye el contenido con una versión obsoleta.
- clientDirectory/{id}: nombre normalizado y teléfono para búsquedas por fragmentos. Contiene datos ligeros y una secuencia para evitar que una escritura atrasada reemplace una proyección más reciente. `_directoryPending` permite reparar proyecciones pendientes al reconectar.
- workspaces/{uid}: archivo abierto y borrador de esa cuenta, con revisión y origen para detectar cambios simultáneos.
- settings/documentZones: coordenadas y modo de lectura compartidos para la misma plantilla.

La aplicación mantiene estos datos en memoria durante la sesión; no guarda nuevas copias de clientes, borradores, historial, lote ni zonas en localStorage. Firebase confirma las escrituras antes de mostrar éxito. Sin conexión, el formulario avisa que la nube está pendiente; mantener la página abierta y recuperar internet permite reintentar. No se promete guardado persistente sin conexión.

Siguen siendo locales únicamente las preferencias visuales, la opción de recordar sesión y los archivos públicos del lector para acelerar futuras lecturas. El OCR corre en el dispositivo que se esté usando, no en la computadora de desarrollo. No se almacenan fotos ni se activan servicios de IA de pago.

## Migración

En el primer acceso se consultan los datos de la nube. Los registros locales sin migración previa se incorporan sin sobrescribir registros existentes. Los registros sin ID obtienen un ID determinista para evitar duplicados si se interrumpe el proceso. Las cachés antiguas ya migradas no restauran registros eliminados de la nube.

Los borradores antiguos distintos al borrador compartido se conservan en workspaces/{uid}/recoveredDrafts y se pueden cargar desde el formulario. Las antiguas copias locales se eliminan después de confirmar la migración.

Las reglas de la base existentes fueron consultadas: requieren autenticación para lectura y escritura. Se conservaron esos permisos; se añadieron índices de búsqueda y validación del esquema de los registros para impedir escrituras antiguas sin índice. Los borradores se organizan por cuenta en la interfaz; las reglas existentes permiten acceso de todos los usuarios autenticados, por lo que no se presenta esta organización como un aislamiento de seguridad entre cuentas.

## Pruebas

node --test tests/cloud-store.test.cjs tests/document-core.test.cjs

La prueba de navegador .qa/cloud-browser.cjs usa dos contextos independientes y un servidor Firebase simulado, exclusivamente con datos sintéticos. Verifica sincronización, conflictos, recarga, búsqueda, cámara, OCR y zonas compartidas. No modifica registros de producción.

## Captura y búsquedas ampliadas

El inicio consulta el archivo activo y los 50 clientes con actividad más reciente mediante el índice `_activityAt`; no suscribe todo el historial de clientes ni los binarios del historial. Póliza usa una consulta por prefijo. Nombre y teléfono recorren páginas de 200 entradas ligeras y devuelven hasta 20 fichas coincidentes, incluyendo registros sin Excel. Esta búsqueda por fragmentos no requiere comenzar por el apellido paterno; su costo crece con el tamaño del directorio. RFC y CURP se comparan por igualdad para detectar coincidencias. Descargar un Excel consulta explícitamente su lote completo y carga la copia binaria si está vigente; en otro caso la genera un worker. La tabla permite elegir Excel actual o actividad de toda la nube; en esta última, Mostrar más amplía la consulta y la selección se limita a los registros cargados.

La migración del esquema añade únicamente metadatos e índices, por páginas de 200 registros y mediante transacciones que preservan cambios concurrentes. Se ejecuta una vez, señalada por settings/searchSchema. Las reglas requieren el esquema nuevo en futuras escrituras de registros: una pestaña antigua debe recargarse antes de guardar.

pendingDrafts/{uid} mantiene múltiples capturas y sus revisiones; settings/sellers mantiene los nombres frecuentes. Los datos siguen solo en memoria y Firebase. Las fotos y recortes no se guardan en la nube ni en almacenamiento persistente del navegador.

La marca _copiedAt solo se escribe después de que funcione el portapapeles, y únicamente si la revisión del registro coincide con la copiada. Actualizar datos quita la marca. Copiado no confirma que el usuario haya pegado en Excel. Las columnas A–Q no cambian.

Papelera: Eliminar cliente realiza una eliminación lógica en records, con _deletedAt y _expiresAt; excluye ese cliente de consultas activas y búsquedas. Se permite restaurar durante 3 meses; una restauración posterior se rechaza. No se ha programado un borrado físico automático de los registros vencidos. Eliminar un archivo ya no envía clientes a la papelera: conserva sus datos con `_batch: __cloud__`. Quitar del Excel hace lo mismo para una sola fila. Agregar a un Excel cambia la pertenencia del registro conservando su ID, datos e historial. La migración `settings/clientRetention` recupera únicamente eliminaciones anteriores asociadas a archivos borrados y prepara el índice de actividad.

Validación adicional: .qa/workflow-browser.cjs prueba las nueve mejoras con dos contextos, Firebase simulado, cámara simulada y OCR real de una imagen sintética; comprueba portapapeles de 17 columnas, comparación, actualización, otra póliza, pendientes, vendedores, papelera, recortes y búsqueda paginada.
