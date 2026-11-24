# Dalszy rozwój i poprawki — przekazanie

> Status: **v1.0** · Data: 2026-11-24 · Stan kodu: `main` po **v1.10.0** + aktualizacje zależności (#79, #81–#83, #91, #92)
> Podstawa: `01` v0.9 (D1–D14), `02` (schemat v4), `03`, `05` v0.28, `STATUS.md`, `CHANGELOG.md`

Punkt startowy dla kolejnej sesji (człowieka albo Claude). Nie powtarza dokumentów — odsyła do nich.

## 1. Stan na 2026-11-24

| Co                | Stan                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Wersja            | **1.10.0** (tag `v1.10.0`, GitHub Release), live: https://kassek-dev.github.io/server-planner/                         |
| Zakres            | P0 (MVP, 1.0), P1 (1.1–1.4), P2 (1.5–1.8) i rozwinięcia D14 (1.9–1.10) — **zrobione**; lista etapów 0–51 w `STATUS.md` |
| Schemat projektu  | **v4** (`flowScenarios`, `hostFirewall`, strefa `vpn`, bond, mDNS, `settings.naming`); migracje v1→v4, IndexedDB v4    |
| Testy             | 373 jednostkowe (Vitest), 80 E2E (Playwright), CI zielone na `main`                                                     |
| Otwarte PR        | brak; niewydane zmiany na `main`: tylko zależności (`CHANGELOG.md` › `[Unreleased]`)                                    |
| Katalog           | 2026.48, aktualizacja co tydzień przez `catalog-update.yml` (bot `chore(catalog)`)                                      |

## 2. Jak zacząć sesję

1. `git switch main && git pull && pnpm install`
2. `pnpm exec playwright install chromium` (w `apps/web`) — **po każdej aktualizacji Playwright**, inaczej wszystkie E2E padają w 2 ms („Executable doesn't exist”).
3. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` — punkt odniesienia przed zmianami.
4. Przeczytaj `CLAUDE.md`, ten plik, koniec `STATUS.md` (ostatnie etapy i dziennik).

## 3. Sposób pracy (utrwalony w tym projekcie)

- Gałąź `feat|fix|chore|docs/<opis>` → PR → zielone CI → `gh pr merge N -R Kassek-dev/server-planner --squash --delete-branch` → `git pull`. Lokalnych gałęzi nie trzeba usuwać.
- Conventional Commits (EN), w treści `Refs: <ID funkcji>`; trailer `Co-Authored-By` (Claude), opis PR kończy linia „Generated with Claude Code”.
- Przed PR: `pnpm format`, lint, typecheck, `i18n:check` (teksty), test, test:e2e. Wyniki raportuj uczciwie.
- Każdy etap: odhacz w `STATUS.md` + wiersz w dzienniku (numer PR), zachowanie w `05` (podbij wersję dokumentu), typy w `02`, decyzje w `01` (D‑nn) — skill `record-decision`.
- Wydanie (skill `release`): changelog z commitów od ostatniego tagu → bump `apps/web/package.json` → PR `chore(release): vX.Y.Z` → tag → `gh release create` → sprawdzenie deployu i wersji na żywo (szukaj `"X.Y.Z"` w chunkach `assets/*.js`).
- **Numeracja (D10/D11):** `X.Y.Z`, Z = liczba poprawek od `X.Y.0`; nowe funkcje → minor.

## 4. Utrzymanie — znane pułapki

| Sytuacja                                  | Co zrobić                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR od Dependabota                         | mergować po kolei; konflikt lockfile → komentarz `@dependabot rebase`, czekać na MERGEABLE + CI. Dependabot potrafi zamknąć grupowy PR i otworzyć nowy.        |
| Aktualizacja Biome                        | podbij `$schema` w `biome.json` do tej samej wersji (lint wypisuje info).                                                                                       |
| Aktualizacja Playwright                   | `pnpm exec playwright install chromium` lokalnie (CI instaluje sam).                                                                                           |
| `gh pr checks --watch` zaraz po push      | może zwrócić „no checks reported” i merge przejdzie bez CI — odczekaj ~25 s przed `--watch`; po fakcie sprawdź `gh run list --branch main`.                    |
| CI na `main` „cancelled”                  | zwykle kolejka concurrency — `gh run rerun <id>`.                                                                                                              |
| Selektory Zustanda                        | nigdy `?? []` w selektorze (React #185) — patrz `CLAUDE.md`.                                                                                                    |
| ICU w tłumaczeniach                       | dosłowne `{` w tekście trzeba ująć w apostrofy (`'{site}'`).                                                                                                    |
| Wzorce nazw (`settings.naming`)           | dokładnie jeden token liczby, `\d{1,6}`, nazwa ≤ 128 znaków — ochrona przed ReDoS (v1.8.1). Nie luzować.                                                         |
| `catalog/dist/`                           | tylko workflow; ręcznie nie edytować.                                                                                                                          |
| Zmiana schematu                           | skill `schema-change`: v5 + migracja + fixture'y w `fixtures/schema/v5/`; v1–v4 zamrożone.                                                                       |

## 5. Uproszczenia i ograniczenia, które zostały (kandydaci na kolejne wersje)

Świadomie poza zakresem lub uproszczone — przy podjęciu: decyzja D15+ w `01`.

| Obszar                       | Obecne zachowanie                                                                                                       | Możliwe rozwinięcie                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Canvas (CAN‑08)              | siatka 16 px i przyciąganie; brak prowadnic przy przeciąganiu i punktów pośrednich łączy                                | prowadnice wyrównania, waypointy łączy (`layout`)                                                       |
| Eksport Markdown             | bez rekordów DNS i tras proxy                                                                                           | sekcja „Services” w eksporcie                                                                           |
| Przepływy (FLW)              | krok DNS i ruch przez proxy obsłużone (1.5); brak sekwencji czasowej, tylko równoczesne scenariusze                     | harmonogram (noc: backup), szczyty                                                                      |
| Scenariusze × hosty (1.10)   | liczba procesu = **pierwszy** parametr profilu obciążenia aplikacji; VM ogranicza to, co przekazuje hostowi, do przydziału | mapowanie przepływ → parametr w katalogu (`flows[].loadParam`)                                          |
| VPN (1.10)                   | pełny tunel przez firewall/NAT routera (serwer na routerze) lub jak host (serwer na hoście); dzielony = własne łącze klienta | split z listą tras (AllowedIPs), wiele serwerów VPN, site‑to‑site                                       |
| IPv6 w symulacji (1.10)      | osiągalność i ekspozycja; brak NAT66/NPTv6, prefiksy delegowane uproszczone                                              | DHCPv6‑PD z WAN, NPTv6                                                                                  |
| Moc (CAP‑07, 1.9)            | szacunek z tabeli typowych wartości (≈), brak źródła z licencją                                                         | pomiary użytkownika jako źródło (`power.measured`)                                                       |
| Etykiety (1.10)              | długość taśmy szacowana z liczby znaków (mono), eksport SVG, druk A4 z liniami cięcia                                   | formaty natywne drukarek (np. `.lbx`) — tylko jeśli otwarta specyfikacja                                |
| Krok „Configure” w D‑05      | zestawy RAM / dyski / karty z presetów (`parts.ts`); zgodność slotów, nie zasilacza                                    | budżet PSU, karty z katalogu                                                                            |
| Router jako VM (D8)          | tylko urządzenie                                                                                                        | OPNsense/pfSense na Proxmoxie (duża zmiana grafu L3)                                                     |
| Systemy (D2)                 | Proxmox VE, Debian, Ubuntu Server, Windows Server                                                                       | TrueNAS, Unraid, ESXi                                                                                   |
| Języki (SET‑04)              | tylko EN, wybór ukryty                                                                                                  | PL/DE — infrastruktura i18n gotowa (`locales/<lang>`), layout odporny na +30% tekstu                     |
| Katalog                      | dane kurowane oznaczone `curated`; przegląd przez użytkownika odłożony (2026-11-12)                                      | przegląd danych urządzeń / CPU, więcej modeli (skille `add-device-model`, `add-catalog-app`)              |

## 6. Gdzie szukać kodu (najczęstsze miejsca)

| Temat                                 | Plik(i)                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Komendy (każda zmiana projektu)       | `packages/model/src/commands/`                                                              |
| Schemat i migracje                    | `packages/model/src/schema/`, `packages/model/src/migrations/`                              |
| Silnik: kontekst, capacity, moc       | `packages/engine/src/context.ts`, `capacity.ts`, `powerEstimate.ts`                         |
| Symulacja: osiągalność, przepływy, obciążenie | `packages/engine/src/simulation/reach.ts`, `flow.ts`, `load.ts`                       |
| Walidacja (VAL‑xx)                    | `packages/engine/src/validation/` (skill `add-validation-rule`)                             |
| Worker i wyniki w UI                  | `apps/web/src/workers/`, `apps/web/src/store/results.ts`                                     |
| Canvas                                | `apps/web/src/features/canvas/` (`CanvasView.tsx`, `actions.ts`, `Library.tsx`)             |
| Inspector sprzętu                     | `apps/web/src/features/inspector/device/` (`HardwareTab.tsx`, `parts.ts`)                   |
| Katalog w UI / D‑05                   | `apps/web/src/features/catalog/` (`DeviceModelPicker.tsx`, `ModelConfigure.tsx`)            |
| Etykiety (D‑17)                       | `apps/web/src/features/labels/` (`sheet.ts`, `LabelsDialog.tsx`)                            |
| Tłumaczenia                           | `apps/web/src/i18n/locales/en/*.json`                                                        |
| Builder katalogu, źródła              | `packages/catalog-builder/src/sources/` (Blender Open Data, Docker Hub…)                     |
| E2E                                   | `apps/web/e2e/*.spec.ts` (zrzuty w `apps/web/test-results/`)                                 |
