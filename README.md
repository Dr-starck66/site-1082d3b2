# RefundMoneyNow.com — Editorial Autopilot

US-first consumer-money publication focused on refunds, claims, fees, disputes, compensation, warranties, travel refunds, tax refunds and unclaimed money.

## What is implemented

- Next.js App Router publication with category pages and article pages.
- 8 money-recovery topic silos.
- Five daily GitHub Actions slots: **2 pillar articles + 3 reactive articles**.
- Reactive discovery from official CFPB/FTC RSS plus current IRS/DOT consumer pages.
- A curated pillar library with authoritative source URLs.
- Evidence collection **before** drafting. Source extracts are passed to the model; the model is told not to use memory for changing rules, amounts, dates, deadlines or eligibility.
- Gemini REST adapter using `GEMINI_API_KEY` and a configurable `GEMINI_MODEL`.
- Evidence Gate that blocks publication when citations/sources/length or safety rules fail.
- Inline `[S1]` citations rendered as clickable source links.
- Automatic internal linking to related published articles.
- Dynamic 1200×675 PNG image for every article and Open Graph/Twitter metadata.
- `NewsArticle` structured data, canonical URLs, `max-image-preview:large`, standard sitemap and 48-hour Google News sitemap.
- Full fail-closed behavior: if current evidence or the model is unavailable, **nothing is published**.

## Editorial cadence

GitHub Actions runs at 10:15, 13:30, 16:20, 19:10 and 22:30 UTC. The schedule is US-oriented but UTC-fixed, so local US times move by one hour around daylight-saving changes.

Slots:

1. `pillar-am` — 1,500–2,600 words
2. `reactive-morning` — 700–1,200 words
3. `reactive-midday` — 700–1,200 words
4. `pillar-pm` — 1,500–2,600 words
5. `reactive-evening` — 700–1,200 words

The system targets five useful pages per day; it intentionally publishes fewer if the evidence gate cannot substantiate a fresh reactive story.

## Required secret

In the GitHub repository, create an Actions secret:

- `GEMINI_API_KEY` — Google AI Studio API key.

Optional repository variable:

- `GEMINI_MODEL` — defaults to `gemini-2.5-flash`. Keep this configurable because model availability changes.

No paid news API is required.

## Commands

```bash
npm run editorial:test
npm run editorial:discover
npm run editorial:run
npm run evidence:check
npm run build
```

Safe preview without publication:

```bash
EDITORIAL_DRY_RUN=1 EDITORIAL_SLOT=reactive-morning npm run editorial:run
```

## Publication pipeline

`editorial:run` performs, in order:

1. Resolve the current editorial slot.
2. Choose an unused pillar seed or discover a fresh official reactive topic.
3. Retrieve the source pages directly.
4. Refuse to continue unless at least two usable sources exist and at least one is primary/official.
5. Send only those source extracts plus the article brief to Gemini.
6. Save the result as `draft`.
7. Add up to three internal links.
8. Run the Evidence Gate.
9. Publish only after a PASS.
10. Re-run the Evidence Gate on the published file.
11. GitHub Actions commits the article and audit metadata.

The last generation audit is written to `data/last-generation.json`; topic discovery output can be inspected in `data/discovery.json`.

## Evidence Gate

For automated articles the gate requires:

- 2+ HTTPS source URLs;
- at least one official/primary source;
- `[S#]` inline citations pointing to the declared source list;
- minimum length (1,200 words for pillars, 550 for reactive stories);
- no guaranteed-refund / guaranteed-outcome language;
- no common filler phrases associated with low-value generated copy;
- no false claim that the publication is the reader's lawyer or financial adviser.

## Domain and deploy

Set `NEXT_PUBLIC_SITE_URL=https://refundmoneynow.com` in production. The app is deployment-ready for Vercel once the repository/domain are available. Domain registration itself is not included in this source package.
