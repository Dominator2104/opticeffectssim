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
${GLSL_PROJECTION}
uniform bool uAberration;
uniform float uExposure;   // Belichtung: Faktor, mit dem F multipliziert wird (Darstellung)
uniform float uBaseSize;   // Punktgröße eines gerade sichtbaren Sterns in Pixeln
uniform float uMaxSize;    // größte Punktgröße in Pixeln (Bildschirm ist nicht beliebig hell)
uniform float uPixelRatio;

in float aFlux;            // Grundhelligkeit F relativ zu 0 mag (stars.js)
out float vIntensity;

void main() {
  vec3 n = normalize(position);                 // Richtung zum Stern in S
  vec3 nSeen = uAberration ? aberrateDirection(n) : n;
  gl_Position = projectDirection(nSeen, ${STAR_DISTANCE.toFixed(1)});

  // Darstellung eines Punktes (keine Physik): Die Bildschirmhelligkeit ist
  // "Fläche × Leuchtdichte" des Lichtflecks. Bis Intensität 1 wird nur die
  // Leuchtdichte erhöht, darüber wächst die Fläche proportional zu F, bis
  // uMaxSize erreicht ist.
  float b = aFlux * uExposure;
  float size = uBaseSize * sqrt(max(b, 1.0));
  vIntensity = min(b, 1.0);
  gl_PointSize = min(size, uMaxSize) * uPixelRatio;
}
`;

const STAR_FRAGMENT = /* glsl */ `
precision highp float;
in float vIntensity;
out vec4 fragColor;
void main() {
  // runder Lichtfleck mit gaußförmigem Abfall (Beugungsscheibchen einer Kamera)
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0 || vIntensity < 0.004) discard;
  float g = exp(-4.0 * r2);
  fragColor = vec4(vec3(vIntensity * g), 1.0);
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
    uExposure: { value: 1 },
    uBaseSize: { value: 2.0 },
    uMaxSize: { value: 24.0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
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
   * @param {object} s  Zustand: beta, gamma, aberration, projection ('perspective'|'stereographic'),
   *                    fovDeg (vertikales Sichtfeld), exposure, yaw, pitch
   */
  function render(s) {
    uniforms.uBeta.value = s.beta;
    uniforms.uGamma.value = s.gamma;
    uniforms.uAberration.value = s.aberration;
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
