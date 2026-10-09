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
  if (o.method === 'DELETE') {
    if (!gh[p]) return antw(404, {});
    if (b.sha !== gh[p].sha) return antw(409, { message:'sha passt nicht' });
    delete gh[p]; return antw(200, {});
  }
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
// Seit 09.10. kehrt ein Tipp sofort zurück und sendet im Hintergrund: Vor jeder Prüfung abwarten.
const fertig = async () => { await warte(1); await A.warteschlangeAbarbeiten(); await warte(20); };
await warte(50); await A.aktualisieren(); A.merke(A.K_CACHE, A.lies(A.K_CACHE)); 
// Zutaten Check ist nicht in DATEIEN — für den Test in den Cache holen
const holen = async () => { const c = A.lies(A.K_CACHE); c[ZC] = { ...gh[ZC] }; c[KD] = { ...gh[KD] }; A.merke(A.K_CACHE, c); A.zusammensetzen(); };
await holen();
const { app } = A.shim(el());
const f = app.vault.getAbstractFileByPath(ZC);
const zc = () => gh[ZC].text;

// 1 online umschreiben
await app.vault.modify(f, A.dateien[ZC].text.replace('Skyr :: fehlt', 'Skyr :: da')); await fertig();
ok(zc().includes('Skyr :: da'), '1 online umschreiben kommt an');
// 2 zwei schnelle Haken bei langsamem Netz
latenz = 80;
const t1 = A.dateien[ZC].text.replace('Eier :: fehlt', 'Eier :: da');
const p1 = app.vault.modify(f, t1);
const p2 = app.vault.modify(f, t1.replace('- Eier :: da :: 2026-10-09\n', '- Eier :: da :: 2026-10-09\n- Milch :: fehlt :: 2026-10-09\n'));
const e2 = await Promise.allSettled([p1, p2]); await fertig();
ok(e2.every(x => x.status === 'fulfilled') && zc().includes('Eier :: da') && zc().includes('Milch'), '2 zwei schnelle Haken: beide übernommen, kein falscher Konflikt');
ok(!(A.lies(A.K_NICHT) || []).length, '2 nichts als „nicht übernommen" markiert');
latenz = 0;
// 3 Mac hat inzwischen geändert → Konflikt, nichts überschrieben
macSchreibt(ZC, zc() + '- Hafer :: fehlt :: 2026-10-09\n');
const vorMac = zc();
let fehler = null; try { await app.vault.modify(f, A.dateien[ZC].text.replace('Milch :: fehlt', 'Milch :: da')); } catch (e) { fehler = e; }
await fertig();
await warte(30);
ok(!fehler, '3 der Tipp selbst kehrt sofort zurück (sofort anzeigen)');
ok(zc() === vorMac, '3 Mac-Änderung bleibt unangetastet');
ok((A.lies(A.K_NICHT) || []).length === 1 && A.lies(A.K_NICHT)[0].grund === 'am Mac geändert', '3 Fassung aufgehoben unter „nicht übernommen", mit Grund');
A.merke(A.K_NICHT, []);
await A.laden(); await holen();
// 4 Funkloch: drei Haken, dann Netz
offline = true;
const { app: app2 } = A.shim(el()); const f2 = app2.vault.getAbstractFileByPath(ZC);
let t = A.dateien[ZC].text;
for (const z of ['Skyr', 'Eier', 'Milch']) { t = A.dateien[ZC].text.replace(new RegExp(`${z} :: (da|fehlt)`), `${z} :: fehlt`); await app2.vault.modify(f2, t); }
// Höchstens zwei: Der erste Haken ist evtl. gerade „unterwegs“, wenn der nächste kommt; der zweite
// fasst dann alle späteren zusammen. Dass am Ende alles stimmt, prüft „mit Netz“ unten.
ok(A.lies(A.K_WARTE).length <= 2, `4 im Funkloch: drei Haken = höchstens zwei wartende Einträge (${A.lies(A.K_WARTE).length})`);
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
await app2.vault.modify(fk, A.dateien[KD].text.replace(/\s*$/, '') + '\n- handy\n'); await fertig();
ok(gh[KD].text.includes('- mac') && gh[KD].text.includes('- handy'), '6 Anhängen: Mac- und Handy-Zeile beide da');
// 7 Alte Einträge ohne id
offline = true;
A.merke(A.K_WARTE, [{ art:'anhang', pfad:KD, text:'\n- alt1' }, { art:'anhang', pfad:KD, text:'\n- alt2' }]);
offline = false; await A.warteschlangeAbarbeiten();
ok(gh[KD].text.includes('alt1') && gh[KD].text.includes('alt2'), '7 alte Einträge ohne id: beide gesendet');
// 8 Echter Fehler (403) beim eigenen Klick blockiert die Schlange nicht
await holen(); globalThis.verbot = true; let f8 = null;
try { await app2.vault.modify(f2, A.dateien[ZC].text.replace('Eier :: fehlt', 'Eier :: da')); } catch (e) { f8 = e; }
await fertig();
globalThis.verbot = false;
ok(!f8 && (A.lies(A.K_NICHT) || []).some(n => n.grund === 'kein Recht') && !A.dateien[ZC].text.includes('Eier :: da'), '8 echter Fehler: steht oben in der Leiste, Ansicht springt zurück');
A.merke(A.K_NICHT, []);
ok(!A.lies(A.K_WARTE).length, '8 und blockiert die Schlange nicht');
// 9 Eigenschaft setzen: nur die eine Zeile ändert sich
const R = '02 Life OS/Ernährung/Meal Library/Skyr.md', DN = '02 Life OS/Daily Journal/2026-10-09.md';
setze(R, '---\ndomain: body\ntype: recipe\nfavorite: false\nrecipe: "Skyr, Beeren"\ntags:\n  - a\n  - b\nbanner: x.jpg\n---\n# Skyr\n');
setze(DN, '---\ntype: journal\nsport: true\n---\nText\n');
await A.laden(); await holen(); { const c = A.lies(A.K_CACHE); c[R] = { ...gh[R] }; c[DN] = { ...gh[DN] }; A.merke(A.K_CACHE, c); A.zusammensetzen(); }
const { app: app3 } = A.shim(el());
await app3.fileManager.processFrontMatter(app3.vault.getAbstractFileByPath(R), fm => { fm.favorite = true; }); await fertig();
ok(gh[R].text === '---\ndomain: body\ntype: recipe\nfavorite: true\nrecipe: "Skyr, Beeren"\ntags:\n  - a\n  - b\nbanner: x.jpg\n---\n# Skyr\n', '9 Favorit: nur diese Zeile geändert, Rest Byte für Byte gleich');
// 10 Pausetag an der Daily Note setzen und wieder weg
const { app: app4 } = A.shim(el());
await app4.fileManager.processFrontMatter(app4.vault.getAbstractFileByPath(DN), fm => { fm.pause = true; }); await fertig();
ok(gh[DN].text === '---\ntype: journal\nsport: true\npause: true\n---\nText\n', '10 Pausetag gesetzt (unten angefügt)');
const { app: app5 } = A.shim(el());
await app5.fileManager.processFrontMatter(app5.vault.getAbstractFileByPath(DN), fm => { delete fm.pause; }); await fertig();
ok(gh[DN].text === '---\ntype: journal\nsport: true\n---\nText\n', '10 Pausetag entfernt, Datei wie vorher');
let f10 = null; try { await app5.fileManager.processFrontMatter(app5.vault.getAbstractFileByPath(R), fm => { fm.tags = ['a']; }); } catch (e) { f10 = e; }
ok(f10 && /am Mac/.test(f10.message), '10 Listen im Frontmatter werden verweigert statt verbogen');
// 11 Löschen: online, mit Konflikt, offline angelegt und gelöscht
const MP = '02 Life OS/Ernährung/Meal Plan/2026-10-09 Skyr.md';
setze(MP, '---\ntype: mealplan\ndone: false\n---\n');
{ const c = A.lies(A.K_CACHE); c[MP] = { ...gh[MP] }; A.merke(A.K_CACHE, c); A.zusammensetzen(); }
const { app: app6 } = A.shim(el());
await app6.vault.trash(app6.vault.getAbstractFileByPath(MP), true); await fertig();
ok(!gh[MP] && !A.dateien[MP], '11 Löschen kommt an und ist sofort weg');
setze(MP, '---\ntype: mealplan\ndone: false\n---\n');
{ const c = A.lies(A.K_CACHE); c[MP] = { ...gh[MP] }; A.merke(A.K_CACHE, c); A.zusammensetzen(); }
macSchreibt(MP, '---\ntype: mealplan\ndone: true\n---\n');
let f11 = null; const { app: app7 } = A.shim(el());
try { await app7.fileManager.trashFile(app7.vault.getAbstractFileByPath(MP)); } catch (e) { f11 = e; }
await fertig();
await warte(30);
ok(!f11 && gh[MP] && (A.lies(A.K_NICHT) || []).length === 1, '11 Am Mac inzwischen geändert: nicht gelöscht, aufgehoben');
A.merke(A.K_NICHT, []); await A.laden(); await holen();
offline = true; const NEU = '02 Life OS/Ernährung/Meal Plan/2026-10-10 Test.md'; const v = puts;
const { app: app8 } = A.shim(el());
await app8.vault.create(NEU, '---\ntype: mealplan\n---\n');
await app8.vault.trash(app8.vault.getAbstractFileByPath(NEU), true);
offline = false; await fertig(); await fertig();
ok(!gh[NEU] && !A.lies(A.K_WARTE).length && !(A.lies(A.K_NICHT) || []).length, '11 im Funkloch angelegt und wieder gelöscht: am Ende nicht da, nichts hängt');
// 12 Überschriften und Listen-Zeilen wie Obsidian (Grundstock in Vorrat.md)
const VO = '02 Life OS/Ernährung/Vorrat.md';
setze(VO, '---\ntype: liste\n---\n# Grundstock\n- Salz\n- Öl\n# Bestand\n- Reis\n');
{ const c = A.lies(A.K_CACHE); c[VO] = { ...gh[VO] }; A.merke(A.K_CACHE, c); A.zusammensetzen(); }
const { app: app9, dv } = A.shim(el());
const h = app9.metadataCache.getFileCache(app9.vault.getAbstractFileByPath(VO)).headings;
const li = dv.page(VO).file.lists.values;
const von = h[0].position.start.line, bis = h[1].position.start.line;
ok(li.filter(l => l.position.start.line > von && l.position.start.line < bis).map(l => l.text).join() === 'Salz,Öl', '12 Grundstock: genau die Zeilen unter seiner Überschrift');
// 13 Sofort anzeigen: Der Eintrag ist in der App, bevor GitHub geantwortet hat
latenz = 300; const SO = '02 Life OS/Ernährung/Meal Plan/2026-10-11 Sofort.md';
const { app: app10 } = A.shim(el()); const t0 = Date.now();
await app10.vault.create(SO, '---\ntype: mealplan\n---\n');
const dauer = Date.now() - t0, sofortDa = !!A.dateien[SO], nochNichtBeiGitHub = !gh[SO];
await fertig(); await warte(350); await fertig(); latenz = 0;
ok(dauer < 50 && sofortDa && nochNichtBeiGitHub && gh[SO], `13 sofort in der App (${dauer} ms), danach bei GitHub`);
console.log('Schreibversuche gesamt:', puts);
