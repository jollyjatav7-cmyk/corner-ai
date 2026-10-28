"""Snapshot evaluation of in-play corner predictions on event data.
For each match and snapshot minute tau: predict remaining corners (to FT, and to HT when tau<45)
with the engine (expected path from the current score), then fit persistence + dispersion."""
import numpy as np, pandas as pd, json, sys
from scipy.optimize import minimize
from scipy.special import gammaln
sys.path.insert(0, '/home/claude/scripts')
from engine import Engine, G

P = pd.read_pickle('/home/claude/data/panel.pkl')
M = pd.read_pickle('/home/claude/data/panel_meta.pkl').set_index('mid')
M['stop1'] = np.clip(np.ceil(M.end1) - 45, 1, 8).astype(int)
M['stop2'] = np.clip(np.ceil(M.end2) - 90, 2, 12).astype(int)
SNAP = [0, 15, 30, 45, 60, 75, 85]  # 45 = half-time (start of 2H)

recs = []
for (s1, s2), Mg in M.groupby(['stop1', 'stop2']):
    E = Engine(s1, s2)
    mids = Mg.index.values
    bh, ba = E.calibrate_goals(Mg.lh.values, Mg.la.values, iters=8)
    cbh, cba, r0 = E.calibrate_corners(bh, ba, Mg.mu_ch.values, Mg.mu_ca.values)
    Pg = P[P.mid.isin(mids)]
    for tau in SNAP:
        # slot index where the snapshot starts
        if tau < 45:
            k0 = [k for k, s in enumerate(E.S) if s[0] == 1 and s[1] == tau][0]
            per0 = 1
        else:
            k0 = [k for k, s in enumerate(E.S) if s[0] == 2 and s[1] == tau][0]
            per0 = 2
        before = Pg[(Pg.per < per0) | ((Pg.per == per0) & (Pg['min'] < tau))]
        after = Pg[~Pg.index.isin(before.index)]
        b = before.groupby('mid')[['ch', 'ca', 'gh', 'ga', 'sh', 'sa', 'oh', 'oa', 'rh', 'ra']].sum().reindex(mids).fillna(0)
        a = after.groupby('mid')[['ch', 'ca']].sum().reindex(mids).fillna(0)
        a1 = after[after.per == 1].groupby('mid')[['ch', 'ca']].sum().reindex(mids).fillna(0)
        P0 = np.zeros((len(mids), G, G))
        P0[np.arange(len(mids)), b.gh.clip(0, G - 1).astype(int), b.ga.clip(0, G - 1).astype(int)] = 1
        rr = E.run(bh, ba, start=k0, P0=P0, reds=(b.rh.values, b.ra.values), ch=cbh, ca=cba)
        # expected so far (from kickoff, pre-match expected path) for residuals
        rs = E.run(bh, ba, start=0, ch=cbh, ca=cba, upto=k0) if k0 > 0 else None
        for j, mid in enumerate(mids):
            recs.append(dict(mid=mid, tau=tau, ch=b.ch.iloc[j], ca=b.ca.iloc[j], gh=b.gh.iloc[j], ga=b.ga.iloc[j],
                             sh=b.sh.iloc[j], sa=b.sa.iloc[j], rh=b.rh.iloc[j], ra=b.ra.iloc[j],
                             Rh=a.ch.iloc[j], Ra=a.ca.iloc[j], R1h=a1.ch.iloc[j], R1a=a1.ca.iloc[j],
                             eRh=rr['EC_h'][j], eRa=rr['EC_a'][j], eR1h=rr['EC1_h'][j], eR1a=rr['EC1_a'][j],
                             eSh=rs['EC_h'][j] if rs else 0.0, eSa=rs['EC_a'][j] if rs else 0.0,
                             mu_ch=Mg.mu_ch.iloc[j], mu_ca=Mg.mu_ca.iloc[j]))
    print('group', s1, s2, len(mids), flush=True)
R = pd.DataFrame(recs)
R.to_pickle('/home/claude/data/snapshots.pkl')
print(R.groupby('tau')[['Rh', 'eRh', 'Ra', 'eRa', 'R1h', 'eR1h']].mean().round(3))
