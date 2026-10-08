// ═══════════════════════════════════════════════════════════════
//   TRAINING-APP fürs Handy
//   Führt den ECHTEN Code des Training Hubs aus (MindOS/02 Life OS/Training Hub.md),
//   geladen aus dem Vault-Repo auf GitHub. Diese Datei bildet nur die 14 Stellen
//   nach, an denen der Hub Obsidian anspricht (dv.*, app.vault.*, require('fs')).
//   Ändert sich der Hub, ändert sich die App beim nächsten Öffnen mit.
//
//   Schreiben: neue Dateien (Gym-Logs) und Anhängen (Cardio, Körperdaten) direkt
//   per GitHub-API. Ohne Netz in eine Warteschlange, abgeschickt, sobald Netz da ist.
//   Am Mac holt der automatische Spielstand die Einträge alle 10 Minuten herunter.
//   Warum so: MindOS/05 Stack/Context/Decisions/Training-App am Handy führt den Hub-Code aus.md
// ═══════════════════════════════════════════════════════════════

const HUB     = '02 Life OS/Training Hub.md';
const DATEIEN = [HUB, '02 Life OS/Körperdaten.md', '99 System/Utility/Templates/Training Log.md',
                 '99 System/Utility/Views/Koerper/koerper.json'];
const ORDNER  = ['02 Life OS/Training Logs'];

const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
const API = DEV ? '/gh' : 'https://api.github.com';
const K_KONF = 'tr-konf', K_CACHE = 'tr-cache', K_WARTE = 'tr-warte', K_STAND = 'tr-stand';

const lies  = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const merke = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const konf  = () => DEV ? { repo:'dev/vault', branch:'main', token:'' } : lies(K_KONF);

// ── GitHub ──────────────────────────────────────────────────────
const pfadUrl = p => p.split('/').map(encodeURIComponent).join('/');
const ausB64  = b => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\s/g, '')), c => c.charCodeAt(0)));
function zuB64(s) {
  const by = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode(...by.subarray(i, i + 0x8000));
  return btoa(bin);
}
class HttpFehler extends Error { constructor(status, text) { super(text); this.status = status; } }

async function gh(pfad, { methode = 'GET', body } = {}) {
  const k = konf();
  const url = `${API}/repos/${k.repo}/contents/${pfadUrl(pfad)}${methode === 'GET' ? `?ref=${encodeURIComponent(k.branch)}` : ''}`;
  const r = await fetch(url, {
    method: methode, cache: 'no-store',
    headers: { 'Accept':'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28',
               ...(k.token ? { 'Authorization':`Bearer ${k.token}` } : {}),
               ...(body ? { 'Content-Type':'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 404 && methode === 'GET') return null;
  if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch {} throw new HttpFehler(r.status, m || r.statusText); }
  return r.json();
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
  }
  dateien = d;
}

async function aktualisieren() {
  const alt = lies(K_CACHE) || {}, neu = {};
  await Promise.all(DATEIEN.map(async p => {
    const j = await gh(p);
    if (j) neu[p] = { sha:j.sha, text:dateiText(j) };
  }));
  for (const o of ORDNER) {
    const liste = await gh(o) || [];
    await Promise.all(liste.filter(e => e.type === 'file' && e.name.endsWith('.md')).map(async e => {
      if (alt[e.path]?.sha === e.sha) { neu[e.path] = alt[e.path]; return; }
      const j = await gh(e.path);
      if (j) neu[e.path] = { sha:j.sha, text:dateiText(j) };
    }));
  }
  const geaendert = JSON.stringify(Object.keys(neu).sort().map(p => [p, neu[p].sha]))
                 !== JSON.stringify(Object.keys(alt).sort().map(p => [p, alt[p].sha]));
  merke(K_CACHE, neu); merke(K_STAND, Date.now());
  return geaendert;
}

// ── Schreiben ───────────────────────────────────────────────────
const nachricht = p => `Training-App: ${p.split('/').pop().replace(/\.md$/, '')}`;

async function senden(op) {
  const k = konf(), cache = lies(K_CACHE) || {};
  if (op.art === 'neu') {
    const j = await gh(op.pfad, { methode:'PUT', body:{ message:nachricht(op.pfad), content:zuB64(op.text), branch:k.branch } });
    cache[op.pfad] = { sha:j.content.sha, text:op.text };
  } else {
    // Anhängen an den Stand, der GERADE auf GitHub liegt — nicht an den eigenen Cache.
    // Hat der Mac inzwischen etwas angehängt, bleibt es so erhalten.
    for (let versuch = 0; ; versuch++) {
      const j = await gh(op.pfad);
      if (!j) throw new HttpFehler(404, `${op.pfad} gibt es auf GitHub nicht`);
      const text = dateiText(j).replace(/\s*$/, '') + op.text;
      try {
        const r = await gh(op.pfad, { methode:'PUT', body:{ message:nachricht(op.pfad), content:zuB64(text), sha:j.sha, branch:k.branch } });
        cache[op.pfad] = { sha:r.content.sha, text }; break;
      } catch (e) { if (!(e instanceof HttpFehler && e.status === 409 && versuch < 2)) throw e; }
    }
  }
  merke(K_CACHE, cache);
}

// Netzfehler (fetch wirft TypeError) → Warteschlange. HTTP-Fehler → echter Fehler, den der Hub anzeigt.
async function schreiben(op) {
  try { await senden(op); }
  catch (e) {
    if (e instanceof HttpFehler) throw e;
    merke(K_WARTE, [...(lies(K_WARTE) || []), op]);
  }
  zusammensetzen(); status(); neuStarten();
}

let sendetGerade = false;
async function warteschlangeAbarbeiten() {
  if (sendetGerade) return; sendetGerade = true;
  try {
    let liste = lies(K_WARTE) || [];
    while (liste.length) {
      try { await senden(liste[0]); }
      catch (e) {
        if (!(e instanceof HttpFehler)) break;                 // immer noch kein Netz
        liste[0].fehler = e.message; merke(K_WARTE, liste); break;
      }
      liste = liste.slice(1); merke(K_WARTE, liste);
    }
  } finally { sendetGerade = false; zusammensetzen(); status(); }
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
function listen(body) {
  const out = []; let code = false, kommentar = false;
  for (const z of body.split('\n')) {
    if (/^\s*```/.test(z)) { code = !code; continue; }
    if (code) continue;
    if (kommentar) { if (z.includes('-->')) kommentar = false; continue; }
    if (z.includes('<!--') && !z.includes('-->')) { kommentar = true; continue; }
    const m = z.match(/^\s*[-*+]\s+(?:\[.\]\s+)?(.*)$/);
    if (m) out.push({ text:m[1].trim() });
  }
  return out;
}
const datenArray = arr => ({ where:f => datenArray(arr.filter(f)), array:() => arr.slice(),
  values:arr, length:arr.length, [Symbol.iterator]:() => arr[Symbol.iterator]() });

function shim(root) {
  const seiten = {};
  const seite = p => {
    if (!dateien[p] || !p.endsWith('.md')) return null;
    if (!seiten[p]) {
      const { fm, body } = frontmatter(dateien[p].text);
      seiten[p] = { ...fm, file:{ path:p, name:p.split('/').pop().replace(/\.md$/, ''),
        folder:p.split('/').slice(0, -1).join('/'), lists:datenArray(listen(body)) } };   // wie Dataview: .values ist das Array
    }
    return seiten[p];
  };
  const datei = p => dateien[p] ? { path:p, name:p.split('/').pop(), basename:p.split('/').pop().replace(/\.md$/, ''), extension:'md' } : null;
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
      // Am Handy wird nur angehängt — genau das tun die Schreibwege des Hubs (Cardio, Wiegen).
      modify: async (f, text) => {
        const basis = (dateien[f.path]?.text ?? '').replace(/\s*$/, '');
        if (!text.startsWith(basis)) throw new Error('Am Handy wird nur angehängt, nichts umgeschrieben.');
        await schreiben({ art:'anhang', pfad:f.path, text:text.slice(basis.length) });
      },
      adapter: { getFullPath: p => p },
    },
    // Den aktiven Plan stellt nur der Mac um: Er steht im Frontmatter des Hubs selbst.
    fileManager: { processFrontMatter: async () => { throw new Error('Plan am Mac umstellen'); } },
    workspace: { getLeaf: () => ({ openFile: () => {} }), openLinkText: () => {} },
  };
  const require = name => {
    if (name !== 'fs') throw new Error(`Modul ${name} gibt es hier nicht`);
    return { readFileSync: p => { if (dateien[p]) return dateien[p].text; throw new Error(`${p} nicht geladen`); } };
  };
  return { dv, app, require };
}

// ── Hub ausführen ───────────────────────────────────────────────
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const hubEl = document.getElementById('hub');
let laeuft = false, nochmal = false, zeitplan = null;

async function hubStarten() {
  if (laeuft) { nochmal = true; return; }
  laeuft = true;
  try {
    const code = (dateien[HUB]?.text.match(/^```dataviewjs[^\n]*\n([\s\S]*?)^```\s*$/m) || [])[1];
    if (!code) { hubEl.innerHTML = '<div class="ta-fehler">Training Hub nicht gefunden.</div>'; return; }
    const root = document.createElement('div');
    hubEl.replaceChildren(root);
    const { dv, app, require } = shim(root);
    try { await new AsyncFunction('dv', 'app', 'require', code)(dv, app, require); }
    catch (e) { console.error(e); root.insertAdjacentHTML('beforeend', `<div class="ta-fehler">Der Hub-Code ist abgestürzt: ${String(e.message || e).replace(/</g, '&lt;')}</div>`); }
    zahlenfelder(root);
  } finally {
    laeuft = false;
    if (nochmal) { nochmal = false; hubStarten(); }
  }
}
// Wie Obsidian: Nach einem Schreibvorgang baut sich der Block kurz danach neu auf.
// Der Abstand lässt den Hub erst seinen Dialog schließen und die Meldung setzen.
const neuStarten = () => { clearTimeout(zeitplan); zeitplan = setTimeout(hubStarten, 60); };

// Am Handy die Zahlentastatur statt der vollen: Der Hub kennt nur type="text".
function zahlenfelder(root) {
  const setzen = () => {
    root.querySelectorAll('.g-s, .g-w').forEach(i => { i.inputMode = 'numeric'; });
    root.querySelectorAll('.g-g').forEach(i => { i.inputMode = 'decimal'; });
  };
  setzen(); new MutationObserver(setzen).observe(root, { childList:true, subtree:true });
}

// ── Statuszeile: nur, wenn es etwas zu sagen gibt ───────────────
const statusEl = document.getElementById('status');
let offline = false;
function status() {
  const w = lies(K_WARTE) || [], fehler = w.find(o => o.fehler);
  const stand = lies(K_STAND);
  const text = fehler ? `Eintrag hängt: ${fehler.fehler}`
    : w.length ? `${w.length} ${w.length === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Netz`
    : offline ? `Offline · Stand ${stand ? new Date(stand).toLocaleString('de-DE', { weekday:'short', hour:'2-digit', minute:'2-digit' }) : 'unbekannt'}`
    : '';
  statusEl.textContent = text;
  statusEl.className = text ? 'an' + (fehler ? ' fehler' : '') : '';
}

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
      if (!await gh(HUB)) throw new Error('Training Hub im Repo nicht gefunden');
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
    return geaendert;
  } catch (e) {
    if (e instanceof HttpFehler && e.status === 401) { einrichten('Der Schlüssel ist abgelaufen oder wurde zurückgezogen.'); return false; }
    offline = true; console.warn(e); return false;
  } finally { status(); }
}

async function start() {
  zusammensetzen();
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

if (!DEV && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
if (konf()) start(); else einrichten();
