# Kaggle Hybrid Range

C2Ledger uses Kaggle-compatible Python for compute-heavy replay, anomaly baselining and bounded campaign generation. The generated campaign contains only effects implemented by the authorized range node.

The execution tier is an ephemeral container lab. GitHub Actions creates an internal-only Docker network, starts a real C2Ledger range-node container, executes each bounded effect over HTTP, validates recovery, proves the Docker network is internal, and uploads replay/range evidence.

## Kaggle use

Upload `c2ledger/kaggle/c2ledger_replay.py` and a JSONL telemetry dataset to a Kaggle Notebook, or add them as a Kaggle Dataset. Run:

`!python c2ledger_replay.py --events /kaggle/input/<dataset>/events.jsonl --out /kaggle/working/c2ledger`

Outputs are `campaign.json` and `metrics.json`. The script uses Python standard library only, so CPU execution is sufficient; GPU is optional for future defensive ML models.

## Boundary

Kaggle does not receive arbitrary target hosts or commands. Campaign effects are allowlisted: plant marker, stage synthetic data, rotate fake canary, degrade a mock service, recover. The ephemeral execution network has no external egress. This pipeline is for controlled defensive validation and mission-readiness testing, not compromise of third-party systems.
