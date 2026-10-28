"""Head-to-head report on StatsBomb 2015/16 club matches.
A) corner-sb (角球数据记录) own leave-one-league-out predictions vs my model, same checkpoints / lines.
B) corner-six (角球六要素) forward model (first-half six factors -> each team's second-half corners), leave-one-league-out,
   vs my model's expected second-half corners at half-time."""
import sys, math, json
import numpy as np, pandas as pd

out = {}
# ---------------- A) corner-sb ----------------
their = pd.read_csv('/home/claude/cmp/work2/val3_s0.25.csv')
mine = pd.read_csv('/home/claude/cmp/mine_checkpoints.csv')
key = ['mid', 'half', 'c', 'kind', 'line']
common = their[their.model == 'act'][key].merge(mine[key], on=key)
A = pd.concat([their.merge(common, on=key), mine.merge(common, on=key)], ignore_index=True)
A['p'] = A.p.clip(1e-4, 1 - 1e-4)
A['brier'] = (A.p - A.win) ** 2
A['ll'] = -(A.win * np.log(A.p) + (1 - A.win) * np.log(1 - A.p))
names = {'base': '角球数据记录·只用时间比分', 'act': '角球数据记录·加记录(进入前场/禁区/传中)',
         'pri': '角球数据记录·加全场预期', 'actpri': '角球数据记录·记录+全场预期', 'mine': '新程序'}
rows = []
for (kind, half), g in A.groupby(['kind', 'half']):
    for m, x in g.groupby('model'):
        rows.append(dict(kind=kind, half=half, model=names[m], n=len(x), brier=x.brier.mean(), logloss=x.ll.mean()))
for kind, g in A.groupby('kind'):
    for m, x in g.groupby('model'):
        rows.append(dict(kind=kind, half='all', model=names[m], n=len(x), brier=x.brier.mean(), logloss=x.ll.mean()))
R = pd.DataFrame(rows)
pd.set_option('display.width', 250)
print(R.sort_values(['kind', 'half', 'brier']).round(5).to_string(index=False))
# paired bootstrap of the Brier difference: mine vs act / actpri (by match)
rng = np.random.default_rng(0)
for kind in ('tot', 'hcap'):
    g = A[A.kind == kind]
    piv = g.pivot_table(index=key, columns='model', values='brier').reset_index()
    per = piv.groupby('mid')[['act', 'actpri', 'mine', 'base']].sum()
    mids = per.index.values
    for ref in ('act', 'actpri'):
        d = []
        for _ in range(1000):
            s = per.loc[rng.choice(mids, len(mids))]
            d.append((s['mine'].sum() - s[ref].sum()) / s[ref].sum())
        lo, hi = np.percentile(d, [2.5, 97.5])
        diff = (per['mine'].sum() - per[ref].sum()) / per[ref].sum()
        print(f'{kind}: mine vs {ref}: Brier change {100 * diff:+.2f}%  (95% CI {100 * lo:+.2f}% .. {100 * hi:+.2f}%)')
        out[f'{kind}_vs_{ref}'] = [diff, lo, hi]
# calibration
for m in ('act', 'mine'):
    x = A[(A.model == m)]
    x = x.assign(b=pd.cut(x.p, [0, .2, .4, .6, .8, 1], include_lowest=True))
    print(names[m], x.groupby(['kind', 'b'], observed=True).agg(pred=('p', 'mean'), act=('win', 'mean'), n=('win', 'size')).round(3).to_string())

# ---------------- B) corner-six forward test ----------------
sys.argv = ['x', '/home/claude/cmp/six', '/home/claude/cmp/six_res']
src = open('/home/claude/repos/corner-six/dev/model/six_predict.py').read()
exec(src.split('club = [r for r in H')[0])
club = [r for r in H if r['kind'] == 'club']
from collections import defaultdict
pp = defaultdict(dict)
for r in club:
    pp[(r['match_id'], r['side'])][r['period']] = r
pairs = [(v['1'], v['2']) for v in pp.values() if '1' in v and '2' in v]
comp_of = {r['match_id']: r['comp'] for r in club}
mh = pd.read_csv('/home/claude/cmp/mine_h2team.csv').set_index('mid')


def design(pairs_, cols):
    X = []
    for h1, h2 in pairs_:
        f = feat(h1); x = []
        if 'ck' in cols: x.append(h1['corners'] / h1['mins'] * 45)
        if 'six' in cols: x.extend(f)
        if 'home' in cols: x.append(1.0 if h1['side'] == '0' else 0.0)
        if 'state' in cols:
            dd = h2['score_for_start'] - h2['score_against_start']; x.extend([1.0 if dd < 0 else 0.0, 1.0 if dd > 0 else 0.0])
        X.append(x)
    return np.array(X, dtype=float)


variants = [('平均（同一联赛）', []), ('上半场角球', ['ck']), ('角球六要素：上半场六项', ['six']),
            ('六项＋角球＋主客＋比分', ['ck', 'six', 'home', 'state'])]
leagues = sorted(set(comp_of.values()))
pred = {v[0]: {} for v in variants}
for lg in leagues:
    tr = [p for p in pairs if comp_of[p[0]['match_id']] != lg]
    te = [p for p in pairs if comp_of[p[0]['match_id']] == lg]
    ytr = np.array([h2['corners'] for _, h2 in tr]); otr = np.log(np.array([h2['mins'] for _, h2 in tr]) / 45.0)
    ote_ = np.log(np.array([h2['mins'] for _, h2 in te]) / 45.0)
    for name, cols in variants:
        if cols:
            Xtr, Xte = design(tr, cols), design(te, cols)
            m_, s_ = Xtr.mean(0), Xtr.std(0); s_[s_ == 0] = 1
            Atr = np.column_stack([np.ones(len(Xtr)), (Xtr - m_) / s_]); Ate = np.column_stack([np.ones(len(Xte)), (Xte - m_) / s_])
        else:
            Atr, Ate = np.ones((len(tr), 1)), np.ones((len(te), 1))
        bb = irls(Atr, ytr, otr)
        lt = np.exp(Ate @ bb + ote_)
        for (h1, h2), l in zip(te, lt):
            pred[name][(h1['match_id'], h1['side'])] = l
rows = []
keys = [(h1['match_id'], h1['side']) for h1, _ in pairs if int(h1['match_id']) in mh.index]
y = np.array([pp[k]['2']['corners'] for k in keys])
mine_l = np.array([mh.loc[int(k[0]), 'mu_h2' if k[1] == '0' else 'mu_a2'] for k in keys])
chk = np.array([mh.loc[int(k[0]), 'y_h2' if k[1] == '0' else 'y_a2'] for k in keys])
print('target check (my corner count == theirs):', np.mean(chk == y).round(4))


def metr(l):
    return dict(loglik=np.mean(y * np.log(l) - l - np.array([math.lgamma(v + 1) for v in y])), mae=np.abs(y - l).mean(),
                corr=np.corrcoef(l, y)[0, 1])


for name, _ in variants:
    l = np.array([pred[name][k] for k in keys]); rows.append(dict(model=name, **metr(l)))
rows.append(dict(model='新程序（中场时）', **metr(mine_l)))
B = pd.DataFrame(rows)
print('\nteam second-half corners, n =', len(y))
print(B.round(4).to_string(index=False))
R.to_csv('/home/claude/cmp/report_A.csv', index=False); B.to_csv('/home/claude/cmp/report_B.csv', index=False)
json.dump(out, open('/home/claude/cmp/report_ci.json', 'w'))
