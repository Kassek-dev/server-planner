---
name: design-system
description: Design system Server Planner (kierunek „Rack”: grafit + pomarańcz, IBM Plex) — tokeny, typografia, kształty, komponenty, stany, dostępność i checklista. Użyj przy budowie lub przeglądzie dowolnego komponentu, ekranu, kafelka urządzenia, panelu, dialogu lub stylu w apps/web.
---

# Design system — skrót roboczy

Pełna specyfikacja: `docs/04-design-system.md`. Zachowania: `docs/05-projekt-ui.md`. Makiety: `design/` i canvas https://claude.ai/artifact/TYyEbjsYcgZdkqFDvew6At (plansze „Editor — dark (corrected)”, `Mvp*`). Ten plik to ściąga — przy sprzeczności wygrywa `04`.

## Zasady (P1–P7)

1. Narzędzie, nie dekoracja — ozdobnik tylko, gdy niesie informację (LED = status, uszy = rack, nóżki = standalone).
2. **Kształt = forma fizyczna**: rack ostre narożniki (2 px) + uszy poza rackiem; standalone 6 px + sylwetka + nóżki; AP sufitowy = pigułka.
3. **Kolor = znaczenie**: pomarańcz = interakcja/zaznaczenie; czerwony/żółty/zielony = tylko status; VLAN z osobnej palety.
4. Dane techniczne (IP, porty, U, rozmiary, kody) — **IBM Plex Mono**, `tabular-nums`; reszta IBM Plex Sans.
5. Komunikaty pełnym zdaniem: co + gdzie (+ dlaczego); kod jako dodatek.
6. **Status nigdy tylko kolorem** — LED + tekst/ikona/obrys.
7. Dwa motywy od początku; ciemny domyślny.

## Tokeny (CSS `--sp-*`, plik `apps/web/src/styles/tokens.css`)

Motyw: `data-theme="dark|light"` na `<html>`. W komponentach **tylko tokeny semantyczne** (Tailwind mapuje: `bg-panel` → `var(--sp-bg-panel)`).

| Token                                    | Dark                                  | Light                                 |
| ---------------------------------------- | ------------------------------------- | ------------------------------------- |
| bg-app                                   | #141414                               | #f4f4f4                               |
| bg-panel                                 | #1c1c1c                               | #ffffff                               |
| bg-canvas · canvas-grid                  | #171717 · rgb(255 255 255/.035)       | #fafafa · rgb(0 0 0/.05)              |
| bg-raised (pływające)                    | #1f1f1f                               | #ffffff                               |
| bg-tile · bg-tile-header                 | #262626 · #2e2e2e                     | #ffffff · #f0f0f0                     |
| bg-inset · bg-container                  | #141414 · #1b1b1b                     | #f4f4f4 · #f7f7f7                     |
| border-subtle / default / strong         | #2e2e2e / #3a3a3a / #6b6b6b           | #e5e5e5 / #d4d4d4 / #8a8a8a           |
| text-primary / secondary / muted         | #ececec / #a3a3a3 / #959595           | #171717 / #525252 / #6b6b6b           |
| accent · accent-hover · on-accent        | #ff7a1a · #ff8a3d · #141414           | #ff7a1a · #f06a0a · #141414           |
| accent-text · accent-subtle · focus-ring · selection | #ff8a3d · #2e2218 · #ff8a3d · #ff7a1a           | #c2410c · #fff1e6 · #c2410c · #ea580c           |
| status ok / warning / error / info (LED) | #4ade80 / #facc15 / #ff4d4d / #5eaefc | #16a34a / #b88a00 / #ef4444 / #3b82f6 |
| status text ok / warning / error / info  | #4ade80 / #facc15 / #ff6b6b / #5eaefc | #15803d / #a16207 / #b91c1c / #2563eb |
| msg bg+border warning                    | #2a2410 + #6b5a12                     | #fefce8 + #fde047                     |
| msg bg+border error                      | #3a1414 + #7f1d1d                     | #fef2f2 + #fca5a5                     |
| msg bg+border info                       | #13233a + #1e3a5f                     | #eff6ff + #93c5fd                     |
| port-empty · port-trunk · port-wan       | #333 · #d4d4d4 · #6b6b6b              | #e5e5e5 · #404040 · #8a8a8a           |
| rack-ear · rack-screw · device-foot      | #333 · #141414 · #3a3a3a              | #e5e5e5 · #a3a3a3 · #d4d4d4           |
| led-glow                                 | `0 0 6px <c>`                         | brak + pierścień 1 px                 |

**Paleta VLAN/stref/tagów** (w danych zapisujemy klucz, nie hex — `ColorRef`):
violet #c084fc/#9333ea · sky #5eaefc/#0284c7 · teal #2dd4bf/#0d9488 · pink #f472b6/#db2777 · indigo #818cf8/#4f46e5 · sand #d6b88a/#a37b45 · lime #a3e635/#4d7c0f · cyan #67e8f9/#0891b2. Domyślnie: Mgmt violet, LAN sky, IoT pink, Guest teal, DMZ sand. Nigdy żółty/czerwony/zielony/pomarańczowy dla VLAN.

## Typografia

| Token                                                                               | Styl                                 | Użycie                          |
| ----------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------- |
| title-lg                                                                            | Sans 600 24/32                       | dialog, pusty stan              |
| title                                                                               | Sans 600 18/24                       | nazwa w inspectorze             |
| body-strong                                                                         | Sans 600 14/20                       | nazwa aplikacji                 |
| body                                                                                | Sans 400/500 13/18                   | domyślny; nazwy urządzeń 600    |
| body-sm                                                                             | Sans 400 12/16                       | metadane, podpowiedzi           |
| data / data-sm                                                                      | Mono 400 12/16 · 11/14               | IP, rozmiary, meta na kafelkach |
| label                                                                               | Mono 600 11/14 UPPERCASE (CSS) .08em | etykiety sekcji                 |
| badge                                                                               | Mono 600 10/12                       | VM / LXC / CT, numeracja U      |
| Min. 10 px. Wielkie litery tylko przez `text-transform`. Zapas +30% na tłumaczenia. |

## Przestrzeń i kształt

- Odstępy: baza 4 px (2, 4, 6, 8, 10, 12, 14, 16, 24, 32). Panele: padding 16, sekcje co 16 (+ `border-subtle`), wewnątrz 6–8.
- Układ: top bar 52 · biblioteka 232 (<1280 → pasek 56) · inspector 304 (do 400) · canvas reszta · elementy pływające 16 od krawędzi.
- Breakpointy: ≥1280 pełny · 1024–1279 pasek ikon · 768–1023 panele wysuwane · <768 tylko podgląd (dolny arkusz, cele ≥44).
- Canvas: `grid-unit` 16 px (snap), linie co 32; rack: 1U = 26 px, szyna 24, nagłówek 28, urządzenie `n×26−2`.
- Promienie: 1 port/segment · **2 rack** · 3 panele/przyciski/pola/pojemniki · **6 standalone** · pill AP.
- Głębia: ciemny bez cieni (warstwy = jasność + ramka); jasny `0 1px 2px rgb(0 0 0/.06)`, overlay `0 8px 24px rgb(0 0 0/.12)`.
- Ruch: 120 ms (hover), 200 ms (panele), 320 ms (dialog); `cubic-bezier(.2,.8,.2,1)`; `prefers-reduced-motion` → bez animacji, przepływ statyczny.

## Komponenty (`apps/web/src/ui/`) — skrót

| Komponent                          | Kluczowe reguły                                                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button                             | primary (accent + on-accent 600) — jedna na obszar · secondary (ramka default) · ghost (accent-text) · danger; wys. 32 / 28 (canvas) / 44 (mobile); ikona‑only = `aria-label` + tooltip                                     |
| Tabs (inspector)                   | równe kolumny, aktywna `bg-tile-header` + dolna belka 2 px accent                                                                                                                                                           |
| Segmented                          | wybór binarny w formularzu → aktywny wypełniony accent; przełącznik widoku → `bg-tile-header`                                                                                                                               |
| Choice tiles                       | siatka 3 kol., 58 px, sylwetka 22 + etykieta; `radiogroup`; wybrany = ramka accent + accent-subtle                                                                                                                          |
| Input / Select                     | 32, `bg-inset`, ramka default, focus = ramka accent + ring; dane techniczne mono; etykieta `label` nad polem                                                                                                                |
| LED                                | 8 px (7 w 1U), glow w dark; zawsze tooltip ze zdaniem; `off` dla planowanych                                                                                                                                                |
| Port                               | 14×12 / 12×9; wolny / access (VLAN) / trunk / WAN / błąd = obrys error / PoE kropka info                                                                                                                                    |
| Link                               | access 3 px VLAN · trunk 4 px port-trunk · WAN 2 px · Wi‑Fi 2 px przerywana 6/5; ortogonalnie; hover +1 px + chip etykiety; błąd = ✕ w połowie                                                                              |
| DeviceTile                         | rack: front, w racku bez uszu, 1U = jeden rząd (LED · nazwa · meta · porty); standalone: nagłówek z sylwetką, ciało z workloadami (odznaki), pasek RAM 10 seg., nóżki 26×4; NAS kieszenie; AP pigułka; klient kompakt 52 px |
| Stany kafelka                      | hover ramka strong · **zaznaczony 2 px `selection`** · błąd 1 px error · planowany przerywana · symulacja: poza ścieżką opacity .35                                                                                              |
| Location                           | rack: ramka strong, `bg-container`, nagłówek 28 `label`, szyna U, „7U free” przerywane; półka/pomieszczenie: ramka przerywana, bez tła; cel upuszczenia accent przerywany + accent-subtle                                   |
| SegmentBar                         | 10 (kafelek) / 20 (inspector) / =U (rack); kolor wg progu 70/90 %; pusty port-empty; `role="meter"`                                                                                                                         |
| Sim result card                    | nagłówek ALLOWED / BLOCKED / NO ROUTE z LED, ciało: ścieżka + przyczyna z linkiem                                                                                                                                           |
| Tip                                | tło/ramka komunikatu wg statusu, body-sm, 1.5                                                                                                                                                                               |
| Issue row                          | LED · zdanie · cel (link) · kod mono muted · Fix (ghost)                                                                                                                                                                    |
| Tooltip / Popover / Dialog / Toast | wg `04` § 6.14 (Radix); toast z Undo przy usuwaniu                                                                                                                                                                          |

Sylwetki urządzeń: `apps/web/src/icons/devices/` (24×24, stroke 1.6, round, `currentColor`): rack-1u, rack-2u, tower, mini-pc, desktop, nas, wall, ceiling, sbc, rack, shelf, room. Ikony UI: Lucide 16/18, stroke 1.75. Klienci: Lucide wg `clientType`.

## Jak zbudować komponent / ekran

1. Znajdź widok w `docs/07` (ID) i zachowanie w `05`; obejrzyj makietę.
2. Prymityw z Radix, jeśli istnieje (dialog, menu, popover, tabs, select, toggle group).
3. Style: Tailwind z klasami tokenów; żadnych hexów, `zinc-*`, `px` spoza skali.
4. Teksty: `t('<namespace>.<path>')` — klucze w `apps/web/src/i18n/locales/en/<ns>.json` (ICU dla liczby mnogiej).
5. Stany: default, hover, focus-visible, active, disabled, selected, error, loading, empty — i oba motywy.
6. Dodaj wszystkie stany do galerii `#/dev/design` (`apps/web/src/app/dev/design/`) — źródło zrzutów Playwright.
7. Test (Vitest + Testing Library) dla logiki i dostępności (role, nazwy).

## Checklista przeglądu

- [ ] Tylko tokeny semantyczne; działa w dark i light.
- [ ] Kontrast tekstu ≥ 4.5:1, grafik/ramek stanu ≥ 3:1 (`pnpm tokens:check`).
- [ ] Status nie tylko kolorem; LED ma tooltip.
- [ ] Zaznaczenie = 2 px `selection`; nic innego nie używa pomarańczowej ramki.
- [ ] Dane techniczne w mono; teksty z i18n, sentence case, przyciski „czasownik + obiekt”.
- [ ] Klawiatura: Tab, Enter, Esc, strzałki tam, gdzie trzeba; widoczny focus.
- [ ] Cele: ≥24 px desktop, ≥44 px mobile; ikony‑only z `aria-label`.
- [ ] `prefers-reduced-motion` respektowane.
- [ ] Komponent w galerii `#/dev/design`.
