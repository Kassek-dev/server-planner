# Server Planner — architektura (v0.2)

> Status: **zaakceptowany, v0.2** · Data: 2026-11-11
> Podstawa: `01-funkcjonalnosci.md` v0.3 (D1–D8), `02-model-danych.md` v0.2

---

## 1. Założenia, które kształtują architekturę

| Źródło | Wymaganie architektoniczne                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| D1     | Aplikacja w 100% po stronie przeglądarki. Brak backendu, brak kont. Dane w IndexedDB.                                                |
| D7     | Hosting statyczny (GitHub Pages). Katalog budowany przez osobny skrypt w GitHub Actions, max 1×/tydzień.                             |
| D6     | Publiczne repo, MIT (kod) + CC‑BY‑SA 4.0 (dane katalogu). Projekt hobbystyczny → proste, popularne narzędzia, mało ruchomych części. |
| 02 Z4  | Silniki (walidacja, capacity, symulacja) to czyste funkcje `(Project, Catalog) → Wynik`, niezależne od UI.                           |
| 02 Z1  | Model znormalizowany → wygodny dla niemutowalnych aktualizacji, undo/redo i diffów.                                                  |
| M2/M8  | Interaktywny canvas z setkami elementów i animacją przepływów; ciężkie przeliczenia nie mogą blokować UI.                            |

**Cele niefunkcjonalne:**

| Obszar         | Cel                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------ |
| Skala projektu | do ~300 urządzeń, ~2 000 interfejsów, ~500 workloadów bez odczuwalnych spowolnień          |
| Responsywność  | przeciąganie na canvasie 60 fps; przeliczenie silników < 100 ms po zmianie (w tle)         |
| Start          | pierwsze uruchomienie < 3 s na przeciętnym łączu; kolejne — z cache, działa offline        |
| Przeglądarki   | aktualne Chrome/Edge, Firefox, Safari (desktop). Mobile: tylko podgląd, bez edycji (A1)    |
| Dostępność     | WCAG 2.1 AA dla paneli i formularzy; canvas — obsługa klawiatury dla podstawowych operacji |

---

## 2. Stos technologiczny

Wybór kierowany zasadą: **jedno dobre, popularne narzędzie na problem**. Wersje — aktualne stabilne w chwili startu implementacji. Szczegóły użycia każdego narzędzia (konfiguracja, komendy, reguły): `implementation.md` w katalogu głównym.

| Obszar              | Wybór                                          | Dlaczego                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Język               | **TypeScript** (strict)                        | Model danych z `02` przenosi się 1:1; wspólne typy dla aplikacji i skryptu katalogu.                                                                                                              |
| Build / dev server  | **Vite**                                       | Standard dla SPA, szybki, prosty deploy statyczny.                                                                                                                                                |
| UI                  | **React**                                      | Największy ekosystem; decyduje o tym biblioteka canvasa (niżej).                                                                                                                                  |
| Canvas              | **React Flow** (`@xyflow/react`)               | Gotowe: pan/zoom, siatka + snap, minimapa, zaznaczanie ramką, własne węzły (karta urządzenia) i **uchwyty = porty**, własne krawędzie (kolory VLAN, animacja pakietów). Oszczędza miesiące pracy. |
| Stan                | **Zustand** + **Immer**                        | Prosty store; Immer daje niemutowalne aktualizacje i **patche** → undo/redo i diff snapshotów niemal za darmo.                                                                                    |
| Walidacja schematów | **Zod**                                        | Jeden schemat = typ TS + walidacja importu JSON, katalogu i migracji.                                                                                                                             |
| Przechowywanie      | **IndexedDB** przez `idb`                      | Cienka, typowana nakładka na natywne API; schemat bazy jest prosty (02, rozdz. 10).                                                                                                               |
| Silniki w tle       | **Web Worker** + **Comlink**                   | Przeliczenia poza wątkiem UI; Comlink upraszcza komunikację do wywołań funkcji.                                                                                                                   |
| Adresacja IP        | **ipaddr.js**                                  | Sprawdzona biblioteka do parsowania/porównań CIDR; IPv6 gotowe na P2.                                                                                                                             |
| i18n                | **i18next** + `react-i18next` + `i18next-icu`  | Przestrzenie nazw, leniwe ładowanie, format ICU (01, rozdz. 7).                                                                                                                                   |
| Komponenty UI       | **Radix UI** (prymitywy) + własne style        | Dostępne (a11y) menu, dialogi, popovery, taby — bez narzuconego wyglądu; wygląd z naszego design systemu.                                                                                         |
| Style               | **Tailwind CSS** + tokeny jako zmienne CSS     | Tokeny design systemu (`04`) jako CSS variables → motyw jasny/ciemny przez podmianę zmiennych.                                                                                                    |
| Ikony               | **Lucide**                                     | Spójny, otwarty zestaw; sylwetki urządzeń — własny zestaw w tym samym stylu (`04` § 5).                                                                                                           |
| Fonty               | **IBM Plex Sans / Mono** przez `@fontsource/*` | Self‑hosted: zgodne z CSP i działa offline; bez Google Fonts w runtime.                                                                                                                           |
| Tabele (P1)         | **TanStack Table**                             | Inventory, IP Plan — sortowanie, filtry, edycja inline.                                                                                                                                           |
| Routing             | **React Router** (hash routing)                | GitHub Pages nie obsługuje fallbacku SPA → `#/project/…` działa bez sztuczek.                                                                                                                     |
| Eksport obrazu      | **html-to-image**                              | Metoda rekomendowana przez React Flow dla PNG/SVG.                                                                                                                                                |
| Offline (P1)        | **vite-plugin-pwa**                            | Service worker: aplikacja i katalog dostępne bez sieci.                                                                                                                                           |
| Testy               | **Vitest** (jednostkowe), **Playwright** (E2E) | Silniki testowane intensywnie na fixture'ach; E2E dla głównych ścieżek.                                                                                                                           |
| Lint/format         | **Biome**                                      | Jedno narzędzie zamiast ESLint + Prettier.                                                                                                                                                        |
| Pakiety             | **pnpm** workspaces                            | Monorepo: aplikacja + model + silniki + builder katalogu współdzielą kod.                                                                                                                         |

---

## 3. Struktura repozytorium

```
server-planner/
├── apps/
│   └── web/                         # aplikacja React (SPA)
│       ├── src/
│       │   ├── app/                 # routing, layout, providery
│       │   ├── features/            # moduły funkcjonalne (01, rozdz. 3)
│       │   │   ├── projects/        # M1 — lista, import/eksport, snapshoty
│       │   │   ├── canvas/          # M2 — React Flow, węzły, krawędzie, nakładki
│       │   │   ├── inspector/       # panel właściwości (formularze per typ encji)
│       │   │   ├── library/         # M3 — biblioteka/katalog urządzeń i aplikacji
│       │   │   ├── network/         # M6 — VLANy, podsieci, strefy, firewall
│       │   │   ├── issues/          # M8a — panel problemów
│       │   │   ├── simulation/      # M8b/c — testy, nakładki, animacja przepływów
│       │   │   ├── capacity/        # M9 — paski, dashboard
│       │   │   ├── export/          # M11
│       │   │   └── settings/        # M12
│       │   ├── store/               # Zustand: projekt, historia, wyniki silników, UI
│       │   ├── persistence/         # IndexedDB, autosave, blokada kart
│       │   ├── catalog/             # ładowanie i aktualizacja katalogu w aplikacji
│       │   ├── workers/             # engine.worker.ts (Comlink)
│       │   ├── ui/                  # komponenty design systemu
│       │   └── i18n/                # 01, rozdz. 7
│       └── public/
├── packages/
│   ├── model/                       # typy + schematy Zod + migracje + fabryki ID
│   ├── engine/                      # silniki: graph, validation, capacity, network, flows
│   └── catalog-builder/             # skrypt Node dla GitHub Actions (adaptery źródeł)
├── catalog/
│   ├── curated/                     # dane kurowane (YAML, edytowane ręcznie / przez PR)
│   │   ├── apps/                    #   jellyfin.yaml, immich.yaml, …
│   │   ├── devices/
│   │   ├── cpus/
│   │   └── os/
│   ├── dist/                        # wynik buildera — generowane, commitowane przez bota
│   ├── state.json                   # data ostatniego udanego pobrania (blokada 7 dni)
│   └── LICENSE                      # CC-BY-SA-4.0
├── fixtures/                        # przykładowe projekty do testów i migracji
├── docs/                            # ta dokumentacja + ADR
├── .github/workflows/
│   ├── ci.yml                       # lint, typecheck, testy przy każdym PR
│   ├── deploy.yml                   # build + GitHub Pages po push na main
│   └── catalog-update.yml           # cron 1×/tydzień
└── LICENSE                          # MIT
```

**Reguła zależności (wymuszana lintem):**

```
apps/web ──► packages/engine ──► packages/model
    │                                 ▲
    └─────────────────────────────────┘
packages/catalog-builder ──► packages/model
```

`model` i `engine` **nie importują** Reacta, DOM ani IndexedDB — działają w przeglądarce, workerze, Node i testach.

---

## 4. Architektura aplikacji

### 4.1 Przepływ danych

```
                ┌──────────────────────────────────────────────┐
  Użytkownik ──►│  UI (React)                                  │
                │  canvas · inspector · panele · widoki        │
                └───────┬──────────────────────────▲───────────┘
                        │ komenda                  │ subskrypcja (selektory)
                        ▼                          │
                ┌──────────────────┐     ┌─────────┴──────────┐
                │ Warstwa komend   │     │ Store wyników      │
                │ addDevice,       │     │ issues, capacity,  │
                │ connectPorts, …  │     │ internetAccess, …  │
                └───────┬──────────┘     └─────────▲──────────┘
                        │ Immer produce            │ wyniki
                        ▼ (+ patche)               │
                ┌──────────────────┐     ┌─────────┴──────────┐
                │ Store projektu   │────►│ Engine Worker      │
                │ (Project z 02)   │ debounce 150 ms         │
                └──┬────────────┬──┘     │ packages/engine    │
                   │            │        └────────────────────┘
          patche   ▼            ▼ debounce 1 s
           ┌──────────────┐  ┌──────────────┐
           │ Historia     │  │ Autosave     │──► IndexedDB
           │ undo / redo  │  │              │
           └──────────────┘  └──────────────┘
```

### 4.2 Store'y

| Store          | Zawartość                                                                               | Trwałość                                |
| -------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| `projectStore` | aktualny `Project` (02)                                                                 | IndexedDB (autosave)                    |
| `historyStore` | stosy patchy undo/redo (limit np. 200 kroków)                                           | pamięć (opcjonalnie IndexedDB)          |
| `resultsStore` | wyniki silników: `Issue[]`, `CapacityReport[]`, mapa dostępu do internetu, cache testów | pamięć — zawsze wyliczane               |
| `catalogStore` | efektywny katalog (bazowy + pobrany)                                                    | IndexedDB                               |
| `uiStore`      | zaznaczenie, aktywny widok, nakładki, otwarte panele, tryb symulacji                    | pamięć / `localStorage` dla preferencji |

### 4.3 Warstwa komend

**Każda zmiana projektu przechodzi przez nazwaną komendę.** UI nigdy nie modyfikuje store'u bezpośrednio.

```ts
// packages/model — komendy są czystymi funkcjami na drafcie Immera
type Command<P> = (draft: Project, payload: P, ctx: CommandContext) => void;

const deleteDevice: Command<{ id: Id }> = (draft, { id }) => {
  // kaskada utrzymująca integralność referencji:
  //  - interfejsy urządzenia i ich łącza
  //  - workloady (rekurencyjnie), aplikacje, stosy, sieci Dockera
  //  - layout.nodes[id]
  //  - referencje w regułach firewalla / asercjach → oznaczane jako „broken” (nie usuwane po cichu)
};
```

Dlaczego:

- **Integralność**: kaskady i niezmienniki w jednym miejscu (np. „vNIC bez linku nie istnieje”, 02 rozdz. 6.1).
- **Undo/redo**: jedna komenda = jeden krok historii (z grupowaniem: przeciąganie wielu elementów = jeden krok).
- **Testowalność**: komendy testowane bez UI.
- Komendy żyją w `packages/model` — skrypt katalogu i testy mogą budować projekty tym samym API.

### 4.4 Undo/redo

Immer `produceWithPatches` zwraca `patches` i `inversePatches`. Historia przechowuje pary; undo = `applyPatches(state, inverse)`. Zmiany ciągłe (przeciąganie, wpisywanie w pole) są **scalane** w jeden wpis po zakończeniu gestu / po 500 ms bezczynności.

### 4.5 Canvas (React Flow)

| Element modelu                   | Reprezentacja w React Flow                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Device                           | własny węzeł `DeviceNode`: ikona, nazwa, badge statusu (capacity, internet, issues), rozwijana lista workloadów                          |
| Interface fizyczny               | `Handle` na krawędzi węzła; przy wielu portach — uchwyt zbiorczy + wybór portu z listy (CAN‑04)                                          |
| Link fizyczny                    | własna krawędź `LinkEdge`: kolor wg nakładki, etykieta, animacja pakietów (FLW‑04)                                                       |
| Location (room/shelf/rack), Note | węzły typu `location` (React Flow parent node; urządzenia jako child nodes z `parentId`) / `note`; w racku pozycja dziecka wyliczana z U |
| Workload, App, vNIC              | **nie są węzłami** (02 rozdz. 7)                                                                                                         |

- Pozycje z `layout.nodes` w **jednostkach siatki** → mnożone przez rozmiar komórki przy renderowaniu.
- React Flow trzyma tylko stan widoku; źródłem prawdy jest `projectStore` (węzły/krawędzie wyliczane selektorem z memoizacją).
- Animacja przepływu: SVG `animateMotion` po ścieżce krawędzi, sterowana osią czasu z `FlowRunResult`.

---

## 5. Silniki (`packages/engine`)

### 5.1 Potok przeliczeń

```
Project + Catalog
      │
      ▼
 1. buildGraph()          indeksy pochodne: interfejsy per właściciel, sąsiedztwo łączy,
      │                   IP → interfejs, podsieć per interfejs, efektywny VLAN portu,
      │                   drzewo hostów (device → VM/LXC → kontener), mapa stref
      ▼
 2. analyzeL2()           domeny rozgłoszeniowe: dla każdego VLANu spójne składowe grafu
      │                   po łączach, które go przenoszą (access/trunk/native)
      ▼
 3. analyzeL3()           interfejsy L3 routerów, trasy bezpośrednie + statyczne,
      │                   brama dla każdej podsieci
      ▼
 4. równolegle:
    ├─ validate()         reguły VAL-xx → Issue[]
    ├─ capacity()         rekurencyjny bilans per host → CapacityReport[]
    └─ accessSummary()    dostęp do internetu per element (SIM-02), widok klienta (SIM-03)
```

Kroki 1–3 to **`EngineContext`** — wspólny dla wszystkich analiz i zapytań na żądanie (test A → B, przepływ).

### 5.2 Walidacja — rejestr reguł

```ts
interface ValidationRule {
  code: string; // "VAL_01"
  severity: Issue['severity'];
  run(ctx: EngineContext): Issue[];
}
export const rules: ValidationRule[] = [duplicateIp, ipOutsideSubnet /* … */];
```

Nowa reguła = nowy plik + wpis w rejestrze + klucze w `en/issues.json` + test na fixture'ach. Kontrola w CI: każda reguła ma tłumaczenie.

### 5.3 Symulacja sieci

Implementacja modelu z `01`, rozdz. 8d:

```ts
function reach(
  ctx: EngineContext,
  q: {
    from: EntityRef;
    to: EntityRef | 'internet';
    protocol: Protocol;
    port?: number;
  },
): ReachabilityResult;
```

- **Rozwiązanie końcówek**: aplikacja → runtime → (NAT Dockera / macvlan) → vNIC → bridge → port fizyczny.
- **L2**: BFS po grafie z predykatem „łącze przenosi VLAN v” — wynik z `analyzeL2` (cache).
- **L3**: router z interfejsem w podsieci źródła → wybór trasy (najdłuższy prefiks) → firewall (first match, `Endpoint` rozwijany do zbioru IP/portów) → NAT → L2 w podsieci celu.
- **Cel**: listener aplikacji + mapowanie portów Dockera.
- Każdy krok dopisuje `SimStep` z kodem i parametrami (bez tekstu — i18n).
- **Przepływy (FLW)**: `runFlow(ctx, flow, bindings)` = sekwencja wywołań `reach()` dla kroków `CatalogFlow` (+ krok DNS, gdy `resolveDns`).
- **Macierz (SIM‑04)**: `reach()` dla par reprezentantów stref; wynik cache'owany do następnej zmiany projektu.

### 5.4 Capacity

Rekurencja po drzewie hostów (02 rozdz. 5): dla każdego węzła `capacity = zasoby − narzut OS − rezerwy`, `used = Σ dzieci` (przydział lub przewidywane użycie). Formuły w `01` rozdz. M9. Wyniki per zasób z `breakdown` — UI pokazuje „kto zużywa”.

### 5.5 Wykonanie w workerze

- Worker trzyma ostatni `Project` i `EngineContext`.
- Po zmianie (debounce 150 ms) główny wątek wysyła nowy projekt (structured clone — dla projektu ~1 MB to pojedyncze ms) → worker przelicza → zwraca wyniki → `resultsStore`.
- Zapytania na żądanie (`reach`, `runFlow`) idą do tego samego workera i korzystają z aktualnego kontekstu.
- **Optymalizacja później, nie teraz**: jeśli pomiary pokażą problem, dodajemy przeliczenia przyrostowe (np. zmiana pozycji na canvasie nie unieważnia analiz — już na starcie pomijamy zmiany wyłącznie w `layout`).

---

## 6. Przechowywanie i cykl życia projektu

| Zdarzenie             | Działanie                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Zmiana projektu       | autosave do IndexedDB (debounce 1 s), aktualizacja `updatedAt` i miniatury (rzadziej)                                                     |
| Pierwsze uruchomienie | `navigator.storage.persist()` + komunikat, czemu (PRJ‑05)                                                                                 |
| Otwarcie projektu     | migracja schematu jeśli trzeba (kopia sprzed migracji zostaje), blokada w `locks` + `BroadcastChannel` do wykrycia drugiej karty (PRJ‑06) |
| Eksport               | `ProjectFile` (02 rozdz. 3) → plik `.json`                                                                                                |
| Import                | parsowanie → wykrycie `schemaVersion` → migracje → walidacja Zod → nowy projekt (nowe `id`, jeśli konflikt)                               |
| Przypomnienie         | po N dniach / M zmianach od ostatniego eksportu — baner „Export a backup”                                                                 |

---

## 7. Katalog

### 7.1 Builder (`packages/catalog-builder`, Node)

```ts
interface SourceAdapter {
  id: string; // "awesome-selfhosted"
  name: string;
  url: string;
  license: string;
  fetch(): Promise<unknown>; // pobranie surowych danych
  normalize(raw: unknown): SourceRecord[]; // mapowanie na fragmenty CatalogApp/CatalogDevice
}
```

Kroki uruchomienia:

1. **Blokada 7 dni**: odczyt `catalog/state.json`; jeśli < 7 dni od ostatniego udanego pobrania i brak `--force` → koniec.
2. Każdy adapter niezależnie: `fetch` → `normalize` → walidacja Zod per rekord. Błąd adaptera = źródło `failed`, używane dane z poprzedniej wersji `dist`.
3. **Scalanie**: rekordy z różnych źródeł łączone po kluczu (slug aplikacji / producent+model); priorytet: `curated` > źródło o wyższym priorytecie > reszta. Pole `source[]` zbiera pochodzenie.
4. Generowanie wzorców ruchu `estimated` dla aplikacji bez kurowanych (01 rozdz. 5.2).
5. **Bezpieczniki**: spadek liczby rekordów źródła > 20% lub odsetek błędów > progu → przerwanie z kodem błędu (workflow zakłada Issue).
6. Zapis `dist/*.json`, `manifest.json` (SHA‑256), `CHANGELOG.json`, aktualizacja `state.json`.

Implementacja (2026-11-12): `packages/catalog-builder/src/build.ts` (CLI `--force`, `--only <id>`, `--dry-run`; kody wyjścia 0 / 1 / 2 = bezpiecznik), adaptery w `src/sources/`, scalanie w `src/merge.ts`. `catalog/dist` zawiera **tylko dane z buildera**: `apps.json` (aplikacje importowane — obraz z LinuxServer.io wzbogacony opisem z awesome‑selfhosted i zasobami z Community Scripts; aplikacje kurowane zawsze wygrywają i nie trafiają do `dist`), `perf.json` (ranking CPU), `manifest.json`, `CHANGELOG.json`; blokada w `catalog/state.json`. Przy awarii któregokolwiek źródła aplikacji zostaje poprzednie `apps.json` (status `stale`). Heurystyki i aliasy: `catalog/curated/heuristics.yml`, `app-aliases.yml`.

### 7.2 Workflow `catalog-update.yml`

```yaml
on:
  schedule:
    - cron: "0 3 * * 1" # poniedziałek 03:00 UTC
  workflow_dispatch:
    inputs:
      force: { type: boolean, default: false }
# kroki: checkout → pnpm install → catalog-builder [--force]
#   ok i są zmiany → commit "catalog: 2026.46" do main → wyzwala deploy.yml
#   bezpiecznik    → gh issue create z raportem, brak commita
#   brak zmian     → nic
# sekrety: GITHUB_TOKEN (commit, issue, uruchomienie deploy.yml — push tokenem GITHUB_TOKEN nie wyzwala innych workflowów)
# DOCKERHUB_TOKEN — opcjonalny, gdy dojdzie adapter Docker Hub
# limit czasu: 30 min; adapter Blender Open Data parsuje zrzut JSON strumieniowo (bez ładowania całości do pamięci)
```

Adaptery, licencje i budżety zapytań: `06-zrodla-danych.md`.

### 7.3 Katalog w aplikacji

- **Warstwa bazowa**: w czasie buildu aplikacji `catalog/dist` (+ `curated`) jest dołączany jako osobny, leniwie ładowany chunk → działa offline od pierwszego uruchomienia. Implementacja (MVP): wtyczka Vite z `packages/catalog-builder/src/vite.ts` udostępnia moduł `virtual:catalog` — `loadCurated()` czyta YAML, zamienia jednostki, rozwiązuje referencje CPU i waliduje schematami `Catalog*` z `packages/model`; błędne dane przerywają build. Aplikacja ładuje go przez `import('virtual:catalog')` (`apps/web/src/catalog/store.ts`).
- **Katalog efektywny (2026-11-12)**: `withDist(curated, dist)` w `packages/model/src/catalog.ts` — aplikacje importowane dołączają do kurowanych (kurowane wygrywają), CPU (także w modelach urządzeń) dostają `perf` z `perf.json`, wersja i `sources` z manifestu. Wtyczka Vite eksportuje `{ curated, dist }` i kopiuje pliki `dist` do buildu pod `catalog/`; aplikacja (`apps/web/src/catalog/updates.ts`) porównuje wersje, przy nowszej pobiera pliki, sprawdza SHA‑256 i Zod oraz `minAppVersion` i trzyma bieżącą + poprzednią wersję w IndexedDB (`settings` → `catalog`).
- **Silniki a katalog**: dane katalogu, których potrzebują silniki (narzut OS), przechodzą jako `EngineOptions` do `analyze(project, options)` — silnik nie importuje katalogu.
- **Aktualizacja** (CAT‑04): `GET /catalog/manifest.json` (ten sam origin na GitHub Pages — brak CORS) → porównanie `catalogVersion` → pobranie zmienionych plików → weryfikacja SHA‑256 i Zod → zapis do IndexedDB (trzymane 2 wersje).
- Auto‑sprawdzenie przy starcie najwyżej co 7 dni (data w `settings`); przycisk wymusza tylko sprawdzenie manifestu.
- `minAppVersion` w manifeście chroni starą wersję aplikacji przed nowym, niezgodnym schematem.

---

## 8. Build, CI i deploy

| Workflow             | Wyzwalacz                | Kroki                                                                                                                                                                                                |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`             | PR, push                 | Biome, zakaz surowej palety Tailwind (tylko tokeny), test kontrastu `tokens.json`, `tsc --noEmit`, Vitest, kontrola i18n (brakujące/nieużywane klucze), walidacja `catalog/curated` schematem, build |
| `deploy.yml`         | push na `main`           | build `apps/web` (z katalogiem) → GitHub Pages; Playwright smoke test na buildzie                                                                                                                    |
| `catalog-update.yml` | cron 1×/tydzień, ręcznie | rozdz. 7.2                                                                                                                                                                                           |

Wersjonowanie aplikacji: SemVer, `0.x` do wydania MVP. Changelog generowany z konwencji commitów (Conventional Commits).

---

## 9. Testy

| Poziom   | Zakres                                                                                                                                                                   | Narzędzie                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Model    | schematy, komendy (kaskady, niezmienniki), migracje na fixture'ach z każdej wersji                                                                                       | Vitest                   |
| Silniki  | **każda reguła walidacji**, capacity, symulacja — na małych, czytelnych projektach w `fixtures/` (np. `vlan-mismatch.json`, `iot-isolated.json`) z oczekiwanymi wynikami | Vitest                   |
| Builder  | adaptery na zapisanych próbkach odpowiedzi źródeł (bez sieci), bezpieczniki                                                                                              | Vitest                   |
| UI       | kluczowe komponenty formularzy i inspectora                                                                                                                              | Vitest + Testing Library |
| Wizualne | trasa `#/dev/design` (wszystkie komponenty i stany, oba motywy) → zrzuty porównywane w Playwright                                                                        | Playwright               |
| E2E      | ścieżki A i B z `01` rozdz. 4: nowy projekt → urządzenia → łącza → VLANy → aplikacje → wynik capacity i test osiągalności → eksport/import                               | Playwright               |

Silniki to serce produktu — tu celujemy w najwyższe pokrycie. Każdy zgłoszony błąd symulacji = nowy fixture.

---

## 10. Bezpieczeństwo i prywatność

- Brak telemetrii, brak zewnętrznych skryptów, brak cookies. Jedyne zapytania sieciowe: pliki aplikacji i katalogu z tego samego originu.
- Import JSON: walidacja Zod, limit rozmiaru pliku, brak `eval`/HTML z danych. Teksty użytkownika renderowane wyłącznie jako tekst.
- Content Security Policy (meta tag): `default-src 'self'`, bez `unsafe-eval`.
- Linki zewnętrzne z katalogu: `rel="noopener noreferrer"`, tylko `https:`.
- Integralność katalogu: SHA‑256 z manifestu.

---

## 11. Kolejność implementacji MVP

| Etap               | Zakres                                                                                | Efekt                                             |
| ------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0. Fundament       | monorepo, Vite, TS, Biome, CI, deploy pustej aplikacji, i18n, tokeny design systemu   | działający pipeline i pusty ekran na GitHub Pages |
| 1. Model           | `packages/model`: typy, Zod, komendy, migracje v1, fixtures                           | API do budowania projektów w testach              |
| 2. Persystencja    | IndexedDB, lista projektów, autosave, import/eksport, undo/redo                       | M1 (PRJ‑01…05)                                    |
| 3. Canvas          | React Flow, węzły urządzeń, porty, łącza, siatka, zaznaczanie                         | M2 (CAN‑01…05)                                    |
| 4. Inspector       | formularze: sprzęt, OS, VM/LXC, kontenery, interfejsy, VLAN/podsieci/strefy, firewall | M4, M5, M6                                        |
| 5. Silniki I       | `buildGraph`, L2/L3, walidacja, capacity, worker                                      | M8a, M9 (P0), panel Issues                        |
| 6. Silniki II      | `reach()`, dostęp do internetu, widok klienta, nakładki                               | SIM‑01…03, CAN‑06                                 |
| 7. Katalog         | `catalog/curated` (~50 aplikacji, typy urządzeń, OS), warstwa bazowa w aplikacji      | CAT‑01/02, LIB‑01                                 |
| 8. Eksport i szlif | PNG/SVG, ustawienia, motyw, testy E2E                                                 | MVP gotowe                                        |

Builder katalogu i workflow tygodniowy (CAT‑03/04) — pierwszy etap wersji 1.1 (MVP = wydanie 1.0.0, D10).

---

## 12. Decyzje architektoniczne (ADR)

Każda istotna decyzja zapisywana jako krótki ADR w `docs/adr/NNN-tytul.md` (kontekst → decyzja → konsekwencje). Startowy zestaw:

| ADR | Decyzja                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------- |
| 001 | SPA bez backendu, dane w IndexedDB (D1)                                                                    |
| 002 | React + React Flow jako podstawa edytora                                                                   |
| 003 | Zustand + Immer, komendy i undo/redo na patchach                                                           |
| 004 | Silniki jako czyste funkcje w osobnym pakiecie, wykonywane w Web Workerze                                  |
| 005 | Monorepo pnpm: `web`, `model`, `engine`, `catalog-builder`                                                 |
| 006 | Katalog: dane kurowane w YAML + builder w GitHub Actions 1×/tydzień, auto‑publikacja z bezpiecznikami (D7) |
| 007 | Hash routing (GitHub Pages)                                                                                |

---

## 13. Rozstrzygnięte kwestie

| #   | Kwestia                           | Decyzja                                                                                                                                                                                                                                                                          |
| --- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Mobile                            | **Tylko podgląd** projektu na telefonie; edycja wyłącznie na desktopie.                                                                                                                                                                                                          |
| A2  | Format danych kurowanych katalogu | **YAML** w `catalog/curated/`; builder konwertuje do JSON w `catalog/dist/`.                                                                                                                                                                                                     |
| A3  | Adres aplikacji                   | **Darmowy adres GitHub Pages**: `https://<użytkownik>.github.io/server-planner/` (HTTPS w cenie). Ścieżka bazowa ustawiona w Vite (`base: '/server-planner/'`). Własna domena możliwa później — zmiana konfiguracji Pages, `base` i pliku `CNAME`, bez zmian w kodzie aplikacji. |
