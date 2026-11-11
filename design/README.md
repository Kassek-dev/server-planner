# design/ — makiety Server Planner

Kopia canvasu projektowego (artefakt „Design” na claude.ai) i skrypty, które generują jego plansze.

- Żywy canvas: https://claude.ai/artifact/TYyEbjsYcgZdkqFDvew6At (prywatny, właściciel: autor projektu)
- `canvas/project/canvas.json` — indeks plansz (pozycje, tytuły, notatki)
- `canvas/project/*.dc.html` — plansze (HTML z inline'owymi stylami, format artefaktu Design)
- `generators/mvp.py` — prymitywy UI i plansze `Mvp*` (bazują na `EditorDark`, `Projects`, `Mobile`)
- `generators/sitemap.py` — plansza „Sitemap”

| Rząd | Plansze                                                           |
| ---- | ----------------------------------------------------------------- |
| 1    | A Blueprint, B Studio, C Rack — kierunki wizualne (historyczne)   |
| 2    | D, E, Chosen — wybór kafelków i lokalizacji (historyczne)         |
| 3    | Editor dark/light, Projects, Simulation, Mobile — kluczowe ekrany |
| 4    | Sitemap                                                           |
| 5–9  | MVP (`docs/07` § 10)                                              |

Zasady pracy z makietami: skill `.claude/skills/design-mockup`. Źródło prawdy dla wyglądu: `docs/04-design-system.md`; makiety są ilustracją.

```bash
python3 design/generators/mvp.py       # regeneruje plansze Mvp* i canvas.json
python3 design/generators/sitemap.py   # regeneruje Sitemap.dc.html
```
Po regeneracji opublikuj zmienione pliki na canvas (skill `design-mockup`).
