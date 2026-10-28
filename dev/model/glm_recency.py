"""Should the corner GLM (ratings + odds -> expected corners) weight recent seasons more?
Fit variants on seasons up to 2021, score on 2022-2025; then the best variants fitted up to 2025, scored on 2026/27 so far."""
import sys
sys.path.insert(0, '/home/claude/scripts')
import numpy as np, pandas as pd
from scipy.special import gammaln
from sklearn.linear_model import PoissonRegressor
from prematch_models import side_rows, C_MKT, X

LEAGUES = ['E0', 'E1', 'E2', 'E3', 'SC0', 'SC1', 'SC2', 'SC3', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2', 'N1', 'B1', 'P1', 'T1', 'G1']
S = side_rows(X[X.Division.isin(LEAGUES)], 'c')
ok = S.y.notna() & np.isfinite(S.lam_t)
print('rows by season (with odds):', S[ok].groupby('season').size().tail(6).to_dict())


def run(lo, hi, test, decay=None):
    tr = ok & (S.season >= lo) & (S.season <= hi)
    w = None if decay is None else decay ** (hi - S.loc[tr, 'season'].values)
    m = PoissonRegressor(alpha=1e-6, max_iter=1000).fit(S.loc[tr, C_MKT], S.loc[tr, 'y'], sample_weight=w)
    mu = m.predict(S.loc[test, C_MKT]); y = S.loc[test, 'y'].values
    return np.mean(y * np.log(mu) - mu - gammaln(y + 1)), m


te1 = ok & S.season.between(2022, 2025)
te2 = ok & (S.season == 2026)
base1 = None
print('\n-- fit up to 2021, test 2022-2025 (rows %d) --' % te1.sum())
for nm, args in [('2008-2021 equal', (2008, 2021, None)), ('2012-2021 equal', (2012, 2021, None)), ('2016-2021 equal', (2016, 2021, None)),
                 ('2018-2021 equal', (2018, 2021, None)), ('2008-2021 decay .9', (2008, 2021, 0.9)), ('2008-2021 decay .8', (2008, 2021, 0.8)),
                 ('2008-2021 decay .7', (2008, 2021, 0.7))]:
    ll, _ = run(args[0], args[1], te1, args[2])
    base1 = ll if base1 is None else base1
    print(f'{nm:22s} {ll:.5f}  vs equal-2008: {ll - base1:+.5f}')
if te2.sum():
    print('\n-- fit up to 2025, test 2026/27 so far (rows %d) --' % te2.sum())
    base2 = None
    for nm, args in [('2008-2025 equal (app)', (2008, 2025, None)), ('2016-2025 equal', (2016, 2025, None)), ('2008-2025 decay .8', (2008, 2025, 0.8)),
                     ('2008-2025 decay .9', (2008, 2025, 0.9))]:
        ll, m = run(args[0], args[1], te2, args[2])
        base2 = ll if base2 is None else base2
        print(f'{nm:22s} {ll:.5f}  vs app: {ll - base2:+.5f}   lam_t {m.coef_[C_MKT.index("lam_t")]:.3f} lam_o {m.coef_[C_MKT.index("lam_o")]:.3f}')
