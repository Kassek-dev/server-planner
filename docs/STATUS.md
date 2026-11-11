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

- [x] React Flow (kontrolowany; źródłem prawdy jest sesja): siatka 16 px, zoom 10–200 %, własne kontrolki zoomu, zoom semantyczny (porty i meta znikają < 60 %)
- [x] Kafelki (LOC‑02): wiersz w racku (wysokość z U), front z uszami poza rackiem, karta z sylwetką i nóżkami, pigułka AP, klient, węzeł Internet, chip na półce w racku; porty kolorowane wg VLAN/trunk/WAN
- [x] Lokalizacje (LOC‑03/04): pomieszczenie, półka, rack z szyną U, półkami i „nU free”; przeciąganie urządzeń do/z lokalizacji, przyciąganie do najbliższego wolnego U, odrzucenia (zajęte, 19″ w 10″, brak półki) z komunikatem
- [x] Biblioteka (LIB‑01): sekcje Rack‑mount / Standalone / Clients / Locations, przeciąganie lub klik (klawiatura) → środek widoku; pusty stan T‑02
- [x] Łączenie (CAN‑04): przeciągnięcie z uchwytu na kafelek → automatyczny wybór wolnych zgodnych portów (Wi‑Fi dla AP↔klient, WAN do Internetu); uchwyty z 4 stron, łącza ze stron zwróconych do siebie, style z `04` § 6.6
- [x] Zaznaczanie i edycja (CAN‑03): klik, Shift, ramka; Delete (jeden krok undo), Ctrl+D / Ctrl+C+V (duplikat bez kabli i IP), Ctrl+A, Esc; zaznaczenie w `?sel=`
- [x] Panel zaznaczenia (CAN‑05, podstawowy): nazwa, forma, lokalizacja (z wyborem racka), porty, łącze, wiele elementów, podsumowanie projektu
- [x] Miniatury projektów (PRJ‑02): schemat SVG liczony z układu przy zapisie
- [x] Model: `checkRackFit`, `nearestFreeU`, `rackOccupancy`, `findConnectablePorts`, komenda `device.duplicate`; sesja: `transaction` (wiele komend = jeden krok)
- [x] Edytor ładowany leniwie (główny chunk 116 kB gzip); testy: 105 jednostkowych + E2E 8/8
- [ ] Trasowanie łączy z punktami pośrednimi i wyrównywanie (CAN‑08, P1); wybór konkretnego portu przy łączeniu (dziś: automatyczny) — w inspectorze łącza, etap 4

## Etap 4 — Inspector

- [x] **4a — inspector** (I‑02…I‑07):
  - I‑02 urządzenie: zakładki Hardware / Software / Network (aktywna w `?tab=`); nazwa, hostname; forma (rack U/szerokość, kafelki kształtu jako natywne radio), lokalizacja; CPU, RAM (moduły, sloty, max), dyski, pule, zasilanie
  - Software: OS + wersja (`device.setOs` — Proxmox tworzy `vmbr0`), Docker na hoście, drzewo workloadów, dodawanie VM/LXC (z vNIC na moście), kontenera, aplikacji
  - Network: interfejsy (access/trunk, VLANy, IP z dopasowaniem podsieci, most, tag VLAN), VLAN‑sub‑interfejsy routera, mosty hosta, trasy, NAT, SSID na AP
  - I‑03 workload (VM/LXC/kontener) ze ścieżką, zasobami, vNIC, obrazem, portami, wolumenami, limitami; I‑04 aplikacja; I‑05 łącze (zmiana portów, kabel); I‑06 lokalizacja (półki w racku, rodzic); I‑07 wiele
  - Odrzucenia komend jako przetłumaczony komunikat w panelu; kontrolki UI: Select, Segmented, Tabs, Checkbox; rozmiary „16 GiB”
  - Łącza zawsze pod kafelkami (`zIndexMode="manual"`) — wcześniej kable zasłaniały urządzenia w racku
  - Model: `device.setOs`, `route.update`, `subnetForAddress`, `isValidIp/Cidr`
- [x] **4b — szuflady** (panel 720 px nad canvasem, `?panel=`):
  - S‑01 VLANs / Subnets / Zones: kolor z palety, VID (bez duplikatów), CIDR, VLAN, strefa, brama, DNS (aplikacja lub IP), domena, DHCP z zakresem; strefy WAN/wewnętrzne
  - S‑02 Firewall rules: polityka domyślna, reguły w kolejności (przesuwanie przyciskami), akcja, protokół, porty „80,443,8000‑8100”, źródło/cel (any, Internet, strefa, podsieć, urządzenie, workload, aplikacja, CIDR); NAT: masquerade i przekierowania portów
  - S‑03 Tags (liczba użyć, przypisywanie w inspectorze urządzenia), S‑04 Project settings (progi, overcommit, rezerwa, waluta, cena energii)
  - Wejścia: szybkie akcje w podsumowaniu projektu, „Open firewall rules” w zakładce Network routera
  - Model: `nat.update`; testy: 121 jednostkowych + E2E 14/14

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
| 2026-11-11 | Etap 3: canvas (React Flow), kafelki, lokalizacje i rack, biblioteka, łączenie, zaznaczanie, panel, miniatury | — |
| 2026-11-11 | Etap 4a: inspector (urządzenie z zakładkami, workloady, aplikacje, łącza, lokalizacje) | — |
| 2026-11-11 | Etap 4b: szuflady VLAN/podsieci/strefy, firewall + NAT, tagi, ustawienia projektu — etap 4 zamknięty | — |
