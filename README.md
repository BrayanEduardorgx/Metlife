# MetLife Archivador

Formulario de clientes con dictado, lectura de documentos, búsqueda en la nube y archivos Excel permanentes.

Esta entrega incorpora los **27 puntos seleccionados** de organización del código, rendimiento, confiabilidad y herramientas de trabajo. Consulta [el detalle de implementación](docs/mejoras-implementadas.md) y [la configuración de producción](docs/operacion-y-despliegue.md).

## Desarrollo y pruebas

Requisitos: Node.js 22 o posterior; Java 21 o posterior para Firebase Emulator. En Windows, usar npm.cmd si PowerShell bloquea npm.ps1.

- npm ci: instalar las versiones fijadas.
- npm run dev: emuladores locales de Hosting, Auth y Realtime Database.
- npm run check: revisión de código, contratos de tipos y pruebas unitarias.
- npm run test:rules: permisos, integración de nube y restauración de respaldo en un emulador demo.
- npm run test:browser: flujos en navegador y archivos XLSX reales. En Linux, instalar Chromium con npx playwright install --with-deps chromium.
- npm run format / npm run format:check: aplicar o comprobar formato.

GitHub Actions ejecuta las verificaciones. La publicación requiere una acción explícita. **Antes de desplegar las reglas nuevas, asignar roles a las cuentas.** Los respaldos diarios necesitan configurar credenciales, clave de cifrado y bucket; todavía no se activan solo por subir este código.

## Herramientas

Abrir **Herramientas y resumen** para guardar filtros, editar varios registros con vista previa, elegir columnas y orden de descarga, consultar actividad diaria y reintentar operaciones pendientes. Los Excel favoritos se fijan arriba del historial.

Los registros sobreviven a la eliminación de un Excel y se pueden buscar por póliza, fragmento de nombre o teléfono. La eliminación explícita de un cliente permite recuperarlo durante tres meses. Las notas internas no se exportan.

El formulario acepta datos incompletos con revisión antes de guardar, conserva el texto al dictar y permite editar en la posición del cursor. Los archivos Excel se generan en un worker con SheetJS local y se descargan bajo demanda. Las versiones de clientes se consultan al abrir su historial.

## Documentación

- [Modelo de sincronización](docs/sincronizacion.md)
- [Escaneo de documentos](docs/escaneo-gratuito.md)
- [Detalle de las mejoras seleccionadas](docs/mejoras-implementadas.md)
- [Desarrollo, roles y respaldos](docs/operacion-y-despliegue.md)

El tipado se aplica a contratos de entrada; la modularización conserva accesores globales de compatibilidad para los flujos existentes.
