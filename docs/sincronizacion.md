# Sincronización y almacenamiento

Firebase Realtime Database es la fuente de verdad. La pestaña conserva datos de trabajo en memoria. Fotos y notas no se incluyen en los Excel.

| Ruta | Contenido |
| --- | --- |
| records/{id} | Ficha vigente, revisión, pertenencia a un Excel, índices y marcas de actividad/papelera. |
| recordVersions/{id}/{revision} | Datos anteriores y autor del cambio; consulta bajo demanda. |
| history/{id} | Metadatos de archivos, sin binarios ni todas las filas. |
| historyContent/{id}/{version} | XLSX y filas exportadas; conserva copia actual y anterior. |
| clientDirectory/{id} | Proyección compacta para verificar candidatos de búsqueda. |
| clientSearch/{campo}/{fragmento}/{id} | Índice de fragmentos para nombre y teléfono. |
| workspaces/{uid} | Borrador, archivo abierto y borradores recuperados. |
| pendingDrafts/{uid} | Capturas pendientes de la cuenta. |
| preferences/{uid} | Favoritos, filtros y plantilla de exportación personales. |
| settings | Versiones de migración, vendedores frecuentes y zonas del escáner. |

## Carga y consistencia

La tabla del Excel activo y la actividad reciente cargan 50 registros inicialmente y amplían la consulta al pedir más. Descargar o actualizar un Excel consulta todos sus miembros. Las búsquedas por nombre/teléfono usan fragmentos indexados y verifican los datos actuales; se detienen las siguientes consultas al cancelar una búsqueda.

Cada escritura usa revisiones para rechazar ediciones obsoletas. Las versiones pendientes permanecen en el registro hasta copiarse a recordVersions. La actualización de Excel conserva referencias a versiones de contenido y no revive archivos eliminados. Las notas internas permanecen en la ficha y su historial, fuera de las columnas exportadas.

Quitar un cliente de un Excel, o eliminar ese archivo, conserva al cliente en la nube. Solo la acción explícita de eliminar cliente lo envía a la papelera durante tres meses naturales. Se puede incorporar después a otro Excel.

La migración inicial se ejecuta con una cuenta administradora y conserva archivos, versiones y borradores recuperados. Los índices incompletos se pueden reparar al recuperar conexión. Las actualizaciones simultáneas no deben sobrescribir una revisión más nueva.

## Acceso y operación

Las reglas preparadas en esta entrega exigen claims de lector, editor o administrador. Los borradores, pendientes y preferencias están aislados por UID mediante reglas, además de la interfaz. Los registros de clientes son compartidos por las cuentas autorizadas.

Estas reglas no se activan automáticamente por guardar el código en GitHub. Consultar [operación y despliegue](operacion-y-despliegue.md) para asignar roles, probar en emuladores y activar los respaldos. No desplegar las reglas antes de asignar una cuenta administradora.
