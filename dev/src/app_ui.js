/* 角球进球预测 — UI layer (ES5, no framework) */
(function () {
  'use strict';
  var B = BUNDLE;
  var ABOUT_HTML = /*ABOUT*/'';
  var APP_VER = '/*APPVER*/';
  var LS_KEY = 'corner_goal_ai_v1';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- state ---------------- */
  var S = {
    tab: 'pre',
    setup: { li: 0, hi: 0, ai: 1, other: false, oh: '', oa: '', avg: '10.0', share: '54' },
    odds: { h: '', d: '', a: '', l: '2.5', o: '', u: '' },
    live: { per: 1, ht: false, baseMin: 0, baseTs: 0, running: false, added: '', added1: '',
            gh: 0, ga: 0, ch: 0, ca: 0, rh: 0, ra: 0 },
    ev: { m: 'ftc_ou', l: '9.5', s: 'over', o: '' },
    lev: { m: 'ftc_ou', l: '', s: 'over', o: '' },
    extra: [], extraUntil: null, updatedAt: null,
    view: { pip: 'none', piph: '200' }
  };
  function load() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      ['setup', 'odds', 'live', 'ev', 'lev', 'view'].forEach(function (k) { if (o[k]) for (var kk in o[k]) S[k][kk] = o[k][kk]; });
      if (o.extra && o.extraUntil && o.dataUntil === B.data_until) { S.extra = o.extra; S.extraUntil = o.extraUntil; S.updatedAt = o.updatedAt; }
      if (o.tab) S.tab = o.tab;
      if (o.lastAuto) S.lastAuto = o.lastAuto;
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  function save() {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify({ setup: S.setup, odds: S.odds, live: S.live, ev: S.ev, lev: S.lev, view: S.view,
        extra: S.extra, extraUntil: S.extraUntil, updatedAt: S.updatedAt, dataUntil: B.data_until, tab: S.tab, lastAuto: S.lastAuto || 0 }));
    } catch (e) { /* ignore */ }
  }
  load();
  var ST = Core.buildRatings(B, S.extra);

  /* ---------------- helpers ---------------- */
  function pct(p) { return (p * 100).toFixed(1) + '%'; }
  function fo(x) { return !isFinite(x) || x > 99 ? '—' : x.toFixed(2); }
  function f1(x) { return x.toFixed(1); }
  function f2(x) { return x.toFixed(2); }
  function num(v) { var x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function teamLabel(t) { return t.z ? t.z + ' ' + t.n : t.n; }
  function teamShort(t) { return t.z ? t.z : t.n; }
  function lineStr(l) { var s = (Math.round(l * 100) / 100).toString(); return l > 0 ? s : s; }
  function hcapStr(h) { return h > 0 ? '+' + lineStr(h) : (h === 0 ? '0' : lineStr(h)); }
  function sumArr(a, from) { var s = 0; for (var i = from || 0; i < a.length; i++) s += a[i]; return s; }
  function meanOf(pmf, off) { var s = 0; for (var i = 0; i < pmf.length; i++) s += (i + off) * pmf[i]; return s; }

  /* ---------------- league / team selects ---------------- */
  function fillLeagues() {
    var sel = $('sel-league'), h = '';
    B.leagues.forEach(function (L, i) { h += '<option value="' + i + '">' + esc(L.zh) + '</option>'; });
    h += '<option value="other">其他联赛（手动）</option>';
    sel.innerHTML = h;
    sel.value = S.setup.other ? 'other' : String(S.setup.li);
  }
  function fillTeams() {
    if (S.setup.other) return;
    var L = B.leagues[S.setup.li], idx = L.teams.map(function (t, i) { return i; });
    idx.sort(function (a, b) { return teamLabel(L.teams[a]).localeCompare(teamLabel(L.teams[b]), 'zh'); });
    var h = '';
    idx.forEach(function (i) { h += '<option value="' + i + '">' + esc(teamLabel(L.teams[i])) + '</option>'; });
    $('sel-home').innerHTML = h; $('sel-away').innerHTML = h;
    if (S.setup.hi >= L.teams.length) S.setup.hi = 0;
    if (S.setup.ai >= L.teams.length || S.setup.ai === S.setup.hi) S.setup.ai = S.setup.hi === 0 ? 1 : 0;
    $('sel-home').value = String(S.setup.hi); $('sel-away').value = String(S.setup.ai);
  }
  function teamNames() {
    if (S.setup.other) return [S.setup.oh || '主队', S.setup.oa || '客队'];
    var L = B.leagues[S.setup.li];
    return [teamShort(L.teams[S.setup.hi]), teamShort(L.teams[S.setup.ai])];
  }

  /* ---------------- odds parsing ---------------- */
  function readOdds() {
    var o = S.odds, h = num(o.h), d = num(o.d), a = num(o.a), l = num(o.l), ov = num(o.o), un = num(o.u);
    var ok1 = h > 1 && d > 1 && a > 1, ok2 = l !== null && ov > 1 && un > 1;
    if (!ok1) return { odds: null, note: ok2 ? '大小球赔率需要和胜平负赔率一起填写才会使用。' : '' };
    var marg = 1 / h + 1 / d + 1 / a - 1;
    var note = '胜平负抽水 ' + (marg * 100).toFixed(1) + '%';
    if (ok2) note += '，大小球抽水 ' + ((1 / ov + 1 / un - 1) * 100).toFixed(1) + '%';
    else note += '；未填大小球，总进球按球队数据估计';
    if (marg < 0 || marg > 0.2) note += '（抽水异常，请检查赔率）';
    return { odds: { h: h, d: d, a: a, ouLine: ok2 ? l : 2.5, over: ok2 ? ov : null, under: ok2 ? un : null }, note: note };
  }

  /* ---------------- compute ---------------- */
  var PM = null, PMerr = '';
  function computePre() {
    PMerr = '';
    var ro = readOdds();
    $('odds-note').textContent = ro.note;
    try {
      if (S.setup.other) {
        var avg = num(S.setup.avg) || 10, share = (num(S.setup.share) || 54) / 100;
        if (!ro.odds) { PM = null; PMerr = '其他联赛需要填写胜平负赔率（最好也填大小球）。'; return; }
        PM = Core.prematch({ B: B, odds: ro.odds, manual: { avgTotal: avg, homeShare: Math.min(0.7, Math.max(0.3, share)) } });
      } else {
        if (S.setup.hi === S.setup.ai) { PM = null; PMerr = '主队和客队不能相同。'; return; }
        PM = Core.prematch({ B: B, st: ST, li: S.setup.li, hi: S.setup.hi, ai: S.setup.ai, odds: ro.odds });
      }
    } catch (e) { PM = null; PMerr = '计算失败：' + e.message; }
  }

  /* ---------------- rendering: shared tables ---------------- */
  function centerLines(mean, n, step, half, allowNeg) {
    // half lines around the mean: the line just below the mean gets index floor((n-1)/2)
    var c = half ? Math.floor(mean) + 0.5 : Math.round(mean);
    var out = [], start = c - step * Math.floor((n - 1) / 2);
    for (var i = 0; i < n; i++) { var v = start + i * step; if (allowNeg || v > 0) out.push(v); }
    return out;
  }
  function ouTable(pmf, off, lines, title, mean) {
    var h = '<div class="sec">' + title + '</div><div class="tw"><table class="mk"><thead><tr><th>盘口</th><th>大 · 公平赔率</th><th>小 · 公平赔率</th></tr></thead><tbody>';
    lines.forEach(function (L) {
      var o = Core.betStats(pmf, off, 'over', L), u = Core.betStats(pmf, off, 'under', L);
      var near = Math.abs(L - mean) < 0.75;
      h += '<tr' + (near ? ' class="near"' : '') + '><td class="ln">' + lineStr(L) + '</td>' +
        '<td><span class="p">' + pct(o.win) + '</span><span class="o">' + fo(o.fair) + '</span></td>' +
        '<td><span class="p">' + pct(u.win) + '</span><span class="o">' + fo(u.fair) + '</span></td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function ahTable(dif, off, hlines, title, names, meanDiff) {
    // hlines: handicap applied to HOME team
    var h = '<div class="sec">' + title + '</div><div class="tw"><table class="mk"><thead><tr><th>主队让</th><th>' + esc(names[0]) + '</th><th>' + esc(names[1]) + '</th></tr></thead><tbody>';
    hlines.forEach(function (hl) {
      var ho = Core.betStats(dif, off, 'over', -hl), aw = Core.betStats(dif, off, 'under', -hl);
      var near = Math.abs(-hl - meanDiff) < 0.75;
      h += '<tr' + (near ? ' class="near"' : '') + '><td class="ln">' + hcapStr(hl) + '</td>' +
        '<td><span class="p">' + pct(ho.win) + '</span><span class="o">' + fo(ho.fair) + '</span></td>' +
        '<td><span class="p">' + pct(aw.win) + '</span><span class="o">' + fo(aw.fair) + '</span></td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function distChart(pmf, off, mark) {
    // bars for totals; show the most likely range
    var lo = null, hi = null, i;
    for (i = 0; i < pmf.length; i++) if (pmf[i] > 0.004) { if (lo === null) lo = i; hi = i; }
    if (lo === null) return '';
    var n = hi - lo + 1, W = 320, H = 88, bw = W / n, mx = 0;
    for (i = lo; i <= hi; i++) mx = Math.max(mx, pmf[i]);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="全场角球总数分布">';
    for (i = lo; i <= hi; i++) {
      var v = i + off, bh = (pmf[i] / mx) * (H - 22), x = (i - lo) * bw;
      var over = mark !== null && v > mark;
      s += '<rect x="' + (x + 1).toFixed(1) + '" y="' + (H - 16 - bh).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) +
        '" height="' + bh.toFixed(1) + '" rx="2" fill="' + (over ? 'var(--accent)' : 'var(--line)') + '"></rect>';
      if (n <= 18 || (v % 2 === 0)) s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 3) + '" font-size="10" text-anchor="middle" fill="var(--muted)" font-family="var(--font-num)">' + v + '</text>';
    }
    return s + '</svg>';
  }
  function goalsBlock(gm, ghm, names, isLive) {
    var h = '<div class="tw"><table class="mk"><thead><tr><th>' + (isLive ? '全场赛果' : '胜平负') + '</th><th>概率</th><th>公平赔率</th></tr></thead><tbody>';
    [['主胜 ' + names[0], gm.pH], ['平局', gm.pD], ['客胜 ' + names[1], gm.pA]].forEach(function (r) {
      h += '<tr><td>' + esc(r[0]) + '</td><td class="p">' + pct(r[1]) + '</td><td>' + fo(1 / r[1]) + '</td></tr>';
    });
    h += '<tr><td>双方都进球</td><td class="p">' + pct(gm.btts) + '</td><td>' + fo(1 / gm.btts) + '</td></tr>';
    h += '</tbody></table></div>';
    var tm = meanOf(gm.tot, 0);
    h += ouTable(gm.tot, 0, centerLines(tm, 4, 1, true), '进球大小（全场）', tm);
    if (ghm) {
      h += '<div class="sec">半场</div><div class="tw"><table class="mk"><thead><tr><th>半场</th><th>概率</th><th>公平赔率</th></tr></thead><tbody>';
      [['主胜', ghm.pH], ['平局', ghm.pD], ['客胜', ghm.pA]].forEach(function (r) {
        h += '<tr><td>' + r[0] + '</td><td class="p">' + pct(r[1]) + '</td><td>' + fo(1 / r[1]) + '</td></tr>';
      });
      [0.5, 1.5].forEach(function (L) {
        var o = Core.betStats(ghm.tot, 0, 'over', L);
        h += '<tr><td>半场大 ' + L + '</td><td class="p">' + pct(o.win) + '</td><td>' + fo(o.fair) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '<div class="sec">最可能比分</div><div class="tw"><table class="mk"><tbody><tr>';
    gm.cs.slice(0, 6).forEach(function (c) { h += '<td class="ln" style="text-align:center">' + c[0] + '-' + c[1] + '<div class="o" style="margin:0">' + pct(c[2]) + '</div></td>'; });
    return h + '</tr></tbody></table></div>';
  }

  /* ---------------- EV checker ---------------- */
  var MARKETS = [
    ['ftc_ou', '全场角球 大小'], ['htc_ou', '半场角球 大小'], ['ftc_ah', '全场角球 让球'], ['htc_ah', '半场角球 让球'],
    ['hc_ou', '主队角球 大小'], ['ac_ou', '客队角球 大小'], ['g_ou', '进球 大小'], ['g_ah', '进球 让球'], ['g_1x2', '胜平负']
  ];
  function evPanel(prefix, st, ctx, names) {
    var h = '<h2>价值计算 <span class="sub">（填庄家赔率，看期望收益）</span></h2><div class="fg c2">' +
      '<label class="f"><span>玩法</span><select id="' + prefix + '-m">';
    var avail = MARKETS.filter(function (m) { return !(m[0].indexOf('htc') === 0 && !ctx.ht); });
    if (!avail.some(function (m) { return m[0] === st.m; })) { st.m = avail[0][0]; st.s = 'over'; }
    avail.forEach(function (m) { h += '<option value="' + m[0] + '"' + (st.m === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; });
    h += '</select></label>';
    var isAH = st.m.indexOf('_ah') > 0, is1x2 = st.m === 'g_1x2';
    if (!is1x2) h += '<label class="f"><span>' + (isAH ? '主队让球（如 -1.5、+0.75）' : '盘口（如 9.5、10、10.25）') + '</span><input id="' + prefix + '-l" class="num" type="number" step="0.25" inputmode="decimal" value="' + esc(st.l) + '"></label>';
    else h += '<div></div>';
    h += '<label class="f"><span>方向</span><select id="' + prefix + '-s">';
    var sides = is1x2 ? [['h', '主胜 ' + names[0]], ['d', '平局'], ['a', '客胜 ' + names[1]]] :
      (isAH ? [['over', '主队 ' + names[0]], ['under', '客队 ' + names[1]]] : [['over', '大'], ['under', '小']]);
    var cur = st.s; if (!sides.some(function (s) { return s[0] === cur; })) cur = sides[0][0];
    sides.forEach(function (s) { h += '<option value="' + s[0] + '"' + (cur === s[0] ? ' selected' : '') + '>' + esc(s[1]) + '</option>'; });
    h += '</select></label><label class="f"><span>庄家赔率（欧赔）</span><input id="' + prefix + '-o" class="num" type="number" step="0.01" inputmode="decimal" placeholder="例如 1.90" value="' + esc(st.o) + '"></label></div>';
    h += '<div id="' + prefix + '-out"></div>';
    return h;
  }
  function evCompute(st, ctx) {
    var m = st.m, line = num(st.l), odds = num(st.o), r = null, side = st.s;
    if (m === 'g_1x2') {
      var p = side === 'h' ? ctx.gm.pH : (side === 'd' ? ctx.gm.pD : ctx.gm.pA);
      r = { win: p, push: 0, lose: 1 - p, fair: 1 / p, ev: odds ? p * odds - 1 : null };
    } else {
      if (line === null) return null;
      if (Math.abs(line * 4 - Math.round(line * 4)) > 1e-6) return { bad: '盘口只支持 0.25 的倍数' };
      var isAH = m.indexOf('_ah') > 0;
      if (side !== 'over' && side !== 'under') side = 'over';
      var pmf, off, L = line;
      if (m === 'ftc_ou') { pmf = ctx.ft.tot; off = ctx.ft.cur[0] + ctx.ft.cur[1]; }
      else if (m === 'htc_ou') { pmf = ctx.ht.tot; off = ctx.ht.cur[0] + ctx.ht.cur[1]; }
      else if (m === 'hc_ou') { pmf = ctx.ft.home; off = ctx.ft.cur[0]; }
      else if (m === 'ac_ou') { pmf = ctx.ft.away; off = ctx.ft.cur[1]; }
      else if (m === 'ftc_ah') { pmf = ctx.ft.dif; off = ctx.ft.difOff + ctx.ft.cur[0] - ctx.ft.cur[1]; L = -line; }
      else if (m === 'htc_ah') { pmf = ctx.ht.dif; off = ctx.ht.difOff + ctx.ht.cur[0] - ctx.ht.cur[1]; L = -line; }
      else if (m === 'g_ou') { pmf = ctx.gm.tot; off = 0; }
      else if (m === 'g_ah') { pmf = ctx.gm.dif; off = ctx.gm.difOff; L = -line; }
      if (!pmf) return null;
      r = Core.betStats(pmf, off, side, L, odds);
    }
    return r;
  }
  function evRender(prefix, st, ctx) {
    var out = $(prefix + '-out');
    if (!out) return;
    var r = evCompute(st, ctx);
    if (!r) { out.innerHTML = '<p class="hint">填好盘口后显示模型概率。</p>'; return; }
    if (r.bad) { out.innerHTML = '<p class="err">' + r.bad + '</p>'; return; }
    var h = '<div class="ev-out"><div class="kpi"><div class="k">赢盘概率</div><div class="v num">' + pct(r.win) + '</div><div class="s">' +
      (r.push > 0.0005 ? '走水 ' + pct(r.push) : '输 ' + pct(r.lose)) + '</div></div>' +
      '<div class="kpi"><div class="k">公平赔率</div><div class="v num">' + fo(r.fair) + '</div><div class="s">高于它才有价值</div></div>' +
      '<div class="kpi"><div class="k">期望收益</div><div class="v num">' + (r.ev === null ? '—' : ((r.ev >= 0 ? '+' : '') + (r.ev * 100).toFixed(1) + '%')) + '</div><div class="s">' +
      (r.ev === null ? '填赔率后计算' : (r.ev > 0 ? '<span class="pill pos">正期望</span>' : '<span class="pill neg">负期望</span>')) + '</div></div></div>';
    if (r.ev !== null && r.ev > 0.08) h += '<p class="warn">期望收益超过 8%：先确认盘口和赔率没填错。模型对单场仍有很大不确定性。</p>';
    out.innerHTML = h;
  }
  function bindEv(prefix, st, ctxFn) {
    ['m', 'l', 's', 'o'].forEach(function (k) {
      var el = $(prefix + '-' + k);
      if (!el) return;
      var ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, function () {
        st[k] = el.value; save();
        if (k === 'm') { st.s = st.m === 'g_1x2' ? 'h' : 'over'; renderAll(); }
        else evRender(prefix, st, ctxFn());
      });
    });
  }

  /* ---------------- pre-match view ---------------- */
  function preCtx() {
    return { ft: PM.cornersFT, ht: PM.cornersHT, gm: Core.goalsMarkets(PM.goalsFT), ghm: Core.goalsMarkets(PM.goalsHT) };
  }
  function renderPre() {
    var names = teamNames();
    if (!PM) {
      $('pre-kpi').innerHTML = '<p class="err">' + esc(PMerr || '请选择比赛') + '</p>';
      $('pre-corners').innerHTML = ''; $('pre-goals').innerHTML = ''; $('pre-ev').innerHTML = '';
      return;
    }
    var ctx = preCtx(), ft = PM.cornersFT, ht = PM.cornersHT;
    var tot = PM.mh + PM.ma, tot1 = PM.mh1 + PM.ma1;
    var src = S.setup.other ? '按赔率 + 联赛场均角球' : (PM.src === 'odds' ? '按赔率 + 球队数据' : '只按球队数据（填赔率更准）');
    var share = PM.mh / tot;
    var h = '<h2>预测 <span class="sub">· ' + src + '</span></h2><div class="kpis">' +
      '<div class="kpi"><div class="k">全场角球</div><div class="v num">' + f1(tot) + '</div><div class="s"><span class="h">' + f1(PM.mh) + '</span> : <span class="a">' + f1(PM.ma) + '</span></div></div>' +
      '<div class="kpi"><div class="k">半场角球</div><div class="v num">' + f1(tot1) + '</div><div class="s"><span class="h">' + f1(PM.mh1) + '</span> : <span class="a">' + f1(PM.ma1) + '</span></div></div>' +
      '<div class="kpi"><div class="k">预期进球</div><div class="v num">' + f1(ctx.gm.eh + ctx.gm.ea) + '</div><div class="s"><span class="h">' + f2(ctx.gm.eh) + '</span> : <span class="a">' + f2(ctx.gm.ea) + '</span></div></div>' +
      '</div><div class="split"><span class="h">' + esc(names[0]) + '</span><div class="bar" title="角球占比"><i style="width:' + (share * 100).toFixed(1) + '%"></i></div><span class="a">' + esc(names[1]) + '</span></div>';
    $('pre-kpi').innerHTML = h;
    var c = '<h2>角球</h2>';
    c += ouTable(ft.tot, 0, centerLines(tot, 6, 1, true), '全场角球 大小', tot);
    c += '<div class="dist">' + distChart(ft.tot, 0, null) + '</div>';
    c += ouTable(ht.tot, 0, centerLines(tot1, 4, 1, true), '半场角球 大小', tot1);
    var md = PM.mh - PM.ma, md1 = PM.mh1 - PM.ma1;
    var hl = centerLines(-md, 5, 1, true, true);
    c += ahTable(ft.dif, ft.difOff, hl, '全场角球 让球', names, md);
    c += ahTable(ht.dif, ht.difOff, centerLines(-md1, 3, 1, true, true), '半场角球 让球', names, md1);
    c += ouTable(ft.home, 0, centerLines(PM.mh, 3, 1, true), '主队角球 大小（' + esc(names[0]) + '）', PM.mh);
    c += ouTable(ft.away, 0, centerLines(PM.ma, 3, 1, true), '客队角球 大小（' + esc(names[1]) + '）', PM.ma);
    $('pre-corners').innerHTML = c;
    $('pre-goals').innerHTML = '<h2>进球</h2>' + goalsBlock(ctx.gm, ctx.ghm, names, false);
    $('pre-ev').innerHTML = evPanel('pev', S.ev, { ht: true }, names);
    bindEv('pev', S.ev, preCtx);
    evRender('pev', S.ev, preCtx());
  }

  /* ---------------- live view ---------------- */
  function liveMinute() {
    var L = S.live;
    if (L.ht) return 45;
    var m = L.baseMin;
    if (L.running && L.baseTs) m += Math.floor((Date.now() - L.baseTs) / 60000);
    return Math.max(L.per === 2 ? 45 : 0, Math.min(m, 130));
  }
  var LV = null;
  function computeLive() {
    LV = null;
    if (!PM) return;
    var L = S.live;
    var s = { per: L.per, ht: L.ht, minute: liveMinute(), added: L.added, added1: L.added1, gh: L.gh, ga: L.ga, ch: L.ch, ca: L.ca, rh: L.rh, ra: L.ra };
    try { LV = Core.live(B, PM, s); } catch (e) { LV = null; }
  }
  function liveCtx() {
    return { ft: LV.cornersFT, ht: LV.cornersHT || null, gm: Core.goalsMarkets(LV.goalsFT), ghm: LV.goalsHT ? Core.goalsMarkets(LV.goalsHT) : null };
  }
  function renderLiveHeader() {
    var L = S.live, names = teamNames(), m = liveMinute();
    $('lv-hn').textContent = names[0]; $('lv-an').textContent = names[1];
    $('lv-gh').textContent = L.gh; $('lv-ga').textContent = L.ga;
    ['gh', 'ga', 'ch', 'ca', 'rh', 'ra'].forEach(function (k) { $('c-' + k).textContent = L[k]; });
    var lab = L.ht ? '中场' : (m >= (L.per === 1 ? 45 : 90) ? (L.per === 1 ? 45 : 90) + '+' + (m - (L.per === 1 ? 45 : 90)) : String(m));
    $('lv-min').textContent = L.ht ? 'HT' : lab + "'";
    $('lv-per').textContent = L.ht ? '中场休息' : (L.per === 1 ? '上半场' : '下半场');
    $('lv-run').textContent = L.running ? '计时中' : '未计时';
    $('ck-run').textContent = L.running ? '停止计时' : (L.ht ? '下半场开球' : '开始计时');
    $('ck-half').textContent = L.per === 1 && !L.ht ? '中场' : (L.ht ? '回到上半场' : '回到中场');
    $('lv-added').value = L.added;
    $('lv-ht-note').textContent = L.per === 2 || L.ht ? '下半场的角球照常往上加；半场盘已结算，不再显示。' : '';
  }
  function renderLive() {
    renderLiveHeader();
    if (!PM) {
      $('live-kpi').innerHTML = '<p class="err">先在「赛前」选好比赛。</p>';
      $('live-corners').innerHTML = $('live-goals').innerHTML = $('live-ev').innerHTML = '';
      return;
    }
    computeLive();
    if (!LV) { $('live-kpi').innerHTML = '<p class="err">滚球计算失败，请检查输入。</p>'; return; }
    var names = teamNames(), ctx = liveCtx(), L = S.live, ft = LV.cornersFT;
    var cur = L.ch + L.ca, remT = LV.remFT[0] + LV.remFT[1], finalE = cur + remT;
    var h = '<h2>滚球预测 <span class="sub">· 第 ' + LV.tau + ' 分钟起</span></h2><div class="kpis">' +
      '<div class="kpi"><div class="k">全场预计</div><div class="v num">' + f1(finalE) + '</div><div class="s">已有 ' + cur + '，剩余 ' + f1(remT) + '</div></div>' +
      '<div class="kpi"><div class="k">剩余角球</div><div class="v sm num"><span class="h">' + f1(LV.remFT[0]) + '</span><span style="color:var(--muted);font-size:20px"> : </span><span class="a">' + f1(LV.remFT[1]) + '</span></div><div class="s">主 : 客</div></div>';
    if (LV.nextCorner) {
      h += '<div class="kpi"><div class="k">下一个角球 %</div><div class="v sm num"><span class="h">' + Math.round(LV.nextCorner[0] * 100) + '</span><span style="color:var(--muted);font-size:20px">:</span><span class="a">' + Math.round(LV.nextCorner[1] * 100) + '</span></div><div class="s">10分钟内有角球 ' + pct(1 - Math.exp(-(LV.next10[0] + LV.next10[1]))) + '</div></div>';
    }
    h += '</div>';
    if (LV.remHT) {
      var htE = cur + LV.remHT[0] + LV.remHT[1];
      h += '<p class="hint">半场角球预计 <b class="num" style="font-size:16px">' + f1(htE) + '</b>（剩余 ' + f1(LV.remHT[0] + LV.remHT[1]) + '）</p>';
    }
    var adj = Math.max(Math.abs(LV.mult[0] - 1), Math.abs(LV.mult[1] - 1));
    if (adj > 0.005) h += '<p class="hint">按已有角球对剩余速率的修正：主 ×' + LV.mult[0].toFixed(2) + '，客 ×' + LV.mult[1].toFixed(2) + '（影响很小，主要由时间和比分决定）</p>';
    $('live-kpi').innerHTML = h;
    var c = '<h2>角球（含已有 ' + cur + ' 个）</h2>';
    c += ouTable(ft.tot, cur, centerLines(finalE, 6, 1, true).filter(function (x) { return x > cur; }), '全场角球 大小', finalE);
    c += '<div class="dist">' + distChart(ft.tot, cur, null) + '</div>';
    if (LV.cornersHT) {
      var htm = cur + LV.remHT[0] + LV.remHT[1];
      c += ouTable(LV.cornersHT.tot, cur, centerLines(htm, 4, 1, true).filter(function (x) { return x > cur; }), '半场角球 大小', htm);
    }
    var md = (L.ch - L.ca) + LV.remFT[0] - LV.remFT[1];
    c += ahTable(ft.dif, ft.difOff + L.ch - L.ca, centerLines(-md, 5, 1, true, true), '全场角球 让球（按全场总数结算）', names, md);
    if (LV.cornersHT) {
      var md1 = (L.ch - L.ca) + LV.remHT[0] - LV.remHT[1];
      c += ahTable(LV.cornersHT.dif, LV.cornersHT.difOff + L.ch - L.ca, centerLines(-md1, 3, 1, true, true), '半场角球 让球', names, md1);
    }
    $('live-corners').innerHTML = c;
    var g = '<h2>进球</h2>';
    if (LV.next) g += '<p class="hint" style="margin-top:0">下一个进球：<span class="h">' + esc(names[0]) + ' ' + pct(LV.next[0]) + '</span> · <span class="a">' + esc(names[1]) + ' ' + pct(LV.next[1]) + '</span> · 不再进球 ' + pct(LV.next[2]) + '</p>';
    g += goalsBlock(ctx.gm, ctx.ghm, names, true);
    $('live-goals').innerHTML = g;
    if (!S.lev.l) S.lev.l = String(Math.floor(finalE) + 0.5);
    $('live-ev').innerHTML = evPanel('lev', S.lev, { ht: !!LV.cornersHT }, names);
    bindEv('lev', S.lev, liveCtx);
    evRender('lev', S.lev, liveCtx());
  }

  /* ---------------- about ---------------- */
  function renderAbout() {
    var n = B.leagues.reduce(function (a, L) { return a + L.teams.length; }, 0);
    var up = S.updatedAt ? '已联网更新到 ' + S.extraUntil + '（' + S.updatedAt + ' 更新，+' + S.extra.length + ' 场）' : '内置数据截至 ' + B.data_until;
    $('about-data').innerHTML = '<h2>数据</h2><p>' + B.leagues.length + ' 个联赛、' + n + ' 支球队。' + esc(up) + '。</p>' +
      '<p class="small">每场比赛后球队评分会自动更新。点下面的按钮会从公开数据源下载本赛季最新赛果（角球、射门、进球），在本机重新计算评分。</p>' +
      '<div class="row-btns"><button class="btn pri" id="upd-btn">更新最新赛果</button><button class="btn" id="upd-clear"' + (S.extra.length ? '' : ' disabled') + '>恢复内置数据</button></div>' +
      '<p class="hint" id="upd-msg"></p>';
    $('upd-btn').addEventListener('click', function () { updateData(false); });
    $('upd-clear').addEventListener('click', function () { S.extra = []; S.extraUntil = null; S.updatedAt = null; ST = Core.buildRatings(B, S.extra); save(); computePre(); renderAll(); });
    $('about-text').innerHTML = ABOUT_HTML;
  }

  /* ---------------- online update (works when the page is hosted on a normal website) ---------------- */
  function parseCSV(text) {
    var rows = [], i = 0, f = '', row = [], q = false;
    for (; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += ch;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function updateData(silent) {
    var msgEl = $('upd-msg'), btnEl = $('upd-btn');
    var msg = { set textContent(v) { if (!silent && msgEl) msgEl.textContent = v; } };
    var btn = { set disabled(v) { if (btnEl) btnEl.disabled = v; } };
    if (!window.fetch || !window.Promise) { msg.textContent = '这个浏览器不支持联网更新。'; return; }
    S.lastAuto = Date.now(); save();
    btn.disabled = true; msg.textContent = '正在下载…';
    var until = parseInt(B.data_until.replace(/-/g, ''), 10);
    var bases = ['https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/', 'https://cdn.jsdelivr.net/gh/oladeeayo/open-matchday@master/data/'];
    var jobs = B.leagues.map(function (L, li) {
      function tryFetch(k) {
        return fetch(bases[k] + L.om + '/results_2627.csv', { cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status); return r.text();
        }).catch(function (e) { if (k + 1 < bases.length) return tryFetch(k + 1); throw e; });
      }
      return tryFetch(0).then(function (txt) { return { li: li, txt: txt }; }, function () { return { li: li, txt: null }; });
    });
    Promise.all(jobs).then(function (res) {
      var extra = [], failed = 0, unknown = 0, last = until;
      res.forEach(function (r) {
        if (!r.txt) { failed++; return; }
        var rows = parseCSV(r.txt), hd = rows[0] || [], ix = {};
        hd.forEach(function (c, i) { ix[c.trim()] = i; });
        var need = ['date', 'home', 'away', 'ft_home', 'ft_away'];
        for (var q = 0; q < need.length; q++) if (ix[need[q]] === undefined) { failed++; return; }
        var L = B.leagues[r.li], map = B.om_map[L.code] || {}, tix = {};
        L.teams.forEach(function (t, i) { tix[t.n] = i; });
        for (var k = 1; k < rows.length; k++) {
          var w = rows[k]; if (w.length < hd.length - 1) continue;
          var d = parseInt(String(w[ix.date]).replace(/-/g, ''), 10);
          if (!(d > until)) continue;
          var hn = map[w[ix.home]] || w[ix.home], an = map[w[ix.away]] || w[ix.away];
          if (tix[hn] === undefined || tix[an] === undefined) { unknown++; continue; }
          var g = function (c) { var v = ix[c] === undefined ? '' : String(w[ix[c]]).trim(); var x = parseInt(v, 10); return isFinite(x) ? x : -1; };
          var fh = g('ft_home'), fa = g('ft_away'); if (fh < 0 || fa < 0) continue;
          extra.push([r.li, d, tix[hn], tix[an], g('home_corners'), g('away_corners'), g('home_shots'), g('away_shots'), g('home_target'), g('away_target'), fh, fa, L.code, hn]);
          if (d > last) last = d;
        }
      });
      extra.sort(function (a, b) { return a[1] - b[1] || (a[12] < b[12] ? -1 : a[12] > b[12] ? 1 : 0) || (a[13] < b[13] ? -1 : a[13] > b[13] ? 1 : 0); });
      extra = extra.map(function (e) { return e.slice(0, 12); });
      btn.disabled = false;
      if (failed === B.leagues.length) { msg.textContent = '下载失败：当前环境不允许联网读取数据（在 Claude 页面里会被拦截；部署到自己的网站后可用）。'; return; }
      if (silent && extra.length <= S.extra.length) return;
      S.extra = extra; S.updatedAt = new Date().toLocaleDateString('zh-CN');
      var ls = String(last); S.extraUntil = ls.slice(0, 4) + '-' + ls.slice(4, 6) + '-' + ls.slice(6, 8);
      ST = Core.buildRatings(B, S.extra); save(); computePre();
      var txt = '完成：新增 ' + extra.length + ' 场' + (failed ? '，' + failed + ' 个联赛下载失败' : '') + (unknown ? '，' + unknown + ' 场队名无法识别已跳过' : '') + '。';
      renderAll();
      if (!silent && $('upd-msg')) $('upd-msg').textContent = txt;
    });
  }


  /* ---------------- layout: one column on phones, two on tablets ---------------- */
  var ORDER = {
    pre: { one: ['p-match', 'p-odds', 'pre-kpi', 'pre-corners', 'pre-goals', 'pre-ev', 'p-tolive'],
           L: ['p-match', 'p-odds', 'pre-kpi', 'pre-goals'], R: ['pre-corners', 'pre-ev', 'p-tolive'] },
    live: { one: ['lv-boardp', 'lv-counters', 'live-kpi', 'live-corners', 'live-goals', 'live-ev', 'lv-resetbox'],
            L: ['lv-boardp', 'lv-counters', 'live-kpi', 'lv-resetbox'], R: ['live-corners', 'live-goals', 'live-ev'] },
    about: { one: ['about-data', 'about-set', 'about-text'], L: ['about-data', 'about-set'], R: ['about-text'] }
  };
  var wideNow = null;
  function layout() {
    var wide = (window.innerWidth || document.documentElement.clientWidth) >= 740;
    if (wide === wideNow) return;
    wideNow = wide;
    ['pre', 'live', 'about'].forEach(function (v) {
      var L = $(v + '-L'), R = $(v + '-R'), o = ORDER[v];
      (wide ? o.L : o.one).forEach(function (id) { L.appendChild($(id)); });
      if (wide) o.R.forEach(function (id) { R.appendChild($(id)); });
      R.hidden = !wide;
      $('v-' + v).className = 'cols' + (v === 'about' ? ' about' : '') + (wide ? ' two' : '');
    });
  }
  function applyView() {
    var h = (parseInt(S.view.piph, 10) || 200) + 'px', r = document.documentElement.style;
    r.setProperty('--pip-top', S.view.pip === 'top' ? h : '0px');
    r.setProperty('--pip-bot', S.view.pip === 'bot' ? h : '0px');
  }

  /* ---------------- wiring ---------------- */
  function setTab(t) {
    S.tab = t; save();
    ['pre', 'live', 'about'].forEach(function (k) {
      $('v-' + k).hidden = k !== t;
      $('tab-' + k).setAttribute('aria-selected', k === t ? 'true' : 'false');
    });
    renderAll();
    try { window.scrollTo(0, 0); } catch (e) { }
  }
  function renderAll() {
    $('datechip').textContent = '数据截至 ' + (S.extraUntil || B.data_until);
    if (S.tab === 'pre') renderPre();
    else if (S.tab === 'live') renderLive();
    else renderAbout();
  }
  var tmr = null;
  function recalc() { if (tmr) clearTimeout(tmr); tmr = setTimeout(function () { computePre(); renderAll(); }, 120); }

  $('tab-pre').addEventListener('click', function () { setTab('pre'); });
  $('tab-live').addEventListener('click', function () { setTab('live'); });
  $('tab-about').addEventListener('click', function () { setTab('about'); });
  $('sel-league').addEventListener('change', function () {
    var v = this.value;
    if (v === 'other') { S.setup.other = true; }
    else { S.setup.other = false; if (+v !== S.setup.li) { S.setup.li = +v; S.setup.hi = 0; S.setup.ai = 1; } fillTeams(); }
    $('team-pick').hidden = S.setup.other; $('other-box').hidden = !S.setup.other;
    freshLive(); save(); recalc();
  });
  function freshLive() {
    S.live = { per: 1, ht: false, baseMin: 0, baseTs: 0, running: false, added: '', added1: '', gh: 0, ga: 0, ch: 0, ca: 0, rh: 0, ra: 0 };
    S.lev.l = '';
  }
  $('sel-home').addEventListener('change', function () { S.setup.hi = +this.value; freshLive(); save(); recalc(); });
  $('sel-away').addEventListener('change', function () { S.setup.ai = +this.value; freshLive(); save(); recalc(); });
  [['o-home', 'oh'], ['o-away', 'oa'], ['o-avg', 'avg'], ['o-share', 'share']].forEach(function (p) {
    var el = $(p[0]); el.value = S.setup[p[1]];
    el.addEventListener('input', function () { S.setup[p[1]] = el.value; save(); recalc(); });
  });
  [['od-h', 'h'], ['od-d', 'd'], ['od-a', 'a'], ['od-l', 'l'], ['od-o', 'o'], ['od-u', 'u']].forEach(function (p) {
    var el = $(p[0]); el.value = S.odds[p[1]];
    el.addEventListener('input', function () { S.odds[p[1]] = el.value; save(); recalc(); });
  });
  $('to-live').addEventListener('click', function () { setTab('live'); });

  // live controls
  Array.prototype.forEach.call(document.querySelectorAll('.pm button'), function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-k'), d = +b.getAttribute('data-d');
      S.live[k] = Math.max(0, Math.min(k.charAt(0) === 'r' ? 4 : 30, S.live[k] + d));
      save(); renderLive();
    });
  });
  function freezeClock() { var L = S.live; L.baseMin = liveMinute(); L.baseTs = Date.now(); }
  $('ck-m1').addEventListener('click', function () { freezeClock(); S.live.baseMin = Math.max(S.live.per === 2 ? 45 : 0, S.live.baseMin - 1); save(); renderLive(); });
  $('ck-p1').addEventListener('click', function () { freezeClock(); S.live.baseMin = Math.min(130, S.live.baseMin + 1); save(); renderLive(); });
  $('ck-run').addEventListener('click', function () {
    var L = S.live;
    if (L.ht) { L.ht = false; L.per = 2; L.baseMin = 45; L.baseTs = Date.now(); L.running = true; L.added1 = L.added; L.added = ''; }
    else if (L.running) { freezeClock(); L.running = false; }
    else { L.baseTs = Date.now(); L.running = true; }
    save(); renderLive();
  });
  $('ck-half').addEventListener('click', function () {
    var L = S.live;
    if (L.per === 1 && !L.ht) { L.ht = true; L.running = false; L.baseMin = 45; }
    else if (L.ht) { L.ht = false; L.per = 1; L.baseMin = 45; L.running = false; }
    else { L.per = 1; L.ht = true; L.running = false; L.baseMin = 45; L.added = L.added1 || ''; }
    save(); renderLive();
  });
  $('lv-setmin').addEventListener('change', function () {
    var v = num(this.value); if (v === null) return;
    var L = S.live; v = Math.round(v);
    // 50' and later is always the second half; 46'-49' keeps the current half (first-half stoppage or early second half)
    L.ht = false; L.per = v >= 50 ? 2 : (v >= 45 ? (L.per === 2 ? 2 : 1) : 1); L.baseMin = v; L.baseTs = Date.now();
    this.value = ''; save(); renderLive();
  });
  $('lv-added').addEventListener('input', function () { S.live.added = this.value; save(); renderLive(); });
  $('lv-reset').addEventListener('click', function () { $('lv-reset-confirm').hidden = false; });
  $('lv-reset-no').addEventListener('click', function () { $('lv-reset-confirm').hidden = true; });
  $('lv-reset-yes').addEventListener('click', function () {
    freshLive(); $('lv-reset-confirm').hidden = true; save(); renderLive();
  });
  setInterval(function () { if (S.tab === 'live' && S.live.running) renderLive(); }, 20000);

  fillLeagues(); fillTeams();
  $('team-pick').hidden = S.setup.other; $('other-box').hidden = !S.setup.other;
  layout(); applyView();
  window.addEventListener('resize', function () { layout(); });
  window.addEventListener('orientationchange', function () { setTimeout(layout, 200); });
  $('set-pip').value = S.view.pip; $('set-piph').value = S.view.piph;
  $('set-pip').addEventListener('change', function () { S.view.pip = this.value; save(); applyView(); });
  $('set-piph').addEventListener('change', function () { S.view.piph = this.value; save(); applyView(); });
  $('app-ver').textContent = '版本 ' + APP_VER + '。数据只存在本机。';
  computePre();
  setTab(S.tab || 'pre');
  // quiet background refresh at most every 12 hours (only works when hosted on a normal website)
  try { if (!S.lastAuto || Date.now() - S.lastAuto > 12 * 3600 * 1000) setTimeout(function () { updateData(true); }, 1500); } catch (e) { }

})();
