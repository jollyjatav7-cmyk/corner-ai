"""Join event-level matches (Wyscout + StatsBomb) to football-data rows (odds, FT stats, pre-match features)."""
import json, re, difflib, unicodedata
import numpy as np, pandas as pd

X = pd.read_pickle('/home/claude/data/features.pkl')
DIV = {'Premier League': 'E0', 'La Liga': 'SP1', 'Serie A': 'I1', 'Ligue 1': 'F1', '1. Bundesliga': 'D1'}

ALIAS = {
    'manchester united': 'man united', 'manchester city': 'man city', 'tottenham hotspur': 'tottenham',
    'wolverhampton wanderers': 'wolves', 'brighton & hove albion': 'brighton', 'brighton and hove albion': 'brighton',
    'afc bournemouth': 'bournemouth', 'west bromwich albion': 'west brom', 'newcastle united': 'newcastle',
    'huddersfield town': 'huddersfield', 'stoke city': 'stoke', 'swansea city': 'swansea', 'leicester city': 'leicester',
    'west ham united': 'west ham', 'cardiff city': 'cardiff', 'norwich city': 'norwich', 'hull city': 'hull',
    'atletico madrid': 'ath madrid', 'atlético madrid': 'ath madrid', 'athletic club': 'ath bilbao',
    'athletic bilbao': 'ath bilbao', 'real betis': 'betis', 'rc celta de vigo': 'celta', 'celta vigo': 'celta',
    'deportivo la coruna': 'la coruna', 'deportivo alavés': 'alaves', 'deportivo alaves': 'alaves',
    'real sociedad': 'sociedad', 'rayo vallecano': 'vallecano', 'sporting gijón': 'sp gijon', 'sporting gijon': 'sp gijon',
    'espanyol': 'espanol', 'rcd espanyol': 'espanol', 'las palmas': 'las palmas', 'ud las palmas': 'las palmas',
    'internazionale': 'inter', 'inter milan': 'inter', 'ac milan': 'milan', 'as roma': 'roma', 'ss lazio': 'lazio',
    'chievo verona': 'chievo', 'hellas verona': 'verona', 'paris saint-germain': 'paris sg', 'paris saint germain': 'paris sg',
    'olympique lyonnais': 'lyon', 'olympique marseille': 'marseille', 'olympique de marseille': 'marseille',
    'as monaco': 'monaco', 'as saint-étienne': 'st etienne', 'saint-étienne': 'st etienne', 'as saint-etienne': 'st etienne',
    'saint-etienne': 'st etienne', 'stade rennais': 'rennes', 'girondins de bordeaux': 'bordeaux', 'bordeaux': 'bordeaux',
    'losc lille': 'lille', 'ogc nice': 'nice', 'montpellier hsc': 'montpellier', 'fc nantes': 'nantes', 'sm caen': 'caen',
    'ea guingamp': 'guingamp', 'stade de reims': 'reims', 'gfc ajaccio': 'ajaccio gfco', 'ac ajaccio': 'ajaccio',
    'es troyes ac': 'troyes', 'toulouse fc': 'toulouse', 'angers sco': 'angers', 'fc lorient': 'lorient',
    'bayern munich': 'bayern munich', 'bayern münchen': 'bayern munich', 'fc bayern münchen': 'bayern munich',
    'borussia dortmund': 'dortmund', "borussia m'gladbach": "m'gladbach", 'borussia mönchengladbach': "m'gladbach",
    'borussia monchengladbach': "m'gladbach", 'bayer leverkusen': 'leverkusen', 'bayer 04 leverkusen': 'leverkusen',
    'eintracht frankfurt': 'ein frankfurt', '1. fc köln': 'fc koln', 'fc köln': 'fc koln', '1. fc koln': 'fc koln',
    'hertha bsc': 'hertha', 'hertha berlin': 'hertha', 'vfb stuttgart': 'stuttgart', 'vfl wolfsburg': 'wolfsburg',
    'fc schalke 04': 'schalke 04', 'schalke 04': 'schalke 04', 'werder bremen': 'werder bremen', 'sv werder bremen': 'werder bremen',
    'tsg 1899 hoffenheim': 'hoffenheim', '1899 hoffenheim': 'hoffenheim', 'hamburger sv': 'hamburg', 'fc augsburg': 'augsburg',
    '1. fsv mainz 05': 'mainz', 'fsv mainz 05': 'mainz', 'mainz 05': 'mainz', 'sc freiburg': 'freiburg', 'hannover 96': 'hannover',
    'rb leipzig': 'rb leipzig', 'union berlin': 'union berlin', '1. fc union berlin': 'union berlin', 'fc ingolstadt 04': 'ingolstadt',
    'darmstadt 98': 'darmstadt', 'sv darmstadt 98': 'darmstadt', 'vfl bochum': 'bochum', 'vfl bochum 1848': 'bochum',
    '1. fc heidenheim': 'heidenheim', '1. fc heidenheim 1846': 'heidenheim', 'fc heidenheim': 'heidenheim',
}


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower().strip()
    s0 = s
    s = ALIAS.get(s, ALIAS.get(s0, s))
    s = re.sub(r'\b(fc|cf|afc|ac|as|sc|ssc|calcio|club|de|cd|ud|rcd|real club)\b', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def load_events():
    recs = []
    for src, fn in [('wy', '/home/claude/data/wy_compact.jsonl'), ('sb', '/home/claude/data/sb_compact.jsonl')]:
        for line in open(fn):
            r = json.loads(line)
            r['src'] = src
            recs.append(r)
    return recs


def join(recs):
    out = []
    Xd = {k: g for k, g in X.groupby('Division')}
    for r in recs:
        div = DIV.get(r['comp'])
        r['fd_idx'] = None
        if div is None:
            out.append(r); continue
        d = pd.Timestamp(r['date'])
        g = Xd[div]
        cand = g[(g.MatchDate >= d - pd.Timedelta(days=1)) & (g.MatchDate <= d + pd.Timedelta(days=1))]
        best, bs = None, 0
        for idx, row in cand.iterrows():
            s = sim(r['home'], row.HomeTeam) + sim(r['away'], row.AwayTeam)
            if s > bs:
                bs, best = s, idx
        if best is not None and bs > 1.0:
            row = X.loc[best]
            if int(row.FTHome) == r['hs'] and int(row.FTAway) == r['as_']:
                r['fd_idx'] = int(best)
        out.append(r)
    return out


if __name__ == '__main__':
    recs = join(load_events())
    n = sum(1 for r in recs if r['fd_idx'] is not None)
    by = pd.Series([(r['src'], r['comp'], r['fd_idx'] is not None) for r in recs]).value_counts()
    print(n, len(recs)); print(by.to_string())
    json.dump(recs, open('/home/claude/data/events_joined.json', 'w'))
