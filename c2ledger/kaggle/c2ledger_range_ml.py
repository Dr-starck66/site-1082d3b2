#!/usr/bin/env python3
import argparse, hashlib, json, os
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

FEATURES=[
    "asset_availability","detection_latency_ms","containment_latency_ms",
    "evidence_integrity","recovery_ratio","alert_density",
    "chain_signal","supply_chain_signal"
]
LAB_TARGETS=["lab-edge","lab-ci","lab-data"]
SAFE_EFFECTS=["plant-marker","stage-synthetic-data","rotate-canary","degrade-service","recover"]

def synthetic(rows:int,seed:int)->pd.DataFrame:
    rng=np.random.default_rng(seed)
    n=max(1000,rows)
    df=pd.DataFrame({
        "asset_availability":np.clip(rng.normal(.965,.025,n),0,1),
        "detection_latency_ms":np.clip(rng.lognormal(np.log(750),.45,n),10,12000),
        "containment_latency_ms":np.clip(rng.lognormal(np.log(2400),.55,n),50,30000),
        "evidence_integrity":np.clip(rng.normal(.985,.012,n),0,1),
        "recovery_ratio":np.clip(rng.normal(.94,.05,n),0,1),
        "alert_density":np.clip(rng.gamma(2.0,1.4,n),0,20),
        "chain_signal":np.clip(rng.beta(1.5,7,n),0,1),
        "supply_chain_signal":np.clip(rng.beta(1.3,8,n),0,1),
    })
    idx=rng.choice(n,size=max(40,int(n*.08)),replace=False)
    df.loc[idx,"asset_availability"]*=rng.uniform(.25,.75,len(idx))
    df.loc[idx,"detection_latency_ms"]*=rng.uniform(2.5,7,len(idx))
    df.loc[idx,"containment_latency_ms"]*=rng.uniform(2.0,6,len(idx))
    df.loc[idx,"evidence_integrity"]*=rng.uniform(.55,.9,len(idx))
    df.loc[idx,"recovery_ratio"]*=rng.uniform(.35,.8,len(idx))
    df.loc[idx,"alert_density"]+=rng.uniform(6,16,len(idx))
    df.loc[idx,"chain_signal"]=rng.uniform(.65,1,len(idx))
    df.loc[idx,"supply_chain_signal"]=rng.uniform(.55,1,len(idx))
    return df

def load(path:str|None,rows:int,seed:int)->pd.DataFrame:
    if path and Path(path).exists():
        df=pd.read_csv(path)
        missing=[c for c in FEATURES if c not in df.columns]
        if missing: raise SystemExit("missing columns: "+",".join(missing))
        return df[FEATURES].replace([np.inf,-np.inf],np.nan).dropna().clip(lower=0)
    return synthetic(rows,seed)

def normalize_features(df:pd.DataFrame)->pd.DataFrame:
    x=df.copy()
    for c in FEATURES:
        med=float(x[c].median())
        mad=float((x[c]-med).abs().median()) or 1.0
        x[c]=(x[c]-med)/(1.4826*mad)
    return x.clip(-12,12)

def build_plan(df:pd.DataFrame,seed:int):
    x=normalize_features(df)
    model=IsolationForest(n_estimators=300,contamination=0.08,random_state=seed,n_jobs=-1)
    pred=model.fit_predict(x)
    raw=-model.score_samples(x)
    lo,hi=float(raw.min()),float(raw.max())
    norm=(raw-lo)/(hi-lo+1e-9)
    anomaly=(pred==-1)
    anomaly_fraction=float(anomaly.mean())
    risky=df.loc[anomaly] if anomaly.any() else df.nlargest(max(1,len(df)//20),"alert_density")
    means={
        "availability_loss":float(1-risky["asset_availability"].mean()),
        "detection_latency":float(risky["detection_latency_ms"].mean()),
        "containment_latency":float(risky["containment_latency_ms"].mean()),
        "evidence_loss":float(1-risky["evidence_integrity"].mean()),
        "recovery_loss":float(1-risky["recovery_ratio"].mean()),
        "chain_signal":float(risky["chain_signal"].mean()),
        "supply_chain_signal":float(risky["supply_chain_signal"].mean()),
        "alert_density":float(risky["alert_density"].mean())
    }
    pressure=min(1.0,max(anomaly_fraction*4,means["chain_signal"],means["supply_chain_signal"],means["availability_loss"]*2))
    staged=max(3,min(24,int(round(4+pressure*16))))
    primary="lab-edge" if means["chain_signal"]>=means["supply_chain_signal"] else "lab-ci"
    secondary="lab-data"
    steps=[
      {"target":primary,"effect":"plant-marker","id":"kaggle-observe","service":"mission-edge","count":1},
      {"target":"lab-ci","effect":"stage-synthetic-data","id":"kaggle-stage","service":"software-factory","count":staged},
      {"target":secondary,"effect":"rotate-canary","id":"kaggle-canary","service":"data-store","count":1},
    ]
    if pressure>=0.45:
        steps.append({"target":primary,"effect":"degrade-service","id":"kaggle-degrade","service":"synthetic-critical-service","count":1})
    steps += [
      {"target":primary,"effect":"recover","id":"kaggle-recover-edge","service":"mission-edge","count":1},
      {"target":"lab-ci","effect":"recover","id":"kaggle-recover-ci","service":"software-factory","count":1},
      {"target":secondary,"effect":"recover","id":"kaggle-recover-data","service":"data-store","count":1},
    ]
    plan={
      "schema":"c2ledger-kaggle-plan/v1",
      "mode":"EPHEMERAL_PRIVATE_LAB_ONLY",
      "model":"IsolationForest",
      "seed":seed,
      "steps":steps,
      "safety":{
        "publicInternetTargets":False,
        "arbitraryTargets":False,
        "arbitraryCommands":False,
        "exploitDelivery":False,
        "credentialTheft":False,
        "propagation":False,
        "destructiveActions":False
      }
    }
    metrics={
      "schema":"c2ledger-kaggle-metrics/v1",
      "rows":int(len(df)),
      "anomalies":int(anomaly.sum()),
      "anomalyFraction":round(anomaly_fraction,6),
      "anomalyScoreP95":round(float(np.quantile(norm,.95)),6),
      "pressure":round(float(pressure),6),
      "riskMeans":{k:round(v,6) for k,v in means.items()},
      "features":FEATURES
    }
    return plan,metrics

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",default=os.getenv("C2LEDGER_TELEMETRY_CSV"))
    p.add_argument("--output-dir",default=os.getenv("C2LEDGER_KAGGLE_OUTPUT","/kaggle/working"))
    p.add_argument("--rows",type=int,default=6000)
    p.add_argument("--seed",type=int,default=1300)
    a=p.parse_args()
    out=Path(a.output_dir); out.mkdir(parents=True,exist_ok=True)
    df=load(a.input,a.rows,a.seed)
    plan,metrics=build_plan(df,a.seed)
    canonical=json.dumps(plan,sort_keys=True,separators=(",",":")).encode()
    metrics["planSha256"]=hashlib.sha256(canonical).hexdigest()
    (out/"scenario-plan.json").write_text(json.dumps(plan,indent=2))
    (out/"metrics.json").write_text(json.dumps(metrics,indent=2))
    pd.DataFrame([metrics["riskMeans"]]).to_csv(out/"risk-summary.csv",index=False)
    print(json.dumps({"status":"PASS","planSha256":metrics["planSha256"],"steps":len(plan["steps"]),"metrics":metrics},indent=2))

if __name__=="__main__":
    main()
