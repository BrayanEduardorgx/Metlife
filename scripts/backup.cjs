const fs = require('node:fs/promises'),
  path = require('node:path'),
  { pack, unpack } = require('./backup-core.cjs');
async function main() {
  const key = Buffer.from(process.env.METLIFE_BACKUP_KEY || '', 'base64');
  if (key.length !== 32)
    throw Error('Configura METLIFE_BACKUP_KEY: clave de 32 bytes codificada en base64.');
  const [command = 'create', filename] = process.argv.slice(2);
  if (command === 'verify') {
    unpack(await fs.readFile(filename), key);
    console.log('Respaldo descifrado y verificado.');
    return;
  }
  const projectId = process.env.METLIFE_PROJECT,
    databaseURL = process.env.METLIFE_DATABASE_URL;
  if (!projectId || !databaseURL)
    throw Error('Define METLIFE_PROJECT y METLIFE_DATABASE_URL explícitamente.');
  const admin = require('firebase-admin');
  admin.initializeApp({ projectId, databaseURL, storageBucket: process.env.METLIFE_BACKUP_BUCKET });
  try {
    if (command === 'restore-emulator') {
      if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST || !projectId.startsWith('demo-'))
        throw Error('La restauración de prueba solo admite emuladores demo.');
      const restored = unpack(await fs.readFile(filename), key);
      await admin.database().ref().set(restored);
      const check = (await admin.database().ref().once('value')).val();
      if (!require('node:util').isDeepStrictEqual(check, restored))
        throw Error('La restauración requiere revisión.');
      console.log('Restauración comprobada en el emulador.');
      return;
    }
    if (command !== 'create') throw Error('Acción desconocida.');
    const data = (await admin.database().ref().once('value')).val(),
      buffer = pack(data, key);
    unpack(buffer, key);
    const name = 'metlife-' + new Date().toISOString().replace(/[:.]/g, '-') + '.backup';
    if (process.env.METLIFE_BACKUP_BUCKET) {
      const file = admin
        .storage()
        .bucket()
        .file('backups/' + name);
      await file.save(buffer, { resumable: false, contentType: 'application/octet-stream' });
      unpack((await file.download())[0], key);
      console.log('Respaldo cifrado subido y verificado.');
    } else {
      await fs.mkdir('backups', { recursive: true });
      await fs.writeFile(path.join('backups', name), buffer);
      unpack(await fs.readFile(path.join('backups', name)), key);
      console.log('Respaldo cifrado local creado y verificado.');
    }
  } finally {
    await admin.app().delete();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
