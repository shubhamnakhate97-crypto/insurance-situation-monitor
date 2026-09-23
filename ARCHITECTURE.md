# Architecture

```text
USGS FDSN -> engine-core -> sourced earthquake events --------------+
insurance-lenses -> context and analogs ----------------------------+--> apps/web
overlay-pro -> synthetic portfolio, exposure and accumulation ------+
```

`apps/web` is the only application. It renders keyless OpenStreetMap raster tiles, live USGS earthquake circles, and distinct synthetic portfolio-site markers. Portfolio alerting, accumulation, ownership screening, and RDS stress results are shown directly—without authentication, billing, paywalls, or entitlements.

All packages are MIT-licensed. Fetch failures return an empty event array, and successful USGS responses are cached for five minutes.

Additional feeds use `engine-core/src/live-layers.ts` and `restricted-layers.ts`: a source parser produces the shared sourced `SituationEvent` with optional point/line/polygon geometry. The original USGS adapter remains independently loaded in the browser. `apps/web/feed-server.ts` loads all other feeds through a fixed catalogue, with per-feed errors, deduplicated in-flight requests and in-memory cadence caches. Official sanctions lists additionally use a 24-hour local disk cache. No live path substitutes fixtures.

The map consumes these same events using GeoJSON circle, line and fill layers. Fill layers stay below lines/points regardless of fetch completion order. Results from disabled checkboxes are hidden and not refreshed. Country indicators never enter earthquake portfolio exposure calculations. The sanctions panel screens only explicitly enabled, successfully loaded lists; no-match wording disclaims clearance. Raw API keys remain server-side and are excluded from source links and response metadata.

`apps/web/layer-service.ts` is the runtime-neutral server service shared by Vite middleware and Vercel functions. `/api/layers` exposes metadata, `/api/layers/:id` returns a bounded public result, and `/api/screen` performs sanctions matching without exporting entire official lists to the browser. Vercel uses ephemeral `/tmp` plus warm-process memory; local preview uses `data/cache/live-layers`.
