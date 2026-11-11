# Server Planner — projekt UI (v0.1)

> Status: **projekt do akceptacji** · Data: 2026-11-11
> Podstawa: `01-funkcjonalnosci.md` v0.4 (moduły, ID funkcji), `02-model-danych.md` v0.3, `04-design-system.md` v0.1 (tokeny i komponenty)
> Makiety: canvas projektowy, wiersz „UI — key screens” (lista w § 14).
> Ten dokument opisuje **ekrany, zachowania i przepływy**. Wygląd komponentów — `04`. Teksty UI po angielsku (D5), opisy po polsku.

---

## 0. Zasady projektu interakcji

| #   | Zasada                                 | Konsekwencja                                                                                                                                                          |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1  | **Canvas jest głównym miejscem pracy** | Wszystko, co fizyczne (urządzenia, lokalizacje, kable), dodaje się i układa na canvasie. Wszystko, co logiczne (VLANy, reguły, workloady), edytuje się w inspectorze. |
| U2  | **Zawsze jest zaznaczenie**            | Inspector nigdy nie jest pusty: brak zaznaczenia = podsumowanie projektu.                                                                                             |
| U3  | **Natychmiastowa informacja zwrotna**  | Walidacja i capacity liczone w tle po każdej komendzie (worker, `03`); wynik widać w ≤ 200 ms jako LED, paski, licznik problemów. Brak przycisku „Validate”.          |
| U4  | **Wszystko odwracalne**                | Każda zmiana to komenda z undo; usuwanie bez dialogu potwierdzenia, za to z toastem „Undo”. Dialog tylko dla operacji nieodwracalnych (usunięcie projektu).           |
| U5  | **Dobre wartości domyślne**            | Nowe urządzenie ma nazwę, porty, formę i IP z puli; aplikacja z katalogu — porty, wolumeny i wymagania. Użytkownik poprawia, nie wypełnia.                            |
| U6  | **Klawiatura pierwszej klasy**         | Każda akcja z menu ma skrót lub jest dostępna z palety poleceń (Ctrl+K, P1).                                                                                          |

---

## 1. Mapa ekranów i trasy

> Pełny spis widoków (strony, panele, szuflady, dialogi, nakładki, stany, mobile) z ID i sitemapą: **`07-mapa-widokow.md`**. Poniżej skrót tras.

Hash routing (`03`), stan widoku w URL — link otwiera ten sam widok i zaznaczenie.

| Trasa                          | Ekran                                             | Prio    |
| ------------------------------ | ------------------------------------------------- | ------- |
| `#/`                           | **Projekty** — lista, nowy, import, szablony      | P0      |
| `#/p/:id` → `#/p/:id/topology` | **Edytor — Topology** (canvas)                    | P0      |
| `#/p/:id/inventory`            | Inventory (tabela)                                | P1      |
| `#/p/:id/ip`                   | IP Plan                                           | P1      |
| `#/p/:id/access`               | Access (macierz + asercje)                        | P1      |
| `#/p/:id/...?sel=dev_pve`      | parametr zaznaczenia (współdzielony przez widoki) | P0      |
| `#/settings`                   | Ustawienia (motyw, katalog, jednostki)            | P0 / P1 |
| `#/about`                      | O aplikacji, źródła danych i licencje (`06` § 5)  | P0      |
| `#/dev/design`                 | Galeria komponentów (tylko build deweloperski)    | P0      |

Przejścia: Projekty → (otwórz) → Edytor; logo w top barze → Projekty. Zmiana widoku (zakładki Topology / Inventory / IP Plan / Access) zachowuje zaznaczenie.

---

## 2. Ekran „Projekty” (`#/`)

**Układ:** top bar (logo, Settings, About) · nagłówek „Projects” + przyciski **New project** (primary), **Import JSON**, **From template** · siatka kart projektów · stopka z informacją o miejscu przechowywania.

- **Karta projektu** (PRJ‑02): miniatura canvasu (PNG generowany przy zamknięciu edytora), nazwa, „Edited 2 h ago”, liczba urządzeń, LED z najgorszym statusem problemów. Menu ⋯: Open, Rename, Duplicate, Export JSON, Delete.
- **New project**: dialog z nazwą i wyborem startu: _Empty_ / _Template_ (Mini PC + router, Proxmox 3‑node, IoT segmentation — PRJ‑08, P1). Po utworzeniu → edytor.
- **Import**: wybór pliku lub przeciągnięcie na ekran; walidacja + migracja (`02` § 11); przy migracji informacja „Imported from schema v1, upgraded to v2”. Konflikt ID projektu → „Import as copy”.
- **Ochrona danych** (PRJ‑05): pasek informacyjny nad siatką, gdy (a) przeglądarka nie przyznała trwałego przechowywania — „Your projects are stored only in this browser. [Keep data persistent] [Export all]”; (b) od ostatniego eksportu minęło ≥ 14 dni i ≥ 50 zmian — „Last backup 21 days ago. [Export]”.
- **Pusty stan** (pierwsze uruchomienie): sylwetki rack + mini PC, „Plan your home lab”, krótki opis w 1 zdaniu, przyciski New project / Import / Try example project (wczytuje fixture z `fixtures/`).
- **Aktualizacja katalogu**: dyskretny wiersz w stopce „Catalog 2026.46 · updated 3 days ago · [Check for updates]”; wynik jako toast.

---

## 3. Edytor — układ

Zgodnie z `04` § 4.2 i makietą „Chosen — E canvas + D device inspector”.

```
┌ Top bar 52 ───────────────────────────────────────────────────────────────────┐
│ logo  [project ▾]  Topology|Inventory|IP Plan|Access   ● 2  ● 1  Export  ▶ Simulate │
├ Library 232 ─┬ Canvas ──────────────────────────────────────────┬ Inspector 304 ┤
│ search       │  [sim result]                       [Group by]   │ title         │
│ RACK-MOUNT   │                                                   │ tabs          │
│ STANDALONE   │      locations, devices, links                    │ sections      │
│ CLIENTS      │                                                   │               │
│ LOCATIONS    │                                                   │               │
│ APPS         │  [legend]                              [zoom]     │ tip           │
│ VLANS legend │                                                   │               │
└──────────────┴───────────────────────────────────────────────────┴───────────────┘
```

- **Menu projektu** (nazwa ▾): Rename, Duplicate, Snapshots (P1), Export JSON, Export PNG/SVG, Project settings (progi capacity, overcommit), Back to projects.
- **Liczniki problemów**: kliknięcie otwiera panel Issues w miejscu inspectora (§ 8).
- **Export** (przycisk): menu — PNG, SVG (EXP‑01), JSON (EXP‑02); P1: BOM CSV, IP plan CSV, Markdown, docker‑compose.
- **Simulate**: otwiera panel symulacji (§ 7).
- Biblioteka i inspector zwijane (`[` i `]`); stan zapamiętany per przeglądarka.
- Wskaźnik zapisu: obok nazwy projektu „Saved” / „Saving…” (`text-muted`); błąd zapisu → baner `error` z akcją Export.

---

## 4. Canvas — interakcje

### 4.1 Nawigacja

| Akcja       | Mysz / gładzik                                             | Klawiatura                                             |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| Przesuwanie | przeciąganie pustego tła; spacja + przeciąganie; dwa palce | strzałki przy braku zaznaczenia                        |
| Zoom        | kółko z Ctrl / szczypanie; przyciski − / +                 | `Ctrl` `+` / `-`, `Ctrl 0` = 100%, `Shift 1` = dopasuj |
| Zakres      | 10% – 200%                                                 |                                                        |

**Zoom semantyczny** (czytelność dużych labów):

- **≥ 75%** — pełne kafelki (workloady, paski, porty).
- **40–75%** — kafelki zwinięte: sylwetka, nazwa, LEDy; porty jako jeden pasek; etykiety łączy ukryte.
- **< 40%** — tylko kształty, kolory statusu i nazwy lokalizacji.

### 4.2 Dodawanie elementów

1. **Przeciągnięcie z biblioteki** na canvas lub do pojemnika. Podgląd kafelka w docelowej formie. Upuszczenie:
   - na tło → urządzenie bez lokalizacji (`placement` puste);
   - w pomieszczenie / na półkę → `placement.locationId`;
   - w rack → przyciąganie do najbliższego wolnego slotu, podgląd „U9–U8”; brak miejsca → slot czerwony, upuszczenie odrzucone z komunikatem „Not enough free units (needs 2U)”.
   - urządzenie standalone na rack → wymaga półki: jeśli rack ma półkę z miejscem — tam; jeśli nie — propozycja „Add 1U shelf at U7?”.
2. **Dwuklik na tle** → szybkie wyszukiwanie (popover z wyszukiwarką biblioteki) w miejscu kliknięcia.
3. **Aplikacja z biblioteki** (sekcja APPS) upuszczona na kafelek hosta → kreator „Add app” (§ 6.3). Upuszczenie na tło → podpowiedź „Drop an app onto a host”.
4. Nazwy domyślne: `<kind>-<n>` (`switch-1`), zgodne z konwencją projektu (LBL‑05, P2).

### 4.3 Zaznaczanie i przesuwanie

- Klik — zaznaczenie; Shift+klik — dodanie; przeciągnięcie ramki na tle — zaznaczenie obszarem; `Ctrl A` — wszystko.
- Przesuwanie z przyciąganiem do siatki (16 px); `Alt` podczas przeciągania — bez przyciągania.
- Przeciągnięcie urządzenia **między lokalizacjami** zmienia `placement` (komenda `device.place`); poza wszystkie lokalizacje → „Unplaced”.
- Przeciągnięcie **pojemnika** przenosi go z zawartością. Zmiana rozmiaru pomieszczenia/półki — uchwyty w narożnikach; rack zmienia rozmiar tylko przez liczbę U w inspectorze.
- Usuwanie: `Delete` / `Backspace`. Usunięcie lokalizacji nie usuwa urządzeń — zostają na swoich pozycjach jako „Unplaced”; toast z Undo.
- Kopiuj / wklej / duplikuj (`Ctrl C/V/D`): kopia z nowymi ID, nowymi nazwami (`pve1` → `pve2`) i **bez adresów IP** (by uniknąć konfliktów); łącza kopiowane tylko między kopiowanymi elementami.

### 4.4 Łączenie (CAN‑04)

1. Najechanie na kafelek pokazuje porty (w zoomie < 75% — uchwyt „+” na krawędzi).
2. Przeciągnięcie z portu → linia za kursorem; **zgodne wolne porty** w zasięgu podświetlone (`accent` obrys), niezgodne wygaszone (inna prędkość/medium → podświetlenie z ostrzeżeniem, nie blokada).
3. Upuszczenie na **kafelek** (nie konkretny port) → automatycznie pierwszy wolny zgodny port; na porcie → ten port.
4. Po utworzeniu łącze jest zaznaczone; inspector łącza pozwala zmienić porty, typ kabla, tryb VLAN po obu stronach (§ 5.5).
5. Wi‑Fi: przeciągnięcie z AP do klienta tworzy łącze Wi‑Fi z wyborem SSID.
6. `Esc` przerywa.

### 4.5 Menu kontekstowe

- **Urządzenie**: Open in inspector, Add VM / LXC / container / app (dla hostów), Connect…, Move to location ▸, Change form factor ▸, Duplicate, Copy, Test reachability from here, Delete.
- **Łącze**: Edit, Swap ends, Reroute (auto), Delete.
- **Lokalizacja**: Rename, Add device here, Collapse, Delete (keep devices).
- **Tło**: Paste, Add device…, Add location ▸, Add note, Fit to screen, Toggle grouping.

### 4.6 Skróty klawiszowe (MVP)

| Skrót                      | Akcja                                                 |
| -------------------------- | ----------------------------------------------------- |
| `Ctrl Z` / `Ctrl Shift Z`  | Undo / Redo                                           |
| `Ctrl C` `Ctrl V` `Ctrl D` | Kopiuj / wklej / duplikuj                             |
| `Delete`                   | Usuń                                                  |
| `Ctrl A`                   | Zaznacz wszystko                                      |
| `Esc`                      | Odznacz / przerwij akcję / zamknij panel              |
| `Tab` / `Shift Tab`        | Następny / poprzedni element (`04` § 8)               |
| `Enter`                    | Fokus do inspectora                                   |
| `[` / `]`                  | Zwiń bibliotekę / inspector                           |
| `Shift 1`                  | Dopasuj do ekranu                                     |
| `L`                        | Rysuj łącze z zaznaczonego urządzenia                 |
| `S`                        | Otwórz symulację z zaznaczonym elementem jako źródłem |
| `Ctrl K`                   | Paleta poleceń (P1)                                   |
| `?`                        | Lista skrótów                                         |

---

## 5. Inspector — zawartość wg zaznaczenia

Wspólne: nagłówek (nazwa edytowalna inline po kliknięciu, podtytuł), zakładki gdy > 1 sekcja, wskazówki (tip) na dole, sekcja ISSUES z problemami tego elementu.

### 5.1 Nic nie zaznaczone — podsumowanie projektu

Nazwa projektu, liczniki (urządzenia, workloady, aplikacje, VLANy), łączny bilans zasobów (CPU / RAM / storage wszystkich hostów), lista problemów (top 5), szybkie akcje: Add device, Manage VLANs, Firewall rules, Project settings.

### 5.2 Urządzenie

Zakładki (wariant D):

| Zakładka                           | Zawartość                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capacity** (domyślna dla hostów) | Paski CPU / Memory / każda pula storage / GPU (CAP‑01…03); pod każdym rozbicie na workloady (kliknięcie = zaznaczenie workloadu); przełącznik Allocated / Expected (P1); tip z rekomendacją                                                                                                                                                                |
| **Hardware**                       | FORM FACTOR (rack / standalone, U, szerokość, kształt) · LOCATION (select + U dla racka) · COMPONENTS: CPU (z katalogu, `perf` z oznaczeniem źródła), RAM (lista modułów, sloty x/y), Disks & pools (lista + „Add disk”, „Create pool”), NICs, GPU, Power (P1) · „Model: Lenovo M720q (catalog 2026.46)” z akcją „Update from catalog” gdy nowsza (LIB‑03) |
| **Software**                       | OS (select + wersja, SW‑01) · Docker runtime on/off · drzewo workloadów: VM / LXC / kontenery / stosy z aplikacjami, akcje Add VM / Add LXC / Add container / Add app · wiersz workloadu: odznaka, nazwa, zasoby, LED; klik = zaznaczenie workloadu                                                                                                        |
| **Network**                        | Interfejsy (port, tryb access/trunk, VLANy, IP / DHCP), bridge'e (Proxmox `vmbr`, VLAN‑aware), dla routera: Routes, Firewall (link do edytora reguł § 5.7), NAT; dla AP: SSID‑y                                                                                                                                                                            |

Dla urządzeń bez zasobów (switch, AP, klient) domyślna zakładka to **Network**, a Capacity jest ukryta (switch: zakładka Ports z siatką portów i PoE budget, P1).

### 5.3 Workload (VM / LXC / kontener)

Ścieżka nad tytułem: `pve1 › docker-vm › jellyfin`. Sekcje: Resources (vCPU, RAM, dyski z puli — z paskami „of host”), Network devices (lista vNIC: bridge, tag VLAN, IP — M2 w `02` § 13), Guest OS (VM), Docker (dla VM/LXC: runtime, sieci), Containers / Apps (lista), dla kontenera: Image, Ports (`host:container/proto`), Volumes, Network mode, Limits.

### 5.4 Aplikacja

Opis z katalogu (z linkiem do źródła i `confidence`), Listeners (porty), Requirements (min / recommended vs przydział), Dependencies (np. Immich → PostgreSQL: zielone / czerwone), Traffic patterns (lista; edycja P1), akcje: Run a flow ▸ (lista procesów z katalogu, FLW‑01), Test reachability to this app.

### 5.5 Łącze

Końce A i B (urządzenie:port, zmiana z listy), typ (kabel / Wi‑Fi), prędkość wynegocjowana (min z dwóch portów, z ostrzeżeniem przy niezgodności), tryb VLAN każdego końca z ostrzeżeniem przy rozjeździe (VAL), kabel: kategoria, długość, kolor, etykieta (LBL‑03, P1).

### 5.6 Lokalizacja

Rack: nazwa, U (6–42), szerokość, głębokość, Space bar, Power (P1), lista MOUNTED, półki (Add shelf). Pomieszczenie / półka: nazwa, rodzic (P1), lista urządzeń.

### 5.7 Edytory globalne (otwierane z podsumowania projektu, z menu routera lub skrótem)

Edytory pełnoekranowe nad canvasem (panel 720 px wysuwany z prawej, canvas widoczny i przyciemniony):

- **VLANs & subnets** (NET‑01, 03, 06): tabela VLANów (kolor, VID, nazwa, podsieć, brama, DHCP, strefa); dodawanie wierszem na dole.
- **Firewall rules** (NET‑07): lista uporządkowana z przeciąganiem kolejności; kolumny #, Action, Source, Destination, Protocol/Port, Hits (liczba testów/flowów, które trafiły w regułę — informacja z symulacji); polityka domyślna na dole; kliknięcie reguły pokazuje na canvasie elementy, których dotyczy.
- **Tags** (LBL‑01).

### 5.8 Zaznaczenie wielu elementów

Liczba i typy („3 devices, 1 link”), wspólne pola (tagi, lokalizacja, forma), akcje zbiorcze: Align (P1), Move to location, Delete.

---

## 6. Kluczowe przepływy

### 6.1 Ścieżka A — „Nowy lab od zera”

1. Projekty → **New project** → Empty.
2. Pusty canvas: podpowiedź „Start with a location or drop a device” + przyciski Add room / Add rack / Add device.
3. Użytkownik przeciąga router i switch (rack 1U) do racka, mini PC na półkę. Domyślne nazwy i porty.
4. Łączy porty (§ 4.4). Pierwsze łącze do routera automatycznie tworzy węzeł **Internet** i łącze WAN, jeśli go nie ma (podpowiedź z możliwością cofnięcia).
5. Problemy pojawiają się na bieżąco („No subnet on router LAN interface”) z akcją **Fix**: „Create LAN 192.168.1.0/24”.
6. Hardware mini PC: wybór modelu z katalogu (LIB‑01 / 02) → CPU, RAM, dyski wypełnione.
7. Software: OS Proxmox → Add VM „docker‑vm” → Add app „Jellyfin” (kreator § 6.3).
8. Capacity: paski pokazują 78% RAM → tip z rekomendacją.
9. **Simulate** → „Can my TV reach Jellyfin?” (§ 7).
10. Export JSON (przypomnienie po pierwszej sesji: „Save a backup of your project”).

### 6.2 Ścieżka B — „Czy mój sprzęt to uciągnie?”

Host zaznaczony → zakładka Capacity → Add app z katalogu (wiele naraz z wyszukiwarki) → paski aktualizują się po każdej → przy przekroczeniu: czerwony segment, problem `VAL_13` z tipem („Add 16 GB RAM (1 free slot)” / „Move immich to nas‑01”). P1: przełącznik Expected usage i profil „evening: 2 streams”.

### 6.3 Kreator „Add app” (SW‑06)

Popover / dialog 480 px, 3 kroki, każdy z rozsądnym domyślnym wyborem — „Add” aktywne od pierwszego kroku:

1. **Where**: host / VM / LXC (domyślnie: upuszczony host; jeśli to Proxmox bez Dockera — propozycja „Create docker‑vm (2 vCPU, 4 GB)” lub LXC).
2. **Ports & storage**: mapowania portów (konflikt z istniejącymi podświetlony, propozycja wolnego), wolumeny (pula, rozmiar).
3. **Network**: sieć Docker (bridge domyślnie), czy wystawić przez reverse proxy (jeśli istnieje w projekcie).

Wynik: kontener(y) lub stos + AppInstance, toast „Immich added (4 containers) · Undo”.

### 6.4 Ścieżka C — „Dokumentacja istniejącego labu”

Nacisk na szybkie wprowadzanie: duplikowanie, kopiowanie, wklejanie, P1 widok Inventory z edycją inline w tabeli, eksport PNG / Markdown.

---

## 7. Symulacja (SIM / FLW)

**Simulate** otwiera panel symulacji w miejscu inspectora (powrót strzałką), z trzema trybami w segmentach:

| Tryb                      | Zawartość                                                                                                                                                                                                | Prio |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **Reachability**          | Źródło (picker: kliknięcie na canvasie lub lista), Cel (urządzenie / workload / aplikacja / Internet), protokół + port (podpowiedzi z listenerów celu), **Run**                                          | P0   |
| **Internet & LAN access** | Przełącznik nakładki na canvasie: „Internet access” (LED‑plakietka na każdym kafelku: ✓ / ✕ / ◐) i „Visible from” (wybrany punkt widzenia, np. telefon w Guest) — lista usług dostępnych / zablokowanych | P0   |
| **Flows**                 | Lista procesów z katalogu dla aplikacji w projekcie (FLW‑01), wybór uczestników (FLW‑02), **Play** / krok po kroku                                                                                       | P1   |

**Wynik testu osiągalności:**

- Na canvasie: elementy spoza ścieżki wygaszone (opacity .35), ścieżka z animowanym przepływem (`04` § 6.10), hop blokujący z ✕, **karta wyniku** w lewym górnym rogu canvasu.
- W panelu: lista kroków (DNS → L2 → L3 → FW → NAT → APP), każdy z decyzją i odnośnikiem (np. „rule #4 IoT → LAN deny” → otwiera edytor reguł z podświetloną regułą).
- Akcje: **Save as assertion** (SIM‑06, P1) z oczekiwaniem allowed/blocked, **Suggest fix** (gdy blokada przez regułę: „Add rule: allow IoT → jellyfin tcp/8096 above #4” — jako podgląd zmiany, wymaga potwierdzenia).
- `Esc` lub zamknięcie panelu przywraca normalny widok.

**Flow** (P1): oś kroków na dole canvasu (pasek 120 px) z przyciskami ⏮ ⏯ ⏭, każdy krok podświetla odcinek; zablokowany krok zatrzymuje odtwarzanie.

---

## 8. Panel Issues

Otwierany z liczników w top barze lub `Ctrl Shift M`. Zastępuje inspector.

- Filtry: All / Errors / Warnings, wyszukiwarka, „Only selected”.
- Grupy wg ważności, w grupie wg elementu. Wiersz: LED, zdanie, element (link → zaznacza i centruje canvas), kod mono, akcja **Fix** (gdy reguła ma auto‑poprawkę — podgląd + Apply).
- Problem może być wyciszony („Ignore” z powodem, zapis w projekcie, P1) — trafia do zwiniętej sekcji „Ignored”.
- Pusty stan: „No issues found” + LED ok.

---

## 9. Widoki tabelaryczne (P1)

| Widok         | Układ                                                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inventory** | TanStack Table: Device, Kind, Location, Model, CPU, RAM, Storage, OS, Workloads, Internet, Capacity, Tags; grupowanie po lokalizacji; edycja inline (nazwa, lokalizacja, tagi); zaznaczenie wiersza = zaznaczenie w projekcie; inspector po prawej jak w edytorze |
| **IP Plan**   | Lista podsieci (karty: VLAN, CIDR, użycie puli DHCP pasek), pod nią tabela adresów: IP, host, interfejs, typ (static / DHCP / reservation), konflikt; wolne zakresy jako wiersze „.20–.99 free”                                                                   |
| **Access**    | Macierz strefa × strefa (komórka: ✓ / ✕ / ◐ + liczba reguł; klik → szczegóły jak w Reachability), przełącznik na urządzenie × urządzenie z filtrami; pod spodem lista asercji z wynikiem                                                                          |

---

## 10. Ustawienia i About

- **Settings** (`#/settings`): Appearance (Theme: System / Dark / Light — SET‑01), Catalog (wersja, data, auto‑check on/off, Check now, Roll back — SET‑03, P1), Units & costs (P1), Storage (zużycie IndexedDB, Persist data, Export all projects).
- **About** (`#/about`): wersja aplikacji, licencja MIT, link do repo, **Data sources** (tabela z `06` § 5), Recommended (selfh.st), zgłaszanie błędów (link do GitHub Issues).

---

## 11. Stany systemowe i błędy

| Sytuacja                                     | Zachowanie                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Projekt otwarty w innej karcie (PRJ‑06, P1)  | Baner `warning`: „This project is open in another tab. Edits here may overwrite it.” [Take over] [Open read‑only] |
| Brak miejsca w IndexedDB                     | Baner `error` + Export; zapis wstrzymany, edycja dozwolona                                                        |
| Zamknięcie / przeładowanie karty w trakcie zapisu | Zapis natychmiast przy ukryciu karty (`visibilitychange`); gdy zapis wciąż trwa — standardowe pytanie przeglądarki o opuszczenie strony (autozapis co 1 s, docs/03 § 6) |
| Nieudana aktualizacja katalogu               | Toast `warning` „Catalog update failed — using version 2026.45”; szczegóły w Settings                             |
| Nowa wersja katalogu dla pozycji w projekcie | Kropka `info` przy modelu w inspectorze + akcja „Review changes” (diff pól)                                       |
| Import pliku z nowszego `schemaVersion`      | Dialog: „This file was created by a newer version of Server Planner. Update the app (reload).”                    |
| Wyjątek w silniku (worker)                   | Dyskretny baner „Analysis failed for the last change” + raport w konsoli; edycja działa dalej                     |
| Nowa wersja aplikacji (PWA)                  | Toast „New version available · Reload”                                                                            |

---

## 12. Mobile — tylko podgląd (< 768 px)

- **Projekty**: lista jednokolumnowa, bez New/Import (Import dostępny — otwarcie pliku do podglądu).
- **Edytor**: top bar skrócony (logo, nazwa projektu, menu widoków ▾, liczniki problemów); canvas na pełny ekran z gestami (przesuwanie, szczypanie), zoom semantyczny; brak biblioteki i przeciągania.
- Stuknięcie elementu → **dolny arkusz** (40% / 90% wysokości) z inspectorem **tylko do odczytu** (zakładki jak na desktopie).
- Symulacja: Reachability dostępne (to odczyt, nie edycja) — wybór źródła i celu z list.
- Baner jednorazowy: „Editing is available on desktop.”
- Cele dotykowe ≥ 44 px.

---

## 13. Teksty UI (copy)

- Angielski, sentence case w przyciskach i nagłówkach („Add device”, nie „Add Device”); etykiety sekcji wielkimi literami tylko przez CSS.
- Przyciski: czasownik + obiekt („Export JSON”, „Add rule”), nie „OK”.
- Problemy: _co jest nie tak_ + _gdzie_ („VLAN 30 not allowed on sw-core port 8”); tip: _co zrobić_ („Allow VLAN 30 on the trunk to ap-living”).
- Wartości z jednostką, spacja nierozdzielająca: `16 GB`, `1 Gb/s`, `2U`.
- Klucze i18n wg ekranu i komponentu: `editor.inspector.hardware.formFactor.title`, `issues.VAL_04` (ICU, `01` § 7).

---

## 14. Makiety

| Artboard                                | Co pokazuje                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Editor — dark** (poprawiona „Chosen”) | Edytor z zaznaczonym hostem; poprawki z `04` § 10 (IoT `pink`, U 10 px, `text-muted` `#959595`) |
| **Editor — light**                      | Ten sam ekran w motywie jasnym — weryfikacja tokenów                                            |
| **Projects**                            | Lista projektów, karta, baner ochrony danych                                                    |
| **Simulation — reachability**           | Panel symulacji, ścieżka, karta BLOCKED, lista kroków, Suggest fix                              |
| **Mobile — view only**                  | Canvas + dolny arkusz z inspectorem                                                             |

---

## 15. Otwarte kwestie

| #   | Kwestia                                                                                             | Propozycja                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| UI1 | Edytory globalne (VLANy, firewall) jako panel wysuwany nad canvasem czy osobne widoki w zakładkach? | **Panel wysuwany** — reguły firewall najlepiej rozumieć, widząc topologię.  |
| UI2 | Auto‑tworzenie węzła Internet przy pierwszym routerze                                               | **Tak**, z toastem i Undo.                                                  |
| UI3 | Usuwanie bez dialogu potwierdzenia (tylko toast z Undo)                                             | **Tak** dla elementów projektu; dialog tylko dla usunięcia całego projektu. |
