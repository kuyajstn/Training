# Training-App — Arbeitsplatz

Der Training Hub aus dem Vault als Web-App fürs iPhone (Symbol auf dem Startbildschirm, kein App Store).
**Die App hat keinen eigenen Hub-Code.** Sie lädt `MindOS/02 Life OS/Training Hub.md` aus dem Vault-Repo
auf GitHub und führt dessen DataviewJS-Block aus. `app.js` bildet nur die Obsidian-Stellen nach, die der
Hub benutzt (`dv.pages/page/current/el`, `app.vault.*`, `require('fs')`). `mobil.css` legt das Handy-Layout
über das CSS des Hubs.

## Gegenstück im Denkraum

- `MindOS/05 Stack/Context/Decisions/Training-App am Handy führt den Hub-Code aus.md`: warum so, was
  am Handy geht und was nicht. **Entscheidungen zur App gehören dorthin.**
- `MindOS/02 Life OS/1. Agent — Life OS.md`, Abschnitt Training Hub: was der Hub-Code einhalten muss,
  damit er auch hier läuft.

## Was beim Ändern zählt

- **Benutzt der Hub eine neue Obsidian-Funktion, stürzt die App ab**, bis sie in `shim()` in `app.js`
  nachgebildet ist. Prüfen mit `grep -o "dv\.[a-zA-Z]*\|app\.[a-zA-Z.]*\|require([^)]*)"` auf den Hub.
- **Das Rad (Wdh × kg) gehört nur der App** (`radOeffnen` in `app.js`): Es füllt die Felder `.tr-satz .g-w/.g-g`, die der
  Hub zeichnet. Benennt der Hub diese Klassen um, findet das Rad nichts mehr.
- **Schreiben läuft immer über die Warteschlange, streng nacheinander** (`schreiben` → `einreihen` → `abarbeiten`).
  `modify` hängt an, wenn der neue Text mit dem alten beginnt, sonst schreibt es um (`art:'ersetzen'`) — mit dem
  sha, auf dem die Änderung beruht. Lehnt GitHub ab (409/422), wird nichts überschrieben: Die Fassung landet unter
  `tr-nicht` und steht oben in der Leiste. `processFrontMatter` wirft weiterhin, den aktiven Plan stellt nur der Mac um.
  **Schreiblogik geändert? Danach `node werkzeug/schreibtest.mjs`** (schnelle Haken, Funkloch, Mac hat inzwischen
  geändert, Anhängen, alte Einträge ohne id, echter Fehler). Läuft gegen ein nachgebautes GitHub, ohne Netz.
- **Prüfen ohne echte Daten:** `node werkzeug/testserver.mjs` liest aus dem Vault, Schreiben ist gesperrt.
  Schreibtests nur gegen eine Kopie: `SCHREIBEN=1 VAULT=/tmp/vault-kopie node werkzeug/testserver.mjs`,
  Funkloch dazu mit `OHNE_NETZ=1`. Bildschirmfoto in iPhone-Breite: `werkzeug/rahmen.html`
  (Testmodus: `?view=plan`, `?klick=Selektor|Selektor=>Wert`).
- **Nach Änderungen an der Hülle** in `sw.js` die Version `V` hochzählen. Am iPhone kommt eine Änderung
  beim **zweiten** Öffnen an (erst lädt die App die neue `sw.js`, dann damit die neuen Dateien). GitHub Pages
  lässt Dateien 10 Minuten zwischenspeichern; `sw.js` fragt deshalb mit `cache:'no-cache'` jedes Mal nach.
- **App-Symbole nur aus `icon-512.png` verkleinern** (`sips -z 180 180 icon-512.png --out icon-180.png`), nie direkt
  per Chrome-Screenshot erzeugen: Chrome öffnet kein Fenster unter ~500 px, kleine Symbole zeigen dann nur den
  linken Rand des Motivs (passiert am 08.10.). Nach neuem Symbol `?v=` in `index.html` und Manifest hochzählen,
  am iPhone das Symbol löschen und neu „Zum Home-Bildschirm“ — iOS übernimmt es nur beim Hinzufügen.
- Ausgeliefert über GitHub Pages (`kuyajstn/Training`, öffentlich — der Code enthält keine Daten
  und keinen Schlüssel; der Schlüssel liegt nur im Browser des Handys).

## Nächster Kandidat: Kitchen Hub (gemessen 09.10.)

Viermal so groß wie der Training Hub (324 KB) und mit Schreibwegen, die die App heute verweigert:
`processFrontMatter` (3×, u. a. `done`-Toggle am Meal Plan, `pause` an der Daily Note), `vault.modify` mit
Umschreiben statt Anhängen (5×, z. B. `Zutaten Check`, `Einkaufsliste`, `Reste Ablage`), `trash`/`trashFile`,
`metadataCache.getFileCache` (Überschriften von `Vorrat.md`), `getResourcePath` (Bilder), `executeCommandById`.
Liste neu erzeugen: `grep -o "dv\.[a-zA-Z]*\|app\.[a-zA-Z.]*\|require([^)]*)" "MindOS/02 Life OS/Ernährung/Kitchen Hub.md" | sort | uniq -c`.
Entschieden (Justin, 09.10.): **Umschreiben mit sha-Prüfung, auch aus der Warteschlange.** In `app.js` gebaut,
dazu der Spielstand jede Minute und eine Ansage, wenn das Zusammenführen scheitert. Noch offen für die Küche:
`processFrontMatter`, `trash`/`trashFile`, `getFileCache`, `getResourcePath` nachbilden.
Entschieden (Justin, 09.10.): **Am Handy je Hub eine eigene App** mit eigenem Symbol, kein Umschalter. Der Nachbau von Obsidian (`shim()`) wird trotzdem geteilt, nicht kopiert.
