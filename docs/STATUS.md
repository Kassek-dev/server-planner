# Status implementacji

> Aktualizowany przy każdym zapisie postępu (skill `commit`). Etapy: `03-architektura.md` § 11. Widoki: `07-mapa-widokow.md`.

## Faza projektowa — zakończona (2026-11-11)

- [x] `01` funkcjonalności v0.4 (D1–D9)
- [x] `02` model danych v0.3
- [x] `03` architektura v0.2
- [x] `04` design system v0.1
- [x] `05` projekt UI v0.1
- [x] `06` źródła danych v0.1
- [x] `07` mapa widoków i sitemapa v0.1
- [x] Makiety MVP (canvas, kopia w `design/`)
- [x] `CLAUDE.md`, skille `.claude/skills/`, `implementation.md`

## Etap 0 — Fundament

- [x] `git init` (lokalnie, gałąź `main`), licencje (MIT, `catalog/LICENSE` CC‑BY‑SA‑4.0)
- [ ] Repo publiczne na GitHubie + włączenie Pages (źródło: GitHub Actions)
- [x] pnpm workspaces: `apps/web`, `packages/model`, `packages/engine`, `packages/catalog-builder`
- [x] TypeScript strict (wspólny `tsconfig.base.json`), Biome, skrypty z `CLAUDE.md`
- [x] Vite + React + hash router, `base: '/server-planner/'`
- [x] Tokeny `tokens.css` (dark + light) + Tailwind mapping + `@fontsource` IBM Plex
- [x] i18next + ICU, `locales/en/*`, `pnpm i18n:check`
- [x] Galeria `#/dev/design` (kolory, VLAN, typografia, przyciski, LED — oba motywy)
- [x] CI `ci.yml`, deploy `deploy.yml` (z testem Playwright), `dependabot.yml` — napisane, lokalnie zielone
- [ ] Pierwszy przebieg CI i deploy na GitHub Pages
- [x] `pnpm tokens:check` (kontrast + zakaz surowej palety) — wykrył 8 par poniżej WCAG, poprawione (`04` § 12)

## Etap 1 — Model

- [ ] Typy + Zod (`02`), fabryki ID, komendy z kaskadami, migracja v1, `fixtures/`

## Etap 2 — Persystencja

- [ ] IndexedDB, lista projektów (P‑01), autosave, import/eksport, undo/redo

## Etap 3 — Canvas

- [ ] React Flow, kafelki rack/standalone, lokalizacje (LOC‑01…04), porty, łącza, zaznaczanie

## Etap 4 — Inspector

- [ ] I‑02…I‑07, szuflady S‑01…S‑04

## Etap 5 — Silniki I

- [ ] `buildGraph`, L2/L3, walidacja, capacity, worker, panel Issues (X‑02)

## Etap 6 — Silniki II

- [ ] `reach()`, dostęp do internetu, widok klienta, nakładki (X‑01a/b)

## Etap 7 — Katalog

- [ ] `catalog/curated` (~50 aplikacji, typy urządzeń, OS, CPU), warstwa bazowa w aplikacji, D‑05/D‑06/D‑07

## Etap 8 — Eksport i szlif

- [ ] PNG/SVG/JSON (D‑04), Settings/About, motyw, E2E ścieżek A i B

## Dziennik

| Data       | Co                                                  | Commit                            |
| ---------- | --------------------------------------------------- | --------------------------------- |
| 2026-11-11 | Dokumentacja 01–07, makiety MVP, CLAUDE.md i skille | — (repo jeszcze nie zainicjowane) |
| 2026-11-11 | Etap 0: monorepo, web (Vite 8, React 19, Tailwind 4, i18n, tokeny, galeria), model/engine/builder, skrypty kontroli, CI/deploy; lokalnie: lint, typecheck, 10 testów, E2E 2/2, build | — (przed pierwszym commitem) |
