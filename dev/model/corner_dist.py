"""Joint distribution of (home corners, away corners) given the GLM means.
Latent tempo T (shared) and dominance D (opposite):
   HC ~ Poisson(mh * T * D / c),  AC ~ Poisson(ma * T / D / c),  c = exp(sD^2/2)
   log T ~ N(-sT^2/2, sT^2),  log D ~ N(0, sD^2)
"""
import numpy as np, pandas as pd
from scipy.special import gammaln
from scipy.optimize import minimize
from sklearn.linear_model import PoissonRegressor
import sys

exec(open('/home/claude/scripts/corner_glm.py').read().split("specs = {")[0])

COLS = ['base', 'home', 'lam_t', 'lam_o', 'c_att', 'c_dfn', 's_att', 's_dfn', 't_att', 't_dfn', 'g_att', 'g_dfn',
        'opp_c_att', 'opp_c_dfn']
glm = PoissonRegressor(alpha=1e-6, max_iter=500).fit(S.loc[train, COLS], S.loc[train, 'y'])
S['mu'] = glm.predict(S[COLS].fillna(0))
P = S.pivot_table(index='mid', columns='home', values=['y', 'mu', 'season', 'has_odds'])
D = pd.DataFrame({'hc': P[('y', 1.0)], 'ac': P[('y', 0.0)], 'mh': P[('mu', 1.0)], 'ma': P[('mu', 0.0)],
                  'season': P[('season', 1.0)], 'odds': P[('has_odds', 1.0)] > 0})
D = D[D.odds]
tr = D[(D.season >= 2012) & (D.season <= 2021)]
te = D[D.season >= 2022]

xg, wg = np.polynomial.hermite_e.hermegauss(24)  # probabilists' Hermite: weight exp(-x^2/2)
wg = wg / wg.sum()


def joint_logpmf(hc, ac, mh, ma, sT, sD):
    # returns log P(HC=hc, AC=ac) for arrays
    lt = sT * xg - sT ** 2 / 2  # (q,)
    ld = sD * xg
    c = sD ** 2 / 2
    Th = np.exp(lt)[:, None]  # q x 1
    Dd = np.exp(ld)[None, :]  # 1 x q
    lam_h = mh[:, None, None] * (Th * Dd)[None] / np.exp(c)
    lam_a = ma[:, None, None] * (Th / Dd)[None] / np.exp(c)
    lp = (hc[:, None, None] * np.log(lam_h) - lam_h - gammaln(hc + 1)[:, None, None]
          + ac[:, None, None] * np.log(lam_a) - lam_a - gammaln(ac + 1)[:, None, None])
    W = (wg[:, None] * wg[None, :])[None]
    mx = lp.max((1, 2), keepdims=True)
    return (np.log((np.exp(lp - mx) * W).sum((1, 2))) + mx[:, 0, 0])


def nll(p, d):
    sT, sD = np.exp(p)
    return -joint_logpmf(d.hc.values, d.ac.values, d.mh.values, d.ma.values, sT, sD).mean()


samp = tr.sample(40000, random_state=1)
r = minimize(nll, np.log([0.15, 0.2]), args=(samp,), method='Nelder-Mead', options=dict(xatol=1e-4, fatol=1e-7))
sT, sD = np.exp(r.x)
print('fitted sT, sD', sT, sD, 'nll', r.fun)
# compare with independent Poisson on test
lp_lat = joint_logpmf(te.hc.values, te.ac.values, te.mh.values, te.ma.values, sT, sD)
from scipy.stats import poisson
lp_poi = poisson.logpmf(te.hc, te.mh) + poisson.logpmf(te.ac, te.ma)
print('test joint log score: latent', lp_lat.mean(), ' indep Poisson', lp_poi.mean())
np.save('/home/claude/data/corner_sig.npy', np.array([sT, sD]))
