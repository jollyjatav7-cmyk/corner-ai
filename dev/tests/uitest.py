"""UI test: iPad landscape/portrait and two iPhone sizes, served over http so the service worker runs.
Usage: python3 -I uitest.py <base_url> <out_dir>
"""
import sys, json, os
from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
SIZES = [('ipad_land', 1180, 820), ('ipad_port', 820, 1180), ('iphone', 390, 844), ('iphone_se', 375, 667)]
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
        pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        pg.route('**/fonts.gstatic.com/**', lambda r: r.abort())
        pg.route('**/raw.githubusercontent.com/**', lambda r: r.abort())
        pg.route('**/cdn.jsdelivr.net/**', lambda r: r.abort())
        pg.clock.install()
        pg.goto(BASE + '/index.html')
        pg.wait_for_timeout(400)
        pg.select_option('#sel-league', '0')
        hv = pg.eval_on_selector('#sel-home', "s => Array.from(s.options).find(o => o.text.indexOf('Arsenal')>=0).value")
        av = pg.eval_on_selector('#sel-away', "s => Array.from(s.options).find(o => o.text.indexOf('Chelsea')>=0).value")
        pg.select_option('#sel-home', hv); pg.select_option('#sel-away', av)
        for sel, v in [('#od-h', '1.80'), ('#od-d', '3.80'), ('#od-a', '4.50'), ('#od-o', '1.85'), ('#od-u', '1.95')]:
            pg.fill(sel, v)
        pg.clock.run_for(400)
        ov1 = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        two = pg.evaluate("document.getElementById('v-pre').className")
        pg.screenshot(path=f'{OUT}/{name}_pre.png', full_page=False)
        # live: start the clock and let 31 minutes pass
        pg.click('#tab-live')
        pg.click('#ck-run')
        pg.clock.run_for(31 * 60 * 1000)
        for _ in range(3): pg.click('button[data-k="ch"][data-d="1"]')
        pg.click('button[data-k="ca"][data-d="1"]')
        pg.clock.run_for(25 * 1000)
        minute = pg.inner_text('#lv-min')
        ov2 = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        pg.screenshot(path=f'{OUT}/{name}_live.png', full_page=False)
        # counters must be visible without scrolling on phones too (top of the live view)
        box = pg.eval_on_selector('#lv-counters', 'e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom]; }')
        # pip band
        pg.click('#tab-about')
        pg.select_option('#set-pip', 'top')
        pad = pg.evaluate("getComputedStyle(document.body).paddingTop")
        pg.select_option('#set-pip', 'none')
        ov3 = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        pg.screenshot(path=f'{OUT}/{name}_about.png', full_page=False)
        report[name] = {'overflow': [ov1, ov2, ov3], 'layout': two, 'minute': minute, 'counters_y': box,
                        'pip_pad': pad, 'errors': errs}
        ctx.close()
    # service worker: second load is controlled
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    pg.goto(BASE + '/index.html'); pg.wait_for_timeout(1500)
    pg.reload(); pg.wait_for_timeout(800)
    report['sw_controlled'] = pg.evaluate('!!navigator.serviceWorker && !!navigator.serviceWorker.controller')
    b.close()
print(json.dumps(report, ensure_ascii=False, indent=1))
