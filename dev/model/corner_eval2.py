import numpy as np, pandas as pd, time
exec(open('/home/claude/scripts/corner_dist.py').read().split("samp = tr.sample")[0])
from cdist import joint, tot_dif, M
sT, sD = np.load('/home/claude/data/corner_sig.npy')
OFF=M-1
def evaluate(te, PT, PD, label):
    tot=(te.hc+te.ac).values.astype(int); dif=(te.hc-te.ac).values.astype(int)
    n=len(te); out={'label':label}
    out['logS_tot']=np.log(np.clip(PT[np.arange(n),np.clip(tot,0,PT.shape[1]-1)],1e-12,1)).mean()
    out['logS_dif']=np.log(np.clip(PD[np.arange(n),np.clip(dif+OFF,0,PD.shape[1]-1)],1e-12,1)).mean()
    for L in [8.5,9.5,10.5,11.5]:
        p=PT[:,int(L+0.5):].sum(1); y=(tot>L)
        out[f'brier_o{L}']=((p-y)**2).mean()
    for h in [-1.5,0.5,1.5,2.5]:
        p=PD[:,int(np.floor(h))+1+OFF:].sum(1); y=(dif>h)
        out[f'brier_d>{h}']=((p-y)**2).mean()
    return out
t=time.time()
te=te.copy()
res=[]
J=joint(te.mh.values,te.ma.values,sT,sD); PT,PD=tot_dif(J); print('t',time.time()-t)
res.append(evaluate(te,PT,PD,'GLM+latent'))
J0=joint(te.mh.values,te.ma.values,1e-4,1e-4,nq=2); PT0,PD0=tot_dif(J0)
res.append(evaluate(te,PT0,PD0,'GLM+indepPois'))
# baseline: train-period league x side means (no team info)
lg=tr.join(D[[]]).copy()
mh0=np.full(len(te),tr.hc.mean()); ma0=np.full(len(te),tr.ac.mean())
J1=joint(mh0,ma0,sT,sD); PT1,PD1=tot_dif(J1)
res.append(evaluate(te,PT1,PD1,'const+latent'))
print(pd.DataFrame(res).set_index('label').T.round(5).to_string())
tot=(te.hc+te.ac).values; dif=(te.hc-te.ac).values
for nm,P_,y in [('over9.5',PT[:,10:].sum(1),tot>9.5),('hcap home -1.5',PD[:,OFF+2:].sum(1),dif>1.5),('away +... dif<-0.5',PD[:,:OFF].sum(1),dif<0)]:
    cal=pd.DataFrame({'p':P_,'y':y}).assign(b=lambda x:pd.qcut(x.p,8,duplicates='drop')).groupby('b',observed=True).agg(p=('p','mean'),y=('y','mean'),n=('y','size'))
    print(nm); print(cal.round(3).T.to_string())
obs=np.bincount(tot.astype(int),minlength=51)[:24]/len(tot)
print(pd.DataFrame({'obs':obs,'latent':PT.mean(0)[:24],'indep':PT0.mean(0)[:24]}).round(4).T.to_string())
obsd=np.bincount((dif+OFF).astype(int),minlength=51)[OFF-10:OFF+11]/len(dif)
print(pd.DataFrame({'d':np.arange(-10,11),'obs':obsd,'latent':PD.mean(0)[OFF-10:OFF+11],'indep':PD0.mean(0)[OFF-10:OFF+11]}).round(4).T.to_string())
np.save('/home/claude/data/te_PT.npy',PT)
