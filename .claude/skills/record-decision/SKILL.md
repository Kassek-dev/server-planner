---
name: record-decision
description: Zapis decyzji i zmian w dokumentacji Server Planner — log decyzji D-xx, ADR, tabele „Rozstrzygnięte kwestie”, wersje dokumentów, propagacja zmian między docs/01–07. Użyj, gdy użytkownik podejmuje decyzję, akceptuje propozycję, zmienia zakres lub gdy kod odbiega od dokumentacji.
---

# Zapis decyzji i aktualizacja dokumentacji

Dokumentacja w `docs/` jest po polsku i jest źródłem prawdy. Każda decyzja musi trafić w jedno właściwe miejsce i zostać przeniesiona do dokumentów, na które wpływa.

## Gdzie zapisać

| Rodzaj decyzji                                | Miejsce                                                                 | Format                                             |
| --------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| Produktowa / zakresowa (co aplikacja robi)    | `docs/01-funkcjonalnosci.md` § 0 — kolejne `D<n>`                       | wiersz: decyzja (pogrubiona istota) · konsekwencje |
| Architektoniczna (jak zbudowane)              | `docs/adr/NNN-tytul-kebab.md` + wiersz w `03` § 12                      | kontekst → decyzja → konsekwencje → alternatywy    |
| Rozstrzygnięcie otwartej kwestii w dokumencie | tabela „Rozstrzygnięte kwestie” tego dokumentu (M1, A1, DS1, UI1, MW1…) | `# · Kwestia · Decyzja` (decyzja pogrubiona)       |
| Nowa funkcja                                  | tabela modułu w `01` § 3 z nowym ID i priorytetem                       | `                                                  | XXX-NN | opis | P0/P1/P2 | `   |
| Nowy widok                                    | `docs/07` (właściwa tabela + sitemapa)                                  | skill `add-view`                                   |

Szablon ADR:

```markdown
# ADR NNN: <tytuł>

- Status: accepted · Data: YYYY-MM-DD
## Kontekst

## Decyzja

## Konsekwencje

## Rozważone alternatywy
```

## Propagacja (sprawdź każdy punkt)

- `01` (funkcje, MVP § 6) ↔ `02` (typy) ↔ `03` (architektura, CI) ↔ `04` (tokeny) ↔ `05` (zachowania) ↔ `06` (źródła) ↔ `07` (widoki).
- Zmiana typu w `02` → przykład JSON w `02` § 12, fixture'y, ewentualnie migracja (skill `schema-change`).
- Zmiana widoku → `05` (zachowanie) i `07` (spis, status makiety).
- Zmiana zakresu MVP → `01` § 6 i `docs/STATUS.md`.

## Wersje dokumentów

Nagłówek każdego dokumentu: `> Status: **…, vX.Y** · Data: YYYY-MM-DD` i linia „Podstawa: …” z wersjami dokumentów źródłowych. Zmiana merytoryczna → podbij wersję minor i datę (dzisiejsza, bezwzględna). Zaktualizuj „Podstawa” w dokumentach zależnych.

## Otwarte kwestie

Nowa wątpliwość, której nie rozstrzyga użytkownik od razu → tabela „Otwarte kwestie” w dokumencie, z **propozycją** (rekomendacją). Nie implementuj na podstawie nierozstrzygniętej kwestii — zapytaj.

## Styl

- Polski, zwięźle, tabele zamiast długiej prozy; identyfikatory i nazwy techniczne po angielsku w `kodzie`.
- Daty bezwzględne (2026-11-11), nie „wczoraj”.
- Bez powtarzania treści między dokumentami — odsyłaj (`02` § 4.3).
