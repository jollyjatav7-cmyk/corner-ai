"""Minute-by-minute match engine (vectorised over many matches) for goals and corners.
Mirrors what the web app computes."""
import numpy as np, json

MULT = json.load(open('/home/claude/data/inplay_mult.json'))
G = 11  # goals 0..10 per team


def slots(stop1=3, stop2=6):
    """list of (period, minute, time-bin key, phase)"""
    out = []
    for m in range(0, 45 + stop1):
        out.append((1, m, f'h1_{(m // 5) * 5:02d}' if m < 45 else 'h1_st', 0))
    for m in range(45, 90 + stop2):
        out.append((2, m, f'h2_{(m // 5) * 5:02d}' if m < 90 else 'h2_st', 1 if m < 70 else 2))
    return out


def state_mult(kind, gd_team, ph, mult=MULT):
    """multiplier array for goal-difference matrix gd_team (team perspective)"""
    m = mult[kind]
    g = np.clip(gd_team, -2, 2)
    out = np.ones_like(g, dtype=float)
    for v in (-2, -1, 1, 2):
        out = np.where(g == v, np.exp(m[f'gd{v:+d}_p{ph}']), out)
    return out


class Engine:
    def __init__(self, stop1=3, stop2=6, mult=MULT):
        self.S = slots(stop1, stop2)
        self.mult = mult
        i = np.arange(G)
        self.gd = i[:, None] - i[None, :]  # home goals - away goals
        self.tm_g = np.array([np.exp(mult['g'][f't_{s[2]}']) for s in self.S])
        self.tm_c = np.array([np.exp(mult['c'][f't_{s[2]}']) for s in self.S])
        self.smh_g = {ph: state_mult('g', self.gd, ph, mult) for ph in (0, 1, 2)}
        self.sma_g = {ph: state_mult('g', -self.gd, ph, mult) for ph in (0, 1, 2)}
        self.smh_c = {ph: state_mult('c', self.gd, ph, mult) for ph in (0, 1, 2)}
        self.sma_c = {ph: state_mult('c', -self.gd, ph, mult) for ph in (0, 1, 2)}
        self.red = {k: (np.exp(mult[k]['own_red']), np.exp(mult[k]['opp_red'])) for k in ('g', 'c')}

    def run(self, bh, ba, start=0, P0=None, reds=(0, 0), ch=None, ca=None, upto=None):
        """bh, ba: base goal rates per minute (n,). start: slot index to start from.
        P0: (n,G,G) initial score distribution. ch, ca: base corner rates per minute (n,) (optional).
        Returns final score distribution, expected corners (home, away) accumulated from start to end
        (and separately within first half if start in first half)."""
        n = len(bh)
        if P0 is None:
            P0 = np.zeros((n, G, G)); P0[:, 0, 0] = 1
        P = P0.copy()
        rh, ra = reds
        rh = np.broadcast_to(np.asarray(rh), (n,)); ra = np.broadcast_to(np.asarray(ra), (n,))
        redg_h = np.where(rh > 0, self.red['g'][0], 1) * np.where(ra > 0, self.red['g'][1], 1)
        redg_a = np.where(ra > 0, self.red['g'][0], 1) * np.where(rh > 0, self.red['g'][1], 1)
        redc_h = np.where(rh > 0, self.red['c'][0], 1) * np.where(ra > 0, self.red['c'][1], 1)
        redc_a = np.where(ra > 0, self.red['c'][0], 1) * np.where(rh > 0, self.red['c'][1], 1)
        EC_h = np.zeros(n); EC_a = np.zeros(n); EC1_h = np.zeros(n); EC1_a = np.zeros(n)
        HT = None
        end = len(self.S) if upto is None else upto
        for k in range(start, end):
            per, mi, tb, ph = self.S[k]
            if per == 2 and HT is None:
                HT = P.copy()
            if ch is not None:
                eh = ch * redc_h * self.tm_c[k] * (P * self.smh_c[ph][None]).sum((1, 2))
                ea = ca * redc_a * self.tm_c[k] * (P * self.sma_c[ph][None]).sum((1, 2))
                EC_h += eh; EC_a += ea
                if per == 1:
                    EC1_h += eh; EC1_a += ea
            lam_h = (bh * redg_h * self.tm_g[k])[:, None, None] * self.smh_g[ph][None]
            lam_a = (ba * redg_a * self.tm_g[k])[:, None, None] * self.sma_g[ph][None]
            ph_ = 1 - np.exp(-lam_h); pa_ = 1 - np.exp(-lam_a)
            Q = P * (1 - ph_) * (1 - pa_)
            Hs = P * ph_ * (1 - pa_)
            As = P * pa_ * (1 - ph_)
            Bs = P * ph_ * pa_
            Q[:, 1:, :] += Hs[:, :-1, :]
            Q[:, :, 1:] += As[:, :, :-1]
            Q[:, 1:, 1:] += Bs[:, :-1, :-1]
            # mass that would exceed G-1 goals is kept in the last cell
            Q[:, -1, :] += Hs[:, -1, :]
            Q[:, :, -1] += As[:, :, -1]
            Q[:, -1, -1] += Bs[:, -1, -1]
            P = Q
        if HT is None:
            HT = P.copy()
        return dict(P=P, HT=HT, EC_h=EC_h, EC_a=EC_a, EC1_h=EC1_h, EC1_a=EC1_a)

    def calibrate_goals(self, lh, la, iters=12):
        """base per-minute goal rates so that expected FT goals equal the targets."""
        lh = np.asarray(lh, float); la = np.asarray(la, float)
        bh = lh / 95.0; ba = la / 95.0
        i = np.arange(G)
        for _ in range(iters):
            r = self.run(bh, ba)
            Eh = (r['P'].sum(2) * i).sum(1); Ea = (r['P'].sum(1) * i).sum(1)
            bh = bh * lh / Eh; ba = ba * la / Ea
        return bh, ba

    def calibrate_corners(self, bh, ba, mh, ma):
        r = self.run(bh, ba, ch=np.ones(len(bh)), ca=np.ones(len(bh)))
        return mh / r['EC_h'], ma / r['EC_a'], r
