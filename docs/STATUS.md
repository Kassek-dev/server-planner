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
- [x] Repo publiczne https://github.com/Kassek-dev/server-planner + Pages (źródło: GitHub Actions)
- [x] pnpm workspaces: `apps/web`, `packages/model`, `packages/engine`, `packages/catalog-builder`
- [x] TypeScript strict (wspólny `tsconfig.base.json`), Biome, skrypty z `CLAUDE.md`
- [x] Vite + React + hash router, `base: '/server-planner/'`
- [x] Tokeny `tokens.css` (dark + light) + Tailwind mapping + `@fontsource` IBM Plex
- [x] i18next + ICU, `locales/en/*`, `pnpm i18n:check`
- [x] Galeria `#/dev/design` (kolory, VLAN, typografia, przyciski, LED — oba motywy)
- [x] CI `ci.yml`, deploy `deploy.yml` (z testem Playwright), `dependabot.yml` — napisane, lokalnie zielone
- [x] Pierwszy deploy na GitHub Pages (smoke test 2/2) → https://kassek-dev.github.io/server-planner/
- [x] `pnpm tokens:check` (kontrast + zakaz surowej palety) — wykrył 8 par poniżej WCAG, poprawione (`04` § 12)

## Etap 1 — Model

- [x] Schematy Zod = typy całego modelu z `02` (urządzenia, sprzęt, lokalizacje, sieć, firewall, workloady, aplikacje, układ, plik projektu)
- [x] Fabryki: projekt, urządzenie z domyślną formą i portami per `DeviceKind`, nazwy `<kind>-<n>`, deterministyczny kontekst ID dla testów
- [x] Komendy (51) z kaskadami i odrzuceniami (`CommandError {code, params}`), runner z patchami Immera (undo/redo)
- [x] `parseProjectFile`: format → łańcuch migracji → Zod; błędy `NOT_A_PROJECT_FILE`, `SCHEMA_TOO_NEW`, `INVALID_PROJECT`
- [x] Fixture `fixtures/schema/v1/home-lab.json` (lab z makiet, budowany komendami; `fixtures:write`)
- [x] 51 testów (model: schematy, import, fabryki, komendy, undo)

## Etap 2 — Persystencja

- [x] IndexedDB (`idb`): store'y `projects` (meta listy), `projectData`, `settings`; repozytorium (zapis, lista, zmiana nazwy, duplikat, usuwanie)
- [x] Sesja edycji (Zustand): komendy → historia patchy (undo/redo, scalanie gestów 500 ms, limit 200), autozapis z debounce 1 s, `flush`
- [x] Ochrona danych: zapis przy ukryciu karty, ostrzeżenie przy zamknięciu w trakcie zapisu, `navigator.storage.persist`, przypomnienie o kopii (14 dni + 50 zmian)
- [x] Import/eksport JSON (D‑02): limit 20 MB, migracje, kopia przy konflikcie ID, czytelne błędy; nazwa pliku `nazwa-RRRR-MM-DD.json`
- [x] P‑01 Projects: pierwsze uruchomienie (T‑01), karty z menu (Open, Rename, Duplicate, Export, Delete), D‑01 New project (pusty / przykład), D‑03 Delete, import przeciągnięciem (T‑11), banery, stopka
- [x] Powłoka edytora V‑01: nazwa z edycją w miejscu, status zapisu, undo/redo (przyciski + Ctrl+Z / Ctrl+Shift+Z), eksport, P‑04 dla brakującego projektu
- [x] Komponenty UI: Dialog, Menu, TextField, Banner (w galerii `#/dev/design`)
- [x] Testy: 73 jednostkowe (repozytorium na fake-indexeddb, import, sesja, router) + E2E 5/5 (pełna ścieżka projektu, import, kopia, błędny plik)
- [ ] Miniatury projektów na kartach (wymagają canvasu — etap 3)

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
| 2026-11-11 | Etap 0: monorepo, web (Vite 8, React 19, Tailwind 4, i18n, tokeny, galeria), model/engine/builder, skrypty kontroli, CI/deploy; lokalnie: lint, typecheck, 10 testów, E2E 2/2, build | `b1e044c`, `6f7f36f` |
| 2026-11-11 | Repo na GitHubie, Pages, pierwszy deploy; CI z `workflow_dispatch` | ten commit |
| 2026-11-11 | Etap 1: `packages/model` — schematy, fabryki, komendy, migracje, fixture home-lab; Dependabot #1–#5 zmergowane | — |
| 2026-11-11 | Etap 2: przechowywanie, sesja z undo/redo i autozapisem, ekran projektów, import/eksport; poprawka bezpieczeństwa cykli hostowania (`f6900a8`) | — |
