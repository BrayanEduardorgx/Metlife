const net = require('node:net'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
async function main() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const root = path.resolve(__dirname, '..'),
    config = path.join(root, '.qa', 'firebase-rules.json');
  await fs.mkdir(path.dirname(config), { recursive: true });
  await fs.writeFile(
    config,
    JSON.stringify({
      database: { rules: path.join(root, 'database.rules.json') },
      emulators: {
        database: { port, host: '127.0.0.1' },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    }),
  );
  const child = spawn(
    process.execPath,
    [
      require.resolve('firebase-tools/lib/bin/firebase'),
      'emulators:exec',
      '--only',
      'database',
      '--project',
      'demo-metlife',
      '--config',
      config,
      'node --test tests/rules/*.test.cjs',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
