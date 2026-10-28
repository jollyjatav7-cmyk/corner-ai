/* 角球进球预测 — UI layer (ES5, no framework) */
(function () {
  'use strict';
  var B = BUNDLE;
  var ABOUT_HTML = /*ABOUT*/'';
  var APP_VER = '/*APPVER*/';
  var IN_ARTIFACT = /*ARTIFACT*/false;   // true in the copy published inside Claude (no service worker, no file saving)
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
    boards: {}, lbMode: 'now', recent: [], rid: 1, net: { key: '', used: {}, from: '' },
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
      r.os = r.o.map(function (x, i) { return r.os && r.os[i] === 'net' && (x || r.alt) ? 'net' : ''; });
      if (typeof r.book !== 'string') r.book = '';
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
      ['setup', 'live', 'view', 'net'].forEach(function (k) { if (o[k]) for (var kk in o[k]) S[k][kk] = o[k][kk]; });
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
      window.localStorage.setItem(LS_KEY, JSON.stringify({ setup: S.setup, live: S.live, view: S.view, boards: S.boards, lbMode: S.lbMode, net: S.net,
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
    return { id: S.rid++, m: m, l: withLine && given ? q4(l) : null, auto: withLine && !given, o: o, os: o.map(function () { return ''; }), book: '', ts: 0 };
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
    if (r.book && r.os && r.os.some(function (x, i) { return x === 'net' && r.o[i]; })) h += ' <span class="tag net">联网·' + esc(r.book) + '</span>';
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
        '<button class="ob' + (on ? ' on' : '') + (bad ? ' bad' : '') + (!on && r.os && r.os[s] === 'net' && r.o[s] ? ' net' : '') + '" data-a="odd" data-s="' + s + '" aria-label="' + esc(sideLong(r, s)) + ' 赔率">' +
        (shown ? esc(shown) : '<span class="ph">赔率</span>') + '</button>' +
        '<span class="sw">' + (st ? pct(st.win) + (st.push > 0.005 ? '<small>走水 ' + Math.round(st.push * 100) + '%</small>' : '') : '—') + '</span>' +
        '<span class="sf">' + (st ? fo(st.fair) : '—') + '</span>' +
        '<span class="se">' + (st && st.ev !== null ? evPill(st.ev, cal || stale) : '') + '</span></div>';
    }
    return h + '</div>';
  }
  function boardHTML(kind, ctx) {
    var rows = board()[kind], h = '<h2>' + (kind === 'pre' ? '盘口板' : '滚球盘口板') + ' <span class="sub">（平台的盘口和欧赔）</span></h2>' + netBar(kind);
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
    var allN = items.length, saved = savedCount(kind);
    if (allN) h += '<div class="row-btns save-row"><button class="btn' + (pos.length ? ' pri' : '') + '" data-a="save-pos"' + (pos.length ? '' : ' disabled') + '>存正期望（' + pos.length + '）</button>' +
      '<button class="btn" data-a="save-all">全部存（' + allN + '）</button></div>' +
      (saved ? '<p class="hint saved">这场已存 ' + saved + ' 注，比赛结束后到「记录」一键查结果。</p>' : '');
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
    // odds read online belong to the old line: take the bookmaker's odds for the new line when it quotes one, otherwise leave the
    // side empty (it keeps following the bookmaker's lines until you type odds yourself)
    var alt = r.alt && r.alt[String(r.l)];
    if (r.os) r.os.forEach(function (x, i) { if (x === 'net') r.o[i] = alt && alt[i] ? alt[i] : ''; });
  }
  function onBoardClick(kind, e) {
    var host = $(kind + '-board'), t = closestAttr(e.target, 'data-a', host);
    if (!t) return;
    var a = t.getAttribute('data-a'), rowEl = closestAttr(t, 'data-id', host);
    var r = rowEl ? findRow(kind, +rowEl.getAttribute('data-id')) : null, b = board();
    if (a === 'odd' && r) { kpOpen(kind, r.id, +t.getAttribute('data-s')); return; }
    if (a === 'net') { netAction(kind); return; }
    if (a === 'netset') { setTab('about'); setTimeout(function () { var el = $('net-key'); if (el) { try { el.scrollIntoView({ block: 'center' }); } catch (e) { } } }, 50); return; }
    if (a === 'unlink') { b.api = null; NETMSG[kind] = ''; save(); renderBoard(kind); netAction(kind); return; }
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
      if (a === 'clr') b[kind].forEach(function (x) { x.o = x.o.map(function () { return ''; }); x.os = x.o.map(function () { return ''; }); x.alt = null; x.book = ''; x.ts = 0; if (hasLine(x.m)) x.auto = true; });
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
    if (r.os) r.os[KP.s] = '';
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
      if (r.os) r.os[KP.s] = '';
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
    renderNet();
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

  /* ---------------- small message toast + bottom sheet ---------------- */
  var toastT = null;
  function toast(msg) {
    var el = $('msg-toast');
    el.textContent = msg; el.hidden = false;
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function () { el.hidden = true; }, 3500);
  }
  var SHEET = null;
  function openSheet(title, html, onClick) {
    if (KP.open) { if (KP.mode === 'int') { KP.open = false; kpHide(); } else kpClose(true); }
    $('sheet-title').textContent = title; $('sheet-body').innerHTML = html; $('sheet').hidden = false; SHEET = onClick || null;
    try { $('sheet-body').scrollTop = 0; } catch (e) { }
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet-body').innerHTML = ''; SHEET = null; }
  function r4(x) { return Math.round(x * 10000) / 10000; }
  function shallow(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }

  /* ---------------- online: API-Football (odds, live score, results) ---------------- */
  var TZ = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function shiftDay(k, n) { var p = k.split('-'); return dayKey(new Date(+p[0], +p[1] - 1, +p[2] + n, 12)); }
  function fmtKo(ms) { var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function netKey() { return String((S.net && S.net.key) || '').trim(); }
  // the key the user already pasted into 角球数据记录 / 角球六要素 (same website, same device)
  if (!netKey()) ['corner-sb-net', 'corner-six-net'].some(function (k) {
    try {
      var o = JSON.parse(window.localStorage.getItem(k) || 'null');
      if (o && o.key) { S.net.key = String(o.key).trim(); S.net.from = k === 'corner-sb-net' ? '角球数据记录' : '角球六要素'; return true; }
    } catch (e) { }
    return false;
  });
  function api(path) {
    if (path.indexOf('/status') !== 0) {
      var k = dayKey(new Date()), n = ((S.net.used || {})[k] || 0) + 1;
      S.net.used = {}; S.net.used[k] = n; save();
    }
    return Net.apiGet(netKey(), path);
  }
  var NETC = {};
  function apiCached(path) {
    var c = NETC[path];
    if (c && Date.now() - c.t < 600000) return Promise.resolve(c.v);
    return api(path).then(function (v) { v = v || []; NETC[path] = { t: Date.now(), v: v }; return v; });
  }
  function ourTeams() {
    if (S.setup.other) {
      var oh = S.setup.oh || '', oa = S.setup.oa || '';
      return { lid: null, h: oh ? Net.teamKeys(oh, null, Net.zhNames(oh)) : [], a: oa ? Net.teamKeys(oa, null, Net.zhNames(oa)) : [] };
    }
    var L = B.leagues[S.setup.li], th = L.teams[S.setup.hi], ta = L.teams[S.setup.ai], map = B.om_map[L.code];
    return { lid: Net.LG_API[L.code] || null, h: Net.teamKeys(th.n, map, Net.zhNames(th.z)), a: Net.teamKeys(ta.n, map, Net.zhNames(ta.z)) };
  }
  // today, tomorrow and yesterday (the free plan's window); fixtures of the right league first, the whole day if that finds nothing
  function findFixture() {
    var T = ourTeams(), today = dayKey(new Date()), days = [today, shiftDay(today, 1), shiftDay(today, -1)], all = [], i = 0, wide = !T.lid;
    if (!T.h.length || !T.a.length) return Promise.resolve({ r: [], sure: false });
    function path(d) { return '/fixtures?date=' + d + (wide ? '' : '&league=' + T.lid + '&season=' + B.season) + '&timezone=' + encodeURIComponent(TZ); }
    function step() {
      if (i >= days.length) {
        if (!wide && !all.length) { wide = true; i = 0; days = days.slice(0, 2); return step(); }
        return { r: Net.rankFixtures(all, T.h, T.a, T.lid), sure: false };
      }
      var d = days[i++];
      return apiCached(path(d)).then(function (list) {
        var seen = {};
        all.forEach(function (f) { seen[f.fixture.id] = 1; });
        all = all.concat((list || []).filter(function (f) { return f && f.fixture && !seen[f.fixture.id]; }));
        var r = Net.rankFixtures(all, T.h, T.a, T.lid);
        return Net.isSure(r) ? { r: r, sure: true } : step();
      });
    }
    return step();
  }
  var NETMSG = { pre: '', live: '' }, NETBUSY = false;
  function linkTo(c) {
    var f = c.f, b = board();
    b.api = { id: f.fixture.id, sw: c.sw ? 1 : 0, h: f.teams.home.name, a: f.teams.away.name,
              ko: f.fixture.timestamp ? f.fixture.timestamp * 1000 : null, lg: f.league ? f.league.name : '' };
    save();
    return b.api;
  }
  function openPicker(cands, kind) {
    var h = '';
    if (!cands.length) h += '<p class="hint">' + (S.setup.other && !(S.setup.oh && S.setup.oa) ? '其他联赛要先在「比赛」里填两队的名字。' :
      '今天、明天、昨天的比赛里没找到这两队（免费方案只能查这三天）。赔率可以自己填。') + '</p>';
    cands.forEach(function (c, i) {
      var f = c.f;
      h += '<button class="pick" data-i="' + i + '"><b>' + esc(f.teams.home.name) + ' vs ' + esc(f.teams.away.name) + '</b><small>' +
        esc(f.league ? f.league.name : '') + (f.fixture.timestamp ? ' · ' + fmtKo(f.fixture.timestamp * 1000) : '') + (c.sw ? ' · 主客跟你选的相反' : '') + '</small></button>';
    });
    if (cands.length) h += '<p class="hint">点对的那一场，之后这场就不用再找。都不对就关掉，赔率自己填。</p>';
    openSheet('是哪一场？', h, function (e) {
      var t = closestAttr(e.target, 'data-i', $('sheet-body'));
      if (!t) return;
      var c = cands[+t.getAttribute('data-i')];
      closeSheet(); linkTo(c); netAction(kind);
    });
  }
  function netBar(kind) {
    if (!netKey()) return '<div class="netbar"><button class="btn" data-a="netset">联网自动填赔率（先填免费 key）</button></div>';
    var lk = board().api, h = '<div class="netbar"><button class="btn pri" data-a="net"' + (NETBUSY ? ' disabled' : '') + '>' +
      (NETBUSY ? '联网中…' : (kind === 'pre' ? '联网读取赔率' : '联网同步比分和赔率')) + '</button>';
    if (lk) h += '<span class="nt">' + esc(lk.h) + ' vs ' + esc(lk.a) + (lk.ko ? ' · ' + fmtKo(lk.ko) : '') + ' <button class="lnk" data-a="unlink">不是这场</button></span>';
    h += '</div>';
    if (NETMSG[kind]) h += '<p class="hint netmsg">' + esc(NETMSG[kind]) + '</p>';
    return h;
  }
  function netAction(kind) {
    if (!netKey()) { setTab('about'); return; }
    if (NETBUSY) return;
    if (KP.open) { if (KP.mode === 'int') { KP.open = false; kpHide(); } else kpClose(true); }
    NETBUSY = true; NETMSG[kind] = '正在联网…'; renderBoard(kind);
    var b = board();
    var p = b.api && b.api.id ? Promise.resolve(b.api) : findFixture().then(function (x) {
      if (x.sure) return linkTo(x.r[0]);
      openPicker(x.r.slice(0, 8), kind);
      NETMSG[kind] = x.r.length ? '请在弹出的列表里点对的那一场。' : '联网没找到这场比赛。';
      return null;
    });
    p.then(function (lk) { return lk ? (kind === 'pre' ? readPre(lk) : syncLive(lk)) : null; })
      .then(function (msg) { if (msg) NETMSG[kind] = msg; }, function (e) { NETMSG[kind] = '联网失败：' + e.message; })
      .then(function () { NETBUSY = false; if (S.tab === kind) { if (kind === 'live') renderLive(); else renderBoard(kind); } });
  }
  function summarize(mk) {
    var books = {}, parts = [];
    Object.keys(MK).forEach(function (m) {
      var x = mk[m];
      if (!x) return;
      books[x.book] = 1;
      parts.push(MK[m].n.replace(' 大小', '') + (hasLine(m) ? ' ' + (MK[m].k === 'ah' ? '主 ' + hcAB(x.l) : totAB(x.l)) : ''));
    });
    return parts.join('、') + '（' + Object.keys(books).join(' / ') + '）';
  }
  // fill the board: rows of the same market that hold no odds the user typed get the online line and odds
  function applyMarkets(kind, mk) {
    var rows = board()[kind], n = 0, ctx = CTX[kind];
    Object.keys(MK).forEach(function (m) {
      var x = mk[m];
      if (!x || (ctx && !htOK(m, ctx))) return;
      var cand = null, mine = false;
      rows.forEach(function (r) {
        if (r.m !== m) return;
        var typed = r.o.some(function (v, i) { return v && !(r.os && r.os[i] === 'net'); });
        if (typed) mine = true; else if (!cand) cand = r;
      });
      if (!cand) { if (mine) return; cand = newRow(m); rows.push(cand); }
      if (hasLine(m)) { cand.l = q4(x.l); cand.auto = false; }
      cand.o = x.o.map(function (v) { return (+v).toFixed(2); });
      cand.os = cand.o.map(function () { return 'net'; });
      cand.book = x.book; cand.ts = Date.now();
      cand.alt = null;
      if (hasLine(m) && x.alts) {
        cand.alt = {};
        x.alts.forEach(function (a) { cand.alt[String(q4(a.l))] = a.o.map(function (v) { return (+v).toFixed(2); }); });
      }
      if (kind === 'live') cand.sig = liveSig();
      n++;
    });
    if (n) boardChanged(kind);
    return n;
  }
  // bet names the board could not use (kept for the export, so the name list can be extended later)
  function noteUnused(bets) {
    var seen = {};
    (S.net.unk || []).forEach(function (x) { seen[x] = 1; });
    (bets || []).forEach(function (b) { if (b && b.name && !seen[b.name] && !Net.parseBet(b, false)) seen[b.name] = 1; });
    S.net.unk = Object.keys(seen).slice(-80);
  }
  function readPre(lk) {
    return api('/odds?fixture=' + lk.id).then(function (resp) {
      var bms = ((resp || [])[0] || {}).bookmakers || [];
      bms.forEach(function (bm) { noteUnused(bm && bm.bets); });
      var mk = Net.pickPre(bms, !!lk.sw), all = Object.keys(mk).length;
      if (!all) return '联网还没有这场的赛前盘口（一般开赛前几天才有，有些联赛没有）。';
      var n = applyMarkets('pre', mk);
      return '已填入：' + summarize(mk) + (n < all ? '。你自己填过的盘没有改' : '') + '。跟你的平台不一样就直接改。';
    });
  }
  function syncLive(lk) {
    return api('/fixtures?id=' + lk.id).then(function (resp) {
      var f = (resp || [])[0];
      if (!f) throw new Error('找不到这场比赛的资料');
      var s = Net.fixState(f, !!lk.sw);
      if (!s.c && (s.live || s.done)) {
        return api('/fixtures/statistics?fixture=' + lk.id).then(function (st) {
          var g = shallow(f); g.statistics = st; s.c = Net.fixState(g, !!lk.sw).c; return s;
        }, function () { return s; });
      }
      return s;
    }).then(function (s) {
      var msg = applyState(s);
      if (s.done) return (msg ? msg + ' ' : '') + '这场已经结束。';
      if (!s.live) return '这场还没开始' + (s.ko ? '（' + fmtKo(s.ko) + ' 开球）' : '') + '，赛前赔率请在「赛前」读取。';
      return api('/odds/live?fixture=' + lk.id).then(function (r2) {
        var lo = ((r2 || [])[0] || {}).odds;
        noteUnused(lo);
        var mk = Net.pickLive(lo, !!lk.sw);
        applyMarkets('live', mk);
        return msg + (Object.keys(mk).length ? ' 滚球盘口：' + summarize(mk) + '。' : ' 联网现在没有这场的滚球盘口。');
      });
    });
  }
  // counts only go up (the feed can lag a few seconds behind what you saw); the clock follows the feed
  function applyState(s) {
    if (!s.live && !s.done) return '';
    var L = S.live, ch = [];
    function mx(k, v, nm) { if (typeof v === 'number' && v > L[k]) { ch.push(nm + ' ' + L[k] + '→' + v); L[k] = v; } }
    mx('gh', s.gNow[0], '主队进球'); mx('ga', s.gNow[1], '客队进球');
    if (s.c) { mx('ch', s.c[0], '主队角球'); mx('ca', s.c[1], '客队角球'); }
    mx('rh', s.red[0], '主队红牌'); mx('ra', s.red[1], '客队红牌');
    if (s.st === 'HT') {
      if (!L.ht) { L.ht = true; L.per = 1; L.running = false; L.baseMin = 45; board().htSnap = { c: [L.ch, L.ca], g: [L.gh, L.ga] }; }
    } else if (s.st === '1H' || s.st === '2H') {
      L.ht = false; L.per = s.st === '1H' ? 1 : 2; L.baseMin = Math.min(130, s.el + (s.ex || 0)); L.baseTs = Date.now(); L.running = true;
    }
    save();
    return '比分 ' + L.gh + ':' + L.ga + '，角球 ' + L.ch + ':' + L.ca + (s.live && s.el ? '，第 ' + (s.el + (s.ex || 0)) + ' 分钟' : '') +
      (ch.length ? '（补上：' + ch.join('，') + '）' : '') + '。';
  }

  /* ---------------- records: bets saved for checking after the match ---------------- */
  var REC_KEY = 'corner_goal_ai_rec_v1', REC = { recs: [], matches: {} };
  try { var rr0 = JSON.parse(window.localStorage.getItem(REC_KEY) || 'null'); if (rr0 && rr0.recs && rr0.matches) REC = rr0; } catch (e) { }
  function recSave() {
    try { window.localStorage.setItem(REC_KEY, JSON.stringify(REC)); return true; }
    catch (e) { toast('本机存储空间满了：请先导出，再删除一些旧比赛。'); return false; }
  }
  function lgName(code) {
    if (code === 'other') return '其他联赛';
    for (var i = 0; i < B.leagues.length; i++) if (B.leagues[i].code === code) return B.leagues[i].zh;
    return code;
  }
  // the record entry for the match on screen (a new one once the old one has a result or is days old)
  function curMatch() {
    var b = board(), now = Date.now(), m = b.mid && REC.matches[b.mid];
    if (m && (m.fin || (m.ko ? now > m.ko + 3 * 86400000 : now - (m.last || m.at || 0) > 4 * 86400000))) m = null;
    if (!m) {
      var names = teamNames(), id = 'm' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36);
      m = { id: id, at: now, lg: S.setup.other ? 'other' : B.leagues[S.setup.li].code, h: names[0], a: names[1], d: dayKey(new Date()), res: {}, src: {} };
      if (S.setup.other) { m.hn = S.setup.oh || ''; m.an = S.setup.oa || ''; }
      else { var L = B.leagues[S.setup.li]; m.hn = L.teams[S.setup.hi].n; m.an = L.teams[S.setup.ai].n; }
      REC.matches[id] = m; b.mid = id; save();
    }
    if (b.api) { m.api = { id: b.api.id, sw: b.api.sw }; if (b.api.ko) { m.ko = b.api.ko; m.d = dayKey(new Date(b.api.ko)); } }
    m.last = now;
    return m;
  }
  function savedCount() {
    var b = board(), m = b.mid && REC.matches[b.mid];
    if (!m || m.fin) return 0;
    return REC.recs.filter(function (r) { return r.mid === m.id; }).length;
  }
  function saveRecs(kind, onlyPos) {
    var ctx = CTX[kind];
    if (!ctx) { toast('先选好比赛'); return; }
    var m = curMatch(), now = Date.now(), L = S.live, sig = liveSig(), idx = {}, cnt = 0, seq = 0;
    REC.recs.forEach(function (r, i) { if (r.mid === m.id && !r.res) idx[r.k] = i; });
    board()[kind].forEach(function (r) {
      if ((kind === 'pre' && CAL.ids[r.id]) || isStale(kind, r) || !htOK(r.m, ctx)) return;
      var ev = rowEval(r, ctx);
      if (!ev) return;
      ev.forEach(function (st, s) {
        if (st.ev === null || (onlyPos && !(st.ev > 0))) return;
        var rec = { id: 'r' + now.toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36), mid: m.id, t: now, ph: kind,
                    m: r.m, l: r.l, s: s, o: st.odds, p: [r4(st.win), r4(st.push), r4(st.lose)], fair: isFinite(st.fair) ? Math.round(st.fair * 100) / 100 : null,
                    ev: r4(st.ev), src: r.os && r.os[s] === 'net' ? r.book : '' };
        if (kind === 'live') {
          rec.st = { min: liveMinute(), per: L.ht ? 'ht' : L.per, g: [L.gh, L.ga], c: [L.ch, L.ca], r: [L.rh, L.ra] };
          if (MK[r.m].k === 'ah' && fromNow(ctx)) rec.b = MK[r.m].g === 'c' ? [L.ch, L.ca] : [L.gh, L.ga];
        }
        rec.k = [kind, r.m, r.l, s, kind === 'live' ? sig : ''].join('|');
        if (idx[rec.k] !== undefined) { rec.id = REC.recs[idx[rec.k]].id; REC.recs[idx[rec.k]] = rec; }
        else { idx[rec.k] = REC.recs.length; REC.recs.push(rec); }
        cnt++;
      });
    });
    if (recSave()) toast(cnt ? '已存 ' + cnt + ' 注到「记录」，比赛结束后去那里一键查结果' : '没有可以存的选项');
    renderBoard(kind);
  }

  /* ---------------- results: public data first (no key), then API-Football; settle every bet ---------------- */
  var LOOK = { busy: false, msg: '' };
  function recsOf(mid) { return REC.recs.filter(function (r) { return r.mid === mid; }); }
  function needed(m) {
    var need = {};
    REC.recs.forEach(function (r) { if (r.mid === m.id && !r.res) { var v = Net.need(r.m); if (v) need[v] = 1; } });
    return Object.keys(need).filter(function (k) { return !(m.res && m.res[k]); });
  }
  function pendingMatches() {
    var by = {};
    REC.recs.forEach(function (r) { if (!r.res) by[r.mid] = 1; });
    return Object.keys(by).map(function (id) { return REC.matches[id]; }).filter(function (m) { return !!m; });
  }
  function setRes(m, key, val, src) {
    if (!val || val[0] === null || val[1] === null || val[0] === undefined || val[1] === undefined) return false;
    if (!m.res) m.res = {};
    if (!m.src) m.src = {};
    if (m.res[key]) return false;
    m.res[key] = [val[0], val[1]]; m.src[key] = src; m.fin = true;
    return true;
  }
  function settleAll() {
    var n = 0;
    REC.recs.forEach(function (r) {
      if (r.res) return;
      var m = REC.matches[r.mid], x = m && m.res ? Net.settle(r, m.res) : null;
      if (x) { r.res = x; n++; }
    });
    return n;
  }
  function omFetch(code) {
    var L = null;
    B.leagues.forEach(function (x) { if (x.code === code) L = x; });
    if (!L || !window.fetch) return Promise.resolve(null);
    var sk = String(B.season).slice(2) + String(B.season + 1).slice(2);
    var bases = ['https://raw.githubusercontent.com/oladeeayo/open-matchday/master/data/', 'https://cdn.jsdelivr.net/gh/oladeeayo/open-matchday@master/data/'];
    function tryK(k) {
      return fetch(bases[k] + L.om + '/results_' + sk + '.csv', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .catch(function (e) { if (k + 1 < bases.length) return tryK(k + 1); throw e; });
    }
    return tryK(0).then(function (txt) { return Net.omResults(txt, B.om_map[code] || {}); }, function () { return null; });
  }
  function soft(p) { return p.then(null, function (e) { LOOK.err = e.message; return null; }); }
  function apiResults(list) {
    var got = 0, withId = list.filter(function (m) { return m.api && m.api.id; });
    var today = dayKey(new Date()), lo = shiftDay(today, -1), hi = shiftDay(today, 1);
    var link = list.filter(function (m) { return !(m.api && m.api.id) && m.lg !== 'other' && m.hn && m.an && Net.LG_API[m.lg]; });
    var p = Promise.resolve();
    link.forEach(function (m) {
      p = p.then(function () {
        var lid = Net.LG_API[m.lg], map = B.om_map[m.lg], all = [], q = Promise.resolve();
        [m.d, shiftDay(m.d, 1)].filter(function (d) { return d >= lo && d <= hi; }).forEach(function (d) {
          q = q.then(function () { return soft(apiCached('/fixtures?date=' + d + '&league=' + lid + '&season=' + B.season + '&timezone=' + encodeURIComponent(TZ))).then(function (l) { all = all.concat(l || []); }); });
        });
        return q.then(function () {
          var r = Net.rankFixtures(all, Net.teamKeys(m.hn, map), Net.teamKeys(m.an, map), lid);
          if (Net.isSure(r)) { m.api = { id: r[0].f.fixture.id, sw: 0 }; withId.push(m); }
        });
      });
    });
    return p.then(function () {
      if (!withId.length) return 0;
      var ids = withId.map(function (m) { return m.api.id; }), fx = {}, chunks = [];
      for (var i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
      return Promise.all(chunks.map(function (c) {
        return soft(api('/fixtures?ids=' + c.join('-'))).then(function (r) { (r || []).forEach(function (f) { if (f && f.fixture) fx[f.fixture.id] = f; }); });
      })).then(function () {
        var q2 = Promise.resolve();
        withId.forEach(function (m) {
          var f = fx[m.api.id];
          if (!f) return;
          var s = Net.fixState(f, !!m.api.sw);
          if (!s.done) return;
          var any = setRes(m, 'g', s.g, '联网');
          any = setRes(m, 'g1', s.g1, '联网') || any;
          any = setRes(m, 'c', s.c, '联网') || any;
          if (any) got++;
          var need = needed(m), ids2 = m.api.sw ? [f.teams.away.id, f.teams.home.id] : [f.teams.home.id, f.teams.away.id];
          if (need.indexOf('c') >= 0) q2 = q2.then(function () {
            return soft(api('/fixtures/statistics?fixture=' + m.api.id)).then(function (st) { if (st) { var g = shallow(f); g.statistics = st; setRes(m, 'c', Net.fixState(g, !!m.api.sw).c, '联网'); } });
          });
          if (need.indexOf('c1') >= 0) q2 = q2.then(function () {
            return soft(api('/fixtures/statistics?fixture=' + m.api.id + '&half=true')).then(function (st) { if (st) setRes(m, 'c1', Net.firstHalfCorners(st, ids2), '联网'); });
          });
        });
        return q2.then(function () { return got; });
      });
    });
  }
  function lookupResults() {
    if (LOOK.busy) return;
    var first = settleAll(), pend = pendingMatches().filter(function (m) { return needed(m).length; });
    if (!pend.length) { recSave(); LOOK.msg = first ? '已结算 ' + first + ' 注。' : '没有要查结果的比赛。'; renderRec(); return; }
    LOOK.busy = true; LOOK.err = ''; LOOK.msg = '正在查找 ' + pend.length + ' 场比赛的结果…'; renderRec();
    var codes = {}, got = 0;
    pend.forEach(function (m) { if (m.lg !== 'other') codes[m.lg] = 1; });
    Promise.all(Object.keys(codes).map(function (c) { return omFetch(c).then(function (list) { return { c: c, list: list }; }); })).then(function (res) {
      var lists = {};
      res.forEach(function (x) { lists[x.c] = x.list; });
      pend.forEach(function (m) {
        var list = lists[m.lg], row = list && m.hn ? Net.omFind(list, m.hn, m.an, m.d, 10) : null;
        if (!row) return;
        var any = false;
        ['g', 'g1', 'c', 'c1'].forEach(function (k) { if (setRes(m, k, row[k], '公开数据')) any = true; });
        if (any) got++;
      });
      var left = pend.filter(function (m) { return needed(m).length; });
      return netKey() && left.length ? apiResults(left).then(function (n) { got += n; }) : null;
    }).then(function () {
      var n = settleAll() + first;
      recSave();
      var left = pendingMatches().filter(function (m) { return needed(m).length; }).length;
      LOOK.msg = '查到 ' + got + ' 场的结果，新结算 ' + n + ' 注。' + (left ? '还有 ' + left + ' 场缺结果：公开数据一般隔天才更新' +
        (netKey() ? '' : '（填了联网 key 可以更快查到）') + '，也可以点那场的“填结果”自己补。' : '') + (LOOK.err ? '（联网：' + LOOK.err + '）' : '');
    }, function (e) { LOOK.msg = '查找失败：' + e.message; }).then(function () { LOOK.busy = false; if (S.tab === 'rec') renderRec(); });
  }

  /* ---------------- records tab: statistics, list, manual results ---------------- */
  var RF = { ph: 'all', pos: 0, ed: null, del: null };
  var GROUP = { ftc_ou: '全场角球大小', htc_ou: '半场角球大小', ftc_ah: '全场角球让球', htc_ah: '半场角球让球', hc_ou: '球队角球大小', ac_ou: '球队角球大小',
                ftc_x: '角球独赢', g_ou: '进球大小', gh_ou: '进球大小', g_ah: '进球让球', gh_ah: '进球让球', g_1x2: '胜平负', gh_1x2: '胜平负', btts: '双方进球' };
  var RES_NAME = { g: '全场比分', g1: '半场比分', c: '全场角球', c1: '上半场角球' };
  function agg(list) {
    var a = { n: 0, w: 0, hw: 0, p: 0, hl: 0, l: 0, pl: 0, ss: 0, ev: 0, wu: 0, lu: 0, mw: 0, ml: 0 };
    list.forEach(function (r) {
      var u = r.res.u;
      a.n++; a.pl += r.res.pl; a.ss += r.res.pl * r.res.pl; a.ev += r.ev;
      if (u >= 1) a.w++; else if (u > 0) a.hw++; else if (u === 0) a.p++; else if (u > -1) a.hl++; else a.l++;
      a.wu += Math.max(0, u); a.lu += Math.max(0, -u); a.mw += r.p[0]; a.ml += r.p[2];
    });
    a.hit = a.wu + a.lu > 0 ? a.wu / (a.wu + a.lu) : null;
    a.mhit = a.mw + a.ml > 0 ? a.mw / (a.mw + a.ml) : null;
    a.roi = a.n ? a.pl / a.n : null; a.eroi = a.n ? a.ev / a.n : null;
    a.ci = a.n > 1 ? 1.96 * Math.sqrt(Math.max(0, (a.ss - a.n * a.roi * a.roi) / (a.n - 1)) / a.n) : null;
    return a;
  }
  function pctN(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
  function units(x) { return (x > 0 ? '+' : (x < 0 ? '−' : '')) + Math.abs(x).toFixed(2); }
  function recLabel(r) {
    var t = fullLabel({ m: r.m, l: r.l }, r.s, null);
    if (r.b) t += '（' + r.b[0] + ':' + r.b[1] + ' 起算）';
    return t;
  }
  function outcome(r) {
    if (!r.res) return '<span class="oc pend">待定</span>';
    var u = r.res.u, t = u >= 1 ? '赢' : u > 0 ? '赢半' : u === 0 ? '走水' : u > -1 ? '输半' : '输';
    return '<span class="oc ' + (u > 0 ? 'win' : u < 0 ? 'lose' : 'push') + '">' + t + ' ' + units(r.res.pl) + '</span>';
  }
  function statTable(title, rows) {
    var h = '<div class="sec">' + title + '</div><div class="tw"><table class="mk"><thead><tr><th></th><th>注数</th><th>命中率</th><th>回报率</th><th>模型预计</th></tr></thead><tbody>';
    rows.forEach(function (x) {
      h += '<tr><td>' + esc(x[0]) + '</td><td>' + x[1].n + '</td><td>' + pctN(x[1].hit) + '</td><td class="' + (x[1].roi > 0 ? 'pos' : x[1].roi < 0 ? 'neg' : '') + '">' +
        (x[1].roi === null ? '—' : sgnPct(x[1].roi)) + '</td><td>' + (x[1].eroi === null ? '—' : sgnPct(x[1].eroi)) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function renderRec() {
    var nAll = REC.recs.length, nPend = REC.recs.filter(function (r) { return !r.res; }).length;
    var mids = {};
    REC.recs.forEach(function (r) { mids[r.mid] = 1; });
    var h = '<h2>记录 <span class="sub">· ' + nAll + ' 注、' + Object.keys(mids).length + ' 场</span></h2>' +
      '<button class="btn pri wide" data-r="look"' + (LOOK.busy || !nPend ? ' disabled' : '') + '>' + (LOOK.busy ? '查找中…' : '一键查找比赛结果' + (nPend ? '（待结算 ' + nPend + ' 注）' : '')) + '</button>' +
      '<div class="row-btns"><button class="btn" data-r="export"' + (nAll ? '' : ' disabled') + '>导出给 Claude</button><button class="btn ghost" data-r="import">导入</button></div>' +
      (LOOK.msg ? '<p class="hint">' + esc(LOOK.msg) + '</p>' : '') +
      (nAll ? '' : '<p class="hint">在「赛前」或「滚球」的期望收益下面点“存正期望”或“全部存”。比赛结束后回来点“一键查找比赛结果”，会自动判断赢输、算命中率和盈亏。</p>') +
      (netKey() ? '' : '<p class="hint">没填联网 key 也能查：结果从免费公开数据里找（一般隔天更新）。<button class="lnk" data-r="setkey">填 key</button></p>');
    $('rec-act').innerHTML = h;
    // statistics
    var list = REC.recs.filter(function (r) { return (RF.ph === 'all' || r.ph === RF.ph) && (!RF.pos || r.ev > 0); }), done = list.filter(function (r) { return !!r.res; });
    var s = '<h2>统计 <span class="sub">· 每注 1 份</span></h2><div class="seg">' +
      [['all', '全部'], ['pre', '赛前'], ['live', '滚球']].map(function (x) { return '<button class="chipb" data-r="ph" data-v="' + x[0] + '" aria-pressed="' + (RF.ph === x[0]) + '">' + x[1] + '</button>'; }).join('') +
      '<button class="chipb" data-r="pos" aria-pressed="' + (!!RF.pos) + '">只看存的时候正期望</button></div>';
    if (!done.length) s += '<p class="hint">' + (list.length ? '这些注还没结算。' : '还没有记录。') + '</p>';
    else {
      var a = agg(done);
      s += '<div class="kpis">' +
        '<div class="kpi"><div class="k">命中率</div><div class="v sm num">' + pctN(a.hit) + '</div><div class="s">模型预计 ' + pctN(a.mhit) + '</div></div>' +
        '<div class="kpi"><div class="k">盈亏</div><div class="v sm num ' + (a.pl > 0 ? 'pos' : a.pl < 0 ? 'neg' : '') + '">' + units(a.pl) + '</div><div class="s">' + a.n + ' 注，单位：份</div></div>' +
        '<div class="kpi"><div class="k">回报率</div><div class="v sm num ' + (a.roi > 0 ? 'pos' : a.roi < 0 ? 'neg' : '') + '">' + sgnPct(a.roi) + '</div><div class="s">模型预计 ' + sgnPct(a.eroi) + '</div></div></div>' +
        '<p class="hint">赢 ' + a.w + ' · 赢半 ' + a.hw + ' · 走水 ' + a.p + ' · 输半 ' + a.hl + ' · 输 ' + a.l + '。' +
        (a.ci !== null ? '回报率的误差范围大约 ±' + (a.ci * 100).toFixed(0) + '%' + (a.ci > Math.abs(a.roi) ? '，比回报率本身还大，现在还看不出真假' : '') + '。' : '') + '</p>';
      var by = {}, order = [];
      done.forEach(function (r) { var g = GROUP[r.m] || r.m; if (!by[g]) { by[g] = []; order.push(g); } by[g].push(r); });
      s += statTable('按玩法', order.map(function (g) { return [g, agg(by[g])]; }));
      var bk = [['负的', function (e) { return e < 0; }], ['0~2%', function (e) { return e >= 0 && e < 0.02; }],
                ['2~5%', function (e) { return e >= 0.02 && e < 0.05; }], ['5% 以上', function (e) { return e >= 0.05; }]];
      var rowsB = bk.map(function (x) { return [x[0], agg(done.filter(function (r) { return x[1](r.ev); }))]; }).filter(function (x) { return x[1].n; });
      if (rowsB.length > 1) s += statTable('按存的时候的期望', rowsB);
      if (RF.ph === 'all') {
        var rowsP = [['赛前', agg(done.filter(function (r) { return r.ph === 'pre'; }))], ['滚球', agg(done.filter(function (r) { return r.ph === 'live'; }))]].filter(function (x) { return x[1].n; });
        if (rowsP.length > 1) s += statTable('赛前 / 滚球', rowsP);
      }
    }
    $('rec-stats').innerHTML = s;
    // matches, newest first
    var ms = Object.keys(mids).map(function (id) { return REC.matches[id]; }).filter(function (m) { return !!m; });
    ms.sort(function (x, y) { return (y.ko || y.last || y.at || 0) - (x.ko || x.last || x.at || 0); });
    var l = '<h2>比赛</h2>';
    if (!ms.length) l += '<p class="hint">还没有。</p>';
    ms.forEach(function (m) {
      var rs = recsOf(m.id), pend = rs.filter(function (r) { return !r.res; }).length, sum = 0;
      rs.forEach(function (r) { if (r.res) sum += r.res.pl; });
      l += '<div class="mc" data-mid="' + m.id + '"><div class="mc-h"><b>' + esc(m.h) + ' vs ' + esc(m.a) + '</b><span class="sub">' + esc(lgName(m.lg)) + ' · ' +
        (m.ko ? fmtKo(m.ko) : m.d.slice(5).replace('-', '/')) + '</span>' + (pend ? '<span class="tag">待结算 ' + pend + '</span>' : '<span class="tag ' + (sum > 0 ? 'pos' : sum < 0 ? 'neg' : '') + '">' + units(sum) + ' 份</span>') + '</div>';
      var known = ['g', 'g1', 'c', 'c1'].filter(function (k) { return m.res && m.res[k]; });
      // where each number came from: one note when they all share a source, otherwise one per number
      var srcs = {};
      known.forEach(function (k) { srcs[(m.src && m.src[k]) || ''] = 1; });
      var oneSrc = Object.keys(srcs).length === 1;
      l += known.length ? '<div class="mc-r">' + known.map(function (k) {
        return RES_NAME[k] + ' ' + m.res[k][0] + ':' + m.res[k][1] + (!oneSrc && m.src && m.src[k] ? ' <small>（' + esc(m.src[k]) + '）</small>' : '');
      }).join(' · ') + (oneSrc && m.src && m.src[known[0]] ? ' <small>（' + esc(m.src[known[0]]) + '）</small>' : '') + '</div>' : '<div class="mc-r miss">还没有结果</div>';
      rs.slice().sort(function (x, y) { return x.t - y.t; }).forEach(function (r) {
        l += '<div class="rr"><span class="t">' + esc(recLabel(r)) + ' <span class="o">@' + (+r.o).toFixed(2) + '</span><small>' + (r.ph === 'live' ? '滚球' + (r.st ? ' ' + r.st.min + '′ ' + r.st.g[0] + ':' + r.st.g[1] : '') : '赛前') +
          ' · 期望 ' + sgnPct(r.ev) + ' · 赢 ' + pctN(r.p[0]) + (r.src ? ' · ' + esc(r.src) : '') + '</small></span>' + outcome(r) + '</div>';
      });
      if (RF.ed && RF.ed.mid === m.id) l += editorHTML(m);
      l += '<div class="mc-b"><button class="lnk" data-r="ed">' + (known.length ? '改结果' : '填结果') + '</button>' +
        '<button class="lnk" data-r="del">' + (RF.del === m.id ? '再点一次：删除这场' : '删除这场') + '</button></div></div>';
    });
    $('rec-list').innerHTML = l;
  }
  // manual results: steppers for every result the bets of this match use
  function editorHTML(m) {
    var E = RF.ed, h = '<div class="ed">';
    E.keys.forEach(function (k) {
      h += '<div class="ed-r"><span class="tl">' + RES_NAME[k] + '</span>' + [0, 1].map(function (i) {
        return '<span class="stp"><button data-r="edv" data-k="' + k + '" data-i="' + i + '" data-d="-1">−</button><span class="lv">' + E.v[k][i] + '</span><button data-r="edv" data-k="' + k + '" data-i="' + i + '" data-d="1">+</button></span>';
      }).join('<span class="sep">:</span>') + '</div>';
    });
    return h + '<div class="row-btns"><button class="btn pri" data-r="edsave">保存结果</button><button class="btn ghost" data-r="edx">取消</button></div></div>';
  }
  function openEditor(m) {
    var keys = {}, b = board(), v = {}, mine = b.mid === m.id;
    recsOf(m.id).forEach(function (r) { var k = Net.need(r.m); if (k) keys[k] = 1; });
    var ks = ['g', 'g1', 'c', 'c1'].filter(function (k) { return keys[k]; });
    ks.forEach(function (k) {
      if (m.res && m.res[k]) v[k] = m.res[k].slice();
      else if (mine && (k === 'c' || k === 'g')) v[k] = k === 'c' ? [S.live.ch, S.live.ca] : [S.live.gh, S.live.ga];
      else if (mine && b.htSnap) v[k] = (k === 'c1' ? b.htSnap.c : b.htSnap.g).slice();
      else v[k] = [0, 0];
    });
    RF.ed = { mid: m.id, keys: ks, v: v };
  }
  function onRecClick(e) {
    var t = closestAttr(e.target, 'data-r', $('v-rec'));
    if (!t || t.disabled) return;
    var a = t.getAttribute('data-r'), card = closestAttr(t, 'data-mid', $('v-rec')), m = card ? REC.matches[card.getAttribute('data-mid')] : null;
    if (a === 'look') lookupResults();
    else if (a === 'export') openExport();
    else if (a === 'import') openImport();
    else if (a === 'setkey') setTab('about');
    else if (a === 'ph') { RF.ph = t.getAttribute('data-v'); renderRec(); }
    else if (a === 'pos') { RF.pos = RF.pos ? 0 : 1; renderRec(); }
    else if (a === 'ed' && m) { if (RF.ed && RF.ed.mid === m.id) RF.ed = null; else openEditor(m); renderRec(); }
    else if (a === 'edx') { RF.ed = null; renderRec(); }
    else if (a === 'edv' && RF.ed) {
      var k = t.getAttribute('data-k'), i = +t.getAttribute('data-i');
      RF.ed.v[k][i] = Math.max(0, Math.min(k.charAt(0) === 'c' ? 40 : 15, RF.ed.v[k][i] + (+t.getAttribute('data-d'))));
      renderRec();
    } else if (a === 'edsave' && RF.ed && m) {
      if (!m.res) m.res = {};
      if (!m.src) m.src = {};
      RF.ed.keys.forEach(function (k) { m.res[k] = RF.ed.v[k].slice(); m.src[k] = '手动'; });
      m.fin = true;
      recsOf(m.id).forEach(function (r) { r.res = null; });   // settle again with the corrected numbers
      var n = settleAll();
      RF.ed = null; recSave(); toast('已结算 ' + n + ' 注'); renderRec();
    } else if (a === 'del' && m) {
      if (RF.del !== m.id) { RF.del = m.id; renderRec(); setTimeout(function () { if (RF.del === m.id) { RF.del = null; if (S.tab === 'rec') renderRec(); } }, 4000); return; }
      RF.del = null;
      REC.recs = REC.recs.filter(function (r) { return r.mid !== m.id; });
      delete REC.matches[m.id];
      recSave(); renderRec();
    }
  }

  /* ---------------- export / import ---------------- */
  var README = '角球进球预测的记录导出档（fmt=1）。matches：每场比赛 id、lg 联赛代码（other=其他联赛）、h/a 主客队、hn/an 英文队名、d 日期、ko 开球时间（毫秒）、api 联网比赛 id（sw=1 主客跟联网相反）、' +
    'res 结果 {g 全场比分[主,客]、g1 半场比分、c 全场角球、c1 上半场角球}、src 结果来源。recs：每一注 id、mid 比赛 id、t 存的时间（毫秒）、ph（pre 赛前 / live 滚球）、' +
    'm 玩法（ftc_ou 全场角球大小、htc_ou 半场角球大小、ftc_ah 全场角球让球、htc_ah 半场角球让球、hc_ou/ac_ou 主/客队角球大小、ftc_x 角球独赢、g_ou 进球大小、g_ah 进球让球、g_1x2 胜平负、' +
    'gh_ou/gh_ah/gh_1x2 半场进球大小/让球/胜平负、btts 双方进球）、l 盘口（让球是主队的让球数，负数=主队让；0.25 的倍数，例如 2.75=2.5/3）、' +
    's 选项（大小盘 0大 1小；让球 0主 1客；三项 0主 1平 2客；双方进球 0是 1否）、o 欧赔、p 模型给的 [赢, 走水, 输] 机会（四分之一盘按两半平均）、fair 公平赔率、ev 存的时候的期望收益、' +
    'src 赔率来源（空=自己填，其他=联网读到的庄家）、st 滚球时的状态 {min 分钟, per 半场, g 比分, c 角球, r 红牌}、b 滚球让球从这个比分起算、' +
    'res 结算 {u 赢的单位（1 赢、0.5 赢半、0 走水、-0.5 输半、-1 输）, pl 每注 1 份的盈亏}。模型数据截至 data_until。unused_bets：联网读到但盘口板用不上的盘名。';
  function openExport() {
    var used = {}, ms = [];
    REC.recs.forEach(function (r) { used[r.mid] = 1; });
    Object.keys(used).forEach(function (id) { if (REC.matches[id]) ms.push(REC.matches[id]); });
    var obj = { app: '角球进球预测', fmt: 1, ver: APP_VER, exported: new Date().toISOString().slice(0, 16), data_until: S.extraUntil || B.data_until, readme: README, matches: ms, recs: REC.recs,
                unused_bets: S.net.unk || [] };
    var text = JSON.stringify(obj), name = '角球进球预测_记录_' + dayKey(new Date()) + '.json', canShare = false;
    try { canShare = !IN_ARTIFACT && !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([text], name, { type: 'application/json' })] })); } catch (e) { canShare = false; }
    // inside the Claude page files cannot be saved: copying the text is the way out there
    var h = '<p class="hint">' + REC.recs.length + ' 注、' + ms.length + ' 场。' + (IN_ARTIFACT ? '复制文字直接贴给 Claude 分析（存成文件请用主屏幕上的 app）。' : '可以存成文件，或者复制文字直接贴给 Claude 分析。') + '</p><div class="row-btns">' +
      (canShare ? '<button class="btn pri" data-x="share">分享文件</button>' : '<button class="btn pri" data-x="copy">复制文字</button>') +
      (IN_ARTIFACT ? '' : '<button class="btn" data-x="dl">下载文件</button>') + '</div>' + (canShare ? '<div class="row-btns"><button class="btn" data-x="copy">复制文字</button></div>' : '') +
      '<textarea id="exp-text" class="ta">' + esc(text) + '</textarea>';
    openSheet('导出记录', h, function (e) {
      var t = closestAttr(e.target, 'data-x', $('sheet-body'));
      if (!t) return;
      var x = t.getAttribute('data-x');
      if (x === 'share') navigator.share({ files: [new File([text], name, { type: 'application/json' })] }).then(function () { toast('已送出'); }, function (er) { if (er && er.name !== 'AbortError') toast('分享失败，请改用“复制文字”'); });
      else if (x === 'dl') {
        var url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000); toast('已开始下载；没有反应就用“复制文字”');
      } else if (x === 'copy') copyText($('exp-text'), text);
    });
  }
  function copyText(ta, text) {
    function fb() { try { ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); document.execCommand('copy'); toast('已复制'); } catch (e) { toast('文字已全选，请手动复制'); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('已复制，可以直接贴给 Claude'); }, fb); else fb();
  }
  function openImport() {
    var h = '<p class="hint">把导出的文字贴到下面，或者选择导出的文件。会跟本机的记录合并，不会重复（例如把 iPhone 上的记录合并到 iPad）。</p>' +
      '<textarea id="imp-text" class="ta" placeholder="贴上导出的文字"></textarea>' +
      '<div class="row-btns"><button class="btn pri" data-x="go">导入这段文字</button><label class="btn filebtn">选择文件<input type="file" id="imp-file" accept=".json,application/json,text/plain"></label></div>';
    openSheet('导入记录', h, function (e) { var t = closestAttr(e.target, 'data-x', $('sheet-body')); if (t && t.getAttribute('data-x') === 'go') doImport($('imp-text').value); });
    $('imp-file').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { doImport(String(rd.result || '')); };
      rd.readAsText(f);
    });
  }
  function doImport(txt) {
    var o;
    try { o = JSON.parse(txt); } catch (e) { toast('读不懂这段文字，请贴完整的导出内容'); return; }
    if (!o || o.app !== '角球进球预测' || !Array.isArray(o.recs) || !Array.isArray(o.matches)) { toast('这不是角球进球预测的导出档'); return; }
    var nm = 0, nr = 0, byId = {};
    o.matches.forEach(function (m) {
      if (!m || !m.id) return;
      var cur = REC.matches[m.id];
      if (!cur) { m.res = m.res || {}; m.src = m.src || {}; REC.matches[m.id] = m; nm++; return; }
      ['g', 'g1', 'c', 'c1'].forEach(function (k) { if (m.res && m.res[k]) setRes(cur, k, m.res[k], (m.src && m.src[k]) || '导入'); });
    });
    REC.recs.forEach(function (r, i) { byId[r.id] = i; });
    o.recs.forEach(function (r) {
      if (!r || !r.id || !r.mid || !MK[r.m] || !REC.matches[r.mid]) return;
      if (byId[r.id] === undefined) { byId[r.id] = REC.recs.length; REC.recs.push(r); nr++; }
      else if (!REC.recs[byId[r.id]].res && r.res) REC.recs[byId[r.id]] = r;
    });
    settleAll(); recSave(); closeSheet(); toast('已导入 ' + nr + ' 注、' + nm + ' 场'); renderRec();
  }

  /* ---------------- settings: API-Football key ---------------- */
  function renderNet() {
    var used = (S.net.used || {})[dayKey(new Date())] || 0;
    $('about-net').innerHTML = '<h2>联网 <span class="sub">（自动填赔率、同步比分、查结果）</span></h2>' +
      '<p class="small">用 API-Football 的免费 key，每天 100 次：读一场赛前赔率约 2 次，滚球同步约 3 次，查一场结果 1–3 次。' +
      (S.net.from ? '已自动带入「' + esc(S.net.from) + '」里的 key。' : '') + '</p>' +
      '<label class="f"><span>API key</span><input id="net-key" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="贴上 32 位的 key" value="' + esc(netKey()) + '"></label>' +
      '<div class="row-btns"><button class="btn pri" id="net-save">保存</button><button class="btn" id="net-test">测试</button></div>' +
      '<p class="hint" id="net-msg">本机今天已用 ' + used + ' 次。</p>' +
      '<p class="small">没有 key 也能用：赔率自己填，比赛结果会从免费的公开数据里找（一般隔天更新）。免费 key 在 dashboard.api-football.com 注册。</p>';
    $('net-save').addEventListener('click', function () { S.net.key = $('net-key').value.trim(); S.net.from = ''; save(); $('net-msg').textContent = S.net.key ? '已保存。' : '已清除。'; });
    $('net-test').addEventListener('click', function () {
      S.net.key = $('net-key').value.trim(); save();
      $('net-msg').textContent = '测试中…';
      api('/status').then(function (r) {
        var q = (r && r.requests) || {}, sub = (r && r.subscription) || {};
        $('net-msg').textContent = 'key 可以用：方案 ' + (sub.plan || '?') + '，今天已用 ' + (q.current === undefined ? '?' : q.current) + ' / ' + (q.limit_day || '?') + ' 次（所有用这个 key 的 app 合计）。';
      }, function (e) { $('net-msg').textContent = '不行：' + e.message; });
    });
  }

  /* ---------------- layout: one column on phones, two on tablets ---------------- */
  var ORDER = {
    pre: { one: ['p-match', 'pre-sum', 'pre-board', 'pre-kpi', 'pre-corners', 'pre-goals', 'p-tolive'],
           L: ['p-match', 'pre-board', 'p-tolive'], R: ['pre-sum', 'pre-kpi', 'pre-corners', 'pre-goals'] },
    live: { one: ['lv-boardp', 'lv-counters', 'live-kpi', 'live-sum', 'live-board', 'live-corners', 'live-goals', 'lv-resetbox'],
            L: ['lv-boardp', 'lv-counters', 'live-kpi', 'live-corners', 'live-goals', 'lv-resetbox'], R: ['live-sum', 'live-board'] },
    rec: { one: ['rec-act', 'rec-stats', 'rec-list'], L: ['rec-act', 'rec-stats'], R: ['rec-list'] },
    about: { one: ['about-data', 'about-net', 'about-set', 'about-text'], L: ['about-data', 'about-net', 'about-set'], R: ['about-text'] }
  };
  var wideNow = null;
  function layout() {
    var wide = (window.innerWidth || document.documentElement.clientWidth) >= 740;
    if (wide === wideNow) return;
    wideNow = wide;
    ['pre', 'live', 'rec', 'about'].forEach(function (v) {
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
    if (!$('sheet').hidden) closeSheet();
    S.tab = t; save();
    ['pre', 'live', 'rec', 'about'].forEach(function (k) {
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
    else if (S.tab === 'rec') renderRec();
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
    board().live.forEach(function (r) { r.o = r.o.map(function () { return ''; }); r.os = r.o.map(function () { return ''; }); r.alt = null; r.book = ''; r.ts = 0; r.sig = ''; if (hasLine(r.m)) r.auto = true; });
  }
  function showOther() {
    $('o-avg').textContent = (num(S.setup.avg) || 10).toFixed(1);
    $('o-share').textContent = Math.round(num(S.setup.share) || 54) + '%';
  }

  $('tab-pre').addEventListener('click', function () { setTab('pre'); });
  $('tab-live').addEventListener('click', function () { setTab('live'); });
  $('tab-rec').addEventListener('click', function () { setTab('rec'); });
  $('tab-about').addEventListener('click', function () { setTab('about'); });
  ['pre', 'live'].forEach(function (kind) {
    $(kind + '-sum').addEventListener('click', function (e) {
      var t = closestAttr(e.target, 'data-a', this);
      if (t && !t.disabled && (t.getAttribute('data-a') === 'save-pos' || t.getAttribute('data-a') === 'save-all')) saveRecs(kind, t.getAttribute('data-a') === 'save-pos');
    });
  });
  $('v-rec').addEventListener('click', onRecClick);
  $('sheet-x').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', function (e) { if (e.target === this) closeSheet(); else if (SHEET) SHEET(e); });
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
    if (L.per === 1 && !L.ht) { L.ht = true; L.running = false; L.baseMin = 45; board().htSnap = { c: [L.ch, L.ca], g: [L.gh, L.ga] }; }
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
