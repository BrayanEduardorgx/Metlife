# Ideas para las siguientes mejoras

Esta es la lista original de propuestas. Los 27 puntos seleccionados después se detallan en [mejoras implementadas](mejoras-implementadas.md); consultar ese documento para distinguir implementación y configuración pendiente.

## Código y mantenimiento

1. **Iniciar un repositorio Git.** Permitiría comparar líneas cambiadas, recuperar versiones y revisar cada entrega.
2. **Organizar el formulario en módulos.** Separar captura, validación, búsqueda, guardado y presentación; sustituir gradualmente las funciones globales que se sobrescriben.
3. **Unificar el estado de la aplicación.** Una sola fuente para cliente seleccionado, archivo abierto, cambios pendientes y operaciones activas.
4. **Centralizar la definición de campos.** Compartir claves, etiquetas y formatos entre formulario, Excel, escáner y validaciones.
5. **Añadir comprobación de tipos.** JSDoc o TypeScript para detectar campos o argumentos incorrectos antes de abrir la página.
6. **Automatizar formato y revisión de código.** Evitar líneas muy largas, duplicación y errores simples.
7. **Crear comandos únicos de desarrollo y pruebas.** Un manifiesto de dependencias y versiones fijas haría más reproducible el proyecto.
8. **Usar una interfaz común para guardar.** Reunir estados, errores, reintentos y protección contra doble clic en vez de repetirlos en cada botón.

## Rendimiento

9. **Medir antes de optimizar.** Registrar duración de búsquedas, generación de Excel y volumen de datos, sin guardar datos personales en los registros técnicos. Firebase ofrece herramientas de medición: https://firebase.google.com/docs/database/usage/optimize.
10. **Actualizar solo las filas que cambiaron.** Evitar reconstruir tablas completas por cada evento de sincronización.
11. **Agrupar actualizaciones visuales.** Reunir eventos cercanos en una sola actualización de pantalla.
12. **Cancelar búsquedas anteriores.** Evitar consultas innecesarias cuando se inicia otra búsqueda.
13. **Separar el historial de versiones de las fichas.** No descargar todas las versiones de un cliente al mostrarlo en una lista.
14. **Paginar también los registros del Excel activo desde el servidor.** La tabla limita filas visibles, pero todavía consulta el lote completo.
15. **Agregar un índice de búsqueda de texto si crece mucho el directorio.** La búsqueda actual usa páginas ligeras, pero una consulta sin coincidencias puede recorrer muchas páginas.
16. **Cargar el escáner solo cuando se vaya a utilizar.** Reducir el trabajo inicial de la aplicación.

## Confiabilidad y administración

17. **Probar reglas reales con Firebase Emulator Suite.** Las pruebas actuales simulan el almacén y no sustituyen pruebas de autorización: https://firebase.google.com/docs/emulator-suite.
18. **Automatizar pruebas antes de publicar.** Incluir guardados simultáneos, pérdida de conexión, descargas y recuperación.
19. **Separar desarrollo y producción.** Probar funciones nuevas con un proyecto de datos de prueba.
20. **Respaldos verificables.** Además de guardar copias, probar periódicamente que se puedan restaurar.
21. **Permisos por función.** Distinguir quién consulta, captura, modifica o elimina clientes.
22. **Centro de operaciones pendientes.** Reunir tareas incompletas, su motivo y una acción para reintentarlas.
23. **Reintentos con espera progresiva.** Evitar repetir solicitudes de inmediato cuando el servicio no responde.
24. **Migraciones con informe.** Mostrar qué se convertirá, qué se conservó y qué requiere revisión, con posibilidad de reanudación.

## Trabajo diario

25. **Archivos favoritos.** Fijar los Excel usados con más frecuencia.
26. **Filtros guardados.** Recuperar búsquedas habituales como vendedor, semana o comunidad.
27. **Recordatorios con fecha.** Dar seguimiento a registros que requieren completar o confirmar información.
28. **Edición por lotes con vista previa.** Cambiar vendedor, comunidad o fecha de varios registros viendo antes el resultado.
29. **Plantillas de exportación.** Elegir columnas y orden sin alterar el formato predeterminado.
30. **Detección y combinación revisada de duplicados.** Comparar posibles duplicados y elegir los datos correctos sin perder historial.
31. **Resumen diario.** Mostrar capturas, registros corregidos y pendientes del día.
32. **Navegación y accesibilidad.** Revisar foco del teclado, lectura de avisos, contraste y tamaño de botones en móvil.

Prioridad sugerida: Git, módulos y estado común, pruebas de reglas con emulador y actualización parcial de tablas. Estas mejoras facilitan añadir funciones sin introducir fallos.
