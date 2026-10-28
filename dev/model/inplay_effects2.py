"""Minute-level multiplicative rate model for corners and goals (team perspective).
rate(team, minute) = base * time_mult(bin) * state_mult(goal diff, phase) * red_mult
Fitted as Poisson GLM with offset = pre-match expectation per minute."""
import numpy as np, pandas as pd, json
from sklearn.linear_model import PoissonRegressor

P = pd.read_pickle('/home/claude/data/panel.pkl')
M = pd.read_pickle('/home/claude/data/panel_meta.pkl').set_index('mid')
P = P.join(M[['mu_ch', 'mu_ca', 'lh', 'la']], on='mid')

TB = [f'h1_{a:02d}' for a in range(0, 45, 5)] + ['h1_st'] + [f'h2_{a:02d}' for a in range(45, 90, 5)] + ['h2_st']


def tbin(per, mi):
    if per == 1:
        return 'h1_st' if mi >= 45 else f'h1_{(mi // 5) * 5:02d}'
    return 'h2_st' if mi >= 90 else f'h2_{(mi // 5) * 5:02d}'


def phase(per, mi):
    return 0 if per == 1 else (1 if mi < 70 else 2)


P['tb'] = [tbin(p, m) for p, m in zip(P.per.values, P['min'].values)]
P['ph'] = [phase(p, m) for p, m in zip(P.per.values, P['min'].values)]
rows = []
for side, o in [('h', 'a'), ('a', 'h')]:
    rows.append(pd.DataFrame({'mid': P.mid, 'tb': P.tb, 'ph': P.ph, 'per': P.per, 'min': P['min'], 'expo': P.expo,
                              'c': P['c' + side], 'g': P['g' + side], 's': P['s' + side],
                              'mu_c': P['mu_c' + side], 'lam': P['l' + side],
                              'gd': (P.gd if side == 'h' else -P.gd).clip(-2, 2),
                              'own_red': (P['cr' + side] > 0).astype(float), 'opp_red': (P['cr' + o] > 0).astype(float)}))
T = pd.concat(rows, ignore_index=True)

STATE = [(g, ph) for g in [-2, -1, 1, 2] for ph in [0, 1, 2]]


def design(T):
    Xd = pd.DataFrame({f't_{b}': (T.tb == b).astype(float) for b in TB})
    for g, ph in STATE:
        Xd[f'gd{g:+d}_p{ph}'] = ((T.gd == g) & (T.ph == ph)).astype(float)
    Xd['own_red'] = T.own_red
    Xd['opp_red'] = T.opp_red
    return Xd


if __name__ == '__main__':
    Xd = design(T)
    out = {}
    for target, base in [('c', 'mu_c'), ('g', 'lam')]:
        w = T[base] / 90.0 * T.expo
        m = PoissonRegressor(alpha=1e-7, max_iter=3000, fit_intercept=False).fit(Xd, T[target] / w, sample_weight=w)
        coef = pd.Series(m.coef_, index=Xd.columns)
        out[target] = coef.to_dict()
        print(f'=== {target} ===')
        print(np.exp(coef).round(3).to_string())
    json.dump(out, open('/home/claude/data/inplay_mult.json', 'w'), indent=1)
