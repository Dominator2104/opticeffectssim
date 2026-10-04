# Optische Effekte bei Bewegung nahe der Lichtgeschwindigkeit

Interaktive Simulation zur W-Seminararbeit „Optische Effekte bei Bewegung nahe
der Lichtgeschwindigkeit“ (Dominik Wittkow, Q12, Christoph-Scheiner-Gymnasium
Ingolstadt, Abgabe 10.11.2026). Gezeigt werden Aberration, Doppler-Effekt,
Beaming und der Terrell-Penrose-Effekt für einen Beobachter, der sich mit
β = v/c durch ein ruhendes Sternenfeld bewegt.

## Kennzeichnung als KI-Arbeit

**Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
W-Seminar Physik, CSG Ingolstadt, 24.09.2026.**

Der gesamte Quelltext wurde von der KI geschrieben, nach einem Auftrag, der
die Konventionen und Formeln aus Kapitel 3 der Seminararbeit verbindlich
vorgibt. Jede Quelltextdatei beginnt mit diesem Hinweis, und im Programm steht
unten: „Simulation erstellt mit Claude Code (KI). Physikalische Grundlagen
siehe Kapitel 3 der Seminararbeit.“ Gespeicherte Standbilder tragen auf Wunsch
ebenfalls den Hinweis.

## Starten

Voraussetzung: Node.js (ab Version 20).

```
npm install      # einmalig: three.js, Vite, Vitest
npm test         # Tests der Physik (Vitest)
npm run dev      # Entwicklungsserver, Adresse wird angezeigt
npm run build    # erzeugt dist/index.html
```

`dist/index.html` lässt sich **ohne Server per Doppelklick öffnen**. Dafür
schreibt die Vite-Konfiguration das gebündelte JavaScript direkt in die
HTML-Datei (Browser laden JavaScript-Module nicht über `file://`). Zur Laufzeit
wird nichts aus dem Netz geladen; three.js ist mitgebündelt.

## Container (GitHub-Paket)

Bei jedem Push auf `main` (oder manuell unter *Actions → Container-Image
veröffentlichen → Run workflow*) testet und baut der Workflow
`.github/workflows/container.yml` das Image und veröffentlicht es in der GitHub
Container Registry:

```
ghcr.io/dominator2104/opticeffectssim:latest        # immer der neueste Stand von main
ghcr.io/dominator2104/opticeffectssim:sha-<commit>  # fester Stand
```

Der Container liefert die Simulation mit nginx (ohne root-Rechte) auf
**Port 5000** aus, für `linux/amd64` und `linux/arm64`. `/healthz` antwortet
mit `ok` und wird vom `HEALTHCHECK` benutzt. Das Cockpit-Bild ist nicht
enthalten (`.dockerignore`); im Container erscheint der Platzhalter, „Bild
wählen…“ funktioniert.

Beispiel für einen Docker-Stack hinter einem vorhandenen nginx (kein Port nach
außen nötig, nginx und Dienst im selben Netzwerk):

```yaml
services:
  opticeffectssim:
    image: ghcr.io/dominator2104/opticeffectssim:latest
    networks: [proxy]
    deploy:
      restart_policy:
        condition: any
networks:
  proxy:
    external: true
```

```nginx
location /simulation/ {
    proxy_pass http://opticeffectssim:5000/;
}
```

Die Seite verwendet nur relative Pfade und bettet alles in `index.html` ein,
sie läuft daher unter jedem Unterpfad.

Lokal ausprobieren: `docker build -t opticeffectssim . && docker run -p 5000:5000 opticeffectssim`,
dann http://localhost:5000 öffnen.

## Konventionen (aus Kapitel 3 der Seminararbeit)

| Größe | Bedeutung |
|---|---|
| `S` | Ruhesystem der Sterne und der Umgebung |
| `S'` | Ruhesystem des Raumschiffs (momentan mitbewegtes Inertialsystem) |
| `β = v/c` | Relativgeschwindigkeit, Bewegung entlang der z-Achse |
| `γ = 1/√(1−β²)` | Lorentzfaktor |
| `θ` | Winkel des Wellenvektors (Ausbreitungsrichtung des Lichts) gegen +z, gemessen in `S` |
| `ψ = 180° − θ` | Blickwinkel zum Stern gegen die Flugrichtung; `cos ψ = −cos θ` |
| `D` | Wellenlängenverhältnis `λ' = λ·D`; nach vorn `D < 1` (Blauverschiebung) |

`D = 1 / (γ·(1 − β·cos θ)) = 1 / (γ·(1 + β·cos ψ))`, genau nach vorn
`D = √((1−β)/(1+β))`.

**Achtung:** Viele Quellen (u. a. Kraus 2000) nennen den Kehrwert `1/D`
„Dopplerfaktor“. In dieser Simulation ist `D` immer `λ'/λ`.

## Formeln und wo sie im Code stehen

Alle Formeln stehen als reine Funktionen in **`src/physics.js`** (ohne jede
Abhängigkeit zu three.js). Diese Datei wird geprüft und getestet. Der Shader in
`src/render.js` ist eine wörtliche Übersetzung; über jeder Shader-Funktion steht,
welche Funktion aus `physics.js` sie übersetzt.

| Effekt | Formel | Funktion in `physics.js` | Quelle |
|---|---|---|---|
| Aberration | `cos ψ' = (cos ψ + β)/(1 + β·cos ψ)`, `φ' = φ` | `aberrationCosPsi`, `aberrationPsi`, `aberrateDirection` | Dragon 2006, S. 42, Gl. (3.24); Weiskopf u. a. 1999, S. 280, Gl. (4), (5) |
| Aberration als Vektor | `n'_z = cos ψ'`, `n'_x,y = D·n_x,y` (wegen `sin ψ' = D·sin ψ`) | `aberrateDirection` | Umformung der Zeile oben, im Kommentar hergeleitet |
| Doppler | `λ' = λ·D`, `D = 1/(γ(1 + β cos ψ))` | `dopplerFactor`, `dopplerFactorTheta` | Kapitel 3 der Arbeit |
| Doppler aus der gesehenen Richtung | `D = γ·(1 − β·cos ψ')` | `dopplerFactorFromPrime` | aus der Umkehrung der Aberration, im Kommentar hergeleitet |
| Scheinbare Temperatur | `T' = T/D` | `apparentTemperature` | Wiensches Verschiebungsgesetz `λ_max·T = const` |
| Beaming, punktförmig (Sterne) | `F'/F = D⁻²` | `beamingPointSource` | Weiskopf u. a. 1999, S. 283, Gl. (14), (15); Kraus 2000, S. 56 |
| Beaming, Fläche (Würfel, Kugel) | `L'/L = D⁻⁴` | `beamingExtended` | Weiskopf u. a. 1999, S. 283, Gl. (14), (15); Kraus 2000, S. 56 |
| Sterndichte | `dΩ'/dΩ = D²`, also `n'/n = D⁻²` | `solidAngleRatio` (nur Anzeige/Test) | entsteht im Renderer automatisch, kein Zusatzfaktor |
| Kegel der vorderen Himmelshälfte | `ψ' = arccos β`, Anteil `(1 − β)/2` | `psiPrimeOfSideStar`, `forwardConeSkyFraction` | aus der Aberrationsformel |
| Terrell-Penrose | Richtung zu jedem Körperpunkt in `S`, dann Aberration | `aberrateDirection` (Shader: `BODY_VERTEX`) | Terrell 1959, S. 1041–1042, Fußnote 5; Boas 1961, S. 283–285; Konformität: Dragon 2006, S. 44 |
| Konstante Eigenbeschleunigung | `β(t) = (at/c)/√(1 + (at/c)²)`, `t` in `S` | `betaConstantProperAcceleration` | Auftrag, Kapitel 3 |
| … von β₀ nach β₁ (auch Bremsen) | `u = βγ` ändert sich linear: `u(t) = u₀ ± at/c`; Dauer `T = (c/a)·|u₁ − u₀|`, umgekehrt `a = (c/T)·|u₁ − u₀|` | `betaConstantBetween`, `accelerationDuration`, `accelerationFromDuration` | Verallgemeinerung der Zeile oben (`dp/dt = m·a`), im Kommentar begründet |
| Terrell-Drehwinkel | `α = ψ − ψ'` mit ψ aus der Umkehrung der Aberration; bei `ψ' = 90°`: `α = arcsin β` | `terrellRotationAngle`, `psiFromPsiPrime` | Terrell 1959; Boas 1961 |
| Scheinbare Verkürzung | `sin ψ / sin ψ' = 1/D = 1/(γ(1 − β cos ψ'))`; bei `ψ' = 90°` genau `1/γ` | `terrellLengthFactor` | aus `sin ψ' = D·sin ψ` |
| Sichtbare Sterne (Übersicht) | sichtbar, wenn `F·D²·Y(T')/Y(T) ≥ 10^(−0,4·6,5)` | `nakedEyeVisibleCount` | Grenzgröße 6,5 mag (Richtwert) |
| Eigenzeit an Bord | `τ = ∫ dt/γ` (numerisch); geschlossen `τ = (c/a)·arsinh(at/c)` | `properTimeNumeric`, `properTimeConstantAcceleration` | Zeitdilatation |
| Helligkeit nur im Sichtbaren (Zusatz) | Stern: `D²·Y(T')/Y(T)`, Fläche: `Y(T')/Y(T)` | `beamingPointSourceVisible`, `beamingExtendedVisible`, `visibleSpectralFactor` | Herleitung im Kommentar; Probe mit `Y ∝ T⁴` ergibt wieder `D⁻²` bzw. `D⁻⁴` (getestet) |
| Wien | `λ_max = b/T`, `b = 2,897771955·10⁻³ m·K` | `wienPeakWavelengthNm` | CODATA 2018 |
| 3D-Flug: Zeitdilatation | `dt = γ·dτ` (Zeitsteuerung in Bordzeit τ) | `coordinateTimeStep` | Zeitdilatation |
| 3D-Flug: Strecke in S | `ds = β·c·dt`, in Lj und Jahren `ds = β·dt` | `distanceStepLy` | — |
| 3D-Flug: Helligkeit nach Entfernung | `F = 10^(−0,4·M)·(10 pc / r)²` (Entfernungsmodul, 1/r²) | `fluxFromAbsoluteMagnitude` | Entfernungsmodul `m = M + 5·log10(r/10 pc)` |
| Anteil im Sichtbaren | `f(T) = ∫₃₈₀⁷⁸⁰ B_λ dλ / (σT⁴/π)` | `visibleFraction` (blackbody.js) | Stefan-Boltzmann; Kennzeichnung „nur UV/IR“ bei `f < 1 %` |

Farbe (`src/blackbody.js`): Planck-Spektrum `B_λ(λ, T)` wird über 380–780 nm
gegen die CIE-1931-Normspektralwertfunktionen (2°-Normalbeobachter, 5-nm-Schritte,
`src/cie1931.js`) integriert, mit der Matrix nach IEC 61966-2-1 nach linearem
sRGB umgerechnet und auf gleiche Helligkeit normiert. Die Nachschlagetabelle
wird beim Start einmal berechnet (1 024 Stufen, logarithmisch von 500 K bis
10⁶ K, auf Wunsch des Auftraggebers erweitert gegenüber 1 000–40 000 K) und als
1D-Textur an den Shader gegeben.

Modus **„gesamtes Spektrum“** (Falschfarben, `falseColor` in `blackbody.js`):
Der Bereich 50 nm – 20 µm wird logarithmisch auf 380–780 nm abgebildet
(`λ_echt = 50 nm · 400^((λ_Anzeige − 380 nm)/400 nm)`), die Strahlung jedes echten
Wellenlängenintervalls wird der zugehörigen Anzeige-Wellenlänge zugeordnet und
wie oben in eine Farbe umgerechnet. Die Helligkeit ist dann bolometrisch (`D⁻²`).
Sterne mit weniger als 1 % ihrer Strahlung im Sichtbaren werden automatisch
gekennzeichnet (Ring: praktisch nur UV, Quadrat: praktisch nur IR; welche Seite,
entscheidet die Lage des Maximums nach Wien).

**Ehrlicher Hinweis (auch im Programm als Fußnote):** Bei großem β verschiebt
sich sichtbares Licht ins UV und Infrarotes ins Sichtbare. Die Simulation zeigt
die Farbe des verschobenen Schwarzkörpers. Das ist korrekt, solange man das
Spektrum des Sterns als vollständiges Planck-Spektrum annimmt.

## Tests

`npm test` führt `tests/physics.test.js` und `tests/blackbody.test.js` aus
(50 Tests). Sollwerte bei β = 0,9:

| Größe | Sollwert |
|---|---|
| γ | 2,294 |
| `D` nach vorn | 0,2294 |
| `ψ'` für `ψ = 90°` | 25,84° |
| Anteil des Himmels `(1−β)/2` | 5,0 % |
| `D⁻²` | 19,0 |
| `D⁻⁴` | 361 |

Dazu strukturelle Tests: β = 0 lässt jede Richtung unverändert; ψ = 0° und
ψ = 180° sind Fixpunkte; ψ' < ψ für 100 zufällige Winkel bei mehreren β;
θ- und ψ-Form liefern dasselbe; `dΩ'/dΩ = D²` numerisch; der Umrisskreis einer
Kugel bleibt nach der Aberration ein Kreis; Farborte von Normlichtart A
(2 856 K) und des Planck-Punkts bei 6 500 K; Eigenzeit numerisch = geschlossene
Form; Beschleunigung zwischen β₀ und β₁ (Dauer ↔ a, Bremsen, `u = βγ` linear);
Terrell-Drehwinkel `arcsin β` und Verkürzung `1/γ` bei `ψ' = 90°`; Sichtbarkeitsanteil
und Falschfarben; Zählung der mit bloßem Auge sichtbaren Sterne; 3D-Modus (`tests/stars3d.test.js`):
`dt = γ·dτ`, Strecke, Entfernungsmodul, Reproduzierbarkeit und Anzahl der Sterne je Zelle.

Zusätzlich im Browser geprüft (während der Entwicklung, nicht Teil von `npm test`):

- Ein Stern bei ψ = 90° erscheint bei β = 0,9 bis auf < 1 Pixel an der von
  `physics.js` vorhergesagten Stelle (beide Projektionen).
- Pixelfarben stimmen auf 1/255 mit `blackbody.js` überein, auch bei T' ≈ 1,3·10⁶ K.
- Helligkeitsverhältnis im Bild bei β = 0,9 nach vorn: 19,3 (Soll 19,0, Rest ist
  8-Bit-Rundung), nur sichtbar: 2,61 (Soll 2,60).
- Kugel: Achsenverhältnis des Bildes ≤ 1,002 in der stereografischen Ansicht bei
  allen geprüften β (0 bis 0,99), Richtungen und Bildpositionen.

**Selbsttest im Programm:** Unter „Terrell-Körper“ misst der Knopf „Rundheit der
Kugel messen“ das Achsenverhältnis des aktuellen Kugelbildes (1 = Kreis).
In der stereografischen Projektion bleibt es bei jedem β bei 1. In der
Zentralprojektion (Perspektive) wird eine Kugel neben der Bildmitte schon bei
β = 0 elliptisch (bis ≈ 1,05 gemessen). Das ist die bekannte Verzeichnung von
Weitwinkelaufnahmen, keine Relativitätstheorie.

## Bedienung

Oben gibt es zwei Reiter: **Simulation** und **Übersicht**. β-Regler und
Beschleunigungsphase sind in beiden vorhanden und immer synchron.

- **β-Regler:** logarithmisch in (1 − β), 0 bis 0,999; Zahlenfeld daneben.
- **Beschleunigungsphase:** Kurve (konstante Eigenbeschleunigung, linear in β,
  weiche Ein-/Ausblendkurve), Start-β und End-β (End-β kleiner heißt Bremsen).
  Entweder die **Eigenbeschleunigung a** vorgeben, dann wird die Dauer berechnet,
  oder die **Dauer** (Zeit in `S`) vorgeben, dann wird a berechnet. Alle drei
  Kurven laufen über dieselbe Dauer zwischen denselben Werten. Start, Pause,
  Zurücksetzen, Abspielzeit; der β-Regler folgt der Kurve, ein Handeingriff hält an.
  Angezeigt werden t in `S` und die Eigenzeit τ an Bord.
- **Effekte einzeln schaltbar:** Aberration, Doppler, Beaming,
  Sichtfeldmarkierung ±16° (Cockpitfenster der untersuchten Filmszene, Vorgabe aus),
  Cockpit-Overlay, Terrell-Körper.
- **Spektrum:** „nur sichtbares Licht“ (Farbe und Helligkeit, wie ein Auge sie
  sähe) oder „gesamtes Spektrum“ (Falschfarben, bolometrische Helligkeit,
  automatische Kennzeichnung „nur UV/IR“).
- **Terrell-Körper:** Platzierung über den **gesehenen** Winkel ψ' (Vorgabe 90°)
  oder über ψ in `S`. Ein **Vergleichswürfel** (Drahtgitter) zeigt, wie ein ruhender
  Würfel an derselben Bildstelle und in derselben scheinbaren Entfernung aussähe;
  der Unterschied ist die Terrell-Drehung. Angezeigt werden ψ, ψ', Drehwinkel α und
  scheinbare Verkürzung. **Vorbeiflug:** Der Beobachter fliegt am ruhenden Würfel
  vorbei, die Kamera folgt ihm.
- **3D-Flug (Schalter, Vorgabe aus):** Statt der Himmelskugel bekommt jeder Stern
  eine feste Position in `S`, und das Schiff fliegt mit β in +z hindurch. In jedem
  Bild werden Richtung und Entfernung von der aktuellen Position aus berechnet;
  dann dieselbe Aberration, derselbe Doppler-Effekt und dasselbe Beaming, dazu
  die Helligkeit nach Entfernung (1/r²). Zeitsteuerung in Bordzeit τ: Zeitlupe
  1:100 und 1:10, Echtzeit, Zeitraffer bis 1 s = 100 Jahre; Flug starten,
  anhalten, zum Start zurück. Eine Beschleunigungsphase läuft im 3D-Modus mit
  dieser Uhr. Sterndichte 0,1× bis 4× der realistischen Dichte (0,004 Sterne/Lj³),
  Zellgröße (Kantenlänge) 20–250 Lj. Angezeigt werden τ, t in `S`, Strecke,
  geladene Sterne und Abstand zum nächsten Stern.
- **Ansicht:** Projektion (Perspektive / stereografisch), Sichtfeld (Vorgabe 60°),
  Belichtung, Sternzahl der Himmelskugel (10 000 bis 1 000 000). Umschauen durch Ziehen mit der
  Maus, Doppelklick schaut wieder nach vorn.
- **Standbild speichern** als PNG, wahlweise mit Werten und KI-Hinweis im Bild.
- **Graphen:** γ über β mit Marker; während der Beschleunigungsphase β über t.
- **Debug-Panel:** alle Werte, die sich mit β ändern, mit Einheit.

**Übersicht:** Diagramme über β mit Marker beim aktuellen Wert: Lorentzfaktor;
Dopplerfaktor nach vorn, quer und nach hinten (logarithmisch); gesehener Winkel
eines Sterns, der in `S` quer steht; Beaming `D⁻²` und `D⁻⁴` nach vorn
(logarithmisch); Anzahl der mit bloßem Auge sichtbaren Sterne des Sternfelds
(Doppler und Beaming im sichtbaren Licht). Dazu Tabellen mit eintragbaren
Zeilen: Aberration (ψ → ψ', Verschiebung, Himmelsanteil des Kegels in `S` und `S'`),
Terrell-Drehung (ψ' → ψ, Drehwinkel, Verkürzung) und Doppler-Effekt (ψ', λ, T →
D, λ', Bereich von λ', T', Farbe bei T').

## Cockpit-Bild

Das Standbild des Millennium Falken liefert der Auftraggeber als
`assets/cockpit.png`. **Es ist urheberrechtlich geschützt: nur lokal verwenden,
nicht veröffentlichen.** Die Datei steht in `.gitignore` und wird nicht in
`dist/` kopiert. Der Build sucht sie unter `../assets/cockpit.png`, also im
Projektordner neben `dist/`. Fehlt sie, erscheint ein Platzhalter. Mit
„Bild wählen…“ lässt sich das Bild auch direkt auswählen; nur so kann der
Browser es beim Öffnen per Doppelklick auch ins gespeicherte Standbild
übernehmen (Sicherheitsregel für Dateien von `file://`).

## Darstellungsentscheidungen (keine Physik)

Damit klar ist, was aus einer Formel folgt und was nur Darstellung ist:

- **Punktgröße der Sterne:** Ein Bildschirm kann nicht beliebig hell werden.
  Bis zur vollen Pixelhelligkeit steigt die Leuchtdichte des Lichtflecks,
  darüber wächst seine Fläche proportional zur Bestrahlungsstärke, bis zu
  einer Höchstgröße. Die Farbe wird dabei so ausgeglichen, dass Sterne gleicher
  Bestrahlungsstärke gleich hell wirken.
- **Belichtung** (Sterne und Körper getrennt): entspricht der Belichtung einer
  Kamera, in Größenklassen (mag).
- **Rechnen in linearen Farbwerten:** Das Bild wird in einem Gleitkommapuffer
  addiert und erst am Ende nach sRGB umgerechnet. Überhelle Stellen werden
  abgeschnitten (weiß), nicht umgerechnet.
- **Projektion:** Perspektive wie eine Kamera oder stereografisch (winkeltreu).
- **Sternenfeld:** fester Zufallsstartwert (reproduzierbare Abbildungen),
  gleichmäßig nach Raumwinkel. Temperaturen nach der Häufigkeit der
  Spektralklassen (Hauptreihensterne nach Anzahl, LeDrew 2001), 2 500 bis
  30 000 K. Helligkeiten −1 bis 6,5 mag nach `N(<m) ∝ 10^(0,6·m)`.
- **Terrell-Körper:** selbstleuchtende Schwarzkörper mit Schachbrettmuster,
  damit Form und Drehung erkennbar sind. Die Würfelflächen haben verschiedene
  Temperaturen (vorn +z 9 000 K, hinten −z 3 500 K, Seiten 5 800 K), damit man
  sagen kann, welche Fläche man sieht. Sichtbar ist eine Fläche, wenn sie in `S`
  zum Beobachter hin abstrahlt; welche Lichtstrahlen den Beobachter treffen,
  hängt nicht vom Bezugssystem ab.
- **Außerhalb der Farbtabelle:** Farbe vom Tabellenrand (für T → ∞ konvergiert
  die Farbe ohnehin); die sichtbare Helligkeit wird oberhalb von 10⁶ K nach
  Rayleigh-Jeans (Y ∝ T) fortgesetzt, unterhalb von 500 K ist sie praktisch null.
- **β-Obergrenze:** Regler und Beschleunigungskurven sind auf β ≤ 0,999 begrenzt.
- **Falschfarben:** Bereich 50 nm – 20 µm und logarithmische Stauchung sind eine
  Wahl der Darstellung (Kompromiss zwischen Unterscheidbarkeit in Ruhe und
  Abdeckung extremer Temperaturen); Strahlung außerhalb fließt in die Helligkeit,
  nicht in die Farbe ein.
- **Sichtbare Sterne (Übersicht):** Das Sternfeld enthält nur Sterne bis 6,5 mag in
  Ruhe. Schwächere Sterne, die nach vorn heller würden, kommen darin nicht vor.
- **3D-Sternfeld:** Der Raum ist in Würfelzellen geteilt; jede Zelle erzeugt ihre
  Sterne mit einem Zufallsstartwert aus ihren Koordinaten (`src/stars3d.js`). So ist
  das Feld unendlich, wiederholt sich nie und ist reproduzierbar. Geladen sind die
  27 Zellen um das Schiff (Sichtweite mindestens eine Kantenlänge). Leuchtkraft:
  Hauptreihe mit gerundeten Richtwerten der absoluten Helligkeit je Temperatur nach
  Pecaut & Mamajek (2013), Streuung 0,3 mag, dazu 1 % Rote Riesen (vereinfachtes
  Modell). Sehr weit entfernte leuchtstarke Sterne außerhalb der geladenen Zellen
  fehlen, der Himmel ist deshalb etwas leerer als der echte. Die Sterne haben keine
  Eigenbewegung. Im 3D-Modus sind alle Längen Lichtjahre.
- **Vergleichswürfel:** liegt in der Entfernung `r/D` des Emissionsereignisses in
  `S'`, damit er gleich groß wie das Bild des Terrell-Würfels erscheint.

Ausdrücklich nicht enthalten: gekrümmte Raumzeit, Überlichtgeschwindigkeit,
„Star-Wars-Streifen“ und Effekte ohne physikalische Begründung.

## Projektstruktur

```
index.html
vite.config.js      base './', Einbetten für den Build ohne Server
Dockerfile          Container-Image (nginx, Port 5000)
docker/nginx.conf   nginx-Konfiguration im Container
.github/workflows/  container.yml: Image bauen und veröffentlichen
src/
  main.js           Aufbau, Animationsschleife, Debug-Werte
  physics.js        alle Formeln als reine Funktionen, ausführlich kommentiert
  blackbody.js      Planck → CIE → sRGB, Nachschlagetabelle
  cie1931.js        CIE-1931-Normspektralwertfunktionen (Daten)
  stars.js          Sternenfeld der Himmelskugel (fester Zufallsstartwert)
  stars3d.js        3D-Sternfeld in Zellen, Leuchtkraftmodell
  bodies.js         Würfel und Kugel für Terrell-Penrose
  render.js         three.js-Szene, Shader
  ui.js             Bedienelemente, Reiter, Debug-Panel, Graphen der Simulation
  charts.js         Liniendiagramme auf <canvas>
  overview.js       Reiter „Übersicht“: Diagramme und Tabellen
  overlay.js        Cockpit-Bild, Standbild-Export
  style.css
tests/
  physics.test.js   Vitest
  blackbody.test.js Vitest
  stars3d.test.js   Vitest
assets/
  cockpit.png       liefert der Auftraggeber (nicht im Repository)
```

## Quellen

Kurzbelege wie in Kapitel 3 der Seminararbeit; vollständige Angaben im
Literaturverzeichnis der Arbeit (bitte damit abgleichen).

- Boas, M. L. (1961): Apparent Shape of Large Objects at Relativistic Speeds.
  American Journal of Physics 29, S. 283 ff.
- Dragon, N. (2006): Geometrie der Relativitätstheorie (Skript).
- Kraus, U. (2000): Brightness and color of rapidly moving objects: The visual
  appearance of a large sphere revisited. American Journal of Physics 68, S. 56 ff.
- Terrell, J. (1959): Invisibility of the Lorentz Contraction. Physical Review
  116, S. 1041 ff.
- Weiskopf, D.; Kraus, U.; Ruder, H. (1999): Searchlight and Doppler Effects in
  the Visualization of Special Relativity: A Corrected Derivation of the
  Transformation of Radiance. ACM Transactions on Graphics 18(3), S. 278 ff.
- Pecaut, M. J.; Mamajek, E. E. (2013): Intrinsic Colors, Temperatures, and
  Bolometric Corrections of Pre-main-sequence Stars. The Astrophysical Journal
  Supplement Series 208, Artikel 9 (Hauptreihentabelle, absolute Helligkeiten).
- LeDrew, G. (2001): The Real Starry Sky. Journal of the Royal Astronomical
  Society of Canada 95, S. 32 ff. (Häufigkeit der Spektralklassen).
- CIE-1931-Normspektralwertfunktionen: Datensatz „CIE 1931 2 Degree Standard
  Observer“ aus colour-science 0.4.7 (nach CVRL, University College London).
- IEC 61966-2-1 (sRGB): Umrechnungsmatrix XYZ → sRGB und sRGB-Kennlinie.
