# C2Ledger Mission Assurance

C2Ledger Mission Assurance is the defensive high-assurance edition of C2Ledger.

## Mission

Detect blockchain dead-drop C2 and software-supply-chain attack chains, preserve tamper-evident evidence, support incident response, and keep release/recovery decisions fail-closed.

## Defensive boundary

This edition does not provide exploit delivery, destructive actions, offensive automation, autonomous targeting, or execution of untrusted repository code. The boundary is enforced in the runtime profile exposed at `/api/defence/readiness`.

## Purple-team validation

The `ADVERSARY_EMULATION_RANGE` module now has two layers. The detector-validation layer runs inert synthetic fixtures through the real rule engine. The advanced range layer contains multi-stage rehearsal playbooks with an explicit threat model, adversary intent, synthetic simulation method, expected telemetry, detections, containment actions, recovery actions and pass criteria for every stage.

The advanced scenarios currently cover blockchain dead-drop-to-execution correlation, CI trust-boundary compromise rehearsal, degraded-network/evidence-store continuity, and distributed software-supply-chain correlation. They are intentionally non-deployable outside the isolated range: no live exploitation, arbitrary command execution, credential theft, persistence, propagation, destructive actions or Internet target selection.

## Evidence surfaces

- `/health` — liveness and release fingerprint.
- `/health/deep` — composite proof gate.
- `/api/proof` — evidence-backed Mythos Astra Omega proof snapshot.
- `/api/defence/readiness` — Mission Assurance posture, boundaries, readiness mappings and proof status.
- `/api/defence/assurance-package` — portable JSON assurance package with SHA-256 digest for offline review.
- `/api/defence/adversary-emulation` — detector-validation catalog plus detailed advanced playbooks.
- `/api/defence/adversary-emulation/advanced` — complete multi-stage isolated range playbooks.
- `/api/intel/stix` — STIX 2.1 threat-intelligence export.
- `/api/scan/sarif` — SARIF output for code-scanning workflows.
- `/api/ci/gate` — fail-closed CI security decision.
- `/api/tenant/audit/verify` — verification of the cryptographically chained tenant audit trail.

## Readiness mappings

The runtime exposes evidence mappings to NIST SP 800-171 Rev. 3, NIST SP 800-218 SSDF v1.1, and CMMC/DFARS procurement readiness. These are engineering mappings only.

C2Ledger does **not** claim CMMC certification, FedRAMP authorization, government authorization, accreditation, or Pentagon approval. Contract-specific requirements, CUI boundaries, assessment scope, hosting requirements and authorization decisions remain external to the product.

## Target buyer problem

C2Ledger is intended for defensive cyber teams, software factories, SOCs, incident-response teams, critical infrastructure operators and defense-industrial environments that need machine-verifiable evidence around software supply-chain and blockchain-mediated command-and-control risk.

## Validation rule

No capability is marked complete from marketing language alone. Promotion requires executable checks, evidence, adversarial review and a PASS/PARTIAL/FAIL result through the existing ASTRA proof surfaces.
