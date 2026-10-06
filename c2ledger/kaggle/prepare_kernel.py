#!/usr/bin/env python3
import json, os
from pathlib import Path

root=Path(__file__).resolve().parent
username=os.environ.get("KAGGLE_USERNAME","").strip()
if not username:
    raise SystemExit("KAGGLE_USERNAME is required")

metadata={
  "id": f"{username}/c2ledger-kaggle-replay",
  "title": "C2Ledger Kaggle Replay",
  "code_file": "kernel.py",
  "language": "python",
  "kernel_type": "script",
  "is_private": True,
  "enable_gpu": False,
  "enable_tpu": False,
  "enable_internet": False,
  "dataset_sources": [],
  "competition_sources": [],
  "kernel_sources": [],
  "model_sources": []
}
(root/"kernel-metadata.json").write_text(json.dumps(metadata,indent=2)+"\n")
print(json.dumps(metadata))
