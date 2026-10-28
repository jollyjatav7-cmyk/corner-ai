import numpy as np, pandas as pd, time
from engine import Engine, G
from common import dc_matrix
X=pd.read_pickle('/home/claude/data/features.pkl')
d=X[(X.season>=2022)&X.lh.notna()&X.HTHome.notna()].copy()
d=d.sample(20000,random_state=0) if len(d)>20000 else d
E=Engine(3,6)
t=time.time()
bh,ba=E.calibrate_goals(d.lh.values,d.la.values)
r=E.run(bh,ba)
print('calib time',time.time()-t)
P=r['P']; i=np.arange(G)
gd=i[:,None]-i[None,:]
pH=(P*(gd>0)).sum((1,2)); pD=(P*(gd==0)).sum((1,2)); pA=1-pH-pD
res=d.FTResult.values
ll_eng=-np.log(np.where(res=='H',pH,np.where(res=='D',pD,pA))).mean()
ll_mkt=-np.log(np.where(res=='H',d.pH,np.where(res=='D',d.pD,d.pA))).mean()
# DC model from lambdas
dcH=[];dcD=[]
for lh,la in zip(d.lh.values,d.la.values):
    J=dc_matrix(lh,la,-0.06,10); dcH.append(np.tril(J,-1).sum()); dcD.append(np.trace(J))
dcH=np.array(dcH); dcD=np.array(dcD); dcA=1-dcH-dcD
ll_dc=-np.log(np.where(res=='H',dcH,np.where(res=='D',dcD,dcA))).mean()
print('pre-match 1X2 logloss  market',round(ll_mkt,5),' DC(lambda)',round(ll_dc,5),' engine',round(ll_eng,5))
print('mean pD market',d.pD.mean().round(4),'DC',dcD.mean().round(4),'engine',pD.mean().round(4),'actual',(res=='D').mean().round(4))
# HT -> FT
HT=r['HT']
hh=d.HTHome.values.astype(int); ha=d.HTAway.values.astype(int)
P0=np.zeros((len(d),G,G)); P0[np.arange(len(d)),hh,ha]=1
start=[k for k,s in enumerate(E.S) if s[0]==2][0]
r2=E.run(bh,ba,start=start,P0=P0)
P2=r2['P']
pH2=(P2*(gd>0)).sum((1,2)); pD2=(P2*(gd==0)).sum((1,2)); pA2=1-pH2-pD2
ll2=-np.log(np.clip(np.where(res=='H',pH2,np.where(res=='D',pD2,pA2)),1e-9,1)).mean()
# naive: remaining goals Poisson with lambda*(1-0.44), independent, no state effects
from scipy.stats import poisson
rem_h=d.lh.values*0.56; rem_a=d.la.values*0.56
Pn=np.zeros_like(P2)
for k in range(len(d)):
    m=np.outer(poisson.pmf(i,rem_h[k]),poisson.pmf(i,rem_a[k]))
    Pn[k]=np.roll(np.roll(m,hh[k],0),ha[k],1)  # approx (cap ignored)
pHn=(Pn*(gd>0)).sum((1,2)); pDn=(Pn*(gd==0)).sum((1,2)); pAn=1-pHn-pDn
lln=-np.log(np.clip(np.where(res=='H',pHn,np.where(res=='D',pDn,pAn)),1e-9,1)).mean()
print('HT->FT 1X2 logloss  engine',round(ll2,5),' naive',round(lln,5))
# total goals O/U 2.5 at HT
tot=(d.FTHome+d.FTAway).values
tt=i[:,None]+i[None,:]
po=(P2*(tt>2.5)).sum((1,2)); pon=(Pn*(tt>2.5)).sum((1,2))
y=tot>2.5
print('HT->FT O2.5 logloss engine',-np.mean(np.log(np.clip(np.where(y,po,1-po),1e-9,1))).round(5),' naive',-np.mean(np.log(np.clip(np.where(y,pon,1-pon),1e-9,1))).round(5))
# calibration of 2H goals expectation by HT state
d['e2']=(P2*tt).sum((1,2))-(hh+ha); d['o2']=tot-(hh+ha); d['n2']=rem_h+rem_a
d['htgd']=np.clip(hh-ha,-2,2)
print(d.groupby('htgd')[['e2','n2','o2']].mean().round(3))
# HT pre-match calibration
pHT=r['HT']; eht=(pHT*tt).sum((1,2)); print('HT goals exp',eht.mean().round(4),'obs',(hh+ha).mean().round(4))
