# Status implementacji

> Aktualizowany przy każdym zapisie postępu (skill `commit`). Etapy: `03-architektura.md` § 11. Widoki: `07-mapa-widokow.md`.

## Faza projektowa — zakończona (2026-11-11)

- [x] `01` funkcjonalności v0.4 (D1–D9)
- [x] `02` model danych v0.3
- [x] `03` architektura v0.2
- [x] `04` design system v0.1
- [x] `05` projekt UI v0.2 (2026-11-12: UI1–UI3 rozstrzygnięte)
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

- [x] Kontekst silnika (indeksy grafu, VLAN-y niesione przez porty), `analyze()` z pominięciem przeliczeń przy zmianach samego układu
- [x] Walidacja: VAL‑01…11, 13, 14, rack, referencje reguł/NAT/DNS; automatyczne poprawki (Fix) przez rejestr komend
- [x] Capacity (tryb „allocated”): CPU, RAM (z narzutem OS i ZFS ARC), pule (RAID, rezerwa), rekurencyjnie VM/LXC
- [x] Web Worker (Comlink) z debounce 150 ms; panel Issues (X‑02), liczniki w top barze, diody LED i pasek RAM na kafelkach, zakładka Capacity
- Uwagi: VAL‑04 obejmuje też VLAN-y SSID nieprzepuszczane na uplinku AP; `OS_OVERHEAD` w `packages/engine/src/defaults.ts` tymczasowo — do przeniesienia do katalogu w etapie 7

## Etap 6 — Silniki II

- [x] `reach()` (SIM‑01): końcówki (aplikacja → kontener/Docker → vNIC → bridge → port), L2 z VLAN-ami portów (access/trunk/native, SSID na AP, bridge'e), L3 (brama, trasy bezpośrednie i statyczne bez kolejnych routerów), firewall (first match, polityka domyślna, ruch wewnątrz strefy), NAT (masquerade), publikacja portów Dockera, nasłuch aplikacji; ścieżka i „Suggest fix” (`firewall.addRule`)
- [x] Dostęp do internetu (SIM‑02) w `analyze()` — sondy tcp/443, tcp/80, udp/53, icmp → full / partial / none
- [x] Widok klienta „Visible from” (SIM‑03) — zapytanie na żądanie w workerze
- [x] Panel Simulation (X‑01a Reachability, X‑01b Access) pod `?panel=sim&sim=…&from=…&to=…&proto=…&port=…`, karta wyniku (O‑08), wygaszanie poza ścieżką, przepływ na łączach, plakietki ✓/◐/✕ (O‑09), podgląd poprawki (D‑08), Esc zamyka
- [x] Nakładki CAN‑06: łącza wg typu / prędkości (z legendą), urządzenia wg strefy / tagu / stanu capacity
- Uwagi: wieloskokowy routing przez kilka routerów daje werdykt „unknown” (`SIM_L3_NEXT_HOP_UNSUPPORTED`); DNS jako krok symulacji dopiero z przepływami (FLW, P1); „Save as assertion” (SIM‑06) to P1

## Etap 7 — Katalog

- [x] 7a: schematy `Catalog*` w `packages/model`, `loadCurated()` + `pnpm catalog:validate` (YAML → jednostki → referencje CPU → Zod, kontrola id = nazwa pliku, unikalność wzorców i przepływów)
- [x] 7a: warstwa kurowana — 59 aplikacji (wzorce ruchu + co najmniej jeden przepływ na aplikację z UI), 19 modeli sprzętu, 11 CPU, 4 OS
- [x] 7a: warstwa bazowa w aplikacji (`virtual:catalog`, osobny chunk), narzut OS z katalogu (`EngineOptions`), usunięta tymczasowa tabela `OS_OVERHEAD`
- [x] 7b: komendy `device.applyModel` (sprzęt, porty po pozycji z zachowaniem kabli, forma; urządzenie, które przestaje pasować do slotu racka, opuszcza go) i `app.addFromCatalog` (kontener na komponent, stos, AppInstance na komponent, zależności spięte z komponentami, włączenie Dockera i sieci bridge), `publishedPorts`
- [x] 7b: D‑05 wybór modelu (filtry typ/producent, wyszukiwarka, tabela CPU/RAM/NIC/pobór) — z biblioteki (nowe urządzenie) i z Hardware › Model
- [x] 7b: D‑06 katalog aplikacji (kategorie, wyszukiwarka, multi‑select, szczegóły: stos, wymagania, ruch, źródła; wiele naraz → wybrany host) — z Software › Add app from catalog i z biblioteki
- [x] 7b: D‑07 kreator Where / Ports & storage / Network (konflikty portów z propozycją wolnego, pule i rozmiary wolumenów, sieć Docker; ostrzeżenie o Dockerze na Proxmoksie)
- Uwagi: toast „… added · Undo” (O‑12) jeszcze nie istnieje — cofnięcie przez Ctrl+Z działa jednym krokiem; kolumna PERF w D‑05 dojdzie z danymi Blender Open Data (builder, wersja 1.1)

## Etap 8 — Eksport i szlif

- [x] 8a: toasty z Undo (O‑12) — sesja zgłasza zatwierdzone kroki (`onCommit`), `describeCommit` wybiera: usunięcia (UI3, z nazwami), auto‑Internet (UI2), aplikacje z katalogu; Undo tylko gdy krok jest wciąż ostatni
- [x] 8a: UI2 — pierwszy router/firewall bez węzła Internet dostaje Internet podłączony do WAN (osobny krok `canvas.addInternet`)
- [x] 8a: Settings (P‑02): Appearance (motyw System/Dark/Light), Storage (zużycie, persist, eksport wszystkich, usunięcie wszystkich danych z potwierdzeniem); Catalog i Units — informacyjnie (P1 w 1.1)
- [x] 8a: About (P‑03): Overview, Data sources (warstwa kurowana w użyciu, pozostałe źródła „planned 1.1”), Licenses — lista zależności generowana przy buildzie (`apps/web/plugins/licenses.ts`, `virtual:licenses`)
- [x] 8b: D‑04 Export — PNG (2×) / SVG / JSON, zakres cały canvas / zaznaczenie, tło Dark/Light niezależne od motywu UI (`html-to-image`, viewport React Flow)
- [x] 8b: E2E ścieżek A (nowy lab od zera) i B („czy mój sprzęt to uciągnie?”) z `docs/05` § 6; przycisk „Add apps from catalog” w zakładce Capacity
- [x] 8b: kliknięcie w zaznaczony kafelek wraca ze szczegółów aplikacji/workloadu do inspektora urządzenia
- Poza MVP (P1, wersja 1.1): builder katalogu i aktualizacje (CAT‑03/04), Settings › Catalog/Units, PWA/offline, Inventory/IP Plan/Access, asercje, przepływy (FLW)
- Katalog: dane kurowane zostają `curated`; użytkownik przejrzy je później (2026-11-12)

## Wersja 1.1 — plan (2026-11-12), wydana jako v1.1.0

Kolejność ustalona z użytkownikiem: najpierw etapy 9 i 10, potem rozbudowa katalogu (11); dalsza kolejność do decyzji. Funkcje częściowo zrobione w MVP: LOC‑05/07, CAP‑04 (per projekt), LIB‑02, SW‑10, HW‑08 (pole w modelu).

### Etap 9 — Widoki tabelaryczne i eksporty (pakiet 3)

- [x] 9a: przełącznik widoków w top barze (Topology / Inventory / IP Plan) z trasami `#/p/:id/inventory`, `#/p/:id/ip`; inspector i szuflady wspólne dla widoków
- [x] 9a: Inventory (V‑03, VIEW‑02): TanStack Table — urządzenia / workloady / aplikacje, sortowanie, filtr, grupowanie po lokalizacji, edycja inline (nazwa, lokalizacja, tagi), kolumny Internet i Capacity z silników, zaznaczenie wiersza = zaznaczenie w projekcie (tagi: edycja w inspektorze)
- [x] 9b: IP Plan (V‑04, VIEW‑03, NET‑04): karty podsieci z pulą DHCP, tabela adresów (IP, host, interfejs, typ, konflikt), wolne zakresy
- [x] 9c: eksporty w D‑04 (dialog dostępny w każdym widoku; obraz wymaga Topology): CSV inwentarza i planu IP (EXP‑04), BOM do CSV (EXP‑03), dokumentacja do Markdown (EXP‑05), `docker-compose.yml` per stos / host (EXP‑06, SW‑13)

### Etap 10 — Katalog „żywy” (pakiet 4)

- [x] 10a: `catalog-builder`: interfejs `SourceAdapter`, blokada 7 dni (`catalog/state.json`), scalanie (curated > źródła), bezpieczniki (spadek > 20%), `catalog/dist` + `manifest.json` z SHA‑256, `CHANGELOG.json`
- [x] 10b: adaptery (zweryfikowane na żywo 2026-11-12: 203 obrazy LSIO, 766 aplikacji ASD z Dockerem, 648 skryptów CS, 1313 CPU z Blendera → 184 aplikacje importowane): awesome‑selfhosted‑data (lista, opisy, licencje), LinuxServer.io API (porty, wolumeny, architektury), Proxmox VE Community Scripts (zasoby), Blender Open Data (wydajność CPU, aliasy)
- [x] 10c: workflow `catalog-update.yml` (cron 1×/tydzień, ręczne uruchomienie, commit `chore(catalog): RRRR.TT`, Issue przy awarii)
- [x] 10d: aplikacja (`withDist` w `packages/model`, `catalog/updates.ts`, pliki `dist` publikowane pod `<app>/catalog/`): katalog efektywny = bazowy + pobrany (IndexedDB, 2 wersje), sprawdzenie przy starcie max 1×/7 dni, Settings › Catalog (wersja, źródła, Check now, Roll back), About › Data sources z datami pobrania; kolumna PERF w D‑05

### Etap 11 — Rozbudowa katalogu aplikacji do ~200

- [x] Przegląd popularnych aplikacji home lab (2026-11-12): ranking 766 aplikacji z awesome‑selfhosted (Docker) po gwiazdkach GitHuba + porównanie z katalogiem; ranking faworyzuje narzędzia deweloperskie/biznesowe, więc wybór filtrowany pod kątem home labów
- [x] 63 nowe wpisy kurowane (AI, notatki, zakładki, dashboardy, powiadomienia, SSO, VPN, DNS, monitoring, Docker, media, pliki, backup, finanse, komunikacja, automatyka domowa, Git) → 122 kurowane
- [x] Import odchudzony: bez aplikacji desktopowych w przeglądarce (KasmVNC „desktop gui”, 92 obrazy) i bez obrazów tylko z LinuxServer.io poniżej 10 000 pobrań/mies. → 73 importowane; razem **195 aplikacji**; flaga `--accept-drop` dla zamierzonych spadków

### Etap 12 — Przepływy ruchu (pakiet 1): FLW‑01…05

- [x] Silnik `runFlow()` (`packages/engine/src/simulation/flow.ts`): kroki procesu z katalogu → wywołania `reach()`; port celu z listenera o danym `purpose` (opublikowany port Dockera); krok DNS do serwera DNS podsieci źródła przy `resolveDns`; kroki opcjonalne bez uczestnika pomijane; brak uczestnika roli wymaganej → `SIM_FLOW_UNBOUND`
- [x] FLW‑01/02 (`features/simulation/flows.ts`): aplikacje projektu z procesami (po `catalogRef`, zapasowo po nazwie), kandydaci ról (klienci LAN, typy urządzeń, zależności po `provides`, magazyn → NAS, komponenty stosu), domyślne propozycje
- [x] X‑01c Flows w panelu symulacji, lista kroków z przyczynami; O‑10 oś kroków na canvasie z ⏮ ⏯ ⏭ — każdy krok podświetla ścieżkę, zablokowany zatrzymuje odtwarzanie (FLW‑04/05)
- Uwagi: ruch z internetu (np. VPN) wymaga etapu 13 (SIM‑05) — taki krok ma wynik „unknown”; obciążenie łączy (FLW‑06/07) to P2

### Etap 13 — Dostęp i bezpieczeństwo sieci (pakiet 2): SIM‑04/05/06, NET‑10/11, widok Access (V‑05)

- [x] SIM‑05 `exposure()`: każdy port forward symulowany od internetu (WAN → DNAT → firewall ze strefą WAN → cel); kroki `SIM_INTERNET_INBOUND`, `SIM_NAT_PORT_FORWARD`, `SIM_NAT_TARGET_MISSING`
- [x] SIM‑06 asercje: komendy `assertion.add/update/delete`, ocena w `analyze()` (`assertions` w wyniku), problem `VAL_ASSERT` (błąd gdy oczekiwano blokady, inaczej ostrzeżenie); źródło „internet” liczone przez ekspozycję
- [x] SIM‑04 `accessMatrix()`: strefa × strefa (+ Internet) lub urządzenie × urządzenie, 5 sond (tcp 443/80/22, udp 53, icmp), jeden reprezentant na stronę; urządzenia infrastruktury (router, switch, AP…) nie reprezentują stref
- [x] V‑05 Access (`#/p/:id/access`, `?matrix=devices`): macierz z podglądem ścieżki komórki, lista „Exposed to the internet”, tabela asercji (włącz/wyłącz, edycja, usuwanie, wynik)
- [x] D‑11 „Save as assertion” w Reachability (wstępnie wypełnione z zapytania i werdyktu)
- [x] NET‑10 kreator „Typical segmentation” (szuflada VLANs › VLANs): komenda `network.applySegmentation` — Mgmt/LAN/IoT/Guest (VLAN 10/20/30/40, `192.168.<vid>.0/24`, DHCP poza Mgmt), strefy (Guest z izolacją), pod‑interfejsy bramy na wybranym porcie trunk, reguły (Mgmt/LAN → any, IoT/Guest → Internet), strefa WAN i masquerade gdy brak
- [x] NET‑11 port forwarding: edycja w szufladzie firewalla (od etapu 4b) + ekspozycja w V‑05
- [ ] NET‑11 reverse proxy (domena → aplikacja) — **odłożone**: wymaga nowej encji w modelu (schemat v2 + migracja + fixture); do zaplanowania osobno

### Etap 14 — Zasilanie i koszty (pakiet 5): HW‑06, CAP‑07/08/09, VAL‑12, SET‑02, Dashboard (V‑02)

- [x] HW‑06 w inspectorze: UPS (VA, W, bateria Wh), budżet PoE switcha, rola PoE portu (PSE/PD, standard af/at/bt, pobór W), zakup (status, cena) — bez zmiany schematu (pola istniały w modelu)
- [x] CAP‑07 silnik `power()` (wynik `analyze().power`): pobór idle/load/oczekiwany (interpolacja wg przydzielonego CPU hosta), urządzenia PoE liczone raz — z własnych danych lub poboru portu (domyślnie maks. standardu), kWh i koszt miesięczny z ceny kWh
- [x] UPS: chroni urządzenia w swojej lokalizacji (rack/półka/pomieszczenie z zawartością); UPS bez lokalizacji — wszystko, czego nie chroni inny UPS; urządzenia PoE liczą się, gdy chroniony jest ich switch; czas pracy = 80% baterii / obciążenie
- [x] CAP‑08 + VAL‑12: budżety PoE, `VAL_12` (przekroczony budżet PoE, błąd) i `VAL_12_UPS` (przeciążony UPS, błąd)
- [x] SET‑02: waluta, cena kWh, progi i overcommity były w ustawieniach od etapu 8a; jednostki stałe (SI)
- [x] V‑02 Dashboard (`#/p/:id/dashboard`, CAP‑09): zasoby łącznie, wykorzystanie per host, problemy, asercje, BOM (do kupienia / opcjonalne), energia, PoE i UPS

### Etap 15 — Planowanie wydajności (pakiet 6): SW‑08/09, CAP‑05/06, HW‑05

- [x] SW‑08 profile obciążenia w katalogu (Jellyfin, Plex, Immich, Frigate, Ollama, Tdarr, Nextcloud, Home Assistant) z parametrami (strumienie, transkodowania, kamery, użytkownicy, rozmiar modelu…); w inspectorze aplikacji wybór profilu i parametrów; domyślnie „typical”; profil dotyczy tylko głównej usługi stosu (rola `app`)
- [x] CAP‑05 tryb **Expected** (`analyze().expected`, przełącznik w zakładce Capacity): aplikacje wg profilu (bez profilu — wymagania zalecane), VM/LXC wg tego, co w nich działa + narzut systemu gościa, nie więcej niż przydział; host bez overcommitu; szacunek mocy (etap 14) liczony z trybu Expected
- [x] SW‑09 + CAP‑06: przyrost wolumenu / miesiąc w inspectorze kontenera; prognoza „full in about N months” per pula
- [x] HW‑05: sekcja GPU w Hardware (model, VRAM, funkcje QuickSync/NVENC/VCN/CUDA/ROCm/TPU/NPU); iGPU dopisane do 8 kurowanych modeli; reguły `VAL_GPU` (wymagany akcelerator, ostrzeżenie) i `VAL_GPU_OPTIONAL` (opcjonalna akceleracja, info — praca na CPU); VM bez GPU passthrough nie widzi GPU hosta
- Bez zmiany schematu — pola (`loadProfile`, `growthBytesPerMonth`, `gpus`, `passthrough.gpu`) istniały w modelu; profile przekazywane do silnika przez `EngineOptions.loadProfiles` (jak narzut OS)

### Etap 16 — Projekty i wygoda (pakiet 7): PRJ‑06/07/08, CAN‑07/08/09, LIB‑04, LBL‑03

- [x] 16a PRJ‑08 szablony startowe w D‑01 (`createFromTemplate` w `packages/model`): Mini PC + router, Proxmox 3‑node, IoT segmentation (kreator NET‑10 + porty switcha); test: bez błędów walidacji
- [x] 16a PRJ‑06 ten sam projekt w drugiej karcie → baner ostrzeżenia (BroadcastChannel; decyzja: ostrzeżenie zamiast blokady, autozapis „ostatni wygrywa”)
- [x] 16a CAN‑09 minimapa (przełącznik przy zoomie), „fit to screen” (był), paleta poleceń Ctrl+K (elementy, widoki, akcje)
- [x] 16a CAN‑07 notatki na canvasie: z biblioteki, edycja dwuklikiem / Enter, zmiana rozmiaru, przesuwanie, usuwanie Delete; token `bg-note`
- [x] 16b PRJ‑07 snapshoty: store `snapshots` w IndexedDB (wersja bazy 2), V‑06 `#/p/:id/snapshots` (z podsumowania projektu i palety), D‑12, diff dwóch wersji (`diffProjects` w modelu: urządzenia, lokalizacje, kable, workloady, aplikacje, VLAN‑y, podsieci, strefy, asercje; porty jako zmiana właściciela), Restore jako jedna komenda z cofaniem (`project.restoreSnapshot`) + automatyczny snapshot „Before restoring…”; eksport JSON „Include snapshots” i import snapshotów
- [x] 16b LIB‑04 własne szablony urządzeń: „Save as template” w Hardware, sekcja „My templates” w bibliotece (klik / przeciągnięcie, usuwanie), zapis w `settings` z walidacją Zod; komenda `device.applyTemplate` (nowe ID dysków i pul, porty jak w `device.applyModel`)
- [x] 16b CAN‑08 wyrównywanie i równe rozmieszczenie zaznaczonych urządzeń (pasek w panelu wielokrotnego zaznaczenia, jedna operacja cofania); routing łącza ortogonalny (domyślny) / prosty (`layout.setLinkRouting`). Prowadnice przy przeciąganiu i punkty pośrednie łączy — **odłożone** (siatka 16 px i przyciąganie działają)
- [x] 16a LBL‑03 etykiety kabli `SW1-P05 ↔ PVE1-ETH0`: „Generate label” w inspectorze łącza, kolor kabla, „Label all cables” w palecie (komenda `link.labelCables`, wzorzec domyślny — zapis własnego wzorca wymagałby zmiany schematu)

### Etap 17 — Offline i mobile (pakiet 8): PWA (`vite-plugin-pwa`), widoki M‑01…03

- [x] PWA: `vite-plugin-pwa` 2 (manifest, ikony 192/512/maskable, apple-touch-icon), service worker z precache aplikacji i katalogu bazowego (bez `catalog/*.json` — aktualizacje katalogu z sieci), `registerType: 'prompt'` bez skryptu inline (CSP), komunikat „New version available · Reload”
- [x] Tryb tylko‑do‑odczytu w sesji (`setReadOnly`, błąd `READ_ONLY`, bez undo/redo) włączany < 768 px (A1)
- [x] M‑01 projekty: jedna kolumna, bez „New project” (import i przykład zostają)
- [x] M‑02 edytor: skrócony top bar (widoki w selekcie, bez Undo/Redo/Export, Simulate jako ikona), bez biblioteki i nakładek kolorowania, bez przeciągania i łączenia; dolny arkusz z inspectorem 40 % / 90 % z zamykaniem; jednorazowy baner „Editing is available on desktop”
- [x] M‑03 Reachability w arkuszu (wybór z list)
- Pozostałe: M‑04 (pełnoekranowa lista problemów) i M‑05 (karty zamiast tabel) — kolejne iteracje

## Wersja 1.2 — plan (2026-11-12)

Zakres: funkcje P1 nieukończone w 1.1 i rzeczy odłożone w etapach 13–17. Kolejność: najpierw bez zmiany formatu projektu, potem schemat v2 (jedna migracja dla wszystkich nowych pól).

### Etap 18 — Canvas: kable i układ (CAN‑08, LOC‑08)

- [x] Punkty pośrednie kabli: komenda `layout.setLinkWaypoints` (bezwzględne jednostki siatki, max 16, pusta lista = automatyczny przebieg), `layout.setLinkRouting` zachowuje punkty; krawędź `LinkEdge` (ortogonalna lub prosta przez punkty), dwuklik na kablu dodaje punkt, przeciąganie / strzałki / `Delete` na zaznaczonym kablu, licznik i „Remove bend points” w inspectorze
- [x] Prowadnice przy przeciąganiu: wyrównanie krawędzi i środków z innymi elementami (`alignmentGuides`)
- [x] Group by: Location / None w kontrolkach canvasu (O‑11) — ramki ukryte, urządzenia z racka ułożone kafelkami, urządzenia z lokalizacją bez przeciągania; `layout.groupByLocation` z cofaniem
- Bez zmiany schematu — pola `waypoints` i `groupByLocation` były w modelu

### Etap 19 — Software: przenoszenie, zgodność, aktualizacje specyfikacji (SW‑11, SW‑12, LIB‑03)

- [ ] SW‑11 przeniesienie workloadu na inny host (drzewo w inspectorze, z kaskadą vNIC/mostów)
- [ ] SW‑12 architektura obrazu (amd64/arm64) vs CPU hosta — reguła walidacji
- [ ] LIB‑03 „dostępna nowsza specyfikacja” dla pozycji z katalogu

### Etap 20 — Sieć i etykiety, schemat v2 (NET‑11, NET‑14, LBL‑03)

- [ ] Schemat v2 + migracja v1→v2 + fixture
- [ ] NET‑11 reverse proxy (domena → aplikacja), ekspozycja i symulacja przez proxy
- [ ] NET‑14 lokalne rekordy DNS
- [ ] LBL‑03 własny wzorzec etykiet kabli w ustawieniach projektu

### Etap 21 — Ustawienia, lokalizacje, katalog sprzętu (SET‑02, LOC‑06, LIB‑02)

- [ ] SET‑02 domyślne ustawienia nowych projektów (Settings › Units & costs)
- [ ] LOC‑06 inspector lokalizacji: zajętość U, lista urządzeń, pobór mocy racka vs budżet UPS
- [ ] LIB‑02 filtry katalogu sprzętu (CPU, RAM, porty, pobór mocy)

### Etap 22 — Telefon (M‑04, M‑05)

- [ ] M‑04 pełnoekranowa lista problemów, M‑05 karty zamiast tabel

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
| 2026-11-11 | Etap 5: silnik (walidacja, capacity, poprawki), worker, panel Issues, diody i zakładka Capacity; unit 143, E2E 16 | #11 |
| 2026-11-12 | Etap 6: symulacja `reach()`, dostęp do internetu, Visible from, panel Simulation, nakładki CAN‑06; unit 156, E2E 19 | #12 |
| 2026-11-12 | Etap 7a: schematy i walidacja katalogu, warstwa kurowana (59 aplikacji, 19 urządzeń, 11 CPU, 4 OS), warstwa bazowa w aplikacji, narzut OS z katalogu; unit 163, E2E 19 | #13 |
| 2026-11-12 | Etap 7b: D‑05/D‑06/D‑07, komendy `device.applyModel` i `app.addFromCatalog` — etap 7 zamknięty; unit 172, E2E 23 | #14 |
| 2026-11-12 | Decyzje UI1–UI3 (`docs/05` § 15, v0.2); etap 8a: toasty z Undo, auto‑Internet, Settings, About; unit 176, E2E 27 | #15 |
| 2026-11-12 | Etap 8b: eksport D‑04 (PNG/SVG/JSON), E2E ścieżek A i B — **MVP ukończone**; unit 176, E2E 30 | #16 |
| 2026-11-12 | Poprawka: łącza między urządzeniami jednego racka prowadzone prawą stroną (nie przez kolumnę U) | #17 |
| 2026-11-12 | Plan wersji 1.1 (etapy 9–17); etap 9a/9b: Inventory i IP Plan (TanStack Table 9) | #19 |
| 2026-11-12 | Etap 9c: eksport CSV (inwentarz, plan IP, BOM), Markdown, docker-compose — etap 9 zamknięty; unit 189, E2E 33 | #20, #21 |
| 2026-11-12 | Etap 10a/10b: builder katalogu z 4 adapterami, bezpiecznikami i blokadą | #22 |
| 2026-11-12 | Etap 10c: workflow `catalog-update.yml`, pierwszy `dist` od bota (`chore(catalog): 2026.46`), zabezpieczenie rozpakowywania archiwów | #23 |
| 2026-11-12 | Etap 10d: katalog efektywny w aplikacji (243 aplikacje), aktualizacje CAT‑04, Settings › Catalog, źródła w About, PERF w D‑05 — etap 10 zamknięty; unit 205, E2E 33 | #24 |
| 2026-11-12 | Etap 11: skan popularnych aplikacji, 63 nowe kurowane, filtry importu → 195 aplikacji | #25 |
| 2026-11-12 | Etap 12: przepływy aplikacji (FLW‑01…05), oś kroków na canvasie; unit 211, E2E 34 | #26 |
| 2026-11-12 | **Wydanie v1.0.0** (MVP; D10: następna faza = 1.1), `CHANGELOG.md`, wersja w `apps/web/package.json` | tag `v1.0.0` |
| 2026-11-12 | Etap 13: Access (macierz, ekspozycja, asercje), Save as assertion, kreator segmentacji; unit 218, E2E 37 | #27 |
| 2026-11-12 | Etap 14: zasilanie, PoE, UPS, koszt energii, Dashboard; unit 223, E2E 38 | #28 |
| 2026-11-12 | Etap 15: profile obciążenia, tryb Expected, prognoza storage, GPU; unit 227, E2E 40 | #29 |
| 2026-11-12 | Etap 16a: szablony, druga karta, minimapa, paleta Ctrl+K, notatki, etykiety kabli; unit 233, E2E 43 | #30 |
| 2026-11-12 | Etap 16b: snapshoty z diffem i przywracaniem, własne szablony urządzeń, wyrównywanie, routing łączy; unit 239, E2E 45 | #31 |
| 2026-11-12 | Poprawka bezpieczeństwa: walidacja snapshotów przy imporcie i przywracaniu | #32 |
| 2026-11-12 | Etap 17: PWA (offline, aktualizacja), tryb mobilny tylko do odczytu (M‑01…03); unit 241, E2E 47 | #33 |
| 2026-11-12 | **Wydanie v1.1.0** (etapy 9–17; format projektu bez zmian, schemat v1), `CHANGELOG.md`, wersja w `apps/web/package.json` (spełnia `minAppVersion` katalogu) | tag `v1.1.0` |
| 2026-11-12 | Plan wersji 1.2 (etapy 18–22); etap 18: punkty pośrednie kabli, prowadnice, Group by | — |
