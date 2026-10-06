# RefundMoneyNow Editorial Autopilot — Audit

Date: 2026-09-26

## Implemented

- 5 UTC publication triggers/day.
- 2 pillar + 3 reactive editorial model.
- CFPB/FTC RSS discovery adapters.
- IRS/DOT current-page discovery adapters.
- Curated authoritative source sets for evergreen pillars.
- Direct source retrieval before generation.
- Gemini REST generation with configurable model and retry on transient 429/5xx responses.
- Draft-first publication flow.
- Source hashes retained in generation audit metadata.
- Evidence Gate with source, citation, word-count, uncertainty and originality checks.
- Internal-link enrichment.
- Dynamic 1200×675 per-article social image.
- Article/NewsArticle metadata and 48-hour Google News sitemap.
- Fail-closed behavior when sources, model output or audits fail.

## Executed tests

- JavaScript syntax checks: PASS for editorial scripts.
- Unit pipeline checks: PASS.
- Offline end-to-end fixture: PASS.
- Internal-link injection in E2E fixture: PASS.
- Per-file Evidence Gate in E2E fixture: PASS.
- Whole-content Evidence Gate: PASS.
- GitHub Actions YAML parse: PASS.

## Not falsely marked PASS

- Live RSS/source retrieval could not be executed in this container because DNS/network access is unavailable to the container runtime.
- `npm install` timed out for the same network reason, so the complete `next build` was not executed here.
- Gemini generation was not called because no user API key is embedded in the project.

These three checks are expected to run in GitHub Actions / deployment once network access and `GEMINI_API_KEY` are present.
