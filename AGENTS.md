# MindOS-Apps — Arbeitsplatz (Training, Küche)

Hubs aus dem Vault als Web-Apps fürs iPhone, je Hub ein Symbol auf dem Startbildschirm, kein App Store.
**Die Apps haben keinen eigenen Hub-Code.** Sie laden den Hub aus dem Vault-Repo auf GitHub und führen dessen
DataviewJS-Block aus. `app.js` bildet nur die Obsidian-Stellen nach, die die Hubs benutzen, und ist für alle
Apps **eine** Datei.

| | Training | Küche |
|---|---|---|
| Adresse | `/training/` | `/kitchen/` |
| Hub | `02 Life OS/Training Hub.md` | `02 Life OS/Ernährung/Kitchen Hub.md` |
| Welche Dateien | `window.HUB_APP` in `training/index.html` | `window.HUB_APP` in `kitchen/index.html` |
| Handy-Layout | `training/mobil.css` | `kitchen/mobil.css` |

Gemeinsam: `app.js`, `basis.css` (Seite, Statusleiste, Einrichten, Leser), `sw.js` (eine Hülle für alle), `vendor/`,
`index.html` (Übersicht mit allen Apps). Eine neue App = ein neuer Ordner mit `index.html`, `mobil.css`, Manifest, Symbolen
und ein Eintrag in `HUELLE` und in der Übersicht.
Der Schlüssel (`tr-konf`) gilt für beide, alles andere im Speicher trägt das Kürzel der App (`tr-`, `ki-`).

## Gegenstück im Denkraum

- `MindOS/05 Stack/Context/Decisions/Training-App am Handy führt den Hub-Code aus.md`: warum so, was
  am Handy geht und was nicht. **Entscheidungen zur App gehören dorthin.**
- `MindOS/02 Life OS/1. Agent — Life OS.md`, Abschnitt Training Hub: was der Hub-Code einhalten muss,
  damit er auch hier läuft. (Für den Kitchen Hub nachziehen, sobald die Küche ausgerollt ist.)

## Was beim Ändern zählt

- **Benutzt der Hub eine neue Obsidian-Funktion, stürzt die App ab**, bis sie in `shim()` in `app.js`
  nachgebildet ist. Prüfen mit `grep -o "dv\.[a-zA-Z]*\|app\.[a-zA-Z.]*\|require([^)]*)"` auf den Hub.
- **Das Rad (Wdh × kg) gehört nur der App** (`radOeffnen` in `app.js`): Es füllt die Felder `.tr-satz .g-w/.g-g`, die der
  Hub zeichnet. Benennt der Hub diese Klassen um, findet das Rad nichts mehr.
- **Schreiben läuft immer über die Warteschlange, streng nacheinander** (`schreiben` → `einreihen` → `abarbeiten`).
  **Sofort anzeigen (seit 09.10.):** `schreiben` kehrt zurück, sobald der Eintrag eingereiht ist; gesendet wird im
  Hintergrund. Der Hub bekommt deshalb keine Fehler mehr zu sehen: Was scheitert, steht oben in der Leiste
  (mit Grund), die Fassung liegt unter `<kürzel>-nicht`, und die Ansicht springt auf den echten Stand zurück.
  `modify` hängt an, wenn der neue Text mit dem alten beginnt, sonst schreibt es um (`art:'ersetzen'`) — mit dem
  sha, auf dem die Änderung beruht. Lehnt GitHub ab (409/422), wird nichts überschrieben: Die Fassung landet unter
  `<kürzel>-nicht` und steht oben in der Leiste. Löschen (`trash`, `trashFile`) genauso, mit sha.
  `processFrontMatter` ändert **nur die betroffene Zeile** (kein Neuschreiben des YAML, sonst Format-Drift),
  Listen verweigert es. Am Hub selbst wirft es: den aktiven Plan stellt nur der Mac um.
  **Schreiblogik geändert? Danach `node werkzeug/schreibtest.mjs`** (schnelle Haken, Funkloch, Mac hat inzwischen
  geändert, Anhängen, alte Einträge ohne id, echter Fehler). Läuft gegen ein nachgebautes GitHub, ohne Netz.
- **Prüfen ohne echte Daten:** `node werkzeug/testserver.mjs` liest aus dem Vault, Schreiben ist gesperrt.
  Schreibtests nur gegen eine Kopie: `SCHREIBEN=1 VAULT=/tmp/vault-kopie node werkzeug/testserver.mjs`,
  Funkloch dazu mit `OHNE_NETZ=1`. Bildschirmfoto in iPhone-Breite: `werkzeug/rahmen.html`
  (Testmodus: `?view=plan`, `?klick=Selektor|Selektor=>Wert`; die Küche mit `?app=kitchen`).
- **Laden beim Öffnen:** Ordner aus `ordner` und die Ordner der Einzeldateien werden aufgelistet (liefert den sha
  jeder Datei), geholt wird nur, was sich geändert hat. Über 1 MB liefert GitHub keinen Inhalt mit, dann roh nachgeholt.
  Die Küche lädt so auch den BLS (`99 System/Utility/Views/BLS/bls.json`, 481 KB) nur bei Änderung.
- **Barcode lesen (seit 09.10.):** Der Kitchen Hub liest Barcodes aus Fotos mit `BarcodeDetector`. Safari am iPhone hat das nicht,
  deshalb setzt `app.js` dort eine Klasse gleichen Namens, die beim ersten Foto `vendor/barcode-detector.js` (Ponyfill, MIT) und
  `vendor/zxing_reader.wasm` (rund 1 MB) lädt. **Bewusst nicht in `HUELLE`**: Ohne Netz kann Open Food Facts das Produkt ohnehin nicht
  nennen. **Die `.wasm` muss zur Version passen, die in der `.js` steht** (heute zxing-wasm 3.1.3): Beim Aktualisieren beide aus
  `npm pack barcode-detector` bzw. `npm pack zxing-wasm@<Version>` holen. Prüfen ohne Handy: `werkzeug/barcode-testfoto.py`
  zeichnet einen Strichcode als unscharfes, schräges „Foto“; im Testserver über `DataTransfer` ins Dateifeld `#ml-plan-scan` legen.
- **Bilder** sucht die App im Frontmatter der geladenen Notizen (z. B. `banner:`), holt sie einmal und legt sie
  im Cache-Speicher des Browsers ab (nicht im localStorage, der hat nur wenige MB). Ein Bild, dessen Pfad nicht
  stimmt, fehlt am Handy genauso wie im Hub am Mac.
- **Nach Änderungen an der Hülle** in `sw.js` die Version `V` hochzählen. Am iPhone kommt eine Änderung
  beim **zweiten** Öffnen an (erst lädt die App die neue `sw.js`, dann damit die neuen Dateien). GitHub Pages
  lässt Dateien 10 Minuten zwischenspeichern; `sw.js` fragt deshalb mit `cache:'no-cache'` jedes Mal nach.
- **App-Symbole nur aus `icon-512.png` verkleinern** (`sips -z 180 180 training/icon-512.png --out training/icon-180.png`), nie direkt
  per Chrome-Screenshot erzeugen: Chrome öffnet kein Fenster unter ~500 px, kleine Symbole zeigen dann nur den
  linken Rand des Motivs (passiert am 08.10.). Nach neuem Symbol `?v=` in `index.html` und Manifest hochzählen,
  am iPhone das Symbol löschen und neu „Zum Home-Bildschirm“ — iOS übernimmt es nur beim Hinzufügen.
- Ausgeliefert über GitHub Pages (`kuyajstn/mindos-apps`, bis 09.10. `kuyajstn/Training`; öffentlich — der Code enthält keine Daten
  und keinen Schlüssel; der Schlüssel liegt nur im Browser des Handys).

## Küche: Stand (09.10.)

Viermal so groß wie der Training Hub (324 KB) und mit Schreibwegen, die die App heute verweigert:
`processFrontMatter` (3×, u. a. `done`-Toggle am Meal Plan, `pause` an der Daily Note), `vault.modify` mit
Umschreiben statt Anhängen (5×, z. B. `Zutaten Check`, `Einkaufsliste`, `Reste Ablage`), `trash`/`trashFile`,
`metadataCache.getFileCache` (Überschriften von `Vorrat.md`), `getResourcePath` (Bilder), `executeCommandById`.
Liste neu erzeugen: `grep -o "dv\.[a-zA-Z]*\|app\.[a-zA-Z.]*\|require([^)]*)" "MindOS/02 Life OS/Ernährung/Kitchen Hub.md" | sort | uniq -c`.
Entschieden (Justin, 09.10.): **Umschreiben mit sha-Prüfung, auch aus der Warteschlange.** In `app.js` gebaut,
dazu der Spielstand jede Minute und eine Ansage, wenn das Zusammenführen scheitert.
**Ausgerollt am 09.10.** (`https://kuyajstn.github.io/mindos-apps/kitchen/`): alle Stellen nachgebildet, Handy-Layout (Leiste unten, Kopf
angeheftet, Dialog als Blatt; **seit 10.10.** ohne den Kopf „Kitchen“ mit Glocke, angeheftet ist die Tageszeile `.kt-top` des Tagebuchs), Symbol `kitchen/icon-*.png` (Quelle `werkzeug/icon-kitchen.html`, fotografiert mit
headless Chrome: `--headless=new --window-size=512,512 --screenshot=…`, das geht auch unter 500 px). Mit dem echten
Hub gegen eine Kopie geschrieben: anlegen, „gegessen“ umschalten, Favorit, entfernen.
**Leser** (`leserOeffnen` in `app.js`): Am Mac öffnet der Hub Notizen in Obsidian, am Handy zeigt die App sie selbst
als Blatt. Haken an Zutaten und Schritten nur zum Mitkochen (nicht gespeichert), Bildschirm bleibt an (Wake Lock). **Rezepte (`type: recipe`) als Kochansicht** (seit 10.10., `kochteile`): Abschnitte mit 🛒/🔥/📦 bzw. Zutaten, Zubereitung, Bausteine, Produkt oben, alles andere eingeklappt unter „Werte und Notizen“. `video:` am Rezept wird ein Knopf (YouTube, TikTok, Instagram). **Kochlauf** (seit 10.10., `kochlaufOeffnen`): Lesen → „Kochen starten“ → Wählen → Vorbereiten und Kochen mit zwei Balken → „Als gegessen eintragen“. Rechnung und Eintragen kommen vom Hub über `window.__kh` (fehlt es, zeigt der Leser die Kochansicht wie vorher), Stand unter `ki-lauf:<Pfad>`, verfällt nach 12 Stunden. CSS in `kitchen/mobil.css`. Warum: `MindOS/05 Stack/Context/Decisions/Kochansicht statt ausgelagerter Notizen.md`.
**Vor dem Ausrollen prüfen:** Jede Datei aus `HUELLE` in `sw.js` muss existieren, sonst scheitert die Installation, und
auch das Training verliert seinen Offline-Stand.
Am Handy bewusst nicht: die offenen Tasks zum Hub (`01 Action` wird nicht geladen). **„Beschreiben“ geht seit 09.10.**: ohne Claudian, als
Eintrag, der auf Werte wartet (Kitchen Hub, Stufe 3). Dafür hat `shim()` `app.isMobile = true` (der Hub fragt danach) und
`vault.createBinary`: Das Foto liegt sofort im Bilder-Speicher und geht als `art:'bild'` (schon Base64, nicht im Text-Cache) durch die
Warteschlange, vor dem Eintrag, der darauf zeigt. Scheitert es, ist nur das Foto weg, nicht der Eintrag.
Entschieden (Justin, 09.10.): **Am Handy je Hub eine eigene App** mit eigenem Symbol, kein Umschalter. Der Nachbau von Obsidian (`shim()`) wird trotzdem geteilt, nicht kopiert.
