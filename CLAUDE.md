# Server Planner — instrukcje dla Claude

Open‑source'owa (MIT) aplikacja webowa do planowania home labów: canvas z urządzeniami i lokalizacjami (pomieszczenie / półka / rack), sieć (VLANy, podsieci, firewall), sprzęt, OS, VM/LXC/Docker, aplikacje z katalogu, **capacity** i **symulacja ruchu**. Local‑first: SPA na GitHub Pages, dane w IndexedDB, eksport JSON, zero backendu. Projekt hobbystyczny, niekomercyjny.

## Język

- **Rozmowa i dokumentacja (`docs/`, ten plik, skille): po polsku.**
- **Kod, identyfikatory, komentarze w kodzie, commity, UI, klucze i18n: po angielsku.**
- UI tylko EN; każdy tekst przez i18n (ICU) — nigdy tekst w JSX.

## Źródła prawdy — czytaj zanim zmienisz

| Plik                         | Zawiera                                                                                                                     | Kiedy czytać            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `docs/01-funkcjonalnosci.md` | decyzje D1–D9, moduły i ID funkcji (PRJ, CAN, LOC, HW, SW, NET, VAL, SIM, FLW, CAP…), priorytety P0/P1/P2, zakres MVP, i18n | każda nowa funkcja      |
| `docs/02-model-danych.md`    | typy TS całego modelu, katalogu, wyników silników, IndexedDB, migracje                                                      | zmiana danych           |
| `docs/03-architektura.md`    | stos, struktura repo, warstwa komend, silniki, CI, testy, etapy MVP, ADR                                                    | kod, CI                 |
| `docs/04-design-system.md`   | tokeny (kolor, typografia, odstępy, promienie, ruch), komponenty, a11y                                                      | każdy UI                |
| `docs/05-projekt-ui.md`      | zachowania ekranów, interakcje canvasu, inspector, przepływy, copy                                                          | każdy UI                |
| `docs/06-zrodla-danych.md`   | źródła katalogu, licencje, adaptery, wydajność CPU                                                                          | katalog                 |
| `docs/07-mapa-widokow.md`    | **spis wszystkich widoków z ID** (P/V/I/X/S/D/O/T/M), trasy, sitemapa, status makiet                                        | nowy widok / trasa      |
| `docs/STATUS.md`             | postęp etapów implementacji                                                                                                 | początek i koniec pracy |
| `docs/adr/`                  | decyzje architektoniczne                                                                                                    | zmiana architektury     |
| `design/`                    | kopia canvasu z makietami + generatory                                                                                      | wygląd ekranu           |

Makiety (żywa wersja): https://claude.ai/artifact/TYyEbjsYcgZdkqFDvew6At — plansze „Editor — dark (corrected)”, „Sitemap”, `Mvp*`.

Jeśli kod i dokumentacja się rozjeżdżają — **zatrzymaj się i zapytaj**, potem zaktualizuj jedno lub drugie (skill `record-decision`).

## Stos (szczegóły: `implementation.md`)

TypeScript strict · pnpm workspaces · Vite · React · React Flow (`@xyflow/react`) · Zustand + Immer · Zod · `idb` · Web Worker + Comlink · ipaddr.js · i18next + ICU · Radix UI · Tailwind (tylko tokeny) · Lucide · IBM Plex (`@fontsource`) · React Router (hash) · TanStack Table · html-to-image · vite-plugin-pwa · Vitest · Playwright · Biome.

## Struktura

```
apps/web/                 SPA (features/, store/, persistence/, catalog/, workers/, ui/, i18n/)
packages/model/           typy, Zod, komendy, migracje, fabryki — bez React/DOM
packages/engine/          graph, L2/L3, validation, capacity, reach, flows — bez React/DOM
packages/catalog-builder/ adaptery źródeł (Node, GitHub Actions)
catalog/curated/          YAML kurowany (apps/, devices/, cpus/, os/, aliases, heuristics)
catalog/dist/             GENEROWANE przez workflow — nie edytuj ręcznie
fixtures/                 projekty testowe (*.json)
design/                   makiety i generatory
docs/                     dokumentacja (PL)
```

## Niezmienniki architektury (nie łam)

1. **Zależności**: `web → engine → model`, `catalog-builder → model`. `model` i `engine` nie importują React, DOM, IndexedDB.
2. **Każda zmiana projektu = nazwana komenda** w `packages/model` (czysta funkcja na drafcie Immera). UI nigdy nie mutuje store'u. Komenda dba o kaskady i integralność referencji.
3. **Zapisujemy tylko wejścia** — wszystko wyliczalne (capacity, issues, dostęp) liczą silniki w workerze. Domena oddzielona od `layout`.
4. **ID z prefiksami** (`dev_`, `if_`, `lnk_`, `wl_`, `app_`, `loc_`, …) — fabryki w `model`. Jednostki bazowe: bajty, Mb/s, W, rdzenie (float).
5. **Silniki zwracają `{ code, params }`**, nigdy tekst; tłumaczenie w UI.
6. **Zmiana schematu = `schemaVersion` + migracja + fixture** (skill `schema-change`).
7. **Pozycje katalogu są kopiowane do projektu** z `catalogRef`; projekt nie zmienia się po aktualizacji katalogu.
8. **Kolory i wymiary tylko z tokenów** (`--sp-*`); zero surowej palety Tailwind, zero hexów w komponentach.
9. Brak telemetrii, zewnętrznych skryptów i zapytań poza własny origin; CSP `default-src 'self'`.
10. Katalog: tylko źródła z licencją pozwalającą na redystrybucję (`docs/06`); pobieranie max 1×/tydzień.

## Komendy (definiowane w etapie 0 — utrzymuj te nazwy)

```bash
pnpm install
pnpm dev                 # apps/web na http://localhost:5173/server-planner/
pnpm build               # build całości
pnpm lint                # biome check
pnpm format              # biome format --write
pnpm typecheck           # tsc --noEmit we wszystkich pakietach
pnpm test                # vitest (model, engine, builder, web)
pnpm test:e2e            # playwright
pnpm i18n:check          # brakujące / nieużywane klucze, zgodność parametrów ICU
pnpm tokens:check        # kontrast tokenów + zakaz surowej palety
pnpm catalog:validate    # walidacja catalog/curated schematami Zod
pnpm catalog:build       # lokalny build katalogu (bez --force respektuje blokadę 7 dni)
```
Przed uznaniem pracy za skończoną: `pnpm lint && pnpm typecheck && pnpm test` (+ `i18n:check` przy tekstach, `catalog:validate` przy katalogu). Raportuj wyniki uczciwie — jeśli coś nie przechodzi, powiedz to.

## Sposób pracy

1. Na początku sesji przeczytaj `docs/STATUS.md` i odpowiednie sekcje dokumentacji.
2. Pracuj w kolejności etapów z `docs/03` § 11; funkcje P1/P2 dopiero po MVP, chyba że użytkownik zdecyduje inaczej.
3. Nowa funkcja: znajdź jej ID w `01` i widok w `07`; wygląd z `04`/`05` i makiet.
4. Testy razem z kodem: silniki i komendy — Vitest na fixture'ach; każdy błąd symulacji = nowy fixture.
5. Po zakończeniu: zaktualizuj `docs/STATUS.md`, status makiet w `07` (jeśli dotyczy), dokumentację przy zmianie zachowania.
6. **Commit / push tylko na prośbę użytkownika** — wtedy skill `commit`.

## Skille (`.claude/skills/`)

| Skill                 | Użyj gdy                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| `commit`              | zapisanie postępu: kontrole, Conventional Commit, STATUS, PR                           |
| `record-decision`     | nowa decyzja produktowa/architektoniczna, rozstrzygnięcie kwestii, zmiana dokumentacji |
| `design-system`       | budowa lub przegląd dowolnego komponentu / ekranu UI                                   |
| `add-view`            | nowa trasa, widok, panel, szuflada, dialog (zgodnie z `07`)                            |
| `add-device-model`    | nowy model sprzętu w katalogu (mini PC, NAS, switch…), CPU, aliasy                     |
| `add-device-kind`     | nowy **typ** urządzenia (`DeviceKind`) z sylwetką, formą i portami                     |
| `add-catalog-app`     | nowa aplikacja w katalogu z wymaganiami, wzorcami ruchu i przepływami                  |
| `add-validation-rule` | nowa reguła walidacji (VAL‑xx) w silniku                                               |
| `schema-change`       | zmiana modelu danych / formatu pliku projektu                                          |
| `add-source-adapter`  | nowe źródło danych katalogu w builderze                                                |
| `release`             | wydanie wersji aplikacji                                                               |
| `design-mockup`       | nowa lub poprawiona makieta na canvasie projektowym                                    |

## Czego nie robić

- Nie edytuj `catalog/dist/` ręcznie (generuje workflow).
- Nie dodawaj zależności bez uzasadnienia — najpierw sprawdź, czy stos z `03` już to pokrywa; nowa zależność = wpis w `implementation.md`.
- Nie dodawaj tekstów UI bez kluczy i18n, kolorów bez tokenów, interakcji bez obsługi klawiatury.
- Nie pobieraj danych ze źródeł odrzuconych w `06` (selfh.st, PassMark, UserBenchmark, Geekbench).
- Nie rozszerzaj zakresu poza zadanie; propozycje zgłaszaj osobno.
