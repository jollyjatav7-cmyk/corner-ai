import sys; sys.path.insert(0,'/home/claude/scripts')
import numpy as np, pandas as pd, json, copy
from engine import Engine, G, MULT
X=pd.read_pickle('/home/claude/data/features.pkl')
d=X[(X.season>=2022)&X.lh.notna()&X.HTHome.notna()].sample(12000,random_state=5)
tuned=json.load(open('/home/claude/data/goal_state_tuned2.json'))
M2=copy.deepcopy(MULT)
for k,v in tuned.items():
    if k!='lvl': M2['g'][k]=v
M2['g2_level']=tuned['lvl']
i=np.arange(G); gd=i[:,None]-i[None,:]; tt=i[:,None]+i[None,:]
res=d.FTResult.values; tot=(d.FTHome+d.FTAway).values
hh=d.HTHome.values.astype(int).clip(0,G-1); ha=d.HTAway.values.astype(int).clip(0,G-1)
for name,mult in [('original',MULT),('tuned',M2)]:
    E=Engine(3,6,mult)
    # level for 2H goals (g2_level) is not supported by python engine directly -> fold into 2H time multipliers
    if mult.get('g2_level',0):
        for k,s in enumerate(E.S):
            if s[0]==2: E.tm_g[k]*=np.exp(mult['g2_level'])
    bh,ba=E.calibrate_goals(d.lh.values,d.la.values,iters=10)
    r=E.run(bh,ba); P=r['P']
    pH=(P*(gd>0)).sum((1,2)); pD=(P*(gd==0)).sum((1,2)); pA=1-pH-pD
    ll=-np.log(np.where(res=='H',pH,np.where(res=='D',pD,pA))).mean()
    po=(P*(tt>2.5)).sum((1,2)); llo=-np.mean(np.log(np.where(tot>2.5,po,1-po)))
    start=[k for k,s in enumerate(E.S) if s[0]==2][0]
    P0=np.zeros((len(d),G,G)); P0[np.arange(len(d)),hh,ha]=1
    r2=E.run(bh,ba,start=start,P0=P0); P2=r2['P']
    pH2=(P2*(gd>0)).sum((1,2)); pD2=(P2*(gd==0)).sum((1,2)); pA2=1-pH2-pD2
    ll2=-np.log(np.clip(np.where(res=='H',pH2,np.where(res=='D',pD2,pA2)),1e-9,1)).mean()
    po2=(P2*(tt>2.5)).sum((1,2)); llo2=-np.mean(np.log(np.clip(np.where(tot>2.5,po2,1-po2),1e-9,1)))
    fh=d.FTHome.values.clip(0,G-1).astype(int); fa=d.FTAway.values.clip(0,G-1).astype(int)
    lls=-np.log(np.clip(P2[np.arange(len(d)),fh,fa],1e-12,1)).mean()
    print(f'{name:9s} prematch 1X2 {ll:.5f}  O2.5 {llo:.5f}  pD {pD.mean():.4f}(act {(res=="D").mean():.4f}) | HT->FT 1X2 {ll2:.5f}  O2.5 {llo2:.5f}  exact score {lls:.5f}')
mk=-np.log(np.where(res=='H',d.pH,np.where(res=='D',d.pD,d.pA))).mean()
print('market prematch 1X2', round(mk,5))
