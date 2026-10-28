import json, pickle, numpy as np, sys
sys.path.insert(0,'/home/claude/scripts')
from scipy.optimize import least_squares
from common import dc_matrix
import engine as EN
from cdist import joint, tot_dif, M
B=json.load(open('/home/claude/app/bundle.json'))
J=json.load(open('/home/claude/data/js_out.json'))
S=pickle.load(open('/home/claude/data/rating_state_final.pkl','rb'))
met=['c','s','t','g']
# 1) ratings
mx=0
for n,v in J['rat'].items():
    py=[S[m]['att'][n] for m in met]+[S[m]['dfn'][n] for m in met]
    mx=max(mx,max(abs(a-b) for a,b in zip(py,v)))
mx=max(mx,max(abs(S[m]['base']['E0'][k]-J['base_E0'][m][k]) for m in met for k in (0,1)))
print('ratings max abs diff JS vs python full run:',mx)
def devig(o):
    inv=1/np.array(o,float); lo,hi=0.5,3.0
    for _ in range(80):
        c=(lo+hi)/2; s=(inv**c).sum()
        if s<1: hi=c
        else: lo=c
    p=inv**c; return p/p.sum()
def solve(odds,line,ou):
    q=devig(odds); qo=devig(ou)
    def res(v):
        lh,la=np.exp(v); Mx=dc_matrix(lh,la,-0.06,12); k=np.arange(13); tot=np.zeros(26)
        for i in range(13):
            for j in range(13): tot[i+j]+=Mx[i,j]
        pH=np.tril(Mx,-1).sum(); pA=np.triu(Mx,1).sum()
        parts=[line-0.25,line+0.25] if abs((line*4)%2-1)<1e-9 else [line]
        W=Lo=0
        for L in parts:
            x=np.arange(26); W+=tot[x>L].sum()/len(parts); Lo+=tot[x<L].sum()/len(parts)
        ev=W*(1/qo[0]-1)-Lo
        return [pH-q[0],pA-q[2],ev*qo[0]]
    r=least_squares(res,np.log([1.4,1.1]),xtol=1e-12,ftol=1e-12)
    return np.exp(r.x)
def feats(L,team,opp,home):
    t=lambda m,k,x: S[m]['att' if k=='att' else 'dfn'][x]
    f=dict(base=S['c']['base'][L][0 if home else 1],home=1.0 if home else 0.0,
      c_att=t('c','att',team),c_dfn=t('c','dfn',opp),s_att=t('s','att',team),s_dfn=t('s','dfn',opp),
      t_att=t('t','att',team),t_dfn=t('t','dfn',opp),g_att=t('g','att',team),g_dfn=t('g','dfn',opp),
      opp_c_att=t('c','att',opp),opp_c_dfn=t('c','dfn',team))
    return f
def glm(spec,f):
    return float(np.exp(spec['intercept']+sum(c*f[k] for k,c in zip(spec['cols'],spec['coef']))))
def check(name,L,h,a,odds,line,ou):
    fh=feats(L,h,a,True); fa=feats(L,a,h,False)
    if odds:
        lh,la=solve(odds,line,ou)
        fh.update(lam_t=np.log(lh),lam_o=np.log(la)); fa.update(lam_t=np.log(la),lam_o=np.log(lh))
        mh=glm(B['glm']['corner_mkt'],fh); ma=glm(B['glm']['corner_mkt'],fa)
    else:
        gh=dict(fh); ga=dict(fa); gh['base']=S['g']['base'][L][0]; ga['base']=S['g']['base'][L][1]
        lh=glm(B['glm']['goals_nomkt'],gh); la=glm(B['glm']['goals_nomkt'],ga)
        mh=glm(B['glm']['corner_nomkt'],fh); ma=glm(B['glm']['corner_nomkt'],fa)
    E=EN.Engine(3,6,mult=B['mult'])
    bh,ba=E.calibrate_goals(np.array([lh]),np.array([la]),iters=14)
    cbh,cba,r0=E.calibrate_corners(bh,ba,np.array([mh]),np.array([ma]))
    r=E.run(bh,ba,ch=cbh,ca=cba)
    h1=r['EC1_h'][0]*np.exp(-0.016); a1=r['EC1_a'][0]*np.exp(-0.016)
    PT,PD=tot_dif(joint([mh],[ma],0.106,0.239)); PTH,PDH=tot_dif(joint([h1],[a1],0.114,0.244))
    P=r['P'][0]; i=np.arange(EN.G); gd=i[:,None]-i[None,:]
    py=dict(lh=lh,la=la,mh=mh,ma=ma,mh1=h1,ma1=a1,ft_o95=PT[0,10:].sum(),ft_d15=PD[0,M-1+2:].sum(),ht_o45=PTH[0,5:].sum(),
            pH=(P*(gd>0)).sum(),pD=(P*(gd==0)).sum(),g_o25=(P*((i[:,None]+i[None,:])>2.5)).sum())
    js=J[name]
    print(name,' '.join(f"{k}: py={v:.4f} js={js[k]:.4f}" for k,v in py.items()))
    return (bh,ba,cbh,cba,lh,la,mh,ma)
c1=check('S1','E0','Arsenal','Chelsea',[1.8,3.8,4.5],2.5,[1.85,1.95])
check('S2','E0','Arsenal','Chelsea',None,None,None)
check('S3','SP1','Barcelona','Getafe',[1.25,6.0,11.0],3.25,[1.9,1.9])
# live L1: per 2 minute 60, 1-0, corners 5-3
bh,ba,cbh,cba,lh,la,mh,ma=c1
E=EN.Engine(3,6,mult=B['mult_live'])
lv=B['mult_live'].get('g2_level',0)
if lv:
    for k,sl in enumerate(E.S):
        if sl[0]==2: E.tm_g[k]*=np.exp(lv)
bh,ba=E.calibrate_goals(np.array([lh]),np.array([la]),iters=14)
cbh,cba,_=E.calibrate_corners(bh,ba,np.array([mh]),np.array([ma]))
k0=48+(60-45)
so=E.run(bh,ba,start=0,ch=cbh,ca=cba,upto=k0)
rch=np.log((5+2)/(so['EC_h'][0]+2)); rca=np.log((3+2)/(so['EC_a'][0]+2))
bc=0.0022*60; bo=-0.0009*30
mh_=np.exp(bc*rch+bo*rca); ma_=np.exp(bc*rca+bo*rch)
P0=np.zeros((1,EN.G,EN.G)); P0[0,1,0]=1
r=E.run(bh,ba,start=k0,P0=P0,ch=cbh*mh_,ca=cba*ma_)
Et=r['EC_h'][0]+r['EC_a'][0]; sD=min(0.6,0.109+0.40/np.sqrt(Et))
PT,PD=tot_dif(joint(r['EC_h'],r['EC_a'],0.105,sD))
i=np.arange(EN.G); gd=i[:,None]-i[None,:]
print('L1 remFT py',r['EC_h'][0],r['EC_a'][0],' js',J['L1']['remFT'],'  P(final>10.5) py',PT[0,3:].sum(),'js',J['L1']['ft_o105'])
print('L1 goals pH py',(r['P'][0]*(gd>0)).sum(),' js',J['L1']['pH'])
