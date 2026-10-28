# 角球进球预测 — source code

The live app is the single file `index.html` in the repo root (served by GitHub Pages). It is **built** from this folder.

| Path | What it is |
| --- | --- |
| `src/app.html` | Layout and styles. Placeholders `/*BUNDLE*/`, `/*CORE*/`, `/*UI*/`, `<!--SW-->` are filled by the build. |
| `src/app_core.js` | Model core (no DOM): rating replay, odds → expected goals (Dixon-Coles), minute engine for goals and corners, tempo/dominance corner distribution, bet evaluation (half, integer and quarter lines). |
| `src/app_ui.js` | UI: pre-match, live (clock, counters), market board (every entered market/side → model win/push chance, fair odds, EV, ranked; 1X2 + main goals line calibrate the model), on-screen keypad and line steppers (quarter lines shown as a/b), one/two-column layout, online refresh from open-matchday. Boards are stored per match in localStorage. |
| `src/app_net.js` | Online data without DOM (testable in node): API-Football client (user's key), fixture matching by team names (Football-Data names, open-matchday names, a Chinese name list), odds parsing (pre-match and in-play shapes, main line per market, home/away mirroring), live state, open-matchday results, bet settlement (half/integer/quarter lines, in-play handicaps counted from the bet). |
| `src/about.html` | Text of the 说明 page. |
| `src/sw.js` | Service worker. **Bump `CACHE = 'corner-ai-vN'` on every release**, or phones keep the old version. Only handles requests under its own path (other apps share the github.io origin). |
| `data/bundle.json` | Team ratings at the start of 2026/27 (GLMs refitted with season weights 0.8^(2025−season), `model/refit_recency.py`) + this season's matches (replayed in the browser), GLM coefficients, minute multipliers, dispersion and persistence parameters. Made by `model/export_bundle.py`. |
| `model/` | Python pipeline (fitting, validation, export). Paths inside are absolute to the build machine; adjust before re-running. |
| `tests/` | `uitest.py` (Playwright: iPad 1180×820 and 820×1180, iPhone 390×844 and 375×667; drives the board with the keypad only and checks every shown EV against the core, live handicap counting, stale live odds, storage migration, service worker), `uitest_net.py` (Playwright with mocked API-Football and open-matchday: link + read odds, live sync, save, results, settlement, stats, export/import, manual results), `test_net.js` (node: bet names, odds parsing, name matching for every team, settlement cases, CSV), `test_core.js` / `test_edge.js` (node: model outputs), `model/ref_check.py` (JS == Python). |
| `tools/make_icons.py` | Home-screen icons. |

## Build and release

```bash
python3 -I dev/build.py          # writes index.html, sw.js, manifest, README to the repo root (and dev/out/artifact.html)
```
Bump the cache name in `dev/src/sw.js`, rebuild, commit, push to `main`.

## Data
- Football-Data.co.uk match statistics and odds 2000/01–2026 (via github.com/xgabora/Club-Football-Match-Data-2000-2025).
- 2026/27 results with corners and shots, refreshed daily: github.com/oladeeayo/open-matchday (also used by the app's in-browser refresh).
- Event timing: StatsBomb open data and the public Wyscout dataset (github.com/koenvo/wyscout-soccer-match-event-dataset).

## Model pipeline (order)
1. `features.py` – online score-driven team ratings for corners, shots, shots on target, goals.
2. `prematch_models.py`, `fit_mkt_only.py` – corner GLMs (with/without market odds), fallback goals GLM.
3. `corner_dist.py`, `corner_eval2.py` – tempo/dominance dispersion; held-out evaluation 2022–2026.
4. `fetch_sb.py`, `parse_wy.py`, `join_events.py`, `inplay_panel.py` – minute panel from event data.
5. `inplay_effects2.py` – time / score-state / red-card multipliers; `inplay_corner_eval.py`, `inplay_corner_fit.py`, `inplay_final_eval.py` – persistence and dispersion of the remaining corners.
6. `tune_goal_state2.py` – second-half goal state effects from half-time → full-time transitions.
7. `om_load.py`, `combined.py` – merge open-matchday 2026/27; `export_bundle.py` – app bundle; `validate_2627.py` – current-season check.
