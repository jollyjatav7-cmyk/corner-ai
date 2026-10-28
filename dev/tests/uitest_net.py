"""End-to-end test of the online parts with mocked services (no real network):
API-Football (fixtures, pre-match odds, in-play odds, live state, final results, first-half statistics) and the open-matchday CSV.
A) with a key: link + read odds -> save -> live sync -> save -> results from the API -> settlement -> stats -> export -> import elsewhere
B) without a key: odds typed on the keypad -> save -> results from the public CSV -> manual first-half corners
Usage: python3 -I uitest_net.py <base_url> <out_dir>
"""
import sys, json, os, datetime, re
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
TODAY = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime('%Y-%m-%d')
KO = int(datetime.datetime.now().timestamp()) + 3 * 3600
TEAMS = {'home': {'id': 42, 'name': 'Arsenal'}, 'away': {'id': 49, 'name': 'Chelsea'}}


def fixture(status, el=None, goals=(None, None), ht=(None, None), ck=None, red=(0, 0)):
    f = {'fixture': {'id': 7001, 'timestamp': KO, 'status': {'short': status, 'elapsed': el}}, 'league': {'id': 39, 'name': 'Premier League'},
         'teams': TEAMS, 'goals': {'home': goals[0], 'away': goals[1]}, 'score': {'halftime': {'home': ht[0], 'away': ht[1]},
         'fulltime': {'home': goals[0] if status == 'FT' else None, 'away': goals[1] if status == 'FT' else None}}, 'events': []}
    if ck:
        f['statistics'] = [{'team': {'id': 42}, 'statistics': [{'type': 'Corner Kicks', 'value': ck[0]}, {'type': 'Red Cards', 'value': red[0] or None}]},
                           {'team': {'id': 49}, 'statistics': [{'type': 'Corner Kicks', 'value': ck[1]}, {'type': 'Red Cards', 'value': red[1] or None}]}]
    return f


OTHER = {'fixture': {'id': 7002, 'timestamp': KO, 'status': {'short': 'NS'}}, 'league': {'id': 39, 'name': 'Premier League'},
         'teams': {'home': {'id': 33, 'name': 'Manchester United'}, 'away': {'id': 50, 'name': 'Manchester City'}}, 'goals': {}, 'score': {}}
PRE_ODDS = [{'fixture': {'id': 7001}, 'bookmakers': [{'id': 8, 'name': 'Bet365', 'bets': [
    {'id': 1, 'name': 'Match Winner', 'values': [{'value': 'Home', 'odd': '1.80'}, {'value': 'Draw', 'odd': '3.80'}, {'value': 'Away', 'odd': '4.50'}]},
    {'id': 5, 'name': 'Goals Over/Under', 'values': [{'value': 'Over 2.5', 'odd': '1.85'}, {'value': 'Under 2.5', 'odd': '1.95'}, {'value': 'Over 3.5', 'odd': '3.10'}, {'value': 'Under 3.5', 'odd': '1.36'}]},
    {'id': 45, 'name': 'Corners Over Under', 'values': [{'value': 'Over 9.5', 'odd': '1.90'}, {'value': 'Under 9.5', 'odd': '1.90'}, {'value': 'Over 10.5', 'odd': '2.40'}, {'value': 'Under 10.5', 'odd': '1.55'}]},
    {'id': 56, 'name': 'Corners Asian Handicap', 'values': [{'value': 'Home -1.5', 'odd': '1.95'}, {'value': 'Away +1.5', 'odd': '1.85'}]},
    {'id': 77, 'name': 'Total Corners (1st Half)', 'values': [{'value': 'Over 4.5', 'odd': '1.95'}, {'value': 'Under 4.5', 'odd': '1.85'}]},
    {'id': 57, 'name': 'Home Corners Over/Under', 'values': [{'value': 'Over 5.5', 'odd': '1.90'}, {'value': 'Under 5.5', 'odd': '1.90'}]}]}]}]
LIVE_ODDS = [{'fixture': {'id': 7001}, 'odds': [
    {'id': 1, 'name': 'Asian Corners', 'values': [{'value': 'Over', 'odd': '1.90', 'handicap': '11', 'main': True}, {'value': 'Under', 'odd': '1.90', 'handicap': '11', 'main': True}]},
    {'id': 2, 'name': 'Asian Handicap Corners', 'values': [{'value': 'Home', 'odd': '1.85', 'handicap': '-0.5', 'main': True}, {'value': 'Away', 'odd': '1.95', 'handicap': '0.5', 'main': True}]},
    {'id': 3, 'name': 'Fulltime Result', 'values': [{'value': 'Home', 'odd': '1.40'}, {'value': 'Draw', 'odd': '4.20'}, {'value': 'Away', 'odd': '9.00'}]}]}]
STATE = {'phase': 'pre'}
CALLS = []


def api_route(route):
    req = route.request
    u = urlparse(req.url); q = {k: v[0] for k, v in parse_qs(u.query).items()}
    hdr = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json'}
    if req.method == 'OPTIONS':
        return route.fulfill(status=204, headers=hdr)
    CALLS.append(u.path + ('?' + u.query if u.query else ''))
    resp = []
    if u.path == '/status':
        resp = {'subscription': {'plan': 'Free', 'active': True}, 'requests': {'current': 7, 'limit_day': 100}}
    elif u.path == '/odds':
        resp = PRE_ODDS
    elif u.path == '/odds/live':
        resp = LIVE_ODDS
    elif u.path == '/fixtures/statistics':
        resp = [{'team': {'id': 42}, 'statistics_1h': [{'type': 'Corner Kicks', 'value': 5}]}, {'team': {'id': 49}, 'statistics_1h': [{'type': 'Corner Kicks', 'value': 2}]}] if q.get('half') else []
    elif u.path == '/fixtures':
        if 'date' in q:
            resp = [fixture('NS'), OTHER]
        elif 'id' in q:
            resp = [fixture('2H', 63, (1, 0), (1, 0), (6, 3))]
        elif 'ids' in q:
            resp = [fixture('FT', 90, (2, 1), (1, 0), (8, 4))]
    return route.fulfill(status=200, headers=hdr, body=json.dumps({'errors': [], 'response': resp}))


CSV_HEAD = 'gw,date,time,home,away,ft_home,ft_away,ft_result,ht_home,ht_away,ht_result,home_shots,away_shots,home_target,away_target,home_fouls,away_fouls,home_corners,away_corners,home_corners_1h,away_corners_1h\n'
CSV = {'rows': ''}


def om_route(route):
    hdr = {'access-control-allow-origin': '*', 'content-type': 'text/plain'}
    return route.fulfill(status=200, headers=hdr, body=CSV_HEAD + CSV['rows'])


def page(ctx, errs):
    pg = ctx.new_page()
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_FAILED' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    for pat in ('**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**', '**/cdn.jsdelivr.net/**'):
        pg.route(pat, lambda r: r.abort())
    pg.route('https://v3.football.api-sports.io/**', api_route)
    pg.route('https://raw.githubusercontent.com/**', om_route)
    return pg


def pick_match(pg):
    pg.select_option('#sel-league', '0')
    hv = pg.eval_on_selector('#sel-home', "s => Array.from(s.options).find(o => o.text.indexOf('Arsenal')>=0).value")
    av = pg.eval_on_selector('#sel-away', "s => Array.from(s.options).find(o => o.text.indexOf('Chelsea')>=0).value")
    pg.select_option('#sel-home', hv); pg.select_option('#sel-away', av)
    pg.wait_for_timeout(300)


BOARD = '''kind => Array.from(document.querySelectorAll('#' + kind + '-board .br')).map(r => ({
  name: r.querySelector('.br-n').childNodes[0].textContent.trim(), line: r.querySelector('.stp .lv') ? r.querySelector('.stp .lv').textContent : null,
  tag: r.querySelector('.tag.net') ? r.querySelector('.tag.net').textContent : '', odds: Array.from(r.querySelectorAll('.ob')).map(b => b.textContent.trim()) }))'''
REC = "() => JSON.parse(localStorage.getItem('corner_goal_ai_rec_v1') || '{\"recs\":[],\"matches\":{}}')"
CONSIST = '''() => { const R = JSON.parse(localStorage.getItem('corner_goal_ai_rec_v1'));
  return R.recs.filter(r => r.res).every(r => { const x = Net.settle(r, R.matches[r.mid].res); return x && x.u === r.res.u && Math.abs(x.pl - r.res.pl) < 1e-9; }); }'''
report = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------------- A: with a key ----------------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Asia/Tokyo', has_touch=True, is_mobile=True)
    errs = []; pg = page(ctx, errs)
    pg.goto(BASE + '/index.html'); pg.wait_for_timeout(400)
    R = {}
    pg.click('#tab-about'); pg.fill('#net-key', 'test-key-123'); pg.click('#net-save'); pg.click('#net-test'); pg.wait_for_timeout(300)
    R['status_msg'] = pg.inner_text('#net-msg')
    pg.click('#tab-pre'); pick_match(pg)
    pg.click('#pre-board button[data-a="net"]'); pg.wait_for_timeout(900)
    R['net_msg'] = pg.inner_text('#pre-board .netmsg')
    rows = {r['name']: r for r in pg.evaluate(BOARD, 'pre')}
    R['pre_rows'] = {k: [v['line'], v['odds'], v['tag']] for k, v in rows.items()}
    R['pre_linked'] = pg.inner_text('#pre-board .nt') if pg.query_selector('#pre-board .nt') else ''
    R['src_after_import'] = pg.inner_text('#pre-kpi h2')
    pg.screenshot(path=f'{OUT}/net_pre.png')
    # move an imported line to another line the bookmaker quotes (9.5 -> 10.5): the row takes those odds
    for _ in range(4): pg.click('#pre-board .br >> nth=2 >> button[data-a="inc"]')
    pg.wait_for_timeout(200)
    r2 = pg.evaluate(BOARD, 'pre')[2]
    R['alt_line'] = [r2['line'], r2['odds'], r2['tag']]
    # a line the bookmaker does not quote (9.75): its online odds are cleared; type the platform's odds
    for _ in range(3): pg.click('#pre-board .br >> nth=2 >> button[data-a="dec"]')
    pg.wait_for_timeout(200)
    R['after_line_change'] = pg.evaluate(BOARD, 'pre')[2]['odds']
    pg.click('#pre-board .br >> nth=2 >> button[data-a="odd"] >> nth=0')
    for ch in '205195': pg.click(f'#kp button[data-kp="{ch}"]')
    if pg.is_visible('#kp'): pg.click('#kp-done')
    pg.click('#pre-sum button[data-a="save-all"]'); pg.wait_for_timeout(200)
    R['toast_save'] = pg.inner_text('#msg-toast')
    rec = pg.evaluate(REC)
    R['saved_pre'] = len(rec['recs'])
    # live: sync score + odds
    pg.click('#tab-live')
    pg.click('#live-board button[data-a="net"]'); pg.wait_for_timeout(900)
    R['live_msg'] = pg.inner_text('#live-board .netmsg')
    R['live_state'] = [pg.inner_text('#lv-min'), pg.inner_text('#lv-gh') + ':' + pg.inner_text('#lv-ga'), pg.inner_text('#c-ch') + ':' + pg.inner_text('#c-ca')]
    R['live_rows'] = [[r['name'], r['line'], r['odds']] for r in pg.evaluate(BOARD, 'live')]
    pg.click('#live-sum button[data-a="save-all"]'); pg.wait_for_timeout(200)
    rec = pg.evaluate(REC)
    R['saved_total'] = len(rec['recs'])
    R['live_rec_base'] = [r.get('b') for r in rec['recs'] if r['ph'] == 'live' and r['m'] == 'ftc_ah']
    pg.screenshot(path=f'{OUT}/net_live.png')
    # results
    CSV['rows'] = ''   # the public data has nothing yet -> results come from the API
    pg.click('#tab-rec')
    pg.click('#rec-act button[data-r="look"]'); pg.wait_for_timeout(1200)
    R['look_msg'] = pg.inner_text('#rec-act')
    rec = pg.evaluate(REC)
    m = list(rec['matches'].values())[0]
    R['match_res'] = [m['res'], m['src']]
    R['settled'] = [len([r for r in rec['recs'] if r.get('res')]), len(rec['recs'])]
    R['consistent'] = pg.evaluate(CONSIST)
    ou = [r for r in rec['recs'] if r['ph'] == 'pre' and r['m'] == 'ftc_ou' and r['s'] == 0]
    R['pre_over_9.5_result'] = [ou[0]['l'], ou[0]['res']] if ou else None
    R['stats_text'] = pg.inner_text('#rec-stats')[:300]
    pg.screenshot(path=f'{OUT}/net_rec.png', full_page=True)
    # export
    pg.click('#rec-act button[data-r="export"]'); pg.wait_for_timeout(200)
    exp = pg.input_value('#exp-text')
    ej = json.loads(exp)
    R['export'] = [ej['app'], len(ej['recs']), len(ej['matches']), 'readme' in ej]
    pg.click('#sheet-x')
    R['calls'] = CALLS[:]
    R['errors'] = errs
    ctx.close()
    report['A_with_key'] = R
    # import into a fresh device
    ctx = b.new_context(viewport={'width': 820, 'height': 1180}, timezone_id='Asia/Tokyo')
    errs = []; pg = page(ctx, errs)
    pg.goto(BASE + '/index.html'); pg.wait_for_timeout(300)
    pg.click('#tab-rec'); pg.click('#rec-act button[data-r="import"]'); pg.fill('#imp-text', exp); pg.click('#sheet-body button[data-x="go"]'); pg.wait_for_timeout(200)
    rec2 = pg.evaluate(REC)
    pg.click('#rec-act button[data-r="import"]'); pg.fill('#imp-text', exp); pg.click('#sheet-body button[data-x="go"]'); pg.wait_for_timeout(200)
    rec3 = pg.evaluate(REC)
    report['import'] = {'after_first': len(rec2['recs']), 'after_second (no duplicates)': len(rec3['recs']), 'errors': errs}
    pg.screenshot(path=f'{OUT}/net_rec_ipad.png')
    ctx.close()
    # ---------------- B: no key, public data + manual ----------------
    CALLS.clear()
    ctx = b.new_context(viewport={'width': 375, 'height': 667}, timezone_id='Asia/Tokyo', has_touch=True, is_mobile=True)
    errs = []; pg = page(ctx, errs)
    pg.goto(BASE + '/index.html'); pg.wait_for_timeout(300)
    R = {}
    pick_match(pg)
    R['netbar_without_key'] = pg.inner_text('#pre-board .netbar')
    # corner total and first-half total on the keypad
    pg.click('#pre-board .br >> nth=2 >> button[data-a="odd"] >> nth=0')
    for ch in '190190': pg.click(f'#kp button[data-kp="{ch}"]')
    pg.click('#kp-done')
    pg.click('#pre-board .br >> nth=4 >> button[data-a="odd"] >> nth=0')
    for ch in '185195': pg.click(f'#kp button[data-kp="{ch}"]')
    if pg.is_visible('#kp'): pg.click('#kp-done')
    pg.click('#pre-sum button[data-a="save-all"]'); pg.wait_for_timeout(200)
    rec = pg.evaluate(REC)
    R['saved'] = [[r['m'], r['l'], r['s'], r['o']] for r in rec['recs']]
    CSV['rows'] = f'10,{TODAY},20:00,Arsenal,Chelsea,3,1,H,1,1,D,15,9,6,4,10,12,9,2,,\n'   # no first-half corners in this file
    pg.click('#tab-rec'); pg.click('#rec-act button[data-r="look"]'); pg.wait_for_timeout(900)
    rec = pg.evaluate(REC)
    m = list(rec['matches'].values())[0]
    R['public_res'] = [m['res'], m['src']]
    R['settled_after_public'] = [len([r for r in rec['recs'] if r.get('res')]), len(rec['recs'])]
    # first-half corners by hand: 4:1
    pg.click('#rec-list button[data-r="ed"]')
    keys = pg.eval_on_selector_all('#rec-list .ed-r .tl', 'els => els.map(e => e.textContent)')
    R['editor_fields'] = keys
    idx = keys.index('上半场角球')
    for _ in range(4): pg.click(f'#rec-list .ed-r >> nth={idx} >> button[data-d="1"] >> nth=0')
    pg.click(f'#rec-list .ed-r >> nth={idx} >> button[data-d="1"] >> nth=1')
    pg.click('#rec-list button[data-r="edsave"]'); pg.wait_for_timeout(200)
    rec = pg.evaluate(REC)
    m = list(rec['matches'].values())[0]
    R['after_manual'] = [m['res'].get('c1'), m['src'].get('c1'), len([r for r in rec['recs'] if r.get('res')]), len(rec['recs'])]
    R['consistent'] = pg.evaluate(CONSIST)
    R['api_calls_without_key'] = [c for c in CALLS]
    R['overflow'] = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    R['errors'] = errs
    pg.screenshot(path=f'{OUT}/net_rec_se.png', full_page=True)
    report['B_no_key'] = R
    b.close()
print(json.dumps(report, ensure_ascii=False, indent=1))
