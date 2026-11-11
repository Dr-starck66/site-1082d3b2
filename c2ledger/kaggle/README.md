# C2Ledger Kaggle Range Intelligence

This module uses Kaggle as an optional zero-cost compute accelerator for anomaly detection and safe scenario planning.

The notebook/script never receives an arbitrary network target and its Kaggle metadata keeps Internet access disabled. It produces a finite `scenario-plan.json` containing only the three lab targets `lab-edge`, `lab-ci`, and `lab-data` and only the finite authorized range effects supported by C2Ledger.

The exact same Python planner runs locally and in GitHub Actions, so the product does not depend on Kaggle availability. Kaggle is used for larger replay/training jobs when credentials are configured.

Outputs:
- `scenario-plan.json` — bounded plan for the ephemeral lab.
- `metrics.json` — anomaly rate, risk dimensions, pressure score and SHA-256 plan digest.
- `risk-summary.csv` — compact model summary.
- `lab-report.json` — proof of the effects actually applied to disposable lab containers.

For Kaggle, set `KAGGLE_USERNAME` and Kaggle API credentials, run `prepare_metadata.py`, then use the official Kaggle CLI to push the folder. The metadata sets `enable_internet=false` and `is_private=true`.
