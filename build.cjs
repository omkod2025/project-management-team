const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = __dirname;
const output = path.resolve(root, 'dist');
const entries = [
  'index.html',
  'app.js',
  'announcement-detail.js',
  'announcement-detail.css',
  'auth.js',
  'login.css',
  'repair-flow.js',
  'repair-samples.js',
  'repair-flow.css',
  'interior-theme.css',
  'household-compact.css',
  'household.js',
  'styles.css',
  'typography.css',
  'weather.js',
  'weather.css',
  'environment.cjs',
  'server.cjs',
  'package.json',
  'assets',
  'resident-user-manual.html',
  'references',
];

// Validate all inputs before replacing the generated output.
for (const entry of entries) {
  fs.accessSync(path.join(root, entry), fs.constants.R_OK);
}
execFileSync(process.execPath, ['--check', path.join(root, 'app.js')], { stdio: 'inherit' });
for (const file of ['auth.js', 'repair-flow.js', 'repair-samples.js', 'weather.js', 'household.js', 'environment.cjs', 'server.cjs']) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });

// Never follow a redirected output directory when cleaning the build.
if (path.relative(root, output) !== 'dist' ||
    (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())) {
  throw new Error('Build output must be the workspace dist directory, not a link.');
}
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const entry of entries) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), { recursive: true });
}

console.log('Build complete: dist/');
console.log('Serve dist/ with static hosting or node dist/server.cjs. Weather calls Open-Meteo directly from the browser.');
