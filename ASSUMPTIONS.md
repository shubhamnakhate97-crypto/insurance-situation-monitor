# Assumptions

1. This v1 is a situational-awareness demo, not a system of record or decision engine.
2. Deterministic fixtures are the default so first-run, tests, and demos require no network or API keys.
3. A separate proprietary `web-pro` shell is the clearest demonstration of the entitlement boundary.
4. SQLite-compatible storage is represented by repository interfaces in v1; the demo uses browser/local process storage and can move to Postgres without changing public contracts.
5. Population/asset density is a sourced proxy and never presented as insured loss.
6. CRESTA examples are illustrative country/zone references; licensed official boundary files are not redistributed. `TODO(me): license authoritative CRESTA data for production.`
7. Return periods are contextual fixture estimates with method provenance, not probabilistic catastrophe-model outputs.
8. Region-watch email delivery is represented by an outbox adapter in demo mode. `TODO(me): select transactional email vendor and sender domain.`
9. Authentication uses demo credentials locally. `TODO(me): select production identity provider and configure MFA/session policy.`
10. Stripe uses a test-mode adapter and fails closed when keys are absent. `TODO(me): provide test keys, price ID, webhook secret, tax and cancellation policy.`
11. Sanctions matching is screening support; legal/placeability determinations remain human decisions.
12. Majority ownership propagation uses a >=50% threshold for the demo. `TODO(me): have counsel approve applicable aggregation rules by regime.`
13. Nominatim is development-only, rate-limited and cached. Production must select a commercial geocoder. `TODO(me)`.
14. Open-Meteo is disabled for live commercial operation unless a commercial-plan flag is explicitly enabled. `TODO(me): purchase/confirm plan.`
15. Synthetic portfolios and identities are fictional and intentionally labelled.
