/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * render.js — three.js-Szene und Shader.
 *
 * Hier steht KEINE eigene Physik. Die Shader-Funktionen sind wörtliche
 * Übersetzungen der Funktionen aus src/physics.js (dort kommentiert und
 * getestet); über jeder Funktion steht, welche es ist.
 *
 * Koordinaten: Das Raumschiff fliegt in +z. Die Achsen sind rechtshändig mit
 * y nach oben und x nach LINKS (wenn man nach vorn schaut). Die Blickrichtung
 * der Kamera (Umschauen mit der Maus) steckt in der Matrix uView.
 *
 * Ablauf pro Bild:
 *   1. Szene (Sterne, später Körper) linear in ein Gleitkomma-Bild rendern,
 *      damit sich Licht überlappender Sterne physikalisch richtig addiert.
 *   2. Dieses Bild einmal nach sRGB umrechnen und auf den Bildschirm bringen.
 */
import * as THREE from 'three';
import { buildBlackbodyTable, visibleLuminance, TABLE_SIZE, TABLE_T_MIN, TABLE_T_MAX } from './blackbody.js';

/* ------------------------------------------------------------------------- */
/* Gemeinsamer Shader-Code                                                   */
/* ------------------------------------------------------------------------- */

/**
 * GLSL-Übersetzung der Aberration aus physics.js.
 * Der Shader rechnet für jeden Stern einzeln — deshalb entsteht die
 * Verdichtung zur Flugrichtung (n'/n = D^(−2)) von selbst. Es gibt bewusst
 * KEINEN zusätzlichen Dichtefaktor (das wäre Doppelzählung).
 */
export const GLSL_PHYSICS = /* glsl */ `
uniform float uBeta;    // β = v/c
uniform float uGamma;   // γ = 1/√(1−β²), in JavaScript mit physics.lorentzGamma() berechnet

// physics.dopplerFactor(β, cos ψ):
//   D = λ'/λ = 1 / (γ·(1 + β·cos ψ))      (Konvention Kapitel 3: nach vorn D < 1)
float dopplerFactor(float cosPsi) {
  return 1.0 / (uGamma * (1.0 + uBeta * cosPsi));
}

// physics.aberrateDirection(β, n):
//   cos ψ' = (cos ψ + β) / (1 + β·cos ψ),   φ' = φ
//   (Dragon 2006, S. 42, Gl. (3.24); Weiskopf u. a. 1999, S. 280, Gl. (4), (5))
//   Querkomponenten: n'_x = D·n_x, n'_y = D·n_y, weil sin ψ' = D·sin ψ.
//   n ist der Einheitsvektor vom Beobachter zum Stern in S, n.z = cos ψ.
vec3 aberrateDirection(vec3 n) {
  float D = dopplerFactor(n.z);
  return vec3(D * n.xy, (n.z + uBeta) / (1.0 + uBeta * n.z));
}

// physics.apparentTemperature(T, D):
//   T' = T / D     (Wiensches Verschiebungsgesetz; nach vorn D < 1, also T' > T)
float apparentTemperature(float T, float D) {
  return T / D;
}

// physics.beamingPointSource(D):
//   F'/F = D^(−2)   für PUNKTFÖRMIGE Quellen (Sterne)
//   (Weiskopf u. a. 1999, S. 283, Gl. (14), (15); Kraus 2000, S. 56)
float beamingPointSource(float D) {
  return 1.0 / (D * D);
}

// physics.beamingExtended(D):
//   L'/L = D^(−4)   nur für AUSGEDEHNTE Flächen (Würfel, Kugel), nie für Sterne
float beamingExtended(float D) {
  float D2 = D * D;
  return 1.0 / (D2 * D2);
}
`;

/**
 * Zugriff auf die Schwarzkörper-Tabelle aus blackbody.js (als Textur).
 * RGB: Farbton (größter Kanal = 1, linear), A: log10 Y(T) − log10 Y(5800 K).
 */
export const GLSL_BLACKBODY = /* glsl */ `
uniform sampler2D uBlackbody;
uniform float uLogTMin;   // log10 der kleinsten Tabellentemperatur
uniform float uLogTMax;   // log10 der größten Tabellentemperatur
uniform float uTableSize;
const float INV_LN10 = 0.43429448190325176;

vec4 blackbodyLookup(float T) {
  float u = clamp((log(T) * INV_LN10 - uLogTMin) / (uLogTMax - uLogTMin), 0.0, 1.0);
  return texture(uBlackbody, vec2((u * (uTableSize - 1.0) + 0.5) / uTableSize, 0.5));
}

// log10 der sichtbaren Helligkeit Y(T) (bis auf eine Konstante).
// Oberhalb der Tabelle gilt Rayleigh-Jeans: B_λ ∝ T, also Y ∝ T.
float log10VisibleLuminance(float T) {
  float logT = log(T) * INV_LN10;
  return blackbodyLookup(T).a + max(logT - uLogTMax, 0.0);
}

// physics.visibleSpectralFactor(T, T', Y(T), Y(T')):
//   Y(T')/Y(T) · (T/T')⁴  — Änderung des Anteils der Strahlung im Sichtbaren.
//   Zusammen mit D^(−2) ergibt das die sichtbare Helligkeit D²·Y(T')/Y(T).
float visibleSpectralFactor(float T, float Tprime) {
  float logRatio = log10VisibleLuminance(Tprime) - log10VisibleLuminance(T)
                 + 4.0 * (log(T / Tprime) * INV_LN10);
  return pow(10.0, logRatio);
}

// physics.wienPeakWavelengthNm(T): λ_max = b/T, b = 2,897771955·10⁻³ m·K
float wienPeakWavelengthNm(float T) {
  return 2.897771955e6 / T;
}
`;

/**
 * Projektion einer Blickrichtung (im Raumschiffsystem) auf den Bildschirm.
 * Das ist reine Geometrie der Darstellung, keine Relativitätstheorie.
 *
 *   uProjection = 0: Zentralprojektion (Perspektive, wie eine Kamera).
 *                    Verzerrt Kreise am Bildrand zu Ellipsen — schon bei β = 0.
 *   uProjection = 1: stereografische Projektion. Winkeltreu, bildet jeden
 *                    Kreis der Himmelskugel wieder als Kreis ab. Damit ist der
 *                    Selbsttest "Kugel bleibt kreisrund" direkt am Bildschirm
 *                    prüfbar.
 */
export const GLSL_PROJECTION = /* glsl */ `
uniform mat3 uView;         // Raumschiffsystem → Kamerakoordinaten (Kamera blickt in −z)
uniform int uProjection;    // 0 = Perspektive, 1 = stereografisch
uniform float uFocal;       // Perspektive: 1 / tan(FOV/2)
uniform float uStereoScale; // stereografisch: 1 / (2·tan(FOV/4))
uniform float uAspect;      // Breite / Höhe

const float NEAR = 0.01;
const float FAR = 1.0e7;

// Tiefe logarithmisch, damit nahe Körper und ferne Sterne gut aufgelöst sind.
float depthNdc(float dist) {
  return 2.0 * log(dist / NEAR) / log(FAR / NEAR) - 1.0;
}

// dir: Einheitsvektor der gesehenen Richtung, dist: Entfernung (nur für die Tiefe)
vec4 projectDirection(vec3 dir, float dist) {
  vec3 c = uView * dir;
  float z = depthNdc(dist);
  if (uProjection == 0) {
    // Zentralprojektion: Bildpunkt = (x, y) / (−z) · f
    float w = -c.z * dist;
    return vec4(c.x * dist * uFocal / uAspect, c.y * dist * uFocal, z * w, w);
  }
  // Stereografische Projektion vom Gegenpunkt der Blickachse aus:
  // Radius auf dem Bild = 2·tan(α/2), α = Winkel zur Blickachse.
  float k = 2.0 * uStereoScale / max(1.0 - c.z, 1.0e-6);
  return vec4(c.x * k / uAspect, c.y * k, z, 1.0);
}
`;

/* ------------------------------------------------------------------------- */
/* Sterne                                                                    */
/* ------------------------------------------------------------------------- */

/** Entfernung, unter der Sterne in den Tiefenpuffer geschrieben werden ("unendlich weit"). */
const STAR_DISTANCE = 1.0e6;

const STAR_VERTEX = /* glsl */ `
${GLSL_PHYSICS}
${GLSL_BLACKBODY}
${GLSL_PROJECTION}
uniform bool uAberration;
uniform bool uDoppler;
uniform bool uBeaming;
uniform bool uVisibleOnly; // Helligkeit nur aus dem sichtbaren Spektralanteil
uniform bool uMarkBands;   // Sterne mit Strahlungsmaximum in UV/IR kennzeichnen
uniform float uExposure;   // Belichtung: Faktor, mit dem F multipliziert wird (Darstellung)
uniform float uBaseSize;   // Punktgröße eines gerade sichtbaren Sterns in Pixeln
uniform float uMaxSize;    // größte Punktgröße in Pixeln (Bildschirm ist nicht beliebig hell)
uniform float uMarkSize;   // Größe der UV/IR-Markierung in Pixeln
uniform float uPixelRatio;

in float aFlux;            // Grundhelligkeit F relativ zu 0 mag (stars.js)
in float aTemperature;     // Temperatur T des Sterns in S (stars.js)
out vec3 vColor;
out float vIntensity;
out float vCoreFraction;   // Anteil des Lichtflecks an der Punktgröße
out float vMark;           // 0 = keine Markierung, 1 = UV (Ring), 2 = IR (Quadrat)
out float vSpritePx;

void main() {
  vec3 n = normalize(position);                 // Richtung zum Stern in S
  vec3 nSeen = uAberration ? aberrateDirection(n) : n;
  gl_Position = projectDirection(nSeen, ${STAR_DISTANCE.toFixed(1)});

  // D gehört zur tatsächlichen Richtung n in S (cos ψ = n.z), unabhängig davon,
  // ob die Aberration gerade angezeigt wird.
  float D = dopplerFactor(n.z);

  // Farbe: Schwarzkörper bei der scheinbaren Temperatur T' = T/D (Doppler an)
  float T = aTemperature;
  float Tseen = uDoppler ? apparentTemperature(T, D) : T;
  vColor = blackbodyLookup(Tseen).rgb;

  // Helligkeit: Sterne sind Punkte → D^(−2), nicht D^(−4)!
  float flux = aFlux;
  if (uBeaming) flux *= beamingPointSource(D);
  if (uVisibleOnly) flux *= visibleSpectralFactor(T, Tseen);

  // Darstellung eines Punktes (keine Physik): Die Bildschirmhelligkeit ist
  // "Fläche × Leuchtdichte" des Lichtflecks. Bis Intensität 1 wird nur die
  // Leuchtdichte erhöht, darüber wächst die Fläche proportional zu F, bis
  // uMaxSize erreicht ist. Die Division durch die Leuchtdichte des Farbtons
  // sorgt dafür, dass Sterne gleicher Bestrahlungsstärke gleich hell wirken,
  // egal welche Farbe sie haben.
  float colorLuminance = max(dot(vColor, vec3(0.2126, 0.7152, 0.0722)), 1.0e-3);
  float e = flux * uExposure / colorLuminance;
  float core = min(uBaseSize * sqrt(max(e, 1.0)), uMaxSize);
  vIntensity = min(e, 1.0);

  // Kennzeichnung: Strahlungsmaximum λ_max = b/T' außerhalb 380–780 nm
  // (nur bei Sternen, die überhaupt sichtbar sind)
  vMark = 0.0;
  float lambdaMax = wienPeakWavelengthNm(Tseen);
  if (uMarkBands && e >= 1.0) {
    if (lambdaMax < 380.0) vMark = 1.0;
    else if (lambdaMax > 780.0) vMark = 2.0;
  }
  float sprite = vMark > 0.0 ? max(core, uMarkSize) : core;
  vCoreFraction = core / sprite;
  vSpritePx = sprite * uPixelRatio;
  gl_PointSize = vSpritePx;
}
`;

const STAR_FRAGMENT = /* glsl */ `
precision highp float;
in vec3 vColor;
in float vIntensity;
in float vCoreFraction;
in float vMark;
in float vSpritePx;
out vec4 fragColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;   // −1 … 1 über den ganzen Punkt
  vec3 col = vec3(0.0);

  // runder Lichtfleck mit gaußförmigem Abfall (Beugungsscheibchen einer Kamera)
  vec2 q = p / vCoreFraction;
  float r2 = dot(q, q);
  if (r2 < 1.0) col += vColor * vIntensity * exp(-4.0 * r2);

  // UV: Ring, IR: Quadrat — dünne Umrisslinie in der Farbe des Sterns
  if (vMark > 0.5) {
    float px = 2.0 / vSpritePx;           // ein Pixel in Einheiten von p
    float edge = 1.0 - 1.5 * px;
    float d = vMark < 1.5 ? abs(length(p) - edge) : abs(max(abs(p.x), abs(p.y)) - edge);
    col += vColor * 0.45 * (1.0 - smoothstep(0.5 * px, 1.2 * px, d));
  }
  if (max(col.r, max(col.g, col.b)) < 1.0e-3) discard;
  fragColor = vec4(col, 1.0);
}
`;

function createStarPoints(stars, sharedUniforms) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(stars.directions, 3));
  geometry.setAttribute('aFlux', new THREE.BufferAttribute(stars.fluxes, 1));
  geometry.setAttribute('aTemperature', new THREE.BufferAttribute(stars.temperatures, 1));
  // Richtungen können nach der Aberration überall liegen → nie wegschneiden
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: sharedUniforms,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/* ------------------------------------------------------------------------- */
/* Ausgabe: linear → sRGB                                                    */
/* ------------------------------------------------------------------------- */

const OUTPUT_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const OUTPUT_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uImage;
in vec2 vUv;
out vec4 fragColor;
// sRGB-Kennlinie (IEC 61966-2-1)
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  fragColor = vec4(linearToSrgb(texture(uImage, vUv).rgb), 1.0);
}
`;

/**
 * Schwarzkörper-Tabelle aus blackbody.js als 1D-Textur (1024 × 1 Texel).
 * Halbgenaue Gleitkommazahlen sind in WebGL 2 immer linear filterbar. Damit
 * die Genauigkeit reicht, wird log10 Y relativ zu Y(5800 K) gespeichert.
 */
function createBlackbodyTexture() {
  const table = buildBlackbodyTable(TABLE_SIZE);
  const logYRef = Math.log10(visibleLuminance(5800));
  const half = new Uint16Array(table.length);
  for (let i = 0; i < table.length; i++) {
    const v = i % 4 === 3 ? table[i] - logYRef : table[i];
    half[i] = THREE.DataUtils.toHalfFloat(v);
  }
  const tex = new THREE.DataTexture(half, TABLE_SIZE, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace; // Werte sind bereits linear
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------------- */
/* Öffentliche Schnittstelle                                                 */
/* ------------------------------------------------------------------------- */

/**
 * Blickrichtung (Gieren/Nicken) → Matrix Raumschiffsystem → Kamerakoordinaten.
 * yaw > 0: nach rechts schauen, pitch > 0: nach oben schauen (Bogenmaß).
 */
export function viewMatrix(yaw, pitch) {
  // Blickrichtung f im Raumschiffsystem (x links, y oben, z vorn)
  const f = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(f, worldUp);
  if (right.lengthSq() < 1e-12) right.set(-1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, f).normalize();
  // Zeilen: rechts, oben, −vorn (Kamera blickt in −z)
  return new THREE.Matrix3().set(
    right.x, right.y, right.z,
    up.x, up.y, up.z,
    -f.x, -f.y, -f.z,
  );
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const uniforms = {
    uBeta: { value: 0 },
    uGamma: { value: 1 },
    uView: { value: viewMatrix(0, 0) },
    uProjection: { value: 0 },
    uFocal: { value: 1 },
    uStereoScale: { value: 1 },
    uAspect: { value: 1 },
    uAberration: { value: true },
    uDoppler: { value: true },
    uBeaming: { value: true },
    uVisibleOnly: { value: false },
    uMarkBands: { value: false },
    uExposure: { value: 1 },
    uBaseSize: { value: 2.0 },
    uMaxSize: { value: 24.0 },
    uMarkSize: { value: 11.0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uBlackbody: { value: createBlackbodyTexture() },
    uLogTMin: { value: Math.log10(TABLE_T_MIN) },
    uLogTMax: { value: Math.log10(TABLE_T_MAX) },
    uTableSize: { value: TABLE_SIZE },
  };

  const scene = new THREE.Scene();
  const camera = new THREE.Camera(); // Projektion macht der Shader selbst
  let starPoints = null;

  // linearer Zwischenpuffer (Halbgenauigkeit reicht und ist überall filterbar)
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  const outputScene = new THREE.Scene();
  const outputMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: OUTPUT_VERTEX,
    fragmentShader: OUTPUT_FRAGMENT,
    uniforms: { uImage: { value: target.texture } },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outputMaterial);
  quad.frustumCulled = false;
  outputScene.add(quad);

  function setStars(stars) {
    if (starPoints) {
      scene.remove(starPoints);
      starPoints.geometry.dispose();
      starPoints.material.dispose();
    }
    starPoints = createStarPoints(stars, uniforms);
    scene.add(starPoints);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    target.setSize(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
    uniforms.uAspect.value = w / Math.max(1, h);
    uniforms.uPixelRatio.value = pr;
  }

  /**
   * @param {object} s  Zustand: beta, gamma, aberration, doppler, beaming, visibleOnly, markBands,
   *                    projection ('perspective'|'stereographic'),
   *                    fovDeg (vertikales Sichtfeld), exposure, yaw, pitch
   */
  function render(s) {
    uniforms.uBeta.value = s.beta;
    uniforms.uGamma.value = s.gamma;
    uniforms.uAberration.value = s.aberration;
    uniforms.uDoppler.value = s.doppler;
    uniforms.uBeaming.value = s.beaming;
    uniforms.uVisibleOnly.value = s.visibleOnly;
    uniforms.uMarkBands.value = s.markBands;
    uniforms.uProjection.value = s.projection === 'stereographic' ? 1 : 0;
    const halfFov = (s.fovDeg * Math.PI) / 360;
    uniforms.uFocal.value = 1 / Math.tan(halfFov);
    uniforms.uStereoScale.value = 1 / (2 * Math.tan(halfFov / 2));
    uniforms.uExposure.value = s.exposure;
    uniforms.uView.value = viewMatrix(s.yaw, s.pitch);

    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(outputScene, camera);
  }

  return { renderer, setStars, resize, render };
}
