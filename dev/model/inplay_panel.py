"""Per-minute panel from event data, joined to pre-match expectations."""
import json, numpy as np, pandas as pd
import sys
sys.path.insert(0, '/home/claude/scripts')
from join_events import load_events, join

pred = pd.read_pickle('/home/claude/data/prematch_pred_2021.pkl')
X = pd.read_pickle('/home/claude/data/features.pkl')


def build_panel(recs):
    rows = []
    meta = []
    for r in recs:
        fi = r.get('fd_idx')
        if fi is None or fi not in pred.index:
            continue
        p = pred.loc[fi]
        x = X.loc[fi]
        lh, la = x.lh, x.la
        if not np.isfinite(lh):
            lh, la = p.lg_h, p.lg_a
        pe = {int(k): v for k, v in r['period_end'].items()}
        if 1 not in pe or 2 not in pe:
            continue
        end1 = max(pe[1], 45.0); end2 = max(pe[2], 90.0)
        ev = sorted([e for e in r['ev'] if e[0] in (1, 2)], key=lambda e: (e[0], e[1], e[2]))
        # minute buckets
        segs = [(1, m) for m in range(0, int(np.ceil(end1)))] + [(2, m) for m in range(45, int(np.ceil(end2)))]
        idx = {s: i for i, s in enumerate(segs)}
        n = len(segs)
        ch = np.zeros(n); ca = np.zeros(n); gh = np.zeros(n); ga = np.zeros(n)
        sh = np.zeros(n); sa = np.zeros(n); oh = np.zeros(n); oa = np.zeros(n); rh = np.zeros(n); ra = np.zeros(n)
        for e in ev:
            per, mi = e[0], e[1]
            key = (per, mi)
            if key not in idx:
                key = (per, int(np.ceil(end1)) - 1 if per == 1 else int(np.ceil(end2)) - 1)
            i = idx[key]
            side = e[3]; code = e[4]
            if code == 'C':
                (ch if side == 'h' else ca)[i] += 1
            elif code in ('G', 'OG'):
                (gh if side == 'h' else ga)[i] += 1
                if code == 'G':
                    (sh if side == 'h' else sa)[i] += 1
                    (oh if side == 'h' else oa)[i] += 1
            elif code == 'S':
                (sh if side == 'h' else sa)[i] += 1
                if e[6]:
                    (oh if side == 'h' else oa)[i] += 1
            elif code == 'R':
                (rh if side == 'h' else ra)[i] += 1
        # exposure (fraction of the last minute of each half actually played)
        expo = np.ones(n)
        expo[idx[(1, int(np.ceil(end1)) - 1)]] = end1 - (int(np.ceil(end1)) - 1)
        expo[idx[(2, int(np.ceil(end2)) - 1)]] = end2 - (int(np.ceil(end2)) - 1)
        # state at the START of each minute
        cgh = np.concatenate([[0], np.cumsum(gh)[:-1]]); cga = np.concatenate([[0], np.cumsum(ga)[:-1]])
        crh = np.concatenate([[0], np.cumsum(rh)[:-1]]); cra = np.concatenate([[0], np.cumsum(ra)[:-1]])
        mid = r['id']
        df = pd.DataFrame({'mid': mid, 'per': [s[0] for s in segs], 'min': [s[1] for s in segs], 'expo': expo,
                           'ch': ch, 'ca': ca, 'gh': gh, 'ga': ga, 'sh': sh, 'sa': sa, 'oh': oh, 'oa': oa,
                           'rh': rh, 'ra': ra, 'gd': cgh - cga, 'cgh': cgh, 'cga': cga, 'crh': crh, 'cra': cra})
        rows.append(df)
        meta.append(dict(mid=mid, src=r['src'], comp=r['comp'], date=r['date'], fd_idx=fi,
                         mu_ch=p.mu_ch, mu_ca=p.mu_ca, lh=lh, la=la, end1=end1, end2=end2,
                         fd_hc=x.HomeCorners, fd_ac=x.AwayCorners, ev_hc=ch.sum(), ev_ac=ca.sum()))
    return pd.concat(rows, ignore_index=True), pd.DataFrame(meta)


if __name__ == '__main__':
    recs = join(load_events())
    P, M = build_panel(recs)
    P.to_pickle('/home/claude/data/panel.pkl'); M.to_pickle('/home/claude/data/panel_meta.pkl')
    print(P.shape, M.shape)
    print(M.groupby('src')[['ev_hc', 'ev_ac', 'fd_hc', 'fd_ac', 'end1', 'end2']].mean().round(3))
    print('corr ev vs fd corners', np.corrcoef(M.ev_hc + M.ev_ac, M.fd_hc + M.fd_ac)[0, 1])
