---
name: design-mockup
description: Tworzenie lub poprawianie makiet Server Planner na canvasie projektowym (artefakt Design na claude.ai) i w kopii w repo design/ — generatory, plansze bazowe, układ rzędów, zgodność z design systemem. Użyj, gdy użytkownik chce nową makietę, wariant ekranu, poprawkę planszy albo odświeżenie sitemapy.
---

# Makiety na canvasie projektowym

- Canvas (żywy, prywatny): https://claude.ai/artifact/TYyEbjsYcgZdkqFDvew6At — typ artefaktu „Design”.
- Kopia w repo: `design/canvas/project/` (`canvas.json` + `*.dc.html`) i generatory `design/generators/`.
- Spis widoków i status makiet: `docs/07-mapa-widokow.md`. Wygląd: skill `design-system`.

## Zasady

1. **Najpierw przeczytaj artefakt** (`Artifact` action `read` z `url`, potem `paths` z `project/canvas.json` i plansz, które zmieniasz) — użytkownik mógł edytować plansze ręcznie. Lokalna kopia może być nieaktualna.
2. Pliki plansz: pełne `.dc.html` (szablon i reguły w instrukcji typu artefaktu — przeczytasz je przy `read`), root o stałym rozmiarze 1280×800 (desktop) lub 390×844 (mobile), wszystkie style inline, fonty IBM Plex z Google Fonts w `<helmet>` (tylko w makietach).
3. **Plansze bazowe** — nie zaczynaj od zera:
   - `EditorDark.dc.html` — edytor (top bar, biblioteka, canvas z racka/półką/pokojem, inspector);
   - `Projects.dc.html` — strona z top barem;
   - `Mobile.dc.html` — mobile.

   Generator `design/generators/mvp.py` zawiera prymitywy (`btn`, `seg`, `tabs`, `meter`, `segbar`, `field`, `inp`, `sel`, `table`, `dialog`, `drawer`, `inspector()`, `overlay()`) — rozszerzaj go zamiast pisać HTML ręcznie.
4. Tylko wartości tokenów z `04` (makiety są w motywie ciemnym; jasny wariant generuj mapą kolorów jak `EditorLight`).
5. Dane przykładowe spójne między planszami: lab „Home lab” (gw-01, sw-core, pi-dns, nas-01 w racku 12U; pve1 na półce; ap-living, tv-salon w salonie; VLAN 10 Mgmt violet, 20 LAN sky, 30 IoT pink; reguła #4 IoT → LAN deny; pve1 RAM 78%).
6. Układ canvasu: rzędy plansz z odstępem 80 px w poziomie i 120 px w pionie; nad każdą grupą notatka `kind: title1` ≥ 223 px nad rzędem. Plansza diagramu (sitemapa) — osobne elementy, nie jedno `<svg>` (generator `design/generators/sitemap.py`).

## Kroki

1. Read artefaktu → zapisz aktualne pliki do `design/canvas/project/` (nadpisz kopię).
2. Edytuj / wygeneruj plansze: `python3 design/generators/<gen>.py` (ścieżki względne do repo).
3. Index `canvas.json`: dodaj `boards` (x, y, w, h, title), `order`, ewentualnie `notes`; zachowaj pozostałe klucze.
4. Publikacja: `Artifact` (publish) z `url` canvasu, `root` = `design/canvas`, `file_path` = zmieniony plik (lub `canvas.json`), pozostałe w `files`. Odrzucenie z powodu nowszej wersji → przeczytaj wskazane pliki, nanieś zmianę ponownie.
5. Nie renderuj i nie rób zrzutów bez prośby użytkownika; poproś go o obejrzenie.
6. `docs/07`: status makiety (✅ / ◐); commit kopii w `design/` (`docs(design): add mockup for S-05 assertions`).
