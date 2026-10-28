/* 角球进球预测 — UI layer (ES5, no framework) */
(function () {
  'use strict';
  var B = BUNDLE;
  var ABOUT_HTML = /*ABOUT*/'';
  var APP_VER = '/*APPVER*/';
  var LS_KEY = 'corner_goal_ai_v1';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- markets on the board ----------------
     k: ou = over/under a line, ah = handicap (line given for the HOME team), x3 = three outcomes, yn = two outcomes without a line
     g: c corners / g goals; ht: first-half market; st: step the model uses when it suggests a line */
  var MK = {
    ftc_ou: { n: '全场角球 大小', a: '全场大小', k: 'ou', g: 'c', st: 0.5, fb: 9.5 },
    ftc_ah: { n: '全场角球 让球', a: '全场让球', k: 'ah', g: 'c', st: 0.5, fb: 0 },
    htc_ou: { n: '半场角球 大小', a: '半场大小', k: 'ou', g: 'c', ht: 1, st: 0.5, fb: 4.5 },
    htc_ah: { n: '半场角球 让球', a: '半场让球', k: 'ah', g: 'c', ht: 1, st: 0.5, fb: 0 },
    hc_ou: { n: '主队角球 大小', a: '主队角球', k: 'ou', g: 'c', st: 0.5, fb: 4.5 },
    ac_ou: { n: '客队角球 大小', a: '客队角球', k: 'ou', g: 'c', st: 0.5, fb: 4.5 },
    ftc_x: { n: '角球独赢', a: '角球独赢', k: 'x3', g: 'c', sides: ['主多', '一样', '客多'] },
    g_ou: { n: '进球 大小', a: '大小', k: 'ou', g: 'g', st: 0.25, fb: 2.5 },
    g_ah: { n: '进球 让球', a: '让球', k: 'ah', g: 'g', st: 0.25, fb: 0 },
    g_1x2: { n: '胜平负', a: '胜平负', k: 'x3', g: 'g', sides: ['主胜', '平', '客胜'] },
    gh_ou: { n: '半场进球 大小', a: '半场大小', k: 'ou', g: 'g', ht: 1, st: 0.25, fb: 1 },
    gh_ah: { n: '半场进球 让球', a: '半场让球', k: 'ah', g: 'g', ht: 1, st: 0.25, fb: 0 },
    gh_1x2: { n: '半场胜平负', a: '半场胜平负', k: 'x3', g: 'g', ht: 1, sides: ['主胜', '平', '客胜'] },
    btts: { n: '双方进球', a: '双方进球', k: 'yn', g: 'g', sides: ['是', '否'] }
  };
  var ADD = { c: ['ftc_ou', 'ftc_ah', 'htc_ou', 'htc_ah', 'hc_ou', 'ac_ou', 'ftc_x'], g: ['g_ou', 'g_ah', 'g_1x2', 'gh_ou', 'gh_ah', 'gh_1x2', 'btts'] };
  var TPL = { pre: ['g_1x2', 'g_ou', 'ftc_ou', 'ftc_ah', 'htc_ou', 'htc_ah'], live: ['ftc_ou', 'ftc_ah', 'htc_ou', 'htc_ah'] };
  function hasLine(m) { var k = MK[m].k; return k === 'ou' || k === 'ah'; }

  /* ---------------- state ---------------- */
  var S = {
    tab: 'pre',
    setup: { li: 0, hi: 0, ai: 1, other: false, oh: '', oa: '', avg: '10.0', share: '54' },
    live: { per: 1, ht: false, baseMin: 0, baseTs: 0, running: false, added: '', added1: '',
            gh: 0, ga: 0, ch: 0, ca: 0, rh: 0, ra: 0 },
    boards: {}, lbMode: 'now', recent: [], rid: 1,
    extra: [], extraUntil: null, updatedAt: null,
    view: { pip: 'none', piph: '200' }
  };
  var legacyOdds = null;
  function cleanRows(rows) {
    if (!rows || !rows.filter) return null;
    return rows.filter(function (r) {
      if (!r || !MK[r.m] || !r.o || !r.o.length) return false;
      var n = MK[r.m].k === 'x3' ? 3 : 2;
      while (r.o.length < n) r.o.push('');
      r.o = r.o.slice(0, n).map(function (x) { return oddsVal(x) ? oddsVal(x).toFixed(2) : ''; });
      if (hasLine(r.m)) { if (typeof r.l !== 'number' || !isFinite(r.l)) { r.l = null; r.auto = true; } else r.l = q4(r.l); }
      else { r.l = null; r.auto = false; }
      if (typeof r.id !== 'number') r.id = S.rid++;
      return true;
    });
  }
  function load() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      ['setup', 'live', 'view'].forEach(function (k) { if (o[k]) for (var kk in o[k]) S[k][kk] = o[k][kk]; });
      if (o.rid > 0) S.rid = o.rid;
      if (o.boards && typeof o.boards === 'object') {
        for (var k in o.boards) {
          var b = o.boards[k], pre = b && cleanRows(b.pre), lv = b && cleanRows(b.live);
          if (pre && lv) S.boards[k] = { pre: pre, live: lv, t: b.t || 0 };
        }
      } else if (o.odds) legacyOdds = o.odds;
      if (o.lbMode === 'all') S.lbMode = 'all';
      if (o.recent && o.recent.length) S.recent = o.recent.filter(function (x) { return !!oddsVal(x); }).slice(0, 8);
      if (o.extra && o.extraUntil && o.dataUntil === B.data_until) { S.extra = o.extra; S.extraUntil = o.extraUntil; S.updatedAt = o.updatedAt; }
      if (o.tab) S.tab = o.tab;
      if (o.lastAuto) S.lastAuto = o.lastAuto;
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  function save() {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify({ setup: S.setup, live: S.live, view: S.view, boards: S.boards, lbMode: S.lbMode,
        recent: S.recent, rid: S.rid, extra: S.extra, extraUntil: S.extraUntil, updatedAt: S.updatedAt, dataUntil: B.data_until,
        tab: S.tab, lastAuto: S.lastAuto || 0 }));
    } catch (e) { /* ignore */ }
  }

  /* ---------------- helpers ---------------- */
  function pct(p) { return (p * 100).toFixed(1) + '%'; }
  function fo(x) { return !isFinite(x) || x > 99 ? '—' : x.toFixed(2); }
  function f1(x) { return x.toFixed(1); }
  function f2(x) { return x.toFixed(2); }
  function num(v) { var x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function teamLabel(t) { return t.z ? t.z + ' ' + t.n : t.n; }
  function teamShort(t) { return t.z ? t.z : t.n; }
  function meanOf(pmf, off) { var s = 0; for (var i = 0; i < pmf.length; i++) s += (i + off) * pmf[i]; return s; }
  function sgnPct(x) { return (x > 0 ? '+' : (x < 0 ? '−' : '')) + Math.abs(x * 100).toFixed(1) + '%'; }
  /* lines: quarter lines are written the Asian way, 3.25 -> 3/3.5, -0.75 -> -0.5/1 */
  function q4(x) { return Math.round(x * 4) / 4; }
  function nstr(x) { return String(Math.round(x * 100) / 100); }
  function abs4(x) {
    x = Math.abs(q4(x));
    var fr = x - Math.floor(x);
    return (Math.abs(fr - 0.25) < 1e-9 || Math.abs(fr - 0.75) < 1e-9) ? nstr(x - 0.25) + '/' + nstr(x + 0.25) : nstr(x);
  }
  function totAB(x) { return abs4(x); }
  function hcAB(h) { h = q4(h); return h === 0 ? '0' : (h > 0 ? '+' : '−') + abs4(h); }
  /* odds: decimal (European). The keypad accepts 185 = 1.85, 19 = 1.9, 2 = 2.00, or a typed point (11. = 11) */
  function oddsVal(s) {
    if (s === '' || s === null || s === undefined) return null;
    var x = parseFloat(String(s).replace(',', '.'));
    return isFinite(x) && x >= 1.01 && x <= 50 ? x : null;
  }
  function bufVal(b) {
    if (!b) return null;
    if (b.indexOf('.') >= 0) { var x = parseFloat(b); return isFinite(x) ? x : null; }
    return b.length === 1 ? +b : +(b.charAt(0) + '.' + b.slice(1));
  }
  function bufShow(b) { if (!b) return ''; if (b.indexOf('.') >= 0) return b; return b.length === 1 ? b : b.charAt(0) + '.' + b.slice(1); }
  function closestAttr(el, attr, stop) {
    while (el && el !== stop && el.nodeType === 1) { if (el.getAttribute(attr) !== null) return el; el = el.parentNode; }
    return null;
  }

  /* ---------------- boards (one per match, kept on this device) ---------------- */
  function newRow(m, l) {
    var n = MK[m].k === 'x3' ? 3 : 2, o = [];
    for (var i = 0; i < n; i++) o.push('');
    var withLine = hasLine(m), given = typeof l === 'number' && isFinite(l);
    return { id: S.rid++, m: m, l: withLine && given ? q4(l) : null, auto: withLine && !given, o: o, ts: 0 };
  }
  function tmpl(kind) { return TPL[kind].map(function (m) { return newRow(m); }); }
  function mkey() { return S.setup.other ? 'other' : S.setup.li + ':' + S.setup.hi + ':' + S.setup.ai; }
  function rowsHaveOdds(rows) { return rows.some(function (r) { return r.o.some(function (x) { return !!x; }); }); }
  function board() {
    var k = mkey(), b = S.boards[k];
    if (!b) { b = S.boards[k] = { pre: tmpl('pre'), live: tmpl('live'), t: Date.now() }; prune(); }
    return b;
  }
  function prune() {
    var ks = Object.keys(S.boards), cur = mkey();
    if (ks.length <= 12) return;
    function score(k) { var b = S.boards[k]; return (k === cur ? 4 : 0) + (rowsHaveOdds(b.pre) || rowsHaveOdds(b.live) ? 2 : 0); }
    ks.sort(function (a, b) { return score(b) - score(a) || (S.boards[b].t || 0) - (S.boards[a].t || 0); });
    ks.slice(12).forEach(function (k) { delete S.boards[k]; });
  }
  function findRow(kind, id) { var rows = board()[kind]; for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i]; return null; }
  function rowIndex(rows, id) { for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return i; return -1; }
  function pushRecent(v) {
    S.recent = [v].concat(S.recent.filter(function (x) { return x !== v; })).slice(0, 8);
  }
  load();
  var ST = Core.buildRatings(B, S.extra);

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
  // an older version kept the odds in their own panel: move them onto this match's board once
  if (legacyOdds) {
    var lb = board(), lo = legacyOdds;
    if (oddsVal(lo.h) && oddsVal(lo.d) && oddsVal(lo.a)) lb.pre[0].o = [oddsVal(lo.h).toFixed(2), oddsVal(lo.d).toFixed(2), oddsVal(lo.a).toFixed(2)];
    if (num(lo.l) !== null && oddsVal(lo.o) && oddsVal(lo.u)) { lb.pre[1].l = q4(num(lo.l)); lb.pre[1].auto = false; lb.pre[1].o = [oddsVal(lo.o).toFixed(2), oddsVal(lo.u).toFixed(2)]; }
    legacyOdds = null;
  }

  /* ---------------- calibration: 1X2 + the main goals line from the board feed the model ---------------- */
  function readOdds() {
    var rows = board().pre, x = null, ou = null, best = 9, ids = {};
    rows.forEach(function (r) {
      if (r.m === 'g_1x2' && !x) {
        var a = r.o.map(oddsVal);
        if (a[0] && a[1] && a[2]) x = { r: r, o: a };
      } else if (r.m === 'g_ou' && r.l !== null) {
        var o1 = oddsVal(r.o[0]), o2 = oddsVal(r.o[1]);
        if (o1 && o2) { var d = Math.abs(1 / o1 - 1 / o2); if (d < best - 1e-12) { best = d; ou = { r: r, o: [o1, o2] }; } }
      }
    });
    if (!x) return { odds: null, ids: ids, note: ou ? '进球大小要和胜平负一起填，才会用来校准模型。' : '' };
    ids[x.r.id] = 1;
    if (ou) ids[ou.r.id] = 1;
    var marg = 1 / x.o[0] + 1 / x.o[1] + 1 / x.o[2] - 1;
    var note = '已用胜平负' + (ou ? '和进球大小 ' + totAB(ou.r.l) : '') + '校准模型（标“校准用”的这几项，期望约等于抽水，不参与排序）。';
    if (!ou) note += '再填进球大小会更准。';
    if (marg < 0 || marg > 0.2) note += '胜平负抽水 ' + (marg * 100).toFixed(1) + '% 不正常，请检查赔率。';
    return { odds: { h: x.o[0], d: x.o[1], a: x.o[2], ouLine: ou ? ou.r.l : 2.5, over: ou ? ou.o[0] : null, under: ou ? ou.o[1] : null }, ids: ids, note: note };
  }

  /* ---------------- compute ---------------- */
  var PM = null, PMerr = '', CAL = { ids: {}, note: '' }, CALSIG = null;
  function computePre() {
    PMerr = '';
    var ro = readOdds();
    CAL = { ids: ro.ids, note: ro.note }; CALSIG = JSON.stringify(ro.odds);
    try {
      if (S.setup.other) {
        var avg = num(S.setup.avg) || 10, share = (num(S.setup.share) || 54) / 100;
        if (!ro.odds) { PM = null; PMerr = '其他联赛需要在盘口板里填胜平负赔率（最好也填进球大小）。'; return; }
        PM = Core.prematch({ B: B, odds: ro.odds, manual: { avgTotal: avg, homeShare: Math.min(0.7, Math.max(0.3, share)) } });
      } else {
        if (S.setup.hi === S.setup.ai) { PM = null; PMerr = '主队和客队不能相同。'; return; }
        PM = Core.prematch({ B: B, st: ST, li: S.setup.li, hi: S.setup.hi, ai: S.setup.ai, odds: ro.odds });
      }
    } catch (e) { PM = null; PMerr = '计算失败：' + e.message; }
  }

  /* ---------------- market evaluation ---------------- */
  var CTX = { pre: null, live: null };
  function fromNow(ctx) { return ctx.kind === 'live' && S.lbMode !== 'all'; }
  function htOK(m, ctx) { return !MK[m].ht || !!(MK[m].g === 'c' ? ctx.ht : ctx.ghm); }
  // integer random variable for line markets: pmf over k = off + index
  function mdist(m, ctx) {
    if (!htOK(m, ctx)) return null;
    var fn = fromNow(ctx), c;
    switch (m) {
      case 'ftc_ou': c = ctx.ft; return { pmf: c.tot, off: c.cur[0] + c.cur[1] };
      case 'htc_ou': c = ctx.ht; return { pmf: c.tot, off: c.cur[0] + c.cur[1] };
      case 'hc_ou': c = ctx.ft; return { pmf: c.home, off: c.cur[0] };
      case 'ac_ou': c = ctx.ft; return { pmf: c.away, off: c.cur[1] };
      case 'ftc_ah': c = ctx.ft; return { pmf: c.dif, off: c.difOff + (fn ? 0 : c.cur[0] - c.cur[1]) };
      case 'htc_ah': c = ctx.ht; return { pmf: c.dif, off: c.difOff + (fn ? 0 : c.cur[0] - c.cur[1]) };
      case 'ftc_x': c = ctx.ft; return { pmf: c.dif, off: c.difOff + c.cur[0] - c.cur[1] };
      case 'g_ou': return { pmf: ctx.gm.tot, off: 0 };
      case 'g_ah': return { pmf: ctx.gm.dif, off: ctx.gm.difOff - (fn ? ctx.g[0] - ctx.g[1] : 0) };
      case 'gh_ou': return { pmf: ctx.ghm.tot, off: 0 };
      case 'gh_ah': return { pmf: ctx.ghm.dif, off: ctx.ghm.difOff - (fn ? ctx.g[0] - ctx.g[1] : 0) };
    }
    return null;
  }
  function outcomeProbs(m, ctx) {
    if (!htOK(m, ctx)) return null;
    if (m === 'g_1x2') return [ctx.gm.pH, ctx.gm.pD, ctx.gm.pA];
    if (m === 'gh_1x2') return [ctx.ghm.pH, ctx.ghm.pD, ctx.ghm.pA];
    if (m === 'btts') return [ctx.gm.btts, 1 - ctx.gm.btts];
    if (m === 'ftc_x') {
      var d = mdist('ftc_x', ctx), h = 0, e = 0, a = 0;
      for (var i = 0; i < d.pmf.length; i++) { var x = i + d.off; if (x > 0) h += d.pmf[i]; else if (x === 0) e += d.pmf[i]; else a += d.pmf[i]; }
      return [h, e, a];
    }
    return null;
  }
  // per side: { win, push, lose, fair, ev, odds }
  function rowEval(r, ctx) {
    if (!ctx) return null;
    var d = MK[r.m], out = [], s;
    if (d.k === 'ou' || d.k === 'ah') {
      var ds = mdist(r.m, ctx);
      if (!ds || r.l === null) return null;
      var L = d.k === 'ou' ? r.l : -r.l;   // home covers when diff + h > 0, i.e. diff > -h
      for (s = 0; s < 2; s++) {
        var od = oddsVal(r.o[s]), st = Core.betStats(ds.pmf, ds.off, s === 0 ? 'over' : 'under', L, od);
        st.odds = od; out.push(st);
      }
      return out;
    }
    var p = outcomeProbs(r.m, ctx);
    if (!p) return null;
    for (s = 0; s < p.length; s++) {
      var o2 = oddsVal(r.o[s]);
      out.push({ win: p[s], push: 0, lose: 1 - p[s], fair: p[s] > 0 ? 1 / p[s] : Infinity, ev: o2 ? p[s] * o2 - 1 : null, odds: o2 });
    }
    return out;
  }
  // the line where both sides are closest to even money
  function fairLine(r, ctx) {
    var d = MK[r.m], ds = ctx && mdist(r.m, ctx);
    if (!ds) return null;
    var stp = d.st, c = meanOf(ds.pmf, ds.off);
    if (d.k === 'ah') c = -c;
    var best = null, bs = Infinity;
    for (var k = -8; k <= 8; k++) {
      var Lr = q4(Math.round(c / stp) * stp + k * stp);
      if (d.k === 'ou' && Lr < 0.5) continue;
      var L = d.k === 'ou' ? Lr : -Lr;
      var a = Core.betStats(ds.pmf, ds.off, 'over', L), b = Core.betStats(ds.pmf, ds.off, 'under', L);
      if (!isFinite(a.fair) || !isFinite(b.fair)) continue;
      var sc = Math.abs(Math.log(a.fair) - Math.log(b.fair));
      if (sc < bs - 1e-12) { bs = sc; best = Lr; }
    }
    return best;
  }
  function autoLines(kind, ctx) {
    board()[kind].forEach(function (r) {
      if (!hasLine(r.m)) return;
      if (r.auto && !r.o.some(function (x) { return !!x; })) {
        var f = ctx ? fairLine(r, ctx) : null;
        if (f !== null) r.l = f; else if (r.l === null) r.l = MK[r.m].fb;
      } else if (r.l === null) r.l = MK[r.m].fb;
    });
  }
  function rowAvail(kind, r) { var c = CTX[kind]; return !c || htOK(r.m, c); }
  // live odds belong to one match state; after a goal, corner or red card the platform moves its lines
  function liveSig() { var L = S.live; return [L.ht ? 'h' : L.per, L.gh, L.ga, L.ch, L.ca, L.rh, L.ra].join(','); }
  function isStale(kind, r) { return kind === 'live' && !!r.sig && r.sig !== liveSig() && r.o.some(function (x) { return !!x; }); }
  function sideLabels(r) {
    var d = MK[r.m];
    if (d.k === 'ou') return ['大', '小'];
    if (d.k === 'ah') return ['主', '客'];
    return d.sides;
  }
  function sideLong(r, s) {
    var d = MK[r.m];
    if (d.k === 'ou') return (s === 0 ? '大 ' : '小 ') + totAB(r.l);
    if (d.k === 'ah') return s === 0 ? '主 ' + hcAB(r.l) : '客 ' + hcAB(-r.l);
    return d.sides[s];
  }
  function lineLabel(r) { return MK[r.m].k === 'ah' ? '主 ' + hcAB(r.l) : totAB(r.l); }
  function fullLabel(r, s, ctx) {
    var d = MK[r.m], t = (d.k === 'ou' ? d.n.replace(' 大小', '') : d.n) + ' ' + sideLong(r, s);
    if (ctx && d.k === 'ah' && fromNow(ctx)) t += '（' + (d.g === 'c' ? S.live.ch + ':' + S.live.ca : S.live.gh + ':' + S.live.ga) + ' 起算）';
    return t;
  }
  function margin(r) {
    var t = 0;
    for (var i = 0; i < r.o.length; i++) { var v = oddsVal(r.o[i]); if (!v) return null; t += 1 / v; }
    return t - 1;
  }
  function evPill(ev, muted) {
    return '<span class="pill ' + (muted ? 'mut' : (ev > 0 ? 'pos' : 'neg')) + '">' + sgnPct(ev) + '</span>';
  }

  /* ---------------- board + summary rendering ---------------- */
  var KP = { open: false, mode: 'odds', kind: 'pre', id: 0, s: 0, buf: '', fresh: true };
  var PEND = { a: '', kind: '', t: 0 };
  function rowHTML(kind, r, ctx) {
    var d = MK[r.m], act = KP.open && KP.mode === 'odds' && KP.kind === kind && KP.id === r.id;
    var off = ctx && !htOK(r.m, ctx), cal = kind === 'pre' && CAL.ids[r.id];
    var ev = off ? null : rowEval(r, ctx), mg = margin(r), stale = isStale(kind, r);
    var h = '<div class="br' + (act ? ' act' : '') + (off ? ' off' : '') + (stale ? ' stale' : '') + '" data-id="' + r.id + '"><div class="br-h"><span class="br-n">' + esc(d.n);
    if (cal) h += ' <span class="tag">校准用</span>';
    if (mg !== null) h += ' <small' + (mg < 0 || mg > 0.15 ? ' class="bad"' : '') + '>水 ' + (mg * 100).toFixed(1) + '%</small>';
    if (kind === 'live' && !stale && r.ts && r.o.some(function (x) { return !!x; })) {
      var age = Math.floor((Date.now() - r.ts) / 60000);
      if (age >= 1) h += ' <small class="bad">' + age + ' 分钟前的赔率</small>';
    }
    h += '</span>';
    if (hasLine(r.m) && !off) h += '<span class="stp"><button data-a="dec" aria-label="盘口减 0.25">−</button><span class="lv">' + esc(lineLabel(r)) + '</span><button data-a="inc" aria-label="盘口加 0.25">+</button></span>';
    h += '<button class="br-x" data-a="del" aria-label="删除这个盘">✕</button></div>';
    if (off) return h + '<p class="hint" style="margin:0 0 4px">半场已结束，这个盘不再计算。</p></div>';
    if (stale) h += '<div class="stl">填赔率之后有进球、角球或红牌，平台的盘口和赔率应该变了，这个盘先不排序。<button data-a="fresh">赔率没变</button></div>';
    var labs = sideLabels(r);
    for (var s = 0; s < r.o.length; s++) {
      var st = ev ? ev[s] : null, on = act && KP.s === s;
      var shown = on && !KP.fresh ? bufShow(KP.buf) : (r.o[s] || '');
      var bad = on && !KP.fresh && KP.buf && !oddsVal(bufVal(KP.buf));
      h += '<div class="sdl"><span class="sl">' + esc(labs[s]) + '</span>' +
        '<button class="ob' + (on ? ' on' : '') + (bad ? ' bad' : '') + '" data-a="odd" data-s="' + s + '" aria-label="' + esc(sideLong(r, s)) + ' 赔率">' +
        (shown ? esc(shown) : '<span class="ph">赔率</span>') + '</button>' +
        '<span class="sw">' + (st ? pct(st.win) + (st.push > 0.005 ? '<small>走水 ' + Math.round(st.push * 100) + '%</small>' : '') : '—') + '</span>' +
        '<span class="sf">' + (st ? fo(st.fair) : '—') + '</span>' +
        '<span class="se">' + (st && st.ev !== null ? evPill(st.ev, cal || stale) : '') + '</span></div>';
    }
    return h + '</div>';
  }
  function boardHTML(kind, ctx) {
    var rows = board()[kind], h = '<h2>' + (kind === 'pre' ? '盘口板' : '滚球盘口板') + ' <span class="sub">（平台的盘口和欧赔）</span></h2>';
    if (kind === 'live') {
      h += '<div class="seg"><span>滚球让球：</span>' +
        '<button class="chipb" data-a="mode" data-v="now" aria-pressed="' + (S.lbMode !== 'all') + '">从现在比分起算</button>' +
        '<button class="chipb" data-a="mode" data-v="all" aria-pressed="' + (S.lbMode === 'all') + '">按全场比分</button></div>';
    } else if (CAL.note) h += '<p class="hint bd-note">' + esc(CAL.note) + '</p>';
    else h += '<p class="hint bd-note">胜平负和进球大小也填上，模型会用它们校准，角球预测更准。</p>';
    if (rows.length) h += '<div class="sdl lg"><span></span><span>赔率</span><span>赢的机会</span><span>公平赔率</span><span>期望</span></div>';
    else h += '<p class="hint">还没有盘。点下面的按钮添加。</p>';
    rows.forEach(function (r) { h += rowHTML(kind, r, ctx); });
    h += '<div class="addb">';
    [['c', '＋角球'], ['g', '＋进球']].forEach(function (grp) {
      h += '<div class="addl"><span class="al">' + grp[1] + '</span>';
      ADD[grp[0]].forEach(function (m) {
        if (ctx && !htOK(m, ctx)) return;
        h += '<button class="chipb" data-a="add" data-m="' + m + '">' + MK[m].a + '</button>';
      });
      h += '</div>';
    });
    h += '</div><div class="row-btns">' +
      '<button class="btn ghost" data-a="clr">' + (PEND.a === 'clr' && PEND.kind === kind && Date.now() - PEND.t < 4000 ? '再点一次：清空' : '清空所有赔率') + '</button>' +
      '<button class="btn ghost" data-a="reset">' + (PEND.a === 'reset' && PEND.kind === kind && Date.now() - PEND.t < 4000 ? '再点一次：恢复' : '恢复默认盘口') + '</button></div>';
    h += '<p class="hint">点赔率格子用下面弹出的数字键输入：185 就是 1.85，19 就是 1.9，打满三位自动跳到下一格。盘口用 − / + 调，每次 0.25，3/3.5 这种也能选。</p>';
    return h;
  }
  function sumItem(x) {
    var st = x.st;
    return '<div class="si' + (st.ev > 0 && st.ev < 0.02 ? ' weak' : '') + '"><div class="t">' + esc(fullLabel(x.r, x.s, x.ctx)) + '<span class="o">@' + st.odds.toFixed(2) + '</span></div>' +
      '<div class="m">赢 ' + pct(st.win) + (st.push > 0.005 ? ' · 走水 ' + pct(st.push) : '') + ' · 公平赔率 ' + fo(st.fair) + '</div>' + evPill(st.ev) + '</div>';
  }
  function sumHTML(kind, ctx) {
    var h = '<h2>期望收益';
    if (!ctx) return h + '</h2><p class="err">' + esc(kind === 'pre' ? (PMerr || '请选择比赛') : '先在「赛前」选好比赛。') + '</p>';
    var items = [], n = 0, calN = 0, staleN = 0;
    board()[kind].forEach(function (r) {
      var ev = rowEval(r, ctx);
      if (!ev) return;
      if (isStale(kind, r)) { staleN++; return; }
      ev.forEach(function (st, s) {
        if (st.ev === null) return;
        n++;
        if (kind === 'pre' && CAL.ids[r.id]) { calN++; return; }
        items.push({ r: r, s: s, st: st, ctx: ctx });
      });
    });
    items.sort(function (a, b) { return b.st.ev - a.st.ev; });
    var pos = items.filter(function (x) { return x.st.ev > 0; });
    h += ' <span class="sub">· ' + (n ? '填了 ' + n + ' 个选项，正期望 ' + pos.length + ' 个' : (staleN ? '赔率要更新' : '还没填赔率')) + '</span></h2>';
    if (!n) return h + '<p class="hint" style="margin-top:0">' + (staleN ? '有 ' + staleN + ' 个盘的赔率是进球、角球或红牌之前填的，没有算进来：在盘口板重新输入赔率，或者点“赔率没变”。' :
      '在盘口板填上平台的盘口和赔率，这里会把所有选项按期望收益从高到低排好。') + '</p>';
    if (pos.length) pos.forEach(function (x) { h += sumItem(x); });
    else if (items.length) h += '<p class="hint" style="margin:0 0 2px">没有正期望的选项。最接近的是：</p>' + sumItem(items[0]);
    else h += '<p class="hint" style="margin:0 0 2px">现在填的都是校准用的。再填角球大小、角球让球等盘的赔率，这里就会排出期望。</p>';
    if (pos.some(function (x) { return x.st.ev > 0.08; })) h += '<p class="warn">期望超过 +8% 的，先核对盘口和赔率有没有填错。</p>';
    h += '<p class="hint">期望 = 赢的机会 × 赔率 − 1（走水退回本金）。模型有误差，+2% 以下差不多等于没有优势。' +
      (calN ? '校准用的' + calN + '个选项不参与排序。' : '') +
      (staleN ? '有 ' + staleN + ' 个盘的赔率是进球或角球之前填的，没有算进来。' : '') +
      (kind === 'live' ? (S.lbMode === 'all' ? '滚球让球按全场比分算。' : '滚球让球从现在的比分起算。') : '') + '</p>';
    return h;
  }
  function renderBoard(kind) {
    var ctx = CTX[kind];
    autoLines(kind, ctx);
    $(kind + '-board').innerHTML = boardHTML(kind, ctx);
    $(kind + '-sum').innerHTML = sumHTML(kind, ctx);
    if (KP.open && KP.mode === 'odds' && KP.kind === kind) kpRender();
  }
  // after any edit on a board: save, redraw it; recompute the model when the calibration odds changed
  function boardChanged(kind) {
    board().t = Date.now();
    save();
    if (S.tab === kind) renderBoard(kind);
    if (kind === 'pre' && JSON.stringify(readOdds().odds) !== CALSIG) recalc();
  }
  function stepLine(r, dir) {
    if (!r || !hasLine(r.m)) return;
    var lo = MK[r.m].k === 'ou' ? 0.5 : -15, hi = MK[r.m].k === 'ou' ? 40 : 15;
    r.l = Math.max(lo, Math.min(hi, q4((r.l === null ? MK[r.m].fb : r.l) + dir * 0.25)));
    r.auto = false;
  }
  function onBoardClick(kind, e) {
    var host = $(kind + '-board'), t = closestAttr(e.target, 'data-a', host);
    if (!t) return;
    var a = t.getAttribute('data-a'), rowEl = closestAttr(t, 'data-id', host);
    var r = rowEl ? findRow(kind, +rowEl.getAttribute('data-id')) : null, b = board();
    if (a === 'odd' && r) { kpOpen(kind, r.id, +t.getAttribute('data-s')); return; }
    if ((a === 'dec' || a === 'inc') && r) stepLine(r, a === 'inc' ? 1 : -1);
    else if (a === 'del' && r) {
      if (KP.open && KP.mode === 'odds' && KP.kind === kind && KP.id === r.id) kpClose(true);
      b[kind].splice(rowIndex(b[kind], r.id), 1);
    } else if (a === 'add') {
      var m = t.getAttribute('data-m'), nr = newRow(m);
      if (hasLine(m)) {
        // a second line of the same market starts next to the lines already there
        var ctx = CTX[kind], f = ctx ? fairLine(nr, ctx) : null, taken = {};
        b[kind].forEach(function (x) { if (x.m === m && x.l !== null) taken[x.l] = 1; });
        var l0 = f !== null ? f : MK[m].fb, k = 0;
        while (taken[q4(l0 + k * MK[m].st)] && k < 40) k = k <= 0 ? -k + 1 : -k;
        if (k !== 0) { nr.l = q4(l0 + k * MK[m].st); nr.auto = false; }
      }
      b[kind].push(nr);
      boardChanged(kind);
      kpOpen(kind, nr.id, 0);
      return;
    } else if (a === 'clr' || a === 'reset') {
      if (!(PEND.a === a && PEND.kind === kind && Date.now() - PEND.t < 4000)) {
        PEND = { a: a, kind: kind, t: Date.now() };
        renderBoard(kind);
        setTimeout(function () { if (PEND.a === a && PEND.kind === kind) { PEND = { a: '', kind: '', t: 0 }; if (S.tab === kind) renderBoard(kind); } }, 4100);
        return;
      }
      PEND = { a: '', kind: '', t: 0 };
      if (KP.open && KP.mode === 'odds' && KP.kind === kind) kpClose(true);
      if (a === 'clr') b[kind].forEach(function (x) { x.o = x.o.map(function () { return ''; }); x.ts = 0; if (hasLine(x.m)) x.auto = true; });
      else b[kind] = tmpl(kind);
    } else if (a === 'fresh' && r) {
      r.sig = liveSig(); r.ts = Date.now();
    } else if (a === 'mode') {
      S.lbMode = t.getAttribute('data-v') === 'all' ? 'all' : 'now';
      save(); renderLive(); return;
    } else return;
    boardChanged(kind);
  }

  /* ---------------- keypad sheet (no system keyboard) ---------------- */
  function kpShow() {
    $('kp').hidden = false;
    document.body.classList.add('kp-open');
    try { document.documentElement.style.setProperty('--kp-h', $('kp').offsetHeight + 'px'); } catch (e) { }
  }
  function kpHide() { $('kp').hidden = true; document.body.classList.remove('kp-open'); }
  function kpOpen(kind, id, s) {
    if (KP.open && KP.mode === 'odds') kpCommit();
    KP.open = true; KP.mode = 'odds'; KP.kind = kind; KP.id = id; KP.s = s || 0; KP.buf = ''; KP.fresh = true;
    kpShow(); kpRender(); renderBoard(kind); kpShow(); scrollActive();
  }
  function kpCommit() {
    if (!KP.open || KP.mode !== 'odds' || KP.fresh) return;
    var r = findRow(KP.kind, KP.id);
    KP.fresh = true;
    if (!r) { KP.buf = ''; return; }
    var v = bufVal(KP.buf), ok = oddsVal(v) !== null;
    r.o[KP.s] = ok ? v.toFixed(2) : '';
    if (ok) pushRecent(r.o[KP.s]);
    KP.buf = '';
  }
  function kpClose(silent) {
    if (!KP.open) return;
    if (KP.mode === 'odds') kpCommit();
    KP.open = false;
    kpHide();
    if (!silent && KP.mode === 'odds') boardChanged(KP.kind);
  }
  function nextTarget() {
    var rows = board()[KP.kind], i = rowIndex(rows, KP.id);
    if (i < 0) return null;
    if (KP.s + 1 < rows[i].o.length) return { id: KP.id, s: KP.s + 1 };
    for (var j = i + 1; j < rows.length; j++) if (rowAvail(KP.kind, rows[j])) return { id: rows[j].id, s: 0 };
    return null;
  }
  function kpNext() {
    kpCommit();
    var nt = nextTarget();
    if (!nt) { kpClose(); return; }
    KP.id = nt.id; KP.s = nt.s; KP.buf = ''; KP.fresh = true;
    boardChanged(KP.kind); kpRender(); scrollActive();
  }
  function scrollActive() {
    var el = document.querySelector('.br.act');
    if (!el) return;
    var r = el.getBoundingClientRect(), top = $('topbar').getBoundingClientRect().bottom + 6;
    var bottom = $('kp').getBoundingClientRect().top - 6;
    if (r.bottom > bottom) window.scrollBy(0, Math.min(r.bottom - bottom, r.top - top));
    else if (r.top < top) window.scrollBy(0, r.top - top);
  }
  function kpRender() {
    if (!KP.open) return;
    if (KP.mode === 'int') { kpRenderInt(); return; }
    var r = findRow(KP.kind, KP.id);
    if (!r) { kpClose(true); return; }
    var d = MK[r.m], ev = rowEval(r, CTX[KP.kind]), labs = [], s;
    for (s = 0; s < r.o.length; s++) labs.push(sideLong(r, s));
    $('kp-title').innerHTML = esc(d.n) + (KP.kind === 'live' ? '<small>滚球</small>' : '');
    $('kp-done').textContent = '完成';
    $('kp-line').style.display = hasLine(r.m) ? '' : 'none';
    if (hasLine(r.m)) $('kp-lv').textContent = lineLabel(r);
    var h = '';
    for (s = 0; s < r.o.length; s++) {
      var on = s === KP.s, v = on && !KP.fresh ? bufShow(KP.buf) : (r.o[s] || '');
      h += '<button class="kp-side' + (on ? ' on' : '') + (on && KP.fresh && v ? ' old' : '') + '" data-kp="side" data-s="' + s + '">' +
        '<span class="l">' + esc(labs[s]) + '</span><span class="v">' + (v ? esc(v) : '<span class="ph">' + (on ? '输入赔率' : '—') + '</span>') + '</span></button>';
    }
    $('kp-sides').className = 'kp-sides' + (r.o.length === 3 ? ' c3' : '');
    $('kp-sides').innerHTML = h;
    var st = ev ? ev[KP.s] : null;
    $('kp-info').innerHTML = st ? '模型：赢 <b>' + pct(st.win) + '</b>' + (st.push > 0.005 ? '，走水 ' + pct(st.push) : '') + ' · 公平赔率 <b>' + fo(st.fair) + '</b>' +
      (st.ev !== null ? ' · 期望 <b class="' + (st.ev > 0 ? 'pos' : 'neg') + '">' + sgnPct(st.ev) + '</b>' : '') : '';
    var rec = S.recent.slice(0, 6);
    $('kp-rec').style.display = rec.length ? '' : 'none';
    $('kp-rec').innerHTML = rec.length ? '<span class="rl">最近用过</span>' + rec.map(function (x) { return '<button class="chipb" data-kp="rec" data-v="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') : '';
    $('kp-dot').disabled = false;
    $('kp-next').textContent = nextTarget() ? '下一个 →' : '完成 ✓';
  }
  function kpKey(k) {
    if (KP.mode === 'int') { kpKeyInt(k); return; }
    var r = findRow(KP.kind, KP.id);
    if (!r) { kpClose(true); return; }
    if (k === 'back') { if (KP.fresh) { KP.buf = ''; KP.fresh = false; } else KP.buf = KP.buf.slice(0, -1); }
    else if (k === 'clr') { KP.buf = ''; KP.fresh = false; }
    else if (k === '.') {
      if (KP.fresh) { KP.buf = ''; KP.fresh = false; }
      if (!KP.buf || KP.buf.indexOf('.') >= 0) { kpRender(); return; }
      KP.buf += '.';
    } else {
      if (KP.fresh) { KP.buf = ''; KP.fresh = false; }
      var dot = KP.buf.indexOf('.');
      if (dot < 0 && KP.buf.length >= 3) return;
      if (dot >= 0 && KP.buf.length - dot > 2) return;
      if (KP.buf === '' && k === '0') return;   // European odds never start with 0
      KP.buf += k;
    }
    var v = bufVal(KP.buf);
    r.o[KP.s] = oddsVal(v) !== null ? v.toFixed(2) : '';
    r.ts = Date.now();
    if (KP.kind === 'live') r.sig = liveSig();
    if (hasLine(r.m)) r.auto = false;
    var dt = KP.buf.indexOf('.');
    var done = (dt < 0 && KP.buf.length === 3) || (dt >= 0 && KP.buf.length - dt === 3);
    if (done && r.o[KP.s]) { kpNext(); return; }
    boardChanged(KP.kind); kpRender();
  }
  // minute entry (live clock)
  function kpOpenInt() {
    if (KP.open && KP.mode === 'odds') kpClose();
    KP.open = true; KP.mode = 'int'; KP.buf = ''; KP.fresh = true;
    kpRenderInt(); kpShow();
  }
  function kpRenderInt() {
    $('kp-title').innerHTML = '当前分钟<small>比赛时钟，例如 63；下半场接着数 46、47…</small>';
    $('kp-done').textContent = '取消';
    $('kp-line').style.display = 'none';
    $('kp-sides').className = 'kp-sides c1';
    $('kp-sides').innerHTML = '<div class="kp-side on"><span class="l">分钟</span><span class="v">' + (KP.buf ? esc(KP.buf) + '′' : '<span class="ph">输入数字</span>') + '</span></div>';
    $('kp-info').innerHTML = '';
    $('kp-rec').style.display = 'none';
    $('kp-dot').disabled = true;
    $('kp-next').textContent = '确定';
  }
  function kpKeyInt(k) {
    if (k === 'back') KP.buf = KP.buf.slice(0, -1);
    else if (k === 'clr') KP.buf = '';
    else if (/^[0-9]$/.test(k)) { if (KP.buf.length < 3 && !(KP.buf === '0')) KP.buf += k; }
    kpRenderInt();
  }
  function applyMinute() {
    var v = parseInt(KP.buf, 10);
    KP.open = false; kpHide();
    if (!isFinite(v)) return;
    v = Math.max(0, Math.min(130, v));
    var L = S.live;
    // 50' and later is always the second half; 45'-49' keeps the current half (first-half stoppage or early second half)
    L.ht = false; L.per = v >= 50 ? 2 : (v >= 45 ? (L.per === 2 ? 2 : 1) : 1); L.baseMin = v; L.baseTs = Date.now();
    save(); renderLive();
  }
  function onKp(k, el) {
    if (k === 'done') { if (KP.mode === 'int') { KP.open = false; kpHide(); } else kpClose(); return; }
    if (k === 'next') { if (KP.mode === 'int') applyMinute(); else kpNext(); return; }
    if (KP.mode === 'int') { kpKeyInt(k); return; }
    var r = findRow(KP.kind, KP.id);
    if (!r) { kpClose(true); return; }
    if (k === 'side') {
      kpCommit();
      KP.s = +el.getAttribute('data-s'); KP.buf = ''; KP.fresh = true;
      boardChanged(KP.kind); kpRender(); return;
    }
    if (k === 'dec' || k === 'inc') { stepLine(r, k === 'inc' ? 1 : -1); boardChanged(KP.kind); kpRender(); return; }
    if (k === 'rec') {
      r.o[KP.s] = el.getAttribute('data-v'); r.ts = Date.now(); if (hasLine(r.m)) r.auto = false;
      if (KP.kind === 'live') r.sig = liveSig();
      KP.fresh = true; KP.buf = ''; pushRecent(r.o[KP.s]);
      kpNext(); return;
    }
    kpKey(k);
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
      h += '<tr' + (near ? ' class="near"' : '') + '><td class="ln">' + totAB(L) + '</td>' +
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
      h += '<tr' + (near ? ' class="near"' : '') + '><td class="ln">' + hcAB(hl) + '</td>' +
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

  /* ---------------- pre-match view ---------------- */
  function preCtx() {
    return { kind: 'pre', ft: PM.cornersFT, ht: PM.cornersHT, gm: Core.goalsMarkets(PM.goalsFT), ghm: Core.goalsMarkets(PM.goalsHT), g: [0, 0] };
  }
  function renderPre() {
    var names = teamNames();
    CTX.pre = PM ? preCtx() : null;
    renderBoard('pre');
    if (!PM) {
      $('pre-kpi').innerHTML = '<p class="err">' + esc(PMerr || '请选择比赛') + '</p>';
      $('pre-corners').innerHTML = ''; $('pre-goals').innerHTML = '';
      return;
    }
    var ctx = CTX.pre, ft = PM.cornersFT, ht = PM.cornersHT;
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
    c += ahTable(ft.dif, ft.difOff, centerLines(-md, 5, 1, true, true), '全场角球 让球', names, md);
    c += ahTable(ht.dif, ht.difOff, centerLines(-md1, 3, 1, true, true), '半场角球 让球', names, md1);
    c += ouTable(ft.home, 0, centerLines(PM.mh, 3, 1, true), '主队角球 大小（' + esc(names[0]) + '）', PM.mh);
    c += ouTable(ft.away, 0, centerLines(PM.ma, 3, 1, true), '客队角球 大小（' + esc(names[1]) + '）', PM.ma);
    $('pre-corners').innerHTML = c;
    $('pre-goals').innerHTML = '<h2>进球</h2>' + goalsBlock(ctx.gm, ctx.ghm, names, false);
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
    return { kind: 'live', ft: LV.cornersFT, ht: LV.cornersHT || null, gm: Core.goalsMarkets(LV.goalsFT),
             ghm: LV.goalsHT ? Core.goalsMarkets(LV.goalsHT) : null, g: [S.live.gh, S.live.ga] };
  }
  function renderAdded() {
    var v = S.live.added === null || S.live.added === undefined ? '' : String(S.live.added), h = '';
    h += '<button class="chipb" data-v="" aria-pressed="' + (v === '') + '">未知</button>';
    for (var i = 1; i <= 10; i++) h += '<button class="chipb" data-v="' + i + '" aria-pressed="' + (v === String(i)) + '">' + i + '</button>';
    $('lv-added').innerHTML = h;
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
    renderAdded();
    $('lv-ht-note').textContent = L.per === 2 || L.ht ? '下半场的角球照常往上加；半场盘已结算，不再显示。' : '';
  }
  function renderLive() {
    renderLiveHeader();
    if (!PM) {
      CTX.live = null;
      $('live-kpi').innerHTML = '<p class="err">先在「赛前」选好比赛。</p>';
      $('live-corners').innerHTML = $('live-goals').innerHTML = '';
      renderBoard('live');
      return;
    }
    computeLive();
    if (!LV) { CTX.live = null; $('live-kpi').innerHTML = '<p class="err">滚球计算失败，请检查输入。</p>'; renderBoard('live'); return; }
    CTX.live = liveCtx();
    var names = teamNames(), ctx = CTX.live, L = S.live, ft = LV.cornersFT;
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
    // handicaps follow the board's setting: from the current corner score (common for in-play) or on the whole match
    var fn = S.lbMode !== 'all', d0 = fn ? 0 : L.ch - L.ca, how = fn ? '（从现在 ' + L.ch + ':' + L.ca + ' 起算）' : '（按全场角球）';
    var md = d0 + LV.remFT[0] - LV.remFT[1];
    c += ahTable(ft.dif, ft.difOff + d0, centerLines(-md, 5, 1, true, true), '全场角球 让球' + how, names, md);
    if (LV.cornersHT) {
      var md1 = d0 + LV.remHT[0] - LV.remHT[1];
      c += ahTable(LV.cornersHT.dif, LV.cornersHT.difOff + d0, centerLines(-md1, 3, 1, true, true), '半场角球 让球' + how, names, md1);
    }
    $('live-corners').innerHTML = c;
    var g = '<h2>进球</h2>';
    if (LV.next) g += '<p class="hint" style="margin-top:0">下一个进球：<span class="h">' + esc(names[0]) + ' ' + pct(LV.next[0]) + '</span> · <span class="a">' + esc(names[1]) + ' ' + pct(LV.next[1]) + '</span> · 不再进球 ' + pct(LV.next[2]) + '</p>';
    g += goalsBlock(ctx.gm, ctx.ghm, names, true);
    $('live-goals').innerHTML = g;
    renderBoard('live');
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
    pre: { one: ['p-match', 'pre-sum', 'pre-board', 'pre-kpi', 'pre-corners', 'pre-goals', 'p-tolive'],
           L: ['p-match', 'pre-board', 'p-tolive'], R: ['pre-sum', 'pre-kpi', 'pre-corners', 'pre-goals'] },
    live: { one: ['lv-boardp', 'lv-counters', 'live-kpi', 'live-sum', 'live-board', 'live-corners', 'live-goals', 'lv-resetbox'],
            L: ['lv-boardp', 'lv-counters', 'live-kpi', 'live-corners', 'live-goals', 'lv-resetbox'], R: ['live-sum', 'live-board'] },
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
    if (KP.open) { if (KP.mode === 'int') { KP.open = false; kpHide(); } else kpClose(true); }
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
  function matchChanged() {
    if (KP.open) { if (KP.mode === 'int') { KP.open = false; kpHide(); } else kpClose(true); }
    freshLive(); save(); recalc();
  }
  function freshLive() {
    S.live = { per: 1, ht: false, baseMin: 0, baseTs: 0, running: false, added: '', added1: '', gh: 0, ga: 0, ch: 0, ca: 0, rh: 0, ra: 0 };
    board().live.forEach(function (r) { r.o = r.o.map(function () { return ''; }); r.ts = 0; r.sig = ''; if (hasLine(r.m)) r.auto = true; });
  }
  function showOther() {
    $('o-avg').textContent = (num(S.setup.avg) || 10).toFixed(1);
    $('o-share').textContent = Math.round(num(S.setup.share) || 54) + '%';
  }

  $('tab-pre').addEventListener('click', function () { setTab('pre'); });
  $('tab-live').addEventListener('click', function () { setTab('live'); });
  $('tab-about').addEventListener('click', function () { setTab('about'); });
  $('sel-league').addEventListener('change', function () {
    var v = this.value;
    if (v === 'other') { S.setup.other = true; }
    else { S.setup.other = false; if (+v !== S.setup.li) { S.setup.li = +v; S.setup.hi = 0; S.setup.ai = 1; } fillTeams(); }
    $('team-pick').hidden = S.setup.other; $('other-box').hidden = !S.setup.other;
    matchChanged();
  });
  $('sel-home').addEventListener('change', function () { S.setup.hi = +this.value; matchChanged(); });
  $('sel-away').addEventListener('change', function () { S.setup.ai = +this.value; matchChanged(); });
  [['o-home', 'oh'], ['o-away', 'oa']].forEach(function (p) {
    var el = $(p[0]); el.value = S.setup[p[1]];
    el.addEventListener('input', function () { S.setup[p[1]] = el.value; save(); recalc(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-st]'), function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-st'), d = +b.getAttribute('data-d');
      if (k === 'avg') S.setup.avg = Math.max(6, Math.min(15, (num(S.setup.avg) || 10) + d)).toFixed(1);
      else S.setup.share = String(Math.max(40, Math.min(65, Math.round(num(S.setup.share) || 54) + d)));
      showOther(); save(); recalc();
    });
  });
  $('to-live').addEventListener('click', function () { setTab('live'); });
  ['pre', 'live'].forEach(function (kind) {
    $(kind + '-board').addEventListener('click', function (e) { onBoardClick(kind, e); });
  });
  $('kp').addEventListener('click', function (e) {
    var t = closestAttr(e.target, 'data-kp', $('kp'));
    if (t && !t.disabled) onKp(t.getAttribute('data-kp'), t);
  });
  document.addEventListener('touchstart', function () { }, false);   // lets :active show on iOS

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
  $('lv-setmin').addEventListener('click', function () { kpOpenInt(); });
  $('lv-added').addEventListener('click', function (e) {
    var t = closestAttr(e.target, 'data-v', this);
    if (!t) return;
    S.live.added = t.getAttribute('data-v'); save(); renderLive();
  });
  $('lv-reset').addEventListener('click', function () { $('lv-reset-confirm').hidden = false; });
  $('lv-reset-no').addEventListener('click', function () { $('lv-reset-confirm').hidden = true; });
  $('lv-reset-yes').addEventListener('click', function () {
    if (KP.open) { if (KP.mode === 'int') { KP.open = false; kpHide(); } else kpClose(true); }
    freshLive(); $('lv-reset-confirm').hidden = true; save(); renderLive();
  });
  setInterval(function () { if (S.tab === 'live' && S.live.running) renderLive(); }, 20000);

  fillLeagues(); fillTeams(); showOther();
  $('team-pick').hidden = S.setup.other; $('other-box').hidden = !S.setup.other;
  layout(); applyView();
  window.addEventListener('resize', function () { layout(); if (KP.open) kpShow(); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { layout(); if (KP.open) kpShow(); }, 200); });
  $('set-pip').value = S.view.pip; $('set-piph').value = S.view.piph;
  $('set-pip').addEventListener('change', function () { S.view.pip = this.value; save(); applyView(); });
  $('set-piph').addEventListener('change', function () { S.view.piph = this.value; save(); applyView(); });
  $('app-ver').textContent = '版本 ' + APP_VER + '。数据只存在本机。';
  computePre();
  setTab(S.tab || 'pre');
  // quiet background refresh at most every 12 hours (only works when hosted on a normal website)
  try { if (!S.lastAuto || Date.now() - S.lastAuto > 12 * 3600 * 1000) setTimeout(function () { updateData(true); }, 1500); } catch (e) { }

})();
