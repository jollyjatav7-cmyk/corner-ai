var fs=require('fs'); var Core=require('./app_core.js');
var B=JSON.parse(fs.readFileSync(__dirname+'/bundle.json','utf8')); var st=Core.buildRatings(B);
function idx(code,h,a){var li=B.leagues.findIndex(function(L){return L.code===code});var T=B.leagues[li].teams;return {li:li,hi:T.findIndex(function(t){return t.n===h}),ai:T.findIndex(function(t){return t.n===a})};}
var s=idx('D1','Bayern Munich','Union Berlin');
var a=Core.prematch({B:B,st:st,li:s.li,hi:s.hi,ai:s.ai,odds:{h:1.20,d:7.0,a:13.0,ouLine:2.5,over:null,under:null}});
console.log('1X2 only: lh %s la %s mh %s ma %s', a.lh.toFixed(3), a.la.toFixed(3), a.mh.toFixed(2), a.ma.toFixed(2), 'ratingGoals', a.ratingGoals.map(function(x){return x.toFixed(2)}));
var o=Core.prematch({B:B,odds:{h:2.10,d:3.30,a:3.40,ouLine:2.5,over:1.95,under:1.85},manual:{avgTotal:9.6,homeShare:0.54}});
console.log('other league: lh %s la %s mh %s ma %s mh1 %s', o.lh.toFixed(3), o.la.toFixed(3), o.mh.toFixed(2), o.ma.toFixed(2), o.mh1.toFixed(2));
var lv=Core.live(B,a,{per:1,minute:44,gh:0,ga:0,ch:3,ca:1,rh:0,ra:0});
console.log('1H 44min: remHT', lv.remHT.map(function(x){return x.toFixed(2)}), 'remFT', lv.remFT.map(function(x){return x.toFixed(2)}));
var lv2=Core.live(B,a,{per:1,minute:47,added:'5',gh:0,ga:0,ch:3,ca:1,rh:0,ra:0});
console.log('1H 47min +5 added: remHT', lv2.remHT.map(function(x){return x.toFixed(2)}));
var lv3=Core.live(B,a,{per:2,minute:100,gh:2,ga:1,ch:9,ca:2,rh:0,ra:1});
console.log('2H 100min: remFT', lv3.remFT.map(function(x){return x.toFixed(3)}), 'next', lv3.next.map(function(x){return x.toFixed(3)}));
var gm=Core.goalsMarkets(lv3.goalsFT); console.log('pH',gm.pH.toFixed(3),'pD',gm.pD.toFixed(3));
// quarter line & integer line stats
var ft=a.cornersFT; ['9','9.25','9.5','9.75','10'].forEach(function(L){var r=Core.betStats(ft.tot,0,'over',+L,1.9);console.log('over',L,'win',r.win.toFixed(4),'push',r.push.toFixed(4),'fair',r.fair.toFixed(3),'ev',r.ev.toFixed(4));});
