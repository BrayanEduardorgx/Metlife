const crypto = require('node:crypto'),
  zlib = require('node:zlib');
function pack(data, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw Error('La clave de respaldo debe contener 32 bytes.');
  const raw = Buffer.from(JSON.stringify(data)),
    gzip = zlib.gzipSync(raw),
    iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv('aes-256-gcm', key, iv),
    encrypted = Buffer.concat([cipher.update(gzip), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      version: 1,
      created: new Date().toISOString(),
      sha256: crypto.createHash('sha256').update(raw).digest('hex'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    }),
  );
}
function unpack(buffer, key) {
  const envelope = JSON.parse(buffer.toString());
  if (envelope.version !== 1) throw Error('Formato de respaldo desconocido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const raw = zlib.gunzipSync(
    Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]),
  );
  if (crypto.createHash('sha256').update(raw).digest('hex') !== envelope.sha256)
    throw Error('El respaldo no pasó la verificación.');
  return JSON.parse(raw.toString());
}
module.exports = { pack, unpack };
