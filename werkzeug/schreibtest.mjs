// Prüft die Schreiblogik von app.js gegen ein nachgebautes GitHub, ohne Netz und ohne Vault.
// Start: node werkzeug/schreibtest.mjs   (✗ in der Ausgabe = kaputt, Exit-Code 1)
import fs from 'node:fs'; import crypto from 'node:crypto';
const code = fs.readFileSync(process.argv[2] || new URL('../app.js', import.meta.url), 'utf8');
// ── nachgebautes GitHub ──
const gh = {}; let offline = false, latenz = 0, puts = 0;
const sha = t => crypto.createHash('sha1').update(t).digest('hex');
const setze = (p, t) => gh[p] = { text:t, sha:sha(t) };
const macSchreibt = (p, t) => setze(p, t);
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
async function fetch(url, o = {}) {
  if (offline) throw new TypeError('Failed to fetch');
  await new Promise(r => setTimeout(r, latenz));
  const p = decodeURIComponent(url.split('/contents/')[1].split('?')[0]);
  const antw = (status, body) => ({ ok: status < 300, status, statusText:'', json: async () => body });
  if ((o.method || 'GET') === 'GET') {
    if (gh[p]) return antw(200, { type:'file', sha:gh[p].sha, encoding:'base64', content:b64(gh[p].text) });
    const liste = Object.keys(gh).filter(k => k.startsWith(p + '/')).map(k => ({ type:'file', name:k.split('/').pop(), path:k, sha:gh[k].sha }));
    return liste.length ? antw(200, liste) : antw(404, {});
  }
  if (globalThis.verbot) return antw(403, { message:'kein Recht' });
  const b = JSON.parse(o.body); puts++;
  if (gh[p] && !b.sha) return antw(422, { message:'sha fehlt' });
  if (gh[p] && b.sha !== gh[p].sha) return antw(409, { message:'sha passt nicht' });
  setze(p, Buffer.from(b.content, 'base64').toString('utf8'));
  return antw(200, { content:{ sha:gh[p].sha } });
}
// ── Browser-Attrappen ──
const ls = {}; const localStorage = { getItem:k => k in ls ? ls[k] : null, setItem:(k, v) => ls[k] = String(v), removeItem:k => delete ls[k] };
const el = () => ({ addEventListener(){}, replaceChildren(){}, appendChild(){}, insertAdjacentHTML(){}, querySelectorAll:() => [], style:{}, hidden:false });
const document = { getElementById: el, createElement: el, addEventListener(){} };
const window = { addEventListener(){} }; const location = { hostname:'localhost', search:'' };
const navigator = {}; class MutationObserver { observe(){} }
const HUB = '02 Life OS/Training Hub.md', ZC = '02 Life OS/Ernährung/Zutaten Check.md', KD = '02 Life OS/Körperdaten.md';
setze(HUB, '```dataviewjs\n```\n'); setze(ZC, '---\nx: 1\n---\n- Skyr :: fehlt :: 2026-10-09\n- Eier :: fehlt :: 2026-10-09\n'); setze(KD, '# K\n- a\n');
const A = new Function('fetch','localStorage','document','window','location','navigator','MutationObserver','moment',
  code + '\n;return { shim, laden, warteschlangeAbarbeiten, zusammensetzen, get dateien(){ return dateien; }, K_WARTE, K_NICHT, K_CACHE, lies, merke, aktualisieren };')
  (fetch, localStorage, document, window, location, navigator, MutationObserver, () => ({}));
const ok = (b, m) => { console.log((b ? '✓ ' : '✗ ') + m); if (!b) process.exitCode = 1; };
const warte = ms => new Promise(r => setTimeout(r, ms));
await warte(50); await A.aktualisieren(); A.merke(A.K_CACHE, A.lies(A.K_CACHE)); 
// Zutaten Check ist nicht in DATEIEN — für den Test in den Cache holen
const holen = async () => { const c = A.lies(A.K_CACHE); c[ZC] = { ...gh[ZC] }; c[KD] = { ...gh[KD] }; A.merke(A.K_CACHE, c); A.zusammensetzen(); };
await holen();
const { app } = A.shim(el());
const f = app.vault.getAbstractFileByPath(ZC);
const zc = () => gh[ZC].text;

// 1 online umschreiben
await app.vault.modify(f, A.dateien[ZC].text.replace('Skyr :: fehlt', 'Skyr :: da'));
ok(zc().includes('Skyr :: da'), '1 online umschreiben kommt an');
// 2 zwei schnelle Haken bei langsamem Netz
latenz = 80;
const t1 = A.dateien[ZC].text.replace('Eier :: fehlt', 'Eier :: da');
const p1 = app.vault.modify(f, t1);
const p2 = app.vault.modify(f, t1.replace('- Eier :: da :: 2026-10-09\n', '- Eier :: da :: 2026-10-09\n- Milch :: fehlt :: 2026-10-09\n'));
const e2 = await Promise.allSettled([p1, p2]);
ok(e2.every(x => x.status === 'fulfilled') && zc().includes('Eier :: da') && zc().includes('Milch'), '2 zwei schnelle Haken: beide übernommen, kein falscher Konflikt');
ok(!(A.lies(A.K_NICHT) || []).length, '2 nichts als „nicht übernommen" markiert');
latenz = 0;
// 3 Mac hat inzwischen geändert → Konflikt, nichts überschrieben
macSchreibt(ZC, zc() + '- Hafer :: fehlt :: 2026-10-09\n');
const vorMac = zc();
let fehler = null; try { await app.vault.modify(f, A.dateien[ZC].text.replace('Milch :: fehlt', 'Milch :: da')); } catch (e) { fehler = e; }
await warte(30);
ok(fehler && fehler.status === 409, '3 Konflikt geht als Fehler an den Hub');
ok(zc() === vorMac, '3 Mac-Änderung bleibt unangetastet');
ok((A.lies(A.K_NICHT) || []).length === 1, '3 Fassung aufgehoben unter „nicht übernommen"');
A.merke(A.K_NICHT, []);
await A.laden(); await holen();
// 4 Funkloch: drei Haken, dann Netz
offline = true;
const { app: app2 } = A.shim(el()); const f2 = app2.vault.getAbstractFileByPath(ZC);
let t = A.dateien[ZC].text;
for (const z of ['Skyr', 'Eier', 'Milch']) { t = A.dateien[ZC].text.replace(new RegExp(`${z} :: (da|fehlt)`), `${z} :: fehlt`); await app2.vault.modify(f2, t); }
ok(A.lies(A.K_WARTE).length === 1, '4 im Funkloch: drei Haken = ein wartender Eintrag');
ok(A.dateien[ZC].text.includes('Milch :: fehlt') && A.dateien[ZC].text.includes('Skyr :: fehlt'), '4 sofort in der App sichtbar');
offline = false; await A.laden();
ok(zc().includes('Skyr :: fehlt') && zc().includes('Eier :: fehlt') && zc().includes('Milch :: fehlt') && zc().includes('Hafer'), '4 mit Netz: alles übernommen');
ok(!A.lies(A.K_WARTE).length, '4 Warteschlange leer');
await holen();
// 5 Funkloch + Mac ändert inzwischen → Konflikt beim Nachsenden
offline = true; await app2.vault.modify(f2, A.dateien[ZC].text.replace('Skyr :: fehlt', 'Skyr :: da'));
macSchreibt(ZC, zc().replace('Hafer :: fehlt', 'Hafer :: da')); const mac5 = zc();
offline = false; await A.laden();
ok(zc() === mac5, '5 nachgesendet, aber Mac-Stand nicht überschrieben');
ok((A.lies(A.K_NICHT) || []).length === 1 && !A.lies(A.K_WARTE).length, '5 aufgehoben, Schlange läuft weiter');
A.merke(A.K_NICHT, []); await holen();
// 6 Anhängen bleibt Anhängen, Mac-Anhang bleibt erhalten
const fk = app2.vault.getAbstractFileByPath(KD);
macSchreibt(KD, gh[KD].text + '- mac\n');
await app2.vault.modify(fk, A.dateien[KD].text.replace(/\s*$/, '') + '\n- handy\n');
ok(gh[KD].text.includes('- mac') && gh[KD].text.includes('- handy'), '6 Anhängen: Mac- und Handy-Zeile beide da');
// 7 Alte Einträge ohne id
offline = true;
A.merke(A.K_WARTE, [{ art:'anhang', pfad:KD, text:'\n- alt1' }, { art:'anhang', pfad:KD, text:'\n- alt2' }]);
offline = false; await A.warteschlangeAbarbeiten();
ok(gh[KD].text.includes('alt1') && gh[KD].text.includes('alt2'), '7 alte Einträge ohne id: beide gesendet');
// 8 Echter Fehler (403) beim eigenen Klick blockiert die Schlange nicht
await holen(); globalThis.verbot = true; let f8 = null;
try { await app2.vault.modify(f2, A.dateien[ZC].text.replace('Eier :: fehlt', 'Eier :: da')); } catch (e) { f8 = e; }
globalThis.verbot = false;
ok(f8 && f8.status === 403, '8 echter Fehler geht an den Hub');
ok(!A.lies(A.K_WARTE).length, '8 und blockiert die Schlange nicht');
console.log('Schreibversuche gesamt:', puts);
