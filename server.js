/**
 * Tiny static file server for the WC26.bets frontend.
 * All data + auth lives in Supabase — this just serves /public.
 *
 *   node server.js                # http://localhost:3000
 *   PORT=4000 node server.js
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

function safeJoin(root, target) {
  const resolved = path.normalize(path.join(root, target));
  return resolved.startsWith(root) ? resolved : null;
}

http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname || '/';
  let rel = pathname === '/' ? '/index.html' : pathname;

  if (!path.extname(rel)) {
    const candidate = safeJoin(PUBLIC_DIR, rel + '.html');
    if (candidate && fs.existsSync(candidate)) rel += '.html';
  }
  const file = safeJoin(PUBLIC_DIR, rel);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`▶ WC26.bets — http://localhost:${PORT}`);
});
