"""Refit the app's pre-match GLMs on 2008-2025 with recent seasons weighted more (weight 0.8^(2025-season)),
same rows and columns as prematch_models.py / fit_mkt_only.py. Writes *_r08.json and reports the 2026/27 check."""
import sys, json
sys.path.insert(0, '/home/claude/scripts')
import numpy as np
from scipy.special import gammaln
from sklearn.linear_model import PoissonRegressor
from prematch_models import side_rows, C_MKT, C_NOM, G_NOM, X

DECAY, HI = 0.8, 2025
Xc = X[X.season >= 2008].copy()
Sc = side_rows(Xc, 'c'); Sg = side_rows(Xc, 'g')
okc = Sc.y.notna(); has_odds = np.isfinite(Sc.lam_t)


def fit(S, cols, mask, weight=None):
    w = DECAY ** (HI - S.loc[mask, 'season'].values)
    if weight is not None: w = w * weight[mask]
    return PoissonRegressor(alpha=1e-6, max_iter=1000).fit(S.loc[mask, cols], S.loc[mask, 'y'], sample_weight=w)


out = {}
m_mkt = fit(Sc, C_MKT, okc & has_odds & (Sc.season <= HI))
m_nom = fit(Sc, C_NOM, okc & (Sc.season <= HI))
m_g = fit(Sg, G_NOM, Sg.y.notna() & (Sg.season <= HI))
out['corner_mkt'] = dict(cols=C_MKT, coef=m_mkt.coef_.tolist(), intercept=float(m_mkt.intercept_))
out['corner_nomkt'] = dict(cols=C_NOM, coef=m_nom.coef_.tolist(), intercept=float(m_nom.intercept_))
out['goals_nomkt'] = dict(cols=G_NOM, coef=m_g.coef_.tolist(), intercept=float(m_g.intercept_))
json.dump(out, open('/home/claude/data/glm_coefs_2025_r08.json', 'w'), indent=1)

# market-only (other leagues): league average as offset, as in fit_mkt_only.py
Xm = X[(X.season >= 2008) & X.HomeCorners.notna() & X.lh.notna()]
Sm = side_rows(Xm, 'c'); cols = ['home', 'lam_t', 'lam_o']
tr = Sm.season <= HI
w = np.exp(Sm.base) * DECAY ** (HI - Sm.season)
mm = PoissonRegressor(alpha=1e-7, max_iter=1000).fit(Sm.loc[tr, cols], Sm.loc[tr, 'y'] / np.exp(Sm.base[tr]), sample_weight=w[tr])
mk = dict(cols=cols, coef=mm.coef_.tolist(), intercept=float(mm.intercept_), offset='base')
json.dump(mk, open('/home/claude/data/glm_market_only_r08.json', 'w'))

# check on 2026/27 rows (not used in the fit): old coefficients vs new
old = json.load(open('/home/claude/data/glm_coefs_2025.json'))
old_mk = json.load(open('/home/claude/data/glm_market_only.json'))


def ll(spec, S, mask, offset=None):
    eta = spec['intercept'] + S.loc[mask, spec['cols']].values @ np.array(spec['coef'])
    if offset is not None: eta = eta + offset[mask]
    mu = np.exp(eta); y = S.loc[mask, 'y'].values
    return np.mean(y * np.log(mu) - mu - gammaln(y + 1))


t = okc & has_odds & (Sc.season == 2026)
print('corner_mkt   2026 rows', int(t.sum()), 'old %.5f new %.5f' % (ll(old['corner_mkt'], Sc, t), ll(out['corner_mkt'], Sc, t)))
t = okc & (Sc.season == 2026)
print('corner_nomkt 2026 rows', int(t.sum()), 'old %.5f new %.5f' % (ll(old['corner_nomkt'], Sc, t), ll(out['corner_nomkt'], Sc, t)))
t = Sg.y.notna() & (Sg.season == 2026)
print('goals_nomkt  2026 rows', int(t.sum()), 'old %.5f new %.5f' % (ll(old['goals_nomkt'], Sg, t), ll(out['goals_nomkt'], Sg, t)))
t = Sm.season == 2026
print('market-only  2026 rows', int(t.sum()), 'old %.5f new %.5f' % (ll(old_mk, Sm, t, Sm.base), ll(mk, Sm, t, Sm.base)))
for k in out:
    print(k, {c: round(v, 3) for c, v in zip(out[k]['cols'], out[k]['coef'])}, round(out[k]['intercept'], 3))
print('market-only', {c: round(v, 3) for c, v in zip(cols, mk['coef'])}, round(mk['intercept'], 3))
