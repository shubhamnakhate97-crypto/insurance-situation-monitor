# Insurance Situation Monitor

An open-core situational-awareness product for P&C/non-life catastrophe and specialty practitioners. The open product is a sourced, insurance-framed monitoring map. The proprietary product adds portfolio overlays, accumulation and exposure-weighted alerts.

> All outputs are indicators for investigation, not underwriting, pricing, or reserving decisions.

## Quick start

Requirements: Node.js 20+ and pnpm 9+.

```bash
pnpm install
pnpm dev
```

- Free app: http://localhost:3000
- Pro app: http://localhost:3001 (demo login: `pro@example.test`, password: `demo-pro`)

Both apps default to deterministic offline fixtures. No paid keys are needed. Run `pnpm verify` for boundary checks, tests and production builds.

## Docker

```bash
docker compose up --build
```

The free and pro apps are then available on ports 3000 and 3001. The pro container is for local demonstration; deploy it only under the proprietary terms.

## Environment

Copy `.env.example` to `.env.local` in the app you are running. Every optional key is documented there. Adapters for non-commercial or licensed data are disabled by default. `OPEN_METEO_COMMERCIAL_PLAN` must be explicitly true before live Open-Meteo calls can be enabled for a commercial deployment.

## Importing a real portfolio

In the pro app, choose **Portfolio import**, download the template, and upload UTF-8 CSV. Site columns are `name,address,lat,lon,sum_insured,peril_cover`. Entity rows use `name,jurisdiction,resolved_id,sum_insured`; vessels/cargo and suppliers have their own templates. Validation is non-destructive and reports rejected rows. Replace synthetic demo data only after legal/security review. `TODO(me): choose production retention, encryption, and data residency policies.`

## Packages

- `packages/engine-core`: public event, provenance, geocoding, resolution, sanctions and adapter interfaces (AGPL-3.0).
- `packages/insurance-lenses`: insurance context, analogs, CRESTA/return-period and RDS scenarios (AGPL-3.0).
- `apps/web-free`: standalone open app; imports only open packages (AGPL-3.0).
- `packages/overlay-pro`: proprietary portfolio and entitlement logic; imports only the public `engine-core` API.
- `apps/web-pro`: proprietary demonstration shell for the pro overlay.

See [ARCHITECTURE.md](ARCHITECTURE.md), [LICENSING.md](LICENSING.md), [DATA_SOURCES.md](DATA_SOURCES.md), and [ASSUMPTIONS.md](ASSUMPTIONS.md).
