# Data-source catalogue

## Active map implementation (supersedes the legacy scaffold table below)

All map feeds are live-only, with independent failures and no fixture fallback. Exact URLs and measured results are in `outputs/live-layer-report.json`.

| Layer | Cache | Default | Verified result / limits |
|---|---:|---|---|
| USGS FDSN | 5 min | On | Real magnitude 2.5+ events, last 30 days |
| GDACS RSS | 5 min | On | Real geolocated multi-hazard reports; public-service attribution retained |
| NOAA NHC | 5 min | On | Current positions + forecast tracks; Atlantic/Eastern/Central Pacific |
| GDELT GEO 2.0 | 5 min | Off | Requested 72h mentions; endpoint returned 404, no invented results |
| OFAC SDN / EU / UN | 24h memory + disk | Off, user enables | Live official lists; no explicit coordinates in supplied formats; screening only |
| Smithsonian / USGS GVP | 60 min | On | Weekly volcano locations and report links; not comprehensive or real-time |
| Open-Meteo / CAMS | 60 min | Off | 10 modelled city samples; free API non-commercial only; TODO(me) before commercial use |
| NOAA NWS | 5 min | On | US-only alerts; only source-supplied polygons plotted |
| USGS significant events | 5 min | On | Overlapping significant-earthquake subset; not a tsunami warning service |
| World Bank WGI / Natural Earth | 24h | Off | Annual GOV_WGI_PV.EST joined to coarse public-domain country boundaries; source attribution retained |
| Portfolio | Local deterministic seed | On | 150 explicitly fictional insured sites |
| NASA FIRMS | 5 min | Off, key required | Parser and missing-key path tested; no credentialed live verification |
| OpenSky | 1 min | Off, credentials + terms flag | Parser tested; non-commercial/licensed terms require review |
| AISstream | 1 min, 12s collection window | Off, key + terms flag | Parser tested; non-commercial/licensed terms require review; bounded snapshot, not global completeness |
| OSM raster tiles | Browser HTTP caching | On | Keyless; OSM attribution shown, provider usage policy applies |

## Legacy catalogue — planned/scaffold sources, NOT a claim of implemented live layers

The following original catalogue describes earlier adapter scaffolding. Only the map implementations above are currently wired into the app. “Fixture-first” entries below must not be interpreted as real live feeds.

| Source | Purpose | Cadence | Commercial posture | Default |
|---|---|---:|---|---|
| USGS FDSN | Earthquakes | 5 min | US government/open | On (fixture-first) |
| GDACS | Multi-hazard alerts | 15 min | Public service; verify terms | On (fixture-first) |
| NOAA IBTrACS | Cyclone tracks | 6 h | US government/open | On (fixture-first) |
| NASA FIRMS | Active fire | 15 min | Key/terms apply | Off until key |
| Open-Meteo | Weather/air quality | Hourly | Free tier non-commercial | Off live; commercial-plan flag |
| OFAC SLS | Sanctions | Daily | US government | On (fixture-first) |
| EU consolidated | Sanctions | Daily | Official public list | On (fixture-first) |
| UN Security Council | Sanctions | Daily | Official public list | On (fixture-first) |
| GLEIF | LEI/ownership | Daily | Open data/API terms | On (fixture-first) |
| SEC EDGAR | Entities/filings | Daily | US government; User-Agent required | On (fixture-first) |
| India MCA data.gov.in | Entities | Daily | Key required | Off until key |
| GDELT | Conflict/unrest | 15 min | Open | On (fixture-first) |
| NVD | CVEs | Hourly | US government | On (fixture-first) |
| CISA KEV | Exploited vulnerabilities | Daily | US government | On (fixture-first) |
| FIRST EPSS | Exploit probability | Daily | CC BY 4.0 | On (fixture-first) |
| World Bank | Macro | Monthly | CC BY 4.0 | On (fixture-first) |
| OpenStreetMap Nominatim | Dev geocoding | On demand, <=1 req/s | Dev only; usage policy | Dev-only |
| MapLibre demo tiles | Base map | On demand | Verify tile provider capacity | Demo only |
| ACLED | Conflict | Daily | Licensed | Off |
| OpenSanctions | Screening | Daily | Commercial license decision | Off |
| OpenCorporates | Entities | Daily | Commercial license decision | Off |
| aisstream.io | AIS | Live | Non-commercial/terms | Off |
| OpenSky | Aviation | Live | Non-commercial/terms | Off |
| Commercial geocoder | Production geocoding | On demand | Contract required | Off |
