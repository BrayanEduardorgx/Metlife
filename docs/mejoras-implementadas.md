# Mejoras seleccionadas

Se implementaron los 27 puntos seleccionados. El código se entrega separado de su activación en la infraestructura de producción.

| Puntos | Implementación |
| --- | --- |
| 1 | Repositorio Git, versión inicial y remoto `BrayanEduardorgx/Metlife`. |
| 2 | Módulos de captura, importación, tabla, Excel, búsqueda, versiones, permisos y herramientas. Los renderizadores de tabla e historial tienen extensiones explícitas y ya no se sobrescriben entre archivos. |
| 3 | `metlifeState`: estado único de captura, selección, operaciones, métricas y referencia al estado remoto. Los nombres globales de compatibilidad son accesores de este mismo objeto. |
| 4 | `modules/field-schema.js`: definición compartida de campos, etiquetas, orden y claves de Excel. El escáner toma sus campos de esta definición y mantiene sus reglas específicas de lectura. |
| 5 | JSDoc y TypeScript verifican los contratos usados al guardar clientes y editar por lotes. La comprobación de tipos cubre estos contratos; no se convirtió toda la aplicación a TypeScript. |
| 6 | ESLint, Prettier, versiones fijadas y archivo de dependencias reproducible. |
| 8 | Servicio común de operaciones: estado, protección contra solicitudes idénticas simultáneas, errores y reintentos por acción. |
| 9 | Medición de duración de operaciones en memoria, visible en Herramientas y resumen. No se envía telemetría externa. |
| 10–11 | Reutilización de filas sin cambios y agrupación de eventos de nube por cuadro de pantalla. |
| 12 | Cancelación de búsquedas anteriores: se descartan resultados obsoletos y se detienen las siguientes consultas. Firebase no permite abortar una lectura `once` ya enviada. |
| 13 | Versiones separadas en `recordVersions`, con migración y consulta al abrir el historial de un cliente. |
| 14 | El Excel activo carga 50 registros y amplía la consulta al pedir más. Exportar y actualizar el archivo siguen consultando todos sus registros. |
| 15 | Índice de fragmentos de 1–3 caracteres en `clientSearch`. Cada resultado se comprueba contra el cliente actual. |
| 16 | Carga del escáner al usar cámara, subir documento o guardar y escanear siguiente. |
| 17–18 | Pruebas con Firebase Emulator, pruebas de navegador y GitHub Actions. El comando de publicación ejecuta las comprobaciones antes del despliegue. |
| 19 | Desarrollo utiliza `demo-metlife` con emuladores. Producción tiene alias explícito; el proyecto predeterminado es el de pruebas. |
| 20 | Respaldos cifrados con verificación de integridad, restauración de prueba limitada al emulador y flujo diario preparado. Requiere configurar credenciales, clave y destino para activarse. |
| 21 | Roles lector, editor y administrador, verificados también por las reglas de Firebase. Requiere asignar roles antes de publicar las nuevas reglas. |
| 22 | Centro de operaciones pendientes con reintentos y avisos de borrador/Excel pendiente. Las operaciones de sesión no se conservan tras cerrar la pestaña; los borradores y registros ya guardados permanecen en Firebase. |
| 25–26 | Excel favoritos y filtros personales guardados en la nube por cuenta. |
| 28 | Edición múltiple de campos comunes con vista previa, confirmación y resultados individuales; respeta conflictos de revisión. |
| 29 | Plantilla personal de columnas y orden para descargar. El archivo canónico del historial conserva las 17 columnas originales. |
| 31 | Resumen diario de registros activos capturados, corregidos y por revisar con actividad ese día, más pendientes de la cuenta. Usa fecha de Ciudad de México. |
| 32 | Foco visible, salto al formulario, etiquetas accesibles, retorno de foco, controles móviles y movimiento reducido. |

## Uso

- Abrir **Herramientas y resumen** para filtros, resumen diario, edición múltiple, plantillas, operaciones y mediciones.
- Marcar **☆ Favorito** en el historial para fijar un Excel arriba.
- Seleccionar clientes en la tabla, abrir **Editar seleccionados**, elegir campo y valor, pulsar **Ver cambios** y revisar antes de confirmar.
- Las columnas personalizadas se aplican al descargar; las notas internas siguen excluidas.
- El resumen cuenta registros activos, no un libro contable de todas las acciones. Un cliente modificado varias veces se cuenta una vez como corregido.

## Límites técnicos

El índice de fragmentos conserva referencias antiguas como candidatos para evitar pérdidas por escrituras simultáneas. Los candidatos antiguos nunca se muestran sin comprobar el registro actual; el almacenamiento del índice puede crecer con cambios sucesivos. Las búsquedas de uno o dos caracteres pueden tener muchos candidatos.

La migración inicial requiere una cuenta administradora y puede tardar según la cantidad de datos. Se ejecuta antes de abrir la aplicación. Las listas habituales no descargan todas las versiones ni los binarios Excel.

La modularización es gradual: quedan funciones globales de compatibilidad en captura y voz. Los módulos nuevos tienen responsabilidades separadas; se preservaron los flujos anteriores mediante pruebas de regresión.
