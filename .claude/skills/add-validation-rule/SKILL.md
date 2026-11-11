---
name: add-validation-rule
description: Dodanie reguły walidacji (VAL-xx) do silnika Server Planner — rejestr reguł, Issue {code, params}, tłumaczenie w issues.json, automatyczna poprawka (Fix), fixture i testy. Użyj, gdy aplikacja ma wykrywać nowy problem w projekcie (sieć, IP, VLAN, capacity, rack, zgodność OS).
---

# Nowa reguła walidacji

Architektura: `docs/03` § 5.2. Lista reguł: `docs/01` § 8a (tabela VAL). Panel: `docs/05` § 8, widok X‑02.

## 1. Zdefiniuj regułę

- Kod: kolejny wolny `VAL_NN` (lub nazwany, np. `VAL_RACK_OVERLAP`, jak w `02` § 4.3) — dopisz wiersz do tabeli w `01` § 8a z ważnością (Błąd / Ostrzeżenie).
- Ważność: `error` = projekt nie zadziała; `warning` = zadziała, ale ryzykownie; `info` = podpowiedź.
- Cel (`targets`): ID elementów, które UI zaznaczy i do których linkuje.
- Czy da się naprawić automatycznie (Fix)? Jaka komenda?

## 2. Implementacja (`packages/engine/src/validation/rules/<kebab-name>.ts`)

```ts
import type { ValidationRule } from '../types';

export const rackOverlap: ValidationRule = {
  code: 'VAL_RACK_OVERLAP',
  severity: 'error',
  run(ctx) {
    const issues = [];
    for (const rack of ctx.racks) {
      for (const [a, b] of ctx.overlappingDevices(rack)) {
        issues.push({
          code: this.code,
          severity: this.severity,
          targets: [a.id, b.id, rack.id],
          params: { a: a.name, b: b.name, rack: rack.name, units: `U${a.u}` },
          fix: {
            command: 'device.place',
            payload: { id: b.id, locationId: rack.id, u: ctx.nextFreeU(rack, b) },
          },
        });
      }
    }
    return issues;
  },
};
```

- Czysta funkcja na `EngineContext` — bez React/DOM, bez tekstu.
- Używaj indeksów z `buildGraph` / `analyzeL2` / `analyzeL3` zamiast przeszukiwać projekt.
- Dodaj do rejestru `rules` (`packages/engine/src/validation/index.ts`).
- `fix` tylko gdy poprawka jest jednoznaczna; UI pokazuje podgląd (D‑08) przed zastosowaniem.

## 3. Tłumaczenie (`apps/web/src/i18n/locales/en/issues.json`)

```json
"VAL_RACK_OVERLAP": {
  "title": "Devices overlap in rack",
  "description": "{a} and {b} both use {units} in {rack}.",
  "fix": "Move {b} to the next free slot"
}
```
Zdanie: **co** + **gdzie**; `fix` — czasownik + obiekt. Parametry ICU muszą odpowiadać `params` (sprawdza `pnpm i18n:check`).

## 4. Testy

- Fixture `fixtures/validation/<kebab-name>.json`: minimalny projekt **z** problemem i wariant **bez** (`…-ok.json`).
- Test w `packages/engine/test/validation/<kebab-name>.test.ts`: dokładny `code`, `targets`, `params`; brak fałszywych alarmów na wszystkich pozostałych fixture'ach (test zbiorczy).
- Jeśli jest `fix`: zastosowanie komendy usuwa problem.

```bash
pnpm test --filter engine
pnpm i18n:check
```

## 5. Zapis

Commit: `feat(engine): add VAL_RACK_OVERLAP rule` · `Refs: LOC-04, X-02`.
