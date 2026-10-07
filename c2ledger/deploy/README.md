# C2Ledger Mission Ops deployment

This package deploys the C2Ledger engine and passive sensor on an authorized network.

## Docker Compose

Set `C2LEDGER_ADMIN_TOKEN`, `C2LEDGER_SENSOR_TOKEN`, and `C2LEDGER_SENSOR_INGEST_TOKEN`, then run:

`docker compose -f deploy/docker-compose.disconnected.yml up -d --build`

The engine binds to `127.0.0.1:3000`; the sensor binds to `127.0.0.1:3100`. Evidence and control state persist in the `c2ledger-state` volume. The Compose mission network is internal-only.

## Mission controls

- `GET /api/mission-ops/profile` exposes the deployable Mission Ops profile.
- `POST /api/mission-ops/evaluate` scores availability, detection, containment, evidence and recovery.
- `GET /api/mission-ops/control` reads the persistent kill-switch.
- `POST /api/mission-ops/control` changes the kill-switch and requires the admin bearer token.
- The sensor receives bounded authenticated telemetry at `POST :3100/event`.
- When the kill-switch is disabled, engine sensor ingestion returns HTTP 423.

The disconnected package uses a local persistent evidence backend and does not require S3 for state or proof storage.

The platform is for defensive monitoring, control validation, containment/recovery coordination and isolated adversary emulation on authorized environments. It does not provide arbitrary command execution, exploit delivery, credential theft, propagation, destructive actions or Internet target selection.
