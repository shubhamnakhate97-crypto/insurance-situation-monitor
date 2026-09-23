# Insurance Situation Monitor

A single MIT-licensed situational-awareness app for P&C/non-life catastrophe and specialty practitioners. Live feed adapters power independently switchable map layers, alongside a synthetic portfolio, earthquake exposure screens, accumulation, live sanctions name screening, and illustrative scenario stress testing.

> All outputs are indicators for investigation, not underwriting, pricing, or reserving decisions.

## Run the app

Requirements: Node.js 22+ (24 recommended) and pnpm 10+.

```bash
pnpm install
pnpm --filter web dev
```

Open http://localhost:3000. No login, subscription, entitlement, billing configuration, Mapbox token, or API key is required. The map uses keyless OpenStreetMap raster tiles and loads magnitude 2.5+ earthquakes from the last 30 days through the USGS FDSN API.

## Verify

```bash
pnpm verify
```

There is an offline parse test for every new adapter, plus cache, failure isolation, missing-key and existing portfolio safety tests. Fixtures are test inputs only, never map fallback data.

## Layers and controls

Natural perils and synthetic sites start on. Expand the grouped panel to enable GDELT, World Bank country shading, the three sanctions lists, or city air quality. Click **Investigation desk** for portfolio context and local sanctions name screening. Each loaded feed shows its original fetch timestamp, source link, and mapped-feature / record counts. An unavailable feed returns no events and does not blank other layers. Switches control both map visibility and periodic refresh; enabled feeds refresh against a server cache every minute.

GDACS uses its official RSS because the MAP API returned HTTP 400. NHC includes current positions and forecast centrelines, not wind footprints. NWS only covers the US and plots only source-supplied polygons. Significant USGS events overlap ordinary earthquakes and are **not active tsunami warnings**. World Bank shading uses the current `GOV_WGI_PV.EST` annual indicator (the former `PV.EST` query was archived), joined to Natural Earth countries; missing values are not assigned a risk score.

OFAC/EU/UN are screening records, not peril events. Their supplied simple-list formats have no explicit coordinates, so zero map markers is expected. Lists are cached in `data/cache/live-layers` for 24 hours; aliases/program evidence are retained. Incomplete coverage is visible, and no-match is never represented as compliance clearance. This is name-screening support, not legal advice or comprehensive ownership screening.

## Optional keys and terms

Copy `.env.example` to `.env` at the repository root, supply only the sources you want, and restart. No keys are needed for the default map.

| Source | Configuration | Behaviour without configuration |
|---|---|---|
| NASA FIRMS | `VITE_FIRMS_MAP_KEY` | Disabled with explanation |
| OpenSky | `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `OPENSKY_LICENSE_ACCEPTED=true` | Disabled |
| AISstream | `AISSTREAM_API_KEY`, `AISSTREAM_LICENSE_ACCEPTED=true` | Disabled |

Despite the requested `VITE_` name, FIRMS credentials are **server-only**: Vite exposes only `PUBLIC_` variables. Never place transport credentials in a `PUBLIC_` variable. OpenSky/AIS are off by default; TODO(me): verify licensed/non-commercial terms before enabling, and obtain appropriate rights before commercial use. Open-Meteo's free API is non-commercial: its default-off city sampling is intended only for this internal demo. TODO(me): use the contracted endpoint/plan before commercial operation. No credentialed live success is claimed without real keys.

## Feed service and deployment

The app's Vite middleware is a fixed-catalogue same-origin feed service, not an arbitrary URL proxy. It avoids source CORS limitations and keeps keys out of the browser. Build/preview with `pnpm --filter web build` then `pnpm --filter web preview`; preview includes this middleware. Static-only hosting of `dist` will **not** serve additional feeds. The Docker configuration retains the service and persists the sanctions cache. Vite preview is for this internal demo, not a hardened public production server; TODO(me): move the same handler into a production Node service before public deployment.

Vercel deployment is defined by the root `vercel.json` and `api/` serverless functions. Sanctions lists are loaded and matched server-side; only counts and match evidence cross the browser boundary, avoiding oversized list responses. Restricted-source secrets belong in Vercel project environment variables, never `PUBLIC_*`. The serverless `/tmp` cache is opportunistic and may be cold between invocations; official-list fetch failures remain visible and never imply clearance.

## Reproduce the measured live report

Keep the app running, then in a second PowerShell terminal:

```powershell
$env:LIVE_REPORT='1'
pnpm --filter web test
Remove-Item Env:LIVE_REPORT
```

This diagnostic writes `outputs/live-layer-report.json` with exact endpoints, timestamps, actual point/line/polygon counts, and errors. It does not turn a failed feed into a passing availability assertion. GDELT returned HTTP 404 during verification and remains visibly unavailable. Counts change as feeds update. Restricted adapters have offline response tests and missing-key verification, but require your credentials for live end-to-end testing.

## Packages

- `packages/engine-core`: event schema, provenance, resolution, sanctions matching, and live USGS adapter.
- `packages/insurance-lenses`: severity context, historical analogs, and RDS scenarios.
- `packages/overlay-pro`: open portfolio models, exposure weighting, accumulation, ownership screening, and synthetic book generation.
- `apps/web`: the single combined MapLibre application.

Site CSV columns are `name,address,lat,lon,sum_insured,peril_cover`. The included demo uses 150 fictional sites and no real insured data.
