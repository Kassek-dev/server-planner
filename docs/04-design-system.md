# Server Planner — design system (v0.1)

> Status: **zaakceptowany, v0.2** (korekty kontrastu z `tokens:check`, token `selection`) · Data: 2026-11-11
> Podstawa: `01-funkcjonalnosci.md` v0.4 (D1–D9), `02-model-danych.md` v0.3, `03-architektura.md` v0.2
> Kierunek wizualny: **C „Rack”** — canvas z wariantu **E** (lokalizacje), inspector urządzenia z wariantu **D**.
> Plansza referencyjna: canvas projektowy, artboard „Chosen — E canvas + D device inspector”.

---

## 0. Zasady

| #   | Zasada                              | Co to znaczy w praktyce                                                                                                                                                         |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Narzędzie, nie dekoracja**        | Grafit + jeden akcent. Ozdobniki (LED, uszy racka, nóżki) zostają tylko wtedy, gdy niosą informację: status, formę, zajętość.                                                   |
| P2  | **Kształt = forma fizyczna**        | Rack‑mount ma ostre narożniki i uszy; standalone — zaokrąglenia, sylwetkę i nóżki; AP sufitowy — pigułkę. Użytkownik rozpoznaje urządzenie po kształcie, zanim przeczyta nazwę. |
| P3  | **Kolor = znaczenie, nigdy ozdoba** | Pomarańcz = interakcja i zaznaczenie. Czerwony / żółty / zielony = wyłącznie status. Kolory VLANów pochodzą z osobnej palety, która nie używa barw statusu.                     |
| P4  | **Dane technicze monospace**        | IP, porty, U, rozmiary, kody problemów, etykiety sekcji — IBM Plex Mono z cyframi tabelarycznymi. Teksty dla ludzi — IBM Plex Sans.                                             |
| P5  | **Komunikat pełnym zdaniem**        | Problemy i wyniki symulacji opisują _co_ i _dlaczego_ („tv-salon → Jellyfin :8096 blocked by rule #4 IoT → LAN deny”), kod (`VAL_04`) jest dodatkiem.                           |
| P6  | **Status nigdy tylko kolorem**      | LED + tekst / ikona / obramowanie; port z błędem ma obrys, nie tylko inny kolor.                                                                                                |
| P7  | **Dwa motywy od początku**          | Każdy kolor w kodzie to token. Ciemny jest domyślny, jasny jest pełnoprawny (D5 / SET‑01).                                                                                      |

---

## 1. Tokeny — architektura

Trzy warstwy (zgodnie z `03-architektura.md`: CSS variables + Tailwind):

1. **Prymitywy** — surowa skala (`--sp-gray-950`, `--sp-orange-500`…). Używane tylko w definicjach tokenów semantycznych.
2. **Tokeny semantyczne** — znaczenie (`--sp-bg-panel`, `--sp-text-secondary`, `--sp-status-error`). **Kod komponentów używa wyłącznie tej warstwy.**
3. **Tokeny komponentów** — tylko tam, gdzie komponent ma własne wartości (`--sp-port-empty`, `--sp-rack-u-height`).

Konwencje:

- Prefiks `--sp-` (Server Planner). Motyw: atrybut `data-theme="dark|light"` na `<html>`; domyślnie wg `prefers-color-scheme`, nadpisywane w ustawieniach.
- Tailwind: `theme.extend.colors` mapuje nazwy na zmienne (`bg-panel` → `var(--sp-bg-panel)`); zakaz klas z surową paletą (`bg-zinc-800`) — reguła lint w Biome/CI (grep na `-(zinc|gray|neutral|orange)-\d`).
- Tokeny źródłowo w `apps/web/src/styles/tokens.css`; eksport do `tokens.json` (dla dokumentacji i testów kontrastu).

---

## 2. Kolor

### 2.1 Powierzchnie, tekst, obramowania

| Token            | Ciemny                    | Jasny              | Użycie                                                         |
| ---------------- | ------------------------- | ------------------ | -------------------------------------------------------------- |
| `bg-app`         | `#141414`                 | `#f4f4f4`          | tło aplikacji                                                  |
| `bg-panel`       | `#1c1c1c`                 | `#ffffff`          | top bar, biblioteka, inspector                                 |
| `bg-canvas`      | `#171717`                 | `#fafafa`          | canvas                                                         |
| `canvas-grid`    | `rgb(255 255 255 / .035)` | `rgb(0 0 0 / .05)` | linie siatki                                                   |
| `bg-raised`      | `#1f1f1f`                 | `#ffffff`          | elementy pływające na canvasie: karta symulacji, zoom, legenda |
| `bg-tile`        | `#262626`                 | `#ffffff`          | kafelek urządzenia, element listy w bibliotece                 |
| `bg-tile-header` | `#2e2e2e`                 | `#f0f0f0`          | nagłówek kafelka, nagłówek racka, aktywna zakładka             |
| `bg-inset`       | `#141414`                 | `#f4f4f4`          | pola formularzy, kieszenie dysków, wnętrze portów              |
| `bg-container`   | `#1b1b1b`                 | `#f7f7f7`          | wnętrze racka                                                  |
| `border-subtle`  | `#2e2e2e`                 | `#e5e5e5`          | podziały paneli                                                |
| `border-default` | `#3a3a3a`                 | `#d4d4d4`          | kafelki, przyciski, pola                                       |
| `border-strong`  | `#6b6b6b`                 | `#8a8a8a`          | hover, ramki pomieszczeń/półek, linia półki                    |
| `text-primary`   | `#ececec`                 | `#171717`          | tekst główny                                                   |
| `text-secondary` | `#a3a3a3`                 | `#525252`          | metadane, wartości w inspectorze                               |
| `text-muted`     | `#959595`                 | `#6b6b6b`          | podpisy sekcji w bibliotece, numeracja U, podpowiedzi          |

Kontrast (WCAG 2.1, tekst ≥ 4.5:1) sprawdzony na najjaśniejszym tle, na którym token występuje:
`text-secondary` na `bg-tile` — 6.0 (ciemny) / 7.8 (jasny); `text-muted` na `bg-tile` — 5.1 / 4.7 (na `bg-tile-header`).
**Uwaga:** szarość `#8a8a8a` z makiet (4.4:1 na kafelku) jest za ciemna — zastąpiona `#959595`.

### 2.2 Akcent

| Token           | Ciemny    | Jasny     | Użycie                                                                 |
| --------------- | --------- | --------- | ---------------------------------------------------------------------- |
| `accent`        | `#ff7a1a` | `#ff7a1a` | wypełnienie: przycisk główny, aktywny segment                          |
| `selection`     | `#ff7a1a` | `#ea580c` | obramowanie zaznaczenia (≥ 3:1 na `bg-tile` w obu motywach)            |
| `accent-hover`  | `#ff8a3d` | `#f06a0a` | hover wypełnienia                                                      |
| `on-accent`     | `#141414` | `#141414` | tekst na akcencie (7.9:1)                                              |
| `accent-text`   | `#ff8a3d` | `#c2410c` | akcent jako tekst/link/ikona (7.3 / 5.2)                               |
| `accent-subtle` | `#2e2218` | `#fff1e6` | tło zaznaczonej opcji, cel upuszczania                                 |
| `focus-ring`    | `#ff8a3d` | `#c2410c` | obrys fokusu klawiatury                                                |

Akcent **nie** oznacza statusu ani VLANu. Zaznaczony element = obramowanie 2 px `selection`; nic innego nie używa pomarańczowej ramki.

### 2.3 Statusy

| Status    | LED / wypełnienie (ciemny) | Tekst (ciemny) | LED / wypełnienie (jasny) | Tekst (jasny) | Tło komunikatu (ciemny / jasny) | Obramowanie komunikatu |
| --------- | -------------------------- | -------------- | ------------------------- | ------------- | ------------------------------- | ---------------------- |
| `ok`      | `#4ade80`                  | `#4ade80`      | `#16a34a`                 | `#15803d`     | —                               | —                      |
| `warning` | `#facc15`                  | `#facc15`      | `#b88a00`                 | `#a16207`     | `#2a2410` / `#fefce8`           | `#6b5a12` / `#fde047`  |
| `error`   | `#ff4d4d`                  | `#ff6b6b`      | `#ef4444`                 | `#b91c1c`     | `#3a1414` / `#fef2f2`           | `#7f1d1d` / `#fca5a5`  |
| `info`    | `#5eaefc`                  | `#5eaefc`      | `#3b82f6`                 | `#2563eb`     | `#13233a` / `#eff6ff`           | `#1e3a5f` / `#93c5fd`  |
| `off`     | `#333333`                  | `#959595`      | `#d4d4d4`                 | `#6b6b6b`     | —                               | —                      |

Progi capacity (`ok` < 70% ≤ `warning` < 90% ≤ `error`) pochodzą z `ProjectSettings.capacityThresholds` — design system definiuje tylko kolory.

### 2.4 Paleta VLAN / stref / tagów

Osiem nazwanych kolorów, **bez czerwieni, żółci, zieleni i pomarańczu** (zarezerwowane dla statusów i akcentu). Linie łączy muszą mieć ≥ 3:1 względem `bg-canvas` — stąd osobne odcienie dla motywów.

| Klucz    | Ciemny    | Jasny     |
| -------- | --------- | --------- |
| `violet` | `#c084fc` | `#9333ea` |
| `sky`    | `#5eaefc` | `#0284c7` |
| `teal`   | `#2dd4bf` | `#0d9488` |
| `pink`   | `#f472b6` | `#db2777` |
| `indigo` | `#818cf8` | `#4f46e5` |
| `sand`   | `#d6b88a` | `#a37b45` |
| `lime`   | `#a3e635` | `#4d7c0f` |
| `cyan`   | `#67e8f9` | `#0891b2` |

- Nowy VLAN / strefa / tag dostaje kolejny wolny klucz. W danych zapisujemy **klucz palety** (`"violet"`), nie hex — dzięki temu kolor zmienia się z motywem. Własny hex jest dozwolony (wtedy ten sam w obu motywach, z ostrzeżeniem o kontraście). → zmiana typu `color` w `02-model-danych.md` (§ 10).
- Sugerowane domyślne przypisania szablonów: Mgmt `violet`, LAN `sky`, IoT `pink`, Guest `teal`, DMZ `sand`. **Makiety używały żółtego dla IoT — do poprawy** (żółty = warning).
- Ruch nieotagowany / trunk nie ma koloru VLANu (patrz łącza, § 6.6).

### 2.5 Elementy sprzętowe

| Token         | Ciemny            | Jasny                                 | Użycie                             |
| ------------- | ----------------- | ------------------------------------- | ---------------------------------- |
| `port-empty`  | `#333333`         | `#e5e5e5`                             | wolny port, pusty segment paska    |
| `port-trunk`  | `#d4d4d4`         | `#404040`                             | port/łącze trunk (wiele VLANów)    |
| `port-wan`    | `#6b6b6b`         | `#8a8a8a`                             | port/łącze WAN, łącze do Internetu |
| `rack-ear`    | `#333333`         | `#e5e5e5`                             | uszy racka                         |
| `rack-screw`  | `#141414`         | `#a3a3a3`                             | otwory na śruby                    |
| `device-foot` | `#3a3a3a`         | `#d4d4d4`                             | nóżki standalone, linia półki      |
| `led-glow`    | `0 0 6px <kolor>` | `none` + pierścień 1 px `<kolor>/40%` | świecenie diod                     |

---

## 3. Typografia

**Kroje:** IBM Plex Sans (UI) i IBM Plex Mono (dane), wagi 400 / 500 / 600. Licencja OFL. **Self‑hosted** (`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, podzbiory latin + latin‑ext) — bez Google Fonts w runtime: CSP i działanie offline (PWA). Mono zawsze z `font-variant-numeric: tabular-nums`.

| Token         | Krój / waga                                   | Rozmiar / interlinia | Użycie                                                               |
| ------------- | --------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| `title-lg`    | Sans 600                                      | 24 / 32              | tytuł dialogu, pusty stan                                            |
| `title`       | Sans 600                                      | 18 / 24              | nazwa w inspectorze                                                  |
| `body-strong` | Sans 600                                      | 14 / 20              | nazwa aplikacji w top barze                                          |
| `body`        | Sans 400 / 500                                | 13 / 18              | **domyślny tekst UI**, nazwy urządzeń (600)                          |
| `body-sm`     | Sans 400                                      | 12 / 16              | metadane, wiersze workloadów, podpowiedzi                            |
| `data`        | Mono 400                                      | 12 / 16              | IP, rozmiary, wartości w inspectorze                                 |
| `data-sm`     | Mono 400                                      | 11 / 14              | metadane na kafelkach („Proxmox VE 8.3”, „.10.1”)                    |
| `label`       | Mono 600, `uppercase`, `letter-spacing .08em` | 11 / 14              | etykiety sekcji (LIBRARY, FORM FACTOR, ISSUES), nagłówki lokalizacji |
| `badge`       | Mono 600                                      | 10 / 12              | odznaki VM / LXC / CT, numeracja U                                   |

- Minimalny rozmiar tekstu: **10 px** (tylko `badge`). Makieta E miała numerację U 9 px — podnosimy do 10.
- Wielkie litery tylko przez CSS (`text-transform`), nigdy w kluczach i18n — tłumaczenia pozostają w zwykłej pisowni.
- Teksty UI projektujemy z zapasem **+30% długości** na przyszłe tłumaczenia; nazwy urządzeń skracane wielokropkiem z pełną nazwą w tooltipie.

---

## 4. Przestrzeń, siatka, kształt

### 4.1 Odstępy

Baza **4 px**. Skala tokenów `space-*`: `0.5`=2, `1`=4, `1.5`=6, `2`=8, `2.5`=10, `3`=12, `3.5`=14, `4`=16, `6`=24, `8`=32. W panelach standardowo: padding 16, odstęp między sekcjami 16, wewnątrz sekcji 6–8.

### 4.2 Układ aplikacji

| Strefa     | Wymiar    | Uwagi                                                                 |
| ---------- | --------- | --------------------------------------------------------------------- |
| Top bar    | wys. 52   | logo, projekt, zakładki widoków, liczniki problemów, Export, Simulate |
| Biblioteka | szer. 232 | < 1280 px zwija się do paska ikon 56 px                               |
| Inspector  | szer. 304 | zwijany; rozszerzalny do 400 (przeciągnięcie krawędzi)                |
| Canvas     | reszta    | elementy pływające z marginesem 16 od krawędzi                        |

Breakpointy: **≥ 1280** pełny układ · **1024–1279** biblioteka jako pasek ikon · **768–1023** biblioteka i inspector jako wysuwane panele nad canvasem · **< 768** tryb **tylko podgląd** (D: mobile view‑only): brak biblioteki, inspector jako dolny arkusz tylko do odczytu, dotykowe cele ≥ 44 px.

### 4.3 Siatka canvasu i rack

| Token                   | Wartość         | Uwagi                                               |
| ----------------------- | --------------- | --------------------------------------------------- |
| `grid-unit`             | 16 px           | krok przyciągania; jednostka `x/y` w `layout`       |
| `grid-line`             | co 32 px        | rysowana linia (co 2 jednostki)                     |
| `rack-u-height`         | 26 px           | 1U w racku przy zoomie 100%                         |
| `rack-rail-width`       | 24 px           | szyna z numeracją U                                 |
| `rack-header-height`    | 28 px           | nagłówek racka                                      |
| `rack-device-height(n)` | `n × 26 − 2` px | 1U = 24, 2U = 50 (2 px przerwy między urządzeniami) |

Rack przyciąga się do siatki narożnikiem; jego wnętrze ma własny układ wg U (wysokość racka = nagłówek + `units × 26` + 8).

### 4.4 Promienie — kodują formę

| Token         | Wartość | Użycie                                                          |
| ------------- | ------- | --------------------------------------------------------------- |
| `radius-xs`   | 1 px    | porty, segmenty pasków                                          |
| `radius-sm`   | 2 px    | **urządzenia rack‑mount**, odznaki                              |
| `radius-md`   | 3 px    | panele, przyciski, pola, pojemniki lokalizacji, karty pływające |
| `radius-lg`   | 6 px    | **urządzenia standalone**                                       |
| `radius-pill` | 999 px  | AP / urządzenia sufitowe                                        |

### 4.5 Głębia

Bez cieni w motywie ciemnym — warstwy rozróżnia jasność tła i obramowanie; jedyne „światło” to LED. W jasnym: `shadow-raised: 0 1px 2px rgb(0 0 0/.06)` dla elementów pływających, `shadow-overlay: 0 8px 24px rgb(0 0 0/.12)` dla popoverów, menu i dialogów (w ciemnym zamiast tego `border-default` + `bg-raised`).

---

## 5. Ikony i sylwetki

**Ikony UI:** Lucide, 16 px (w listach 18), stroke 1.75, `currentColor`.

**Sylwetki urządzeń** — własny zestaw (pakiet `apps/web/src/icons/devices`), siatka 24 × 24, stroke 1.6, zaokrąglone końce, bez wypełnień. Ten sam rysunek w bibliotece (18 px), w nagłówku kafelka (22 px) i w wyborze kształtu (22 px).

| Sylwetka                  | Forma      | Domyślnie dla `kind`                              |
| ------------------------- | ---------- | ------------------------------------------------- |
| `rack-1u`, `rack-2u`      | rack       | router, firewall, switch, patch-panel, ups (rack) |
| `tower`                   | standalone | server (gdy nie rack)                             |
| `mini-pc`                 | standalone | mini-pc                                           |
| `desktop`                 | standalone | —                                                 |
| `nas`                     | standalone | nas                                               |
| `wall`                    | standalone | modem, switch naścienny                           |
| `ceiling`                 | standalone | access-point                                      |
| `sbc`                     | standalone | sbc                                               |
| `rack` / `shelf` / `room` | pojemniki  | lokalizacje                                       |

Klienci (`client`) używają ikon Lucide wg `clientType`: `laptop`, `monitor`, `smartphone`, `tv`, `gamepad-2`, `cpu` (IoT), `cctv`, `printer`.

---

## 6. Komponenty

Prymitywy interakcji (dialog, popover, menu, tooltip, tabs, select, toggle group) — Radix UI, ostylowane tokenami. Poniżej tylko to, co specyficzne.

### 6.1 Przyciski

| Wariant     | Wygląd                                                          | Użycie                                        |
| ----------- | --------------------------------------------------------------- | --------------------------------------------- |
| `primary`   | tło `accent`, tekst `on-accent` 600                             | jedna główna akcja na obszar (Simulate, Save) |
| `secondary` | przezroczysty, ramka `border-default`, tekst `text-primary` 500 | Export, Cancel                                |
| `ghost`     | bez ramki, hover `bg-tile-header`                               | akcje w wierszach, zoom                       |
| `danger`    | tekst `status-error-text`, ramka `status-error`                 | Delete                                        |

Wysokości: **32** (domyślnie), **28** (paski na canvasie), **44** (mobile). Ikona + tekst: odstęp 6. Przycisk tylko z ikoną zawsze z `aria-label` i tooltipem. Stany: hover (jaśniejsze tło / `accent-hover`), active (−1 px offset tła, bez skalowania), disabled (opacity .45, kursor domyślny), focus (`focus-ring` 2 px, offset 2 px).

### 6.2 Segmenty i zakładki

- **Nawigacja widoków** (top bar): połączone segmenty z ramką `border-subtle`, aktywny = `bg-tile-header` + tekst 500.
- **Zakładki inspectora** (Capacity / Hardware / Software / Network): siatka równych kolumn, aktywna = `bg-tile-header` + **dolna belka 2 px `accent`**.
- **Przełącznik wartości** (Rack‑mount / Standalone, Group by): aktywny segment wypełniony `accent` z tekstem `on-accent` (dla wyborów binarnych w formularzach) lub `bg-tile-header` (dla przełączników widoku na canvasie).
- **Kafelki wyboru** (kształt urządzenia): siatka 3 kolumn, kafelek 58 px wys., sylwetka 22 px nad etykietą; wybrany = ramka `accent` + tło `accent-subtle`. Semantycznie `radiogroup`.

### 6.3 Pola formularzy

Wysokość 32, tło `bg-inset`, ramka `border-default`, `radius-md`, padding 10. Focus: ramka `accent` + `focus-ring`. Błąd: ramka `status-error` + komunikat `body-sm` pod polem. Pola z danymi technicznymi (IP, CIDR, port, VLAN ID) — krój mono. Etykieta pola = `label` nad polem (odstęp 6). Liczby z jednostką: jednostka jako przyrostek wewnątrz pola w `text-muted`.

### 6.4 LED

Kropka 8 px (7 px w 1U racka), `radius-pill`, kolor statusu, `led-glow`. Kolejność gdy kilka: zdrowie urządzenia → capacity. LED zawsze ma tooltip ze zdaniem („Memory at 78% — warning”). Stan `off` dla urządzeń planowanych / wyłączonych (`purchase.status = to-buy`).

### 6.5 Port

Prostokąt 14 × 12 (tile) / 12 × 9 (1U w racku), `radius-xs`, odstęp 3.

| Stan             | Wygląd                                |
| ---------------- | ------------------------------------- |
| wolny            | `port-empty`                          |
| access           | kolor VLANu                           |
| trunk            | `port-trunk`                          |
| WAN              | `port-wan`                            |
| błąd (walidacja) | jak wyżej + obrys 1 px `status-error` |
| PoE (zasila)     | kropka 3 px `status-info` nad portem  |

Hover: tooltip `port 3 · access VLAN 20 · → pve1 eth0`. Przeciągnięcie z portu = rysowanie łącza (CAN‑04), zgodne porty podświetlone obrysem `accent`. Switche > 16 portów: siatka w dwóch rzędach; > 48 — skrót „48 × 1G · 31 used” z rozwinięciem w inspectorze.

### 6.6 Łącza

| Typ                       | Kolor            | Grubość | Styl                   |
| ------------------------- | ---------------- | ------- | ---------------------- |
| access                    | kolor VLANu      | 3       | ciągła                 |
| trunk                     | `port-trunk`     | 4       | ciągła                 |
| WAN / Internet            | `port-wan`       | 2       | ciągła                 |
| Wi‑Fi                     | kolor VLANu SSID | 2       | przerywana 6/5         |
| wirtualne (vNIC ↔ bridge) | —                | —       | nierysowane (02 § 6.1) |

Routing ortogonalny, narożniki proste. Hover: +1 px i etykieta‑chip (`data-sm` na `bg-raised`: `sw-core:3 ⇄ pve1:eth0 · 1G · VLAN 20`). Zaznaczone: obrys `accent` 2 px pod linią. Łącze z problemem: znacznik ✕ w kółku `status-error` w połowie długości. Łącza rysowane **nad** pojemnikami lokalizacji, pod kafelkami.

### 6.7 Kafelek urządzenia

Jeden komponent `DeviceTile` z wariantem wg `formFactor` i kontekstu.

**Rack‑mount** (`radius-sm`, `bg-tile`):

- _W racku_: pełna szerokość wnętrza, wysokość `rack-device-height(units)`, **bez uszu** (szyna racka je zastępuje). 1U = jeden rząd: LED · nazwa (600, 12) · meta mono · porty po prawej. 2U+: drugi rząd na porty / kieszenie dysków.
- _Poza rackiem_ (np. switch na półce): uszy 14 px (`rack-ear`) z dwoma otworami 5 px (`rack-screw`) po obu stronach, wysokość min. 46.

**Standalone** (`radius-lg`, `bg-tile`):

- Nagłówek `bg-tile-header`: sylwetka 22 px · nazwa + OS (`data-sm`) · LEDy po prawej.
- Ciało (rozwijane, `NodeLayout.collapsed`): wiersze workloadów (odznaka `badge` VM / LXC / CT na `text-secondary` z tekstem `bg-app`, nazwa 500, pamięć mono po prawej), linia aplikacji w `text-secondary`, pasek RAM 10 segmentów.
- **Nóżki**: dwa prostokąty 26 × 4 (`device-foot`) 6 px pod krawędzią, 24 px od boków.
- Odmiany kształtu: `nas` — kieszenie dysków (pionowe, `bg-inset`, dolna krawędź 3 px w kolorze statusu dysku); `ceiling` — pigułka bez ciała i nóżek; klient — kompaktowa karta 52 px, ikona Lucide, bez nóżek, strefa jako tekst mono w kolorze VLANu.

**Stany kafelka** (wspólne):

| Stan                                         | Wygląd                                                |
| -------------------------------------------- | ----------------------------------------------------- |
| domyślny                                     | ramka `border-default` 1 px                           |
| hover                                        | ramka `border-strong`                                 |
| zaznaczony                                   | ramka `selection` **2 px** (padding −1, żeby nie skakał) |
| błąd                                         | ramka `status-error` 1 px + LED                       |
| planowany (`to-buy`)                         | ramka przerywana, LED `off`                           |
| wygaszony (symulacja, element spoza ścieżki) | opacity .35                                           |
| na ścieżce symulacji                         | ramka `accent`, przepływ na łączach (§ 6.10)          |
| przeciągany                                  | opacity .8, cień `shadow-overlay` w obu motywach      |

Minimalna szerokość: 120 (klient), 150 (standalone bez ciała), 240 (standalone z workloadami).

### 6.8 Pojemniki lokalizacji

|               | Rack                                                                                                       | Półka / biurko                            | Pomieszczenie                    |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| Ramka         | 1 px `border-strong`, ciągła                                                                               | 1 px `border-strong`, przerywana          | 1 px `border-strong`, przerywana |
| Tło           | `bg-container`                                                                                             | brak                                      | brak                             |
| Nagłówek      | 28 px, `bg-tile-header`, ikona + `label` („RACK · CLOSET”) + meta po prawej (`10″ · 12U`)                  | 28 px bez tła, `label` w `text-secondary` | jak półka, ikona domu            |
| Szczegół      | szyna U 24 px, numeracja `badge` w `text-muted`, wolne sloty: ramka przerywana `border-subtle` + „7U free” | linia półki 3 px `device-foot` na dole    | —                                |
| Półka w racku | linia 2 px `border-strong` u dołu slotu + `badge` „SHELF 1U”                                               | —                                         | —                                |

Stany: zaznaczony — ramka `selection` 2 px; cel upuszczania — ramka `accent` przerywana + tło `accent-subtle`, w racku podświetlony slot docelowy i podgląd „U9–U8”; konflikt (zajęte U, 19″ w 10″) — slot `status-error` z komunikatem przy kursorze. Przełącznik „Group by: None” (LOC‑08) chowa ramki i nagłówki, kafelki zostają na miejscu.

### 6.9 Paski zajętości (segmentowe)

| Kontekst     | Segmenty   | Wysokość | Odstęp |
| ------------ | ---------- | -------- | ------ |
| kafelek      | 10         | 5        | 2      |
| inspector    | 20         | 10       | 2      |
| rack (Space) | = liczba U | 10       | 2      |

Segment zapełniony w kolorze wg progu, w którym leży (`ok` do 70%, `warning` 70–90%, `error` > 90%), pusty `port-empty`. Zaokrąglenie w górę (każde rozpoczęte 5% przy 20 segmentach). Nad paskiem: etykieta (`body`) i wartość mono po prawej (`22.4/28.8 GB`), kolorowana tekstem statusu przy warning/error. Overcommit > 100%: ostatni segment z obrysem `status-error` i wartość „112%”. Pasek ma `role="meter"` z `aria-valuenow/min/max`.

### 6.10 Symulacja

- **Karta wyniku** (pływająca, `bg-raised`, `radius-md`, szer. 260–300): pasek nagłówka z LED + `label` — `ALLOWED` (tło `ok` 15%), `BLOCKED` (tło komunikatu `error`), `NO ROUTE` (tło `warning`); ciało: ścieżka `źródło → cel :port` (500) i przyczyna (`body-sm`, `text-secondary`) z linkiem do reguły.
- **Przepływ na łączach**: kreski 8/6 w kolorze `accent` przesuwane wzdłuż ścieżki (1 s / segment, liniowo); hop blokujący — znacznik ✕ `status-error` i łącze za nim wygaszone. `prefers-reduced-motion`: przepływ statyczny (ciągła linia `accent`), bez animacji.
- **Lista kroków** (panel w inspectorze): numer kroku mono, urządzenie, warstwa (`DNS`, `L2`, `L3`, `FW`, `NAT`, `APP`) jako `badge`, wynik LED.
- Wynik ogłaszany przez `aria-live="polite"`.

### 6.11 Inspector

- Nagłówek: nazwa (`title`), pod nią model · CPU · RAM (`body`, `text-secondary`).
- **Inspector urządzenia** (z wariantu D): zakładki Capacity / Hardware / Software / Network. Hardware zaczyna się od sekcji **FORM FACTOR** (przełącznik Rack‑mount / Standalone; dla rack — liczba U 1–8 i szerokość 10″ / 19″; dla standalone — kafelki kształtu) i **LOCATION** (select z lokalizacjami + „Unplaced”; dla racka dodatkowo pole U), potem **COMPONENTS** (lista klucz / wartość, wartości mono, status kolorem tekstu).
- **Inspector lokalizacji** (z wariantu E): Space (pasek U), Power est. (pasek W, P1), lista MOUNTED (U · nazwa · forma), ISSUES dotyczące lokalizacji.
- Sekcje oddzielone `border-subtle` + 14 px odstępu, nagłówek sekcji = `label`.
- **Wskazówka** (tip) na dole: tło i ramka komunikatu wg statusu (`warning` / `info`), `body-sm`, interlinia 1.5, może zawierać akcję‑link.

### 6.12 Problemy (Issues)

- **Liczniki w top barze**: LED + liczba dla `error` i `warning`; przycisk otwiera panel Issues (zastępuje zawartość inspectora, powrót strzałką).
- **Wiersz problemu**: LED · zdanie (`body`) · cel (link, zaznacza element na canvasie) · kod mono `text-muted` · opcjonalnie akcja „Fix” (`ghost`, `accent-text`), gdy reguła ma automatyczną poprawkę.
- Grupowanie: wg ważności, potem wg urządzenia. Zero problemów: pusty stan „No issues found” z LED `ok`.

### 6.13 Biblioteka

Wyszukiwarka (pole 32), sekcje z `label` w `text-muted`: **RACK-MOUNT**, **STANDALONE**, **CLIENTS**, **LOCATIONS**, **APPS**. Element: 34 px, `bg-tile`, ramka `border-subtle`, sylwetka 18 · nazwa · meta mono po prawej (`1U`, `4 bay`, `6–42U`). Lokalizacje mają ramkę przerywaną (jak na canvasie). Przeciąganie: podgląd kafelka w docelowej formie. Na dole: legenda VLANów (pasek 18 × 6 w kolorze · nazwa · VID mono).

### 6.14 Pozostałe

| Komponent                  | Specyfikacja                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Tooltip                    | `bg-tile-header`, ramka `border-default`, `body-sm`, max szer. 280, opóźnienie 400 ms                             |
| Popover / menu kontekstowe | `bg-raised`, ramka `border-default`, `shadow-overlay`; wiersz 30 px; skrót klawiszowy mono `text-muted` po prawej |
| Dialog                     | szer. 480 / 640, `title-lg`, akcje po prawej (primary na końcu), Esc zamyka                                       |
| Toast                      | dół‑prawo nad zoomem, `bg-raised`, LED statusu, auto‑zamknięcie 5 s (błędy — ręcznie), akcja Undo przy usuwaniu   |
| Pusty stan canvasu         | środek: sylwetki rack + mini PC, `title-lg` „Start your lab”, akcje: „Add device”, „Use a template”               |
| Kontrolki canvasu          | zoom (−, %, +) dół‑prawo; minimapa (P1) nad nim; legenda form dół‑lewo, zwijana                                   |

---

## 7. Ruch

| Token           | Wartość                    | Użycie                               |
| --------------- | -------------------------- | ------------------------------------ |
| `duration-fast` | 120 ms                     | hover, press, zmiana ramki           |
| `duration-base` | 200 ms                     | panele, zakładki, rozwijanie kafelka |
| `duration-slow` | 320 ms                     | dialog, dolny arkusz (mobile)        |
| `ease-out`      | `cubic-bezier(.2,.8,.2,1)` | wejścia                              |
| `ease-in`       | `cubic-bezier(.4,0,1,1)`   | wyjścia                              |

Bez sprężyn i odbić. Przyciąganie do slotu racka: 120 ms. `prefers-reduced-motion: reduce` — wszystkie przejścia ≤ 1 ms, przepływ symulacji statyczny.

---

## 8. Dostępność

- Kontrast: tekst ≥ 4.5:1, duży tekst i elementy graficzne (łącza, porty, LED, ramki stanu) ≥ 3:1 — weryfikowane automatycznie testem na `tokens.json` w CI.
- Status nigdy tylko kolorem (P6); paleta VLAN różni się też jasnością, a legenda zawsze podaje nazwę i VID.
- Klawiatura na canvasie: Tab / Shift+Tab — kolejne węzły (lokalizacje, potem urządzenia w kolejności przestrzennej), strzałki — przesuwanie o `grid-unit` (Shift: ×4), w racku — o 1U, Enter — fokus do inspectora, Esc — odznaczenie, Delete — usunięcie (z Undo).
- Kafelki i pojemniki to elementy z `role="group"` i `aria-label` („pve1, Mini PC, Proxmox VE 8.3, memory warning”); łącza opisane w panelu inspectora.
- Cele dotykowe ≥ 24 px (desktop) / ≥ 44 px (mobile).
- Fokus zawsze widoczny (`focus-ring`), nigdy `outline: none` bez zamiennika.

---

## 9. Implementacja (skrót)

```css
/* apps/web/src/styles/tokens.css — fragment */
:root,
[data-theme="dark"] {
  --sp-bg-app: #141414;
  --sp-bg-panel: #1c1c1c;
  --sp-bg-canvas: #171717;
  --sp-bg-raised: #1f1f1f;
  --sp-bg-tile: #262626;
  --sp-bg-tile-header: #2e2e2e;
  --sp-bg-inset: #141414;
  --sp-bg-container: #1b1b1b;
  --sp-border-subtle: #2e2e2e;
  --sp-border-default: #3a3a3a;
  --sp-border-strong: #5c5c5c;
  --sp-text-primary: #ececec;
  --sp-text-secondary: #a3a3a3;
  --sp-text-muted: #959595;
  --sp-accent: #ff7a1a;
  --sp-accent-hover: #ff8a3d;
  --sp-on-accent: #141414;
  --sp-accent-text: #ff8a3d;
  --sp-accent-subtle: #2e2218;
  --sp-focus-ring: #ff8a3d;
  --sp-status-ok: #4ade80;
  --sp-status-warning: #facc15;
  --sp-status-error: #ff4d4d;
  --sp-status-info: #5eaefc;
  --sp-vlan-violet: #c084fc;
  --sp-vlan-sky: #5eaefc; /* … */
  --sp-led-glow: 0 0 6px;
  --sp-font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --sp-font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --sp-rack-u-height: 26px;
  --sp-grid-unit: 16px;
}
[data-theme="light"] {
  --sp-bg-app: #f4f4f4;
  --sp-bg-panel: #ffffff;
  --sp-bg-canvas: #fafafa;
  /* … pozostałe wg tabel § 2 … */
  --sp-led-glow: 0 0 0;
}
```

- Kolor VLANu w komponencie: `var(--sp-vlan-${key})`, a dla własnego hexa — wartość wprost.
- SVG łączy i sylwetek używa `currentColor` / zmiennych — bez kolorów wpisanych w pliki SVG.
- Storybook nie jest planowany (hobby, mały zespół); zamiast niego trasa deweloperska `#/dev/design` renderująca wszystkie komponenty i stany w obu motywach — źródło zrzutów do testów wizualnych w Playwright.

---

## 10. Wpływ na inne dokumenty

Zmiany w `02` i `03` są już naniesione; makiety poprawione w artboardzie „Editor — dark (corrected)” (`05` § 14).

| Dokument             | Zmiana                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `02-model-danych.md` | `Vlan.color`, `Zone.color`, `Tag.color`: `HexColor` → `ColorRef = PaletteKey \| HexColor` (klucz palety lub własny hex). Migracja: znane hexy → najbliższy klucz. |
| `03-architektura.md` | Fonty self‑hosted (`@fontsource/*`); lint zakazujący surowej palety Tailwind; test kontrastu tokenów w CI; trasa `#/dev/design`.                                  |
| Makiety              | IoT: żółty → `pink`; numeracja U 10 px; `text-muted` `#959595`. Poprawki przy projekcie UI (`05-projekt-ui.md`).                                                  |

## 11. Rozstrzygnięte kwestie

| #   | Kwestia                                                                             | Decyzja                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS1 | Czy jasny motyw dostaje wariant canvasu „papier” (kremowy, jak rysunek techniczny)? | **Nie w MVP** — neutralny `#fafafa`; ewentualnie później jako trzeci motyw.                                                                                   |
| DS2 | Gęstość: tryb kompaktowy dla dużych labów (kafelki bez ciała, 1U = 20 px)?          | **P1** — jeden przełącznik gęstości w ustawieniach widoku; komponenty canvasu od początku parametryzowane tokenami wymiarów, żeby tryb nie wymagał przeróbek. |

## 12. Korekty po weryfikacji kontrastu (2026-11-11)

Automatyczna kontrola `pnpm tokens:check` (etap 0) wykazała, że część par z v0.1 nie spełniała progów WCAG. Poprawione wartości (już w tabelach powyżej):

| Token | Było | Jest | Powód |
|---|---|---|---|
| `border-strong` dark / light | `#5c5c5c` / `#a3a3a3` | `#6b6b6b` / `#8a8a8a` | ramki lokalizacji < 3:1 na `bg-canvas` |
| `port-wan` dark / light | `#5c5c5c` / `#a3a3a3` | `#6b6b6b` / `#8a8a8a` | łącze WAN < 3:1 na `bg-canvas` |
| `status-error-text` light | `#dc2626` | `#b91c1c` | 4.41:1 na `status-error-bg` |
| `status-ok` light (LED) | `#22c55e` | `#16a34a` | 2.28:1 na `bg-tile` |
| `status-warning` light (LED) | `#eab308` | `#b88a00` | 1.92:1 na `bg-tile` |
| **nowy** `selection` | — | dark `#ff7a1a` / light `#ea580c` | `accent` na białym kafelku = 2.61:1; wypełnienia `accent` bez zmian |
