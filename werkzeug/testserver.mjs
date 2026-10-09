// Nur zum Prüfen am Mac: liefert die App aus und spielt die GitHub-API nach,
// gelesen aus dem echten Vault. SCHREIBEN IST GESPERRT — Prüfen erzeugt nie Daten.
// Start: node werkzeug/testserver.mjs  →  http://localhost:8787/
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = process.env.VAULT || '/Users/justin.k/00 Master/MindOS';
const TYP = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.wasm':'application/wasm' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); const p = decodeURIComponent(url.pathname);
  const m = p.match(/^\/gh\/repos\/[^/]+\/[^/]+\/contents\/(.*)$/);
  if (m) {
    if (req.method !== 'GET' && process.env.OHNE_NETZ === '1') return req.socket.destroy();   // Funkloch nachstellen
    if (req.method !== 'GET') {
      // Schreiben nur in eine Kopie unter /tmp (SCHREIBEN=1 VAULT=/tmp/…), nie in den echten Vault.
      if (!(process.env.SCHREIBEN === '1' && VAULT.startsWith('/tmp/'))) { res.writeHead(403, {'Content-Type':'application/json'}); return res.end('{"message":"Testmodus: Schreiben gesperrt"}'); }
      let roh = ''; req.on('data', c => roh += c); req.on('end', () => {
        const b = JSON.parse(roh), ziel = path.join(VAULT, m[1]);
        const da = fs.existsSync(ziel), alt = da ? crypto.createHash('sha1').update(fs.readFileSync(ziel)).digest('hex') : null;
        if (req.method === 'DELETE') {
          if (!da) { res.writeHead(404); return res.end('{}'); }
          if (b.sha !== alt) { res.writeHead(409, {'Content-Type':'application/json'}); return res.end('{"message":"sha passt nicht"}'); }
          fs.unlinkSync(ziel); res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{}');
        }
        if (da && b.sha !== alt) { res.writeHead(da && !b.sha ? 422 : 409, {'Content-Type':'application/json'}); return res.end('{"message":"sha passt nicht"}'); }
        const inhalt = Buffer.from(b.content, 'base64'); fs.mkdirSync(path.dirname(ziel), { recursive:true }); fs.writeFileSync(ziel, inhalt);
        res.writeHead(da ? 200 : 201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ content:{ path:m[1], sha:crypto.createHash('sha1').update(inhalt).digest('hex') } }));
      }); return;
    }
    const ziel = path.join(VAULT, m[1]);
    if (!ziel.startsWith(VAULT) || !fs.existsSync(ziel)) { res.writeHead(404); return res.end('{}'); }
    if (!/raw/.test(req.headers.accept || '')) res.writeHead(200, {'Content-Type':'application/json'});
    if (fs.statSync(ziel).isDirectory()) return res.end(JSON.stringify(fs.readdirSync(ziel).map(n => {
      const f = path.join(ziel, n), d = fs.statSync(f).isDirectory();
      return { name:n, path:path.posix.join(m[1], n), type:d ? 'dir' : 'file',
               sha:d ? '' : crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex') }; })));
    const b = fs.readFileSync(ziel);
    if (/raw/.test(req.headers.accept || '')) return res.end(b);   // Bilder: rohe Bytes wie bei GitHub
    return res.end(JSON.stringify({ type:'file', path:m[1], sha:crypto.createHash('sha1').update(b).digest('hex'), encoding:'base64', content:b.toString('base64') }));
  }
  let datei = path.join(APP, p === '/' ? 'index.html' : p);
  if (fs.existsSync(datei) && fs.statSync(datei).isDirectory()) datei = path.join(datei, 'index.html');   // /kitchen/
  if (!datei.startsWith(APP) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type':TYP[path.extname(datei)] || 'application/octet-stream' });
  res.end(fs.readFileSync(datei));
}).listen(8787, () => console.log('http://localhost:8787/'));
