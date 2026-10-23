# NORTHLINE local EC benchmark

English | [中文](README.zh.md)

NORTHLINE is a vulnerable-only Next.js shopping application for local diagnosis evaluation. It provides twelve products, catalogue search, a persistent browser cart, customer login, profile editing, simulated checkout, order history and administrator views. All people, addresses, orders and payments are synthetic. Docker Compose exposes the target on IPv4 loopback only; direct Node mode also binds loopback.

## Run the target

From the repository root, with Docker Desktop or Docker Engine and Docker Compose available:

```sh
docker compose -f benchmarks/security-labs/northline/compose.yaml up --build -d --wait
```

Open `http://127.0.0.1:18761`. The container runs as a non-root user with a read-only root filesystem, a dedicated data volume and temporary caches. Only a fixed-destination TCP ingress publishes this loopback port. It joins an entrance bridge and the internal laboratory network, forwarding bytes only to NORTHLINE; the target itself joins only the internal network and has no external route. No host directory or Docker socket is mounted. Stop any directly running copy on port 18761 before starting Compose. Stop the container with:

```sh
docker compose -f benchmarks/security-labs/northline/compose.yaml down
```

The build downloads dependencies; runtime uses no external assets, identity service or payment provider. Dependencies and the npm lock belong only to this target; Jabberwock dependencies are unchanged. Next.js is deliberately pinned to 14.2.24 within an [official advisory's affected range](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw), so npm security warnings are expected for this fixture. This target is not a deployment template.

For an optional direct Node.js 22 launch without container isolation:

```sh
npm ci --prefix benchmarks/security-labs/northline/app --ignore-scripts --no-audit --no-fund
npm run build --prefix benchmarks/security-labs/northline/app
npm run start --prefix benchmarks/security-labs/northline/app
```

Direct mode binds `127.0.0.1`; `LAB_PORT` selects another local port. `LAB_CONTAINER=1` binds all container interfaces and must only be used with the provided loopback-only Compose configuration. Both modes check the exact IPv4-loopback Host header.

## Test accounts

| Role | Email | Password |
|---|---|---|
| Customer Alice | alice@northline.test | northline-alice-2026 |
| Customer Bob | bob@northline.test | northline-bob-2026 |
| Administrator | admin@northline.test | northline-admin-2026 |

These are fixture credentials only. Runtime sessions use a fresh process-owned signing key and HttpOnly cookies. Restart requires signing in again. Container orders and profile edits persist in `/app/.data/store.json` on the `northline-data` named volume; direct mode uses `app/.data/store.json`. The browser cart persists in that browser's local storage. Compose shutdown retains the data volume. There is no public reset endpoint or repaired-mode flag.

To restore container seed data, run the following command and start again. **This permanently deletes this Compose project’s laboratory data volume, including orders and profile edits.** Clear the browser cart separately. In direct mode, stop the target and move the generated JSON file aside instead.

```sh
docker compose -f benchmarks/security-labs/northline/compose.yaml down -v
```

## Verify the target

While the local target is running:

```sh
node benchmarks/security-labs/northline/evaluation/smoke.mjs
node benchmarks/security-labs/northline/evaluation/browser-smoke.mjs
```

The API baseline verifies normal shopping, authorization controls and expected benchmark conditions. The browser check uses the benchmark's existing Playwright dependency and installed Chrome; `LAB_CHROMIUM` optionally selects another installed Chromium executable. It covers search, category filtering, login, cart, checkout, order history, account and administrator views, mobile overflow and browser errors. Screenshots default to the OS temporary directory beneath `jw-northline`; `LAB_SHOT_DIR` selects another destination. `LAB_ORIGIN` selects another IPv4-loopback target.

## Independent diagnosis

Give Jabberwock the registered service origin and an ordinary customer account, then evaluate its saved findings and report. Do not give the diagnostic model `evaluation/expectations.json`, this application's source or the smoke script: those are operator-only expected results. The manifest contains minimum cases, not an exhaustive list. An affected version alone is not confirmed impact; findings need repeatable request/response or authenticated observation evidence. Local HTTP cookie attributes are laboratory context, not an assumed production finding.

No repaired variant is included. Report-driven changes and a fresh retest follow the initial diagnosis; a successful baseline smoke test is never counted as a Jabberwock discovery. See [verification](../../../docs/specs/security-execution/ec-lab-verification.md) for executed checks.
