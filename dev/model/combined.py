"""History (football-data via xgabora, seasons <= 2025/26) + 2026/27 from open-matchday (fresh to yesterday).
Builds online ratings through today and saves the final rating states."""
import pandas as pd, numpy as np, pickle, sys
sys.path.insert(0, '/home/claude/scripts')
from common import load_matches
from features import build
from om_load import FOLDER

xg = load_matches()
xg = xg[xg.Division.isin(list(FOLDER))]
hist = xg[xg.season <= 2025].copy()
cur_x = xg[xg.season == 2026].copy()
om = pd.read_pickle('/home/claude/data/om_2627.pkl')

# fill stats missing in open-matchday from football-data rows of the same match (overlap period)
stat_cols = ['HomeShots', 'AwayShots', 'HomeTarget', 'AwayTarget', 'HomeCorners', 'AwayCorners', 'HomeRed', 'AwayRed',
             'HTHome', 'HTAway']
key = ['Division', 'HomeTeam', 'AwayTeam']
j = om.reset_index().merge(cur_x[key + ['MatchDate'] + stat_cols + ['OddHome', 'OddDraw', 'OddAway', 'Over25', 'Under25']],
                           on=key, how='left', suffixes=('', '_x'))
j = j[(j.MatchDate_x.isna()) | (abs((j.MatchDate - j.MatchDate_x).dt.days) <= 1)]
j = j.sort_values('index').drop_duplicates('index')
for c in stat_cols:
    j[c] = j[c].fillna(j[c + '_x'])
cur = j.drop(columns=[c for c in j.columns if c.endswith('_x')] + ['index'])
# football-data rows of 2026 that open-matchday does not have (should be none) are added too
miss = cur_x.merge(cur[key], on=key, how='left', indicator=True)
miss = miss[miss._merge == 'left_only'].drop(columns='_merge')
print('fd 2026 rows missing in om:', len(miss))
comb = pd.concat([hist, cur, miss], ignore_index=True).sort_values(['MatchDate', 'Division', 'HomeTeam']).reset_index(drop=True)
print('combined', comb.shape, comb.MatchDate.max())
print(comb[comb.season == 2026].groupby('Division').agg(n=('HomeTeam', 'size'), corners=('HomeCorners', lambda s: s.notna().sum()),
                                                         last=('MatchDate', 'max')).to_string())
F, models = build(comb, return_models=True)
F.to_pickle('/home/claude/data/features_comb.pkl')
state = {}
for k, R in models.items():
    state[k] = dict(att=dict(R.att), dfn=dict(R.dfn), base={d: list(v) for d, v in R.base.items()},
                    team_div=dict(R.team_div), team_season={t: int(v) for t, v in R.team_season.items()},
                    new_att={'|'.join(kk): list(v) for kk, v in R.new_att.items()},
                    new_dfn={'|'.join(kk): list(v) for kk, v in R.new_dfn.items()},
                    params=dict(k_att=R.k_att, k_def=R.k_def, k_base=R.k_base, shrink=R.shrink, cap=R.cap))
pickle.dump(state, open('/home/claude/data/rating_state_final.pkl', 'wb'))
print('saved')
