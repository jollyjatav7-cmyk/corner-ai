"""How much do corner deviations persist within a match?  (after controlling for pre-match expectation,
time profile, and the actual score/red-card path)."""
import numpy as np, pandas as pd
exec(open('/home/claude/scripts/inplay_effects.py').read().split("Xd = design(T)")[0])
Xd = design(T)
coef = pd.read_pickle('/home/claude/data/inplay_coef_c.pkl')
T['exp_c'] = T.mu_c / 90.0 * T.expo * np.exp(Xd[coef.index].values @ coef.values)
n = len(P)
P['eh'] = T.exp_c.values[:n]; P['ea'] = T.exp_c.values[n:]
# half-level aggregates
H = P.groupby(['mid', 'per']).agg(ch=('ch', 'sum'), ca=('ca', 'sum'), eh=('eh', 'sum'), ea=('ea', 'sum')).unstack('per')
H.columns = [f'{a}{b}' for a, b in H.columns]
for k in ['1', '2']:
    H['rt' + k] = (H['ch' + k] + H['ca' + k]) - (H['eh' + k] + H['ea' + k])
    H['rd' + k] = (H['ch' + k] - H['ca' + k]) - (H['eh' + k] - H['ea' + k])
    H['rh' + k] = H['ch' + k] - H['eh' + k]
    H['ra' + k] = H['ca' + k] - H['ea' + k]
print('n matches', len(H))
print('corr resid total  H1 vs H2:', np.corrcoef(H.rt1, H.rt2)[0, 1].round(4))
print('corr resid diff   H1 vs H2:', np.corrcoef(H.rd1, H.rd2)[0, 1].round(4))
print('corr resid home   H1 vs H2:', np.corrcoef(H.rh1, H.rh2)[0, 1].round(4))
print('corr resid away   H1 vs H2:', np.corrcoef(H.ra1, H.ra2)[0, 1].round(4))
print('corr resid home H1 vs away H2:', np.corrcoef(H.rh1, H.ra2)[0, 1].round(4))
# regression slopes of H2 residual on H1 residual
for a, b in [('rt1', 'rt2'), ('rd1', 'rd2'), ('rh1', 'rh2')]:
    s = np.cov(H[a], H[b])[0, 1] / H[a].var()
    print(f'slope {b}~{a}: {s:.4f}')
# implied persistent variance components (method of moments, multiplicative):
# Cov(c1h, c2h) = E1h*E2h * (exp(sT^2+sD^2)-1) ; Cov(c1h,c2a) = E1h*E2a*(exp(sT^2 - sD^2)-1)
cov_hh = ((H.rh1 * H.rh2).sum() / (H.eh1 * H.eh2).sum() + (H.ra1 * H.ra2).sum() / (H.ea1 * H.ea2).sum()) / 2
cov_ha = ((H.rh1 * H.ra2).sum() / (H.eh1 * H.ea2).sum() + (H.ra1 * H.rh2).sum() / (H.ea1 * H.eh2).sum()) / 2
a = np.log1p(cov_hh); b = np.log1p(cov_ha)
sT2 = (a + b) / 2; sD2 = (a - b) / 2
print('persistent sT^2, sD^2 (MoM):', round(sT2, 5), round(sD2, 5), ' -> sT, sD', np.sqrt(max(sT2, 0)).round(4), np.sqrt(max(sD2, 0)).round(4))
# same-half heterogeneity
v_hh = ((H.rh1 ** 2 - H.eh1).sum() / (H.eh1 ** 2).sum() + (H.ra1 ** 2 - H.ea1).sum() / (H.ea1 ** 2).sum()) / 2
v_ha = ((H.rh1 * H.ra1).sum() / (H.eh1 * H.ea1).sum())
a2 = np.log1p(v_hh); b2 = np.log1p(v_ha)
print('within-half total sT^2, sD^2:', round((a2 + b2) / 2, 5), round((a2 - b2) / 2, 5))
H.to_pickle('/home/claude/data/halves.pkl')
P[['mid', 'per', 'min', 'eh', 'ea']].to_pickle('/home/claude/data/panel_exp.pkl')
