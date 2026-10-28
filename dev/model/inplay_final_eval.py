import numpy as np, pandas as pd, sys
sys.path.insert(0,'/home/claude/scripts')
from cdist import joint, tot_dif, M
R=pd.read_pickle('/home/claude/data/snapshots.pkl')
OFF=M-1
rows=[]
for tau in [15,30,45,60,75]:
    D=R[R.tau==tau].copy()
    K=2.0
    rch=np.log((D.ch+K)/(D.eSh+K)); rca=np.log((D.ca+K)/(D.eSa+K))
    bc=0.0022*tau; bo=-0.0009*max(0,tau-30)
    mh=D.eRh*np.exp(bc*rch+bo*rca); ma=D.eRa*np.exp(bc*rca+bo*rch)
    Et=(mh+ma).values; sD=np.minimum(0.6,0.109+0.40/np.sqrt(np.maximum(Et,0.05)))
    # model: per-row joint with row-specific sD -> group by rounded sD to vectorise
    PT=np.zeros((len(D),2*M-1)); PD=np.zeros((len(D),2*M-1))
    key=np.round(sD,2)
    for k in np.unique(key):
        idx=np.where(key==k)[0]
        J=joint(mh.values[idx],ma.values[idx],0.105,k); a,b=tot_dif(J); PT[idx]=a; PD[idx]=b
    # naive: pre-match mean x share of time remaining (to 90'+stoppage ~ (95-tau)/95), independent Poisson
    frac=(95-tau)/95.0
    nh=D.mu_ch*frac; na=D.mu_ca*frac
    J0=joint(nh.values,na.values,1e-4,1e-4,nq=2); PT0,PD0=tot_dif(J0)
    rem=(D.Rh+D.Ra).values.astype(int); dif=(D.Rh-D.Ra).values.astype(int)
    i=np.arange(len(D))
    cur=(D.ch+D.ca).values
    # line: final total over (current + round(expected remaining)) - 0.5 ... use line at final mean
    fin_mean=cur+Et; L=np.floor(fin_mean)+0.5
    need=(L-cur+0.5).astype(int)  # remaining >= need  <=> final > L
    po=np.array([PT[j,max(need[j],0):].sum() for j in i]); po0=np.array([PT0[j,max(need[j],0):].sum() for j in i])
    y=(cur+rem)>L
    rows.append(dict(tau=tau,n=len(D),logS_model=np.log(PT[i,rem]).mean(),logS_naive=np.log(np.clip(PT0[i,rem],1e-12,1)).mean(),
        logS_dif_model=np.log(PD[i,dif+OFF]).mean(),logS_dif_naive=np.log(np.clip(PD0[i,dif+OFF],1e-12,1)).mean(),
        brier_model=((po-y)**2).mean(),brier_naive=((po0-y)**2).mean(),pred_over=po.mean(),actual_over=y.mean(),
        mean_rem_pred=Et.mean(),mean_rem_act=rem.mean()))
r=pd.DataFrame(rows).set_index('tau')
pd.set_option('display.width',250)
print(r.round(4).to_string())
