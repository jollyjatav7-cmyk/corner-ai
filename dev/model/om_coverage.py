"""How complete are half-time goals and half corners in open-matchday 2026/27, per league?"""
import glob, sys
import pandas as pd

ROOT = '/home/claude/data/oladeeayo_open-matchday/data'
WANT = ['ENG_1', 'ENG_2', 'ENG_3', 'ENG_4', 'SCO_1', 'SCO_2', 'SCO_3', 'SCO_4', 'GER_1', 'GER_2', 'ITA_1', 'ITA_2', 'ESP_1', 'ESP_2',
        'FRA_1', 'FRA_2', 'NED_1', 'BEL_1', 'POR_1', 'TUR_1', 'GRE_1', 'JPN_1', 'CHN_1', 'USA_1', 'KOR_1']
for f in sorted(glob.glob(ROOT + '/*/results_2627.csv')):
    lg = f.split('/')[-2]
    if not any(lg.startswith(w) for w in WANT):
        continue
    d = pd.read_csv(f)
    if not len(d):
        continue
    c = lambda col: int(d[col].notna().sum()) if col in d else 0
    last = d[d.home_corners.notna()].tail(1)
    print(f'{lg:32s} n={len(d):4d} ht_goals={c("ht_home"):4d} corners={c("home_corners"):4d} corners_1h={c("home_corners_1h"):4d} '
          f'last={d.date.max()} src={d.source.value_counts().to_dict() if "source" in d else ""}')
