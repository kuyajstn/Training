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
- **Am Handy wird nur angelegt und angehängt**, nie umgeschrieben. `modify` wirft, wenn der neue Text
  nicht mit dem alten beginnt. Den aktiven Plan stellt nur der Mac um.
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
