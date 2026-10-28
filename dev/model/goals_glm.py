import numpy as np, pandas as pd
from sklearn.linear_model import PoissonRegressor
from common import dc_matrix
X=pd.read_pickle('/home/claude/data/features.pkl')
X=X[(X.season>=2008)&X.FTHome.notna()].copy()
X['elod']=(X.HomeElo-X.AwayElo)/100
def stack(D):
    H=pd.DataFrame({'y':D.FTHome.values,'home':1.0,'base':D.g_bh.values,'g_att':D.g_att_h.values,'g_dfn':D.g_dfn_a.values,
        's_att':D.s_att_h.values,'s_dfn':D.s_dfn_a.values,'t_att':D.t_att_h.values,'t_dfn':D.t_dfn_a.values,'elod':D.elod.values,
        'mid':np.arange(len(D)),'season':D.season.values,'hasstats':D.HomeShots.notna().values})
    A=pd.DataFrame({'y':D.FTAway.values,'home':0.0,'base':D.g_ba.values,'g_att':D.g_att_a.values,'g_dfn':D.g_dfn_h.values,
        's_att':D.s_att_a.values,'s_dfn':D.s_dfn_h.values,'t_att':D.t_att_a.values,'t_dfn':D.t_dfn_h.values,'elod':-D.elod.values,
        'mid':np.arange(len(D)),'season':D.season.values,'hasstats':D.HomeShots.notna().values})
    return pd.concat([H,A],ignore_index=True)
S=stack(X)
S['elod']=S.elod.fillna(0)
tr=(S.season<=2021); te=(S.season>=2022)
for cols in [['g_att','g_dfn'],['g_att','g_dfn','elod'],['g_att','g_dfn','s_att','s_dfn','t_att','t_dfn','elod']]:
    c2=['base','home']+cols
    m=PoissonRegressor(alpha=1e-6,max_iter=500).fit(S.loc[tr,c2],S.loc[tr,'y'])
    S['mu']=m.predict(S[c2])
    print(cols,dict(zip(c2,np.round(m.coef_,3))),round(m.intercept_,3))
    P=S[te].pivot_table(index='mid',columns='home',values='mu')
    Xt=X.iloc[P.index]
    lh=P[1.0].values; la=P[0.0].values
    # 1X2 log loss vs market
    from scipy.stats import poisson
    k=np.arange(11)
    ll=[];llm=[];llo=[];llom=[]
    for i in range(len(lh)):
        J=dc_matrix(lh[i],la[i],rho=-0.06,maxg=10)
        pH=np.tril(J,-1).sum(); pD=np.trace(J); pA=1-pH-pD; pO=J[(k[:,None]+k[None,:])>2.5].sum()
        r=Xt.FTResult.iloc[i]; g=Xt.FTHome.iloc[i]+Xt.FTAway.iloc[i]
        ll.append(np.log({'H':pH,'D':pD,'A':pA}[r])); llo.append(np.log(pO if g>2.5 else 1-pO))
        if not np.isnan(Xt.pH.iloc[i]):
            llm.append((np.log({'H':Xt.pH.iloc[i],'D':Xt.pD.iloc[i],'A':Xt.pA.iloc[i]}[r]), ll[-1]))
            llom.append((np.log(Xt.pO.iloc[i] if g>2.5 else 1-Xt.pO.iloc[i]), llo[-1]))
    llm=np.array(llm); llom=np.array(llom)
    print('  test 1X2 logloss model',-np.mean(ll).round(4),' on odds subset: market',-llm[:,0].mean().round(4),'model',-llm[:,1].mean().round(4),
          ' O/U2.5: market',-llom[:,0].mean().round(4),'model',-llom[:,1].mean().round(4))
