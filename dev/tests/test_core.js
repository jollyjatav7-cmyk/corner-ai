// node test harness: prints model outputs for fixed scenarios as JSON
var fs = require('fs');
var Core = require('./app_core.js');
var B = JSON.parse(fs.readFileSync(__dirname + '/bundle.json', 'utf8'));
var t0 = Date.now();
var st = Core.buildRatings(B);
var tRat = Date.now() - t0;

function find(code, home, away) {
  var li = B.leagues.findIndex(function (L) { return L.code === code; });
  var T = B.leagues[li].teams;
  return { li: li, hi: T.findIndex(function (t) { return t.n === home; }), ai: T.findIndex(function (t) { return t.n === away; }) };
}
function summ(pm) {
  var gm = Core.goalsMarkets(pm.goalsFT), gh = Core.goalsMarkets(pm.goalsHT);
  var ft = pm.cornersFT, ht = pm.cornersHT;
  function ov(m, L) { var s = Core.betStats(m.tot, m.cur[0] + m.cur[1], 'over', L); return s.win; }
  function dv(m, L) { var s = Core.betStats(m.dif, m.difOff + m.cur[0] - m.cur[1], 'over', L); return s.win; }
  return { lh: pm.lh, la: pm.la, mh: pm.mh, ma: pm.ma, mh1: pm.mh1, ma1: pm.ma1,
    ft_o95: ov(ft, 9.5), ft_o105: ov(ft, 10.5), ft_d15: dv(ft, 1.5), ht_o45: ov(ht, 4.5), ht_d05: dv(ht, 0.5),
    pH: gm.pH, pD: gm.pD, pA: gm.pA, g_o25: Core.betStats(gm.tot, 0, 'over', 2.5).win, ht_pD: gh.pD };
}
var out = { ratings_ms: tRat, nMatches: st.nMatches };
var S1 = find('E0', 'Arsenal', 'Chelsea');
var odds1 = { h: 1.80, d: 3.80, a: 4.50, ouLine: 2.5, over: 1.85, under: 1.95 };
var t1 = Date.now();
var pm1 = Core.prematch({ B: B, st: st, li: S1.li, hi: S1.hi, ai: S1.ai, odds: odds1 });
out.prematch_ms = Date.now() - t1;
out.S1 = summ(pm1);
out.S2 = summ(Core.prematch({ B: B, st: st, li: S1.li, hi: S1.hi, ai: S1.ai, odds: null }));
var S3 = find('SP1', 'Barcelona', 'Getafe');
out.S3 = summ(Core.prematch({ B: B, st: st, li: S3.li, hi: S3.hi, ai: S3.ai, odds: { h: 1.25, d: 6.0, a: 11.0, ouLine: 3.25, over: 1.90, under: 1.90 } }));
// live scenarios on S1
function lsum(lv) {
  var ft = lv.cornersFT, gm = Core.goalsMarkets(lv.goalsFT);
  var r = { remFT: lv.remFT, mult: lv.mult, sofar: lv.sofar,
    ft_o105: Core.betStats(ft.tot, 0, 'over', 10.5).win, ft_o115: Core.betStats(ft.tot, 0, 'over', 11.5).win,
    pH: gm.pH, pD: gm.pD, pA: gm.pA, g_o25: Core.betStats(gm.tot, 0, 'over', 2.5).win, next: lv.next, nextCorner: lv.nextCorner };
  // NOTE: tot pmf is of the REMAINING corners; current count is added through the offset argument
  r.ft_o105 = Core.betStats(ft.tot, ft.cur[0] + ft.cur[1], 'over', 10.5).win;
  r.ft_o115 = Core.betStats(ft.tot, ft.cur[0] + ft.cur[1], 'over', 11.5).win;
  if (lv.cornersHT) { r.remHT = lv.remHT; r.ht_o45 = Core.betStats(lv.cornersHT.tot, lv.cornersHT.cur[0] + lv.cornersHT.cur[1], 'over', 4.5).win; }
  return r;
}
var t2 = Date.now();
out.L1 = lsum(Core.live(B, pm1, { per: 2, minute: 60, gh: 1, ga: 0, ch: 5, ca: 3, rh: 0, ra: 0 }));
out.live_ms = Date.now() - t2;
out.L2 = lsum(Core.live(B, pm1, { per: 1, minute: 30, gh: 0, ga: 0, ch: 2, ca: 4, rh: 1, ra: 0 }));
out.L3 = lsum(Core.live(B, pm1, { per: 2, minute: 45, ht: true, gh: 0, ga: 1, ch: 3, ca: 3, rh: 0, ra: 0 }));
// ratings sample for cross-check
var e0 = B.leagues[S1.li];
out.rat = {};
['Arsenal', 'Chelsea', 'Man City'].forEach(function (n) {
  var i = e0.teams.findIndex(function (t) { return t.n === n; });
  out.rat[n] = st.att[S1.li][i].concat(st.dfn[S1.li][i]);
});
out.base_E0 = st.base[S1.li];
console.log(JSON.stringify(out, null, 1));
