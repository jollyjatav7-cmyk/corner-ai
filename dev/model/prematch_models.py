"""Fit the pre-match corner GLMs (with / without market odds) and the fallback goals GLM.
Stores per-match predictions (for event-data analysis) and coefficients (for the app)."""
import numpy as np, pandas as pd, json, sys
from sklearn.linear_model import PoissonRegressor

X = pd.read_pickle('/home/claude/data/features.pkl')
TRAIN_MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 2021

C_MKT = ['base', 'home', 'lam_t', 'lam_o', 'c_att', 'c_dfn', 's_att', 's_dfn', 't_att', 't_dfn', 'g_att', 'g_dfn',
         'opp_c_att', 'opp_c_dfn']
C_NOM = ['base', 'home', 'c_att', 'c_dfn', 's_att', 's_dfn', 't_att', 't_dfn', 'g_att', 'g_dfn', 'opp_c_att',
         'opp_c_dfn']
G_NOM = ['base', 'home', 'g_att', 'g_dfn', 's_att', 's_dfn', 't_att', 't_dfn']


def side_rows(D, metric):
    """metric 'c' (corners) or 'g' (goals): stacked home/away rows with team-perspective features."""
    yh, ya = {'c': ('HomeCorners', 'AwayCorners'), 'g': ('FTHome', 'FTAway')}[metric]
    rows = []
    for home, t, o, yt in [(1.0, 'h', 'a', yh), (0.0, 'a', 'h', ya)]:
        R = pd.DataFrame({
            'idx': D.index.values, 'y': D[yt].values, 'home': home,
            'base': D[f'{metric}_b{t}'].values,
            'c_att': D[f'c_att_{t}'].values, 'c_dfn': D[f'c_dfn_{o}'].values,
            's_att': D[f's_att_{t}'].values, 's_dfn': D[f's_dfn_{o}'].values,
            't_att': D[f't_att_{t}'].values, 't_dfn': D[f't_dfn_{o}'].values,
            'g_att': D[f'g_att_{t}'].values, 'g_dfn': D[f'g_dfn_{o}'].values,
            'opp_c_att': D[f'c_att_{o}'].values, 'opp_c_dfn': D[f'c_dfn_{t}'].values,
            'lam_t': np.log(D[f'l{t}'].values), 'lam_o': np.log(D[f'l{o}'].values),
            'season': D.season.values})
        rows.append(R)
    return pd.concat(rows, ignore_index=True)


def fit(S, cols, mask):
    m = PoissonRegressor(alpha=1e-6, max_iter=1000).fit(S.loc[mask, cols], S.loc[mask, 'y'])
    return m


if __name__ == '__main__':
    out = {}
    Xc = X[(X.season >= 2008)].copy()
    Sc = side_rows(Xc, 'c')
    okc = Sc.y.notna()
    has_odds = np.isfinite(Sc.lam_t)
    m_mkt = fit(Sc, C_MKT, okc & has_odds & (Sc.season <= TRAIN_MAX))
    m_nom = fit(Sc, C_NOM, okc & (Sc.season <= TRAIN_MAX))
    Sg = side_rows(Xc, 'g')
    m_g = fit(Sg, G_NOM, Sg.y.notna() & (Sg.season <= TRAIN_MAX))
    out['corner_mkt'] = dict(cols=C_MKT, coef=m_mkt.coef_.tolist(), intercept=float(m_mkt.intercept_))
    out['corner_nomkt'] = dict(cols=C_NOM, coef=m_nom.coef_.tolist(), intercept=float(m_nom.intercept_))
    out['goals_nomkt'] = dict(cols=G_NOM, coef=m_g.coef_.tolist(), intercept=float(m_g.intercept_))
    for k, v in out.items():
        print(k, dict(zip(v['cols'], np.round(v['coef'], 4))), round(v['intercept'], 4))
    json.dump(out, open(f'/home/claude/data/glm_coefs_{TRAIN_MAX}.json', 'w'), indent=1)
    # per-match predictions
    Sc['mu_mkt'] = np.where(has_odds, m_mkt.predict(Sc[C_MKT].fillna(0)), np.nan)
    Sc['mu_nom'] = m_nom.predict(Sc[C_NOM])
    Sc['mu_c'] = Sc.mu_mkt.fillna(Sc.mu_nom)
    Sg['mu_g'] = m_g.predict(Sg[G_NOM])
    n = len(Xc)
    pred = pd.DataFrame({'mu_ch': Sc.mu_c.values[:n], 'mu_ca': Sc.mu_c.values[n:],
                         'mu_ch_nom': Sc.mu_nom.values[:n], 'mu_ca_nom': Sc.mu_nom.values[n:],
                         'lg_h': Sg.mu_g.values[:n], 'lg_a': Sg.mu_g.values[n:]}, index=Xc.index)
    pred.to_pickle(f'/home/claude/data/prematch_pred_{TRAIN_MAX}.pkl')
    print('saved', pred.shape)
