#!/usr/bin/env python3
import argparse, json, math, random, hashlib
from pathlib import Path

SAFE_EFFECTS=("plant-marker","degrade-service","stage-synthetic-data","rotate-canary","recover")

def load_events(path):
    rows=[]
    p=Path(path)
    if not p.exists(): return rows
    for line in p.read_text(errors="ignore").splitlines():
        try:
            x=json.loads(line)
            if isinstance(x,dict): rows.append(x)
        except Exception: pass
    return rows

def feature(e):
    sev={"info":0.1,"low":0.25,"medium":0.5,"high":0.75,"critical":1.0}.get(str(e.get("severity","info")).lower(),0.2)
    msg=str(e.get("message",""))
    tags=e.get("tags") if isinstance(e.get("tags"),list) else []
    return [sev,min(len(msg),2048)/2048,min(len(tags),20)/20,1.0 if e.get("chain") else 0.0,1.0 if e.get("rawIp") else 0.0]

def centroid(xs):
    if not xs: return [0.0]*5
    return [sum(r[i] for r in xs)/len(xs) for i in range(5)]

def dist(a,b): return math.sqrt(sum((x-y)**2 for x,y in zip(a,b)))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--events",default="c2ledger/kaggle/sample-events.jsonl")
    ap.add_argument("--out",default="artifacts/kaggle")
    ap.add_argument("--seed",type=int,default=42)
    args=ap.parse_args()
    random.seed(args.seed)
    rows=load_events(args.events)
    xs=[feature(x) for x in rows]
    c=centroid(xs)
    ds=[dist(x,c) for x in xs]
    threshold=(sum(ds)/len(ds)+2*(sum((d-(sum(ds)/len(ds)))**2 for d in ds)/max(1,len(ds)))**0.5) if ds else 0.5
    anomalous=sum(1 for d in ds if d>threshold)
    pressure=min(1.0,(anomalous/max(1,len(rows)))+max(ds or [0]))
    campaign=[
      {"effect":"plant-marker","id":"kaggle-replay"},
      {"effect":"stage-synthetic-data","id":"kaggle-stage","count":min(20,max(3,round(3+pressure*12)))},
      {"effect":"rotate-canary","id":"kaggle-canary"},
      {"effect":"degrade-service","id":"kaggle-degrade","service":"mock-mission-api"},
      {"effect":"recover","id":"kaggle-recover"}
    ]
    assert all(x["effect"] in SAFE_EFFECTS for x in campaign)
    payload={"schema":"c2ledger-kaggle-replay/v1","engine":"stdlib-anomaly-baseline","events":len(rows),"features":5,"anomalies":anomalous,"threshold":round(threshold,6),"campaign":campaign,"safety":{"publicInternetTargets":False,"arbitraryCommands":False,"exploitDelivery":False,"credentialTheft":False,"destructiveActions":False}}
    canonical=json.dumps(payload,sort_keys=True,separators=(",",":")).encode()
    payload["digest"]="sha256:"+hashlib.sha256(canonical).hexdigest()
    out=Path(args.out); out.mkdir(parents=True,exist_ok=True)
    (out/"campaign.json").write_text(json.dumps(payload,indent=2))
    (out/"metrics.json").write_text(json.dumps({"events":len(rows),"anomalies":anomalous,"threshold":threshold},indent=2))
    print(json.dumps(payload))

if __name__=="__main__": main()
