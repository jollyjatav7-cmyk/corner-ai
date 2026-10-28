import numpy as np, pandas as pd, json
from scipy.optimize import minimize
from scipy.special import gammaln

R = pd.read_pickle('/home/claude/data/snapshots.pkl')
xq, wq = np.polynomial.hermite_e.hermegauss(12)
wq = wq / wq.sum()
K = 2.0


def joint_ll(yh, ya, mh, ma, sT, sD):
    lt = sT * xq - sT ** 2 / 2
    ld = sD * xq
    c = sD ** 2 / 2
    Th = np.exp(lt)[:, None]; Dd = np.exp(ld)[None, :]
    lam_h = mh[:, None, None] * (Th * Dd)[None] / np.exp(c)
    lam_a = ma[:, None, None] * (Th / Dd)[None] / np.exp(c)
    lp = (yh[:, None, None] * np.log(lam_h) - lam_h - gammaln(yh + 1)[:, None, None]
          + ya[:, None, None] * np.log(lam_a) - lam_a - gammaln(ya + 1)[:, None, None])
    W = (wq[:, None] * wq[None, :])[None]
    mx = lp.max((1, 2), keepdims=True)
    return np.log((np.exp(lp - mx) * W).sum((1, 2))) + mx[:, 0, 0]


def feats(D):
    rch = np.log((D.ch + K) / (D.eSh + K)); rca = np.log((D.ca + K) / (D.eSa + K))
    ls = np.log((D.sh + 1) / (D.sa + 1))
    ts = np.log(D.sh + D.sa + 1)
    ts = ts - ts.groupby(D.tau).transform('mean')
    return rch.values, rca.values, ls.values, ts.values


def make_nll(D, variant, target='FT'):
    yh = (D.Rh if target == 'FT' else D.R1h).values.astype(float)
    ya = (D.Ra if target == 'FT' else D.R1a).values.astype(float)
    eh = (D.eRh if target == 'FT' else D.eR1h).values
    ea = (D.eRa if target == 'FT' else D.eR1a).values
    rch, rca, ls, ts = feats(D)

    def unpack(th):
        sT, sD = np.exp(th[0]), np.exp(th[1])
        b0 = th[2]
        bc = th[3] if variant >= 1 else 0.0
        bo = th[4] if variant >= 1 else 0.0
        bls = th[5] if variant >= 2 else 0.0
        bts = th[6] if variant >= 2 else 0.0
        return sT, sD, b0, bc, bo, bls, bts

    def means(th):
        sT, sD, b0, bc, bo, bls, bts = unpack(th)
        mh = eh * np.exp(b0 + bc * rch + bo * rca + bls * ls + bts * ts)
        ma = ea * np.exp(b0 + bc * rca + bo * rch - bls * ls + bts * ts)
        return mh, ma

    def nll(th):
        sT, sD = np.exp(th[0]), np.exp(th[1])
        mh, ma = means(th)
        return -joint_ll(yh, ya, mh, ma, sT, sD).mean()
    return nll, unpack, means


if __name__ == '__main__':
    out = {}
    for target, taus in [('FT', [0, 15, 30, 45, 60, 75, 85]), ('HT', [0, 15, 30])]:
        for tau in taus:
            D = R[R.tau == tau].reset_index(drop=True)
            if target == 'FT' and tau == 85:
                pass
            fold = (D.mid % 2).values
            row = {}
            for variant in [0, 1, 2]:
                if tau == 0 and variant > 0:
                    continue
                th0 = np.array([np.log(0.1), np.log(0.2), 0.0, 0.0, 0.0, 0.0, 0.0])
                # 2-fold CV log score
                cv = []
                for f in (0, 1):
                    nll_tr, _, _ = make_nll(D[fold != f], variant, target)
                    nll_te, _, _ = make_nll(D[fold == f], variant, target)
                    r = minimize(nll_tr, th0, method='Nelder-Mead', options=dict(maxiter=4000, xatol=1e-4, fatol=1e-8))
                    cv.append(nll_te(r.x) * (fold == f).sum())
                nll_all, unpack, _ = make_nll(D, variant, target)
                r = minimize(nll_all, th0, method='Nelder-Mead', options=dict(maxiter=4000, xatol=1e-4, fatol=1e-8))
                row[variant] = dict(cv=sum(cv) / len(D), params=[float(v) for v in unpack(r.x)])
            out[f'{target}_{tau}'] = row
            print(target, tau, {v: (round(x['cv'], 5), np.round(x['params'], 3).tolist()) for v, x in row.items()}, flush=True)
    json.dump(out, open('/home/claude/data/inplay_corner_fit.json', 'w'), indent=1)
