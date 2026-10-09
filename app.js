// ═══════════════════════════════════════════════════════════════
//   TRAINING-APP fürs Handy
//   Führt den ECHTEN Code des Training Hubs aus (MindOS/02 Life OS/Training Hub.md),
//   geladen aus dem Vault-Repo auf GitHub. Diese Datei bildet nur die 14 Stellen
//   nach, an denen der Hub Obsidian anspricht (dv.*, app.vault.*, require('fs')).
//   Ändert sich der Hub, ändert sich die App beim nächsten Öffnen mit.
//
//   Schreiben: neue Dateien (Gym-Logs) und Anhängen (Cardio, Körperdaten) direkt
//   per GitHub-API. Seit 09.10. auch Umschreiben (für den Kitchen Hub), aber nur, wenn
//   die Datei auf GitHub noch die ist, die die App geladen hat. Sonst wird nichts
//   überschrieben, und der Eintrag steht als „nicht übernommen“ oben in der Leiste.
//   Ohne Netz in eine Warteschlange, abgeschickt, sobald Netz da ist.
//   Am Mac holt der automatische Spielstand die Einträge alle 10 Minuten herunter.
//   Warum so: MindOS/05 Stack/Context/Decisions/Training-App am Handy führt den Hub-Code aus.md
// ═══════════════════════════════════════════════════════════════

const HUB     = '02 Life OS/Training Hub.md';
const DATEIEN = [HUB, '02 Life OS/Körperdaten.md', '99 System/Utility/Templates/Training Log.md',
                 '99 System/Utility/Views/Koerper/koerper.json'];
const ORDNER  = ['02 Life OS/Training Logs'];

const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
const API = DEV ? '/gh' : 'https://api.github.com';
const K_KONF = 'tr-konf', K_CACHE = 'tr-cache', K_WARTE = 'tr-warte', K_STAND = 'tr-stand', K_NICHT = 'tr-nicht';

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
    if (op.art === 'ersetzen') d[op.pfad] = { sha:d[op.pfad]?.sha ?? null, text:op.text };
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
// Jeder Schreibvorgang kommt erst in die Warteschlange, und die wird streng der Reihe nach
// abgearbeitet. Sonst schickten zwei schnelle Haken bei langsamem Netz beide auf dem alten
// Stand los, und GitHub hielte den zweiten für eine fremde Änderung.
const nachricht = p => `Training-App: ${p.split('/').pop().replace(/\.md$/, '')}`;
const dateiName = p => p.split('/').pop().replace(/\.md$/, '');

class Konflikt extends HttpFehler {
  constructor(op) { super(409, `${dateiName(op.pfad)} wurde inzwischen woanders geändert. Nicht übernommen.`); }
}

// Liefert, auf welchem sha die Änderung beruhte (vor) und welchen sie erzeugt hat (nach).
// `vor` ist nur gesetzt, wenn GitHub genau den Stand hatte, den die App kannte.
async function senden(op) {
  const k = konf(), cache = lies(K_CACHE) || {}, bekannt = cache[op.pfad]?.sha ?? null;
  let r;
  if (op.art === 'neu') {
    const j = await gh(op.pfad, { methode:'PUT', body:{ message:nachricht(op.pfad), content:zuB64(op.text), branch:k.branch } });
    cache[op.pfad] = { sha:j.content.sha, text:op.text }; r = { vor:null, nach:j.content.sha };
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
// und stehen oben in der Leiste, bis man darauf tippt.
const nichtUebernommen = op => merke(K_NICHT, [...(lies(K_NICHT) || []), { id:op.id, pfad:op.pfad, text:op.text, zeit:Date.now() }]);

// Eine neue Fassung enthält alles, was für diese Datei schon wartet: Sie ersetzt es, statt
// sich dahinter zu stellen. Ausnahme: eine noch nicht abgeschickte neue Datei bekommt einfach
// den neuen Text. Was gerade unterwegs ist, wird nie angefasst.
let imFlug = null;
function einreihen(op) {
  let w = lies(K_WARTE) || [];
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
      try { r = await senden(op); }
      catch (e) {
        if (e instanceof Konflikt) nichtUebernommen(op);        // raus aus der Schlange, aber aufgehoben
        else if (!(e instanceof HttpFehler)) break;             // kein Netz: beim nächsten Mal
        else {                                                  // echter Fehler: bleibt stehen und hängt
          merke(K_WARTE, (lies(K_WARTE) || []).map(o => o.id === op.id ? { ...o, fehler:e.message, status:e.status } : o));
          break;
        }
      }
      // Was danach für dieselbe Datei wartet, beruht auf dieser eigenen Änderung: sha nachziehen.
      const rest = (lies(K_WARTE) || []).filter(o => o.id !== op.id);
      if (r && r.vor !== undefined) rest.forEach(o => { if (o.pfad === op.pfad && o.art === 'ersetzen' && (o.sha ?? null) === r.vor) o.sha = r.nach; });
      merke(K_WARTE, rest);
    }
  } finally { imFlug = null; zusammensetzen(); status(); }
}

// Ohne Netz bleibt der Eintrag wartend und gilt für den Hub als gespeichert (wie bisher).
// Schlägt GitHub ihn ab, bekommt der Hub den Fehler zu sehen.
async function schreiben(op) {
  op.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  einreihen(op); zusammensetzen(); status();
  await warteschlangeAbarbeiten();
  const nicht = (lies(K_NICHT) || []).find(n => n.id === op.id);
  if (nicht) {
    // Der Hub hat einen veralteten Stand im Kopf. Neu laden und neu aufbauen, sonst
    // überschriebe der nächste Klick die fremde Änderung mit dem alten Stand.
    laden().then(() => hubStarten());
    throw new Konflikt(op);
  }
  const haengt = (lies(K_WARTE) || []).find(o => o.id === op.id && o.fehler);
  if (haengt) {
    // Ein Fehler beim eigenen Klick geht zurück an den Hub, statt die Schlange zu blockieren.
    merke(K_WARTE, (lies(K_WARTE) || []).filter(o => o.id !== op.id)); status();
    throw new HttpFehler(haengt.status, haengt.fehler);
  }
  neuStarten();
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
      // Beginnt der neue Text mit dem alten, wird nur angehängt (Cardio, Wiegen): Das verträgt
      // sich mit allem, was der Mac inzwischen angehängt hat. Sonst Umschreiben mit Prüfung.
      modify: async (f, text) => {
        const basis = (dateien[f.path]?.text ?? '').replace(/\s*$/, '');
        if (text.replace(/\s*$/, '') === basis) return;            // nichts geändert, nichts senden
        if (text.startsWith(basis)) return schreiben({ art:'anhang', pfad:f.path, text:text.slice(basis.length) });
        await schreiben({ art:'ersetzen', pfad:f.path, text, sha:(lies(K_CACHE) || {})[f.path]?.sha ?? null });
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
  const text = nicht.length ? `Nicht übernommen: ${[...new Set(nicht.map(n => n.pfad.split('/').pop().replace(/\.md$/, '')))].join(', ')} — am Mac geändert. Tippen zum Ausblenden.`
    : fehler ? `Eintrag hängt: ${fehler.fehler}`
    : w.length ? `${w.length} ${w.length === 1 ? 'Eintrag wartet' : 'Einträge warten'} auf Netz`
    : offline ? `Offline · Stand ${stand ? new Date(stand).toLocaleString('de-DE', { weekday:'short', hour:'2-digit', minute:'2-digit' }) : 'unbekannt'}`
    : '';
  statusEl.textContent = text;
  statusEl.className = text ? 'an' + (fehler || nicht.length ? ' fehler' : '') : '';
}
// Ausblenden heißt nicht löschen: Die Fassungen bleiben unter tr-nicht-alt liegen.
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
