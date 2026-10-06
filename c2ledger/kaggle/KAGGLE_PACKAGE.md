# C2Ledger Kaggle Kernel Package

This folder is ready for the official Kaggle CLI.

1. Set `KAGGLE_USERNAME`.
2. Run `python prepare_kernel.py`; it writes `kernel-metadata.json`.
3. Authenticate the Kaggle CLI using your Kaggle credentials.
4. Run `kaggle kernels push -p c2ledger/kaggle`.

The kernel is generated as **private**, CPU-only and with **Internet disabled** by default. It searches Kaggle input datasets for `events.jsonl`, otherwise it uses the bundled safe fixture. Outputs are written under `/kaggle/working/c2ledger/`.

The output `campaign.json` contains only the C2Ledger authorized range effects. It does not contain arbitrary target hosts, shell commands, exploit delivery, credential theft or destructive actions.
