---
name: schema-change
description: Zmiana modelu danych lub formatu pliku projektu Server Planner — typy i Zod w packages/model, schemaVersion, migracja, fixture'y każdej wersji, komendy, IndexedDB, dokumentacja docs/02. Użyj przy dodawaniu, usuwaniu lub zmianie pól encji (Device, Interface, Location, Vlan…), ID, jednostek albo struktury katalogu.
---

# Zmiana schematu danych

Model: `docs/02-model-danych.md`; migracje: § 11; plik projektu: § 3; IndexedDB: § 10. Zasady: tylko wejścia, ID z prefiksami, jednostki bazowe, domena oddzielona od `layout`.

## 1. Zaprojektuj zmianę (najpierw dokument)

- Opisz zmianę w `docs/02` (typ TS + komentarz + przykład JSON § 12) — po akceptacji użytkownika (skill `record-decision`).
- Czy to dane wejściowe? Wyliczalne → do silnika, nie do modelu.
- Czy stare pliki da się przenieść automatycznie? Jeśli nie — zapytaj użytkownika o domyślne wartości.

## 2. Kod (`packages/model`)

1. Typy TS + schemat Zod (jedno źródło: typ z `z.infer`).
2. `schemaVersion`: podbij **przy każdej zmianie niekompatybilnej wstecz** (nowe wymagane pole, zmiana znaczenia, usunięcie). Pole opcjonalne bez znaczenia dla starych danych — bez podbicia.
3. Migracja `packages/model/src/migrations/v<N>-to-v<N+1>.ts`: czysta funkcja `(old: unknown) => ProjectV<N+1>`, idempotentna, bez utraty danych (nieznane pola → `extra` / log), dopisana do łańcucha.
4. Komendy dotknięte zmianą: kaskady, niezmienniki, fabryki ID (nowy prefiks → tabela prefiksów w `02` § 1).
5. IndexedDB: zmiana store'ów → `DB_VERSION` w `apps/web/src/persistence` + `upgrade()`.

## 3. Fixture'y i testy

- `fixtures/schema/v<N>/*.json` — **zachowaj** stare fixture'y; dodaj nowe dla v<N+1>.
- Test migracji: każdy fixture z każdej starszej wersji → migracja → walidacja Zod przechodzi → oczekiwane wartości.
- Test round‑trip: eksport → import → identyczny projekt.
- Aktualizuj fixture'y silników, jeśli muszą używać nowego pola.
```bash
pnpm test --filter model
pnpm test
```

## 4. Katalog

Zmiana typów katalogu (`Catalog*`) → `CatalogManifest.schemaVersion` + `minAppVersion` w builderze + walidacja `catalog/curated` (`pnpm catalog:validate`).

## 5. UI i dokumentacja

- Import pliku z nowszej wersji → komunikat (T‑stan, `05` § 11) działa dalej.
- `02` (§ 11 tabela migracji, § 12 przykład), `03` jeśli zmienia się przepływ, `STATUS.md`.
- Commit: `feat(model)!: <zmiana>` + stopka `BREAKING CHANGE: project schema v<N+1>, migrated automatically` (skill `commit`).
