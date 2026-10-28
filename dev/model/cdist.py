"""Fast joint pmf for (home count, away count) under the tempo/dominance lognormal-Poisson mixture."""
import numpy as np
from scipy.special import gammaln

M = 26  # counts 0..25


def pois_mat(lam, m=M):
    k = np.arange(m)
    lam = np.asarray(lam, float)[:, None]
    return np.exp(k * np.log(lam) - lam - gammaln(k + 1))


def joint(mh, ma, sT, sD, nq=10, m=M):
    xq, wq = np.polynomial.hermite_e.hermegauss(nq)
    wq = wq / wq.sum()
    mh = np.asarray(mh, float); ma = np.asarray(ma, float)
    J = np.zeros((len(mh), m, m))
    c = np.exp(sD ** 2 / 2)
    for xt, wt in zip(xq, wq):
        T = np.exp(sT * xt - sT ** 2 / 2)
        for xd, wd in zip(xq, wq):
            Dd = np.exp(sD * xd)
            ph = pois_mat(mh * T * Dd / c, m)
            pa = pois_mat(ma * T / Dd / c, m)
            J += (wt * wd) * ph[:, :, None] * pa[:, None, :]
    return J


def tot_dif(J):
    n, m, _ = J.shape
    i = np.arange(m)
    tot_idx = (i[:, None] + i[None, :]).ravel()
    dif_idx = (i[:, None] - i[None, :]).ravel() + (m - 1)
    Jf = J.reshape(n, -1)
    PT = np.zeros((n, 2 * m - 1)); PD = np.zeros((n, 2 * m - 1))
    for k in range(2 * m - 1):
        PT[:, k] = Jf[:, tot_idx == k].sum(1)
        PD[:, k] = Jf[:, dif_idx == k].sum(1)
    return PT, PD  # PD index k corresponds to diff k-(m-1)
