"""Build the pre-match feature table (no look-ahead) for every match."""
import numpy as np, pandas as pd
from common import load_matches
from ratings import run_ratings

PARAMS = {
    'c': ('HomeCorners', 'AwayCorners', dict(k_att=0.025, k_def=0.025, k_base=0.002, shrink=0.85)),
    's': ('HomeShots', 'AwayShots', dict(k_att=0.05, k_def=0.07, k_base=0.002, shrink=0.95)),
    't': ('HomeTarget', 'AwayTarget', dict(k_att=0.03, k_def=0.03, k_base=0.002, shrink=0.85)),
    'g': ('FTHome', 'FTAway', dict(k_att=0.04, k_def=0.04, k_base=0.002, shrink=0.85)),
}


def build(df=None, return_models=False):
    if df is None:
        df = load_matches()
    feats = {}
    models = {}
    for key, (ch, ca, kw) in PARAMS.items():
        out, R = run_ratings(df, ch, ca, **kw)
        models[key] = R
        for j, nm in enumerate(['bh', 'ba', 'att_h', 'dfn_h', 'att_a', 'dfn_a']):
            feats[f'{key}_{nm}'] = out[:, j]
    F = pd.DataFrame(feats, index=df.index)
    # count of prior matches with corner data for each team (experience) -- for shrinkage diagnostics
    n_prior = {}
    nh = np.zeros(len(df)); na = np.zeros(len(df))
    hasc = (df.HomeCorners.notna() & df.AwayCorners.notna()).values
    for i, (h, a) in enumerate(zip(df.HomeTeam.values, df.AwayTeam.values)):
        nh[i] = n_prior.get(h, 0); na[i] = n_prior.get(a, 0)
        if hasc[i]:
            n_prior[h] = n_prior.get(h, 0) + 1
            n_prior[a] = n_prior.get(a, 0) + 1
    F['n_h'] = nh; F['n_a'] = na
    out = pd.concat([df, F], axis=1)
    if return_models:
        return out, models
    return out


if __name__ == '__main__':
    import time
    t = time.time()
    X = build()
    m = pd.read_pickle('/home/claude/data/m_odds.pkl')[['lh', 'la', 'pH', 'pD', 'pA', 'pO']]
    X = X.join(m)
    X.to_pickle('/home/claude/data/features.pkl')
    print(X.shape, time.time() - t)
