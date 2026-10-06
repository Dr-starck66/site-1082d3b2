#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

WORK=Path(os.environ.get("C2LEDGER_KAGGLE_WORKDIR","/kaggle/working/c2ledger"))
INPUT=Path(os.environ.get("C2LEDGER_KAGGLE_INPUT","/kaggle/input"))
WORK.mkdir(parents=True,exist_ok=True)

def find_events():
    candidates=[]
    if INPUT.exists():
        candidates += sorted(INPUT.rglob("events.jsonl"))
        candidates += sorted(INPUT.rglob("*.jsonl"))
    local=Path(__file__).with_name("sample-events.jsonl")
    if candidates:
        return candidates[0]
    return local

src=find_events()
cmd=[
    sys.executable,
    str(Path(__file__).with_name("c2ledger_replay.py")),
    "--events",str(src),
    "--out",str(WORK),
]
print("C2LEDGER_KAGGLE_INPUT",src)
rc=os.spawnv(os.P_WAIT,sys.executable,cmd)
if rc!=0:
    raise SystemExit(rc)

campaign=json.loads((WORK/"campaign.json").read_text())
assert campaign["schema"]=="c2ledger-kaggle-replay/v1"
assert campaign["safety"]["publicInternetTargets"] is False
assert campaign["safety"]["arbitraryCommands"] is False
assert campaign["safety"]["exploitDelivery"] is False
assert campaign["safety"]["credentialTheft"] is False
assert campaign["safety"]["destructiveActions"] is False
print("C2LEDGER_KAGGLE_PASS",json.dumps({
    "events":campaign["events"],
    "anomalies":campaign["anomalies"],
    "digest":campaign["digest"],
    "campaignEffects":[x["effect"] for x in campaign["campaign"]]
}))
