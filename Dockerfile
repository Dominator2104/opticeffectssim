# Erstellt mit Claude Code (KI-Werkzeug) im Auftrag von Dominik Wittkow,
# W-Seminar Physik, CSG Ingolstadt, 24.09.2026.
#
# Container-Image der Simulation: statische Auslieferung von dist/ mit nginx
# auf Port 5000 (gedacht hinter einem vorgeschalteten Reverse-Proxy).
#
# Das freigestellte Cockpit-Bild (assets/cockpit.png) ist im Build enthalten
# (Entscheidung des Auftraggebers vom 04.11.2026).

# --- Stufe 1: bauen ----------------------------------------------------------
# Läuft auf der Plattform des Build-Rechners, auch wenn für mehrere
# Architekturen gebaut wird: das Ergebnis (eine HTML-Datei) ist plattformunabhängig.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- Stufe 2: ausliefern -----------------------------------------------------
# nginx ohne root-Rechte (Benutzer 101)
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:5000/healthz || exit 1
