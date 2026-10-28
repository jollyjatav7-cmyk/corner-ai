import numpy as np, pandas as pd, json, sys
sys.path.insert(0,'/home/claude/scripts')
from sklearn.linear_model import PoissonRegressor
from prematch_models import side_rows
X=pd.read_pickle('/home/claude/data/features.pkl')
X=X[(X.season>=2008)&X.HomeCorners.notna()&X.lh.notna()]
S=side_rows(X,'c')
cols=['home','lam_t','lam_o']
tr=S.season<=2025
w=np.exp(S.base)
m=PoissonRegressor(alpha=1e-7,max_iter=1000).fit(S.loc[tr,cols],S.loc[tr,'y']/w[tr],sample_weight=w[tr])
print(dict(zip(cols,np.round(m.coef_,4))),round(m.intercept_,4))
json.dump(dict(cols=cols,coef=m.coef_.tolist(),intercept=float(m.intercept_),offset='base'),open('/home/claude/data/glm_market_only.json','w'))
# quick check: deviance on 2022+ vs full models trained <=2021
te=S.season>=2022
m2=PoissonRegressor(alpha=1e-7,max_iter=1000).fit(S.loc[S.season<=2021,cols],S.loc[S.season<=2021,'y']/w[S.season<=2021],sample_weight=w[S.season<=2021])
mu=np.exp(m2.intercept_+S.loc[te,cols].values@m2.coef_)*w[te]
y=S.loc[te,'y'].values
dev=2*np.mean(np.where(y>0,y*np.log(np.where(y>0,y,1)/mu),0)-(y-mu))
print('market-only(offset) test deviance',round(dev,4))
