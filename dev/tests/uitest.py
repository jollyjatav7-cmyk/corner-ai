"""UI test: iPad landscape/portrait and two iPhone sizes, served over http so the service worker runs.
Drives the market board with the on-screen keypad only (no typing into inputs) and checks every displayed
expected value against the model core.
Usage: python3 -I uitest.py <base_url> <out_dir>
"""
import sys, json, os, re
from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
SIZES = [('ipad_land', 1180, 820), ('ipad_port', 820, 1180), ('iphone', 390, 844), ('iphone_se', 375, 667)]


def line_value(label):
    """'9.5/10' -> 9.75, '主 −1/1.5' -> -1.25, '0' -> 0"""
    s = label.replace('主', '').replace('−', '-').strip()
    sign = -1 if s.startswith('-') else 1
    s = s.lstrip('+-')
    v = sum(float(x) for x in s.split('/')) / len(s.split('/'))
    return sign * v


def set_line(pg, target):
    for _ in range(60):
        v = line_value(pg.inner_text('#kp-lv'))
        if abs(v - target) < 1e-9:
            return
        pg.click('#kp button[data-kp="%s"]' % ('inc' if v < target else 'dec'))
    raise AssertionError('could not reach line %s' % target)


def close_kp(pg):
    if pg.is_visible('#kp'):
        pg.click('#kp-done')


def keys(pg, s):
    for ch in s:
        pg.click('#kp button[data-kp="%s"]' % ch)


# displayed numbers of every side on a board: [{row, side, odds, win, fair, ev}]
READ_BOARD = '''kind => Array.from(document.querySelectorAll('#' + kind + '-board .br')).map(r => ({
  name: r.querySelector('.br-n').childNodes[0].textContent.trim(),
  line: r.querySelector('.stp .lv') ? r.querySelector('.stp .lv').textContent : null,
  sides: Array.from(r.querySelectorAll('.sdl')).map(d => ({
    odds: d.querySelector('.ob').textContent.trim(), win: d.querySelector('.sw').childNodes[0].textContent.trim(),
    fair: d.querySelector('.sf').textContent.trim(), ev: d.querySelector('.se').textContent.trim() })) }))'''

# the same numbers straight from the model core (independent of the UI code)
CHECK_PRE = '''() => {
  const st = Core.buildRatings(BUNDLE, []);
  const L = BUNDLE.leagues[0], hi = L.teams.findIndex(t => t.n === 'Arsenal'), ai = L.teams.findIndex(t => t.n === 'Chelsea');
  const pm = Core.prematch({ B: BUNDLE, st: st, li: 0, hi: hi, ai: ai, odds: { h: 1.8, d: 3.8, a: 4.5, ouLine: 2.5, over: 1.85, under: 1.95 } });
  const ft = pm.cornersFT, gm = Core.goalsMarkets(pm.goalsFT);
  const r = x => Math.round(x * 1000) / 10;
  return {
    ou_over: r(Core.betStats(ft.tot, 0, 'over', 10.25, 1.90).ev), ou_under: r(Core.betStats(ft.tot, 0, 'under', 10.25, 1.90).ev),
    ou_win_over: r(Core.betStats(ft.tot, 0, 'over', 10.25).win),
    ah_home: r(Core.betStats(ft.dif, ft.difOff, 'over', 1.5, 1.95).ev), ah_away: r(Core.betStats(ft.dif, ft.difOff, 'under', 1.5, 1.85).ev),
    x_home: r(gm.pH * 1.8 - 1), g_over: r(Core.betStats(gm.tot, 0, 'over', 2.5, 1.85).ev)
  };
}'''

report = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, h in SIZES:
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, color_scheme='dark',
                            has_touch=True, is_mobile=w < 900)
        pg = ctx.new_page()
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_FAILED' not in m.text else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        for pat in ('**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**', '**/raw.githubusercontent.com/**', '**/cdn.jsdelivr.net/**'):
            pg.route(pat, lambda r: r.abort())
        pg.clock.install()
        pg.goto(BASE + '/index.html')
        pg.wait_for_timeout(400)
        pg.select_option('#sel-league', '0')
        hv = pg.eval_on_selector('#sel-home', "s => Array.from(s.options).find(o => o.text.indexOf('Arsenal')>=0).value")
        av = pg.eval_on_selector('#sel-away', "s => Array.from(s.options).find(o => o.text.indexOf('Chelsea')>=0).value")
        pg.select_option('#sel-home', hv); pg.select_option('#sel-away', av)
        pg.clock.run_for(400)
        R = {'errors': errs}
        # ---- pre-match board, keypad only ----
        pg.click('#pre-board .br >> nth=0 >> button[data-a="odd"] >> nth=0')      # 胜平负 · 主胜
        R['kp_open'] = pg.is_visible('#kp')
        keys(pg, '180'); keys(pg, '380'); keys(pg, '450')                           # auto-advances to 进球大小
        pg.clock.run_for(300)
        set_line(pg, 2.5); keys(pg, '185'); keys(pg, '195')                         # -> 全场角球 大小
        pg.clock.run_for(300)
        R['kp_title_3'] = pg.inner_text('#kp-title')
        set_line(pg, 10.25)
        R['ab_label'] = pg.inner_text('#kp-lv')                                      # must read 10/10.5
        keys(pg, '19'); pg.click('#kp-next'); keys(pg, '190')                       # 1.9 then 下一个, then 190
        pg.clock.run_for(300)
        R['kp_title_4'] = pg.inner_text('#kp-title')
        set_line(pg, -1.5); keys(pg, '195'); keys(pg, '185')
        pg.clock.run_for(300)
        ov_kp = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        # the row being edited sits between the top bar and the keypad
        R['active_visible'] = pg.evaluate('''() => { const a = document.querySelector('.br.act'); if (!a) return 'no active row';
          const r = a.getBoundingClientRect(), top = document.getElementById('topbar').getBoundingClientRect().bottom,
                k = document.getElementById('kp').getBoundingClientRect().top; return r.top >= top - 1 && r.bottom <= k + 1; }''')
        pg.screenshot(path=f'{OUT}/{name}_keypad.png', full_page=False)
        pg.click('#kp-done')
        pg.clock.run_for(300)
        R['kp_closed'] = not pg.is_visible('#kp')
        rows = pg.evaluate(READ_BOARD, 'pre')
        ref = pg.evaluate(CHECK_PRE)
        num = lambda s: float(s.replace('−', '-').replace('%', '').replace('+', ''))
        by = {r['name']: r for r in rows}
        got = {'ou_over': num(by['全场角球 大小']['sides'][0]['ev']), 'ou_under': num(by['全场角球 大小']['sides'][1]['ev']),
               'ou_win_over': num(by['全场角球 大小']['sides'][0]['win']),
               'ah_home': num(by['全场角球 让球']['sides'][0]['ev']), 'ah_away': num(by['全场角球 让球']['sides'][1]['ev']),
               'x_home': num(by['胜平负']['sides'][0]['ev']), 'g_over': num(by['进球 大小']['sides'][0]['ev'])}
        R['ev_match'] = all(abs(got[k] - ref[k]) < 0.051 for k in ref)
        if not R['ev_match']:
            R['ev_got'], R['ev_ref'] = got, ref
        R['lines'] = [r['line'] for r in rows]
        R['odds_ou'] = [s['odds'] for s in by['全场角球 大小']['sides']]
        R['src'] = pg.inner_text('#pre-kpi h2')
        sums = pg.eval_on_selector_all('#pre-sum .si .pill', 'els => els.map(e => e.textContent)')
        vals = [num(s) for s in sums]
        R['summary'] = sums
        R['summary_sorted'] = vals == sorted(vals, reverse=True)
        R['calib_tags'] = pg.eval_on_selector_all('#pre-board .tag', 'els => els.length')
        ov1 = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        two = pg.evaluate("document.getElementById('v-pre').className")
        pg.evaluate('window.scrollTo(0, 0)')
        pg.screenshot(path=f'{OUT}/{name}_pre.png', full_page=False)
        # add a market from the chips: opens the keypad on the new row; 3 taps fill one side
        pg.click('#pre-board button[data-a="add"][data-m="hc_ou"]')
        keys(pg, '205')
        R['added_row'] = pg.evaluate("Array.from(document.querySelectorAll('#pre-board .br')).pop().querySelector('.br-n').childNodes[0].textContent.trim()")
        R['added_odds'] = pg.evaluate("Array.from(document.querySelectorAll('#pre-board .br')).pop().querySelector('.ob').textContent.trim()")
        pg.click('#kp-done')
        # ---- live ----
        pg.click('#tab-live')
        pg.click('#ck-run')
        pg.clock.run_for(31 * 60 * 1000)
        for _ in range(3): pg.click('button[data-k="ch"][data-d="1"]')
        pg.click('button[data-k="ca"][data-d="1"]')
        pg.clock.run_for(25 * 1000)
        R['minute'] = pg.inner_text('#lv-min')
        pg.click('#live-board .br >> nth=0 >> button[data-a="odd"] >> nth=0')
        keys(pg, '188'); keys(pg, '192')
        pg.clock.run_for(200)
        pg.click('#kp-done')
        live_rows = pg.evaluate(READ_BOARD, 'live')
        R['live_ev'] = [s['ev'] for s in live_rows[0]['sides']]
        R['live_sum_items'] = pg.eval_on_selector_all('#live-sum .si', 'els => els.length')
        t_now = pg.inner_text('#live-corners')
        pg.click('#live-board button[data-a="mode"][data-v="all"]')
        t_all = pg.inner_text('#live-corners')
        R['ah_mode_titles'] = ['从现在 3:1 起算' in t_now, '按全场角球' in t_all]
        pg.click('#live-board button[data-a="mode"][data-v="now"]')
        # a corner after the odds were typed: that row is flagged and left out of the ranking until refreshed
        pg.click('button[data-k="ca"][data-d="1"]')
        R['stale_flag'] = pg.evaluate("document.querySelector('#live-board .br').classList.contains('stale')")
        R['stale_note'] = '没有算进来' in pg.inner_text('#live-sum')
        pg.click('#live-board .br >> nth=0 >> button[data-a="fresh"]')
        R['fresh_ok'] = not pg.evaluate("document.querySelector('#live-board .br').classList.contains('stale')") and '没有算进来' not in pg.inner_text('#live-sum')
        # minute keypad + added-time chips (no keyboard)
        pg.click('#lv-timeset summary')
        pg.click('#lv-setmin')
        keys(pg, '63'); pg.click('#kp-next')
        R['minute_set'] = pg.inner_text('#lv-min')
        pg.click('#lv-added button[data-v="4"]')
        R['added_pressed'] = pg.get_attribute('#lv-added button[data-v="4"]', 'aria-pressed')
        # in-play handicap EVs against the core (state: 63', 2nd half, 4 added, 0:0, corners 3:2)
        pg.click('#live-board .br >> nth=1 >> button[data-a="odd"] >> nth=0')       # 全场角球 让球
        set_line(pg, -0.5); keys(pg, '190'); keys(pg, '190')
        close_kp(pg)
        pg.click('button[data-k="gh"][data-d="1"]')                                  # 1:0, then a goal handicap
        pg.click('#live-board button[data-a="add"][data-m="g_ah"]')
        set_line(pg, -0.5); keys(pg, '190'); keys(pg, '190')
        close_kp(pg)
        lrows = {r['name']: r for r in pg.evaluate(READ_BOARD, 'live')}
        num2 = lambda s: float(s.replace('−', '-').replace('%', '').replace('+', ''))
        ref_live = pg.evaluate('''() => {
          const st = Core.buildRatings(BUNDLE, []);
          const L = BUNDLE.leagues[0], hi = L.teams.findIndex(t => t.n === 'Arsenal'), ai = L.teams.findIndex(t => t.n === 'Chelsea');
          const pm = Core.prematch({ B: BUNDLE, st: st, li: 0, hi: hi, ai: ai, odds: { h: 1.8, d: 3.8, a: 4.5, ouLine: 2.5, over: 1.85, under: 1.95 } });
          const r = x => Math.round(x * 1000) / 10;
          const a = Core.live(BUNDLE, pm, { per: 2, ht: false, minute: 63, added: '4', added1: '', gh: 0, ga: 0, ch: 3, ca: 2, rh: 0, ra: 0 });
          const b = Core.live(BUNDLE, pm, { per: 2, ht: false, minute: 63, added: '4', added1: '', gh: 1, ga: 0, ch: 3, ca: 2, rh: 0, ra: 0 });
          const gm = Core.goalsMarkets(b.goalsFT), f = b.cornersFT;   // the board always shows the current state
          return { c_home: r(Core.betStats(f.dif, f.difOff, 'over', 0.5, 1.9).ev), c_away: r(Core.betStats(f.dif, f.difOff, 'under', 0.5, 1.9).ev),
                   g_home: r(Core.betStats(gm.dif, gm.difOff - 1, 'over', 0.5, 1.9).ev), g_away: r(Core.betStats(gm.dif, gm.difOff - 1, 'under', 0.5, 1.9).ev) };
        }''')
        got_live = {'g_home': num2(lrows['进球 让球']['sides'][0]['ev']), 'g_away': num2(lrows['进球 让球']['sides'][1]['ev'])}
        R['live_goal_ah_match'] = all(abs(got_live[k] - ref_live[k]) < 0.051 for k in got_live)
        # the corner handicap row was typed at 0:0 -> now stale after the goal; its numbers are still shown
        cr = lrows['全场角球 让球']['sides']
        R['live_corner_ah_match'] = abs(num2(cr[0]['ev']) - ref_live['c_home']) < 0.051 and abs(num2(cr[1]['ev']) - ref_live['c_away']) < 0.051
        if not R['live_goal_ah_match']:
            R['live_got'], R['live_ref'] = got_live, ref_live
        ov2 = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        pg.evaluate('window.scrollTo(0, 0)')
        pg.screenshot(path=f'{OUT}/{name}_live.png', full_page=False)
        box = pg.eval_on_selector('#lv-counters', 'e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom]; }')
        # pip band
        pg.click('#tab-about')
        pg.select_option('#set-pip', 'top')
        pad = pg.evaluate("getComputedStyle(document.body).paddingTop")
        pg.select_option('#set-pip', 'none')
        ov3 = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        pg.screenshot(path=f'{OUT}/{name}_about.png', full_page=False)
        # boards survive a reload
        pg.reload(); pg.wait_for_timeout(300)
        pg.click('#tab-pre')
        R['persisted_odds'] = [s['odds'] for s in pg.evaluate(READ_BOARD, 'pre')[2]['sides']]
        R.update({'overflow': [ov_kp, ov1, ov2, ov3], 'layout': two, 'counters_y': box, 'pip_pad': pad})
        report[name] = R
        ctx.close()
    # an older version's saved odds move onto the board
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    for pat in ('**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**', '**/raw.githubusercontent.com/**', '**/cdn.jsdelivr.net/**'):
        pg.route(pat, lambda r: r.abort())
    pg.goto(BASE + '/index.html'); pg.wait_for_timeout(300)
    pg.evaluate('''() => localStorage.setItem('corner_goal_ai_v1', JSON.stringify({ setup: { li: 0, hi: 1, ai: 2, other: false },
      odds: { h: '2.10', d: '3.40', a: '3.30', l: '2.75', o: '1.90', u: '1.90' }, tab: 'pre' }))''')
    pg.reload(); pg.wait_for_timeout(500)
    mig = pg.evaluate(READ_BOARD, 'pre')
    report['migration'] = {'x12': [s['odds'] for s in mig[0]['sides']], 'ou_line': mig[1]['line'], 'ou': [s['odds'] for s in mig[1]['sides']],
                           'src': pg.inner_text('#pre-kpi h2')}
    ctx.close()
    # service worker: second load is controlled
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    pg.goto(BASE + '/index.html'); pg.wait_for_timeout(1500)
    pg.reload(); pg.wait_for_timeout(800)
    report['sw_controlled'] = pg.evaluate('!!navigator.serviceWorker && !!navigator.serviceWorker.controller')
    b.close()
print(json.dumps(report, ensure_ascii=False, indent=1))
