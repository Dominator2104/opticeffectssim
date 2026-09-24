/*
 * Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
 * W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
 *
 * bodies.js — Würfel und Kugel für den Terrell-Penrose-Effekt.
 *
 * Beide Körper RUHEN im Sternsystem S, der Beobachter bewegt sich. Deshalb
 * gibt es keine Laufzeitverzerrung der Körper selbst; sichtbar wird nur die
 * Aberration der Richtungen zu ihren Punkten (im Vertex-Shader, render.js):
 *   1. Richtung vom Beobachter zu jedem Oberflächenpunkt in S,
 *   2. dieselbe Aberrationsformel wie für die Sterne,
 *   3. projizieren.
 * Weil die Aberration winkeltreu ist (Dragon 2006, S. 44), erscheint der Würfel
 * gedreht statt gestaucht und die Kugel bleibt kreisrund (Terrell 1959,
 * S. 1041–1042, Fußnote 5; Boas 1961, S. 283–285).
 *
 * Die Flächen sind fein unterteilt, weil die Aberration gerade Kanten zu
 * Kreisbögen biegt; ein grobes Netz würde das verfälschen.
 *
 * Die Körper sind selbstleuchtende Schwarzkörper mit Schachbrettmuster (damit
 * Form und Drehung erkennbar sind). Die Würfelflächen haben verschiedene
 * Temperaturen, damit man im Kolloquium sagen kann, WELCHE Fläche man sieht.
 */
import * as THREE from 'three';

/** Temperaturen der Würfelflächen in K. Richtungen im Sternsystem S (z = Flugrichtung). */
export const CUBE_FACE_TEMPERATURES = {
  front: 9000, // Normale +z: zeigt in Flugrichtung (bläulich)
  back: 3500, //  Normale −z: zeigt entgegen der Flugrichtung (orange)
  side: 5800, //  Normalen ±x, ±y (sonnenähnlich)
};
/** Temperatur der Kugel und des Würfels, wenn "einheitliche Temperatur" gewählt ist. */
export const BODY_TEMPERATURE = 5800;

/**
 * Würfel mit Kantenlänge size, Mittelpunkt im Ursprung, Kanten parallel zu den
 * Achsen von S. Jede Fläche ist in segments × segments Quadrate unterteilt.
 * Attribute: position, normal, uv (0…1 je Fläche), aTemperature, aFaceTemperature.
 */
export function createCubeGeometry(size = 2, segments = 48) {
  const h = size / 2;
  // [Normale, Achse u, Achse v, Name]; u × v = Normale (Umlaufsinn nach außen)
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0], 'side'],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0], 'side'],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1], 'side'],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1], 'side'],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0], 'front'],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0], 'back'],
  ];
  const pos = [];
  const nrm = [];
  const uvs = [];
  const temps = [];
  const index = [];
  for (const [n, u, v, name] of faces) {
    const base = pos.length / 3;
    const T = CUBE_FACE_TEMPERATURES[name];
    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * 2 - 1;
        const b = (j / segments) * 2 - 1;
        for (let k = 0; k < 3; k++) pos.push(h * (n[k] + a * u[k] + b * v[k]));
        nrm.push(...n);
        uvs.push(i / segments, j / segments);
        temps.push(T);
      }
    }
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const p = base + j * (segments + 1) + i;
        const q = p + segments + 1;
        index.push(p, p + 1, q, p + 1, q + 1, q);
      }
    }
  }
  return buildGeometry(pos, nrm, uvs, temps, index);
}

/**
 * Kugel mit Radius radius, Mittelpunkt im Ursprung, Pole auf der y-Achse.
 * uv: (Länge, Breite) jeweils 0…1.
 */
export function createSphereGeometry(radius = 1, widthSegments = 160, heightSegments = 80) {
  const pos = [];
  const nrm = [];
  const uvs = [];
  const temps = [];
  const index = [];
  for (let j = 0; j <= heightSegments; j++) {
    const v = j / heightSegments;
    const theta = v * Math.PI; // vom Nordpol (+y) aus
    for (let i = 0; i <= widthSegments; i++) {
      const u = i / widthSegments;
      const phi = u * 2 * Math.PI;
      const n = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), -Math.sin(theta) * Math.sin(phi)];
      pos.push(radius * n[0], radius * n[1], radius * n[2]);
      nrm.push(...n);
      uvs.push(u, 1 - v);
      temps.push(BODY_TEMPERATURE);
    }
  }
  for (let j = 0; j < heightSegments; j++) {
    for (let i = 0; i < widthSegments; i++) {
      const p = j * (widthSegments + 1) + i;
      const q = p + widthSegments + 1;
      index.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  return buildGeometry(pos, nrm, uvs, temps, index);
}

function buildGeometry(pos, nrm, uvs, temps, index) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aTemperature', new THREE.Float32BufferAttribute(temps, 1));
  g.setIndex(index);
  // nach der Aberration kann der Körper überall erscheinen → nie wegschneiden
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  return g;
}

/**
 * Mittelpunkt eines Körpers in S relativ zum Beobachter.
 * psi: Blickwinkel gegen die Flugrichtung in S, phi: Azimut (0 = links, π = rechts),
 * distance: Entfernung, observerZ: Position des Beobachters auf der z-Achse.
 */
export function bodyCenter(psi, phi, distance, observerZ) {
  return [
    distance * Math.sin(psi) * Math.cos(phi),
    distance * Math.sin(psi) * Math.sin(phi),
    distance * Math.cos(psi) - observerZ,
  ];
}
