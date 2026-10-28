"""Same recency test for the no-odds corner GLM and the no-odds goals GLM."""
import sys
sys.path.insert(0, '/home/claude/scripts')
import numpy as np
from scipy.special import gammaln
from sklearn.linear_model import PoissonRegressor
from prematch_models import side_rows, C_NOM, G_NOM, X
LEAGUES = ['E0', 'E1', 'E2', 'E3', 'SC0', 'SC1', 'SC2', 'SC3', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2', 'N1', 'B1', 'P1', 'T1', 'G1']
XX = X[X.Division.isin(LEAGUES)]
for metric, cols in (('c', C_NOM), ('g', G_NOM)):
    S = side_rows(XX, metric); ok = S.y.notna()
    for hi, test in ((2021, ok & S.season.between(2022, 2025)), (2025, ok & (S.season == 2026))):
        out = []
        for decay in (None, 0.9, 0.8, 0.7):
            tr = ok & S.season.between(2008, hi)
            w = None if decay is None else decay ** (hi - S.loc[tr, 'season'].values)
            m = PoissonRegressor(alpha=1e-6, max_iter=1000).fit(S.loc[tr, cols], S.loc[tr, 'y'], sample_weight=w)
            mu = m.predict(S.loc[test, cols]); y = S.loc[test, 'y'].values
            out.append(np.mean(y * np.log(mu) - mu - gammaln(y + 1)))
        print(metric, 'fit to', hi, 'test rows', int(test.sum()), ' equal %.5f' % out[0], ' decay .9 %+.5f  .8 %+.5f  .7 %+.5f' % tuple(o - out[0] for o in out[1:]))
