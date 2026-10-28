"""Reduce the public Wyscout (Pappalardo et al. 2019) event data to compact timed events.
Output: /home/claude/data/wy_compact.jsonl
"""
import json, gc

RAW = '/home/claude/data/wy_raw'
teams = {t['wyId']: t['name'] for t in json.load(open('/home/claude/data/wy/raw_data/teams.json'))}
OUT = open('/home/claude/data/wy_compact.jsonl', 'w')
comp_name = {'England': 'Premier League', 'France': 'Ligue 1', 'Germany': '1. Bundesliga',
             'Italy': 'Serie A', 'Spain': 'La Liga', 'European_Championship': 'UEFA Euro 2016',
             'World_Cup': 'FIFA World Cup 2018'}
nbad = 0
for nation in ['England', 'France', 'Germany', 'Italy', 'Spain', 'European_Championship', 'World_Cup']:
    matches = json.load(open(f'{RAW}/matches_{nation}.json'))
    side_of = {}
    info = {}
    for m in matches:
        h = a = None
        for tid, td in m['teamsData'].items():
            if td['side'] == 'home':
                h = int(tid); hs = td['score']
            else:
                a = int(tid); as_ = td['score']
        side_of[m['wyId']] = {h: 'h', a: 'a'}
        info[m['wyId']] = dict(id=m['wyId'], comp=comp_name[nation], season=str(m.get('seasonId')),
                               date=m['dateutc'][:10], home=teams.get(h, str(h)), away=teams.get(a, str(a)),
                               hs=hs, as_=as_, ev=[], period_end={})
    events = json.load(open(f'{RAW}/events_{nation}.json'))
    for e in events:
        mid = e['matchId']
        if mid not in info:
            continue
        per = {'1H': 1, '2H': 2, 'E1': 3, 'E2': 4}.get(e['matchPeriod'])
        if per is None:
            continue
        t = e['eventSec']
        base = {1: 0, 2: 45, 3: 90, 4: 105}[per]
        mi = base + int(t // 60)
        se = int(t % 60)
        side = side_of[mid].get(e['teamId'], '?')
        tags = {x['id'] for x in e.get('tags', [])}
        rec = info[mid]
        rec['period_end'][per] = max(rec['period_end'].get(per, 0), base + t / 60)
        eid, sid = e['eventId'], e.get('subEventId')
        if eid == 3 and sid == 30:
            rec['ev'].append([per, mi, se, side, 'C'])
        if eid == 10 or (eid == 3 and sid in (33, 35)):
            code = 'G' if 101 in tags else 'S'
            on = 1 if (101 in tags or 1801 in tags) else 0
            ptype = 'Penalty' if sid == 35 else ('Free Kick' if sid == 33 else 'Open Play')
            rec['ev'].append([per, mi, se, side, code, None, on, ptype])
        if 102 in tags:  # own goal by this team -> goal for the opponent
            rec['ev'].append([per, mi, se, 'a' if side == 'h' else 'h', 'OG'])
        if 1701 in tags or 1703 in tags:
            rec['ev'].append([per, mi, se, side, 'R'])
    del events
    gc.collect()
    for mid, rec in info.items():
        g = {'h': 0, 'a': 0}
        for ev in rec['ev']:
            if ev[4] in ('G', 'OG') and ev[0] <= 4:
                g[ev[3]] += 1
        if (g['h'], g['a']) != (rec['hs'], rec['as_']):
            nbad += 1
        rec['goal_check'] = [g['h'], g['a']]
        OUT.write(json.dumps(rec) + '\n')
    print(nation, len(info), 'goal mismatches so far', nbad, flush=True)
OUT.close()
