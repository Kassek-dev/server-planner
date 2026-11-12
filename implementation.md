# Server Planner — narzędzia implementacji

> Data: 2026-11-11 · Podstawa: `docs/03-architektura.md` v0.2, `docs/04` v0.1, `docs/06` v0.1
> Ten plik opisuje **każde narzędzie** używane przy budowie, testowaniu, publikacji i utrzymaniu projektu: do czego służy, gdzie żyje jego konfiguracja, jak go używamy i jakich reguł pilnujemy. Zasady pracy z Claude: `CLAUDE.md`.

**Polityka narzędzi:** jedno dobre, popularne narzędzie na problem. Wersje — aktualne stabilne w chwili etapu 0, przypięte w `pnpm-lock.yaml`; aktualizacje przez Dependabota. Nowe narzędzie = uzasadnienie (czego nie pokrywa obecny stos) + wpis w tym pliku + (dla decyzji architektonicznej) ADR.

---

## Spis

1. [Środowisko deweloperskie](#1-środowisko-deweloperskie)
2. [Język, monorepo i build](#2-język-monorepo-i-build)
3. [Aplikacja — biblioteki runtime](#3-aplikacja--biblioteki-runtime)
4. [UI, style i zasoby](#4-ui-style-i-zasoby)
5. [Jakość: lint, typy, testy, kontrole własne](#5-jakość-lint-typy-testy-kontrole-własne)
6. [Katalog: builder i źródła danych](#6-katalog-builder-i-źródła-danych)
7. [CI/CD, hosting i GitHub](#7-cicd-hosting-i-github)
8. [Narzędzia projektowe](#8-narzędzia-projektowe)
9. [Claude Code: instrukcje, skille, pamięć](#9-claude-code-instrukcje-skille-pamięć)
10. [Skrypty projektu — ściąga](#10-skrypty-projektu--ściąga)
11. [Mapa: narzędzie → etap MVP](#11-mapa-narzędzie--etap-mvp)

---

## 1. Środowisko deweloperskie

| Narzędzie                        | Do czego                                        | Konfiguracja / uwagi                                                                                                   |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Node.js** (aktywna wersja LTS) | runtime dla Vite, testów, buildera katalogu     | `.nvmrc` + `engines.node` w root `package.json`; ta sama wersja w GitHub Actions (`actions/setup-node` czyta `.nvmrc`) |
| **pnpm** 12 | menedżer pakietów i workspaces | `packageManager` w root `package.json`. Node ≥ 25 nie zawiera Corepacka — instalacja: `npm i -g pnpm --prefix ~/.local` (lokalnie) / `pnpm/action-setup` (CI). Skrypty instalacyjne zależności są domyślnie blokowane — zezwolenia w `pnpm-workspace.yaml` → `allowBuilds` (`pnpm approve-builds <pkg>`); polityka `minimumReleaseAge` odrzuca zbyt świeże wersje — wybieraj starszą wersję zamiast dodawać wyjątki. Nigdy `npm i` / `yarn` w repo |
| **Git**                          | wersjonowanie                                   | Conventional Commits, squash merge; skill `commit`                                                                     |
| **GitHub CLI (`gh`)**            | PR, Issues, Releases, podgląd workflow          | `gh pr create`, `gh run list`, `gh release create`; skille `commit`, `release`                                         |
| **Python 3**                     | tylko generatory makiet w `design/generators/`  | bez zależności zewnętrznych; nie jest częścią aplikacji                                                                |
| **Przeglądarki Playwright**      | testy E2E i wizualne                            | `pnpm exec playwright install --with-deps chromium` (lokalnie i w CI)                                                  |
| **Edytor**                       | dowolny; zalecany VS Code z rozszerzeniem Biome | `.vscode/extensions.json` (Biome, Tailwind IntelliSense), format on save przez Biome                                   |

---

## 2. Język, monorepo i build

### TypeScript (strict)

- **Po co:** model z `docs/02` przenosi się 1:1; wspólne typy dla aplikacji, silników, workera i buildera.
- **Konfiguracja:** `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: bundler`), w pakietach `tsconfig.json` z `extends` i `references`.
- **Reguły:** brak `any` (Biome to wymusza), typy z Zod przez `z.infer`, jednostki jako aliasy (`Bytes`, `Mbps`, `Watts`).
- **Komenda:** `pnpm typecheck` (`tsc -b --noEmit` po wszystkich pakietach).

### pnpm workspaces

- **Po co:** monorepo `apps/web`, `packages/model`, `packages/engine`, `packages/catalog-builder` dzieli kod bez publikacji paczek.
- **Konfiguracja:** `pnpm-workspace.yaml`; zależności wewnętrzne `"@server-planner/model": "workspace:*"`.
- **Reguła zależności:** `web → engine → model`, `catalog-builder → model`; `model` i `engine` bez React/DOM — pilnuje Biome (`noRestrictedImports`) i osobne `tsconfig` bez `lib: dom` w tych pakietach.
- **Komendy:** `pnpm --filter <pkg> <script>`, `pnpm -r <script>`.

### Vite

- **Po co:** dev server i build SPA; obsługa workerów (`new Worker(new URL(...), { type: 'module' })`).
- **Konfiguracja:** `apps/web/vite.config.ts` — `base: '/server-planner/'` (GitHub Pages), plugin React, plugin PWA, import katalogu bazowego jako leniwy chunk.
- **Komendy:** `pnpm dev` (http://localhost:5173/server-planner/), `pnpm build`, `pnpm --filter web preview`.
- **Wtyczki własne:** `catalogPlugin` (`virtual:catalog`, `packages/catalog-builder/src/vite.ts`) i `licensesPlugin` (`virtual:licenses`, `apps/web/plugins/licenses.ts` — produkcyjne zależności z licencjami dla About › Licenses).
- **`--configLoader runner`** (w skryptach `dev`/`build`/`preview` i w `pnpm test`): config importuje wtyczkę katalogu z pakietu workspace w TypeScripcie (`@server-planner/catalog-builder/vite`); domyślny loader oddaje takie importy natywnemu Node, który nie rozwiązuje importów bez rozszerzeń. Loader `runner` transformuje je jak resztę kodu.

---

## 3. Aplikacja — biblioteki runtime

| Biblioteka                                | Rola                                                        | Gdzie                                   | Zasady użycia                                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React**                                 | UI                                                          | `apps/web`                              | komponenty funkcyjne; logika domenowa poza komponentami (komendy, selektory)                                                                        |
| **React Router** (hash)                   | trasy `#/…`                                                 | `apps/web/src/app/`                     | GitHub Pages bez fallbacku SPA → `createHashRouter`; parametry widoku (`sel`, `tab`, `panel`, `sim`) przez helper `url-state.ts` (skill `add-view`) |
| **React Flow** (`@xyflow/react`)          | canvas: pan/zoom, siatka, węzły, uchwyty = porty, krawędzie | `features/canvas/`                      | źródłem prawdy jest `projectStore`; węzły/krawędzie wyliczane selektorem; lokalizacje jako parent nodes; zoom semantyczny wg `05` § 4.1             |
| **Zustand**                               | store'y: project, history, results, catalog, ui             | `apps/web/src/store/`                   | selektory z memoizacją; brak bezpośrednich mutacji z UI                                                                                             |
| **Immer**                                 | niemutowalne aktualizacje + patche                          | komendy w `packages/model`              | `produceWithPatches` → undo/redo i diff snapshotów; scalanie zmian ciągłych (gest / 500 ms)                                                         |
| **Zod**                                   | schematy = typy + walidacja                                 | `packages/model`                        | import JSON, katalog (YAML → Zod), migracje, URL params                                                                                             |
| **idb**                                   | IndexedDB                                                   | `apps/web/src/persistence/`             | store'y z `02` § 10; wersja bazy + `upgrade()` przy zmianach (skill `schema-change`)                                                                |
| **Web Worker + Comlink**                  | silniki poza wątkiem UI                                     | `apps/web/src/workers/engine.worker.ts` | debounce 150 ms; zmiany tylko w `layout` nie uruchamiają analiz; zapytania `reach`/`runFlow` przez ten sam worker                                   |
| **ipaddr.js**                             | CIDR, IP, porównania                                        | `packages/engine`, `packages/model`     | nigdy własnych regexów do IP                                                                                                                        |
| **i18next + react-i18next + i18next-icu** | tłumaczenia (ICU)                                           | `apps/web/src/i18n/`                    | zero tekstów w JSX; przestrzenie nazw per feature; silniki zwracają `{code, params}`; `Intl` do liczb i jednostek                                   |
| **TanStack Table** (P1)                   | Inventory, IP Plan                                          | `features/*/views/`                     | sortowanie, filtry, edycja inline                                                                                                                   |
| **@tanstack/react-table** 9 | tabele Inventory / IP Plan | `features/inventory/` | v9: `tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), … })` w zasięgu modułu, `useTable`; kolumny i dane stabilne (`useMemo`) |
| **html-to-image**                         | eksport PNG/SVG                                             | `features/export/`                      | metoda zalecana przez React Flow; motyw eksportu niezależny od UI                                                                                   |
| **vite-plugin-pwa** (P1)                  | offline, aktualizacja aplikacji                             | `vite.config.ts`                        | precache aplikacji i katalogu bazowego; toast „New version available”                                                                               |

---

## 4. UI, style i zasoby

### Tailwind CSS + tokeny CSS

- **Po co:** szybkie style przy pełnej kontroli design systemu.
- **Konfiguracja:** `apps/web/src/styles/tokens.css` (`--sp-*`, `[data-theme="dark|light"]`), mapowanie w konfiguracji Tailwinda (`colors.panel = 'var(--sp-bg-panel)'` itd.), eksport `tokens.json` dla kontroli i dokumentacji.
- **Reguły:** tylko tokeny semantyczne; zakaz klas surowej palety (`zinc-*`, `orange-*`…) i hexów w komponentach — sprawdza `pnpm tokens:check`. Szczegóły: `docs/04`, skill `design-system`.

### Radix UI (prymitywy)

- **Po co:** dostępne dialogi, menu, popovery, taby, selecty, toggle groupy, tooltipy — bez narzuconego wyglądu.
- **Gdzie:** opakowane w `apps/web/src/ui/` (Button, Dialog, Tabs, Segmented, Select, Tooltip, Toast…), reszta aplikacji używa tylko tych opakowań.

### Lucide + własne sylwetki

- **Lucide:** ikony UI (16/18 px, stroke 1.75), import per ikona (tree‑shaking).
- **Sylwetki urządzeń:** `apps/web/src/icons/devices/` — własne komponenty SVG 24×24, stroke 1.6 (rack‑1u, rack‑2u, tower, mini‑pc, desktop, nas, wall, ceiling, sbc, rack, shelf, room). Nowa sylwetka → skill `add-device-kind`.

### Fonty IBM Plex (`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`)

- Self‑hosted (CSP, offline), wagi 400/500/600, podzbiory latin + latin‑ext. Google Fonts tylko w makietach.

### Galeria komponentów `#/dev/design`

- Trasa dostępna tylko w buildzie deweloperskim; renderuje każdy komponent i stan w obu motywach. Źródło zrzutów wizualnych (Playwright). Zamiast Storybooka.

---

## 5. Jakość: lint, typy, testy, kontrole własne

| Narzędzie                              | Zakres                                                                                                                                        | Konfiguracja                                                                                                | Komenda                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Biome**                              | lint + formatowanie (TS, JSON, CSS)                                                                                                           | `biome.json`: reguły recommended, `noExplicitAny`, `noRestrictedImports` (granice pakietów), import sorting | `pnpm lint`, `pnpm format`               |
| **tsc**                                | typy                                                                                                                                          | `tsconfig.base.json`                                                                                        | `pnpm typecheck`                         |
| **Vitest**                             | testy jednostkowe: model (schematy, komendy, migracje), silniki (reguły, capacity, reach, flows), builder (adaptery na próbkach), UI (logika) | `vitest.workspace.ts`; fixture'y w `fixtures/`                                                              | `pnpm test`, `pnpm test --filter engine` |
| **Testing Library**                    | testy komponentów (role, nazwy dostępne, interakcje)                                                                                          | z Vitest (`jsdom`)                                                                                          | w `pnpm test`                            |
| **Playwright**                         | E2E ścieżek A i B (`01` § 4), smoke test po deployu, zrzuty wizualne galerii                                                                  | `playwright.config.ts` (chromium; baseURL dev/preview)                                                      | `pnpm test:e2e`                          |
| **`i18n:check`** (skrypt własny)       | brakujące / nieużywane klucze, zgodność parametrów ICU, tłumaczenie dla każdego `VAL_*`                                                       | `scripts/i18n-check.ts`                                                                                     | `pnpm i18n:check`                        |
| **`tokens:check`** (skrypt własny)     | kontrast WCAG par tokenów (tekst ≥ 4.5, grafika ≥ 3), zakaz surowej palety i hexów w `src/`                                                   | `scripts/tokens-check.ts`                                                                                   | `pnpm tokens:check`                      |
| **`catalog:validate`** (skrypt własny) | YAML w `catalog/curated` przez schematy Zod, refy (CPU, aliasy), unikalność `id`, słownik `purpose`                                           | `packages/catalog-builder`                                                                                  | `pnpm catalog:validate`                  |

**Fixture'y** (`fixtures/`): małe, czytelne projekty JSON — `validation/` (reguła z problemem i bez), `schema/v<N>/` (każda wersja schematu do testów migracji), `apps/` (aplikacje z przepływami), `examples/` (projekt przykładowy dla „Try example project”). Każdy błąd symulacji = nowy fixture.

---

## 6. Katalog: builder i źródła danych

### `packages/catalog-builder` (Node)

- **Po co:** zbiera dane ze źródeł, normalizuje, scala z warstwą kurowaną, waliduje i publikuje `catalog/dist/` (`docs/03` § 7, `docs/06`).
- **Biblioteki:** `yaml` (parsowanie warstwy kurowanej), `stream-json` (strumieniowe parsowanie zrzutu Blender Open Data), natywny `fetch` Node, Zod z `packages/model`, `node:crypto` (SHA‑256 do manifestu).
- **Elementy:** `SourceAdapter` (`fetch` + `normalize`) per źródło, scalanie wg priorytetu (`curated` > źródła), generowanie wzorców ruchu `estimated`, bezpieczniki (spadek > 20% → przerwanie + Issue), blokada 7 dni (`catalog/state.json`).
- **Warstwa kurowana w MVP:** `src/curated.ts` (`loadCurated`: YAML → jednostki → referencje CPU → Zod), `src/validate.ts` (`pnpm catalog:validate`), `src/vite.ts` (wtyczka `virtual:catalog` dla aplikacji). Zależności: `yaml`, `zod`.
- **Komendy:** `pnpm catalog:validate`, `pnpm catalog:build [-- --force] [-- --only <id>] [-- --dry-run]` (builder ze źródłami — wersja 1.1).
- **Nowe źródło:** skill `add-source-adapter` (najpierw licencja).

### Źródła (szczegóły i licencje: `docs/06` § 1)

| Źródło                       | Narzędzie dostępu                                                        | Dane                                    |
| ---------------------------- | ------------------------------------------------------------------------ | --------------------------------------- |
| awesome-selfhosted-data      | `git clone --depth 1`                                                    | lista aplikacji (CC BY‑SA 3.0)          |
| Proxmox VE Community Scripts | JSON metadanych (repo / API)                                             | domyślne zasoby (MIT)                   |
| LinuxServer.io API           | `GET api.linuxserver.io/api/v1/images?include_config=true`               | porty, wolumeny, architektury (fakty)   |
| Docker Hub API               | `hub.docker.com/v2/repositories/…/tags` (+ opcjonalny token)             | tagi, architektury, rozmiary            |
| Blender Open Data            | codzienny zrzut JSON                                                     | wydajność CPU/GPU (bez praw autorskich) |
| Wikidata                     | SPARQL `query.wikidata.org`                                              | specyfikacje CPU (CC0)                  |
| Warstwa kurowana             | YAML w `catalog/curated/` (skille `add-device-model`, `add-catalog-app`) | wzorce ruchu, przepływy, modele, CPU    |

### Konwencje plików kurowanych

`catalog/curated/apps/*.yaml`, `devices/*.yaml`, `cpus/*.yaml`, `os/*.yaml`, `cpu-aliases.yml`, `app-aliases.yml`, `heuristics.yml`. Rozmiary z jednostką (`16 GiB`, `256 GB`), prędkości w Mb/s, `id` = slug = nazwa pliku.

---

## 7. CI/CD, hosting i GitHub

| Narzędzie                                 | Rola                                                                                                           | Konfiguracja                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **GitHub Actions — `ci.yml`**             | na PR i push: Biome, `tokens:check`, `typecheck`, Vitest, `i18n:check`, `catalog:validate`, build              | `.github/workflows/ci.yml`; cache pnpm                                             |
| **GitHub Actions — `deploy.yml`**         | push na `main` → build `apps/web` (z katalogiem) → GitHub Pages; smoke test Playwright                         | `actions/upload-pages-artifact` + `actions/deploy-pages`                           |
| **GitHub Actions — `catalog-update.yml`** | cron `0 3 * * 1` + ręcznie (`force`): builder → commit `chore(catalog): YYYY.WW` → deploy; bezpiecznik → Issue | sekrety: `GITHUB_TOKEN`, opcjonalny `DOCKERHUB_TOKEN`; limit 30 min                |
| **GitHub Pages**                          | hosting SPA i katalogu (ten sam origin → brak CORS)                                                            | `https://<user>.github.io/server-planner/`; własna domena później (CNAME + `base`) |
| **GitHub Issues**                         | zgłoszenia błędów, raporty bezpieczników katalogu, braki aliasów CPU                                           | szablony w `.github/ISSUE_TEMPLATE/` (bug, device request, app request)            |
| **GitHub Releases**                       | notatki wydań z changelogu                                                                                     | skill `release`                                                                    |
| **Dependabot**                            | cotygodniowe aktualizacje zależności i akcji, grupowane                                                        | `.github/dependabot.yml` (npm + github-actions, grupy: react, tooling, testing)    |
| **Ochrona `main`**                        | wymagane zielone CI, squash merge                                                                              | ustawienia repo                                                                    |

Wersjonowanie: SemVer (`0.x` do MVP), changelog z Conventional Commits (`CHANGELOG.md`).

---

## 8. Narzędzia projektowe

| Narzędzie                                              | Rola                                                                    | Gdzie                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Canvas projektowy (artefakt „Design” na claude.ai)** | makiety wszystkich kluczowych ekranów, sitemapa, kierunki wizualne      | https://claude.ai/artifact/TYyEbjsYcgZdkqFDvew6At               |
| **Kopia makiet**                                       | wersjonowana kopia plansz i indeksu                                     | `design/canvas/project/`                                        |
| **Generatory makiet (Python)**                         | prymitywy UI i automatyczne budowanie plansz `Mvp*` i sitemapy          | `design/generators/mvp.py`, `sitemap.py`; skill `design-mockup` |
| **Mermaid**                                            | diagramy w dokumentacji (sitemapa, ER, przepływy)                       | bloki ` ```mermaid ` w `docs/` (renderuje GitHub)               |
| **Dokumentacja**                                       | źródło prawdy: funkcje, model, architektura, design, UI, źródła, widoki | `docs/01`…`07`, `docs/adr/`, `docs/STATUS.md`                   |

---

## 9. Claude Code: instrukcje, skille, pamięć

### `CLAUDE.md` (root)

Ładowany automatycznie w każdej sesji: język, źródła prawdy, niezmienniki architektury, komendy, sposób pracy, indeks skilli, zakazy. Krótki — szczegóły w `docs/` i skillach.

### Skille (`.claude/skills/<nazwa>/SKILL.md`)

Ładowane na żądanie, gdy zadanie pasuje do opisu (lub wywołane jako `/nazwa`).

| Skill                 | Powtarzalne zadanie                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `commit`              | kontrole → `STATUS.md` → Conventional Commit → branch/PR                                    |
| `record-decision`     | decyzje D‑xx, ADR, rozstrzygnięte kwestie, propagacja między dokumentami, wersje dokumentów |
| `design-system`       | tokeny, typografia, kształty, komponenty, stany, a11y, checklista UI                        |
| `add-view`            | nowa strona / widok / panel / szuflada / dialog zgodnie z `07` i schematem URL              |
| `add-device-model`    | model sprzętu i CPU w katalogu (YAML), aliasy wydajności                                    |
| `add-device-kind`     | nowy `DeviceKind`: model, fabryka, sylwetka, kafelek, biblioteka, silniki                   |
| `add-catalog-app`     | aplikacja z komponentami, wymaganiami, wzorcami ruchu i przepływami                         |
| `add-validation-rule` | reguła VAL‑xx: silnik, i18n, Fix, fixture, test                                             |
| `schema-change`       | zmiana modelu: Zod, `schemaVersion`, migracja, fixture'y, IndexedDB                         |
| `add-source-adapter`  | nowe źródło katalogu: licencja → adapter → próbki → workflow → atrybucja                    |
| `release`             | SemVer, changelog, tag, deploy, notatki wydania                                             |
| `design-mockup`       | makiety na canvasie i w `design/`                                                           |

### Pamięć Claude

Prywatna pamięć sesji Claude Code (poza repo) przechowuje preferencje użytkownika (język PL) i skrót decyzji. Repo i `docs/` pozostają jedynym źródłem prawdy dla zespołu.

---

## 10. Skrypty projektu — ściąga

```bash
pnpm dev                  # aplikacja lokalnie
pnpm build                # build wszystkich pakietów
pnpm lint | pnpm format   # Biome
pnpm typecheck            # tsc
pnpm test                 # Vitest (wszystko) · --filter model|engine|catalog-builder|web
pnpm test:e2e             # Playwright
pnpm i18n:check           # klucze i parametry tłumaczeń
pnpm tokens:check         # kontrast i zakaz surowej palety
pnpm catalog:validate     # warstwa kurowana
pnpm catalog:build        # build katalogu (--force, --only <id>, --dry-run)
python3 design/generators/mvp.py   # regeneracja makiet MVP
```
Minimum przed zapisem pracy: `pnpm lint && pnpm typecheck && pnpm test`.

---

## 11. Mapa: narzędzie → etap MVP

| Etap (`03` § 11)  | Wprowadzane narzędzia                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Fundament       | Node, pnpm, TypeScript, Vite, React, React Router, Biome, Vitest, Playwright, Tailwind + tokeny, @fontsource, i18next, GitHub Actions (`ci`, `deploy`), Pages, Dependabot, skrypty `i18n:check`, `tokens:check` |
| 1 Model           | Zod, Immer, fabryki ID, fixture'y                                                                                                                                                                               |
| 2 Persystencja    | idb, Zustand (project/history/ui)                                                                                                                                                                               |
| 3 Canvas          | React Flow, Lucide, sylwetki urządzeń, Radix (menu kontekstowe, tooltip)                                                                                                                                        |
| 4 Inspector       | Radix (tabs, select, dialog), formularze                                                                                                                                                                        |
| 5 Silniki I       | Web Worker + Comlink, ipaddr.js                                                                                                                                                                                 |
| 6 Silniki II      | (silniki) + animacje SVG przepływu                                                                                                                                                                              |
| 7 Katalog         | `yaml`, `catalog:validate`, warstwa bazowa                                                                                                                                                                      |
| 8 Eksport i szlif | html-to-image, Playwright E2E, (P1) vite-plugin-pwa, TanStack Table                                                                                                                                             |
| 1.1               | catalog-builder z adapterami, `stream-json`, `catalog-update.yml`                                                                                                                                               |
