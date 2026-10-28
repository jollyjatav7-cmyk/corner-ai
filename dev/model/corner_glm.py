import numpy as np, pandas as pd
from sklearn.linear_model import PoissonRegressor

X = pd.read_pickle('/home/claude/data/features.pkl')
X = X[X.HomeCorners.notna() & X.AwayCorners.notna() & (X.season >= 2008)].copy()
X['has_odds'] = X.lh.notna()


def stack(D):
    H = pd.DataFrame({
        'y': D.HomeCorners.values, 'home': 1.0,
        'base': D.c_bh.values, 'c_att': D.c_att_h.values, 'c_dfn': D.c_dfn_a.values,
        's_att': D.s_att_h.values, 's_dfn': D.s_dfn_a.values, 't_att': D.t_att_h.values, 't_dfn': D.t_dfn_a.values,
        'g_att': D.g_att_h.values, 'g_dfn': D.g_dfn_a.values,
        'lam_t': np.log(D.lh.values), 'lam_o': np.log(D.la.values),
        'opp_c_att': D.c_att_a.values, 'opp_c_dfn': D.c_dfn_h.values,
        'mid': np.arange(len(D)), 'season': D.season.values, 'div': D.Division.values})
    A = pd.DataFrame({
        'y': D.AwayCorners.values, 'home': 0.0,
        'base': D.c_ba.values, 'c_att': D.c_att_a.values, 'c_dfn': D.c_dfn_h.values,
        's_att': D.s_att_a.values, 's_dfn': D.s_dfn_h.values, 't_att': D.t_att_a.values, 't_dfn': D.t_dfn_h.values,
        'g_att': D.g_att_a.values, 'g_dfn': D.g_dfn_h.values,
        'lam_t': np.log(D.la.values), 'lam_o': np.log(D.lh.values),
        'opp_c_att': D.c_att_h.values, 'opp_c_dfn': D.c_dfn_a.values,
        'mid': np.arange(len(D)), 'season': D.season.values, 'div': D.Division.values})
    return pd.concat([H, A], ignore_index=True)


def pdev(y, mu):
    y = np.asarray(y, float)
    t = np.where(y > 0, y * np.log(np.where(y > 0, y, 1) / mu), 0) - (y - mu)
    return 2 * t.mean()


S = stack(X)
S['has_odds'] = np.isfinite(S.lam_t)
train = (S.season <= 2021) & S.has_odds
test = (S.season >= 2022) & S.has_odds
print('train rows', train.sum(), 'test rows', test.sum())

specs = {
    'league_avg': [],
    'corner_ratings': ['c_att', 'c_dfn'],
    'ratings_all': ['c_att', 'c_dfn', 's_att', 's_dfn', 't_att', 't_dfn', 'g_att', 'g_dfn'],
    'market_only': ['lam_t', 'lam_o'],
    'market+corner': ['lam_t', 'lam_o', 'c_att', 'c_dfn'],
    'market+all': ['lam_t', 'lam_o', 'c_att', 'c_dfn', 's_att', 's_dfn', 't_att', 't_dfn', 'g_att', 'g_dfn'],
    'market+all+opp': ['lam_t', 'lam_o', 'c_att', 'c_dfn', 's_att', 's_dfn', 't_att', 't_dfn', 'g_att', 'g_dfn',
                       'opp_c_att', 'opp_c_dfn'],
}
res = {}
preds = {}
for name, cols in specs.items():
    cols2 = ['base', 'home'] + cols
    m = PoissonRegressor(alpha=1e-6, max_iter=500)
    m.fit(S.loc[train, cols2], S.loc[train, 'y'])
    mu = m.predict(S.loc[test, cols2])
    preds[name] = mu
    yt = S.loc[test, 'y'].values
    # total and difference per match
    tt = S.loc[test].assign(mu=mu)
    piv = tt.pivot_table(index='mid', columns='home', values=['y', 'mu'])
    tot_y = piv[('y', 1.0)] + piv[('y', 0.0)]; tot_mu = piv[('mu', 1.0)] + piv[('mu', 0.0)]
    dif_y = piv[('y', 1.0)] - piv[('y', 0.0)]; dif_mu = piv[('mu', 1.0)] - piv[('mu', 0.0)]
    res[name] = dict(dev=pdev(yt, mu), mae_side=np.abs(yt - mu).mean(),
                     rmse_tot=np.sqrt(((tot_y - tot_mu) ** 2).mean()), rmse_dif=np.sqrt(((dif_y - dif_mu) ** 2).mean()),
                     r2_tot=1 - ((tot_y - tot_mu) ** 2).mean() / tot_y.var(),
                     r2_dif=1 - ((dif_y - dif_mu) ** 2).mean() / dif_y.var())
    print(name, {k: round(v, 4) for k, v in res[name].items()},
          dict(zip(cols2, np.round(m.coef_, 3))), round(m.intercept_, 3), flush=True)
