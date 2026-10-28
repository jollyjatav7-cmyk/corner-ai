// node tests for app_net.js: bet names -> markets, odds parsing (pre-match and in-play shapes), team-name matching,
// settlement (half, integer and quarter lines, in-play handicaps counted from the bet), open-matchday parsing.
// Usage: node test_net.js <path to app_net.js> <path to bundle.json> [open-matchday results csv]
var fs = require('fs');
var Net = require(process.argv[2]);
var B = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
var fails = 0, n = 0;
function eq(name, got, want) {
  n++;
  var g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fails++; console.log('FAIL', name, 'got', g, 'want', w); }
}

/* ---- bet names ---- */
var cls = function (nm) { var c = Net.betClass(nm); return c ? [c.g, c.half, c.team || c.kind || null] : null; };
eq('match winner', cls('Match Winner'), ['g', 'ft', 'x3']);
eq('fulltime result (live)', cls('Fulltime Result'), ['g', 'ft', 'x3']);
eq('first half winner', cls('First Half Winner'), ['g', '1h', 'x3']);
eq('goals o/u', cls('Goals Over/Under'), ['g', 'ft', 'ou']);
eq('goals o/u 1h', cls('Goals Over/Under First Half'), ['g', '1h', 'ou']);
eq('over/under line (live)', cls('Over/Under Line'), ['g', 'ft', 'ou']);
eq('goal line 1st half', cls('Goal Line (1st Half)'), ['g', '1h', 'ou']);
eq('asian handicap', cls('Asian Handicap'), ['g', 'ft', 'ah']);
eq('asian handicap 1h', cls('Asian Handicap First Half'), ['g', '1h', 'ah']);
eq('btts', cls('Both Teams Score'), ['g', 'ft', 'yn']);
eq('btts to', cls('Both Teams To Score'), ['g', 'ft', 'yn']);
eq('second half winner', cls('Second Half Winner'), null);
eq('double chance', cls('Double Chance'), null);
eq('team total', cls('Total - Home'), null);
eq('ht/ft', cls('HT/FT Double'), null);
eq('exact score', cls('Exact Score'), null);
eq('home/away', cls('Home/Away'), null);
eq('handicap result', cls('Handicap Result'), null);
eq('cards', cls('Cards Over/Under'), null);
eq('corners o/u', cls('Corners Over Under'), ['c', 'ft', null]);
eq('corners 1h', cls('Total Corners (1st Half)'), ['c', '1h', null]);
eq('home corners', cls('Home Corners Over/Under'), ['c', 'ft', 'h']);
eq('away corners', cls('Away Corners Over/Under'), ['c', 'ft', 'a']);
eq('corners ah', cls('Corners Asian Handicap'), ['c', 'ft', null]);
eq('asian corners (live)', cls('Asian Corners'), ['c', 'ft', null]);
eq('1st half corners (live)', cls('1st Half Corners'), ['c', '1h', null]);
eq('corner race', cls('Corners Race To 5'), null);
eq('first corner', cls('First Corner'), null);
eq('corners odd/even', cls('Corners Odd/Even'), null);
eq('corners european', cls('Corners European Handicap'), null);
eq('corners range', cls('Total Corners 0-8'), null);
eq('2nd half corners', cls('2nd Half Corners'), null);

/* ---- odds parsing ---- */
var PRE = [
  { name: '1xBet', bets: [{ name: 'Corners Over Under', values: [{ value: 'Over 8.5', odd: '1.80' }, { value: 'Under 8.5', odd: '2.00' }] },
    { name: 'Asian Handicap', values: [{ value: 'Home -1', odd: '1.90' }, { value: 'Away +1', odd: '1.95' }] }] },
  { name: 'Bet365', bets: [
    { name: 'Match Winner', values: [{ value: 'Home', odd: '1.50' }, { value: 'Draw', odd: '4.50' }, { value: 'Away', odd: '6.00' }] },
    { name: 'Goals Over/Under', values: [{ value: 'Over 1.5', odd: '1.25' }, { value: 'Under 1.5', odd: '3.75' }, { value: 'Over 2.5', odd: '1.80' }, { value: 'Under 2.5', odd: '2.00' }, { value: 'Over 3.5', odd: '2.90' }, { value: 'Under 3.5', odd: '1.40' }] },
    { name: 'Asian Handicap', values: [{ value: 'Home -0.75', odd: '1.92' }, { value: 'Away -0.75', odd: '1.92' }, { value: 'Home -1', odd: '2.20' }, { value: 'Away -1', odd: '1.68' }] },
    { name: 'Corners Over Under', values: [{ value: 'Over 9.5', odd: '1.90' }, { value: 'Under 9.5', odd: '1.90' }, { value: 'Over 10.5', odd: '2.40' }, { value: 'Under 10.5', odd: '1.55' }] },
    { name: 'Home Corners Over/Under', values: [{ value: 'Over 5.5', odd: '1.90' }, { value: 'Under 5.5', odd: '1.90' }] },
    { name: 'Corners 1x2', values: [{ value: 'Home', odd: '1.40' }, { value: 'Draw', odd: '8.00' }, { value: 'Away', odd: '4.00' }] },
    { name: 'Corners Asian Handicap', values: [{ value: 'Home -1.5', odd: '1.95' }, { value: 'Away +1.5', odd: '1.85' }, { value: 'Home -0.5', odd: '1.55' }, { value: 'Away +0.5', odd: '2.40' }] },
    { name: 'Total Corners (1st Half)', values: [{ value: 'Over 4.5', odd: '1.95' }, { value: 'Under 4.5', odd: '1.85' }, { value: 'Over 3.5', odd: '1.45' }, { value: 'Under 3.5', odd: '2.60' }] },
    { name: 'Goals Over/Under First Half', values: [{ value: 'Over 0.5', odd: '1.40' }, { value: 'Under 0.5', odd: '2.80' }, { value: 'Over 1.0', odd: '1.85' }, { value: 'Under 1.0', odd: '1.95' }] },
    { name: 'Both Teams Score', values: [{ value: 'Yes', odd: '1.90' }, { value: 'No', odd: '1.90' }] },
    { name: 'Second Half Winner', values: [{ value: 'Home', odd: '2.0' }, { value: 'Draw', odd: '2.9' }, { value: 'Away', odd: '4.5' }] }] }];
var pre = Net.pickPre(PRE, false), brief = {};
Object.keys(pre).sort().forEach(function (k) { brief[k] = [pre[k].l, pre[k].o, pre[k].book]; });
eq('pre markets', brief, {
  btts: [null, [1.9, 1.9], 'Bet365'], ftc_ah: [-1.5, [1.95, 1.85], 'Bet365'], ftc_ou: [9.5, [1.9, 1.9], 'Bet365'], ftc_x: [null, [1.4, 8, 4], 'Bet365'],
  g_1x2: [null, [1.5, 4.5, 6], 'Bet365'], g_ah: [-0.75, [1.92, 1.92], 'Bet365'], g_ou: [2.5, [1.8, 2], 'Bet365'], gh_ou: [1, [1.85, 1.95], 'Bet365'],
  hc_ou: [5.5, [1.9, 1.9], 'Bet365'], htc_ou: [4.5, [1.95, 1.85], 'Bet365'] });
// our home team is the API's away team
var sw = Net.pickPre(PRE, true);
eq('swapped ah', [sw.ftc_ah.l, sw.ftc_ah.o], [1.5, [1.85, 1.95]]);
eq('swapped 1x2', sw.g_1x2.o, [6, 4.5, 1.5]);
eq('swapped team corners', [!!sw.ac_ou, !!sw.hc_ou], [true, false]);
// in-play shape: separate handicap field, main flags, quarter lines written as 2.5,3.0 or 0.75
var LIVE = [
  { name: 'Asian Corners', values: [{ value: 'Over', odd: '1.90', handicap: '10', main: true }, { value: 'Under', odd: '1.90', handicap: '10', main: true },
    { value: 'Over', odd: '2.50', handicap: '11' }, { value: 'Under', odd: '1.50', handicap: '11' }] },
  { name: 'Asian Handicap Corners', values: [{ value: 'Home', odd: '1.95', handicap: '-0.75', main: true }, { value: 'Away', odd: '1.85', handicap: '0.75', main: true }] },
  { name: 'Over/Under Line', values: [{ value: 'Over', odd: '1.85', handicap: '2.5,3.0' }, { value: 'Under', odd: '1.95', handicap: '2.5,3.0' }] },
  { name: 'Asian Handicap', values: [{ value: 'Home', odd: '2.05', handicap: '-0.25', suspended: true }, { value: 'Away', odd: '1.80', handicap: '0.25' },
    { value: 'Home', odd: '1.70', handicap: '0' }, { value: 'Away', odd: '2.15', handicap: '0' }] },
  { name: 'Fulltime Result', values: [{ value: 'Home', odd: '2.10' }, { value: 'Draw', odd: '3.10' }, { value: 'Away', odd: '3.80' }] }];
var lv = Net.pickLive(LIVE, false), lb = {};
Object.keys(lv).sort().forEach(function (k) { lb[k] = [lv[k].l, lv[k].o]; });
eq('live markets', lb, { ftc_ah: [-0.75, [1.95, 1.85]], ftc_ou: [10, [1.9, 1.9]], g_1x2: [null, [2.1, 3.1, 3.8]], g_ah: [0, [1.7, 2.15]], g_ou: [2.75, [1.85, 1.95]] });
eq('oddsNum', [Net.oddsNum('Over 2.5,3.0'), Net.oddsNum('-0.5,-1'), Net.oddsNum('Home -1.25')], [2.75, -0.75, -1.25]);
// every quoted line is kept, so a row moved to another line can take the bookmaker's odds for it
var altsOf = function (x) { return x.alts.map(function (a) { return [a.l, a.o]; }).sort(function (p, q) { return p[0] - q[0]; }); };
eq('pre alts corners', altsOf(pre.ftc_ou), [[9.5, [1.9, 1.9]], [10.5, [2.4, 1.55]]]);
eq('pre alts corner handicap', altsOf(pre.ftc_ah), [[-1.5, [1.95, 1.85]], [-0.5, [1.55, 2.4]]]);
eq('swapped alts mirrored', altsOf(sw.ftc_ah), [[0.5, [2.4, 1.55]], [1.5, [1.85, 1.95]]]);
eq('live alts', altsOf(lv.ftc_ou), [[10, [1.9, 1.9]], [11, [2.5, 1.5]]]);
eq('no alts without a line', [pre.g_1x2.alts === undefined, pre.btts.alts === undefined], [true, true]);

/* ---- team names: every team in the app vs typical long forms ---- */
var API_NAMES = { E0: { "Nott'm Forest": 'Nottingham Forest', 'Man United': 'Manchester United', 'Man City': 'Manchester City', 'Tottenham': 'Tottenham' },
  E1: { 'Wolves': 'Wolves', 'QPR': 'QPR', 'West Brom': 'West Brom', 'Sheffield United': 'Sheffield Utd' },
  E2: { 'Sheffield Weds': 'Sheffield Wednesday', 'Peterboro': 'Peterborough', 'Milton Keynes Dons': 'MK Dons' },
  SC0: { 'Hearts': 'Heart Of Midlothian', 'St Mirren': 'ST Mirren' }, SC1: { 'Inverness C': 'Inverness CT', 'Raith Rvs': 'Raith Rovers' },
  D1: { 'Bayern Munich': 'Bayern München', "M'gladbach": 'Borussia Mönchengladbach', 'Ein Frankfurt': 'Eintracht Frankfurt', 'FC Koln': '1. FC Köln', 'Leverkusen': 'Bayer Leverkusen' },
  SP1: { 'Ath Madrid': 'Atletico Madrid', 'Ath Bilbao': 'Athletic Club', 'Betis': 'Real Betis', 'Celta': 'Celta Vigo', 'Sociedad': 'Real Sociedad', 'Vallecano': 'Rayo Vallecano', 'Espanol': 'Espanyol', 'La Coruna': 'Deportivo La Coruna', 'Santander': 'Racing Santander' },
  I1: { 'Milan': 'AC Milan', 'Inter': 'Inter', 'Roma': 'AS Roma' }, F1: { 'Paris SG': 'Paris Saint Germain', 'Brest': 'Stade Brestois 29' },
  F2: { 'St Etienne': 'Saint Etienne' }, N1: { 'For Sittard': 'Fortuna Sittard', 'Nijmegen': 'NEC Nijmegen', 'PSV Eindhoven': 'PSV Eindhoven', 'AZ Alkmaar': 'AZ Alkmaar' },
  P1: { 'Sp Lisbon': 'Sporting CP', 'Sp Braga': 'SC Braga', 'Guimaraes': 'Vitoria Guimaraes' }, T1: { 'Buyuksehyr': 'Istanbul Basaksehir', 'Goztep': 'Goztepe' },
  G1: { 'Olympiakos': 'Olympiakos Piraeus', 'AEK': 'AEK Athens FC' }, B1: { 'St. Gilloise': 'Union St. Gilloise', 'St Truiden': 'St. Truiden', 'Standard': 'Standard Liege' } };
Object.keys(API_NAMES).forEach(function (code) {
  var L = B.leagues.filter(function (x) { return x.code === code; })[0], map = B.om_map[code];
  Object.keys(API_NAMES[code]).forEach(function (fd) {
    var api = API_NAMES[code][fd], keys = Net.teamKeys(fd, map), best = null, bs = -1;
    // the right team must beat every other team of the league
    L.teams.forEach(function (t) { var s = Net.nameScore(Net.teamKeys(t.n, map), api); if (s > bs) { bs = s; best = t.n; } });
    eq('name ' + code + ' ' + fd, [best, Net.nameScore(keys, api) >= 0.6], [fd, true]);
  });
});
// fixture ranking inside a day's list
function fx(id, h, a, lid) { return { fixture: { id: id, timestamp: 1, status: { short: 'NS' } }, league: { id: lid }, teams: { home: { id: id * 10, name: h }, away: { id: id * 10 + 1, name: a } } }; }
var day = [fx(1, 'Manchester United', 'Manchester City', 39), fx(2, 'Tottenham', 'Chelsea', 39), fx(3, 'Nottingham Forest', 'Arsenal', 39), fx(4, 'Arsenal Tula', 'Spartak', 235)];
var r = Net.rankFixtures(day, Net.teamKeys("Nott'm Forest", B.om_map.E0), Net.teamKeys('Arsenal', B.om_map.E0), 39);
eq('rank forest-arsenal', [r[0].f.fixture.id, Net.isSure(r)], [3, true]);
r = Net.rankFixtures(day, Net.teamKeys('Man City', B.om_map.E0), Net.teamKeys('Man United', B.om_map.E0), 39);
eq('rank swapped', [r[0].f.fixture.id, r[0].sw, Net.isSure(r)], [1, true, false]);

/* ---- fixture state ---- */
var F = { fixture: { id: 9, timestamp: 1700000000, status: { short: 'FT', elapsed: 90 } }, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 2, away: 1 },
  score: { halftime: { home: 1, away: 0 }, fulltime: { home: 2, away: 1 } },
  statistics: [{ team: { id: 1 }, statistics: [{ type: 'Corner Kicks', value: 7 }, { type: 'Red Cards', value: null }] }, { team: { id: 2 }, statistics: [{ type: 'Corner Kicks', value: 3 }, { type: 'Red Cards', value: 1 }] }] };
var s = Net.fixState(F, false);
eq('fixState', [s.done, s.g, s.g1, s.c, s.red], [true, [2, 1], [1, 0], [7, 3], [0, 1]]);
s = Net.fixState(F, true);
eq('fixState swapped', [s.g, s.g1, s.c], [[1, 2], [0, 1], [3, 7]]);
eq('first-half corners', Net.firstHalfCorners([{ team: { id: 1 }, statistics_1h: [{ type: 'Corner Kicks', value: 4 }] }, { team: { id: 2 }, statistics_1h: [{ type: 'Corner Kicks', value: '1' }] }], [1, 2]), [4, 1]);
eq('first-half corners missing', Net.firstHalfCorners([{ team: { id: 1 }, statistics: [] }], [1, 2]), null);

/* ---- settlement ---- */
var R = { c: [6, 4], c1: [3, 2], g: [2, 1], g1: [1, 1] };
function st(rec) { var x = Net.settle(rec, R); return x ? [x.u, x.pl] : null; }
eq('ou over 9.5 win', st({ m: 'ftc_ou', l: 9.5, s: 0, o: 1.9 }), [1, 0.9]);
eq('ou over 10 push', st({ m: 'ftc_ou', l: 10, s: 0, o: 1.9 }), [0, 0]);
eq('ou over 10.25 half loss', st({ m: 'ftc_ou', l: 10.25, s: 0, o: 1.9 }), [-0.5, -0.5]);
eq('ou under 10.25 half win', st({ m: 'ftc_ou', l: 10.25, s: 1, o: 1.9 }), [0.5, 0.45]);
eq('ou over 9.75 half win', st({ m: 'ftc_ou', l: 9.75, s: 0, o: 2.0 }), [0.5, 0.5]);
eq('ht ou under 4.5', st({ m: 'htc_ou', l: 4.5, s: 1, o: 1.85 }), [-1, -1]);
eq('home corners over 5.5', st({ m: 'hc_ou', l: 5.5, s: 0, o: 1.8 }), [1, 0.8]);
eq('away corners under 3.5', st({ m: 'ac_ou', l: 3.5, s: 1, o: 1.8 }), [-1, -1]);
eq('ah home -1.5 win (diff 2)', st({ m: 'ftc_ah', l: -1.5, s: 0, o: 1.95 }), [1, 0.95]);
eq('ah home -2 push', st({ m: 'ftc_ah', l: -2, s: 0, o: 1.95 }), [0, 0]);
eq('ah away +2.25 half win', st({ m: 'ftc_ah', l: -2.25, s: 1, o: 1.9 }), [0.5, 0.45]);
eq('ah home -1.75 half win', st({ m: 'ftc_ah', l: -1.75, s: 0, o: 2.0 }), [0.5, 0.5]);
eq('in-play ah from 4:1, home -0.5 loses (rest 2:3)', st({ m: 'ftc_ah', l: -0.5, s: 0, o: 1.9, b: [4, 1] }), [-1, -1]);
eq('in-play ah from 4:1, away +0.5 wins', st({ m: 'ftc_ah', l: -0.5, s: 1, o: 1.9, b: [4, 1] }), [1, 0.9]);
eq('ht ah 0 push', st({ m: 'htc_ah', l: -1, s: 0, o: 1.9 }), [0, 0]);
eq('corner match bet home', st({ m: 'ftc_x', s: 0, o: 1.4 }), [1, 0.4]);
eq('1x2 draw loses', st({ m: 'g_1x2', s: 1, o: 3.4 }), [-1, -1]);
eq('ht 1x2 draw wins', st({ m: 'gh_1x2', s: 1, o: 2.2 }), [1, 1.2]);
eq('goals over 2.75 half win', st({ m: 'g_ou', l: 2.75, s: 0, o: 2.0 }), [0.5, 0.5]);
eq('goals ah home -0.25 half win (2:1)', st({ m: 'g_ah', l: -0.25, s: 0, o: 1.9 }), [1, 0.9]);
eq('goals ah from 1:0, home -0.5 (rest 1:1) loses', st({ m: 'g_ah', l: -0.5, s: 0, o: 1.9, b: [1, 0] }), [-1, -1]);
eq('ht goals under 1.5', st({ m: 'gh_ou', l: 1.5, s: 1, o: 1.9 }), [-1, -1]);
eq('btts yes', st({ m: 'btts', s: 0, o: 1.9 }), [1, 0.9]);
eq('missing result', Net.settle({ m: 'htc_ou', l: 4.5, s: 0, o: 1.9 }, { c: [6, 4] }), null);

/* ---- open-matchday ---- */
var csv = 'gw,date,time,home,away,ft_home,ft_away,ft_result,ht_home,ht_away,ht_result,home_shots,away_shots,home_target,away_target,home_fouls,away_fouls,home_corners,away_corners,home_corners_1h,away_corners_1h\n' +
  '9,2026-10-25,16:30,Spurs,Man Utd,2,2,D,1,0,H,15,9,6,4,10,12,8,3,5,1\n' +
  '9,2026-10-26,14:00,Arsenal,Chelsea,1,0,H,0,0,D,12,8,5,2,9,11,7,4,,\n';
var om = Net.omResults(csv, B.om_map.E0);
eq('om rows', om.map(function (x) { return [x.d, x.h, x.a, x.g, x.g1, x.c, x.c1]; }),
  [['2026-10-25', 'Tottenham', 'Man United', [2, 2], [1, 0], [8, 3], [5, 1]], ['2026-10-26', 'Arsenal', 'Chelsea', [1, 0], [0, 0], [7, 4], null]]);
eq('om find', Net.omFind(om, 'Arsenal', 'Chelsea', '2026-10-26', 10).d, '2026-10-26');
eq('om find (saved the day after, JST)', !!Net.omFind(om, 'Tottenham', 'Man United', '2026-10-26', 10), true);
eq('om find too early', Net.omFind(om, 'Arsenal', 'Chelsea', '2026-11-05', 10), null);
if (process.argv[4]) {
  var real = Net.omResults(fs.readFileSync(process.argv[4], 'utf8'), B.om_map.E0);
  var known = {}; B.leagues[0].teams.forEach(function (t) { known[t.n] = 1; });
  var unk = real.filter(function (x) { return !known[x.h] || !known[x.a]; });
  eq('real E0 file: every team maps to the app', unk.length, 0);
  eq('real E0 file: first-half corners present', real.filter(function (x) { return x.c1; }).length > 0, true);
}
console.log(fails ? fails + ' of ' + n + ' checks FAILED' : 'all ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
