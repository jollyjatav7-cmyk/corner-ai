"""Do first-half observations (corners, shots, shots on target, goals) predict second-half corners/goals
beyond pre-match expectations, time profile and the actual score path?"""
import numpy as np, pandas as pd
from sklearn.linear_model import PoissonRegressor
exec(open('/home/claude/scripts/inplay_effects.py').read().split("Xd = design(T)")[0])
Xd = design(T)
cc = pd.read_pickle('/home/claude/data/inplay_coef_c.pkl'); cg = pd.read_pickle('/home/claude/data/inplay_coef_g.pkl')
T['exp_c'] = T.mu_c / 90.0 * T.expo * np.exp(Xd[cc.index].values @ cc.values)
T['exp_g'] = T.lam / 90.0 * T.expo * np.exp(Xd[cg.index].values @ cg.values)
T['side'] = np.r_[np.zeros(len(P)), np.ones(len(P))]
# shots expectation: use team's pre-match corners*?  -> we lack shot expectations; use league-average ratio
# so instead use shots relative to opponent (share) and totals relative to a per-match normal.
A = T.groupby(['mid', 'side', 'per']).agg(c=('c', 'sum'), g=('g', 'sum'), s=('s', 'sum'), ec=('exp_c', 'sum'),
                                          eg=('exp_g', 'sum')).unstack('per')
A.columns = [f'{a}{b}' for a, b in A.columns]
A = A.reset_index()
B = A.copy(); B['side'] = 1 - B.side
A = A.merge(B[['mid', 'side', 'c1', 's1', 'g1', 'ec1', 'eg1']].rename(columns=lambda x: 'o_' + x if x not in ('mid', 'side') else x),
            on=['mid', 'side'])
k = 1.0
A['rc'] = np.log((A.c1 + k) / (A.ec1 + k)); A['o_rc'] = np.log((A.o_c1 + k) / (A.o_ec1 + k))
A['rg'] = np.log((A.g1 + 0.5) / (A.eg1 + 0.5)); A['o_rg'] = np.log((A.o_g1 + 0.5) / (A.o_eg1 + 0.5))
A['ls'] = np.log((A.s1 + 1) / (A.o_s1 + 1))  # first-half shot share (log ratio)
A['ts'] = np.log(A.s1 + A.o_s1 + 1)
A['ts'] = A.ts - A.ts.mean()


def fit(target, off, cols):
    w = A[off]
    y = A[target] / w
    m = PoissonRegressor(alpha=1e-6, max_iter=1000).fit(A[cols], y, sample_weight=w)
    mu = np.exp(m.intercept_ + A[cols].values @ m.coef_) * w
    ll = (A[target] * np.log(mu) - mu).mean()
    mu0 = w * (A[target].sum() / w.sum())
    ll0 = (A[target] * np.log(mu0) - mu0).mean()
    print(target, cols, 'coef', np.round(m.coef_, 4), 'icpt', round(m.intercept_, 4), 'dLL/obs', round(ll - ll0, 5))


for cols in [['rc'], ['rc', 'o_rc'], ['rc', 'o_rc', 'ls', 'ts'], ['ls', 'ts']]:
    fit('c2', 'ec2', cols)
for cols in [['rg', 'o_rg'], ['rc', 'o_rc'], ['ls', 'ts'], ['rg', 'o_rg', 'rc', 'o_rc', 'ls', 'ts']]:
    fit('g2', 'eg2', cols)
