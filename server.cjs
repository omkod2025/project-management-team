const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const environment = require('./environment.cjs').createEnvironmentService();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.json': 'application/json' };
http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (name === '/api/environment') {
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }).end(); return; }
    environment(new URL(req.url, 'http://localhost').searchParams).then(({ status, body }) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
    }).catch(() => res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Service unavailable' })));
    return;
  }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    const extension = path.extname(file);
    res.writeHead(200, { 'Content-Type': extension === '.mjs' ? 'text/javascript; charset=utf-8' : extension === '.wasm' ? 'application/wasm' : types[extension] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...(extension === '.pdf' ? { 'Content-Disposition': 'inline' } : {}) });
    fs.createReadStream(file).pipe(res);
  });
}).listen(process.env.PORT || 4173, '127.0.0.1', () => console.log('Resident prototype: http://localhost:' + (process.env.PORT || 4173)));
