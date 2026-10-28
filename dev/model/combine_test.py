"""Does combining the new model with the earlier apps' live records make predictions better?
Same 1,517 StatsBomb 2015/16 matches, leave-one-league-out for everything that is fitted here.

A) corner-sb checkpoints (half totals / half handicaps):
   1. probability blend of new model and corner-sb 'act' (weights fitted on 3 leagues, tested on the 4th)
   2. new model's expected remaining corners x corner-sb's activity multipliers (entries into final third, box,
      crosses), coefficients re-fitted on top of the new model (3 leagues), tested on the 4th
B) corner-six: each team's second-half corners at half-time = new model's expectation x six-factor multipliers.
"""
import sys, math, json
sys.path.insert(0, '/home/claude/scripts')
sys.path.insert(0, '/home/claude/repos/corner-sb/dev/model')
import numpy as np, pandas as pd
import model2 as M2
from cdist import joint, tot_dif, M as MC
from sklearn.linear_model import LogisticRegression

W = '/home/claude/cmp/work2'
ev = pd.read_csv(f'{W}/ev.csv'); mt = pd.read_csv(f'{W}/mt.csv')
cp = pd.read_pickle(f'{W}/cp_no_LaLiga.pkl')
their = pd.read_csv(f'{W}/val3_s0.25.csv')
mine = pd.read_csv('/home/claude/cmp/mine_checkpoints.csv')
LEAGUES = sorted(mt.league.unique())
lg_of = mt.set_index('match_id').league.to_dict()
NAMES = ['so_own_f3', 'so_own_bx', 'so_own_cr', 'so_opp_f3', 'so_opp_bx']
PSEUDO = 15.0


def side_rates(ev_, mt_):
    mins = (mt_.p1_len.sum() + mt_.p2_len.sum()) / 60.0
    return {s: {g: float((ev_[(ev_.side == s)].code.isin(c)).sum() / mins) for g, c in M2.GROUPS.items()} for s in (1, 0)}


def feats(d, sr):
    cols = []
    side = d.side.values
    for nm in NAMES:
        kind, who, g = nm.split('_')
        n = d[f'n_{who}_{g}'].values
        tgt = side if who == 'own' else 1 - side
        r = np.where(tgt == 1, sr[1][g], sr[0][g])
        a = r * PSEUDO
        cols.append(np.log((n + a) / (r * d.elapsed.values + a)))
    return np.column_stack(cols)


# ---- per side rows at the validation checkpoints: my expected remaining + their activity counts ----
CHK = {(1, 9), (1, 18), (1, 30), (1, 39), (2, 0), (2, 9), (2, 18), (2, 30), (2, 39)}
cpv = cp[[(h, c) in CHK for h, c in zip(cp.half, cp.c)]].copy()
m1 = mine.drop_duplicates(['mid', 'half', 'c'])[['mid', 'half', 'c', 'mu_h', 'mu_a', 'f_h', 'f_a']]
cpv = cpv.merge(m1, left_on=['match_id', 'half', 'c'], right_on=['mid', 'half', 'c'])
cpv['f'] = np.where(cpv.side == 1, cpv.f_h, cpv.f_a)
cpv['mu'] = np.where(cpv.side == 1, cpv.mu_h, cpv.mu_a)
cpv['cur'] = cpv.f - cpv.y                       # corners already taken in this half
cpv['rem_mine'] = np.maximum(cpv.mu - cpv.cur, 1e-3)
print('rows', len(cpv), ' check remaining mean: mine', cpv.rem_mine.mean().round(3), 'actual', cpv.y.mean().round(3))


def poisson_fit(X, y, off, ridge=30.0, it=60):
    b = np.zeros(X.shape[1])
    for _ in range(it):
        eta = X @ b + off; lam = np.exp(eta)
        g = X.T @ (y - lam) - ridge * np.r_[0, b[1:]]
        H = X.T @ (X * lam[:, None]) + ridge * np.diag(np.r_[0, np.ones(len(b) - 1)])
        st = np.linalg.solve(H, g); b += st
        if np.abs(st).max() < 1e-9: break
    return b


adj = np.ones(len(cpv))
coef = {}
for lg in LEAGUES:
    tr_ids = mt[mt.league != lg].match_id
    sr = side_rates(ev[ev.match_id.isin(tr_ids)], mt[mt.league != lg])
    tr = cpv[cpv.league != lg]; te = cpv[cpv.league == lg]
    Xtr = np.column_stack([np.ones(len(tr)), feats(tr, sr)]); Xte = np.column_stack([np.ones(len(te)), feats(te, sr)])
    b = poisson_fit(Xtr, tr.y.values.astype(float), np.log(tr.rem_mine.values))
    coef[lg] = b.round(3).tolist()
    adj[(cpv.league == lg).values] = np.exp(Xte @ b)
cpv['rem_comb'] = cpv.rem_mine * adj
print('activity coefficients on top of the new model (intercept, own f3, own box, own cross, opp f3, opp box):')
for k, v in coef.items(): print('  ', k, v)

# probabilities for the combined means (same dispersion rules as the app)
TL = {1: [3.5, 4.5, 5.5], 2: [4.5, 5.5]}; HL = [-1.5, -0.5, 0.5]
H = cpv[cpv.side == 1].set_index(['match_id', 'half', 'c']); A_ = cpv[cpv.side == 0].set_index(['match_id', 'half', 'c'])
J = H[['rem_comb', 'cur', 'f']].join(A_[['rem_comb', 'cur', 'f']], lsuffix='_h', rsuffix='_a').dropna().reset_index()
rows = []
for half in (1, 2):
    D = J[J.half == half]
    eh, ea = D.rem_comb_h.values, D.rem_comb_a.values
    eh = eh * (np.exp(-0.0) )
    sT, a_, b_ = (0.10, 0.091, 0.335) if half == 1 else (0.105, 0.109, 0.40)
    sD = np.minimum(0.6, a_ + b_ / np.sqrt(np.maximum(eh + ea, 0.05))); key = np.round(sD, 2)
    PT = np.zeros((len(D), 2 * MC - 1)); PD = np.zeros((len(D), 2 * MC - 1))
    for kk in np.unique(key):
        idx = np.where(key == kk)[0]; a1, a2 = tot_dif(joint(eh[idx], ea[idx], sT, kk)); PT[idx] = a1; PD[idx] = a2
    ks = np.arange(2 * MC - 1) - (MC - 1)
    for j, r in enumerate(D.itertuples()):
        cur = r.cur_h + r.cur_a
        for L in TL[half]:
            need = int(np.floor(L - cur)) + 1
            rows.append(dict(mid=r.match_id, half=half, c=r.c, kind='tot', line=L, model='comb_act', p=PT[j, max(need, 0):].sum(), win=int(r.f_h + r.f_a > L)))
        d0 = r.cur_h - r.cur_a
        for L in HL:
            rows.append(dict(mid=r.match_id, half=half, c=r.c, kind='hcap', line=L, model='comb_act', p=PD[j, ks > -L - d0].sum(), win=int(r.f_h - r.f_a + L > 0)))
comb = pd.DataFrame(rows)

# probability blend (logit space), weights fitted leave-one-league-out
key = ['mid', 'half', 'c', 'kind', 'line']
base = their[their.model.isin(['act', 'actpri'])].pivot_table(index=key, values='p', columns='model').reset_index()
B = base.merge(mine[key + ['p', 'win']].rename(columns={'p': 'mine'}), on=key).merge(comb[key + ['p']].rename(columns={'p': 'comb_act'}), on=key)
B['lg'] = B.mid.map(lg_of)
lgt = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
B['blend'] = np.nan
for kind in ('tot', 'hcap'):
    for lg in LEAGUES:
        tr = B[(B.kind == kind) & (B.lg != lg)]; te = (B.kind == kind) & (B.lg == lg)
        X = np.column_stack([lgt(tr.mine), lgt(tr.act)])
        lr = LogisticRegression(C=1e6, fit_intercept=False).fit(X, tr.win)
        B.loc[te, 'blend'] = lr.predict_proba(np.column_stack([lgt(B.loc[te, 'mine']), lgt(B.loc[te, 'act'])]))[:, 1]
res = []
for kind in ('tot', 'hcap'):
    for half in (1, 2, 'all'):
        g = B[(B.kind == kind) & ((B.half == half) if half != 'all' else True)]
        r = {'kind': kind, 'half': half, 'n': len(g)}
        for m in ('act', 'actpri', 'mine', 'blend', 'comb_act'):
            r[m] = ((g[m] - g.win) ** 2).mean()
        res.append(r)
R = pd.DataFrame(res)
pd.set_option('display.width', 250)
print(R.round(5).to_string(index=False))
rng = np.random.default_rng(1)
for kind in ('tot', 'hcap'):
    g = B[B.kind == kind].copy()
    for m in ('mine', 'blend', 'comb_act', 'actpri'):
        g['b_' + m] = (g[m] - g.win) ** 2
    per = g.groupby('mid')[['b_mine', 'b_blend', 'b_comb_act', 'b_actpri']].sum()
    for m in ('blend', 'comb_act'):
        d = []
        ids = per.index.values
        for _ in range(1000):
            s = per.loc[rng.choice(ids, len(ids))]; d.append(s['b_' + m].sum() / s['b_mine'].sum() - 1)
        print(f'{kind}: {m} vs new model alone: {100 * (per["b_" + m].sum() / per["b_mine"].sum() - 1):+.2f}%  95% CI {100 * np.percentile(d, 2.5):+.2f}% .. {100 * np.percentile(d, 97.5):+.2f}%')
R.to_csv('/home/claude/cmp/combine_A.csv', index=False)

# ---------------- B) six factors on top of the new model ----------------
sys.argv = ['x', '/home/claude/cmp/six', '/home/claude/cmp/six_res']
src = open('/home/claude/repos/corner-six/dev/model/six_predict.py').read()
exec(src.split('club = [r for r in H')[0])
from collections import defaultdict
club = [r for r in H if r['kind'] == 'club']
pp = defaultdict(dict)
for r in club: pp[(r['match_id'], r['side'])][r['period']] = r
mh = pd.read_csv('/home/claude/cmp/mine_h2team.csv').set_index('mid')
keys = [k for k, v in pp.items() if '1' in v and '2' in v and int(k[0]) in mh.index]
comp = np.array([pp[k]['1']['comp'] for k in keys])
y = np.array([pp[k]['2']['corners'] for k in keys], float)
base_l = np.array([mh.loc[int(k[0]), 'mu_h2' if k[1] == '0' else 'mu_a2'] for k in keys])
X6 = np.array([feat(pp[k]['1']) for k in keys])
X6 = (X6 - X6.mean(0)) / X6.std(0)
ck1 = np.array([pp[k]['1']['corners'] / pp[k]['1']['mins'] * 45 for k in keys])
lam = {'新程序': base_l.copy(), '新程序×六要素': np.zeros(len(y)), '新程序×六要素×上半场角球': np.zeros(len(y))}
for lg in sorted(set(comp)):
    tr, te = comp != lg, comp == lg
    for nm, X in (('新程序×六要素', X6), ('新程序×六要素×上半场角球', np.column_stack([X6, (ck1 - ck1.mean()) / ck1.std()]))):
        A1 = np.column_stack([np.ones(tr.sum()), X[tr]]); A2 = np.column_stack([np.ones(te.sum()), X[te]])
        b = poisson_fit(A1, y[tr], np.log(base_l[tr]), ridge=5.0)
        lam[nm][te] = base_l[te] * np.exp(A2 @ b)
for nm, l in lam.items():
    print(f'{nm:16s} corr {np.corrcoef(l, y)[0, 1]:.4f}  mae {np.abs(y - l).mean():.4f}  loglik {np.mean(y * np.log(l) - l - np.array([math.lgamma(v + 1) for v in y])):.4f}')
