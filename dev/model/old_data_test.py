"""Does old match data still help, when teams change from season to season?

Part 1  Team corner ratings with different memories, scored on the 2022/23-2025/26 seasons (out of sample):
        the app's setting, reset every season, forget faster/slower, last-N-matches averages, ratings frozen in 2019.
Part 2  The rules that turn ratings + odds into expected corners (Poisson GLM), fitted on an old era
        (2008-2013) vs a recent era (2016-2021), scored on the same 2022-2026 test seasons.
"""
import sys, math, json
sys.path.insert(0, '/home/claude/scripts')
import numpy as np, pandas as pd
from collections import defaultdict, deque
from scipy.special import gammaln
from common import load_matches
from ratings import CountRatings
from sklearn.linear_model import PoissonRegressor

df = load_matches()
LEAGUES = ['E0', 'E1', 'E2', 'E3', 'SC0', 'SC1', 'SC2', 'SC3', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2', 'N1', 'B1', 'P1', 'T1', 'G1']
df = df[df.Division.isin(LEAGUES)].reset_index(drop=True)
has = (df.HomeCorners.notna() & df.AwayCorners.notna()).values
test = has & (df.season.values >= 2022) & (df.season.values <= 2025)
yh, ya = df.HomeCorners.values, df.AwayCorners.values
print('matches', len(df), 'with corners', has.sum(), 'test', test.sum(), 'seasons', df.season.min(), '-', df.season.max())


def replay(k=0.025, shrink=0.85, freeze=None):
    R = CountRatings(k_att=k, k_def=k, k_base=0.002, shrink=shrink, cap=1.5)
    mu = np.full((len(df), 2), np.nan)
    div, sea, H, A, D = df.Division.values, df.season.values, df.HomeTeam.values, df.AwayTeam.values, df.MatchDate.values
    fz = np.datetime64(freeze) if freeze else None
    for i in range(len(df)):
        bh, ba, ah, dh, aa, da = R.predict(div[i], sea[i], H[i], A[i])
        mu[i] = [math.exp(bh + ah + da), math.exp(ba + aa + dh)]
        if has[i]:
            if fz is not None and D[i] > fz:
                # keep the league average moving, but stop learning about teams
                b = R.base[div[i]]
                eh = max(min((yh[i] - mu[i, 0]) / mu[i, 0], 1.5), -1.5); ea = max(min((ya[i] - mu[i, 1]) / mu[i, 1], 1.5), -1.5)
                b[0] += 0.002 * eh; b[1] += 0.002 * ea
            else:
                R.update(div[i], H[i], A[i], yh[i], ya[i])
    return mu


def last_n(n):
    """Team form: corners won / conceded per match over the last n matches (any season), scaled by the league average."""
    hist = defaultdict(lambda: deque(maxlen=n))
    lg = defaultdict(lambda: [0.0, 0.0, 0])   # running league sums (home corners, away corners, matches) over the last ~2 seasons
    lgq = defaultdict(deque)
    mu = np.full((len(df), 2), np.nan)
    div, H, A = df.Division.values, df.HomeTeam.values, df.AwayTeam.values
    for i in range(len(df)):
        L = lg[div[i]]
        mh_l = L[0] / L[2] if L[2] > 50 else 5.3
        ma_l = L[1] / L[2] if L[2] > 50 else 4.5
        avg = (mh_l + ma_l) / 2
        def rate(t):
            q = hist[t]
            if len(q) < 3: return 1.0, 1.0
            f = sum(x[0] for x in q) / len(q) / avg; c = sum(x[1] for x in q) / len(q) / avg
            return f, c
        fh, ch = rate(H[i]); fa, ca = rate(A[i])
        mu[i] = [mh_l * fh * ca, ma_l * fa * ch]
        if has[i]:
            hist[H[i]].append((yh[i], ya[i])); hist[A[i]].append((ya[i], yh[i]))
            L[0] += yh[i]; L[1] += ya[i]; L[2] += 1; lgq[div[i]].append((yh[i], ya[i]))
            if len(lgq[div[i]]) > 900:
                o = lgq[div[i]].popleft(); L[0] -= o[0]; L[1] -= o[1]; L[2] -= 1
    return mu


def score(mu):
    m = test & np.isfinite(mu).all(1)
    h, a = mu[m, 0], mu[m, 1]
    y1, y2 = yh[m], ya[m]
    ll = np.mean(y1 * np.log(h) - h - gammaln(y1 + 1) + y2 * np.log(a) - a - gammaln(y2 + 1)) / 2
    ct = np.corrcoef(h + a, y1 + y2)[0, 1]
    cd = np.corrcoef(h - a, y1 - y2)[0, 1]
    return ll, ct, cd


rows = []
base = score(replay(k=0.0, shrink=0.85))                       # league averages only (no team information)
cur = score(replay())
for name, mu in [('联赛平均（不看球队）', None), ('app 现在的做法', None),
                 ('每个赛季从零开始（只用本赛季）', replay(shrink=0.0)),
                 ('换季不打折', replay(shrink=1.0)),
                 ('忘得慢一倍', replay(k=0.0125)),
                 ('忘得快一倍', replay(k=0.05)),
                 ('忘得快四倍', replay(k=0.10)),
                 ('只看最近 6 场场均', last_n(6)),
                 ('只看最近 10 场场均', last_n(10)),
                 ('只看最近 20 场场均', last_n(20)),
                 ('球队评分停在 2019 年夏天', replay(freeze='2019-07-01'))]:
    s = base if name.startswith('联赛平均') else cur if name.startswith('app') else score(mu)
    rows.append(dict(setting=name, loglik=s[0], gain_vs_app=(s[0] - base[0]) / (cur[0] - base[0]), corr_total=s[1], corr_diff=s[2]))
R1 = pd.DataFrame(rows)
pd.set_option('display.width', 200)
print(R1.round(4).to_string(index=False))

# half-life of the app's memory, in matches of the same team
k = 0.025
print('half-life in matches (app):', round(math.log(0.5) / math.log(1 - k), 1), ' weight left after one season (38 matches) incl. 0.85 season shrink:',
      round((1 - k) ** 38 * 0.85, 3))

# ---------------- Part 2: rules fitted on an old vs a recent era ----------------
X = pd.read_pickle('/home/claude/data/features.pkl')
X = X[X.Division.isin(LEAGUES)]
from prematch_models import side_rows, C_MKT, C_NOM  # noqa: E402  (same feature construction as the app's fit)
S = side_rows(X, 'c')
ok = S.y.notna() & np.isfinite(S.lam_t)
te = ok & (S.season >= 2022) & (S.season <= 2025)


def fit_eval(lo, hi, cols):
    tr = ok & (S.season >= lo) & (S.season <= hi)
    m = PoissonRegressor(alpha=1e-6, max_iter=1000).fit(S.loc[tr, cols], S.loc[tr, 'y'])
    mu = m.predict(S.loc[te, cols]); y = S.loc[te, 'y'].values
    return np.mean(y * np.log(mu) - mu - gammaln(y + 1)), dict(zip(cols, np.round(m.coef_, 3))), tr.sum()


res2 = {}
for nm, (lo, hi) in {'2008-2013 老数据': (2008, 2013), '2016-2021 近期数据': (2016, 2021), '2008-2021 全部（app 用的）': (2008, 2021)}.items():
    ll, coef, n = fit_eval(lo, hi, C_MKT)
    res2[nm] = (ll, n)
    print(nm, 'rows', n, 'test loglik', round(ll, 5), 'lam_t', coef['lam_t'], 'lam_o', coef['lam_o'], 'c_att', coef['c_att'], 'c_dfn', coef['c_dfn'])
json.dump({'part1': R1.to_dict('records'), 'part2': {k: v[0] for k, v in res2.items()}}, open('/home/claude/cmp/old_data_test.json', 'w'), ensure_ascii=False, indent=1)
