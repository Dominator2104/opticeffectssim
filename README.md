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
vorgibt. Jede Quelltextdatei beginnt mit diesem Hinweis. In der Oberfläche des
Programms selbst steht kein Hinweis; die Kennzeichnung als KI-Arbeit erfolgt
durch den Auftraggeber in der Seminararbeit und bei jeder Verwendung.

## Starten

Voraussetzung: Node.js 26 (mindestens 22.12, das verlangen Vite und Vitest).

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
mit `ok` und wird vom `HEALTHCHECK` benutzt. Das freigestellte Cockpit-Bild
ist enthalten und per Haken „Cockpit-Overlay“ einblendbar.

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
| Visuell → bolometrisch | `k(T) = (T/5800 K)⁴ · Y(5800 K)/Y(T)`; im Modus „gesamtes Spektrum“ wird die (visuelle) Grundhelligkeit damit umgerechnet | `bolometricToVisibleRatio` | bolometrische Korrektur eines Schwarzkörpers relativ zur Sonne |
| Anteil im Sichtbaren | `f(T) = ∫₃₈₀⁷⁸⁰ B_λ dλ / (σT⁴/π)` | `visibleFraction` (blackbody.js) | Stefan-Boltzmann; Kennzeichnung „nur UV/IR“ bei `f < 1 %` |
| Wanderung beim Beschleunigen | `dψ'/dβ = −γ²·sin ψ'`; bei konstanter Eigenbeschleunigung `dψ'/dτ = −(a/c)·sin ψ'` | `aberrationAngleRate` | aus der Aberrationsformel, im Kommentar hergeleitet |
| Hyperbelbewegung in Eigenzeit | `β(τ) = tanh(artanh β₀ + aτ/c)`, `a = c·artanh(Δv/c)/Δt` | `betaHyperbolicProperTime`, `properAccelerationForProperTime` | Rapidität wächst linear mit der Eigenzeit; gegen `betaConstantProperAcceleration` getestet |
| Bewegungsunschärfe | Teilbilder mit `β(τᵢ)` und Ort `z(τᵢ)`, Gewicht `1/n`, linear summiert | `motionBlurBetaAt`, `motionBlurOffsetLy`, `motionBlurSchedule`, `motionBlurStepCount` | Abschnitt „Bewegungsunschärfe“ unten |
| Bordzeit bei beliebiger Kurve β(t) | `dt/dτ = γ`, `dz/dτ = β·γ·c` (RK4) | `advanceProperTime`, `shutterPlanFromCurve`, `rapidityChangeDuringExposure` | Zeitdilatation; gegen die geschlossene Hyperbelbewegung getestet |

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

`npm test` führt `tests/physics.test.js`, `tests/blackbody.test.js`,
`tests/stars3d.test.js`, `tests/motionblur.test.js` und `tests/optics.test.js` aus
(80 Tests; die Tests der Bewegungsunschärfe und des Objektivs sind unten in den
jeweiligen Abschnitten aufgeführt). Sollwerte bei β = 0,9:

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

**Unabhängige Gegenprüfung** (ohne die Formeln aus `physics.js`): Aberration und
`D` werden für 600 zufällige Richtungen direkt per Lorentz-Transformation des
Photonen-Viererimpulses nachgerechnet (Übereinstimmung auf 9 Stellen); die
Beschleunigungskurve durch numerisches Integrieren von `dβ/dt = (a/c)(1 − β²)^{3/2}`
(Übereinstimmung auf 6 Stellen).

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
- **Kamera:** Projektion (Perspektive / stereografisch), Sichtfeld (Vorgabe 60°),
  Belichtung, Sternzahl der Himmelskugel (10 000 bis 1 000 000), Sternabbildung,
  simuliertes Objektiv und Bewegungsunschärfe (Abschnitte unten). Umschauen durch
  Ziehen mit der Maus oder dem Finger, Doppelklick schaut wieder nach vorn.
- **Export** (alle Bildausgaben in einem Abschnitt): Bildformat (wie Ansicht,
  Film 2272 × 951, Full HD, 4K), Werte ins Bild schreiben, Cockpit mitspeichern;
  Knöpfe **Standbild (PNG)**, **Video…** und **Showcase-Poster**. Während eines
  Exports zeigt ein Fortschrittsbalken Bild, Teilbild und Restzeit, „Abbrechen“
  hält an. Ein gesperrter Knopf nennt beim Darüberfahren den Grund.
- **Showcase-Poster:** Poster in 3840 × 2160
  im Stil der Programmoberfläche. Das Simulationsbild füllt das ganze Poster und wird dafür
  neu gerendert. Darüber liegen halbtransparente Fenster:
  - **Steuerung:** die Schieberegler (β mit logarithmischer Skala, Sichtfeld, Belichtung),
    Schalter, Projektion, Spektrum und 3D-Flug im aktuellen Zustand
  - **Telemetrie:** Fachbegriffe mit Werten, z. B. Lorentzfaktor, Dopplerfaktor,
    Aberrationswinkel, Raumwinkelkompression, Wien-Maximum, Beaming
  - **Planck-Spektrum:** in Ruhe und von vorn gesehen
  - **Referenzbild:** derselbe Blick im Ruhesystem S
  - **Render-Pipeline:** die Rechenschritte pro Stern mit den Werten eines markierten Sterns
  - **Code-Fenster:** der echte Shader-Code aus `render.js`

  In der Szene sind bis zu drei Sterne markiert (A, B, C), jeweils mit Fachbegriff,
  z. B. „Relativistische Blauverschiebung“, und mit ihren berechneten Werten
  (T → T′, ψ → ψ′, D, F′/F, im 3D-Modus r). Dazu kommen der Aberrationskegel
  und eine Großanzeige von β, v und γ. Die markierten Sterne werden mit denselben
  Formeln bewertet wie im Shader (`src/showcase.js`).
- **Präsentationsmodus** (Knopf „⛶ Präsentation“ oben rechts): Vollbild, sichtbar
  bleiben nur Play/Anhalten, der 3D-Schalter und der Geschwindigkeitsregler. Play
  steuert im 3D-Modus den Flug, sonst die Beschleunigungsphase; Leertaste wirkt
  wie Play. Die Leiste blendet sich aus, wenn die Maus 3 s ruht. Beenden mit ✕ oder Esc.
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

## Bewegungsunschärfe (live, Standbild und Video)

*Ergänzt am 03./04.11.2026, live und im normalen Modus seit 12.11.2026.*

Eine echte Kamera belichtet jedes Bild eine endliche Zeit lang. Ändert sich
währenddessen β oder der Ort des Schiffs, wandern die Sterne im Bild und
hinterlassen Streifen. Der Schalter **„Belichtungszeit simulieren“** (Abschnitt
„Kamera“) rechnet das nach, in der Ansicht, im Standbild und im Video, im
normalen Modus (Himmelskugel) wie im 3D-Flug. Streifen entstehen
**ausschließlich** aus dieser Rechnung: Es gibt keinen künstlichen
Streifeneffekt, keine Überlichtphase und keine gekrümmte Raumzeit.

**Einstellungen:**
- **Verschlusszeit t_b** (als Bruch oder Dezimalzahl, Vorgabe 1/48 s: 24 Bilder/s,
  180°-Umlaufverschluss). Sie gilt **an Bord**, also in der Eigenzeit der Kamera.
- **Beschleunigung während t_b:**
  - *aus der Beschleunigungsphase* (Vorgabe): Die Belichtung endet im aktuellen
    Moment der laufenden oder angehaltenen Beschleunigungsphase; β(t) folgt der
    gewählten Kurve (auch linear in β oder weiche Kurve). Ist keine Phase aktiv,
    bleibt β konstant.
  - *fest: Δv in Δt*: Vorgabe Δv = 0,99 c in Δt = 3 s (00:56:54 → 00:56:57 der
    Filmszene), daraus `a = c·artanh(Δv/c)/Δt = 2,645·10⁸ m/s² ≈ 2,70·10⁷ g`;
    vorher `β(τ) = tanh(max(0, artanh β_E + aτ/c))` für `−t_b ≤ τ ≤ 0`.
- **Teilbilder live höchstens** (4, 8, 16 oder 32, Vorgabe 16; auf Touch-Geräten höchstens 8).

Bei konstantem β bewegt sich auf der Himmelskugel nichts, das Bild bleibt scharf.
Im 3D-Flug wandern dann nur nahe Sterne (Parallaxe), Lichtjahre entfernte in
1/48 s praktisch nicht.

**Rechnung** (`physics.js`, Abschnitt 8):

1. **Belichtungsplan:** Die Belichtung `[τ_E − t_b, τ_E]` wird in n gleich lange
   Teilbilder zerlegt, jedes in seiner Mitte ausgewertet, Gewicht 1/n.
   - Beliebige Kurve β(t) in S (`shutterPlanFromCurve`): Von der aktuellen
     Zeit t in S wird rückwärts in Bordzeit integriert, `dt/dτ = γ`,
     `dz/dτ = β·γ·c` (RK4, `advanceProperTime`).
   - Feste Eigenbeschleunigung (`motionBlurSchedule`): geschlossen,
     `z(τ) − z(0) = −(c²/a)·(cosh η(0) − cosh η(τ))` (`motionBlurOffsetLy`).
   Für die konstante Eigenbeschleunigung liefern beide Wege dasselbe (getestet).
2. **Zahl der Teilbilder** (`motionBlurStepCount`): so viele, dass ein Stern je
   Teilbild höchstens 1 px wandert. Obergrenze der Wanderung:
   - Aberration: höchstens die Änderung der Rapidität Δη während t_b
     (bei konstantem a: `Δη = a·t_b/c`, wegen `|dψ'/dτ| = (a/c)·sin ψ' ≤ a/c`);
   - Parallaxe (3D-Flug): Strecke / Abstand des nächsten Sterns oder Körpers,
     mal `D_max = γ(1 + β)`.

   Das Ergebnis wird mit der größten Bildskala in der Bildecke multipliziert.
3. **Rendern** (`render.js`, `beginAccumulation`/`accumulate`/`present`): Jedes
   Teilbild wird mit den normalen Shadern gerendert (Aberration, Doppler,
   Beaming für das momentane β und den momentanen Ort) und gewichtet in einem
   32-Bit-Gleitkommapuffer aufsummiert. **Erst danach** folgen Objektiv,
   Tonkurve und sRGB-Kennlinie.

**Live:** Braucht ein Bild mehr Teilbilder als erlaubt, zeigt die Ansicht
zuerst eine gröbere Zerlegung derselben Belichtung. Steht die Szene still
(z. B. Beschleunigung angehalten), wird sie Bild für Bild verfeinert
(grob → fein), bis alle Teilbilder drin sind. Standbild und Video rechnen immer
mit allen Teilbildern. Die Anzeige „Teilbilder: x von y“ steht unter dem
Schalter und im Debug-Panel.

Ein ruhender Stern ist so hell wie ohne Unschärfe. Ein bewegter verteilt
dasselbe Licht auf seinen Streifen und wird dadurch dunkler.

**Was man erwarten kann:** Bei konstanter Eigenbeschleunigung gilt
`dψ'/dτ = −(a/c)·sin ψ'`, unabhängig von β. Mit der Vorgabe wandert ein Stern
in 1/48 s also höchstens um 1,05°·sin ψ'. Bei β = 0,99 drängt die Aberration
die meisten Sterne nahe an den Fluchtpunkt. Dort ist sin ψ' klein, die
Streifen sind kurz. Bei kleinerem β oder weitem Sichtfeld werden sie deutlich
länger.

**Im Browser geprüft:**
- Mit t_b = 0 stimmt das Bild mit dem normalen Standbild bis auf Rundung
  überein: höchstens 1/255 in 0,01 % der Pixel.
- Schwerpunkt der Streifen von 20 isolierten hellen Sternen gegen die
  Vorhersage aus `physics.js`: im Median 0,73 px Abweichung.

**Tests** (`tests/motionblur.test.js`):
- `a = c·artanh(Δv/c)/Δt`, und `tanh(aτ/c)` ist dieselbe Bewegung wie β(t) in S.
- Die Belichtung endet beim aktuellen β, davor nie unter 0.
- Die Strecke in S stimmt mit `∫ β·γ·c dτ` überein (numerisch).
- `t_b = 0` ergibt genau ein Teilbild mit aktuellem β und ohne Versatz, also
  das normale Standbild. Die Gewichte ergeben zusammen 1.
- β = 0 und β konstant ergeben Punkte.
- β = 0,99, Δβ = 0,002: Ein Stern bei ψ' = 10° wandert 1,056° zum Fluchtpunkt
  hin, die Näherung `γ²·sin ψ'·Δβ` ergibt 1,000°. Mit der RK4-Lösung von
  `dψ'/dβ = −γ² sin ψ'` stimmt das auf 10⁻⁹ rad überein.
- Für alle 9096 Sterne gilt im letzten Teilbild ψ' < ψ' im ersten.
- Die Streifenlänge wächst mit sin ψ', exakt `ln tan(ψ'/2)` sinkt um `(a/c)·Δτ`.
- Kein Stern wandert je Teilbild mehr als 1 px.
- Das Gesamtlicht bleibt bei 20-mal mehr Teilbildern gleich (1 %).
- Bei β → 0 bleibt das Sternfeld unverändert.
- Beliebige Kurve: `advanceProperTime` bei konstantem β (`τ = t/γ`) und bei
  Hyperbelbewegung; `shutterPlanFromCurve` = `motionBlurSchedule` für die
  Kurve mit konstantem a; Belichtung vor dem Start der Phase und t_b = 0;
  die Δη-Form ergibt dieselbe Teilbildzahl wie die a-Form.

## Simuliertes Objektiv (Kamera-Modell)

*Ergänzt am 12.11.2026.* Alle Bausteine stehen als reine Funktionen in
**`src/optics.js`** (getestet in `tests/optics.test.js`); `render.js` übersetzt
sie nur in Shader-Durchgänge. Jeder Baustein ist einzeln schaltbar, alle
Faltungen erhalten die Lichtmenge (Kerne auf Summe 1 normiert).

**Sterne abbilden:**
- *Bildschirm-Modell* (bisher): Hellere Sterne werden als größere Flecken
  gezeichnet. Gut lesbar, aber keine Kamera.
- *Kamera-Modell:* Jeder Stern ist ein Punkt, sein Licht fällt (bilinear
  verteilt) auf die Pixel um seinen Bildort. Größe und Form entstehen erst
  durch das Objektiv, Sättigung durch die Tonkurve. Verstärkung
  `1 / Spitzenanteil des Objektivs` (`lensPeak`): Ein Stern der Helligkeit
  „Belichtung“ erreicht im hellsten Pixel gerade Weiß.

| Baustein | Formel | Funktion in `optics.js` |
|---|---|---|
| Unschärfe | Gauß-Punktbildfunktion, `FWHM = 2·√(2 ln 2)·σ`; Angabe in px bei 1080 Zeilen, skaliert mit der Bildhöhe | `gaussianKernel`, `gaussianPeak` |
| Streulicht | zweiter, breiter Gauß mit Lichtanteil f (Vorgabe 2 %, FWHM 40 px); gerechnet auf ¼ Auflösung | `lensPeak` |
| Beugung (Airy) | `I/I₀ = (2·J₁(x)/x)²`, `x = π·r/(λ·N)`; erstes Minimum `r = 1,22·λ·N`; je Farbkanal 610/550/465 nm; Pixelabstand = Sensorbreite / Bildbreite (Super 35: 24,89 mm) | `besselJ1`, `airyIntensity`, `airyFirstMinimumPx`, `airyKernel`, `pixelPitch` |
| Randabdunklung | `E(α)/E(0) = cos⁴ α = 1/(1 + tan²α)²` (in der stereografischen Projektion mit dem dort gültigen α) | `vignetteCos4` |
| Tonkurve | linear mit harter Grenze `min(1, x)` oder Film-Schulter `1 − e^(−x)` | `toneCurve` |

Reihenfolge im Renderer: Summe der Teilbilder → Airy → Streulicht → Gauß →
Randabdunklung → Tonkurve → sRGB. Bei f/2,8 und Super 35 ist das
Airy-Scheibchen kleiner als ein Pixel und hat keine sichtbare Wirkung; erst
bei kleiner Blende (z. B. f/22 und mehr) wird es sichtbar. Der Radius des
ersten dunklen Rings steht unter dem Schalter.

**Tests** (`tests/optics.test.js`): Gaußkern normiert mit verlangter
Halbwertsbreite; Spitzenanteil 0,2206 bei FWHM 2 px; J₁ gegen Tabellenwerte
und erste Nullstelle 3,8317; erster Airy-Ring 1,75 %; `r = 1,22·λ·N`;
Airy-Kern normiert und rotationssymmetrisch; cos⁴-Gesetz; Tonkurven.

## Export: Standbild, Showcase-Poster, Video

**Standbild (PNG):** im gewählten Bildformat, mit Objektiv und
Bewegungsunschärfe wie unter „Kamera“ eingestellt, immer mit allen
Teilbildern. Blickrichtung, Projektion und vertikales Sichtfeld bleiben wie in
der Ansicht, das waagrechte Sichtfeld folgt aus dem Seitenverhältnis (bei 60°
vertikal und Perspektive im Filmformat 108°). Punktgrößen und
Objektiv-Halbwertsbreiten werden auf die Bildhöhe skaliert. Das freigestellte
Cockpit (2000 × 839) füllt das Filmformat nahezu ohne Beschnitt.

**Video:** Bild für Bild berechnet (nicht in Echtzeit mitgeschnitten), mit
WebCodecs im Browser kodiert und mit mediabunny in MP4 bzw. WebM verpackt.
Jedes Bild bekommt genau den Zeitstempel k / Bildrate.

| Einstellung | Bedeutung |
|---|---|
| Auflösung | wie Ansicht, 1280 × 720 bis 3840 × 2160, Film 2272 × 951 |
| Bildrate | 24, 25, 30, 48, 50, 60 Bilder/s |
| Ablauf | *Beschleunigungsphase*: Vorlauf (β₀ konstant) + ganze Phase + Nachlauf; *ab jetzt weiterlaufen*: feste Länge ab dem aktuellen Zustand |
| Bordzeit je Videosekunde | Zeitmaßstab (s, min, h, Tage, Jahre); 1 s = Echtzeit an Bord |
| Verschlusswinkel | `t_b = Winkel/360° · 1/Bildrate · Zeitmaßstab` (180° bei 24 Bilder/s = 1/48 s) |
| Bewegungsunschärfe | aus dem Verschluss, wie oben (aus der Beschleunigungsphase) |
| Codec | H.264 (MP4), VP9 (WebM), AV1 (MP4); vorher wird geprüft, ob der Browser ihn in dieser Größe kodieren kann |
| Bitrate, Schlüsselbild | Mbit/s; Abstand der Schlüsselbilder in s |
| Cockpit, Werte | Cockpit-Overlay und Beschriftung in jedes Bild |

Für Bild k wird die Bordzeit `τ_k = k/Bildrate · Zeitmaßstab + t_b` erreicht
(`advanceProperTime`, Zeit in S und Strecke mitgeführt), die Belichtung endet
dort. Nach dem Export wird der vorige Zustand wiederhergestellt. Die Vorgabe
„Filmszene“ stellt 2272 × 951, 24 Bilder/s, Beschleunigungsphase,
Echtzeit an Bord und 180° ein.

**Im Browser geprüft** (Chromium, Software-Rendering): 1280 × 720, 24 Bilder/s,
H.264 und VP9 lesbar (ffprobe: richtige Bildzahl und Bildrate); Phase der
Filmszene (3 s + 0,5 s Nachlauf = 84 Bilder) in knapp 3 Minuten.

## Bedienung: Abschnitte, Speichern, Tastenkürzel, Handy

- **Vorgabe Filmszene:** stellt die untersuchte Szene ein (3D-Flug,
  Beschleunigung von 0 auf 0,99 c in 3 s Bordzeit, Kamera-Modell mit
  Objektiv und Streulicht, Unschärfe 1/48 s, Cockpit, Filmformat). Mit der
  Leertaste oder Play startet die Beschleunigung.
- **Alles zurücksetzen:** löscht die gespeicherten Einstellungen und lädt neu.
- **Speichern:** Alle Einstellungen und welche Abschnitte offen sind, merkt sich
  der Browser (localStorage) und stellt sie beim nächsten Öffnen wieder her
  (nicht der β-Regler).
- **Abschnitte** einklappbar: Bewegung, 3D-Flug, Physikalische Effekte, Kamera,
  Cockpit, Terrell-Körper, Export, Graphen, Debug. Längere Erklärungen stehen
  hinter „ⓘ Erklärung“.
- **Werte im Bild** (Schalter unter „Kamera“): β, γ, Bordzeit, Strecke,
  Beschleunigung und Kamera-Einstellungen oben links in der Ansicht.
- **Zahlen** mit Komma oder Punkt; die Felder öffnen auf dem Handy die Zifferntastatur.
- **Tastenkürzel** (Knopf „?“ oben rechts):

  | Taste | Wirkung |
  |---|---|
  | Leertaste | Flug bzw. Beschleunigung starten/anhalten |
  | 3 | 3D-Modus an/aus |
  | F | Blick nach vorn |
  | L | Objektiv (Gauß) an/aus |
  | B | Bewegungsunschärfe an/aus |
  | H | Werte im Bild an/aus |
  | E | Standbild speichern |
  | V | Video-Einstellungen öffnen |
  | P | Präsentationsmodus |
  | D | Debug-Abschnitt |
  | ? | Hilfe |
  | Esc | Einstellungen (Handy) schließen |

- **Handy und Tablet** (Breite bis 760 px): Die Ansicht füllt den Bildschirm,
  die Einstellungen öffnen als Leiste von unten (Knopf „⚙ Einstellungen“ oder
  ☰ oben links). Größere Bedienflächen bei Touch-Bedienung, live höchstens 8
  Teilbilder.

## Cockpit-Bild

Das Cockpit-Overlay ist ein Standbild aus dem Film (urheberrechtlich
geschützt, Quelle siehe Seminararbeit). Auf Wunsch des Auftraggebers
(04.11.2026) liegt es als `assets/cockpit.png` im Repository und wird mit der
Website ausgeliefert. Vorher stand es in `.gitignore` und musste lokal abgelegt
werden.

`src/overlay.js` importiert die Datei, und Vite legt sie beim Build neben
`dist/index.html` (`build.assetsDir: ''`, damit der eingebettete Code sie
relativ zur Seite findet). Das Container-Image enthält `dist/` und damit auch
das Bild. Eingeblendet wird es mit dem Haken „Cockpit-Overlay“, die Vorgabe
ist aus. Mit „Bild wählen…“ lässt sich ein anderes Bild laden. Lässt sich das
Bild nicht laden, erscheint ein gezeichneter Platzhalter.

**Freigestellt (04.11.2026):** Das Standard-Overlay ist ein PNG mit
Transparenz. Cockpit, Streben, Bögen und die Köpfe sind undurchsichtig, die
Fensterflächen sind durchsichtig. Dort erscheint der simulierte Himmel statt
der Sterne des Films.
Die Vorgabe für die Deckkraft ist deshalb 100 %; vorher waren es 90 %,
damit der Himmel durch ein undurchsichtiges Bild schien.

So wurde freigestellt (überarbeitet):
- **Sterne entfernen, Linien erhalten:** Öffnen mit Linienelementen der Länge
  11 px in 12 Richtungen. Das entfernt runde Sterne, erhält aber dünne Leisten
  an Streben und Bögen.
- **Fensterflächen ausdrücklich festgelegt:** sieben Scheiben innerhalb des
  Rahmens und die beiden Bereiche oben links und oben rechts außerhalb der
  äußeren Bögen. Dunkle Flächen im Fell, in der Wand und in der Maschinerie
  oben links bleiben Cockpit.
- **Grenze im Saum dazwischen:** Watershed-Segmentierung auf dem Kantenbild.
  Sicheres Cockpit ist alles Helle (Streben, Fell, Sitze), sicherer Himmel das
  Innere der Fensterflächen. Die Grenze liegt so auf der stärksten Kante.
- **Fugen** bis 4 px zwischen Leiste und Strebe zählen zum Bauteil.
- **Äußere Leiste der linken oberen Strebe:** Wo sie zu schwach für die
  automatische Erkennung ist, wurde sie aus Querprofilen vermessen (leicht
  gekrümmte Linie) und samt Fuge eingetragen.
- **Deckkraft:** Cockpit, Köpfe und Sitze sind vollständig deckend. Nur an der
  Grenze zum Himmel ist die Kante um etwa einen halben Pixel geglättet.

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
- **Leistung:** Das Bild wird nur neu gezeichnet, wenn sich etwas ändert (Regler,
  Blickrichtung, Flug, Fenstergröße …); in Ruhe arbeitet die Grafikkarte nicht.
  Diagramme werden nur bei neuem β oder Mausbewegung neu gezeichnet, Textanzeigen
  zehnmal pro Sekunde aktualisiert.
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
  render.js         three.js-Szene, Shader, Teilbild-Summe, Objektiv-Durchgänge
  ui.js             Bedienelemente, Reiter, Debug-Panel, Graphen der Simulation
  charts.js         Liniendiagramme auf <canvas>
  overview.js       Reiter „Übersicht“: Diagramme und Tabellen
  overlay.js        Cockpit-Bild, Beschriftung, Standbild-Export
  optics.js         simuliertes Objektiv: Gauß, Airy, cos⁴, Tonkurven (reine Funktionen)
  video.js          Video kodieren (WebCodecs + mediabunny)
  panel.js          Abschnitte, Einstellungen speichern, Tastenkürzel, Handy-Leiste
  showcase.js       Showcase-Poster (4K) mit markierten Sternen und Faktenkarten
  style.css
tests/
  physics.test.js   Vitest
  blackbody.test.js Vitest
  stars3d.test.js   Vitest
  motionblur.test.js Vitest (Bewegungsunschärfe)
  optics.test.js    Vitest (simuliertes Objektiv)
assets/
  cockpit.png       freigestelltes Cockpit-Overlay (Standbild aus dem Film)
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
- Besselfunktion J₁: rationale Näherung nach Press u. a., Numerical Recipes,
  Abschnitt 6.5; Airy-Muster und cos⁴-Gesetz: Standardoptik (z. B. Hecht, Optik).
- Video: mediabunny 1.62.1 (MPL-2.0) für MP4/WebM, Kodierung über die
  WebCodecs-Schnittstelle des Browsers.
- Bewegungsunschärfe: Hyperbelbewegung (Rapidität linear in der Eigenzeit) und
  `dψ'/dβ = −γ² sin ψ'` sind im Code aus den Formeln von Kapitel 3 hergeleitet;
  Literaturstellen mit Seite sind noch zu ergänzen.
