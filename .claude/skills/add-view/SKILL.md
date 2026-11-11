---
name: add-view
description: Dodanie nowego widoku w Server Planner — strony, widoku projektu, panelu inspectora, szuflady, dialogu, nakładki lub stanu — zgodnie ze spisem widoków i sitemapą (docs/07). Użyj przy tworzeniu nowej trasy, ekranu, panelu, dialogu albo gdy widok z docs/07 jest implementowany.
---

# Nowy widok

Spis wszystkich widoków i schemat adresów: `docs/07-mapa-widokow.md`. Zachowania: `docs/05-projekt-ui.md`. Wygląd: skill `design-system`.

## 1. Ustal tożsamość widoku

| Typ               | Prefiks     | Gdzie w kodzie                                                 | Adres                     |
| ----------------- | ----------- | -------------------------------------------------------------- | ------------------------- |
| Strona            | `P-`        | `apps/web/src/app/routes/`                                     | trasa `#/…`               |
| Widok projektu    | `V-`        | `apps/web/src/features/<feature>/views/`                       | `#/p/:id/<view>`          |
| Inspector / panel | `I-` / `X-` | `apps/web/src/features/inspector/` · `simulation/` · `issues/` | `?sel=` `?tab=` `?panel=` |
| Szuflada          | `S-`        | `apps/web/src/features/network/drawers/` (itp.)                | `?panel=<name>`           |
| Dialog            | `D-`        | `apps/web/src/features/<feature>/dialogs/`                     | brak                      |
| Nakładka          | `O-`        | `apps/web/src/features/canvas/overlays/`                       | brak                      |
| Stan              | `T-`        | wariant istniejącego widoku                                    | —                         |
| Mobile            | `M-`        | ten sam komponent, układ < 768 px                              | ta sama trasa             |

Jeśli widoku nie ma w `07` — najpierw dopisz go (ID, trasa, zawartość, funkcje z `01`, priorytet), zaktualizuj sitemapę (mermaid + drzewo tekstowe) i zapytaj użytkownika, jeśli zmienia to zakres.

## 2. Routing i stan URL

- Hash routing (React Router). Trasy stron i widoków projektu w jednym pliku konfiguracji tras.
- Parametry projektu: `sel` (lista ID), `tab`, `panel` (`issues|sim|vlans|firewall:<deviceId>|tags|settings|assertions`), `sim` (`reach&from=&to=&port=`). Parsuj/serializuj w jednym helperze (`apps/web/src/app/url-state.ts`); stan UI (uiStore) synchronizowany z URL.
- Zmiana widoku zachowuje `sel`. Dialogi i nakładki bez adresu; Esc i Wstecz zamykają.
- Nieznana trasa / brak projektu → P‑04 Not found.

## 3. Implementacja

1. Komponent widoku + stany `T-*` (pusty, ładowanie, błąd, tylko odczyt) od razu.
2. Dane tylko przez selektory store'ów; zmiany tylko przez komendy z `packages/model`.
3. Teksty w przestrzeni nazw i18n feature'u (`en/<ns>.json`); tytuł strony (`document.title`) też przez i18n.
4. Mobile < 768 px: tylko odczyt (`05` § 12) — ukryj akcje edycji, użyj dolnego arkusza zamiast inspectora.
5. Klawiatura i fokus: dialog łapie fokus i zwraca go po zamknięciu; panel ma nagłówek z przyciskiem „wstecz”.
6. Galeria `#/dev/design`: dodaj widok/dialog w stanach kluczowych (dla zrzutów wizualnych).

## 4. Testy

- Jednostkowe dla logiki (parsowanie URL, selektory).
- E2E (Playwright), jeśli widok jest na ścieżce A/B z `01` § 4.

## 5. Dokumentacja

- `07`: kolumna „Makieta” / dopisek o implementacji; sitemapa, jeśli nowa trasa.
- `05`: zachowanie, jeśli odbiega od opisu.
- `docs/STATUS.md`: pozycja etapu.
- Nowa makieta potrzebna? → skill `design-mockup`.
