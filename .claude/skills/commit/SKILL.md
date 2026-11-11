---
name: commit
description: Zapisanie postępu pracy w Server Planner — kontrole jakości, aktualizacja docs/STATUS.md, commit w konwencji Conventional Commits, opcjonalnie branch i PR. Użyj, gdy użytkownik prosi o commit, zapisanie zmian, „zapisz postęp”, push lub PR.
---

# Commit i zapis postępu

Commit i push wykonuj **tylko na prośbę użytkownika**. Ten skill opisuje, jak to zrobić dobrze.

## 1. Sprawdź stan

```bash
git status --short
git diff --stat
git branch --show-current
```

- Repo nie istnieje? (przed etapem 0) — zaproponuj `git init -b main`, nie rób tego bez zgody.
- Na `main` z niewypchniętymi zmianami funkcjonalnymi? Zaproponuj branch: `git switch -c <typ>/<scope>-<krótki-opis>` (np. `feat/canvas-rack-snapping`). Drobne zmiany dokumentacji mogą iść na `main`, jeśli użytkownik tak woli.
- Sprawdź, czy w diffie nie ma sekretów, plików `.env`, dużych binariów, zmian w `catalog/dist/` (te robi tylko bot).

## 2. Kontrole (zanim zacommitujesz kod)

```bash
pnpm lint && pnpm typecheck && pnpm test
```
Dodatkowo, jeśli zmiana dotyczy:

- tekstów UI → `pnpm i18n:check`
- tokenów / stylów → `pnpm tokens:check`
- `catalog/curated/` → `pnpm catalog:validate`
- przepływów E2E → `pnpm test:e2e`

Coś nie przechodzi → **nie commituj**; pokaż użytkownikowi wynik i zapytaj (napraw / commit z `wip:` na branchu / przerwij).

## 3. Zaktualizuj ślad pracy

- `docs/STATUS.md` — odhacz ukończone pozycje etapu, dopisz wiersz w „Dziennik” (data, co, commit po zrobieniu).
- `docs/07-mapa-widokow.md` — status makiety/implementacji widoku, jeśli dotyczy.
- Zmiana zachowania lub decyzja → skill `record-decision` przed commitem.

## 4. Wiadomość commita — Conventional Commits (po angielsku)

```
<type>(<scope>): <imperative summary, ≤ 72 chars, lowercase>

<body: what and why, wrapped at 72; reference feature IDs from docs/01 and view IDs from docs/07>

Refs: CAN-04, LOC-04, V-01
```
**type**: `feat` · `fix` · `refactor` · `perf` · `test` · `docs` · `build` · `ci` · `chore` · `style` (formatowanie) · `revert`
**scope**: `web` · `canvas` · `inspector` · `simulation` · `capacity` · `network` · `projects` · `persistence` · `model` · `engine` · `catalog` · `builder` · `design` · `i18n` · `docs` · `ci` · `deps`

- Breaking change w formacie projektu/katalogu: `feat(model)!: …` + stopka `BREAKING CHANGE: …` (zawsze z migracją).
- Commity bota katalogu: `chore(catalog): 2026.46` — nie używaj tego formatu ręcznie.
- Jeden commit = jedna logiczna zmiana. Duży diff podziel (`git add -p` nie jest interaktywny w tym środowisku — dodawaj pliki/ścieżki selektywnie).
- Gdy commit tworzy Claude, dodaj na końcu trailer `Co-Authored-By` zgodny z bieżącą instrukcją Claude Code.

Przykład:

```
feat(canvas): snap rack-mount devices to free U slots

Dropping a rack-mount device into a rack now snaps to the nearest
free slot and previews "U9–U8"; occupied or too small slots reject
the drop with a toast. Placement is stored via device.place.

Refs: LOC-04, O-06
```

Commit przez HEREDOC:

```bash
git add <ścieżki>
git commit -F - <<'EOF'
feat(canvas): …

…
EOF
```

## 5. Push i PR (tylko gdy użytkownik prosi)

```bash
git push -u origin HEAD
gh pr create --title "<jak commit>" --body-file - <<'EOF'
## Summary
- …

## Docs / IDs
- Features: …  · Views: …

## Checks
- [x] lint · typecheck · test
- [ ] e2e (if UI flow changed)
EOF
```
Opis PR zakończ linią atrybucji zgodną z bieżącą instrukcją Claude Code. Merge: **squash** (historia `main` = lista Conventional Commits → changelog).

## 6. Raport

Krótko: hash commita, branch, co weszło, wyniki kontroli, link do PR. Jeśli coś pominięto (np. E2E) — powiedz wprost.
