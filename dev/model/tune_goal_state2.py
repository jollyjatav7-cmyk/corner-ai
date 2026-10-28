import sys; sys.path.insert(0, "/home/claude/scripts")
import numpy as np, pandas as pd, json, time, copy
from scipy.optimize import minimize
from engine import Engine, G, MULT
X=pd.read_pickle('/home/claude/data/features.pkl')
d=X[X.lh.notna()&X.HTHome.notna()&(X.FTHome-X.HTHome>=0)&(X.FTAway-X.HTAway>=0)].copy()
tr=d[(d.season>=2012)&(d.season<=2021)].sample(14000,random_state=11)
te=d[d.season>=2022].sample(14000,random_state=12)
E0=Engine(3,6)
def prep(D):
    bh,ba=E0.calibrate_goals(D.lh.values,D.la.values,iters=8)
    hh=np.clip(D.HTHome.values.astype(int),0,G-1); ha=np.clip(D.HTAway.values.astype(int),0,G-1)
    fh=D.FTHome.values.astype(int).clip(0,G-1); fa=D.FTAway.values.astype(int).clip(0,G-1)
    P0=np.zeros((len(D),G,G)); P0[np.arange(len(D)),hh,ha]=1
    return bh,ba,P0,fh,fa
t=time.time(); TR=prep(tr); TE=prep(te); print('prep',round(time.time()-t,1),flush=True)
start=[k for k,s in enumerate(E0.S) if s[0]==2][0]
# structured params (log multipliers): trail1 (gd=-1), trail2 (gd<=-2), lead1 (gd=+1), lead2 (gd>=2) for phase 1 and phase 2 -> 8, + level
keys=[f'gd{v:+d}_p{ph}' for v in (-2,-1,1,2) for ph in (1,2)]
def nll(theta,D):
    mult=copy.deepcopy(MULT)
    for k,v in zip(keys,theta[:-1]): mult['g'][k]=float(v)
    E=Engine(3,6,mult)
    bh,ba,P0,fh,fa=D
    lvl=np.exp(theta[-1])
    r=E.run(bh*lvl,ba*lvl,start=start,P0=P0)
    p=r['P'][np.arange(len(fh)),fh,fa]
    return -np.log(np.clip(p,1e-12,1)).mean()
th0=np.array([MULT['g'][k] for k in keys]+[0.0])
t=time.time(); f0=nll(th0,TR); print('eval time',round(time.time()-t,2),'init train',f0,'test',nll(th0,TE),flush=True)
res=minimize(nll,th0,args=(TR,),method='L-BFGS-B',options=dict(maxiter=40,eps=1e-3),bounds=[(-0.7,0.7)]*len(keys)+[(-0.3,0.3)])
print(res.message,res.nfev,flush=True)
ftr=nll(res.x,TR); fte=nll(res.x,TE)
print('fit train',ftr,'test',fte,' (init test',nll(th0,TE),')')
print(dict(zip(keys+['lvl'],np.round(np.exp(res.x),3))))
json.dump(dict(zip(keys+['lvl'],res.x.tolist())),open('/home/claude/data/goal_state_tuned2.json','w'))
