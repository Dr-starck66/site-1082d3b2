# C2Ledger Mission Assurance v0.14.0

Repository-based production source for C2Ledger's defensive Mission Assurance edition.

The engine performs static defensive analysis, blockchain-C2 and software-supply-chain correlation, tamper-evident evidence capture, CI/SARIF/STIX integration, bounded purple-team detector validation, deeply documented isolated adversary-emulation playbooks, and fail-closed assurance checks. Untrusted repository code is never executed.

See [DEFENCE_MISSION_ASSURANCE.md](./DEFENCE_MISSION_ASSURANCE.md) for the product boundary, readiness mappings and validation surfaces.

Runtime proof endpoints: `/health`, `/health/deep`, `/api/proof`, `/api/defence/readiness`, `/api/defence/assurance-package`, `/api/defence/adversary-emulation`, `/api/defence/adversary-emulation/advanced`.

No government authorization, CMMC certification, FedRAMP authorization or Pentagon approval is claimed.


## Release integrity

`VERSION` is the runtime version source of truth and `RULEPACK.sha256` pins the detector rulepack. CI verifies both before build. Container bases are pinned to the tested Bun multi-arch manifest digest. Package releases emit SHA-256 file manifests, a CycloneDX SBOM and provenance metadata.

The default durable state backends are Railway/S3-compatible object storage or a local persistent volume for disconnected single-replica deployments. Multi-replica active/active operation is not claimed without an external atomic state backend.

The built-in precision/recall benchmark is explicitly a synthetic regression test, not a scientific estimate of real-world detector coverage. The Real-World Gate scans external repositories against the candidate image.

The Kaggle Hybrid Range workflow proves local Kaggle-package compatibility plus an isolated lab campaign. Only the separate Kaggle Publish workflow may claim `KAGGLE_REMOTE` after the private no-internet kernel completes on Kaggle and its output is downloaded and verified.
