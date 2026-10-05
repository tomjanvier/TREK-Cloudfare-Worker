# Frontend — réutiliser le client TREK d'origine sur Cloudflare

Le client (`../TREK/client` : React 19 + Vite + PWA) est **100 % statique en sortie** (`dist/`).
La version Cloudflare le sert via **Workers Static Assets** (`assets.directory = ./public`).

## Option A — build local (simple)

```bash
# 1. Builder le client d'origine
cd ../TREK
npm install
npm run build --workspace=shared
npm run build --workspace=client   # -> TREK/client/dist/

# 2. Copier vers le Worker
rm -rf ../trek-cloudflare/public
cp -r client/dist ../trek-cloudflare/public

# 3. Pointer le client vers l'API Worker
#    client/.env.production :
#    VITE_API_URL=https://trek-cloudflare.<ton-compte>.workers.dev
```

Les routes `/api/*`, `/uploads/*`, `/ws/*` sont proxifiées en dev via `client/vite.config.js`
vers `:3001`. En prod Cloudflare, le même Worker sert l'API **et** le `dist/` (fallback SPA
`not_found_handling: single-page-application`), donc aucun proxy à configurer.

## Option B — Workers Builds (recommandé ensuite)

Connecter le repo GitHub sur dash.cloudflare.com → Workers → trek-cloudflare :
- Build command : `npm run build:client` (à ajouter : build shared+client puis copie dist→public)
- Output : `./public`

## Carte & photos partagées

- La carte d'origine (`MapViewAuto` Leaflet/MapLibre, `JourneyMap`, `CollectionMap`) fonctionne telle quelle :
  tuiles OpenFreeMap sans token, Mapbox en option via `settings.map_provider`.
- Nouveau : `GET /api/trips/:id/map-photos?sources=trip,instagram,wordpress` renvoie un
  **GeoJSON** unifié pour overlay photo sur la carte :
  ```json
  { "type": "FeatureCollection", "features": [
    { "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [2.35, 48.85] },
      "properties": { "source": "instagram", "url": "https://www.instagram.com/p/...", "thumbnail": "...", "caption": "..." } }
  ]}
  ```
  Le front peut l'afficher avec `L.geoJSON` (Leaflet) ou une source `geojson` clusterisée (MapLibre/GL).
- Page publique existante `/shared/:token` : brancher `shareApi.getSharedTrip` sur
  `GET /api/shared/:token` du Worker (même contrat : `{ trip, places, photo_shares }`).
