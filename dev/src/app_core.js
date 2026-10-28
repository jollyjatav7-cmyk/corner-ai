/* 角球进球预测 — model core (no DOM). Written in conservative ES5 so it runs on old iOS Safari. */
var Core = (function () {
  'use strict';
  var G = 11;            // goals 0..10 per team
  var MC = 26;           // corners 0..25 per team (joint matrix size)
  var GH10 = { x: [-4.859462828332, -3.581823483552, -2.484325841639, -1.465989094391, -0.484935707515, 0.484935707515, 1.465989094391, 2.484325841639, 3.581823483552, 4.859462828332],
               w: [4.31065263e-06, 0.00075807093431, 0.01911158050077, 0.13548370298027, 0.34464233493202, 0.34464233493202, 0.13548370298027, 0.01911158050077, 0.00075807093431, 4.31065263e-06] };
  var LOGF = [0];
  for (var i0 = 1; i0 < 400; i0++) LOGF[i0] = LOGF[i0 - 1] + Math.log(i0);

  function poisVec(lam, m) {
    var out = new Array(m), lg = Math.log(Math.max(lam, 1e-12));
    for (var k = 0; k < m; k++) out[k] = Math.exp(k * lg - lam - LOGF[k]);
    return out;
  }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /* ---------------- ratings (score-driven Poisson updates) ---------------- */
  // r vector layout per team: [c_att, s_att, t_att, g_att, c_dfn, s_dfn, t_dfn, g_dfn]
  var MET = ['c', 's', 't', 'g'];
  function buildRatings(B, extra) {
    var L = B.leagues, st = { att: [], dfn: [], base: [] }, li, ti, k;
    for (li = 0; li < L.length; li++) {
      st.att.push([]); st.dfn.push([]); st.base.push({});
      for (ti = 0; ti < L[li].teams.length; ti++) {
        var r = L[li].teams[ti].r;
        st.att[li].push([r[0], r[1], r[2], r[3]]);
        st.dfn[li].push([r[4], r[5], r[6], r[7]]);
      }
      for (k = 0; k < 4; k++) st.base[li][MET[k]] = [L[li].base[MET[k]][0], L[li].base[MET[k]][1]];
    }
    var ms = B.matches.slice();
    if (extra && extra.length) ms = ms.concat(extra);
    var counted = 0;
    for (var mi = 0; mi < ms.length; mi++) {
      var m = ms[mi];
      li = m[0];
      var h = m[2], a = m[3];
      // count pairs in metric order c, s, t, g
      var Y = [[m[4], m[5]], [m[6], m[7]], [m[8], m[9]], [m[10], m[11]]];
      for (k = 0; k < 4; k++) {
        var yh = Y[k][0], ya = Y[k][1];
        if (yh < 0 || ya < 0) continue;
        var p = B.rating_params[MET[k]], cap = p.cap;
        var bh = st.base[li][MET[k]][0], ba = st.base[li][MET[k]][1];
        var mh = Math.exp(bh + st.att[li][h][k] + st.dfn[li][a][k]);
        var ma = Math.exp(ba + st.att[li][a][k] + st.dfn[li][h][k]);
        var eh = clamp((yh - mh) / mh, -cap, cap), ea = clamp((ya - ma) / ma, -cap, cap);
        st.att[li][h][k] += p.k_att * eh;
        st.dfn[li][a][k] += p.k_def * eh;
        st.att[li][a][k] += p.k_att * ea;
        st.dfn[li][h][k] += p.k_def * ea;
        st.base[li][MET[k]][0] += p.k_base * eh;
        st.base[li][MET[k]][1] += p.k_base * ea;
      }
      counted++;
    }
    st.nMatches = counted;
    return st;
  }

  /* ---------------- GLM predictions ---------------- */
  function sideFeatures(st, li, t, o, isHome, metric) {
    var A = st.att[li], D = st.dfn[li];
    var bidx = isHome ? 0 : 1;
    return {
      base: st.base[li][metric][bidx], home: isHome ? 1 : 0,
      c_att: A[t][0], c_dfn: D[o][0], s_att: A[t][1], s_dfn: D[o][1], t_att: A[t][2], t_dfn: D[o][2],
      g_att: A[t][3], g_dfn: D[o][3], opp_c_att: A[o][0], opp_c_dfn: D[t][0]
    };
  }
  function glm(spec, f) {
    var s = spec.intercept;
    for (var i = 0; i < spec.cols.length; i++) s += spec.coef[i] * f[spec.cols[i]];
    if (spec.offset) s += f[spec.offset];
    return Math.exp(s);
  }

  /* ---------------- odds: de-vig + Dixon-Coles solve ---------------- */
  function devigPower(odds) {
    var inv = odds.map(function (o) { return 1 / o; });
    var lo = 0.5, hi = 3.0, c = 1;
    for (var it = 0; it < 80; it++) {
      c = (lo + hi) / 2;
      var s = 0;
      for (var i = 0; i < inv.length; i++) s += Math.pow(inv[i], c);
      if (s < 1) hi = c; else lo = c;
    }
    var p = inv.map(function (v) { return Math.pow(v, c); });
    var t = p.reduce(function (a, b) { return a + b; }, 0);
    return p.map(function (v) { return v / t; });
  }
  function dcMatrix(lh, la, rho, maxg) {
    maxg = maxg || 12;
    var ph = poisVec(lh, maxg + 1), pa = poisVec(la, maxg + 1), M = [], s = 0, i, j;
    for (i = 0; i <= maxg; i++) {
      M.push([]);
      for (j = 0; j <= maxg; j++) {
        var v = ph[i] * pa[j];
        if (i === 0 && j === 0) v *= 1 - lh * la * rho;
        else if (i === 0 && j === 1) v *= 1 + lh * rho;
        else if (i === 1 && j === 0) v *= 1 + la * rho;
        else if (i === 1 && j === 1) v *= 1 - rho;
        M[i].push(v); s += v;
      }
    }
    for (i = 0; i <= maxg; i++) for (j = 0; j <= maxg; j++) M[i][j] /= s;
    return M;
  }
  // distribution over a summary of the score matrix
  function scoreSummary(M) {
    var n = M.length, pH = 0, pD = 0, pA = 0, tot = zeros(2 * n), i, j;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      var v = M[i][j];
      if (i > j) pH += v; else if (i === j) pD += v; else pA += v;
      tot[i + j] += v;
    }
    return { pH: pH, pD: pD, pA: pA, tot: tot };
  }
  function zeros(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = 0; return a; }

  /* generic bet evaluation on an integer random variable with pmf p[k] for k = k0 + idx.
     side 'over': wins if X > line ; 'under': wins if X < line. Lines may be x.0, x.5, x.25, x.75 */
  function splitLine(line) {
    var f = Math.round(line * 4) / 4, fr = f - Math.floor(f);
    if (Math.abs(fr - 0.25) < 1e-9) return [f - 0.25, f + 0.25];
    if (Math.abs(fr - 0.75) < 1e-9) return [f - 0.25, f + 0.25];
    return [f];
  }
  function wpl(pmf, off, side, L) { // win, push, lose for one sub-line
    var w = 0, p = 0, l = 0;
    for (var i = 0; i < pmf.length; i++) {
      var x = i + off, v = pmf[i];
      if (x === L) p += v;
      else if ((side === 'over' && x > L) || (side === 'under' && x < L)) w += v;
      else l += v;
    }
    return [w, p, l];
  }
  function betStats(pmf, off, side, line, odds) {
    var parts = splitLine(line), W = 0, P = 0, Lo = 0, sw = 0, sl = 0, ev = null;
    for (var k = 0; k < parts.length; k++) {
      var r = wpl(pmf, off, side, parts[k]);
      W += r[0] / parts.length; P += r[1] / parts.length; Lo += r[2] / parts.length;
      sw += r[0]; sl += r[2];
    }
    var fair = sw > 0 ? 1 + sl / sw : Infinity;
    if (odds) {
      ev = 0;
      for (var q = 0; q < parts.length; q++) {
        var rr = wpl(pmf, off, side, parts[q]);
        ev += (rr[0] * (odds - 1) - rr[2]) / parts.length;
      }
    }
    return { win: W, push: P, lose: Lo, fair: fair, ev: ev };
  }

  function solveLambdas(odds1x2, ouLine, ouOdds, rho, fallbackTotal) {
    // fair probabilities
    var q = devigPower(odds1x2);
    var qo = ouOdds ? devigPower(ouOdds) : null;
    var x = [Math.log(1.4), Math.log(1.1)];
    function resid(v) {
      var lh = Math.exp(v[0]), la = Math.exp(v[1]);
      var M = dcMatrix(lh, la, rho, 12), s = scoreSummary(M), r = [s.pH - q[0], s.pA - q[2]];
      if (qo) {
        // fair over odds 1/qo[0]  -> model EV of over at those odds should be 0
        var st = betStats(s.tot, 0, 'over', ouLine, 1 / qo[0]);
        r.push(st.ev * qo[0]);
      } else {
        r.push((lh + la - fallbackTotal) / 3);
      }
      return r;
    }
    for (var it = 0; it < 40; it++) {
      var r0 = resid(x), J = [], h = 1e-5, a, b;
      for (a = 0; a < 2; a++) {
        var xp = x.slice(); xp[a] += h;
        var r1 = resid(xp);
        J.push(r1.map(function (v, i) { return (v - r0[i]) / h; }));
      }
      // Gauss-Newton: (J^T J) d = -J^T r   (J stored as columns)
      var A11 = 0, A12 = 0, A22 = 0, g1 = 0, g2 = 0;
      for (b = 0; b < r0.length; b++) {
        A11 += J[0][b] * J[0][b]; A12 += J[0][b] * J[1][b]; A22 += J[1][b] * J[1][b];
        g1 += J[0][b] * r0[b]; g2 += J[1][b] * r0[b];
      }
      var det = A11 * A22 - A12 * A12;
      if (Math.abs(det) < 1e-14) break;
      var d1 = -(A22 * g1 - A12 * g2) / det, d2 = -(-A12 * g1 + A11 * g2) / det;
      var stp = Math.max(Math.abs(d1), Math.abs(d2));
      if (stp > 0.5) { d1 *= 0.5 / stp; d2 *= 0.5 / stp; }
      x[0] += d1; x[1] += d2;
      if (stp < 1e-9) break;
    }
    return { lh: Math.exp(x[0]), la: Math.exp(x[1]), q: q, qo: qo };
  }

  /* ---------------- minute engine ---------------- */
  function Engine(mult, stop1, stop2) {
    this.mult = mult;
    this.stop1 = stop1; this.stop2 = stop2;
    var S = [], m;
    for (m = 0; m < 45 + stop1; m++) S.push({ per: 1, min: m, tb: m < 45 ? 'h1_' + pad(Math.floor(m / 5) * 5) : 'h1_st', ph: 0 });
    for (m = 45; m < 90 + stop2; m++) S.push({ per: 2, min: m, tb: m < 90 ? 'h2_' + pad(Math.floor(m / 5) * 5) : 'h2_st', ph: m < 70 ? 1 : 2 });
    this.S = S;
    this.first2 = 45 + stop1;
    var lvl = mult.g2_level || 0;
    this.tmG = S.map(function (s) { return Math.exp(mult.g['t_' + s.tb] + (s.per === 2 ? lvl : 0)); });
    this.tmC = S.map(function (s) { return Math.exp(mult.c['t_' + s.tb]); });
    var self = this;
    this.sm = { g: [], c: [] };
    ['g', 'c'].forEach(function (kind) {
      for (var ph = 0; ph < 3; ph++) {
        var row = [];
        for (var gd = -10; gd <= 10; gd++) {
          var g = clamp(gd, -2, 2), v = 1;
          if (g !== 0) v = Math.exp(mult[kind]['gd' + (g > 0 ? '+' : '') + g + '_p' + ph]);
          row.push(v);
        }
        self.sm[kind].push(row);
      }
    });
    this.red = { g: [Math.exp(mult.g.own_red), Math.exp(mult.g.opp_red)], c: [Math.exp(mult.c.own_red), Math.exp(mult.c.opp_red)] };
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // slot index for (period, minute). minute is the match clock (2H starts at 45).
  Engine.prototype.slotOf = function (per, minute) {
    if (per === 1) return clamp(Math.floor(minute), 0, this.first2 - 1);
    var k = this.first2 + (Math.floor(minute) - 45);
    return clamp(k, this.first2, this.S.length - 1);
  };

  /* run from slot `start` (inclusive) to `upto` (exclusive). P0: Float64 array G*G. */
  Engine.prototype.run = function (bh, ba, start, P0, reds, cbh, cba, upto, cMult) {
    var S = this.S, end = upto === undefined || upto === null ? S.length : upto, k, i, j;
    var P = new Float64Array(G * G), Q;
    for (i = 0; i < G * G; i++) P[i] = P0[i];
    var rh = reds ? reds[0] : 0, ra = reds ? reds[1] : 0;
    var rg = this.red.g, rc = this.red.c;
    var rgh = (rh > 0 ? rg[0] : 1) * (ra > 0 ? rg[1] : 1), rga = (ra > 0 ? rg[0] : 1) * (rh > 0 ? rg[1] : 1);
    var rch = (rh > 0 ? rc[0] : 1) * (ra > 0 ? rc[1] : 1), rca = (ra > 0 ? rc[0] : 1) * (rh > 0 ? rc[1] : 1);
    var cmh = cMult ? cMult[0] : 1, cma = cMult ? cMult[1] : 1;
    var ECh = 0, ECa = 0, EC1h = 0, EC1a = 0, HT = null, perSlotC = [];
    // next goal tracking (from the starting score, assumed known when P0 is a point mass)
    var q = 1, nextH = 0, nextA = 0;
    var i0 = -1, j0 = -1, cnt = 0;
    for (i = 0; i < G; i++) for (j = 0; j < G; j++) if (P[i * G + j] > 0.999999) { i0 = i; j0 = j; cnt++; }
    for (k = start; k < end; k++) {
      var s = S[k];
      if (s.per === 2 && HT === null) HT = P.slice ? P.slice() : copyArr(P);
      var smg = this.sm.g[s.ph], smc = this.sm.c[s.ph];
      var tg = this.tmG[k], tc = this.tmC[k];
      if (cbh !== undefined && cbh !== null) {
        var eh = 0, ea = 0;
        for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
          var pv = P[i * G + j];
          if (pv < 1e-13) continue;
          eh += pv * smc[i - j + 10];
          ea += pv * smc[j - i + 10];
        }
        eh *= cbh * rch * tc * cmh; ea *= cba * rca * tc * cma;
        ECh += eh; ECa += ea; perSlotC.push([eh, ea]);
        if (s.per === 1) { EC1h += eh; EC1a += ea; }
      }
      if (i0 >= 0) {
        var gd0 = i0 - j0;
        var l1 = bh * rgh * tg * smg[gd0 + 10], l2 = ba * rga * tg * smg[-gd0 + 10];
        var p1 = 1 - Math.exp(-l1), p2 = 1 - Math.exp(-l2);
        nextH += q * (p1 * (1 - p2) + 0.5 * p1 * p2);
        nextA += q * (p2 * (1 - p1) + 0.5 * p1 * p2);
        q *= (1 - p1) * (1 - p2);
      }
      Q = new Float64Array(G * G);
      for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
        var v = P[i * G + j];
        if (v < 1e-15) continue;
        var gd = i - j;
        var lh = bh * rgh * tg * smg[gd + 10], la = ba * rga * tg * smg[-gd + 10];
        var ph = 1 - Math.exp(-lh), pa = 1 - Math.exp(-la);
        var ii = i + 1 < G ? i + 1 : i, jj = j + 1 < G ? j + 1 : j;
        Q[i * G + j] += v * (1 - ph) * (1 - pa);
        Q[ii * G + j] += v * ph * (1 - pa);
        Q[i * G + jj] += v * pa * (1 - ph);
        Q[ii * G + jj] += v * ph * pa;
      }
      P = Q;
    }
    if (HT === null) HT = P;
    return { P: P, HT: HT, ECh: ECh, ECa: ECa, EC1h: EC1h, EC1a: EC1a, perSlotC: perSlotC,
             next: [nextH, nextA, q] };
  };
  function copyArr(a) { var b = new Float64Array(a.length); for (var i = 0; i < a.length; i++) b[i] = a[i]; return b; }
  function point(gh, ga) { var P = new Float64Array(G * G); P[Math.min(gh, G - 1) * G + Math.min(ga, G - 1)] = 1; return P; }

  Engine.prototype.calibrate = function (lh, la, mh, ma) {
    var bh = lh / 95, ba = la / 95, it, r, i, j;
    for (it = 0; it < 14; it++) {
      r = this.run(bh, ba, 0, point(0, 0), [0, 0]);
      var Eh = 0, Ea = 0;
      for (i = 0; i < G; i++) for (j = 0; j < G; j++) { Eh += r.P[i * G + j] * i; Ea += r.P[i * G + j] * j; }
      bh *= lh / Eh; ba *= la / Ea;
    }
    var rc = this.run(bh, ba, 0, point(0, 0), [0, 0], 1, 1);
    return { bh: bh, ba: ba, cbh: mh / rc.ECh, cba: ma / rc.ECa, share1h: rc.EC1h / rc.ECh, share1a: rc.EC1a / rc.ECa };
  };

  /* ---------------- corner joint distribution (tempo/dominance mixture) ---------------- */
  function cornerJoint(mh, ma, sT, sD, m) {
    m = m || MC;
    var J = new Float64Array(m * m), c = Math.exp(sD * sD / 2), x = GH10.x, w = GH10.w;
    for (var a = 0; a < x.length; a++) {
      var T = Math.exp(sT * x[a] - sT * sT / 2);
      for (var b = 0; b < x.length; b++) {
        var Dd = Math.exp(sD * x[b]), wt = w[a] * w[b];
        if (wt < 1e-9) continue;
        var ph = poisVec(mh * T * Dd / c, m), pa = poisVec(ma * T / Dd / c, m);
        for (var i = 0; i < m; i++) {
          var u = wt * ph[i];
          if (u < 1e-14) continue;
          for (var j = 0; j < m; j++) J[i * m + j] += u * pa[j];
        }
      }
    }
    return J;
  }
  function jointMarginals(J, m) {
    var tot = zeros(2 * m - 1), dif = zeros(2 * m - 1), hm = zeros(m), am = zeros(m);
    for (var i = 0; i < m; i++) for (var j = 0; j < m; j++) {
      var v = J[i * m + j];
      tot[i + j] += v; dif[i - j + m - 1] += v; hm[i] += v; am[j] += v;
    }
    return { tot: tot, dif: dif, difOff: -(m - 1), home: hm, away: am };
  }

  /* ---------------- top-level: one match ---------------- */
  // ctx: { B, st, li, hi, ai, odds:{h,d,a, ouLine, over, under} | null, manual: {...} | null }
  function prematch(ctx) {
    var B = ctx.B, out = { warnings: [] };
    var stop1 = 3, stop2 = 6;
    var lh, la, mh, ma, src;
    if (ctx.manual) {
      // league not in database: market-only model with league averages as offset
      var mn = ctx.manual;
      var avgH = mn.avgTotal * mn.homeShare, avgA = mn.avgTotal * (1 - mn.homeShare);
      if (!ctx.odds) throw new Error('需要输入赔率');
      var sol0 = solveLambdas([ctx.odds.h, ctx.odds.d, ctx.odds.a], ctx.odds.ouLine, ctx.odds.over ? [ctx.odds.over, ctx.odds.under] : null, B.dc_rho, 2.6);
      lh = sol0.lh; la = sol0.la; src = 'odds';
      var spec = B.glm_mkt_only;
      mh = glm(spec, { home: 1, lam_t: Math.log(lh), lam_o: Math.log(la), base: Math.log(avgH) });
      ma = glm(spec, { home: 0, lam_t: Math.log(la), lam_o: Math.log(lh), base: Math.log(avgA) });
      out.marketFair = sol0;
    } else {
      var st = ctx.st, li = ctx.li, hi = ctx.hi, ai = ctx.ai;
      var fh = sideFeatures(st, li, hi, ai, true, 'c'), fa = sideFeatures(st, li, ai, hi, false, 'c');
      var gfh = sideFeatures(st, li, hi, ai, true, 'g'), gfa = sideFeatures(st, li, ai, hi, false, 'g');
      var glh = glm(B.glm.goals_nomkt, gfh), gla = glm(B.glm.goals_nomkt, gfa);
      out.ratingGoals = [glh, gla];
      if (ctx.odds) {
        var sol = solveLambdas([ctx.odds.h, ctx.odds.d, ctx.odds.a], ctx.odds.ouLine,
          ctx.odds.over ? [ctx.odds.over, ctx.odds.under] : null, B.dc_rho, glh + gla);
        lh = sol.lh; la = sol.la; src = 'odds'; out.marketFair = sol;
        fh.lam_t = Math.log(lh); fh.lam_o = Math.log(la); fa.lam_t = Math.log(la); fa.lam_o = Math.log(lh);
        mh = glm(B.glm.corner_mkt, fh); ma = glm(B.glm.corner_mkt, fa);
      } else {
        lh = glh; la = gla; src = 'ratings';
        mh = glm(B.glm.corner_nomkt, fh); ma = glm(B.glm.corner_nomkt, fa);
      }
    }
    var E = new Engine(B.mult, stop1, stop2);
    var cal = E.calibrate(lh, la, mh, ma);
    var r = E.run(cal.bh, cal.ba, 0, point(0, 0), [0, 0], cal.cbh, cal.cba);
    out.src = src; out.lh = lh; out.la = la; out.mh = mh; out.ma = ma; out.cal = cal;
    out.goalsFT = r.P; out.goalsHT = r.HT;
    var d = B.disp, b0ht = B.persist.b0_ht;
    out.cornersFT = jointMarginals(cornerJoint(mh, ma, d.ft0[0], d.ft0[1]), MC);
    var h1h = r.EC1h * Math.exp(b0ht), h1a = r.EC1a * Math.exp(b0ht);
    out.mh1 = h1h; out.ma1 = h1a;
    out.cornersHT = jointMarginals(cornerJoint(h1h, h1a, d.ht0[0], d.ht0[1]), MC);
    out.cornersFT.cur = [0, 0]; out.cornersHT.cur = [0, 0];
    out.next = r.next;
    out.engine = { stop1: stop1, stop2: stop2 };
    return out;
  }

  /* live: s = { per: 1|2, minute, added: null|n, gh, ga, ch, ca, rh, ra, ch1, ca1 } ; pm = prematch output */
  function live(B, pm, s) {
    var stop1 = 3, stop2 = 6;
    if (s.per === 1 && s.added !== null && s.added !== undefined && s.added !== '') stop1 = Math.max(1, Math.round(+s.added) + 1);
    if (s.per === 2 && s.added !== null && s.added !== undefined && s.added !== '') stop2 = Math.max(1, Math.round(+s.added) + 1);
    if (s.per === 2 && s.added1 !== undefined && s.added1 !== null && s.added1 !== '') stop1 = Math.max(1, Math.round(+s.added1) + 1);
    // in-play uses second-half goal effects re-fitted on half-time -> full-time data; base rates re-calibrated once
    var multL = B.mult_live || B.mult;
    if (!pm.calLive) pm.calLive = new Engine(multL, 3, 6).calibrate(pm.lh, pm.la, pm.mh, pm.ma);
    var E = new Engine(multL, stop1, stop2), cal = pm.calLive;
    var k0 = s.ht ? E.first2 : E.slotOf(s.per, s.minute);
    var per = s.ht ? 2 : s.per;
    var tau = s.ht ? 45 : s.minute;
    // expected corners so far along the pre-match expected path
    var sofar = E.run(cal.bh, cal.ba, 0, point(0, 0), [0, 0], cal.cbh, cal.cba, k0);
    var P = B.persist, K = P.k;
    var rch = Math.log((s.ch + K) / (sofar.ECh + K)), rca = Math.log((s.ca + K) / (sofar.ECa + K));
    var bc = P.bc_per_min * tau, bo = P.bo_per_min_after30 * Math.max(0, tau - 30);
    var mh = Math.exp(P.b0_ft + bc * rch + bo * rca), ma = Math.exp(P.b0_ft + bc * rca + bo * rch);
    var r = E.run(cal.bh, cal.ba, k0, point(s.gh, s.ga), [s.rh, s.ra], cal.cbh, cal.cba, null, [mh, ma]);
    var d = B.disp, out = { k0: k0, tau: tau, per: per, sofar: [sofar.ECh, sofar.ECa], mult: [mh, ma] };
    out.remFT = [r.ECh, r.ECa];
    var Et = r.ECh + r.ECa;
    var sD = Math.min(0.6, d.ft_rem.a + d.ft_rem.b / Math.sqrt(Math.max(Et, 0.05)));
    var jm = jointMarginals(cornerJoint(r.ECh, r.ECa, d.ft_rem.sT, sD), MC);
    jm.cur = [s.ch, s.ca];
    out.cornersFT = jm;
    if (per === 1) {
      var b0h = Math.exp(P.b0_ht - P.b0_ft);
      var e1h = r.EC1h * b0h, e1a = r.EC1a * b0h, E1 = e1h + e1a;
      var sD1 = Math.min(0.6, d.ht_rem.a + d.ht_rem.b / Math.sqrt(Math.max(E1, 0.05)));
      var j1 = jointMarginals(cornerJoint(e1h, e1a, d.ht_rem.sT, sD1), MC);
      j1.cur = [s.ch, s.ca];
      out.cornersHT = j1; out.remHT = [e1h, e1a];
    }
    out.goalsFT = r.P; out.goalsHT = per === 1 ? r.HT : null;
    out.next = r.next;
    // next corner + next 10 minutes
    if (r.perSlotC.length) {
      var c0 = r.perSlotC[0], n10h = 0, n10a = 0;
      for (var i = 0; i < Math.min(10, r.perSlotC.length); i++) { n10h += r.perSlotC[i][0]; n10a += r.perSlotC[i][1]; }
      out.nextCorner = [c0[0] / (c0[0] + c0[1]), c0[1] / (c0[0] + c0[1])];
      out.next10 = [n10h, n10a];
    }
    return out;
  }

  /* market tables from a goals score matrix (Float64Array G*G) */
  function goalsMarkets(P) {
    var pH = 0, pD = 0, pA = 0, btts = 0, tot = zeros(2 * G - 1), dif = zeros(2 * G - 1), cs = [], i, j;
    for (i = 0; i < G; i++) for (j = 0; j < G; j++) {
      var v = P[i * G + j];
      if (i > j) pH += v; else if (i === j) pD += v; else pA += v;
      if (i > 0 && j > 0) btts += v;
      tot[i + j] += v; dif[i - j + G - 1] += v;
      cs.push([i, j, v]);
    }
    cs.sort(function (a, b) { return b[2] - a[2]; });
    var eh = 0, ea = 0;
    for (i = 0; i < G; i++) for (j = 0; j < G; j++) { eh += P[i * G + j] * i; ea += P[i * G + j] * j; }
    return { pH: pH, pD: pD, pA: pA, btts: btts, tot: tot, dif: dif, difOff: -(G - 1), cs: cs.slice(0, 8), eh: eh, ea: ea };
  }

  return {
    buildRatings: buildRatings, prematch: prematch, live: live, goalsMarkets: goalsMarkets, betStats: betStats,
    devigPower: devigPower, solveLambdas: solveLambdas, Engine: Engine, cornerJoint: cornerJoint,
    jointMarginals: jointMarginals, dcMatrix: dcMatrix, point: point, G: G, MC: MC
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
