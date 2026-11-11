---
name: add-source-adapter
description: Dodanie lub zmiana źródła danych katalogu w packages/catalog-builder Server Planner — weryfikacja licencji, SourceAdapter (fetch/normalize), budżet zapytań, próbki do testów offline, bezpieczniki i atrybucja. Użyj, gdy użytkownik chce pobierać dane z nowej strony/API lub gdy istniejący adapter przestał działać.
---

# Źródło danych katalogu

Zasady i istniejące źródła: `docs/06-zrodla-danych.md`. Builder i workflow: `docs/03` § 7 (`SourceAdapter`, kroki uruchomienia, `catalog-update.yml`).

## 1. Najpierw licencja (bramka)

Sprawdź i zapisz w `docs/06` § 1:

- licencja danych / warunki API; czy pozwalają na **automatyczne pobieranie i redystrybucję** w katalogu CC‑BY‑SA 4.0;
- limity zapytań, wymagane uwierzytelnienie;
- format i stabilność (oficjalne API > zrzut > strona HTML).

Brak licencji lub zakaz → **nie implementuj**; wpisz jako ❌ w `06` z powodem i poinformuj użytkownika (wyjątek: czyste fakty techniczne z oficjalnego publicznego API — tylko po zgodzie użytkownika).

## 2. Adapter (`packages/catalog-builder/src/sources/<id>.ts`)

```ts
export const exampleSource: SourceAdapter = {
  id: 'example',
  name: 'Example API',
  url: 'https://example.org',
  license: 'CC0-1.0',
  async fetch(http) {
    // http: wrapper z User-Agent, timeoutem, retry i budżetem
    return http.json('https://api.example.org/v1/items', { budget: 1 });
  },
  normalize(raw) {
    // → SourceRecord[] (fragmenty CatalogApp/Device/Cpu)
    return parseItems(raw).map(toRecord);
  },
};
```

- Rejestracja w `sources/index.ts` z priorytetem scalania.
- `User-Agent: server-planner-catalog/<wersja> (+repo URL)`; timeout; max 1 przebieg/tydzień (blokada w `state.json`).
- Duże zrzuty: parsowanie strumieniowe (jak Blender Open Data).
- Każdy rekord: `source: ['<id>']`, `confidence: imported` (lub `estimated`).
- Mapowanie tożsamości (slug aplikacji, `vendor-model`, aliasy CPU) — przez `catalog/curated/*aliases.yml`, nie zgadywanie.

## 3. Testy offline

- Próbka odpowiedzi: `packages/catalog-builder/test/samples/<id>/*.json` (mała, zanonimizowana, zgodna z licencją).
- Test `normalize` na próbce + test bezpieczników (spadek > 20% rekordów, błąd sieci → dane z poprzedniej wersji).
```bash
pnpm test --filter catalog-builder
pnpm catalog:build -- --only <id> --dry-run
```

## 4. Workflow i sekrety

- Nowy sekret (token API) → `catalog-update.yml` (`env`), opis w `docs/03` § 7.2 i `implementation.md`; adapter działa też bez tokenu (gorszy limit) lub zgłasza `status: failed`.
- Nigdy nie commituj tokenów ani surowych zrzutów.

## 5. Atrybucja i dokumentacja

- `docs/06`: tabela § 1, sekcja źródła, budżet w § 4, atrybucja § 5.
- Strona About › Data sources (P‑03b) czyta `manifest.sources` — sprawdź, że źródło się pojawia.
- Commit: `feat(builder): add <id> source adapter`.
