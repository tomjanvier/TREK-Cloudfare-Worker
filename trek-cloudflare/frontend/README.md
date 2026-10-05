# Frontend

## Client web dédié (`web/`) — celui qui est déployé

React 19 + Vite + Leaflet, écrit **contre l'API du Worker** (`src/routes/*`), sans
dépendance au client d'origine. Sortie statique dans `../public/` (servi par
Workers Static Assets, fallback SPA).

```bash
npm --prefix web install
npm run frontend:build      # -> ../public (wipe + rebuild)
npm run frontend:dev        # dev :5173, proxy /api -> :8787 (wrangler dev)
```

Écrans : connexion/inscription, liste des voyages (création + pagination),
détail d'un voyage (carte, lieux, jours, météo, export GPX/ICS, photos, partage),
page publique `/shared/:token` en lecture seule.

## Pourquoi pas le client d'origine (`../TREK/client`) ?

Il parle **~338 routes** d'API (`admin` ×56, `auth` ×46, `trips` ×45, `addons` ×20,
`journeys`, `notifications`, `settings`, `atlas`…). L'API Workers en expose ~25 :
le faire pointer vers ce Worker donnait des 404 dès le chargement et toute l'app
(paramètres, atlas, voyages) était inutilisable. Le code est conservé comme
référence ; `npm run frontend:build` ne construit plus `client/`.

Deux options si tu veux retrouver l'UI complète plus tard :
1. implémenter les routes manquantes côté Worker (les écrans non couverts restent
   cassés) ;
2. écrire un adaptateur qui répond aux 404 avec des valeurs par défaut — fragile,
   déconseillé.

## Contrat API

Tout est dans `web/src/api.ts` (types + fonctions) : `/api/auth/*`, `/api/trips/*`
(y compris `days`, `places`, `photos`, `photo-shares`, `map-photos`, `share`,
`weather`, `export.gpx`, `calendar.ics`), `/api/places/:id`, `/api/shared/:token`,
`/api/photos/instagram/*`, `/api/photos/wordpress/*`.