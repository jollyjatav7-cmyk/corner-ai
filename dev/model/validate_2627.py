"""Fresh out-of-sample check on the current season 2026/27 (matches Aug - Oct 2026).
GLMs trained on seasons <= 2025/26; ratings are online (pre-match only)."""
import numpy as np, pandas as pd, json, sys
sys.path.insert(0, '/home/claude/scripts')
from prematch_models import side_rows
from cdist import joint, tot_dif, M
from engine import Engine, G

F = pd.read_pickle('/home/claude/data/features_comb.pkl')
co = json.load(open('/home/claude/data/glm_coefs_2025.json'))
D = F[(F.season == 2026) & F.HomeCorners.notna() & F.AwayCorners.notna()].copy()
D['lh'] = np.nan; D['la'] = np.nan
S = side_rows(D, 'c')
n = len(D)


def pred(S, spec):
    c = co[spec]
    return np.exp(c['intercept'] + S[c['cols']].values @ np.array(c['coef']))


mu = pred(S, 'corner_nomkt')
D['mh'] = mu[:n]; D['ma'] = mu[n:]
Sg = side_rows(D, 'g')
lg = pred(Sg, 'goals_nomkt')
D['gh'] = lg[:n]; D['ga'] = lg[n:]
sT, sD = 0.106, 0.239
J = joint(D.mh.values, D.ma.values, sT, sD); PT, PD = tot_dif(J)
tot = (D.HomeCorners + D.AwayCorners).values.astype(int); dif = (D.HomeCorners - D.AwayCorners).values.astype(int)
OFF = M - 1
# baseline: league-season average from the PREVIOUS season (2025/26) of each league, same latent dispersion
prev = F[(F.season == 2025) & F.HomeCorners.notna()].groupby('Division')[['HomeCorners', 'AwayCorners']].mean()
b_h = D.Division.map(prev.HomeCorners).fillna(prev.HomeCorners.mean()).values; b_a = D.Division.map(prev.AwayCorners).fillna(prev.AwayCorners.mean()).values
J0 = joint(b_h, b_a, sT, sD); PT0, PD0 = tot_dif(J0)


def scores(PT, PD):
    i = np.arange(n)
    r = dict(logS_tot=np.log(PT[i, tot]).mean(), logS_dif=np.log(PD[i, dif + OFF]).mean())
    for L in [8.5, 9.5, 10.5, 11.5]:
        p = PT[:, int(L + .5):].sum(1); r[f'brier_o{L}'] = ((p - (tot > L)) ** 2).mean()
    for h in [-1.5, 0.5, 1.5]:
        p = PD[:, int(np.floor(h)) + 1 + OFF:].sum(1); r[f'brier_d>{h}'] = ((p - (dif > h)) ** 2).mean()
    return r


res = pd.DataFrame({'model (ratings, no odds)': scores(PT, PD), 'baseline (last season league avg)': scores(PT0, PD0)})
print('FT corners, 2026/27 matches:', n)
print(res.round(5).to_string())
print('mean predicted total', (D.mh + D.ma).mean().round(3), ' actual', tot.mean().round(3))

# ---- half-time corners (top-10 leagues have 1H splits) ----
H = D[D.HC1.notna() & D.AC1.notna()].copy()
E = Engine(3, 6)
bh, ba = E.calibrate_goals(H.gh.values, H.ga.values, iters=8)
ch, ca, r0 = E.calibrate_corners(bh, ba, H.mh.values, H.ma.values)
share_h = r0['EC1_h'] / r0['EC_h']; share_a = r0['EC1_a'] / r0['EC_a']
print('\nHT: matches', len(H), ' engine 1H share home %.4f away %.4f' % (share_h.mean(), share_a.mean()))
print('actual 1H share home %.4f away %.4f' % (H.HC1.sum() / H.HomeCorners.sum(), H.AC1.sum() / H.AwayCorners.sum()))
b0 = -0.016
h1h = H.mh.values * share_h * np.exp(b0); h1a = H.ma.values * share_a * np.exp(b0)
print('pred HT total mean %.3f  actual %.3f' % ((h1h + h1a).mean(), (H.HC1 + H.AC1).mean()))
JH = joint(h1h, h1a, 0.114, 0.244); PTH, PDH = tot_dif(JH)
t1 = (H.HC1 + H.AC1).values.astype(int); d1 = (H.HC1 - H.AC1).values.astype(int)
i = np.arange(len(H))
print('HT logS total', np.log(PTH[i, t1]).mean().round(4), ' diff', np.log(PDH[i, d1 + OFF]).mean().round(4))
for L in [3.5, 4.5, 5.5]:
    p = PTH[:, int(L + .5):].sum(1)
    print(f'HT over {L}: mean pred {p.mean():.3f}  actual {(t1 > L).mean():.3f}  brier {((p - (t1 > L)) ** 2).mean():.4f}  '
          f'brier(const) {((p.mean() - (t1 > L)) ** 2).mean():.4f}')
obs = np.bincount(t1, minlength=15)[:13] / len(t1)
print(pd.DataFrame({'obs': obs, 'pred': PTH.mean(0)[:13]}).round(3).T.to_string())
