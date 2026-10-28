"""Export everything the web app needs into one compact JSON bundle."""
import numpy as np, pandas as pd, json, sys, copy
sys.path.insert(0, '/home/claude/scripts')
from common import load_matches
from ratings import CountRatings
from features import PARAMS
from om_load import FOLDER
from zh_names import LEAGUE_ZH, TEAM_ZH

APP_LEAGUES = ['E0', 'E1', 'E2', 'E3', 'SC0', 'SC1', 'SC2', 'SC3', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2',
               'N1', 'B1', 'P1', 'T1', 'G1']
METRICS = ['c', 's', 't', 'g']

F = pd.read_pickle('/home/claude/data/features_comb.pkl')   # combined history + 2026/27 (pre-match features)
hist = F[F.season <= 2025]
cur = F[F.season == 2026].sort_values(['MatchDate', 'Division', 'HomeTeam'])

# ---- season-start state: run ratings over history, then initialise every 2026/27 team ----
states = {}
for key, (ch, ca, kw) in PARAMS.items():
    R = CountRatings(**kw)
    div = hist.Division.values; season = hist.season.values; H = hist.HomeTeam.values; A = hist.AwayTeam.values
    yh = hist[ch].values; ya = hist[ca].values
    for i in range(len(hist)):
        R.predict(div[i], season[i], H[i], A[i])
        if not (np.isnan(yh[i]) or np.isnan(ya[i])):
            R.update(div[i], H[i], A[i], yh[i], ya[i])
    # touch current-season teams in order of first appearance
    for d_, h_, a_ in zip(cur.Division.values, cur.HomeTeam.values, cur.AwayTeam.values):
        R.predict(d_, 2026, h_, a_)
    states[key] = R

# ---- replay check in python: season-start + updates == full online run ----
chk = copy.deepcopy(states)
for key, (ch, ca, kw) in PARAMS.items():
    R = chk[key]
    for d_, h_, a_, yh, ya in zip(cur.Division.values, cur.HomeTeam.values, cur.AwayTeam.values, cur[ch].values, cur[ca].values):
        if not (np.isnan(yh) or np.isnan(ya)):
            R.update(d_, h_, a_, yh, ya)
import pickle
final = pickle.load(open('/home/claude/data/rating_state_final.pkl', 'rb'))
mx = 0
for key in METRICS:
    for t, v in final[key]['att'].items():
        if t in chk[key].att:
            mx = max(mx, abs(chk[key].att[t] - v), abs(chk[key].dfn[t] - final[key]['dfn'][t]))
    for d_, b in final[key]['base'].items():
        mx = max(mx, abs(chk[key].base[d_][0] - b[0]), abs(chk[key].base[d_][1] - b[1]))
print('max |replay - full run| =', mx)

# ---- teams per league (2026/27) ----
leagues = []
team_index = {}
for div in APP_LEAGUES:
    c = cur[cur.Division == div]
    teams = sorted(set(c.HomeTeam) | set(c.AwayTeam))
    rows = []
    for t in teams:
        r = [round(states[m].att[t], 5) for m in METRICS] + [round(states[m].dfn[t], 5) for m in METRICS]
        rows.append({'n': t, 'z': TEAM_ZH.get(t, ''), 'r': r})
        team_index[(div, t)] = len(rows) - 1
    bases = {m: [round(states[m].base[div][0], 5), round(states[m].base[div][1], 5)] for m in METRICS}
    leagues.append({'code': div, 'zh': LEAGUE_ZH[div], 'teams': rows, 'base': bases, 'om': FOLDER[div]})

# ---- bundled 2026/27 matches (for replay) ----
def iv(x):
    return -1 if pd.isna(x) else int(x)
li = {L['code']: i for i, L in enumerate(leagues)}
matches = []
for _, r in cur[cur.Division.isin(APP_LEAGUES)].iterrows():
    matches.append([li[r.Division], int(r.MatchDate.strftime('%Y%m%d')), team_index[(r.Division, r.HomeTeam)],
                    team_index[(r.Division, r.AwayTeam)], iv(r.HomeCorners), iv(r.AwayCorners), iv(r.HomeShots),
                    iv(r.AwayShots), iv(r.HomeTarget), iv(r.AwayTarget), iv(r.FTHome), iv(r.FTAway)])
om_map = json.load(open('/home/claude/data/om_name_map.json'))

glm = json.load(open('/home/claude/data/glm_coefs_2025.json'))
mult = json.load(open('/home/claude/data/inplay_mult.json'))
mult['g2_level'] = 0.0
# in-play goal multipliers for the second half re-fitted on ~150k half-time -> full-time transitions
mult_live = copy.deepcopy(mult)
tuned = json.load(open('/home/claude/data/goal_state_tuned2.json'))
for k, v in tuned.items():
    if k != 'lvl':
        mult_live['g'][k] = v
mult_live['g2_level'] = tuned.get('lvl', 0.0)
mkt_only = json.load(open('/home/claude/data/glm_market_only.json'))

bundle = {
    'version': 1,
    'data_until': str(cur.MatchDate.max().date()),
    'season': 2026,
    'metrics': METRICS,
    'rating_params': {m: dict(k_att=PARAMS[m][2]['k_att'], k_def=PARAMS[m][2]['k_def'], k_base=PARAMS[m][2]['k_base'],
                              cap=1.5) for m in METRICS},
    'leagues': leagues,
    'matches': matches,
    'om_map': {d: om_map[d] for d in APP_LEAGUES},
    'glm': glm,
    'glm_mkt_only': mkt_only,
    'mult': {k: {kk: round(vv, 5) for kk, vv in v.items()} if isinstance(v, dict) else v for k, v in mult.items()},
    'mult_live': {k: {kk: round(vv, 5) for kk, vv in v.items()} if isinstance(v, dict) else v for k, v in mult_live.items()},
    'disp': {'ft0': [0.106, 0.239], 'ht0': [0.114, 0.244],
             'ft_rem': {'sT': 0.105, 'a': 0.109, 'b': 0.40}, 'ht_rem': {'sT': 0.10, 'a': 0.091, 'b': 0.335}},
    'persist': {'k': 2.0, 'bc_per_min': 0.0022, 'bo_per_min_after30': -0.0009, 'b0_ft': 0.0, 'b0_ht': -0.016},
    'dc_rho': -0.06,
}
s = json.dumps(bundle, ensure_ascii=False, separators=(',', ':'))
open('/home/claude/app/bundle.json', 'w').write(s)
print('bundle bytes', len(s.encode()), 'leagues', len(leagues), 'teams', sum(len(L['teams']) for L in leagues),
      'matches', len(matches), 'data_until', bundle['data_until'])
