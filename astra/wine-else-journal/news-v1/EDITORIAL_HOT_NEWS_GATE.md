# ASTRA HOT NEWS GATE Ω — WINE ELSE Journal

**Mission:** operate a specialized international wine newsroom at `https://else.wine/blog/`, with original, timely journalism useful to both wine enthusiasts and professional buyers. This is an **internal editorial decision policy**, not a ranking factor certified by Google. Never promise Google News or Discover coverage.

## 1. Hard eligibility gate — fail closed

Every new item presented as **NewsArticle**, or inserted in `sitemap-news.xml`, MUST pass ALL of these checks:

1. **Dated new fact:** document the exact real-world event, publication or verified announcement time (timezone). Prefer events/new primary releases within 0–24 h; accept 24–72 h when material and underserved. Beyond 72 h, do not portray an old announcement as breaking news; publish a carefully labelled explanatory `Article` without a false sense of urgency, unless a genuinely new development is documented. Distinguish event date, official source release date and our article's actual publication date.
2. **Primary evidence:** a directly accessible original announcement, dated official data release, regulatory text, filing, company announcement, named on-the-record interview, weather warning or primary trading data. Add independent corroboration when obtainable, especially for extraordinary claims. Disagreement, caveats and negative findings remain explicit. Never fabricate quotes, numbers or interviews.
3. **Original editorial value:** provide at least one grounded contribution absent from the cited release: independently recalculated comparison, verified context from another source, market implication with labelled uncertainty, precise regional breakdown or direct affected-person statement. Rewriting a press release is insufficient.
4. **Specific angle:** identify *what happened*, *when*, *where*, *who is affected* and *why it matters now*. A new article cannot simply repeat existing Wine Else coverage with a new URL/title. Check archive, other recent publications and cross-links.
5. **Real audience relevance:** the news concerns wine/viticulture, wine trade or a tightly related material development; its impact on winemakers, importers, distributors or wine lovers must be demonstrated. No generic lifestyle clickbait.
6. **Publication readiness:** article has an exact descriptive title, visible accurate publication date and time, named editorial author, source citations and disclosures, proper `NewsArticle` JSON-LD, self canonical, at least two relevant properly licensed images with correct attribution; principal `og:image` ≥1200 px wide (aim 1600 px and genuine 16:9), `max-image-preview:large`, responsive page, accessible alt text, inbound editorial link from journal, meaningful outbound related links and **commercial content clearly separated**. Actual accessible image dimensions and HTTP responses must be tested when available.
7. **Sitemap freshness:** ONLY news published in the preceding 48 hours belong in `sitemap-news.xml`; preserve all canonical published news in `sitemap-journal.xml` after expiry. Do not reset `datePublished` to manipulate the news window. Use existing `scripts/sync_news_sitemap.py`; update existing Vercel route only when source content really changes.

If any mandatory step is unsupported, uncertain or blocked, **do not publish as breaking news**; record PASS / PARTIAL / FAIL / UNVERIFIED with precise missing evidence.

## 2. Internal candidate quality score (editorial triage only)

For candidates meeting hard gates, record a transparent score out of 100:

| Criterion | Points |
| --- | ---: |
| Time-to-publish relative to the newly verified event | 0–25 |
| Concrete news impact and audience interest | 0–30 |
| Strength, independence and traceability of evidence | 0–25 |
| Distinctive reported insight or new quantified analysis | 0–20 |

**Select first the highest-scoring eligible subject, normally ≥80/100.** The threshold is an internal newsroom standard, **not a Google algorithm or guarantee**. A score never substitutes for verifying all hard gates; retain rejected candidates, reasons and corrections. No publishing simply to fill a quota.

## 3. Topic radar to check at 09:00, 14:00 and 19:00 (Paris)

Prioritize original primary sources; track when the underlying **fact** was published:

- **Urgent regulation / trade:** European Commission and Council wine-sector decisions, French government, US TTB/CBP, verified changes in duties, labels, market access, sanctions, food safety or export rules. Focus on demonstrable impacts for actual international buyers.
- **Material vineyard events:** DRAAF / French agriculture ministry / FranceAgriMer and regional official reports on harvest revisions, vineyard damage, drought, hail, frost, fires and disease, with named region and measurable effect.
- **International wine market:** OIV, Eurostat, customs/export data, industry bodies, authentic Liv-ex trading statistics and qualified primary market reports; check observation period and benchmark before using any headline percentages.
- **Named industry developments:** verified acquisition, major producer shutdown, export contract, court ruling, documented supply disruption, extraordinary auction result or innovation with results (not speculative promotional claims).
- **Specific geographic strength:** Occitanie / Languedoc-Roussillon, France and European wine regions, US import market, plus Japan, Poland and other verified export markets. International coverage should still serve a defined readership.

Proactively gather 3–8 possible candidates **per pass**, discard stale/duplicative/unsupported news, and write at most one strong story per pass. Two-to-three new items per day is an **aspiration**, never an obligation.

## 4. Concrete title quality

**Good — only if the new facts are verified:**
- “France Revises 2026 Wine Output Estimate: What Changed in Occitanie and Champagne”
- “New US Wine Import Rule Takes Effect on [verified date]: What French Exporters Must File”
- “Hail Hits [verified appellation] on [verified date]: First Official Vineyard Damage Estimates”
- “Wine Export Values Fall [verified percent] in [verified month]: The Gap Between Volume and Revenue”

**Reject:** “The Shocking Truth About French Wine!”, “2026 Wine Crisis Finally Revealed!”, “Top 10 Wines You Must Try” or “Wine Exports Explode!” with no real event/data; a story based on September statistics is not ‘breaking’ in November absent an actual new fact.

Avoid implying an individual estate has confirmed stock, exclusivity or a US buyer. Editorial and WINE ELSE commercial sourcing must be visibly disclosed and separate.

## 5. Release receipt (required for a PASS)

For each published article log: verified event UTC date; primary and independent source URLs/dates; original contribution; editorial score and hard gate results; canonical URL; actual article publication timestamp; two image sources/licences/dimensions; Git commit; Vercel live version; real HTTP status if testable; inbound link; presence in journal and (if ≤48h) News sitemap. Google Search Console News/Discover appearance remains **UNVERIFIED** unless actual account metrics prove it.

**Official guidance:** https://developers.google.com/search/docs/appearance/google-discover ; https://developers.google.com/search/blog/2026/02/discover-core-update ; https://support.google.com/news/publisher-center/answer/9607104 ; https://support.google.com/news/publisher-center/answer/9606709 .
