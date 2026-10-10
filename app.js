// ═══════════════════════════════════════════════════════════════
//   HUB-APPS fürs Handy (Training, Küche)
//   Führt den ECHTEN Code eines Hubs aus, geladen aus dem Vault-Repo auf GitHub.
//   Diese Datei bildet nur die Stellen nach, an denen ein Hub Obsidian anspricht
//   (dv.*, app.vault.*, require('fs') …). Ändert sich der Hub, ändert sich die App
//   beim nächsten Öffnen mit. Welcher Hub, steht in window.HUB_APP der index.html.
//
//   Schreiben: neue Dateien (Gym-Logs) und Anhängen (Cardio, Körperdaten) direkt
//   per GitHub-API. Seit 09.10. auch Umschreiben (für den Kitchen Hub), aber nur, wenn
//   die Datei auf GitHub noch die ist, die die App geladen hat. Sonst wird nichts
//   überschrieben, und der Eintrag steht als „nicht übernommen“ oben in der Leiste.
//   Ohne Netz in eine Warteschlange, abgeschickt, sobald Netz da ist.
//   Am Mac holt der automatische Spielstand die Einträge jede Minute herunter.
//   Warum so: MindOS/05 Stack/Context/Decisions/Training-App am Handy führt den Hub-Code aus.md
// ═══════════════════════════════════════════════════════════════

// Jede App setzt window.HUB_APP in ihrer index.html (training/, kitchen/). Ohne Angabe die Training-App.
const APP = window.HUB_APP || {
  name:'Training', hub:'02 Life OS/Training Hub.md', praefix:'tr', rad:true,
  dateien:['02 Life OS/Körperdaten.md', '99 System/Utility/Templates/Training Log.md', '99 System/Utility/Views/Koerper/koerper.json'],
  ordner:['02 Life OS/Training Logs'],
};
const HUB     = APP.hub;
const HUB_NAME = HUB.split('/').pop().replace(/\.md$/, '');
const DATEIEN = [HUB, ...APP.dateien];
const ORDNER  = APP.ordner;

const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
const API = DEV ? '/gh' : 'https://api.github.com';
// Der Schlüssel (tr-konf) gilt für alle Apps, der Rest ist je App getrennt.
const K_KONF = 'tr-konf', K_CACHE = `${APP.praefix}-cache`, K_WARTE = `${APP.praefix}-warte`,
      K_STAND = `${APP.praefix}-stand`, K_NICHT = `${APP.praefix}-nicht`;

const lies  = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const merke = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const konf  = () => DEV ? { repo:'dev/vault', branch:'main', token:'' } : lies(K_KONF);

// ── Barcode lesen (Kitchen Hub, Stufe 2) ────────────────────────
// Der Hub liest Barcodes aus Fotos mit BarcodeDetector. Obsidian am Mac hat das eingebaut,
// Safari am iPhone nicht. Dann steht hier derselbe Name, und erst beim ersten Foto wird der
// Leser geladen (vendor/barcode-detector.js + zxing_reader.wasm, zusammen rund 1,1 MB, MIT).
// Bewusst nicht in HUELLE: Ohne Netz kann die Datenbank das Produkt ohnehin nicht nennen.
// Die Version der .wasm muss zur .js passen (heute zxing-wasm 3.1.3, steht in der .js).
if (!('BarcodeDetector' in window)) {
  // Pfad beim Start merken (currentScript gibt es nur jetzt), die Adresse erst beim Laden bilden.
  const skript = document.currentScript?.src;
  let leser = null;
  const laden = () => leser || (leser = new Promise((fertig, fehler) => {
    const VENDOR = new URL('vendor/', skript || location.href).href;
    const s = document.createElement('script');
    s.src = VENDOR + 'barcode-detector.js';
    s.onload = () => {
      const api = window.BarcodeDetectionAPI;
      api.prepareZXingModule({ overrides: { locateFile: (p, pre) => p.endsWith('.wasm') ? VENDOR + p : pre + p } });
      fertig(api.BarcodeDetector);
    };
    s.onerror = () => { leser = null; fehler(new Error('Barcode-Leser nicht geladen — ohne Netz?')); };
    document.head.append(s);
  }));
  window.BarcodeDetector = class {
    constructor(o) { this.o = o; }
    async detect(bild) { const B = await laden(); return new B(this.o).detect(bild); }
    static async getSupportedFormats() { return (await laden()).getSupportedFormats(); }
  };
}

// ── GitHub ──────────────────────────────────────────────────────
const pfadUrl = p => p.split('/').map(encodeURIComponent).join('/');
const ausB64  = b => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\s/g, '')), c => c.charCodeAt(0)));
function zuB64(s) {
  const by = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode(...by.subarray(i, i + 0x8000));
  return btoa(bin);
}
class HttpFehler extends Error { constructor(status, text) { super(text); this.status = status; } }

async function gh(pfad, { methode = 'GET', body, roh = false } = {}) {
  const k = konf();
  const url = `${API}/repos/${k.repo}/contents/${pfadUrl(pfad)}${methode === 'GET' ? `?ref=${encodeURIComponent(k.branch)}` : ''}`;
  const r = await fetch(url, {
    method: methode, cache: 'no-store',
    headers: { 'Accept':roh ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28',
               ...(k.token ? { 'Authorization':`Bearer ${k.token}` } : {}),
               ...(body ? { 'Content-Type':'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 404 && (methode === 'GET' || methode === 'DELETE')) return null;
  if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch {} throw new HttpFehler(r.status, m || r.statusText); }
  return roh ? r.blob() : r.json();
}
// Höchstens n Abrufe gleichzeitig: Beim ersten Öffnen holt die Küche rund 180 Dateien.
async function jeweils(liste, n, fn) {
  const rest = [...liste];
  await Promise.all(Array.from({ length:Math.min(n, rest.length) }, async () => { while (rest.length) await fn(rest.shift()); }));
}
const dateiText = j => j.encoding === 'base64' ? ausB64(j.content) : String(j.content ?? '');

// ── Stand: was auf GitHub liegt (Cache) + was noch wartet ─────────
// Der Cache hält NUR den Stand von GitHub. Wartende Einträge werden bei jedem
// Aufbau darübergelegt, damit sie sofort zu sehen sind, auch ohne Netz.
let dateien = {};
function zusammensetzen() {
  const basis = lies(K_CACHE) || {};
  const d = Object.fromEntries(Object.entries(basis).map(([p, v]) => [p, { ...v }]));
  for (const op of lies(K_WARTE) || []) {
    if (op.art === 'neu' && !d[op.pfad]) d[op.pfad] = { sha:null, text:op.text };
    if (op.art === 'anhang' && d[op.pfad]) d[op.pfad].text = d[op.pfad].text.replace(/\s*$/, '') + op.text;
    if (op.art === 'ersetzen') d[op.pfad] = { sha:d[op.pfad]?.sha ?? null, text:op.text };
    if (op.art === 'loeschen') delete d[op.pfad];
  }
  dateien = d;
}

async function aktualisieren() {
  const alt = lies(K_CACHE) || {}, neu = {};
  // Einzeldateien: erst ihre Ordner auflisten (je eine kleine Abfrage, liefert den sha jeder Datei),
  // dann nur holen, was sich geändert hat. Bis 09.10. kamen Hub (324 KB) und BLS (481 KB) bei
  // jedem Öffnen komplett neu.
  const shas = {};
  await jeweils([...new Set(DATEIEN.map(p => p.split('/').slice(0, -1).join('/')))], 4, async o => {
    for (const e of (await gh(o)) || []) if (e.type === 'file') shas[e.path] = e.sha;
  });
  await jeweils(DATEIEN.filter(p => p in shas), 6, async p => {
    if (alt[p]?.sha === shas[p]) { neu[p] = alt[p]; return; }
    const j = await gh(p);
    // Über 1 MB liefert GitHub den Inhalt nicht mit (encoding "none"), dann roh nachholen.
    if (j) neu[p] = { sha:j.sha, text:j.encoding === 'none' ? await (await gh(p, { roh:true })).text() : dateiText(j) };
  });
  for (const o of ORDNER) {
    const liste = await gh(o) || [];
    await jeweils(liste.filter(e => e.type === 'file' && e.name.endsWith('.md')), 6, async e => {
      if (alt[e.path]?.sha === e.sha) { neu[e.path] = alt[e.path]; return; }
      const j = await gh(e.path);
      if (j) neu[e.path] = { sha:j.sha, text:dateiText(j) };
    });
  }
  const geaendert = JSON.stringify(Object.keys(neu).sort().map(p => [p, neu[p].sha]))
                 !== JSON.stringify(Object.keys(alt).sort().map(p => [p, alt[p].sha]));
  merke(K_CACHE, neu); merke(K_STAND, Date.now());
  return geaendert;
}

// ── Bilder ──────────────────────────────────────────────────────
// Welche Bilder gebraucht werden, steht im Frontmatter der geladenen Notizen (z. B.
// `banner:` der Rezepte). Einmal geholt, liegen sie im Cache-Speicher des Browsers, nicht im
// localStorage (der ist auf wenige MB begrenzt). getResourcePath ist synchron, deshalb werden
// sie vor dem Start des Hubs bereitgelegt.
const BILD = /\.(jpe?g|png|webp|gif|avif)$/i;
let bilder = {};
async function bilderBereitlegen(holen) {
  if (!('caches' in window)) return;
  const pfade = new Set();
  for (const d of Object.values(dateien)) {
    const m = d.text.match(/^---\n([\s\S]*?)\n---/);
    if (m) for (const z of m[1].matchAll(/^[^:\n]*:\s*["']?([^"'\n]+?\.(?:jpe?g|png|webp|gif|avif))["']?\s*$/gim)) pfade.add(z[1].trim());
  }
  const speicher = await caches.open(`${APP.praefix}-bilder`);
  await jeweils([...pfade].filter(p => !bilder[p]), 4, async p => {
    const schluessel = `/bild/${pfadUrl(p)}`;
    let antwort = await speicher.match(schluessel);
    if (!antwort && holen) {
      try { const b = await gh(p, { roh:true }); if (b) { await speicher.put(schluessel, new Response(b)); antwort = await speicher.match(schluessel); } }
      catch (e) { console.warn('Bild', p, e); }
    }
    if (antwort) bilder[p] = URL.createObjectURL(await antwort.blob());
  });
}

// ── Schreiben ───────────────────────────────────────────────────
// Jeder Schreibvorgang kommt erst in die Warteschlange, und die wird streng der Reihe nach
// abgearbeitet. Sonst schickten zwei schnelle Haken bei langsamem Netz beide auf dem alten
// Stand los, und GitHub hielte den zweiten für eine fremde Änderung.
const nachricht = p => `${APP.commit || APP.name + '-App'}: ${p.split('/').pop().replace(/\.md$/, '')}`;
const dateiName = p => p.split('/').pop().replace(/\.md$/, '');

class Konflikt extends HttpFehler {
  constructor(op) { super(409, `${dateiName(op.pfad)} wurde inzwischen woanders geändert. Nicht übernommen.`); }
}

// Liefert, auf welchem sha die Änderung beruhte (vor) und welchen sie erzeugt hat (nach).
// `vor` ist nur gesetzt, wenn GitHub genau den Stand hatte, den die App kannte.
async function senden(op) {
  const k = konf(), cache = lies(K_CACHE) || {}, bekannt = cache[op.pfad]?.sha ?? null;
  let r;
  if (op.art === 'bild') {
    // Foto vom Essen (Kitchen Hub, Stufe 3): schon als Base64 eingereiht, kommt nicht in den
    // Text-Cache. Gibt es den Namen schon (422), wurde es bereits hochgeladen: nichts tun.
    try { await gh(op.pfad, { methode:'PUT', body:{ message:nachricht(op.pfad), content:op.b64, branch:k.branch } }); }
    catch (e) { if (!(e instanceof HttpFehler && e.status === 422)) throw e; }
    return { vor:undefined };
  }
  if (op.art === 'neu') {
    const j = await gh(op.pfad, { methode:'PUT', body:{ message:nachricht(op.pfad), content:zuB64(op.text), branch:k.branch } });
    cache[op.pfad] = { sha:j.content.sha, text:op.text }; r = { vor:null, nach:j.content.sha };
  } else if (op.art === 'loeschen') {
    // Wie Umschreiben: nur, wenn die Datei noch die ist, die die App kannte.
    try {
      await gh(op.pfad, { methode:'DELETE', body:{ message:nachricht(op.pfad) + ' (gelöscht)', sha:op.sha, branch:k.branch } });
    } catch (e) {
      if (e instanceof HttpFehler && (e.status === 409 || e.status === 422)) throw new Konflikt(op);
      throw e;
    }
    delete cache[op.pfad]; r = { vor:undefined };
  } else if (op.art === 'ersetzen') {
    // Mit dem sha, auf dem die Änderung beruht: Hat sich die Datei auf GitHub inzwischen
    // geändert, lehnt GitHub ab (409, ohne sha bei vorhandener Datei 422), nichts wird überschrieben.
    try {
      const body = { message:nachricht(op.pfad), content:zuB64(op.text), branch:k.branch, ...(op.sha ? { sha:op.sha } : {}) };
      const j = await gh(op.pfad, { methode:'PUT', body });
      cache[op.pfad] = { sha:j.content.sha, text:op.text }; r = { vor:op.sha, nach:j.content.sha };
    } catch (e) {
      if (e instanceof HttpFehler && (e.status === 409 || e.status === 422)) throw new Konflikt(op);
      throw e;
    }
  } else {
    // Anhängen an den Stand, der GERADE auf GitHub liegt — nicht an den eigenen Cache.
    // Hat der Mac inzwischen etwas angehängt, bleibt es so erhalten.
    for (let versuch = 0; ; versuch++) {
      const j = await gh(op.pfad);
      if (!j) throw new HttpFehler(404, `${op.pfad} gibt es auf GitHub nicht`);
      const text = dateiText(j).replace(/\s*$/, '') + op.text;
      try {
        const n = await gh(op.pfad, { methode:'PUT', body:{ message:nachricht(op.pfad), content:zuB64(text), sha:j.sha, branch:k.branch } });
        cache[op.pfad] = { sha:n.content.sha, text };
        r = { vor:j.sha === bekannt ? bekannt : undefined, nach:n.content.sha }; break;
      } catch (e) { if (!(e instanceof HttpFehler && e.status === 409 && versuch < 2)) throw e; }
    }
  }
  merke(K_CACHE, cache);
  return r;
}

// Nicht übernommene Fassungen bleiben auf dem Handy liegen (nichts geht still verloren)
// und stehen oben in der Leiste, bis man darauf tippt. `grund` steht dort mit dabei.
const nichtUebernommen = (op, grund = 'am Mac geändert') =>
  merke(K_NICHT, [...(lies(K_NICHT) || []), { id:op.id, pfad:op.pfad, text:op.text, grund, zeit:Date.now() }]);

// Eine neue Fassung enthält alles, was für diese Datei schon wartet: Sie ersetzt es, statt
// sich dahinter zu stellen. Ausnahme: eine noch nicht abgeschickte neue Datei bekommt einfach
// den neuen Text. Was gerade unterwegs ist, wird nie angefasst.
let imFlug = null;
function einreihen(op) {
  let w = lies(K_WARTE) || [];
  if (op.art === 'loeschen') {
    // Nie abgeschickt? Dann war die Datei auf GitHub nie da: beides fällt weg.
    const neu = w.find(o => o.pfad === op.pfad && o.art === 'neu' && o.id !== imFlug);
    w = w.filter(o => o.pfad !== op.pfad || o.id === imFlug);
    return merke(K_WARTE, neu ? w : [...w, op]);
  }
  if (op.art === 'ersetzen') {
    const neu = w.find(o => o.pfad === op.pfad && o.art === 'neu' && o.id !== imFlug);
    if (neu) { neu.text = op.text; return merke(K_WARTE, w); }
    w = w.filter(o => o.pfad !== op.pfad || o.id === imFlug);
  }
  merke(K_WARTE, [...w, op]);
}

let kette = Promise.resolve();
const warteschlangeAbarbeiten = () => (kette = kette.then(abarbeiten, abarbeiten));
async function abarbeiten() {
  // Einträge aus der Fassung vor dem 09.10. haben noch keine id.
  const alt = lies(K_WARTE) || [];
  if (alt.some(o => !o.id)) merke(K_WARTE, alt.map((o, i) => o.id ? o : { ...o, id:`alt-${Date.now()}-${i}` }));
  try {
    for (;;) {
      const op = (lies(K_WARTE) || [])[0];
      if (!op) break;
      imFlug = op.id;
      let r;
      try { r = await senden(op); offline = false; }
      catch (e) {
        if (e instanceof Konflikt) nichtUebernommen(op);        // raus aus der Schlange, aber aufgehoben
        else if (!(e instanceof HttpFehler)) { offline = true; break; }   // kein Netz: beim nächsten Mal
        else {                                                  // echter Fehler: bleibt stehen und hängt
          merke(K_WARTE, (lies(K_WARTE) || []).map(o => o.id === op.id ? { ...o, fehler:e.message, status:e.status } : o));
          break;
        }
      }
      // Was danach für dieselbe Datei wartet, beruht auf dieser eigenen Änderung: sha nachziehen.
      const rest = (lies(K_WARTE) || []).filter(o => o.id !== op.id);
      // Gilt auch fürs Löschen: Wurde eine Datei angelegt und gleich wieder gelöscht, während das
      // Anlegen unterwegs war, kennt das Löschen erst jetzt den sha, den GitHub dafür verlangt.
      if (r && r.vor !== undefined) rest.forEach(o => { if (o.pfad === op.pfad && (o.art === 'ersetzen' || o.art === 'loeschen') && (o.sha ?? null) === r.vor) o.sha = r.nach; });
      merke(K_WARTE, rest);
    }
  } finally { imFlug = null; zusammensetzen(); status(); }
}

// Sofort anzeigen, im Hintergrund senden (seit 09.10.). Der Eintrag steht in der Warteschlange
// und ist damit sofort in der App, ohne auf GitHub zu warten (vorher: eine Netzlaufzeit pro Tipp).
// Scheitert das Senden, steht es oben in der Leiste, die Fassung bleibt aufgehoben, und die
// Ansicht springt auf den echten Stand zurück. Der Hub selbst bekommt keinen Fehler mehr zu sehen.
async function schreiben(op) {
  op.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  einreihen(op); zusammensetzen(); status(); neuStarten();
  warteschlangeAbarbeiten().then(() => {
    if ((lies(K_NICHT) || []).some(n => n.id === op.id)) {
      // Der Hub hat einen veralteten Stand im Kopf. Neu laden und neu aufbauen, sonst
      // überschriebe der nächste Tipp die fremde Änderung mit dem alten Stand.
      laden().then(() => hubStarten());
      return;
    }
    const haengt = (lies(K_WARTE) || []).find(o => o.id === op.id && o.fehler);
    if (haengt) {
      // Echter Fehler (z. B. Schlüssel ohne Recht): aufheben, aus der Schlange nehmen, damit
      // dahinter Wartendes weiterläuft, und die Ansicht auf den echten Stand zurücksetzen.
      nichtUebernommen(op, haengt.fehler);
      merke(K_WARTE, (lies(K_WARTE) || []).filter(o => o.id !== op.id));
      zusammensetzen(); status(); neuStarten();
      warteschlangeAbarbeiten();
    }
  });
}

// ── Obsidian nachbilden ─────────────────────────────────────────
// Frontmatter: nur die einfachen Formen, die im Vault vorkommen (Skalar, [a, b], - Liste).
const wert = s => {
  s = String(s).trim();
  if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map(wert).filter(x => x !== '');
  if (/^".*"$|^'.*'$/.test(s)) return s.slice(1, -1);
  if (s === 'true' || s === 'false') return s === 'true';
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
};
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const o = {}; let key = null;
  if (!m) return { fm:o, body:text };
  for (const z of m[1].split('\n')) {
    const li = z.match(/^\s+-\s*(.*)$/);
    if (li && key) { if (!Array.isArray(o[key])) o[key] = []; o[key].push(wert(li[1])); continue; }
    const kv = z.match(/^([^\s:#][^:]*):\s*(.*)$/);
    if (kv) { key = kv[1].trim(); o[key] = kv[2] === '' ? null : wert(kv[2]); }
  }
  return { fm:o, body:text.slice(m[0].length) };
}
// Listeneinträge wie Dataviews file.lists — ohne Code-Blöcke und HTML-Kommentare.
// `position.start.line` zählt wie Obsidian ab Dateianfang (der Kitchen Hub grenzt damit
// den Grundstock in Vorrat.md unter seiner Überschrift ab).
function listen(body, ab = 0) {
  const out = []; let code = false, kommentar = false;
  for (const [i, z] of body.split('\n').entries()) {
    if (/^\s*```/.test(z)) { code = !code; continue; }
    if (code) continue;
    if (kommentar) { if (z.includes('-->')) kommentar = false; continue; }
    if (z.includes('<!--') && !z.includes('-->')) { kommentar = true; continue; }
    const m = z.match(/^\s*[-*+]\s+(?:\[.\]\s+)?(.*)$/);
    if (m) out.push({ text:m[1].trim(), position:{ start:{ line:ab + i } } });
  }
  return out;
}
// Überschriften wie metadataCache.getFileCache(f).headings.
function ueberschriften(text) {
  const out = []; let code = false;
  text.split('\n').forEach((z, i) => {
    if (/^\s*```/.test(z)) { code = !code; return; }
    const m = !code && z.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (m) out.push({ heading:m[2], level:m[1].length, position:{ start:{ line:i } } });
  });
  return out;
}
// Ein Feld im Frontmatter setzen oder entfernen, Zeile für Zeile: Der Rest der Datei bleibt
// Byte für Byte, wie er war. Neu serialisieren hieße Format-Drift (Anführungszeichen,
// Listenform), und Drift scheitert in den Hubs still.
function yamlWert(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (v == null) return '';
  const t = String(v);
  return /^[\w\-. äöüÄÖÜß]*$/.test(t) && !/^(true|false|null|-?\d+(\.\d+)?)$/.test(t) && t.trim() === t ? t : JSON.stringify(t);
}
function frontmatterAendern(text, fn) {
  let m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) { text = `---\n---\n${text}`; m = text.match(/^---\n([\s\S]*?)\n?---\n?/); }
  const vorher = frontmatter(text).fm, nachher = JSON.parse(JSON.stringify(vorher));
  fn(nachher);
  let zeilen = m[1] ? m[1].split('\n') : [];
  const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const stelle = k => zeilen.findIndex(z => new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(z));
  const ende = i => { let j = i + 1; while (j < zeilen.length && /^\s+-\s|^\s+\S/.test(zeilen[j])) j++; return j; };
  for (const k of new Set([...Object.keys(vorher), ...Object.keys(nachher)])) {
    if (gleich(vorher[k], nachher[k])) continue;
    if (Array.isArray(nachher[k]) || (nachher[k] && typeof nachher[k] === 'object'))
      throw new Error(`Listen im Frontmatter (${k}) am Mac ändern`);
    const i = stelle(k);
    if (!(k in nachher)) { if (i >= 0) zeilen.splice(i, ende(i) - i); continue; }
    const z = `${k}: ${yamlWert(nachher[k])}`;
    if (i >= 0) zeilen.splice(i, ende(i) - i, z); else zeilen.push(z);
  }
  return `---\n${zeilen.join('\n')}${zeilen.length ? '\n' : ''}---\n` + text.slice(m[0].length);
}
// Wie Dataviews DataArray, soweit die Hubs es benutzen: where · sort(schlüssel, 'asc'|'desc') · array.
const datenArray = arr => ({ where:f => datenArray(arr.filter(f)), array:() => arr.slice(),
  sort:(key = x => x, dir = 'asc') => {
    const v = dir === 'desc' ? -1 : 1;
    return datenArray(arr.slice().sort((a, b) => { const x = key(a), y = key(b);
      return x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -v : x > y ? v : 0; }));
  },
  map:f => datenArray(arr.map(f)), filter:f => datenArray(arr.filter(f)), forEach:f => arr.forEach(f),
  values:arr, length:arr.length, [Symbol.iterator]:() => arr[Symbol.iterator]() });

function shim(root) {
  const seiten = {};
  const seite = p => {
    if (!dateien[p] || !p.endsWith('.md')) return null;
    if (!seiten[p]) {
      const { fm, body } = frontmatter(dateien[p].text);
      const ab = dateien[p].text.slice(0, dateien[p].text.length - body.length).split('\n').length - 1;
      seiten[p] = { ...fm, file:{ path:p, name:p.split('/').pop().replace(/\.md$/, ''),
        folder:p.split('/').slice(0, -1).join('/'), lists:datenArray(listen(body, ab)) } };   // wie Dataview: .values ist das Array
    }
    return seiten[p];
  };
  const datei = p => (dateien[p] || bilder[p]) ? { path:p, name:p.split('/').pop(),
    basename:p.split('/').pop().replace(/\.[^.]+$/, ''), extension:p.split('.').pop() } : null;
  const loeschen = async f => {
    if (!dateien[f.path]) return;
    await schreiben({ art:'loeschen', pfad:f.path, sha:(lies(K_CACHE) || {})[f.path]?.sha ?? null });
  };
  const dv = {
    pages: src => { const o = String(src).replace(/^"|"$/g, '');
      return datenArray(Object.keys(dateien).filter(p => p.endsWith('.md') && p.startsWith(o + '/')).sort().map(seite)); },
    page: p => seite(p.endsWith('.md') ? p : p + '.md'),
    current: () => seite(HUB),
    el: (tag, text) => { const e = document.createElement(tag); if (text) e.textContent = text; root.appendChild(e); return e; },
  };
  const app = {
    vault: {
      getAbstractFileByPath: datei,
      read: async f => dateien[f.path]?.text ?? '',
      cachedRead: async f => dateien[f.path]?.text ?? '',
      create: async (p, text) => {
        if (dateien[p]) throw new Error(`${p} gibt es schon`);
        await schreiben({ art:'neu', pfad:p, text }); return datei(p);
      },
      // Fotos (Kitchen Hub, Stufe 3): sofort im Bilder-Speicher, damit der Hub sie gleich zeigt,
      // dann über die Warteschlange zu GitHub — vor dem Eintrag, der auf sie zeigt.
      createBinary: async (p, puffer) => {
        if (bilder[p]) throw new Error(`${p} gibt es schon`);
        const blob = new Blob([puffer], { type: /\.png$/i.test(p) ? 'image/png' : 'image/jpeg' });
        if ('caches' in window) await (await caches.open(`${APP.praefix}-bilder`)).put(`/bild/${pfadUrl(p)}`, new Response(blob));
        bilder[p] = URL.createObjectURL(blob);
        const by = new Uint8Array(puffer); let bin = '';
        for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode(...by.subarray(i, i + 0x8000));
        await schreiben({ art:'bild', pfad:p, b64:btoa(bin) }); return datei(p);
      },
      // Beginnt der neue Text mit dem alten, wird nur angehängt (Cardio, Wiegen): Das verträgt
      // sich mit allem, was der Mac inzwischen angehängt hat. Sonst Umschreiben mit Prüfung.
      modify: async (f, text) => {
        const basis = (dateien[f.path]?.text ?? '').replace(/\s*$/, '');
        if (text.replace(/\s*$/, '') === basis) return;            // nichts geändert, nichts senden
        if (text.startsWith(basis)) return schreiben({ art:'anhang', pfad:f.path, text:text.slice(basis.length) });
        await schreiben({ art:'ersetzen', pfad:f.path, text, sha:(lies(K_CACHE) || {})[f.path]?.sha ?? null });
      },
      // Papierkorb: Auf GitHub gelöscht ist zurückholbar (die Geschichte bleibt), wie Obsidians .trash.
      trash: loeschen, delete: loeschen,
      getResourcePath: f => bilder[f.path] || '',
      adapter: { getFullPath: p => p },
    },
    fileManager: {
      // Den aktiven Plan stellt nur der Mac um: Er steht im Frontmatter des Hubs selbst.
      processFrontMatter: async (f, fn) => {
        if (f.path === HUB) throw new Error('Plan am Mac umstellen');
        await app.vault.modify(f, frontmatterAendern(dateien[f.path]?.text ?? '', fn));
      },
      trashFile: loeschen,
    },
    metadataCache: {
      getFileCache: f => dateien[f?.path] ? { headings:ueberschriften(dateien[f.path].text), frontmatter:frontmatter(dateien[f.path].text).fm } : null,
    },
    // Am Handy gibt es kein Obsidian: Notizen zeigt der Leser, Befehle laufen ins Leere.
    workspace: {
      getLeaf: () => ({ openFile: f => f && leserOeffnen(f.path) }),
      openLinkText: (link, quelle) => {
        const n = String(link).split('|')[0].replace(/#.*$/, '');
        const p = [n, `${n}.md`, String(quelle || '').replace(/[^/]*$/, '') + `${n}.md`].find(x => dateien[x])
          || Object.keys(dateien).find(x => x.endsWith(`/${n}.md`) || x === `${n}.md`);
        if (p) leserOeffnen(p);
      },
    },
    commands: { executeCommandById: () => false },
    // Wie Obsidian am Handy: Der Kitchen Hub bietet dann statt Claudian die Warteschlange an.
    isMobile: true,
  };
  const require = name => {
    if (name !== 'fs') throw new Error(`Modul ${name} gibt es hier nicht`);
    return { readFileSync: p => { if (dateien[p]) return dateien[p].text; throw new Error(`${p} nicht geladen`); } };
  };
  return { dv, app, require };
}


// ── Leser: Notiz öffnen ─────────────────────────────────────────
// Am Mac öffnet ein Hub Notizen in Obsidian (Rezept antippen → die Rezeptnotiz). Am Handy
// gibt es kein Obsidian, deshalb zeigt die App die Notiz selbst, als Blatt über dem Hub.
// Nur lesen: Die Haken an Zutaten und Schritten sind zum Mitkochen und werden nicht gespeichert.
// Solange das Blatt offen ist, bleibt der Bildschirm an (Wake Lock), sonst geht er beim Kochen aus.
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function bildZu(name) {
  const n = String(name).split('|')[0].trim();
  if (bilder[n]) return bilder[n];
  const k = Object.keys(bilder).find(p => p.split('/').pop() === n.split('/').pop());
  return k ? bilder[k] : null;
}
function zeile(t) {
  return esc(t)
    .replace(/!\[\[([^\]]+)\]\]/g, (m, n) => { const u = bildZu(n.replace(/&amp;/g, '&')); return u ? `<img src="${u}" alt="">` : ''; })
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, (m, n) => n.split('/').pop().replace(/#.*$/, ''))
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
}
function markdown(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const out = []; let liste = null, tabelle = null, code = null, absatz = [];
  const schliessen = () => {
    if (absatz.length) { out.push(`<p>${absatz.map(zeile).join('<br>')}</p>`); absatz = []; }
    if (liste) { out.push(`</${liste}>`); liste = null; }
    if (tabelle) { out.push(`<div class="le-tab"><table>${tabelle.join('')}</table></div>`); tabelle = null; }
  };
  for (const z of body.split('\n')) {
    if (code !== null) { if (/^\s*```/.test(z)) { out.push(`<pre>${esc(code)}</pre>`); code = null; } else code += z + '\n'; continue; }
    if (/^\s*```/.test(z)) { schliessen(); code = ''; continue; }
    if (/^\s*%%/.test(z) || /^\s*<!--.*-->\s*$/.test(z)) continue;
    let m;
    if (!z.trim()) { schliessen(); continue; }
    if ((m = z.match(/^(#{1,6})\s+(.*)$/))) { schliessen(); const h = Math.min(4, Math.max(2, m[1].length)); out.push(`<h${h}>${zeile(m[2])}</h${h}>`); continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(z)) { schliessen(); out.push('<hr>'); continue; }
    if (/^\s*\|/.test(z)) {
      if (!tabelle) { schliessen(); tabelle = []; }
      if (/^\s*\|?\s*:?-{2,}/.test(z)) continue;
      const zellen = z.trim().replace(/^\||\|$/g, '').split('|').map(c => `<td>${zeile(c.trim())}</td>`);
      tabelle.push(`<tr>${zellen.join('')}</tr>`); continue;
    }
    if ((m = z.match(/^\s*>\s?(.*)$/))) { schliessen(); const c = m[1].replace(/^\[![^\]]+\][-+]?\s*/, ''); if (c) out.push(`<blockquote>${zeile(c)}</blockquote>`); continue; }
    if ((m = z.match(/^(\s*)([-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/))) {
      const art = /\d/.test(m[2]) ? 'ol' : 'ul';
      if (absatz.length || tabelle) { const l = liste; liste = null; schliessen(); liste = l; }
      if (liste !== art) { if (liste) out.push(`</${liste}>`); out.push(`<${art}>`); liste = art; }
      const haken = m[3] !== undefined || art === 'ol';
      out.push(`<li class="${haken ? 'le-hak' : ''}${m[3] && m[3] !== ' ' ? ' an' : ''}" style="margin-left:${Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)) * 16}px">${zeile(m[4])}</li>`);
      continue;
    }
    if (liste || tabelle) schliessen();
    absatz.push(z.trim());
  }
  schliessen(); if (code !== null) out.push(`<pre>${esc(code)}</pre>`);
  return out.join('');
}
// Rezepte (type: recipe) als Kochansicht (10.10.): Zutaten und Zubereitung oben, alles andere
// (Werte, Notizen, Wiegeliste, Info-Kästen) eingeklappt am Ende. Sortiert wird nach Überschrift,
// die Notiz bleibt unverändert. Ohne passende Überschrift zeigt der Leser alles wie bisher.
const KOCHEN = /🛒|🔥|📦|zutaten|zubereitung|bausteine|produkt/i;
function kochteile(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const teile = []; let akt = { kopf:null, zeilen:[] }, imCode = false;
  for (const z of body.split('\n')) {
    if (/^\s*```/.test(z)) imCode = !imCode;
    if (!imCode && /^#{1,6}\s/.test(z)) { teile.push(akt); akt = { kopf:z, zeilen:[z] }; continue; }
    akt.zeilen.push(z);
  }
  teile.push(akt);
  const koch = teile.filter(t => t.kopf && KOCHEN.test(t.kopf));
  if (!koch.length) return null;
  const rest = teile.filter(t => !koch.includes(t) && !/^#\s/.test(t.kopf || '') && t.zeilen.some(z => z.trim() && !/^#\s/.test(z)));
  const text_ = l => l.map(t => t.zeilen.join('\n')).join('\n\n');
  return { koch:text_(koch), rest:rest.length ? text_(rest) : '' };
}
// `video:` an der Rezeptnotiz (Adresse oder Liste): ein Knopf, der YouTube, TikTok oder Instagram öffnet.
function videoKnoepfe(v) {
  const liste = (Array.isArray(v) ? v : [v]).filter(u => typeof u === 'string' && /^https?:\/\//.test(u.trim()));
  const name = u => /youtu/.test(u) ? 'YouTube' : /tiktok/.test(u) ? 'TikTok' : /instagram/.test(u) ? 'Instagram' : 'Video';
  return liste.length ? `<div class="le-videos">${liste.map(u => `<a class="le-video" href="${esc(u.trim())}" target="_blank" rel="noopener">▶ ${name(u)}</a>`).join('')}</div>` : '';
}
// ── Kochlauf (seit 10.10.) ───────────────────────────────────────────────────
// Rezepte öffnen erst zum Lesen; „Kochen starten“ führt durch Wählen · Vorbereiten · Kochen.
// Die Rechnung (Bausteine, Summen, letzte Wahl) liefert der Hub über window.__kh, die App
// zeichnet nur. Der Stand liegt im Speicher des Handys, nie in der Notiz: Er übersteht den
// Wechsel zu TikTok und verfällt nach „Fertig“ + Schließen oder nach 12 Stunden.
// Warum: MindOS/05 Stack/Context/Decisions/Kochlauf statt statischer Rezeptnotiz.md
const LAUF_DAUER = 12 * 3600 * 1000;
const laufKey = pfad => `${APP.praefix}-lauf:${pfad}`;
function laufLesen(pfad) {
  const l = lies(laufKey(pfad));
  if (!l || Date.now() - l.zeit > LAUF_DAUER) { localStorage.removeItem(laufKey(pfad)); return null; }
  return l;
}
const VORBEREITEN = /🛒|📦|zutaten|bausteine|produkt/i;
const normLauf = t => String(t).toLowerCase().replace(/[-–—]/g, ' ');
// Zeilen, die eine NICHT gewählte Option nennen, fallen aus dem Lauf. Bleibt von einer Liste
// nichts übrig, fällt auch ihre Zwischenüberschrift („**Dazu**“).
function nurGewaehltes(text, gruppen, wahl) {
  const alle = gruppen.flatMap(g => g.optionen), liste = z => /^\s*([-*+]|\d+[.)])\s/.test(z);
  return text.split(/\n\s*\n/).map(block => {
    const zeilen = block.split('\n');
    const rest = zeilen.filter(z => {
      if (!liste(z)) return true;
      const genannt = alle.filter(o => normLauf(z).includes(normLauf(o)));
      return !genannt.length || genannt.some(o => wahl.includes(o));
    });
    return zeilen.some(liste) && !rest.some(liste) && !rest.some(z => /^#{1,6}\s/.test(z)) ? null : rest.join('\n');
  }).filter(b => b !== null).join('\n\n');
}
const LZEIT = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.2 1.4"/></svg>';
const LPFEIL = '<svg class="p" width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 3.8 2.5 2.5 2.5-2.5"/></svg>';
function laufMakros(s) {
  const z = (v, g) => s && v != null ? Math.round(v) + (g ? '<small> g</small>' : '') : '–';
  return `<div class="lm${s ? '' : ' leer'}"><div><b>${z(s && s.kcal)}</b><span>kcal</span></div><div><b>${z(s && s.carbs, 1)}</b><span>Kohlenhydrate</span></div><div class="eiw"><b>${z(s && s.protein, 1)}</b><span>Eiweiß</span></div><div><b>${z(s && s.fat, 1)}</b><span>Fett</span></div></div>`;
}
function laufBild(r, bild, wahl) {
  const w = r.klasse === 'Baukasten' ? wahl.filter(Boolean).join(' + ') : '';
  return `<div class="lh"${bild ? ` style="background-image:url('${bild}')"` : ''}><div class="lh-t"><div class="lh-n">${esc(r.name)}</div><div class="lh-m"><b>${esc(r.klasse)}</b>${r.dauer ? `<span>${LZEIT}${esc(r.dauer)} Min</span>` : ''}${w ? `<span class="wahl">${esc(w)}</span>` : ''}</div></div></div>`;
}
function kochlaufOeffnen(pfad, text, fm, bild, zu) {
  const r = window.__kh.rezept(pfad);
  const el = document.getElementById('leser');
  let L = laufLesen(pfad);   // { phase, wahl, mengen, haken, offen, zeit }
  let phase = L ? L.phase : 'lesen';
  const speichern = () => { L.zeit = Date.now(); merke(laufKey(pfad), L); };
  const zeichnen = () => {
    const alt = el.querySelector('.le-inhalt'), y = alt ? alt.scrollTop : 0;
    const wahl = L ? L.wahl : r.wahl, mengen = L ? L.mengen : r.mengen;
    let inhalt = laufBild(r, bild, wahl) + laufMakros(r.summe(wahl, mengen)) + videoKnoepfe(fm.video);
    if (phase === 'lesen') {
      const t = kochteile(text);
      inhalt += markdown(t.koch) + (t.rest ? `<details class="le-mehr"><summary>Werte und Notizen</summary>${markdown(t.rest)}</details>` : '')
        + '<div class="lf"><button data-los>Kochen starten</button></div>';
    } else if (phase === 'waehlen') {
      inhalt += r.gruppen.map((g, gi) => {
        const auf = L.offen === gi || (L.offen == null && gi === 0 && !L.wahl.some(Boolean));
        return `<div class="lr${auf ? ' auf' : ''}" data-reihe="${gi}" role="button"><span class="l">${esc(g.name)}</span><span class="w${L.wahl[gi] ? '' : ' leer'}">${esc(L.wahl[gi] || 'keine')}</span>${LPFEIL}</div>`
          + (auf ? `<div class="lc">${g.optionen.map(o => `<span class="${L.wahl[gi] === o ? 'an' : ''}" data-g="${gi}" data-o="${esc(o)}" role="button">${esc(o)}</span>`).join('')}</div>` : '');
      }).join('');
      const tl = r.teile(L.wahl, L.mengen);
      if (Array.isArray(tl) && tl.length) inhalt += '<div class="lt">Mengen</div><div class="lb">' + tl.map(b => {
        const sch = b.schritt, menge = b.n == null ? (sch ? `? ${sch.e}` : '?') : (sch ? `${Math.round(b.n * sch.g * 100) / 100} ${sch.e}` : b.n);
        return `<div class="${b.n == null ? 'offen' : ''}"><span class="n">${esc(b.name)}</span><span class="ls"><span data-m="${esc(b.name)}" data-d="-1" role="button">−</span><span class="z">${esc(menge)}</span><span data-m="${esc(b.name)}" data-d="1" role="button">+</span></span><span class="k">${b.n == null ? 'Menge?' : b.kcal == null ? '' : Math.round(b.kcal * b.n) + ' kcal'}</span></div>`;
      }).join('') + '</div>';
      inhalt += '<div class="lf"><button data-weiter>Weiter</button></div>';
    } else {
      const t = kochteile(nurGewaehltes(text, r.gruppen, L.wahl));
      let n = 0;
      inhalt += t.koch.split(/\n(?=#{1,6}\s)/).map(a => {
        const art = VORBEREITEN.test(a.split('\n')[0]) ? 'v' : 'k';
        return markdown(a).replace(/<li class="le-hak/g, () => `<li data-n="${n++}" data-art="${art}" class="le-hak`);
      }).join('') + '<div id="lf"></div>';
    }
    el.innerHTML = `<div class="le-blatt" role="dialog" aria-modal="true"><div class="le-kopf ohne-titel"><b></b>${phase === 'lesen' ? '<span style="flex:1"></span>' : '<div class="kf"></div>'}<button class="le-zu" aria-label="Schließen">✕</button></div><div class="le-inhalt">${inhalt}</div></div>`;
    el.querySelector('.le-inhalt').scrollTop = y;
    el.querySelector('.le-zu').onclick = schliessen;
    if (phase === 'kochen') { el.querySelectorAll('li[data-n]').forEach(li => li.classList.toggle('an', L.haken.includes(li.dataset.n))); balken(false); }
    else if (phase === 'waehlen') balken(false, true);
  };
  // Zwei Balken neben dem ✕. Wird einer voll, leuchtet er kurz auf; der nächste offene Schritt steht groß.
  let voll = { v:false, k:false };
  const balken = (lebendig, leer) => {
    const alle = [...el.querySelectorAll('li[data-n]')];
    const zahl = art => { const l = alle.filter(li => li.dataset.art === art); return { n: leer ? 0 : l.filter(li => L.haken.includes(li.dataset.n)).length, von: leer ? 1 : l.length }; };
    const v = zahl('v'), k = zahl('k'), vV = !leer && v.n === v.von, kV = !leer && k.n === k.von;
    const bV = lebendig && vV && !voll.v, bK = lebendig && kV && !voll.k;
    voll = { v:vV, k:kV };
    el.querySelector('.kf').innerHTML = [['Vorbereiten', v, vV, bV], ['Kochen', k, kV, bK]].filter(x => x[1].von).map(([l, x, ok, b]) =>
      `<div class="kf-teil${ok ? ' voll' : ''}${b ? ' blitz' : ''}"><div class="kf-l">${l}${ok ? ' ✓' : ''}</div><div class="kf-spur"><div class="kf-fuell" style="width:${x.n / x.von * 100}%"></div></div></div>`).join('');
    if (leer) return;
    alle.forEach(li => li.classList.remove('jetzt'));
    if (vV) alle.find(li => li.dataset.art === 'k' && !L.haken.includes(li.dataset.n))?.classList.add('jetzt');
    const fertig = vV && kV, fuss = el.querySelector('#lf');
    fuss.className = fertig ? 'lf' : ''; fuss.innerHTML = fertig ? '<button data-eintragen>Als gegessen eintragen</button>' : '';
    if (L) { L.fertig = fertig; speichern(); }
  };
  // Nach „Fertig“ ist der Lauf vorbei: Schließen räumt ihn ab.
  const schliessen = () => { if (L && L.fertig) localStorage.removeItem(laufKey(pfad)); zu(); };
  el.onclick = e => {
    if (e.target === el) return schliessen();
    const t = e.target.closest('[data-los],[data-weiter],[data-reihe],[data-g],[data-m],[data-eintragen],li[data-n]'); if (!t) return;
    if (t.dataset.los != null) {
      L = { phase:'waehlen', wahl:[...r.wahl], mengen:{ ...r.mengen }, haken:[], offen:null };
      phase = L.phase = r.gruppen.length ? 'waehlen' : 'kochen'; speichern();
      el.querySelector('.le-inhalt').scrollTop = 0; return zeichnen();
    }
    if (t.dataset.weiter != null) { phase = L.phase = 'kochen'; speichern(); el.querySelector('.le-inhalt').scrollTop = 0; return zeichnen(); }
    if (t.dataset.reihe != null) { const gi = +t.dataset.reihe; L.offen = L.offen === gi ? null : gi; speichern(); return zeichnen(); }
    if (t.dataset.g != null) { const gi = +t.dataset.g; L.wahl[gi] = L.wahl[gi] === t.dataset.o ? null : t.dataset.o; L.offen = null; speichern(); return zeichnen(); }
    if (t.dataset.m != null) {
      const b = (r.teile(L.wahl, L.mengen) || []).find(x => x.name === t.dataset.m); if (!b) return;
      const n = (b.n == null ? 0 : b.n) + Number(t.dataset.d);
      if (n >= 0) L.mengen[b.name] = n; speichern(); return zeichnen();
    }
    if (t.dataset.eintragen != null) {
      const { wahl, mengen } = L;
      localStorage.removeItem(laufKey(pfad)); L = null; zu();
      return window.__kh.eintragen(pfad, wahl, mengen);
    }
    const k = t.dataset.n, i = L.haken.indexOf(k);
    i < 0 ? L.haken.push(k) : L.haken.splice(i, 1);
    t.classList.toggle('an', i < 0); balken(true);
  };
  zeichnen();
  if (phase === 'kochen') voll = { v:false, k:false }, balken(false);
}

let wachSperre = null;
async function leserOeffnen(pfad) {
  const d = dateien[pfad]; if (!d) return;
  document.getElementById('leser')?.remove();
  const { fm } = frontmatter(d.text);
  const titelbild = typeof fm.banner === 'string' ? bilder[fm.banner] : null;
  const teile = fm.type === 'recipe' ? kochteile(d.text) : null;
  const inhalt = (fm.type === 'recipe' ? videoKnoepfe(fm.video) : '') + (teile
    ? markdown(teile.koch) + (teile.rest ? `<details class="le-mehr"><summary>Werte und Notizen</summary>${markdown(teile.rest)}</details>` : '')
    : markdown(d.text));
  const el = document.createElement('div'); el.id = 'leser';
  el.innerHTML = `<div class="le-blatt" role="dialog" aria-modal="true">
    <div class="le-kopf"><b>${esc(pfad.split('/').pop().replace(/\.md$/, ''))}</b><button class="le-zu" aria-label="Schließen">✕</button></div>
    <div class="le-inhalt">${titelbild ? `<img class="le-banner" src="${titelbild}" alt="">` : ''}${inhalt}</div></div>`;
  document.body.appendChild(el); document.body.classList.add('le-offen');
  const zu = () => { el.remove(); document.body.classList.remove('le-offen'); wachSperre?.release().catch(() => {}); wachSperre = null; };
  // Rezepte mit Zutaten oder Zubereitung laufen als Kochlauf, sobald der Hub seine Rechnung anbietet.
  if (teile && window.__kh?.rezept(pfad)) kochlaufOeffnen(pfad, d.text, fm, titelbild, zu);
  else {
    el.querySelector('.le-zu').onclick = zu;
    el.addEventListener('click', e => { if (e.target === el) zu(); const li = e.target.closest('.le-hak'); if (li) li.classList.toggle('an'); });
  }
  try { wachSperre = await navigator.wakeLock?.request('screen'); } catch {}
}
// Kommt die App zurück in den Vordergrund, gibt iOS die Sperre frei: neu anfordern, solange das Blatt offen ist.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !document.getElementById('leser')) return;
  try { wachSperre = await navigator.wakeLock?.request('screen'); } catch {}
});

// ── Hub ausführen ───────────────────────────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const hubEl = document.getElementById('hub');
let laeuft = false, nochmal = false, zeitplan = null;

async function hubStarten() {
  if (laeuft) { nochmal = true; return; }
  laeuft = true;
  try {
    const code = (dateien[HUB]?.text.match(/^```dataviewjs[^\n]*\n([\s\S]*?)^```\s*$/m) || [])[1];
    if (!code) { hubEl.innerHTML = `<div class="ta-fehler">${HUB_NAME} nicht gefunden.</div>`; return; }
    const root = document.createElement('div');
    hubEl.replaceChildren(root);
    const { dv, app, require } = shim(root);
    try { await new AsyncFunction('dv', 'app', 'require', code)(dv, app, require); }
    catch (e) { console.error(e); root.insertAdjacentHTML('beforeend', `<div class="ta-fehler">Der Hub-Code ist abgestürzt: ${String(e.message || e).replace(/</g, '&lt;')}</div>`); }
    if (APP.rad) zahlenfelder(root);
    // Was eine App am fertigen Hub fürs Handy umstellt (z. B. Symbol über Wort in der Leiste).
    try { APP.nachStart?.(root); } catch (e) { console.warn('nachStart', e); }
  } finally {
    laeuft = false;
    if (nochmal) { nochmal = false; hubStarten(); }
  }
}
// Wie Obsidian: Nach einem Schreibvorgang baut sich der Block kurz danach neu auf.
// Der Abstand lässt den Hub erst seinen Dialog schließen und die Meldung setzen.
const neuStarten = () => { clearTimeout(zeitplan); zeitplan = setTimeout(hubStarten, 60); };

// Am Handy keine Tastatur für die Sätze, sondern das Rad (Wdh × kg). Die Felder bleiben die des Hubs,
// das Rad füllt sie nur. Sonst (Notiz, Cardio, Wiegen) die Zahlentastatur statt der vollen.
function zahlenfelder(root) {
  const setzen = () => {
    root.querySelectorAll('.tr-satz .tr-in').forEach(i => { i.readOnly = true; i.inputMode = 'none'; });
    root.querySelectorAll('.g-g:not([readonly])').forEach(i => { i.inputMode = 'decimal'; });
  };
  setzen(); new MutationObserver(setzen).observe(root, { childList:true, subtree:true });
}

// ── Rad ─────────────────────────────────────────────────────────
// Zwei Walzen, die beim Scrollen einrasten. Das Scrollen macht das iPhone selbst,
// deshalb fühlen sich Schwung und Einrasten an wie in einer echten App. Kein Ticken:
// Web-Apps dürfen den Vibrationsmotor nicht ansprechen.
const ZEILE = 44;
const WDH = ['', ...Array.from({ length:40 }, (_, i) => String(i + 1))];
const KG_RASTER = ['', ...Array.from({ length:241 }, (_, i) => String(+(i * 1.25).toFixed(2)))];   // 0 … 300 kg
const kgAnz = v => v === '' ? '–' : v.replace('.', ',');
let rad = null;

function radSchliessen() { rad?.el.remove(); rad = null; }

function radOeffnen(zeile) {
  radSchliessen();
  const ue = zeile.closest('.tr-ue');
  const wIn = zeile.querySelector('.g-w'), gIn = zeile.querySelector('.g-g');
  const gJetzt = gIn.value.trim().replace(',', '.');
  // Gewichte außerhalb des 1,25er-Rasters (Maschinen mit 84 kg) bleiben wählbar: Sie kommen dazu.
  const kg = KG_RASTER.includes(String(+gJetzt)) || gJetzt === '' ? KG_RASTER
    : [...KG_RASTER, String(+gJetzt)].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a - b));
  const nr = [...ue.querySelectorAll('.tr-satz')].indexOf(zeile) + 1;
  const el = document.createElement('div');
  el.id = 'rad';
  el.innerHTML = `<div class="rad-blatt">
    <div class="rad-kopf"><div><b>Satz ${nr}</b><span>${ue.querySelector('.tr-ue-kopf b').textContent}</span></div>
      <button class="rad-weiter">Nächster</button><button class="rad-ok" aria-label="Fertig">✓</button></div>
    <div class="rad-walzen"><div class="rad-band"></div>
      <div class="rad-walze" data-f="w">${WDH.map(v => `<div>${v || '–'}</div>`).join('')}</div>
      <div class="rad-mal">×</div>
      <div class="rad-walze" data-f="g">${kg.map(v => `<div>${kgAnz(v)}</div>`).join('')}</div>
      <div class="rad-einheit">kg</div></div></div>`;
  document.body.appendChild(el);
  rad = { el, zeile };
  const walzen = { w:[el.querySelector('[data-f="w"]'), WDH, wIn], g:[el.querySelector('[data-f="g"]'), kg, gIn] };
  for (const [walze, werte, feld] of Object.values(walzen)) {
    const jetzt = feld === gIn ? (gJetzt === '' ? '' : String(+gJetzt)) : feld.value.trim();
    walze.scrollTop = Math.max(0, werte.indexOf(jetzt)) * ZEILE;
    let t = null;
    walze.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const v = werte[Math.min(werte.length - 1, Math.max(0, Math.round(walze.scrollTop / ZEILE)))];
        feld.value = feld === gIn ? (v === '' ? '' : v.replace('.', ',')) : v;
      }, 90);
    }, { passive:true });
  }
  el.addEventListener('click', e => { if (e.target === el) radSchliessen(); });
  el.querySelector('.rad-ok').onclick = radSchliessen;
  el.querySelector('.rad-weiter').onclick = () => {
    const alle = [...document.querySelectorAll('#tr-dlg .tr-satz:not(.aus)')];
    const naechste = alle[alle.indexOf(zeile) + 1];
    naechste ? radOeffnen(naechste) : radSchliessen();
  };
}
hubEl.addEventListener('click', e => {
  const feld = e.target.closest('.tr-satz .tr-in');
  if (feld) radOeffnen(feld.closest('.tr-satz'));
});

// ── Statuszeile: nur, wenn es etwas zu sagen gibt ───────────────
const statusEl = document.getElementById('status');
let offline = false;
function status() {
  const w = lies(K_WARTE) || [], fehler = w.find(o => o.fehler), nicht = lies(K_NICHT) || [];
  const stand = lies(K_STAND);
  const letzter = nicht[nicht.length - 1];
  const text = nicht.length ? `Nicht übernommen: ${[...new Set(nicht.map(n => dateiName(n.pfad)))].join(', ')} — ${letzter.grund || 'am Mac geändert'}. Tippen zum Ausblenden.`
    : fehler ? `Eintrag hängt: ${fehler.fehler}`
    : w.length && offline ? `${w.length} ${w.length === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Netz`
    : offline ? `Offline · Stand ${stand ? new Date(stand).toLocaleString('de-DE', { weekday:'short', hour:'2-digit', minute:'2-digit' }) : 'unbekannt'}`
    : '';
  statusEl.textContent = text;
  statusEl.className = text ? 'an' + (fehler || nicht.length ? ' fehler' : '') : '';
}
// Ausblenden heißt nicht löschen: Die Fassungen bleiben unter <praefix>-nicht-alt liegen.
statusEl.addEventListener('click', () => {
  const nicht = lies(K_NICHT) || []; if (!nicht.length) return;
  merke(K_NICHT + '-alt', [...(lies(K_NICHT + '-alt') || []), ...nicht].slice(-20));
  localStorage.removeItem(K_NICHT); status();
});

// ── Einrichten: einmal den Schlüssel eintragen ──────────────────
function einrichten(meldung = '') {
  const k = lies(K_KONF) || { repo:'kuyajstn/MindOS', branch:'main', token:'' };
  document.getElementById('einrichten').hidden = false;
  hubEl.hidden = true;
  const f = document.getElementById('ein-form');
  f.repo.value = k.repo; f.token.value = '';
  document.getElementById('ein-meldung').textContent = meldung;
  f.onsubmit = async e => {
    e.preventDefault();
    const neu = { repo:f.repo.value.trim(), branch:'main', token:f.token.value.trim() };
    const knopf = f.querySelector('button'); knopf.disabled = true; knopf.textContent = 'Prüfe …';
    merke(K_KONF, neu);
    try {
      if (!await gh(HUB)) throw new Error(`${HUB_NAME} im Repo nicht gefunden`);
      document.getElementById('einrichten').hidden = true; hubEl.hidden = false;
      await start();
    } catch (err) {
      localStorage.removeItem(K_KONF);
      document.getElementById('ein-meldung').textContent =
        err.status === 401 ? 'Der Schlüssel stimmt nicht.' : err.status === 404 || err.status === 403
        ? 'Kein Zugriff aufs Repo. Hat der Schlüssel „Contents: Read and write“ für MindOS?' : (err.message || 'Kein Netz?');
    } finally { knopf.disabled = false; knopf.textContent = 'Verbinden'; }
  };
}

// ── Start ───────────────────────────────────────────────────────
async function laden() {
  try {
    offline = false;
    const geaendert = await aktualisieren();
    await warteschlangeAbarbeiten();
    zusammensetzen();
    const n = Object.keys(bilder).length;
    await bilderBereitlegen(true);
    return geaendert || Object.keys(bilder).length !== n;
  } catch (e) {
    if (e instanceof HttpFehler && e.status === 401) { einrichten('Der Schlüssel ist abgelaufen oder wurde zurückgezogen.'); return false; }
    offline = true; console.warn(e); return false;
  } finally { status(); }
}

async function start() {
  zusammensetzen();
  await bilderBereitlegen(false).catch(() => {});
  if (dateien[HUB]) hubStarten();             // sofort aus dem Cache, auch ohne Netz
  if (await laden() || !hubEl.firstChild) hubStarten();
  if (DEV) testKlick();
}

// Nur im Testmodus: Ansicht und Klick per Adresse, für Bildschirmfotos ohne Schreiben.
function testKlick() {
  // Mehrere Schritte mit | getrennt; „Selektor=Wert" füllt ein Feld statt zu klicken.
  const q = new URLSearchParams(location.search).get('klick');
  (q ? q.split('|') : []).forEach((s, i) => setTimeout(() => {
    const [sel, val] = s.split('=>'); const e = document.querySelector(sel);
    if (!e) return; if (val != null) e.value = val; else e.click();
  }, 300 + i * 400));
}
if (DEV) {
  const q = new URLSearchParams(location.search);
  window.__trUI = { view:q.get('view') || 'heute', tag:q.get('tag') || null };
}

window.addEventListener('online', () => laden().then(g => g && hubStarten()));
// Zurück in die App: neu laden. Neu aufgebaut wird nur, wenn sich etwas geändert hat oder
// ein neuer Tag ist — sonst wären halb ausgefüllte Dialoge weg, wenn man kurz in GymBook schaut.
const tagHeute = () => new Date().toDateString();
let tagGestartet = tagHeute();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !konf()) return;
  laden().then(g => { if (g || tagGestartet !== tagHeute()) { tagGestartet = tagHeute(); hubStarten(); } });
});

if (!DEV && 'serviceWorker' in navigator) navigator.serviceWorker.register(APP.sw || './sw.js');
if (konf()) start(); else einrichten();
