# Architecture

```text
government/open feeds -> engine-core adapters -> normalized sourced Events
                                                |
                         insurance-lenses <-----+
                               |                |
                           web-free         overlay-pro -> web-pro
```

`engine-core` owns public types and deterministic primitives. Adapters implement cache policy, cadence, backoff and fixture mode. `insurance-lenses` adds insurance language without portfolio knowledge. `web-free` depends only on these two open packages.

`overlay-pro` depends only on `engine-core` public exports. It owns portfolio models, exposure intersections, accumulation, ownership-chain screening, client scoping, brief generation and entitlement checks. `web-pro` is the only UI allowed to import it.

Every displayed `Fact<T>` has provenance (`sourceName`, `sourceUrl`, `fetchedAt`). Derived facts retain inputs plus method provenance. Low-confidence geocodes are excluded from scoring. Entity resolution produces ranked candidates; candidates below the configured threshold enter a review queue.

## Deployment

Both apps are stateless React/Vite builds served by a small container. Production adapters can run as scheduled workers on Fly/Render or platform cron. Persist adapter cache and portfolio repositories in Postgres/object storage for multi-instance deployment.
