# Server Planner

Plan your home lab before you buy or rewire it: devices and where they stand (room, shelf, rack), the network (VLANs, subnets, firewall zones and rules, VPN, IPv6), hardware, operating systems, VMs / LXC / Docker and apps from a curated catalog — then check **capacity**, **power** and **costs**, and **simulate traffic** (who can reach what, which flows get through, what breaks when a device fails).

**Open the app:** https://kassek-dev.github.io/server-planner/

- Local-first: a static single-page app; projects live in your browser (IndexedDB) and export to JSON. No accounts, no backend, no telemetry.
- Works offline (PWA) with a built-in catalog of devices, CPUs and apps, updated weekly.
- English UI. MIT licensed; catalog data CC BY-SA 4.0 (`catalog/LICENSE`).

## Development

Requirements: Node ≥ 26 (`.nvmrc`), pnpm 12.

```bash
pnpm install
pnpm exec playwright install chromium   # in apps/web, for E2E tests
pnpm dev                                # http://localhost:5173/server-planner/
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
pnpm build
```

Monorepo:

| Path                        | What                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `apps/web`                  | React SPA (React Flow canvas, Zustand, Web Worker engine)    |
| `packages/model`            | types, Zod schemas, commands, migrations (no React/DOM)      |
| `packages/engine`           | validation, capacity, power, network simulation (no React/DOM) |
| `packages/catalog-builder`  | weekly catalog build from curated YAML and open sources      |
| `catalog/curated`           | hand-curated catalog data                                    |

Project documentation (in Polish) is in `docs/` — start with `docs/08-dalszy-rozwoj.md` and `docs/STATUS.md`. Changes: `CHANGELOG.md`.

Contributions follow Conventional Commits with squash merges; every pull request runs lint, type checks, unit and E2E tests in CI.
