/* 角球进球预测 — online data and bet settlement (no DOM). ES5 for old iOS Safari.
   API-Football: fixtures, pre-match odds, in-play odds, final scores and corner counts (user's own key, free plan).
   open-matchday (GitHub, no key): final scores, half-time scores, corners and first-half corners, updated daily. */
var Net = (function () {
  'use strict';
  var API_BASE = 'https://v3.football.api-sports.io';
  var LIVE_ST = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'];
  var DONE_ST = ['FT', 'AET', 'PEN', 'AWD', 'WO'];
  // API-Football league ids for the leagues in the app (2026/27 season = 2026)
  var LG_API = { E0: 39, E1: 40, E2: 41, E3: 42, SC0: 179, SC1: 180, SC2: 183, SC3: 184, D1: 78, D2: 79, I1: 135, I2: 136,
                 SP1: 140, SP2: 141, F1: 61, F2: 62, N1: 88, B1: 144, P1: 94, T1: 203, G1: 197 };
  var BOOKS = ['bet365', 'pinnacle', 'bwin', '1xbet', 'william hill', 'unibet', 'betfair', 'marathonbet', '10bet', 'betway', 'betsson', 'dafabet'];

  /* ---------------- team names ---------------- */
  var STOP = { fc: 1, cf: 1, afc: 1, sc: 1, ac: 1, as: 1, ss: 1, us: 1, club: 1, de: 1, calcio: 1, cd: 1, ud: 1, sd: 1, rc: 1, sv: 1, vfb: 1, vfl: 1,
               tsg: 1, fk: 1, sk: 1, bk: 1, 'if': 1, ca: 1, se: 1, ec: 1, '1': 1, '04': 1, '05': 1, '07': 1, '29': 1, '96': 1, '98': 1, '1846': 1, '1899': 1 };
  // Football-Data short names -> fuller names (the rest are matched through the open-matchday names and fuzzy matching)
  var FD_FULL = { "man united": 'manchester united', 'man city': 'manchester city', "nott'm forest": 'nottingham forest', 'nottm forest': 'nottingham forest',
    'sheffield weds': 'sheffield wednesday', 'peterboro': 'peterborough united', 'bristol rvs': 'bristol rovers', 'inverness c': 'inverness caledonian thistle',
    'raith rvs': 'raith rovers', 'queen of sth': 'queen of the south', 'ath madrid': 'atletico madrid', 'ath bilbao': 'athletic club', 'betis': 'real betis',
    'celta': 'celta vigo', 'sociedad': 'real sociedad', 'vallecano': 'rayo vallecano', 'espanol': 'espanyol', 'la coruna': 'deportivo la coruna',
    'santander': 'racing santander', 'sp gijon': 'sporting gijon', 'sociedad b': 'real sociedad b', 'celta b': 'celta vigo b', 'milan': 'ac milan',
    'roma': 'as roma', 'inter': 'inter milan', "m'gladbach": 'borussia monchengladbach', 'ein frankfurt': 'eintracht frankfurt', 'fc koln': 'koln',
    'bayern munich': 'bayern munchen', 'dortmund': 'borussia dortmund', 'leverkusen': 'bayer leverkusen', 'paris sg': 'paris saint germain',
    'st etienne': 'saint etienne', 'for sittard': 'fortuna sittard', 'den haag': 'ado den haag', 'nijmegen': 'nec nijmegen', 'sp lisbon': 'sporting cp',
    'sp braga': 'braga', 'guimaraes': 'vitoria guimaraes', 'buyuksehyr': 'istanbul basaksehir', 'goztep': 'goztepe', 'olympiakos': 'olympiakos piraeus',
    'aek': 'aek athens', 'st truiden': 'sint truiden', 'st. gilloise': 'union st gilloise', 'standard': 'standard liege', 'waregem': 'zulte waregem',
    'oud-heverlee leuven': 'oh leuven', 'spurs': 'tottenham', 'wolves': 'wolverhampton wanderers', 'qpr': 'queens park rangers', 'west brom': 'west bromwich albion',
    'milton keynes dons': 'mk dons', 'academico viseu': 'academico de viseu', 'levadeiakos': 'levadiakos', 'asteras tripolis': 'asteras tripoli' };
  // common Chinese names -> English (from 角球数据记录), for matches in leagues outside the app's database
  var TEAM_ZH = ('阿森纳:Arsenal|切尔西:Chelsea|利物浦:Liverpool|曼联/曼彻斯特联:Manchester United/Man United|曼城/曼彻斯特城:Manchester City|热刺/托特纳姆/托特纳姆热刺:Tottenham|纽卡斯尔/纽卡/纽卡斯尔联:Newcastle'
    + '|阿斯顿维拉/维拉:Aston Villa|布莱顿:Brighton|西汉姆/西汉姆联:West Ham|狼队/伍尔弗汉普顿:Wolves/Wolverhampton|埃弗顿:Everton|富勒姆:Fulham|布伦特福德:Brentford|水晶宫:Crystal Palace'
    + '|诺丁汉森林/诺丁汉:Nottingham Forest|伯恩茅斯:Bournemouth|莱斯特城/莱斯特:Leicester|利兹联/利兹:Leeds|南安普顿:Southampton|伯恩利:Burnley|桑德兰:Sunderland|伊普斯维奇/伊普斯维奇城:Ipswich'
    + '|谢菲尔德联/谢菲联:Sheffield Utd/Sheffield United|谢周三/谢菲尔德星期三:Sheffield Wednesday|卢顿/卢顿城:Luton|沃特福德:Watford|诺维奇/诺维奇城:Norwich|赫尔城:Hull City'
    + '|米德尔斯堡/米堡:Middlesbrough|斯托克城:Stoke City|西布朗/西布罗姆维奇:West Brom|考文垂/考文垂城:Coventry|布里斯托尔城:Bristol City|卡迪夫城/卡迪夫:Cardiff|斯旺西:Swansea|女王公园巡游者:QPR|德比郡:Derby'
    + '|普雷斯顿:Preston|米尔沃尔:Millwall|布莱克本:Blackburn|朴茨茅斯:Portsmouth|牛津联:Oxford United|雷克瑟姆:Wrexham|普利茅斯:Plymouth|皇马/皇家马德里:Real Madrid|巴萨/巴塞罗那:Barcelona'
    + '|马竞/马德里竞技:Atletico Madrid|塞维利亚:Sevilla|皇家社会:Real Sociedad|比利亚雷亚尔/黄潜:Villarreal|贝蒂斯/皇家贝蒂斯:Real Betis/Betis|毕尔巴鄂/毕尔巴鄂竞技:Athletic Club/Athletic Bilbao'
    + '|瓦伦西亚:Valencia|塞尔塔:Celta Vigo|奥萨苏纳:Osasuna|赫塔费:Getafe|赫罗纳:Girona|马略卡/马洛卡:Mallorca|巴列卡诺/巴列卡诺闪电:Rayo Vallecano|阿拉维斯:Alaves|拉斯帕尔马斯:Las Palmas'
    + '|西班牙人:Espanyol|莱加内斯:Leganes|巴拉多利德/皇家巴拉多利德:Valladolid|加的斯:Cadiz|格拉纳达:Granada|阿尔梅里亚:Almeria|莱万特:Levante|埃尔切:Elche|奥维耶多/皇家奥维耶多:Oviedo|国米/国际米兰:Inter'
    + '|AC米兰/米兰:AC Milan|尤文/尤文图斯:Juventus|那不勒斯:Napoli|罗马:AS Roma/Roma|拉齐奥:Lazio|亚特兰大:Atalanta|佛罗伦萨/佛罗伦蒂娜:Fiorentina|博洛尼亚:Bologna|都灵:Torino|乌迪内斯:Udinese'
    + '|热那亚:Genoa|萨索洛:Sassuolo|卡利亚里:Cagliari|莱切:Lecce|维罗纳:Verona|恩波利:Empoli|蒙扎:Monza|帕尔马:Parma|科莫:Como|威尼斯:Venezia|克雷莫纳/克雷莫内塞:Cremonese|比萨:Pisa'
    + '|桑普多利亚:Sampdoria|萨勒尼塔纳:Salernitana|弗罗西诺内:Frosinone|拜仁/拜仁慕尼黑:Bayern Munchen/Bayern Munich/Bayern|多特/多特蒙德:Borussia Dortmund/Dortmund'
    + '|莱比锡/RB莱比锡:RB Leipzig/Leipzig|勒沃库森/药厂:Bayer Leverkusen/Leverkusen|法兰克福:Eintracht Frankfurt/Frankfurt|斯图加特:Stuttgart|沃尔夫斯堡/狼堡:Wolfsburg'
    + '|门兴/门兴格拉德巴赫:Borussia Monchengladbach/Gladbach|弗赖堡:Freiburg|霍芬海姆:Hoffenheim|不莱梅/云达不莱梅:Werder Bremen|奥格斯堡:Augsburg|柏林联合:Union Berlin|美因茨:Mainz'
    + '|科隆:Koln/Cologne|海登海姆:Heidenheim|圣保利:St. Pauli|基尔/荷尔斯泰因基尔:Holstein Kiel|波鸿:Bochum|汉堡:Hamburger SV/Hamburg|达姆施塔特:Darmstadt|沙尔克/沙尔克04:Schalke'
    + '|柏林赫塔/赫塔:Hertha|巴黎圣日耳曼/大巴黎/巴黎:Paris Saint Germain/PSG|马赛:Marseille|里昂:Lyon|摩纳哥:Monaco|里尔:Lille|尼斯:Nice|雷恩:Rennes|朗斯:Lens|南特:Nantes|斯特拉斯堡:Strasbourg'
    + '|蒙彼利埃:Montpellier|兰斯:Reims|图卢兹:Toulouse|布雷斯特:Brest/Stade Brestois|勒阿弗尔:Le Havre|欧塞尔:Auxerre|昂热:Angers|圣埃蒂安:Saint Etienne|洛里昂:Lorient|梅斯:Metz'
    + '|巴黎FC:Paris FC|阿贾克斯:Ajax|埃因霍温/PSV:PSV Eindhoven/PSV|费耶诺德:Feyenoord|阿尔克马尔/AZ:AZ Alkmaar|特温特:Twente|乌德勒支:Utrecht|本菲卡:Benfica|波尔图:Porto'
    + '|葡萄牙体育/里斯本竞技:Sporting CP|布拉加:Braga|凯尔特人:Celtic|流浪者/格拉斯哥流浪者:Rangers|加拉塔萨雷:Galatasaray|费内巴切:Fenerbahce|贝西克塔斯:Besiktas|布鲁日:Club Brugge|安德莱赫特:Anderlecht'
    + '|博德闪耀/博德格林特/博德:Bodo/Glimt|雅典AEK/AEK雅典/AEK:AEK Athens|奥林匹亚科斯:Olympiakos Piraeus/Olympiacos|帕纳辛奈科斯:Panathinaikos|PAOK/塞萨洛尼基:PAOK'
    + '|布拉格斯拉维亚/斯拉维亚:Slavia Praha/Slavia Prague|布拉格斯巴达/斯巴达:Sparta Praha|萨巴赫:Sabah|斯洛万/布拉迪斯拉发斯洛万:Slovan Bratislava|维京/维京人:Viking|林茨/LASK:LASK'
    + '|萨尔茨堡/萨尔茨堡红牛:Red Bull Salzburg/Salzburg|顿涅茨克矿工/矿工:Shakhtar Donetsk|基辅迪纳摩:Dynamo Kyiv|萨格勒布迪纳摩:Dinamo Zagreb|贝尔格莱德红星/红星:Crvena Zvezda/Red Star Belgrade'
    + '|年轻人/伯尔尼年轻人:Young Boys|哥本哈根:FC Copenhagen|中日德兰:Midtjylland|圣吉罗斯联合:Union St. Gilloise|奈梅亨/NEC:NEC Nijmegen|阿拉木图凯拉特:Kairat|卡拉巴赫:Qarabag|塞尔维特:Servette'
    + '|布雷斯特:Stade Brestois 29|利雅得新月/新月:Al-Hilal|利雅得胜利/胜利:Al-Nassr|吉达联合:Al-Ittihad|吉达国民:Al-Ahli|迈阿密国际:Inter Miami|洛杉矶银河:LA Galaxy|洛杉矶FC:Los Angeles FC'
    + '|上海海港:Shanghai Port|上海申花:Shanghai Shenhua|山东泰山/山东鲁能:Shandong Taishan/Shandong Luneng|北京国安:Beijing Guoan|成都蓉城:Chengdu Rongcheng'
    + '|天津津门虎:Tianjin Jinmen Tiger|武汉三镇:Wuhan Three Towns|浙江/浙江队:Zhejiang|河南/河南队:Henan|长春亚泰:Changchun Yatai|青岛海牛:Qingdao Hainiu|梅州客家:Meizhou Hakka'
    + '|沧州雄狮:Cangzhou|深圳新鹏城:Shenzhen Peng City|青岛西海岸:Qingdao West Coast|大连英博:Dalian Yingbo|云南玉昆:Yunnan Yukun|神户胜利船/神户:Vissel Kobe'
    + '|横滨水手:Yokohama F. Marinos/Yokohama F-Marinos/Yokohama Marinos|川崎前锋/川崎:Kawasaki Frontale|浦和红钻/浦和:Urawa/Urawa Red Diamonds/Urawa Reds'
    + '|鹿岛鹿角/鹿岛:Kashima/Kashima Antlers|广岛三箭/广岛:Sanfrecce Hiroshima|大阪钢巴/钢巴:Gamba Osaka|大阪樱花/樱花:Cerezo Osaka|东京FC/FC东京:FC Tokyo|名古屋鲸八/名古屋:Nagoya Grampus'
    + '|柏太阳神/柏雷素尔:Kashiwa Reysol|町田泽维亚/町田:Machida Zelvia|新潟天鹅:Albirex Niigata|札幌冈萨多:Consadole Sapporo/Hokkaido Consadole Sapporo|湘南比马:Shonan Bellmare'
    + '|福冈黄蜂/福冈:Avispa Fukuoka|京都不死鸟/京都:Kyoto Sanga/Kyoto Sanga FC|磐田喜悦:Jubilo Iwata|东京绿茵/绿茵:Tokyo Verdy|鸟栖砂岩:Sagan Tosu|清水鼓动/清水:Shimizu S-Pulse'
    + '|冈山绿雉/冈山:Fagiano Okayama|横滨FC:Yokohama FC|千叶/千叶市原/市原千叶:JEF United Chiba/JEF Utd Chiba/JEF United|长崎航海/长崎:V-Varen Nagasaki|水户蜀葵/水户:Mito Hollyhock'
    + '|蔚山现代/蔚山:Ulsan|全北现代/全北:Jeonbuk|浦项制铁/浦项:Pohang|首尔FC:FC Seoul|中国/中国队:China|日本/日本队:Japan|韩国/韩国队:South Korea|英格兰:England|法国:France|德国:Germany|西班牙:Spain'
    + '|意大利:Italy|葡萄牙:Portugal|荷兰:Netherlands|比利时:Belgium|巴西:Brazil|阿根廷:Argentina|克罗地亚:Croatia|澳大利亚:Australia|沙特/沙特阿拉伯:Saudi Arabia|伊朗:Iran|卡塔尔:Qatar|美国:USA'
    + '|墨西哥:Mexico|乌拉圭:Uruguay|哥伦比亚:Colombia|摩洛哥:Morocco|塞内加尔:Senegal|瑞士:Switzerland|丹麦:Denmark|奥地利:Austria|波兰:Poland|土耳其:Turkey').split('|').map(function (x) { var p = x.split(':'); return [p[0].split('/'), (p[1] || '').split('/')]; });
  function zhNames(raw) {
    var cn = String(raw || '').replace(/\s+/g, '').toUpperCase(), out = [];
    if (!cn) return out;
    TEAM_ZH.forEach(function (e) { if (e[0].some(function (z) { return z.toUpperCase() === cn; })) out = out.concat(e[1]); });
    return out;
  }
  function normName(s) {
    s = String(s || '').toLowerCase().replace(/\./g, '').replace(/[’']/g, "'");
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* old engines: keep accents */ }
    s = s.replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/ı/g, 'i').replace(/[^a-z0-9'一-鿿]+/g, ' ').replace(/'/g, '').trim();
    return s.split(' ').map(function (w) { return WORD[w] || w; }).join(' ');
  }
  var WORD = { utd: 'united', rvs: 'rovers', weds: 'wednesday', sth: 'south', wand: 'wanderers' };
  function coreWords(s) { return s.split(' ').filter(function (w) { return w && !STOP[w]; }); }
  function bigr(s) { var t = s.replace(/ /g, ''), a = []; for (var i = 0; i < t.length - 1; i++) a.push(t.slice(i, i + 2)); return a.length ? a : [t]; }
  function sim(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    var ca = coreWords(a), cb = coreWords(b);
    if (ca.length && ca.join(' ') === cb.join(' ')) return 0.95;
    var s = ca.length <= cb.length ? ca : cb, l = ca.length <= cb.length ? cb : ca;
    if (s.length && s.some(function (w) { return w.length >= 3; }) &&
        s.every(function (w) { return l.some(function (x) { return x.indexOf(w) === 0 || (w.indexOf(x) === 0 && x.length >= 3); }); }))
      return 0.85 * (0.75 + 0.25 * s.length / l.length);
    var ba = bigr(ca.join(' ') || a), bb = bigr(cb.join(' ') || b), m = {}, hit = 0, i;
    for (i = 0; i < bb.length; i++) m[bb[i]] = (m[bb[i]] || 0) + 1;
    for (i = 0; i < ba.length; i++) if (m[ba[i]]) { hit++; m[ba[i]]--; }
    return 0.8 * 2 * hit / (ba.length + bb.length);
  }
  // all the names one of our teams may go by: Football-Data name, open-matchday names, known long form
  function teamKeys(fdName, omMap, extra) {
    var keys = {}, n = normName(fdName);
    keys[n] = 1;
    if (FD_FULL[String(fdName).toLowerCase()]) keys[normName(FD_FULL[String(fdName).toLowerCase()])] = 1;
    if (omMap) for (var om in omMap) if (omMap[om] === fdName) keys[normName(om)] = 1;
    (extra || []).forEach(function (x) { if (x) keys[normName(x)] = 1; });
    return Object.keys(keys).filter(function (k) { return !!k; });
  }
  function nameScore(keys, apiName) {
    var t = normName(apiName), best = 0;
    for (var i = 0; i < keys.length; i++) best = Math.max(best, sim(keys[i], t));
    return best;
  }
  // rank fixtures of a day for our home/away team; lid = API league id (fixtures of that league are preferred)
  function rankFixtures(list, hKeys, aKeys, lid) {
    var out = [];
    (list || []).forEach(function (f) {
      if (!f || !f.teams || !f.fixture || !f.teams.home || !f.teams.away) return;
      var H = f.teams.home.name, A = f.teams.away.name;
      var n0 = nameScore(hKeys, H), n1 = nameScore(aKeys, A), w0 = nameScore(hKeys, A), w1 = nameScore(aKeys, H);
      var sn = (n0 + n1) / 2, sw = (w0 + w1) / 2 * 0.95, swp = sw > sn;
      var pair = swp ? [w0, w1] : [n0, n1], sc = swp ? sw : sn;
      var inLg = lid && f.league && f.league.id === lid;
      if (Math.min(pair[0], pair[1]) >= 0.4 || Math.max(pair[0], pair[1]) >= 0.8)
        out.push({ f: f, score: sc + (inLg ? 0.1 : 0), lo: Math.min(pair[0], pair[1]), sw: swp, lg: !!inLg });
    });
    return out.sort(function (x, y) { return y.score - x.score; });
  }
  function isSure(r) {
    if (!r.length) return false;
    var a = r[0];
    if (a.sw) return false;   // home/away the other way round: let the user confirm
    if (a.lo >= 0.9 && (r.length === 1 || r[1].score < a.score - 0.15)) return true;
    if (a.lg && a.lo >= 0.6 && (r.length === 1 || r[1].score < a.score - 0.1)) return true;
    return a.lo >= 0.72 && r.filter(function (c) { return c.lo >= 0.5; }).length === 1;
  }

  /* ---------------- API-Football ---------------- */
  function apiGet(key, path) {
    if (!key) return Promise.reject(new Error('还没有填 API-Football 的 key'));
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(new Error('现在没有网络'));
    return fetch(API_BASE + path, { headers: { 'x-apisports-key': key } }).then(function (r) {
      if (!r.ok) throw new Error('API-Football 回应错误 ' + r.status);
      return r.json();
    }, function () { throw new Error('连不上 API-Football（没有网络，或被浏览器拦截）'); }).then(function (j) {
      var er = j && j.errors;
      if (er && !Array.isArray(er) && Object.keys(er).length) {
        var e;
        if (er.token) e = new Error('API key 不对，请在「说明 → 联网」重新贴上');
        else if (er.requests) e = new Error('今天的免费请求次数用完了（每天 100 次）');
        else if (er.rateLimit) e = new Error('请求太快了，等一分钟再试');
        else if (er.plan) { e = new Error('免费方案查不到这场（只能查昨天到明天的比赛）'); e.plan = 1; }
        else e = new Error(Object.keys(er).map(function (k) { return er[k]; }).join('；'));
        throw e;
      }
      if (Array.isArray(er) && er.length) throw new Error(er.join('；'));
      return j.response;
    });
  }

  /* ---------------- odds parsing ---------------- */
  function oddsNum(v) {
    var xs = String(v === null || v === undefined ? '' : v).match(/[-+]?\d+(\.\d+)?/g);
    if (!xs) return null;
    var s = 0;
    for (var i = 0; i < xs.length; i++) s += +xs[i];
    return Math.round(s / xs.length * 4) / 4;
  }
  var HALF_RE = /\(?\b(1st|first|2nd|second) half\b\)?|\bhalf ?time\b|\(1h\)|\b1h\b|\b2h\b/g;
  // which board market a bet belongs to (null = not used). Goals markets by name, corner markets by name + value shape.
  function betClass(name) {
    var low = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    var half = /(1st|first) half|half ?time|\(1h\)|\b1h\b/.test(low) ? '1h' : (/(2nd|second) half|\b2h\b/.test(low) ? '2h' : 'ft');
    var rest = low.replace(HALF_RE, ' ').replace(/[-–:()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (half === '2h') return null;
    if (/corner/.test(low)) {
      var r2 = rest.replace(/corners?/g, ' ').replace(/\s+/g, ' ').trim();
      if (/\d+\s*[-–]\s*\d+/.test(low) || /race|first|last|odd|even|exact|range|interval|minute|\bmin\b|player|european|3 ?way handicap|alternative|both|which|most|team to|time of/.test(r2)) return null;
      var team = /\bhome\b/.test(r2) && !/\baway\b/.test(r2) ? 'h' : (/\baway\b/.test(r2) && !/\bhome\b/.test(r2) ? 'a' : null);
      return { g: 'c', half: half, team: team };
    }
    if (/card|booking|shot|offside|throw|foul|penalt|player|scorer|minute|interval|range|exact|odd|even|double chance|draw no bet|margin|clean sheet|qualify|highest|lowest|to score|first|last|time of|correct score|ht ?\/ ?ft|result ?\/|\/ ?both|win to nil|either half|own goal|european|handicap result|3 ?way|team total|total home|total away|home team|away team|\bhome\b|\baway\b|corners?|both halves|half ?time ?\/|period|extra|overtime|penalties/.test(rest)) {
      if (!/^both teams (to )?score$/.test(rest)) return null;
    }
    if (/^asian handicap$|^asian handicap (line|goals)$|^handicap asian$/.test(rest)) return { g: 'g', half: half, kind: 'ah' };
    if (/^both teams (to )?score$|^btts$|^gg ?\/ ?ng$/.test(rest)) return half === 'ft' ? { g: 'g', half: half, kind: 'yn' } : null;
    if (/^(match winner|fulltime result|full time result|match result|1x2|3way result|final result|result|winner|half winner|halftime result|half result|half time result)$/.test(rest) ||
        (half === '1h' && /^(winner|result|1x2)$/.test(rest))) return { g: 'g', half: half, kind: 'x3' };
    if (/^(goals over ?\/ ?under|over ?\/ ?under|over ?\/ ?under line|total goals|goal line|match goals|total|goals|goals line|total goals line)$/.test(rest)) return { g: 'g', half: half, kind: 'ou' };
    return null;
  }
  function marketKey(c, kind) {
    if (c.g === 'c') {
      if (kind === 'ou') return c.team === 'h' ? (c.half === 'ft' ? 'hc_ou' : null) : c.team === 'a' ? (c.half === 'ft' ? 'ac_ou' : null) : (c.half === 'ft' ? 'ftc_ou' : 'htc_ou');
      if (c.team) return null;
      if (kind === 'ah') return c.half === 'ft' ? 'ftc_ah' : 'htc_ah';
      if (kind === 'x3') return c.half === 'ft' ? 'ftc_x' : null;
      return null;
    }
    if (kind !== c.kind) return null;
    if (kind === 'ou') return c.half === 'ft' ? 'g_ou' : 'gh_ou';
    if (kind === 'ah') return c.half === 'ft' ? 'g_ah' : 'gh_ah';
    if (kind === 'x3') return c.half === 'ft' ? 'g_1x2' : 'gh_1x2';
    if (kind === 'yn') return 'btts';
    return null;
  }
  function plausible(o1, o2) { var m = 1 / o1 + 1 / o2 - 1; return m > -0.015 && m < 0.16 ? m : null; }
  /* one bet -> { m, l, o: [..], main } for its main line (sw: our home/away is the API's away/home) */
  function parseBet(b, sw) {
    var c = betClass(b && b.name);
    if (!c) return null;
    var ou = {}, hs = [], as = [], x3 = {}, yn = {}, vals = (b && b.values) || [];
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i], t = String(v.value === undefined || v.value === null ? '' : v.value).trim(), lt = t.toLowerCase(), odd = +v.odd;
      if (!(odd > 1) || v.suspended) continue;
      var hc = v.handicap !== undefined && v.handicap !== null && v.handicap !== '' ? oddsNum(v.handicap) : null;
      if (/^(over|under)\b/.test(lt)) {
        var ln = hc !== null ? hc : oddsNum(t.replace(/^(over|under)/i, ''));
        if (ln === null) continue;
        var L = ou[ln] || (ou[ln] = { l: ln, main: false });
        L[/^over/.test(lt) ? 'o' : 'u'] = odd;
        if (v.main) L.main = true;
      } else if (/^(home|1)\b/.test(lt) && (hc !== null || /\d/.test(t.replace(/^(home|1)/i, '')))) {
        hs.push({ l: hc !== null ? hc : oddsNum(t.replace(/^(home|1)/i, '')), o: odd, main: !!v.main });
      } else if (/^(away|2)\b/.test(lt) && (hc !== null || /\d/.test(t.replace(/^(away|2)/i, '')))) {
        as.push({ l: hc !== null ? hc : oddsNum(t.replace(/^(away|2)/i, '')), o: odd, main: !!v.main });
      } else if (lt === 'home' || lt === '1') x3.h = odd;
      else if (lt === 'draw' || lt === 'x') x3.d = odd;
      else if (lt === 'away' || lt === '2') x3.a = odd;
      else if (lt === 'yes') yn.y = odd;
      else if (lt === 'no') yn.n = odd;
    }
    var key, pairs = [], best = null, k;
    if (Object.keys(ou).length) {
      key = marketKey(c, 'ou'); if (!key) return null;
      for (k in ou) if (ou[k].o && ou[k].u && plausible(ou[k].o, ou[k].u) !== null) pairs.push({ l: ou[k].l, o: [ou[k].o, ou[k].u], main: ou[k].main });
    } else if (hs.length && as.length) {
      key = marketKey(c, 'ah'); if (!key) return null;
      hs.forEach(function (H) {
        // the away side may be written with its own sign (+0.5) or with the home team's (−0.5): take the pairing that prices like one market
        var cands = as.filter(function (A) { return Math.abs(A.l + H.l) < 1e-9 || Math.abs(A.l - H.l) < 1e-9; }), bestA = null, bm = 9;
        cands.forEach(function (A) { var m = plausible(H.o, A.o); if (m !== null && Math.abs(m - 0.05) < bm) { bm = Math.abs(m - 0.05); bestA = A; } });
        if (bestA) pairs.push({ l: H.l, o: [H.o, bestA.o], main: H.main || bestA.main });
      });
    } else if (x3.h && x3.d && x3.a) {
      key = marketKey(c, 'x3'); if (!key) return null;
      var m3 = 1 / x3.h + 1 / x3.d + 1 / x3.a - 1;
      if (m3 > -0.015 && m3 < 0.25) pairs.push({ l: null, o: [x3.h, x3.d, x3.a], main: true });
    } else if (yn.y && yn.n) {
      key = marketKey(c, 'yn'); if (!key) return null;
      if (plausible(yn.y, yn.n) !== null) pairs.push({ l: null, o: [yn.y, yn.n], main: true });
    }
    if (!key || !pairs.length) return null;
    pairs.forEach(function (p) { if (p.main && !best) best = p; });
    if (!best) {
      pairs.sort(function (x, y) { return Math.abs(1 / x.o[0] - 1 / x.o[1]) - Math.abs(1 / y.o[0] - 1 / y.o[1]); });
      best = pairs[0];
    }
    var o = best.o.slice(), l = best.l, isAH = key.indexOf('_ah') > 0;
    // every line the bookmaker quotes (lines only): a board row moved to another line takes these odds
    var alts = best.l === null ? null : pairs.map(function (p) { return sw && isAH ? { l: -p.l, o: [p.o[1], p.o[0]] } : { l: p.l, o: p.o.slice() }; });
    if (sw) {
      // our home team is the API's away team: mirror handicaps and swap sides
      if (isAH) { l = -l; o = [o[1], o[0]]; }
      else if (key === 'g_1x2' || key === 'gh_1x2' || key === 'ftc_x') o = [o[2], o[1], o[0]];
      else if (key === 'hc_ou') key = 'ac_ou';
      else if (key === 'ac_ou') key = 'hc_ou';
    }
    return alts ? { m: key, l: l, o: o, alts: alts } : { m: key, l: l, o: o };
  }
  // pre-match: for every market, the first bookmaker in BOOKS order that has it
  function pickPre(bookmakers, sw) {
    var bms = (bookmakers || []).slice(), out = {};
    function rank(n) { n = String(n || '').toLowerCase(); for (var i = 0; i < BOOKS.length; i++) if (n.indexOf(BOOKS[i]) >= 0) return i; return 99; }
    bms.sort(function (x, y) { return rank(x.name) - rank(y.name); });
    bms.forEach(function (bm) {
      ((bm && bm.bets) || []).forEach(function (b) {
        var r = parseBet(b, sw);
        if (r && !out[r.m]) { r.book = bm.name; out[r.m] = r; }
      });
    });
    return out;
  }
  function pickLive(odds, sw) {
    var out = {};
    (odds || []).forEach(function (b) { var r = parseBet(b, sw); if (r && !out[r.m]) { r.book = '滚球'; out[r.m] = r; } });
    return out;
  }

  /* ---------------- fixture state / results ---------------- */
  function intOrNull(v) { if (v === null || v === undefined || v === '') return null; var x = parseInt(v, 10); return isFinite(x) ? x : null; }
  function statOf(arr, id, type) {
    for (var i = 0; i < (arr || []).length; i++) {
      var t = arr[i];
      if (!t || !t.team || t.team.id !== id) continue;
      var st = t.statistics || [];
      for (var j = 0; j < st.length; j++) if (st[j] && st[j].type === type) return intOrNull(st[j].value) || 0;
      return null;
    }
    return null;
  }
  // first-half corners from /fixtures/statistics?half=true (format not documented well: look for any first-half statistics list)
  function firstHalfCorners(resp, ids) {
    var out = ids.map(function (id) {
      for (var i = 0; i < (resp || []).length; i++) {
        var t = resp[i];
        if (!t || !t.team || t.team.id !== id) continue;
        for (var k in t) {
          if (!/1h|first|half_?1|h1/i.test(k) || !Array.isArray(t[k])) continue;
          for (var j = 0; j < t[k].length; j++) if (t[k][j] && t[k][j].type === 'Corner Kicks') return intOrNull(t[k][j].value) || 0;
        }
        if (Array.isArray(t.statistics)) for (var q = 0; q < t.statistics.length; q++) {
          var s = t.statistics[q];
          if (s && s.type === 'Corner Kicks' && s.value && typeof s.value === 'object') {
            var v = s.value.first || s.value['1h'] || s.value.half_1;
            if (v !== undefined) return intOrNull(v) || 0;
          }
        }
      }
      return null;
    });
    return out[0] === null || out[1] === null ? null : out;
  }
  /* f: fixture object (with statistics/events when available). sw: our home is the API's away. */
  function fixState(f, sw) {
    var st = (f.fixture && f.fixture.status) || {}, H = f.teams.home.id, A = f.teams.away.id, ids = sw ? [A, H] : [H, A];
    var sc = f.score || {}, ft = sc.fulltime && sc.fulltime.home !== null && sc.fulltime.home !== undefined ? sc.fulltime : f.goals || {};
    var g = [intOrNull(ft.home), intOrNull(ft.away)], gl = f.goals || {}, gNow = [intOrNull(gl.home), intOrNull(gl.away)];
    var ht = sc.halftime && sc.halftime.home !== null && sc.halftime.home !== undefined ? [intOrNull(sc.halftime.home), intOrNull(sc.halftime.away)] : null;
    if (sw) { g.reverse(); gNow.reverse(); if (ht) ht.reverse(); }
    var has = Array.isArray(f.statistics) && f.statistics.length >= 2;
    var c = has ? ids.map(function (id) { return statOf(f.statistics, id, 'Corner Kicks'); }) : null;
    if (c && (c[0] === null || c[1] === null)) c = null;
    var rc = has ? ids.map(function (id) { return statOf(f.statistics, id, 'Red Cards'); }) : null;
    if (!rc || rc[0] === null || rc[1] === null)
      rc = ids.map(function (id) { return (f.events || []).filter(function (e) { return e && e.type === 'Card' && e.team && e.team.id === id && /red|second yellow/i.test(e.detail || ''); }).length; });
    return { st: st.short || '', el: intOrNull(st.elapsed) || 0, ex: intOrNull(st.extra) || 0, done: DONE_ST.indexOf(st.short) >= 0,
             live: LIVE_ST.indexOf(st.short) >= 0, g: g, gNow: gNow, g1: ht, c: c, red: rc, ko: f.fixture && f.fixture.timestamp ? f.fixture.timestamp * 1000 : null };
  }

  /* ---------------- open-matchday CSV ---------------- */
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
  // rows of one league's results file -> [{ d: 'yyyy-mm-dd', h, a (our names), g, g1, c, c1 }]
  function omResults(text, map) {
    var rows = parseCSV(text), hd = rows[0] || [], ix = {}, out = [];
    hd.forEach(function (c, i) { ix[String(c).trim()] = i; });
    if (ix.date === undefined || ix.home === undefined || ix.away === undefined) return out;
    function pair(w, a, b) { var x = ix[a] === undefined ? null : intOrNull(String(w[ix[a]]).trim()), y = ix[b] === undefined ? null : intOrNull(String(w[ix[b]]).trim()); return x === null || y === null ? null : [x, y]; }
    for (var k = 1; k < rows.length; k++) {
      var w = rows[k];
      if (w.length < 5) continue;
      var h = w[ix.home], a = w[ix.away];
      out.push({ d: String(w[ix.date]).trim(), h: (map && map[h]) || h, a: (map && map[a]) || a, g: pair(w, 'ft_home', 'ft_away'), g1: pair(w, 'ht_home', 'ht_away'),
                 c: pair(w, 'home_corners', 'away_corners'), c1: pair(w, 'home_corners_1h', 'away_corners_1h') });
    }
    return out;
  }
  // the first meeting of home vs away on or after `from` (yyyy-mm-dd), within `days`
  function omFind(list, h, a, from, days) {
    var t0 = Date.parse(from + 'T00:00:00Z'), best = null;
    list.forEach(function (r) {
      if (r.h !== h || r.a !== a) return;
      var t = Date.parse(r.d + 'T00:00:00Z');
      if (!(t >= t0 - 86400000) || t > t0 + days * 86400000) return;
      if (!best || t < Date.parse(best.d + 'T00:00:00Z')) best = r;
    });
    return best;
  }

  /* ---------------- settlement ---------------- */
  // v: which result is needed (c FT corners, c1 first-half corners, g FT goals, g1 half-time goals); f: tot / h / a for totals
  var SPEC = {
    ftc_ou: { k: 'ou', v: 'c', f: 'tot' }, htc_ou: { k: 'ou', v: 'c1', f: 'tot' }, hc_ou: { k: 'ou', v: 'c', f: 'h' }, ac_ou: { k: 'ou', v: 'c', f: 'a' },
    ftc_ah: { k: 'ah', v: 'c' }, htc_ah: { k: 'ah', v: 'c1' }, ftc_x: { k: 'x3', v: 'c' },
    g_ou: { k: 'ou', v: 'g', f: 'tot' }, g_ah: { k: 'ah', v: 'g' }, g_1x2: { k: 'x3', v: 'g' },
    gh_ou: { k: 'ou', v: 'g1', f: 'tot' }, gh_ah: { k: 'ah', v: 'g1' }, gh_1x2: { k: 'x3', v: 'g1' }, btts: { k: 'yn', v: 'g' }
  };
  function splitLine(line) {
    var f = Math.round(line * 4) / 4, fr = f - Math.floor(f);
    if (Math.abs(fr - 0.25) < 1e-9 || Math.abs(fr - 0.75) < 1e-9) return [f - 0.25, f + 0.25];
    return [f];
  }
  /* rec: { m, l, s (side index), o (odds), b: [h, a] score when an in-play handicap counts from the bet } ; res: { c, c1, g, g1 }
     returns { u: units won (-1..1, 0.5 = half), pl: profit for a stake of 1 } or null when the needed result is missing */
  function settle(rec, res) {
    var sp = SPEC[rec.m];
    if (!sp || !res) return null;
    var x = res[sp.v];
    if (!x || x[0] === null || x[1] === null || x[0] === undefined || x[1] === undefined) return null;
    var o = +rec.o;
    if (sp.k === 'x3') {
      var w = x[0] > x[1] ? 0 : (x[0] === x[1] ? 1 : 2);
      return rec.s === w ? { u: 1, pl: r4(o - 1) } : { u: -1, pl: -1 };
    }
    if (sp.k === 'yn') {
      var yes = x[0] > 0 && x[1] > 0, win = rec.s === 0 ? yes : !yes;
      return win ? { u: 1, pl: r4(o - 1) } : { u: -1, pl: -1 };
    }
    var parts = splitLine(rec.l), u = 0, pl = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], v;
      if (sp.k === 'ou') {
        var X = sp.f === 'tot' ? x[0] + x[1] : (sp.f === 'h' ? x[0] : x[1]);
        v = rec.s === 0 ? X - p : p - X;
      } else {
        var D = x[0] - x[1] - (rec.b ? rec.b[0] - rec.b[1] : 0);
        v = rec.s === 0 ? D + p : -(D + p);
      }
      if (v > 1e-9) { u += 1; pl += o - 1; } else if (v < -1e-9) { u -= 1; pl -= 1; }
    }
    return { u: u / parts.length, pl: r4(pl / parts.length) };
  }
  function r4(x) { return Math.round(x * 10000) / 10000; }
  function need(m) { return SPEC[m] ? SPEC[m].v : null; }

  return { API_BASE: API_BASE, LG_API: LG_API, LIVE_ST: LIVE_ST, DONE_ST: DONE_ST, apiGet: apiGet, normName: normName, sim: sim, teamKeys: teamKeys,
           nameScore: nameScore, rankFixtures: rankFixtures, isSure: isSure, oddsNum: oddsNum, betClass: betClass, parseBet: parseBet, pickPre: pickPre,
           pickLive: pickLive, fixState: fixState, firstHalfCorners: firstHalfCorners, parseCSV: parseCSV, omResults: omResults, omFind: omFind,
           settle: settle, need: need, splitLine: splitLine, SPEC: SPEC, zhNames: zhNames };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Net;
