"""Online (no look-ahead) team ratings for count statistics using a score-driven (GAS) Poisson update.

For a metric with home count y_h and away count y_a in league L:
    log mu_h = base_h[L] + att[h] + dfn[a]
    log mu_a = base_a[L] + att[a] + dfn[h]
After the match:
    e = (y - mu) / mu   (score scaled by inverse Fisher information)
    att[team] += k_att * e_for ;  dfn[opp] += k_def * e_for
    base[L]   += k_base * e
At each new season every team's ratings are shrunk by `shrink`.
A team first seen in a division starts from the division's running average rating for newcomers.

The features stored for each match are the PRE-match values, so they can be used for honest backtests.
"""
import numpy as np
from collections import defaultdict

TIER = {'E0': 1, 'E1': 2, 'E2': 3, 'E3': 4, 'EC': 5, 'SC0': 1, 'SC1': 2, 'SC2': 3, 'SC3': 4,
        'D1': 1, 'D2': 2, 'I1': 1, 'I2': 2, 'SP1': 1, 'SP2': 2, 'F1': 1, 'F2': 2,
        'N1': 1, 'B1': 1, 'P1': 1, 'T1': 1, 'G1': 1}


class CountRatings:
    def __init__(self, k_att=0.05, k_def=0.05, k_base=0.003, shrink=0.75, cap=1.5, init_base=None):
        self.k_att, self.k_def, self.k_base, self.shrink, self.cap = k_att, k_def, k_base, shrink, cap
        self.att = {}
        self.dfn = {}
        self.team_div = {}
        self.team_season = {}
        self.base = {}
        self.init_base = init_base or {}
        # running mean of ratings of newcomers by (division, direction)
        self.new_att = defaultdict(lambda: [0.0, 0])
        self.new_dfn = defaultdict(lambda: [0.0, 0])
        self.pending_new = {}  # team -> (key, matches_seen)

    def _ensure(self, team, div, season):
        if team not in self.att:
            key = (div, 'first')
            self._init_team(team, key)
        elif self.team_div.get(team) != div:
            prev = self.team_div.get(team)
            d = 'up' if TIER.get(prev, 9) > TIER.get(div, 9) else 'down'
            if prev is not None and prev[:1] != div[:1] and prev not in ('EC',) and div not in ('EC',):
                d = 'cross'
            key = (div, d)
            self._init_team(team, key)
        if self.team_season.get(team) != season:
            if team in self.team_season:
                self.att[team] *= self.shrink
                self.dfn[team] *= self.shrink
            self.team_season[team] = season
        self.team_div[team] = div

    def _init_team(self, team, key):
        a = self.new_att[key]; d = self.new_dfn[key]
        self.att[team] = a[0] / a[1] if a[1] > 5 else 0.0
        self.dfn[team] = d[0] / d[1] if d[1] > 5 else 0.0
        self.pending_new[team] = [key, 0]

    def predict(self, div, season, h, a):
        self._ensure(h, div, season)
        self._ensure(a, div, season)
        if div not in self.base:
            self.base[div] = list(self.init_base.get(div, (np.log(5.3), np.log(4.5))))
        bh, ba = self.base[div]
        return (bh, ba, self.att[h], self.dfn[h], self.att[a], self.dfn[a])

    def update(self, div, h, a, yh, ya):
        bh, ba = self.base[div]
        mh = np.exp(bh + self.att[h] + self.dfn[a])
        ma = np.exp(ba + self.att[a] + self.dfn[h])
        eh = (yh - mh) / mh
        ea = (ya - ma) / ma
        eh = max(min(eh, self.cap), -self.cap)
        ea = max(min(ea, self.cap), -self.cap)
        self.att[h] += self.k_att * eh
        self.dfn[a] += self.k_def * eh
        self.att[a] += self.k_att * ea
        self.dfn[h] += self.k_def * ea
        self.base[div][0] += self.k_base * eh
        self.base[div][1] += self.k_base * ea
        for t in (h, a):
            pn = self.pending_new.get(t)
            if pn is not None:
                pn[1] += 1
                if pn[1] == 15:  # record the rating newcomers settle at after 15 games
                    key = pn[0]
                    self.new_att[key][0] += self.att[t]; self.new_att[key][1] += 1
                    self.new_dfn[key][0] += self.dfn[t]; self.new_dfn[key][1] += 1
                    del self.pending_new[t]


def run_ratings(df, col_h, col_a, **kw):
    """df sorted by date. Returns array (n,6) of pre-match [base_h, base_a, att_h, dfn_h, att_a, dfn_a]
    (NaN where the metric is missing for that match is still predicted; update skipped)."""
    R = CountRatings(**kw)
    out = np.zeros((len(df), 6))
    div = df.Division.values; season = df.season.values
    H = df.HomeTeam.values; A = df.AwayTeam.values
    yh = df[col_h].values; ya = df[col_a].values
    for i in range(len(df)):
        out[i] = R.predict(div[i], season[i], H[i], A[i])
        if not (np.isnan(yh[i]) or np.isnan(ya[i])):
            R.update(div[i], H[i], A[i], yh[i], ya[i])
    return out, R
