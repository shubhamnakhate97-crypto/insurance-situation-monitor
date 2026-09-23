# Assumptions

1. This v1 is a situational-awareness demo, not a system of record or decision engine.
2. The map now requires Internet for real live feeds and raster tiles, but no API keys for defaults. Fixtures are only offline test inputs; the portfolio and RDS scenarios remain explicitly synthetic.
3. The internal demo is one public MIT-licensed application; there is no free/paid boundary.
4. SQLite-compatible storage is represented by repository interfaces in v1; the demo uses browser/local process storage and can move to Postgres without changing public contracts.
5. Population/asset density is a sourced proxy and never presented as insured loss.
6. CRESTA examples are illustrative country/zone references; licensed official boundary files are not redistributed. `TODO(me): license authoritative CRESTA data for production.`
7. Live popups do not use the existing fixture return-period or CRESTA assertions. They state that recurrence is not estimated, and label the small historical analog library as illustrative.
8. Region-watch email delivery is represented by an outbox adapter in demo mode. `TODO(me): select transactional email vendor and sender domain.`
9. Authentication, entitlements, subscriptions, and billing are intentionally absent from this demo.
11. Sanctions matching is screening support; legal/placeability determinations remain human decisions.
12. Majority ownership propagation uses a >=50% threshold for the demo. `TODO(me): have counsel approve applicable aggregation rules by regime.`
13. Nominatim is development-only, rate-limited and cached. Production must select a commercial geocoder. `TODO(me)`.
14. Open-Meteo city samples are default-off and intended for this internal non-commercial demo only. The free API is not commercially licensed; `TODO(me): confirm rights and configure the contracted endpoint before commercial operation.`
15. Synthetic portfolios and identities are fictional and intentionally labelled.
16. Sanctions list formats currently used do not supply explicit coordinates; country/addresses are not silently geocoded. No location marker is better than a fabricated one.
17. NHC covers Atlantic/Eastern/Central Pacific basins; tracks are forecasts, not observed hazard footprints. NWS covers the US; only supplied geometries are drawn. GDELT mentions are not verified incidents, and its currently failing endpoint remains clearly unavailable.
18. World Bank political stability is annual context, not a live incident feed. Natural Earth boundaries are coarse and illustrative; not authoritative disputed-border determinations.
19. Restricted sources cannot be live-verified without human-supplied keys and terms approval. No keys or licence acceptance are invented. Their parsers are tested offline and missing-key paths fail closed.
20. Vite's same-origin feed middleware supports development and internal-demo preview. Vercel uses equivalent serverless functions; sanctions cache persistence is opportunistic on its ephemeral runtime. Static-only dist hosting is insufficient.
