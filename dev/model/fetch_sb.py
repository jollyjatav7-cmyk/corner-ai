"""Fetch StatsBomb open-data event files in batches via git sparse checkout,
reduce each match to a compact list of timed events, then drop the raw JSON.

Output: /home/claude/data/sb_compact.jsonl  (one JSON object per match)
"""
import json, os, subprocess, sys, time

SB = '/home/claude/data/sb'
OUT = '/home/claude/data/sb_compact.jsonl'
ids = [int(x) for x in open('/home/claude/data/sb_ids.txt').read().split()]

# match metadata
meta = {}
comps = json.load(open(f'{SB}/data/competitions.json'))
for c in comps:
    if c['competition_gender'] != 'male':
        continue
    p = f"{SB}/data/matches/{c['competition_id']}/{c['season_id']}.json"
    for m in json.load(open(p)):
        meta[m['match_id']] = dict(
            comp=c['competition_name'], season=c['season_name'],
            date=m['match_date'], home=m['home_team']['home_team_name'],
            away=m['away_team']['away_team_name'], hs=m['home_score'], as_=m['away_score'])

done = set()
if os.path.exists(OUT):
    for line in open(OUT):
        done.add(json.loads(line)['id'])
todo = [i for i in ids if i not in done]
print('todo', len(todo), flush=True)


def reduce(mid, ev):
    m = meta[mid]
    home = m['home']
    evs = []
    period_end = {}
    for e in ev:
        per = e.get('period')
        if per is None or per > 4:
            continue
        t = e['type']['name']
        mi, se = e.get('minute', 0), e.get('second', 0)
        team = e.get('team', {}).get('name')
        side = 'h' if team == home else 'a'
        if t == 'Half End':
            period_end[per] = max(period_end.get(per, 0), mi + se / 60)
        if t == 'Pass' and e.get('pass', {}).get('type', {}).get('name') == 'Corner':
            evs.append([per, mi, se, side, 'C'])
        elif t == 'Shot':
            sh = e['shot']
            outc = sh.get('outcome', {}).get('name')
            xg = round(sh.get('statsbomb_xg', 0) or 0, 4)
            ptype = sh.get('type', {}).get('name')
            code = 'G' if outc == 'Goal' else 'S'
            on = outc in ('Goal', 'Saved', 'Saved To Post', 'Saved Off Target')
            evs.append([per, mi, se, side, code, xg, int(on), ptype])
        elif t == 'Own Goal For':
            evs.append([per, mi, se, side, 'OG'])
        elif t in ('Foul Committed', 'Bad Behaviour'):
            key = 'foul_committed' if t == 'Foul Committed' else 'bad_behaviour'
            card = e.get(key, {}).get('card', {}).get('name')
            if card in ('Red Card', 'Second Yellow'):
                evs.append([per, mi, se, side, 'R'])
    return dict(id=mid, **m, period_end=period_end, ev=evs)


B = 150
for k in range(0, len(todo), B):
    batch = todo[k:k + B]
    paths = [f'data/events/{i}.json' for i in batch]
    t0 = time.time()
    subprocess.run(['git', 'sparse-checkout', 'set', '--no-cone', 'data/competitions.json', 'data/matches/*'] + paths,
                   cwd=SB, check=True, capture_output=True)
    subprocess.run(['git', 'checkout'], cwd=SB, check=True, capture_output=True)
    with open(OUT, 'a') as f:
        for i in batch:
            p = f'{SB}/data/events/{i}.json'
            if not os.path.exists(p):
                print('missing', i, flush=True)
                continue
            ev = json.load(open(p))
            f.write(json.dumps(reduce(i, ev)) + '\n')
    # drop working-tree copies; also prune packed blobs to keep disk low
    subprocess.run(['git', 'sparse-checkout', 'set', '--no-cone', 'data/competitions.json', 'data/matches/*'],
                   cwd=SB, check=True, capture_output=True)
    print(f'batch {k // B} done {len(batch)} in {time.time() - t0:.1f}s', flush=True)
print('ALL DONE', flush=True)
