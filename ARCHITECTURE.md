# Architecture

```text
USGS FDSN -> engine-core -> sourced earthquake events --------------+
insurance-lenses -> context and analogs ----------------------------+--> apps/web
overlay-pro -> synthetic portfolio, exposure and accumulation ------+
```

`apps/web` is the only application. It renders keyless OpenStreetMap raster tiles, live source layers and portfolio sites. Portfolio alerting, accumulation, ownership screening and RDS stress results are available in both the anonymous synthetic demo and optional authenticated, account-scoped workspaces. Billing, paywalls and entitlements are absent.

All packages are MIT-licensed. Fetch failures return an empty event array, and successful USGS responses are cached for five minutes.

The public synthetic workspace remains anonymous. Optional Postgres-backed accounts add insurer, broker, reinsurer and administrator roles with signed HttpOnly sessions. Portfolio books, alert preferences/state, scenarios, feed snapshots and an application audit log are account scoped. There is no billing, paywall or entitlement layer.

Additional feeds use `engine-core/src/live-layers.ts` and `restricted-layers.ts`: a source parser produces the shared sourced `SituationEvent` with optional point/line/polygon geometry. The original USGS adapter remains independently loaded in the browser. `apps/web/feed-server.ts` loads all other feeds through a fixed catalogue, with per-feed errors, deduplicated in-flight requests and in-memory cadence caches. Official sanctions lists additionally use a 24-hour local disk cache. No live path substitutes fixtures.

The map consumes these same events using GeoJSON circle, line and fill layers. Fill layers stay below lines/points regardless of fetch completion order. Results from disabled checkboxes are hidden and not refreshed. Country indicators never enter earthquake portfolio exposure calculations. The sanctions panel screens only explicitly enabled, successfully loaded lists; no-match wording disclaims clearance. Raw API keys remain server-side and are excluded from source links and response metadata.

`apps/web/layer-service.ts` is the runtime-neutral server service shared by Vite middleware and Vercel functions. `/api/layers` exposes metadata, `/api/layers/:id` returns a bounded public result, and `/api/screen` performs sanctions matching without exporting entire official lists to the browser. Vercel uses ephemeral `/tmp` plus warm-process memory; local preview uses `data/cache/live-layers`.

`apps/web/platform-store.ts` is the persistence boundary. Neon/Postgres is selected by `DATABASE_URL`; a deliberately non-persistent memory implementation preserves the zero-configuration public demo. `apps/web/platform-api.ts` implements sessions, portfolio import, preferences, alert state, saved scenarios and admin audit actions. Passwords use server-side scrypt with random salts.

```text
Vercel cron -> independent adapters -> retry/backoff -> Postgres last-known-good snapshots
                                               +-----> structured logs and health API
user CSV -> server validation -> account portfolio -> exposure-weighted alert workflow
                                                     +-> CSV/PDF/JSON exports
```

Alert computation consumes source-supplied point, line and polygon geometry, never emits an alert without covered exposure, and ranks by `event severity × touched sum insured`. Proximity is a labelled triage heuristic, not a hazard or loss footprint.
