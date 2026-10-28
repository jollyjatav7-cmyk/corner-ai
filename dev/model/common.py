import numpy as np, pandas as pd
from scipy.stats import poisson
from scipy.spatial import cKDTree

MATCHES = '/home/claude/xgabora/club-football-match-data-2000-2025/data/Matches.csv'


def load_matches():
    df = pd.read_csv(MATCHES, low_memory=False)
    df['MatchDate'] = pd.to_datetime(df['MatchDate'])
    df['season'] = np.where(df.MatchDate.dt.month >= 7, df.MatchDate.dt.year, df.MatchDate.dt.year - 1)
    df = df.sort_values(['MatchDate', 'Division', 'HomeTeam']).reset_index(drop=True)
    return df


def devig_power(odds):
    """odds: (n,k) decimal odds -> fair probs using the power method (solves sum p_i^(1/k)... )
    p_i = (1/o_i)^c with c chosen so sum=1."""
    inv = 1.0 / np.asarray(odds, float)
    lo = np.full(inv.shape[0], 0.5)
    hi = np.full(inv.shape[0], 3.0)
    for _ in range(60):
        mid = (lo + hi) / 2
        s = (inv ** mid[:, None]).sum(1)
        hi = np.where(s < 1, mid, hi)
        lo = np.where(s >= 1, mid, lo)
    c = (lo + hi) / 2
    p = inv ** c[:, None]
    return p / p.sum(1, keepdims=True)


def devig_prop(odds):
    inv = 1.0 / np.asarray(odds, float)
    return inv / inv.sum(1, keepdims=True)


def dc_matrix(lh, la, rho=-0.06, maxg=12):
    """Dixon-Coles adjusted joint pmf of (home goals, away goals)."""
    i = np.arange(maxg + 1)
    ph = poisson.pmf(i, lh)
    pa = poisson.pmf(i, la)
    m = np.outer(ph, pa)
    m[0, 0] *= 1 - lh * la * rho
    m[0, 1] *= 1 + lh * rho
    m[1, 0] *= 1 + la * rho
    m[1, 1] *= 1 - rho
    return m / m.sum()


class OddsToLambda:
    """Map market probabilities (pH, pA, pOver2.5) -> (lambda_home, lambda_away) by nearest neighbour on a
    fine grid of a Dixon-Coles model."""

    def __init__(self, rho=-0.06, step=0.01, lo=0.05, hi=5.0):
        g = np.arange(lo, hi + 1e-9, step)
        LH, LA = np.meshgrid(g, g, indexing='ij')
        LH = LH.ravel(); LA = LA.ravel()
        maxg = 15
        i = np.arange(maxg + 1)
        from scipy.special import gammaln
        logf = gammaln(i + 1)
        PH = np.exp(-LH[:, None] + np.log(LH)[:, None] * i - logf)  # (n,16)
        PA = np.exp(-LA[:, None] + np.log(LA)[:, None] * i - logf)
        # joint via outer products in chunks
        pH = np.zeros(len(LH)); pD = np.zeros(len(LH)); pO = np.zeros(len(LH))
        tri_h = np.tril(np.ones((maxg + 1, maxg + 1)), -1)  # home > away  (row>col)
        tot = i[:, None] + i[None, :]
        over = (tot > 2.5).astype(float)
        C = 20000
        for s in range(0, len(LH), C):
            M = PH[s:s + C, :, None] * PA[s:s + C, None, :]
            lh = LH[s:s + C]; la = LA[s:s + C]
            M[:, 0, 0] *= 1 - lh * la * rho
            M[:, 0, 1] *= 1 + lh * rho
            M[:, 1, 0] *= 1 + la * rho
            M[:, 1, 1] *= 1 - rho
            M /= M.sum((1, 2), keepdims=True)
            pH[s:s + C] = (M * tri_h).sum((1, 2))
            pD[s:s + C] = np.trace(M, axis1=1, axis2=2)
            pO[s:s + C] = (M * over).sum((1, 2))
        self.LH, self.LA = LH, LA
        self.feat = np.c_[pH, 1 - pH - pD, pO]
        self.tree = cKDTree(self.feat)

    def __call__(self, pH, pA, pO=None, wO=1.0):
        if pO is None:
            # without O/U info: use only 1X2 -> under-determined; use typical total from fit later
            raise ValueError('need pO')
        q = np.c_[pH, pA, np.asarray(pO) * wO]
        _, idx = self.tree.query(q)
        return self.LH[idx], self.LA[idx]
