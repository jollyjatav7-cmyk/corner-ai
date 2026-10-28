"""Head-to-head on StatsBomb 2015/16 (EPL, La Liga, Serie A, Ligue 1; 1,517 matches) - the data both earlier apps
were built and validated on.  My model's in-play multipliers are re-fitted WITHOUT these matches (Wyscout 2017/18 and
other StatsBomb seasons only), so every prediction here is out of sample for my model too.

Outputs /home/claude/cmp/mine_checkpoints.csv  (same rows as corner-sb's fit3 validate)
        /home/claude/cmp/mine_h2team.csv       (expected second-half corners per team at half-time)
"""
import sys, json, copy
sys.path.insert(0, '/home/claude/scripts')
import numpy as np, pandas as pd
from sklearn.linear_model import PoissonRegressor
from cdist import joint, tot_dif, M as MC
import engine as EN

P = pd.read_pickle('/home/claude/data/panel.pkl')
Mt = pd.read_pickle('/home/claude/data/panel_meta.pkl')
Mt['date'] = pd.to_datetime(Mt.date)
test = Mt[(Mt.src == 'sb') & Mt.comp.isin(['Premier League', 'La Liga', 'Serie A', 'Ligue 1'])
          & (Mt.date >= '2015-07-01') & (Mt.date <= '2016-06-30')].copy()
print('test matches', len(test))

# ---------- refit minute multipliers without the test matches ----------
exec(open('/home/claude/scripts/inplay_effects2.py').read().split("if __name__ == '__main__':")[0].replace(
    "P = pd.read_pickle('/home/claude/data/panel.pkl')", "P = P[~P.mid.isin(test.mid)].copy()").replace(
    "M = pd.read_pickle('/home/claude/data/panel_meta.pkl').set_index('mid')", "M = Mt.set_index('mid')"))
Xd = design(T)
mult = {}
for target, base in [('c', 'mu_c'), ('g', 'lam')]:
    w = T[base] / 90.0 * T.expo
    m = PoissonRegressor(alpha=1e-7, max_iter=3000, fit_intercept=False).fit(Xd, T[target] / w, sample_weight=w)
    mult[target] = dict(zip(Xd.columns, m.coef_))
print('refit on', T.mid.nunique(), 'matches; corner multipliers e.g. gd-1_p2', round(np.exp(mult['c']['gd-1_p2']), 3),
      'gd+1_p2', round(np.exp(mult['c']['gd+1_p2']), 3))

# ---------- compact events for the test matches ----------
ev = {}
for line in open('/home/claude/data/sb_compact.jsonl'):
    r = json.loads(line)
    if r['id'] in set(test.mid):
        ev[r['id']] = r['ev']


def sec(e):  # seconds since the start of the event's period
    return (e[1] - (45 if e[0] == 2 else 0)) * 60 + e[2]


CHK = [(1, 9), (1, 18), (1, 30), (1, 39), (2, 0), (2, 9), (2, 18), (2, 30), (2, 39)]
TL = {1: [3.5, 4.5, 5.5], 2: [4.5, 5.5]}
HL = [-1.5, -0.5, 0.5]
rows, h2rows = [], []
test['stop1'] = np.clip(np.ceil(test.end1) - 45, 1, 8).astype(int)
test['stop2'] = np.clip(np.ceil(test.end2) - 90, 2, 12).astype(int)
for (s1, s2), G in test.groupby(['stop1', 'stop2']):
    E = EN.Engine(s1, s2, mult=mult)
    mids = G.mid.values
    bh, ba = E.calibrate_goals(G.lh.values, G.la.values, iters=10)
    cbh, cba, _ = E.calibrate_corners(bh, ba, G.mu_ch.values, G.mu_ca.values)
    first2 = [k for k, s in enumerate(E.S) if s[0] == 2][0]
    for half, c in CHK:
        k0 = c if half == 1 else first2 + c
        tau = c if half == 1 else 45 + c
        n = len(mids)
        gh = np.zeros(n, int); ga = np.zeros(n, int); rh = np.zeros(n, int); ra = np.zeros(n, int)
        chm = np.zeros(n); cam = np.zeros(n)        # corners so far in the match
        chh = np.zeros(n, int); cah = np.zeros(n, int)  # corners so far in this half
        fh = np.zeros(n, int); fa = np.zeros(n, int)    # final corners of this half
        for j, mid in enumerate(mids):
            for e in ev[mid]:
                before = e[0] < half or (e[0] == half and sec(e) < c * 60)
                if e[4] == 'C':
                    if e[0] == half:
                        if e[3] == 'h': fh[j] += 1
                        else: fa[j] += 1
                    if before:
                        if e[3] == 'h': chm[j] += 1
                        else: cam[j] += 1
                        if e[0] == half:
                            if e[3] == 'h': chh[j] += 1
                            else: cah[j] += 1
                elif before and e[4] in ('G', 'OG'):
                    if e[3] == 'h': gh[j] += 1
                    else: ga[j] += 1
                elif before and e[4] == 'R':
                    if e[3] == 'h': rh[j] += 1
                    else: ra[j] += 1
        so = E.run(bh, ba, start=0, ch=cbh, ca=cba, upto=k0) if k0 > 0 else {'EC_h': np.zeros(n), 'EC_a': np.zeros(n)}
        K = 2.0
        rch = np.log((chm + K) / (so['EC_h'] + K)); rca = np.log((cam + K) / (so['EC_a'] + K))
        bc, bo = 0.0022 * tau, -0.0009 * max(0, tau - 30)
        mh = np.exp(bc * rch + bo * rca); ma = np.exp(bc * rca + bo * rch)
        P0 = np.zeros((n, EN.G, EN.G)); P0[np.arange(n), np.clip(gh, 0, 10), np.clip(ga, 0, 10)] = 1
        r = E.run(bh, ba, start=k0, P0=P0, reds=(rh, ra), ch=cbh * mh, ca=cba * ma)
        if half == 1:
            eh, ea = r['EC1_h'] * np.exp(-0.016), r['EC1_a'] * np.exp(-0.016)
            sT, a_, b_ = 0.10, 0.091, 0.335
        else:
            eh, ea = r['EC_h'], r['EC_a']
            sT, a_, b_ = 0.105, 0.109, 0.40
        Et = eh + ea
        sD = np.minimum(0.6, a_ + b_ / np.sqrt(np.maximum(Et, 0.05)))
        key = np.round(sD, 2)
        PT = np.zeros((n, 2 * MC - 1)); PD = np.zeros((n, 2 * MC - 1))
        for kk in np.unique(key):
            idx = np.where(key == kk)[0]
            a1, a2 = tot_dif(joint(eh[idx], ea[idx], sT, kk)); PT[idx] = a1; PD[idx] = a2
        for j, mid in enumerate(mids):
            base = dict(mid=int(mid), half=half, c=c, model='mine', mu_h=chh[j] + eh[j], mu_a=cah[j] + ea[j], f_h=fh[j], f_a=fa[j])
            cur = chh[j] + cah[j]
            for L in TL[half]:
                need = int(np.floor(L - cur)) + 1  # remaining needed so that total > L
                p = PT[j, max(need, 0):].sum()
                rows.append({**base, 'kind': 'tot', 'line': L, 'p': float(p), 'win': int(fh[j] + fa[j] > L)})
            d0 = chh[j] - cah[j]
            for L in HL:
                # home covers: d0 + rem_diff + L > 0  ->  rem_diff > -L - d0
                thr = -L - d0
                ks = np.arange(2 * MC - 1) - (MC - 1)
                p = PD[j, ks > thr].sum()
                rows.append({**base, 'kind': 'hcap', 'line': L, 'p': float(p), 'win': int(fh[j] - fa[j] + L > 0)})
            if half == 2 and c == 0:
                h2rows.append(dict(mid=int(mid), mu_h2=eh[j], mu_a2=ea[j], y_h2=fh[j], y_a2=fa[j]))
    print('group', s1, s2, len(mids), flush=True)
pd.DataFrame(rows).to_csv('/home/claude/cmp/mine_checkpoints.csv', index=False)
pd.DataFrame(h2rows).to_csv('/home/claude/cmp/mine_h2team.csv', index=False)
print('rows', len(rows), 'h2', len(h2rows))
