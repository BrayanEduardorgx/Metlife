# Desarrollo, permisos y respaldos

## Ejecutar y verificar

En Windows PowerShell usar `npm.cmd` si la política de ejecución bloquea `npm.ps1`.

```text
npm ci
npm run check
npm run format:check
npm run test:rules
npm run test:browser
npm run dev
```

Las pruebas de reglas usan un puerto libre y el proyecto `demo-metlife`. Desarrollo sirve en `http://127.0.0.1:5000` y usa Auth en 9099 y Database en 9000. Crear usuarios ficticios en el emulador y asignarles el claim `role`. En Linux, instalar Chromium con `npx playwright install --with-deps chromium` antes de las pruebas de navegador.

GitHub Actions ejecuta las verificaciones en cada push y pull request. El flujo de validación no publica automáticamente la web. Para desplegar explícitamente usar `npm run deploy:production`; exige pruebas antes de llamar a Firebase. Configurar protección de rama con la comprobación `checks` en GitHub si se quiere impedir fusiones sin validación.

## Roles antes de publicar

Las reglas nuevas rechazan cuentas sin el claim `role`. No desplegarlas antes de asignar al menos una cuenta administradora.

| Rol | Alcance |
| --- | --- |
| lector | Consulta, descarga y preferencias/borradores propios. |
| editor | Captura, modificación, organización y actualización de archivos; no elimina clientes ni archivos. |
| admin | Lo anterior, eliminación, recuperación y migraciones. |

Asignar el rol mediante el Admin SDK, fuera del navegador:

```text
METLIFE_PROJECT=metlife-6d467
GOOGLE_APPLICATION_CREDENTIALS=ruta-al-archivo-administrativo.json
npm run role -- UID_DE_FIREBASE admin
```

Las dos primeras líneas describen variables de entorno; usar la sintaxis de la terminal. El script mantiene otros claims existentes. Volver a iniciar sesión después de cambiar un rol. No subir credenciales administrativas al repositorio.

## Respaldos diarios

El flujo `.github/workflows/backup.yml` está preparado, pero no se activa sin configuración. En el entorno `production` de GitHub definir:

- Secret `METLIFE_BACKUP_CREDENTIALS`: cuenta de servicio con acceso de lectura al proyecto y escritura/lectura al bucket de respaldos.
- Secret `METLIFE_BACKUP_KEY`: clave aleatoria de 32 bytes en base64; conservar una copia separada para poder restaurar.
- Variables `METLIFE_PROJECT`, `METLIFE_DATABASE_URL` y `METLIFE_BACKUP_BUCKET`.
- Variable de repositorio `METLIFE_BACKUPS_ENABLED=true`, cuando todo esté configurado.

El flujo corre a las 09:00 UTC. Lee la base, comprime, cifra con AES-256-GCM y sube una copia. Luego vuelve a descargarla y verifica su autenticidad e integridad. No sube datos de clientes como artefactos de GitHub. La cuenta de servicio y el bucket se configuran fuera del código. Las cuentas y contraseñas de Firebase Authentication no forman parte del respaldo de Realtime Database.

También se puede usar `npm run backup` con las mismas variables. Si falta el bucket, el respaldo se escribe en `backups/`, excluido de Git y Hosting.

```text
npm run backup -- verify ruta/al/archivo.backup
npm run backup -- restore-emulator ruta/al/archivo.backup
```

La segunda acción exige `FIREBASE_DATABASE_EMULATOR_HOST`, un proyecto `demo-...` y su URL de base, y reemplaza únicamente la base de prueba. Nunca restaura sobre producción. Comprobar periódicamente la restauración de una copia; la clave debe mantenerse disponible.

## Fuentes técnicas

- [Pruebas de reglas con Firebase Emulator](https://firebase.google.com/docs/rules/unit-tests)
- [Roles mediante custom claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Lecturas y escrituras de Realtime Database](https://firebase.google.com/docs/database/web/read-and-write)
