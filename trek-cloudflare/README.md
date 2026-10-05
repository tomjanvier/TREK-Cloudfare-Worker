# TREK Cloudflare — version Workers

Portage **Cloudflare-native** du self-hosted [TREK](../TREK) (`liketrek/TREK`) :
API **Hono** sur Workers + **D1** (métadonnées), **R2** (photos), **KV** (compteurs,
cache oEmbed), **Durable Objects** (sync temps réel par voyage), front React servi
en **Static Assets**.

Périmètre : trips / days / places / photos / partage public / carte unifiée +
connecteurs **Instagram (embed public)** et **WordPress (REST API)**.
Hors périmètre : plugins (`child_process` interdit en Workers), MCP, parsing IA,
vacay/collections/budget avancés (ajoutables par migrations D1 suivantes).

Cloné depuis : https://github.com/liketrek/TREK — voir `../TREK/`.

## Architecture

```
trek-cloudflare/
  src/index.ts            Composition fine : middlewares, montage routes, /ws, fallback SPA
  src/routes/auth.ts      /api/auth — register/login/me/logout (rate-limit 10/min/IP)
  src/routes/trips.ts     /api/trips — CRUD + jours imbriqués + share + map-photos GeoJSON
  src/routes/members.ts   /api/trips/:id/members — list/invite/retrait (owner)
  src/routes/export.ts    /api/trips/:id/export.gpx + calendar.ics (session ou ?share=)
  src/routes/weather.ts   /api/trips/:id/weather — Open-Meteo sans clé (centroïde + fenêtre jours)
  src/routes/days.ts      /api/days/:dayId — GET/PATCH/DELETE
  src/routes/places.ts    /api/trips/:id/places + /api/places/:placeId
  src/routes/photos.ts    /api/trips/:id/photos — upload R2, fichier (Range/ETag),
                          photo-shares CRUD
  src/routes/share.ts     /api/shared/:token — page publique (edge-cache 60 s)
  src/routes/instagram.ts /api/photos/instagram/preview + épingle (KV 24 h + edge 10 min)
  src/routes/wordpress.ts /api/photos/wordpress/media|posts + import (garde SSRF)
  src/realtime/TripRoom.ts Durable Object hibernation (1 room WebSocket / voyage)
  src/lib/               http, validate (zod), access, ratelimit, cache,
                          notify (waitUntil), idempotency (X-Idempotency-Key via D1),
                          export (builders GPX/ICS purs + URL Open-Meteo)
  src/auth.ts             Sessions JWT HS256 (cookie trek_session + Bearer), PBKDF2
  src/db/client.ts        Helpers D1 + gardes d'accès
  migrations/0001_init.sql Schéma D1 (users, trips, days, places, photos,
  migrations/0002_idempotency.sql  share_tokens, trip_members, photo_shares,
                          idempotency_keys)
  tests/api.test.ts       11 tests vitest (parseurs, curseurs, schemas)
  tests/export.test.ts    5 tests (GPX, ICS, pliage RFC 5545, fenêtre météo)
  scripts/seed.mjs         Seed démo (npm run db:seed:local [--remote])
  frontend/README.md      Brancher le client React d'origine (build -> ./public)
  wrangler.jsonc          Bindings D1/R2/KV/DO/ASSETS + observabilité
  .github/workflows/      CI (typecheck + tests + dry-run) — à la racine Trippy/
```

## Démarrage

```bash
cd trek-cloudflare
npm install
cp .dev.vars.example .dev.vars   # JWT_SECRET (openssl rand -hex 32), WP_SITE_URL...

# D1 + R2 + KV (après `npx wrangler login`)
npx wrangler d1 create trek-db            # reporter database_id dans wrangler.jsonc
npx wrangler r2 bucket create trek-photos
npx wrangler kv namespace create SESSIONS # reporter id dans wrangler.jsonc

npx wrangler d1 migrations apply trek-db --local
npm run db:seed:local                    # compte demo / demo@trek.local (+ SEED_PASSWORD)
npm run dev                              # http://localhost:8787, API + ./public

npx wrangler d1 migrations apply trek-db --remote
npm run deploy
npm run types                            # régénère worker-configuration.d.ts
```

Secrets prod : `npx wrangler secret put JWT_SECRET` (jamais en clair ni dans `wrangler.jsonc`).

## Endpoints

| Méthode | Route | Auth |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | rate-limit 10/min/IP |
| GET | `/api/auth/me` | session |
| GET | `/api/trips?limit&cursor&archived` | session, keyset `updated_at+id`, compteurs lieux/photos |
| POST | `/api/trips` (`days_count` ≤ 60) | session |
| GET/PATCH/DELETE | `/api/trips/:id` (`is_archived` = owner, delete atomique + R2 nettoyé) | membre / owner |
| GET/POST | `/api/trips/:id/members` (invite par id/email/username) | membre / owner |
| DELETE | `/api/trips/:id/members/:userId` (retrait ou départ) | owner ou soi-même |
| GET | `/api/trips/:id/places?search&day_id&category` | membre |
| GET | `/api/trips/:id/export.gpx`, `/api/trips/:id/calendar.ics` | membre ou `?share=` (`share_map`) |
| GET | `/api/trips/:id/weather` (Open-Meteo, edge-cache 1 h via share) | membre ou `?share=` |
| GET/POST | `/api/trips/:id/days` | membre |
| GET/PATCH/DELETE | `/api/days/:dayId` | membre |
| GET/POST | `/api/trips/:id/places` | membre |
| GET/PATCH/DELETE | `/api/places/:placeId` | membre |
| POST | `/api/trips/:id/photos` (multipart `file`) | membre, 60/h/IP |
| GET | `/api/trips/:id/photos` | membre |
| GET | `/api/trips/:id/photos/:photoId/file` (Range/ETag) | membre ou `?share=` |
| DELETE | `/api/trips/:id/photos/:photoId` (R2 nettoyé) | membre |
| GET/DELETE | `/api/trips/:id/photo-shares[/:shareId]` | membre |
| POST/GET/PATCH/DELETE | `/api/trips/:id/share` | owner |
| GET | `/api/shared/:token` | public, edge-cache 60 s |
| GET | `/api/trips/:id/map-photos?sources=upload,instagram,wordpress&share=` | membre ou `?share=`, GeoJSON |
| GET | `/api/photos/instagram/preview?url=` | public rate-limité, KV 24 h |
| POST | `/api/trips/:id/photos/instagram` | membre |
| GET | `/api/photos/wordpress/media|posts` | session |
| POST | `/api/trips/:id/photos/wordpress` | membre |
| WS | `/ws/trip/:id` (`?token=` JWT ou `?share=`) | membre ou share |

Mutations `POST/PATCH/DELETE` rejouables via `X-Idempotency-Key` (réponse rejouée
avec `x-idempotent-replay: true`, 24 h, corps ≤ 8 Ko) — même contrat que la
mutation queue offline-first du client d'origine.

## Partage voyages + photos sur la carte

- **Lien public** : `POST /api/trips/:id/share` (owner) → `GET /api/shared/:token`
  (`{ trip, places, photo_shares }`). Le front d'origine (`SharedTripPage`) s'y branche tel quel.
- **Overlay unifié** : `GET /api/trips/:id/map-photos` → `FeatureCollection`
  (`L.geoJSON` côté Leaflet, source `geojson` + clusters côté MapLibre/GL).
  Composant drop-in : `frontend/components/PhotoShareMap.tsx` (+ README d'intégration
  `SharedTripPage` / `JourneyDetailPageMapView` / `CollectionMapPanel`).
- **Instagram** (embed public, sans login) : preview oEmbed + épingle `{ url, lat, lng }`
  (oEmbed mis en cache : KV 24 h + edge 10 min). Posts privés = `oembed_failed`.
- **WordPress** : `WP_SITE_URL` requis ; timeout 12 s, cap réponse 1,5 Mo, **garde SSRF**
  (média accepté uniquement si même host), basic-auth optionnelle (`WP_USERNAME` +
  `WP_APP_PASSWORD`).
- **Uploads directs** : R2 + ligne `photos` + miroir `photo_shares` (`source='upload'`).

## Sécurité (durcie vs v0.1)

- Fichier photo et `map-photos` : JWT **vérifié** + accès voyage, ou `?share=` valide
  (la v0.1 acceptait n'importe quel cookie / servait les binaires sans auth).
- WS : même contrôle **avant** la connexion au DO (JWT `?token=`/cookie/Bearer ou share).
- CORS allowlist (`APP_URL` + localhost) avec `credentials`, headers `secureHeaders`
  sur `/api/*` (les middlewares ne touchent jamais la 101 du WS).
- Rate-limit KV sur auth, upload et preview Insta (fail-open si KV down).
- Validation **zod** partout (titres, lat/lng, flags de partage, `expires_at` ≤ 1 an…),
  garde `day_id` intra-voyage, `ON CONFLICT DO NOTHING` sur l'idempotence.

## Perf (allers-retours et CPU)

- Détail voyage et page partagée : requêtes D1 parallélisées via **`db.batch()`**.
- `notifyTrip` (broadcast DO) et suppressions R2 : **`waitUntil`**, jamais bloquants.
- Edge-cache : page partagée 60 s, `map-photos?share=` 30 s, preview Insta 10 min
  (+ KV 24 h) ; `x-trek-cache: HIT/MISS`. Jamais d'edge partagé pour les réponses
  cookie (fuite inter-users impossible), `private, max-age` côté navigateur.
- Fichiers R2 : `ETag` + `304`, `Range` 206 pour la vidéo, edge-cache ≤ 5 Mo en public.
- DO **hibernation** (`getWebSockets()` + `webSocketMessage`, validation JSON ≤ 64 Ko),
  plus de `Set` en mémoire perdu à l'éviction.
- `optionalAuth` saute la vérif HMAC sur les routes purement publiques.
- Suppression voyage : batch D1 **atomique** (pas de dépendance aux
  `ON DELETE CASCADE`, inactifs sans pragma FK sur la connexion).
- Liste voyages : compteurs lieux/photos en sous-requêtes (pas de N+1).
- Exports GPX/ICS et météo calculés au edge, requêtes jointes en 1 aller-retour.

## Limites assumées (Workers)

- Pas de `better-sqlite3` / `fs` / `child_process` / `ws` stateful : D1 / R2 / DO.
- Auth simplifiée (pas d'OIDC, passkeys, TOTP — JWT + PBKDF2 100k, max du WebCrypto Workers, login rate-limité).
- Temps réel = broadcast DO sans historique (le client garde sa file Dexie).
- Fichiers ≤ 50 Mo, oEmbed IG best-effort (rate-limit Meta possible).

## Vérifications

```bash
npm run typecheck
npm test
npx wrangler deploy --dry-run
```
