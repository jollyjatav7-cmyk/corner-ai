"""Load open-matchday 2026/27 results and map them onto the football-data (xgabora) team names."""
import pandas as pd, numpy as np, difflib, re, unicodedata, glob, json

OM = '/home/claude/data/oladeeayo_open-matchday/data'
FOLDER = {'E0': 'ENG_1_premier-league', 'E1': 'ENG_2_championship', 'E2': 'ENG_3_league-one', 'E3': 'ENG_4_league-two',
          'EC': 'ENG_5_national-league', 'SC0': 'SCO_1_premiership', 'SC1': 'SCO_2_championship',
          'SC2': 'SCO_3_league-one', 'SC3': 'SCO_4_league-two', 'D1': 'GER_1_bundesliga', 'D2': 'GER_2_2-bundesliga',
          'I1': 'ITA_1_serie-a', 'I2': 'ITA_2_serie-b', 'SP1': 'ESP_1_la-liga', 'SP2': 'ESP_2_segunda-division',
          'F1': 'FRA_1_ligue-1', 'F2': 'FRA_2_ligue-2', 'N1': 'NED_1_eredivisie', 'B1': 'BEL_1_pro-league',
          'P1': 'POR_1_primeira-liga', 'T1': 'TUR_1_super-lig', 'G1': 'GRE_1_super-league'}
COLS = {'ft_home': 'FTHome', 'ft_away': 'FTAway', 'ht_home': 'HTHome', 'ht_away': 'HTAway',
        'home_shots': 'HomeShots', 'away_shots': 'AwayShots', 'home_target': 'HomeTarget', 'away_target': 'AwayTarget',
        'home_corners': 'HomeCorners', 'away_corners': 'AwayCorners', 'home_red': 'HomeRed', 'away_red': 'AwayRed',
        'home_corners_1h': 'HC1', 'away_corners_1h': 'AC1', 'home_yellow': 'HomeYellow', 'away_yellow': 'AwayYellow',
        'home_fouls': 'HomeFouls', 'away_fouls': 'AwayFouls'}


def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[^a-z0-9' ]", ' ', s)
    s = re.sub(r'\b(fc|cf|afc|ac|sc|sv|vfl|vfb|tsg|fsv|rcd|cd|ud|sd|as|ss|ssc|us|club|de|1)\b', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def load_om(xg):
    """xg: xgabora matches DataFrame (with season col). Returns (om rows in xgabora schema, mapping dict)."""
    out = []
    mapping = {}
    for div, folder in FOLDER.items():
        f = f'{OM}/{folder}/results_2627.csv'
        d = pd.read_csv(f)
        d['date'] = pd.to_datetime(d.date)
        x = xg[(xg.Division == div) & (xg.season == 2026)]
        known = sorted(set(x.HomeTeam) | set(x.AwayTeam))
        m = {}
        # 1) overlap matching on date (+-1 day) and full-time score (+corners when present)
        votes = {}
        for _, r in d.iterrows():
            c = x[(abs((x.MatchDate - r.date).dt.days) <= 1) & (x.FTHome == r.ft_home) & (x.FTAway == r.ft_away)]
            if len(c) > 1 and pd.notna(r.home_corners):
                c = c[(c.HomeCorners == r.home_corners) & (c.AwayCorners == r.away_corners)]
            if len(c) > 1:
                # disambiguate by name similarity
                sc = [difflib.SequenceMatcher(None, norm(r.home), norm(h)).ratio() +
                      difflib.SequenceMatcher(None, norm(r.away), norm(a)).ratio() for h, a in zip(c.HomeTeam, c.AwayTeam)]
                c = c.iloc[[int(np.argmax(sc))]]
            if len(c) == 1:
                for a, b in [(r.home, c.HomeTeam.iloc[0]), (r.away, c.AwayTeam.iloc[0])]:
                    votes.setdefault(a, {}).setdefault(b, 0)
                    votes[a][b] += 1
        for a, vb in votes.items():
            b = max(vb, key=vb.get)
            if vb[b] >= 2 or (vb[b] >= 1 and difflib.SequenceMatcher(None, norm(a), norm(b)).ratio() > 0.5):
                m[a] = b
        # 2) fuzzy fallback for teams not resolved
        om_teams = sorted(set(d.home) | set(d.away))
        for t in om_teams:
            if t in m:
                continue
            best = max(known, key=lambda k: difflib.SequenceMatcher(None, norm(t), norm(k)).ratio()) if known else None
            if best is not None and difflib.SequenceMatcher(None, norm(t), norm(best)).ratio() >= 0.6:
                m[t] = best
        unresolved = [t for t in om_teams if t not in m]
        if unresolved:
            print(div, 'UNRESOLVED', unresolved)
        # collisions
        inv = {}
        for a, b in m.items():
            inv.setdefault(b, []).append(a)
        for b, a in inv.items():
            if len(a) > 1:
                print(div, 'COLLISION', b, a)
        mapping[div] = m
        o = d.rename(columns=COLS)
        o['Division'] = div
        o['MatchDate'] = o.date
        o['HomeTeam'] = o.home.map(m)
        o['AwayTeam'] = o.away.map(m)
        o = o[o.HomeTeam.notna() & o.AwayTeam.notna()]
        o['season'] = 2026
        o['FTResult'] = o.ft_result
        out.append(o[['Division', 'MatchDate', 'HomeTeam', 'AwayTeam', 'season', 'FTResult'] + list(COLS.values())])
    return pd.concat(out, ignore_index=True), mapping


if __name__ == '__main__':
    import sys
    sys.path.insert(0, '/home/claude/scripts')
    from common import load_matches
    xg = load_matches()
    om, mp = load_om(xg)
    print(om.shape)
    json.dump(mp, open('/home/claude/data/om_name_map.json', 'w'), indent=1, ensure_ascii=False)
    for div, m in mp.items():
        diff = {a: b for a, b in m.items() if a != b}
        print(div, len(m), diff)
    # consistency check on overlap: corners equal?
    j = om.merge(xg[xg.season == 2026], on=['Division', 'HomeTeam', 'AwayTeam'], suffixes=('', '_x'))
    j = j[abs((j.MatchDate - j.MatchDate_x).dt.days) <= 1]
    print('overlap rows', len(j), ' FT score agree', ((j.FTHome == j.FTHome_x) & (j.FTAway == j.FTAway_x)).mean(),
          ' corners agree', ((j.HomeCorners == j.HomeCorners_x) & (j.AwayCorners == j.AwayCorners_x))[j.HomeCorners.notna() & j.HomeCorners_x.notna()].mean(),
          ' shots agree', ((j.HomeShots == j.HomeShots_x))[j.HomeShots.notna() & j.HomeShots_x.notna()].mean())
    om.to_pickle('/home/claude/data/om_2627.pkl')
