---
name: release
description: Wydanie wersji aplikacji Server Planner — SemVer, changelog z Conventional Commits, tag, deploy na GitHub Pages, notatki wydania. Użyj, gdy użytkownik chce wydać wersję, opublikować MVP, przygotować changelog lub sprawdzić deploy.
---

# Wydanie wersji

Deploy: `deploy.yml` buduje i publikuje `apps/web` na GitHub Pages po każdym push na `main` (`https://<user>.github.io/server-planner/`). Wydanie = nazwany punkt w historii z changelogiem.

## Wersjonowanie

- SemVer; `0.x` do wydania MVP (`01` § 6), `1.0.0` = MVP gotowe.
- `minor` — nowe funkcje; `patch` — poprawki; zmiana `schemaVersion` projektu w `0.x` → `minor`, po 1.0 → `major` tylko gdy brak automatycznej migracji (z migracją: `minor`).
- Wersja w `apps/web/package.json` (źródło `appVersion` w eksporcie i `minAppVersion` katalogu).

## Kroki (tylko na prośbę użytkownika)

1. `main` czysty, CI zielone: `gh run list --branch main --limit 3`.
2. Pełne kontrole lokalnie: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`.
3. Changelog z commitów od ostatniego tagu:

   ```bash
   git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --pretty='%s'
   ```

   Pogrupuj: Features · Fixes · Performance · Catalog · Docs; pomiń `chore(catalog)` bota (podsumuj jednym wierszem „Catalog updated to 2026.NN”). Dopisz na górę `CHANGELOG.md` (EN).
4. Podbij wersję, commit `chore(release): v0.4.0` (skill `commit`), tag `git tag -a v0.4.0 -m "v0.4.0"`.
5. Push z tagiem (`git push --follow-tags`) → `deploy.yml`.
6. `gh release create v0.4.0 --notes-file -` z sekcją changelogu; zaznacz migracje schematu.
7. Po deployu: otwórz stronę, sprawdź wersję w About, import fixture'a z poprzedniej wersji, smoke test Playwright w workflow.
8. `docs/STATUS.md`: wpis w dzienniku.
