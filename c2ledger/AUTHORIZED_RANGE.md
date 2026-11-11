# C2Ledger Authorized Range Effects

C2Ledger v0.13.0 can apply finite, reversible lab effects to explicitly authorized private range nodes.

Allowed effects:
- plant-marker
- degrade-service
- stage-synthetic-data
- rotate-canary
- recover

Target policy is fail-closed: localhost, private IPv4 space, Railway private DNS, or an explicit allowlist only. Public and arbitrary Internet hosts are rejected. The controller exposes no shell, arbitrary command runner, exploit delivery, credential theft, propagation, or destructive-action primitive.

The GitHub Authorized Range Gate proves real artifact creation, state degradation, kill-switch enforcement, public-target rejection, and recovery before this branch is eligible for promotion.
