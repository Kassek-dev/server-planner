# Server Planner — źródła danych katalogu (v0.1)

> Status: **zaakceptowany, adaptery zweryfikowane na żywo (v0.2)** · Data: 2026-11-12
> Podstawa: `01-funkcjonalnosci.md` rozdz. 5 (D3, D6, D7), `02-model-danych.md` rozdz. 9, `03-architektura.md` (catalog builder, `SourceAdapter`)
> Zamyka otwarte kwestie z `01` rozdz. 8: licencje źródeł i źródło wydajności CPU.

---

## 0. Zasady doboru źródeł

1. **Tylko źródła, których licencja lub warunki pozwalają na automatyczne pobieranie i redystrybucję** w katalogu na CC‑BY‑SA 4.0 (D6). Brak licencji = nie pobieramy (wyjątek: czyste dane techniczne z oficjalnego, publicznego API — patrz LinuxServer.io).
2. **Automatyzacja przed ręcznym wpisywaniem.** Ręcznie kurujemy tylko to, czego nie ma nigdzie (wzorce ruchu, przepływy, modele sprzętu homelabowego).
3. **Raz na tydzień** (D7): wszystkie adaptery w jednym przebiegu workflow; każde źródło ma budżet zapytań.
4. **Awaria źródła nie psuje katalogu**: adapter z błędem → dane tego źródła z poprzedniej wersji `dist` (03 § catalog builder).
5. **Każdy rekord zna pochodzenie** (`source[]`) i pewność (`confidence`).

---

## 1. Podsumowanie

| Źródło                                     | Dane                                                                                    | Licencja / warunki                                                             | Dostęp                                                             | Decyzja                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **awesome-selfhosted-data**                | lista aplikacji, opisy, licencje, tagi, linki, platformy                                | **CC‑BY‑SA 3.0** (adaptacja na 4.0 dozwolona klauzulą „later version”)         | repo Git, pliki YAML `software/*.yml`                              | ✅ podstawowe źródło listy aplikacji                                 |
| **Proxmox VE Community Scripts**           | domyślne CPU / RAM / dysk, port interfejsu, kategorie                                   | **MIT**                                                                        | JSON metadanych skryptów (lokalizacja do potwierdzenia, § 2.2)     | ✅ główne źródło wymagań zasobowych                                  |
| **LinuxServer.io API**                     | obrazy, architektury, **porty, wolumeny**, wersje                                       | brak opublikowanej licencji; oficjalne publiczne API                           | `GET https://api.linuxserver.io/api/v1/images?include_config=true` | ✅ tylko dane techniczne (fakty), z atrybucją                        |
| **Docker Hub API**                         | tagi, architektury, rozmiar obrazu, data aktualizacji                                   | warunki Docker Hub; limit **100 zapytań / 6 h / IP** bez logowania             | `hub.docker.com/v2/repositories/{ns}/{repo}/tags`                  | ✅ tylko dla obrazów z katalogu                                      |
| **Blender Open Data**                      | **wydajność CPU i GPU** z wyników użytkowników                                          | **CC0 1.0** (plik licencji w zrzucie)                                           | codzienny zrzut JSON / eksport CSV                                 | ✅ automatyczne źródło `perf`                                        |
| **Wikidata**                               | specyfikacje CPU (rdzenie, wątki, taktowanie, TDP — pokrycie nierówne)                  | **CC0**                                                                        | SPARQL (`query.wikidata.org`)                                      | ✅ uzupełniająco, do weryfikacji pokrycia                            |
| **Warstwa kurowana (nasza)**               | wzorce ruchu, przepływy, poprawki wymagań, modele mini PC / NAS / sieci, CPU homelabowe | CC‑BY‑SA 4.0                                                                   | YAML w `catalog/curated/`                                          | ✅                                                                   |
| selfh.st                                   | katalog aplikacji                                                                       | brak licencji danych i API („©2026 selfh.st”)                                  | —                                                                  | ❌ nie pobieramy; link w README i na stronie About                   |
| PassMark                                   | wydajność CPU                                                                           | dane wymagają płatnej licencji; zakaz odtwarzania i przedstawiania jako własne | —                                                                  | ❌                                                                   |
| UserBenchmark                              | wydajność CPU                                                                           | brak licencji i API; kontrowersyjna metodologia ważenia wyników                | —                                                                  | ❌                                                                   |
| Geekbench Browser                          | wydajność CPU                                                                           | brak API i zrzutów; warunki nie potwierdzone                                   | —                                                                  | ❌ (ewentualnie po zgodzie Primate Labs)                             |
| OpenBenchmarking.org                       | wydajność                                                                               | licencja wyników nieustalona                                                   | —                                                                  | ⏸ do ponownego sprawdzenia później                                   |
| Intel ARK, TechPowerUp, strony producentów | specyfikacje                                                                            | brak API; warunki zwykle zabraniają automatycznego pobierania                  | —                                                                  | ❌ automatycznie; ✅ ręcznie jako źródło faktów w warstwie kurowanej |

---

## 2. Aplikacje

### 2.1 awesome-selfhosted-data

- **Co bierzemy:** nazwa, opis, strona, repozytorium kodu, licencje oprogramowania, platformy (`docker`, `python`…), tagi/kategorie, gwiazdki i data ostatniej aktualizacji (do sortowania popularności i oznaczania porzuconych projektów).
- **Pobieranie:** płytki klon repo (`git clone --depth 1`) albo archiwum gałęzi głównej — jedno pobranie tygodniowo.
- **Filtr:** tylko wpisy z platformą `docker` (D2: Docker jako sposób instalacji) lub obecne w innym źródle; pomijamy oznaczone jako archiwalne / nieutrzymywane.
- **Atrybucja:** nazwa projektu, link, licencja CC‑BY‑SA i odnośnik do pliku `AUTHORS` na stronie About.
- **Do weryfikacji przy adapterze:** dokładny schemat YAML (szablon w `.github/ISSUE_TEMPLATE/addition.md`).

### 2.2 Proxmox VE Community Scripts

- **Co bierzemy:** `install_methods[].resources` (`cpu`, `ram` w MB, `hdd` w GB, `os`, `version`) → `requirements.recommended` z `confidence: imported`; port interfejsu WWW → listener `web-ui`; kategorie.
- **Uwaga — LXC, nie Docker:** zasoby dotyczą kontenera LXC z całym systemem; dla kontenera Docker przyjmujemy je jako górne oszacowanie (RAM × 0.75, dysk bez systemu bazowego). Współczynniki w `catalog/curated/heuristics.yml`.
- **Lokalizacja danych (zweryfikowane 2026-11-12):** JSON-y frontendu przeniesiono do archiwalnego repo (`ProxmoxVE-Frontend-Archive`, ostatnio 2026-03), a `api.community-scripts.org` zwracało 503. Adapter czyta więc **bieżące skrypty `ct/*.sh`** z archiwum gałęzi `main` repo `ProxmoxVE` (jedno pobranie ~1 MB): `APP`, `var_cpu`, `var_ram` (MB), `var_disk` (GB), `var_tags`. Portu interfejsu w skryptach nie ma — porty pochodzą z LinuxServer.io.
- **Atrybucja:** licencja MIT, link do projektu.

### 2.3 LinuxServer.io

- **Endpoint:** `https://api.linuxserver.io/api/v1/images?include_config=true` — jedno zapytanie zwraca wszystkie obrazy; dane odświeżane kilka razy dziennie po ich stronie.
- **Co bierzemy:** nazwa obrazu (`lscr.io/linuxserver/<name>`), kategoria, `architectures`, `config.ports` (wewnętrzny/zewnętrzny, opis, opcjonalność), `config.volumes`, `deprecated`.
- **Status prawny:** brak opublikowanej licencji API → bierzemy wyłącznie **fakty techniczne** (porty, ścieżki, architektury), bez opisów i logotypów; atrybucja na stronie About. Jeśli LinuxServer opublikuje warunki sprzeczne z tym użyciem — adapter wyłączamy.

### 2.4 Docker Hub

- **Co bierzemy:** dla obrazów już obecnych w katalogu: lista tagów (`latest` + najnowszy semver), architektury, rozmiar skompresowany, data ostatniego wypchnięcia.
- **Budżet:** ≤ 300 aplikacji × 1 zapytanie = poniżej limitu przy rozłożeniu na 3 okna, **lub** uwierzytelnienie tokenem (sekret `DOCKERHUB_TOKEN` w GitHub Actions, konto bezpłatne) — preferowane. Respektowanie nagłówków `ratelimit-remaining`; przy wyczerpaniu limitu — pozostałe rekordy z poprzedniej wersji.

### 2.5 Warstwa kurowana

- **Wzorce ruchu i przepływy** (D4): ręcznie dla top ~30–50 aplikacji; reszta generowana z portów z `confidence: estimated` (01 § 5.2).
- **Poprawki wymagań**: nadpisania dla aplikacji, gdzie dane importowane są mylące (np. Immich ML, Jellyfin z transkodowaniem).
- **Mapowanie tożsamości** (`catalog/curated/app-aliases.yml`): łączenie rekordów z różnych źródeł po slugach (`jellyfin` ↔ `linuxserver/jellyfin` ↔ `jellyfin/jellyfin`).

---

## 3. Sprzęt

### 3.1 Wydajność CPU (i GPU) — Blender Open Data

Odpowiedź na wymaganie: **automatycznie, z wyników użytkowników, bez ręcznego wpisywania.**

- **Źródło:** `opendata.blender.org` — wyniki Blender Benchmark przesyłane przez użytkowników, CPU i GPU. Dane deklarowane jako wolne od praw autorskich; dostępny **codzienny zrzut surowych danych JSON**.
- **Co liczymy:** dla każdej nazwy urządzenia — **mediana** wyniku (samples/min) per scena (`monster`, `junkshop`, `classroom`) ze **wszystkich wersji Blendera od 3.0** (benchmark v3), tylko urządzenia z **≥ 5 wynikami**. Zmiana względem planu (2026-11-12): wyników z ostatnich 2 wersji jest za mało (np. i5‑8500T ma łącznie 21 wyników), a mediana jest odporna na wartości odstające, więc osobne odcinanie 1.5 IQR pominięto. Wynik = suma median scen wspólnych z CPU referencyjnym. Zrzut ma licencję **CC0** (`LICENSE.txt` w archiwum).
- **Normalizacja:** `score = 100 × wynik / wynik(CPU referencyjny)`. Referencja: **Intel Core i5‑8500T** (typowy mini PC homelabowy) = 100. Dzięki temu UI może mówić „~2.4× pve1”.
- **Dopasowanie nazw:** normalizator nazw CPU (usuwa „CPU @ 2.10GHz”, „(R)”, „(TM)”, liczbę rdzeni w nazwie AMD) + słownik aliasów `catalog/curated/cpu-aliases.yml`. Niedopasowane nazwy trafiają do raportu w `CHANGELOG.json` (lista do uzupełnienia aliasów).
- **Rozmiar:** zrzut jest duży — workflow pobiera go strumieniowo i agreguje w locie; do repo trafiają tylko zagregowane wyniki (`dist/perf.json`, kilkaset KB).
- **Pewność:** `confidence: imported`, pole `samples` (liczba wyników).
- **Braki:** CPU bez wyników w Blender Open Data (część mobilnych/energooszczędnych, np. starsze Celerony) → **szacunek** z rdzeni, wątków, taktowania boost i generacji (formuła w `catalog/curated/heuristics.yml`) z `confidence: estimated`; w UI oznaczone „≈”.
- **Wartość użytkownika:** pole `perf.score` można nadpisać ręcznie w projekcie (`source: 'user'`).
- **Ograniczenie, które komunikujemy w UI:** to wydajność renderowania (obciążenie wielowątkowe, zbliżone do transkodowania programowego i kompilacji), nie odzwierciedla wydajności jednowątkowej ani I/O. Tooltip: „Relative multi-core performance, based on Blender Open Data community results”.
- **GPU:** te same dane dają ranking GPU — przydatne dla HW‑05 (P1).

### 3.2 Specyfikacje CPU

- **Wikidata (CC0)**: zapytanie SPARQL o procesory Intel/AMD z liczbą rdzeni, wątków, taktowaniem, TDP. Pokrycie nierówne — adapter raportuje braki.
- **Warstwa kurowana**: ~100 CPU popularnych w homelabach (Intel N100/N150/N305, i3/i5/i7 T‑series 6.–14. gen., Ryzen 5/7 mobilne i desktopowe, Xeon E3/E5/E‑2xxx, Raspberry Pi SoC) wpisanych z kart producentów (fakty, nie kopia bazy). Priorytet: `curated` > Wikidata.
- **Automatyczne podpowiedzi braków:** CPU, które pojawiają się w Blender Open Data z dużą liczbą wyników, a nie mają specyfikacji, trafiają do raportu „do uzupełnienia” w Issue tworzonym przez workflow.

### 3.3 Urządzenia (mini PC, NAS, sieć)

Brak otwartych źródeł → **warstwa kurowana** (YAML): Lenovo Tiny, HP Mini, Dell Micro, Intel NUC, Minisforum, Beelink, Synology, QNAP, UGREEN, Raspberry Pi; MikroTik, Ubiquiti, TP‑Link Omada. Pola: model, CPU (ref. do katalogu CPU), sloty RAM i max, kieszenie dysków, NIC, pobór mocy, **forma** (`formFactor`, D9). Wkład społeczności przez PR (szablon YAML + walidacja w CI).

### 3.4 Ceny

P2 — bez źródła automatycznego; pole ręczne w projekcie.

---

## 4. Workflow — przebieg tygodniowy

| Kolejność | Adapter                 | Zapytania               | Czas (szac.) |
| --------- | ----------------------- | ----------------------- | ------------ |
| 1         | awesome-selfhosted-data | 1 (git)                 | < 1 min      |
| 2         | Community Scripts       | 1–2                     | < 1 min      |
| 3         | LinuxServer.io          | 1                       | < 1 min      |
| 4         | Docker Hub              | ≤ 300 (token)           | ~5 min       |
| 5         | Blender Open Data       | 1 (zrzut, strumieniowo) | ~5–10 min    |
| 6         | Wikidata                | 1–3 (SPARQL)            | < 1 min      |

Każde zapytanie z nagłówkiem `User-Agent: server-planner-catalog/<wersja> (+https://github.com/<user>/server-planner)`. Limit czasu workflow: 30 min.

---

## 5. Atrybucja w aplikacji (strona About / Data sources)

Dla każdego źródła: nazwa, link, licencja, co z niego pochodzi, data ostatniego pobrania (z `manifest.json`). Katalog jako całość: CC‑BY‑SA 4.0, z informacją, że zawiera dane awesome‑selfhosted (CC‑BY‑SA 3.0, autorzy w pliku `AUTHORS`). Dodatkowo sekcja „Recommended” z linkiem do selfh.st (bez danych).

## 6. Zmiany w innych dokumentach

| Dokument           | Zmiana                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `01` § 5.2, 5.3, 8 | Źródła rozstrzygnięte: selfh.st usunięte z pobieranych; CPU perf = Blender Open Data; brak otwartych pytań.              |
| `02` § 4.1, 9.4    | `CpuSpec.perfScore` → `perf?: { score: number; source: 'blender-opendata' \| 'estimated' \| 'user'; samples?: number }`. |
| `03`               | Sekret `DOCKERHUB_TOKEN` (opcjonalny); adapter Blender ze strumieniowym parsowaniem JSON.                                |
