#!/usr/bin/env python3
import json, os
from pathlib import Path
user=os.environ.get("KAGGLE_USERNAME","").strip()
if not user: raise SystemExit("KAGGLE_USERNAME is required")
src=Path(__file__).with_name("kernel-metadata.template.json")
dst=Path(__file__).with_name("kernel-metadata.json")
data=json.loads(src.read_text())
data["id"]=data["id"].replace("__KAGGLE_USERNAME__",user)
dst.write_text(json.dumps(data,indent=2)+"\n")
print(dst)
