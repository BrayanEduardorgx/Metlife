const admin = require('firebase-admin');
async function main() {
  const [uid, role] = process.argv.slice(2);
  if (!uid || !['lector', 'editor', 'admin'].includes(role))
    throw Error(
      'Uso: npm run role -- UID lector|editor|admin. Requiere credenciales administrativas.',
    );
  const projectId = process.env.METLIFE_PROJECT;
  if (!projectId) throw Error('Define METLIFE_PROJECT explícitamente.');
  admin.initializeApp({ projectId });
  const user = await admin.auth().getUser(uid);
  await admin.auth().setCustomUserClaims(uid, { ...user.customClaims, role });
  console.log('Permiso actualizado a ' + role + '. La cuenta debe volver a iniciar sesión.');
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
