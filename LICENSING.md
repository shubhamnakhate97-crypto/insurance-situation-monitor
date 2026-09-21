# Licensing boundary

The open engine, insurance lenses, and free web application are offered under AGPL-3.0. Network deployment of modified versions carries the AGPL source-offer obligations. Each open package includes its own `LICENSE` file and SPDX metadata.

`packages/overlay-pro` and `apps/web-pro` are proprietary. They may consume only the documented public exports of `@insurance/engine-core`; the open applications never import them. The automated boundary check fails if this direction is violated.

No third-party copyleft implementation is copied, forked, or vendored. Dependencies must pass a license review before production. Data rights are separate from software rights: adapters marked non-commercial or licensed are compiled but disabled by default.

Copyright (c) 2026. All rights reserved for proprietary components.
