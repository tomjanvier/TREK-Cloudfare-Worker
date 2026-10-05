# PhotoShareMap — overlay photos sur la carte

Composant React drop-in pour le client TREK (`../TREK/client`, dépendances
déjà présentes : `leaflet` + `react-leaflet`).

## Usage

```tsx
import { PhotoShareMap } from "./components/PhotoShareMap";

// Voyage privé (session) :
<PhotoShareMap apiBase={import.meta.env.VITE_API_URL} tripId={42} />

// Page publique /shared/:token (sans compte) :
<PhotoShareMap apiBase={import.meta.env.VITE_API_URL} tripId={42} shareToken={token} />

// Filtrer les sources :
<PhotoShareMap apiBase={...} tripId={42} sources={["instagram", "wordpress"]} />
```

## Contrat API

`GET /api/trips/:id/map-photos?sources=upload,instagram,wordpress&share=<token>`
→ `FeatureCollection` GeoJSON, points `[lng, lat]`, pastille couleur par source
(upload = indigo, instagram = rose, wordpress = bleu WP).

## Intégration suggérée (client d'origine)

- `SharedTripPage` : ajouter l'onglet carte existant + `<PhotoShareMap shareToken>`
  pour les visiteurs sans compte.
- `JourneyDetailPageMapView` / `CollectionMapPanel` : même overlay avec `sources`
  restreint selon le contexte.
