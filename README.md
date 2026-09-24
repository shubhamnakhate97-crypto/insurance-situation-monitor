# Insurance Situation Monitor

A single MIT-licensed situational-awareness app for P&C/non-life catastrophe and specialty practitioners. Live feed adapters power independently switchable map layers, alongside role-aware workspaces, private portfolio import, cross-peril exposure triage, accumulation, sanctions screening, scenarios and exports.

> All outputs are indicators for investigation, not underwriting, pricing, or reserving decisions.

## Run the app

Requirements: Node.js 22+ (24 recommended) and pnpm 10+.

```bash
pnpm install
pnpm --filter web dev
```

Open http://localhost:3000. The public demo still needs no login, Mapbox token, or API key: it uses keyless OpenStreetMap tiles, live public feeds and a clearly labelled synthetic book. Account creation, private portfolio persistence and saved alert actions activate only when `DATABASE_URL` and `AUTH_SECRET` are configured.

## Production foundation

Configure server-side `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAILS` and `CRON_SECRET`. Optional email delivery uses `RESEND_API_KEY` and `ALERT_FROM_EMAIL`. Tables are created idempotently on first use; sessions are signed, HttpOnly, SameSite cookies. Users cannot self-select the admin role. The public demo remains available when these variables are absent, while account-only operations fail closed.

Insurer, broker and reinsurer users receive account-scoped workspaces; administrators can inspect operational and audit APIs. There is no billing, entitlement or paywall.

## Portfolio workflow and exports

Sign in, open **Investigation desk**, and upload UTF-8 CSV (maximum 5 MB and 10,000 rows):

```text
name,address,lat,lon,sum_insured,peril_cover,country
Mumbai Plant,"1 Main Road, Mumbai",19.08,72.88,25000000,earthquake|cyclone|flood,India
```

Imports are validated server-side for quoting, required fields, coordinate bounds, positive insured values and duplicates. Ranked alerts require touched covered exposure and order signals by severity × declared exposure. Users can acknowledge, dismiss or snooze signals and persist threshold/email preferences. Authenticated CSV/PDF exports are in the desk; `/api/v1/alerts` provides JSON. All outputs retain source evidence and the investigation-only disclaimer.

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
| NASA FIRMS | `FIRMS_MAP_KEY` (legacy `VITE_FIRMS_MAP_KEY` accepted server-side) | Disabled with explanation |
| OpenSky | `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `OPENSKY_LICENSE_ACCEPTED=true` | Disabled |
| AISstream | `AISSTREAM_API_KEY`, `AISSTREAM_LICENSE_ACCEPTED=true` | Disabled |
| GDELT Cloud | `GDELT_API_KEY` | Disabled pending a suitable API/redistribution plan |
| NIST NVD | Optional `NVD_API_KEY` | Keyless low-rate access; key recommended for production |
| RBI / IRDAI / Trends | Confirmed endpoint/provider variables in `.env.example` | Disabled; no portal scraping |

Despite the requested `VITE_` name, FIRMS credentials are **server-only**: Vite exposes only `PUBLIC_` variables. Never place transport credentials in a `PUBLIC_` variable. OpenSky/AIS are off by default; TODO(me): verify licensed/non-commercial terms before enabling, and obtain appropriate rights before commercial use. Open-Meteo's free API is non-commercial: its default-off city sampling is intended only for this internal demo. TODO(me): use the contracted endpoint/plan before commercial operation. No credentialed live success is claimed without real keys.

## Feed service and deployment

The app's Vite middleware is a fixed-catalogue same-origin service for local development; Vercel functions provide production handlers. It avoids source CORS limitations and keeps keys out of the browser. Build/preview with `pnpm --filter web build` then `pnpm --filter web preview`. Static-only hosting of `dist` will **not** serve feeds or account workflows. The Vercel Hobby-compatible daily cron refreshes eligible sources, records last-known-good snapshots and optionally sends portfolio alerts. TODO(me): switch to an hourly Pro cron or external scheduler when faster background refresh is required.

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
