# FreeHotels growth: first verified release

Public tools: https://freehotels.info/calculateur and https://freehotels.info/en/tools/hotel-total-cost/.

This module extends the existing FreeHotels total-cost algorithm. It does not provide hotel prices, availability, currency conversion, traffic estimates or a ranking guarantee.

Run `node --test source/cost-core.test.mjs`, then `node build.mjs`. These steps need Node only. The optional `verify.mjs` browser check requires Playwright and its Chromium executable; the current local environment lacks that executable, so the first release was tested interactively in the authorized cloud browser instead.

Keep the current parent editorial hub and sitemap as the inputs. The builder prefers those files when deployed in the repository layout, and falls back to the versioned source templates for an isolated reproduction. Never replace a newer editorial hub with an older snapshot. Do not add tools to the Google News sitemap.

The two calculator routes are isolated rewrites. Original Next.js pages, DNS and the original 23-URL sitemap are preserved. The French editorial hub and supplemental sitemap link the tools. Compiled HTML is pinned to an immutable GitHub commit through the established CDN routing path.

The primary growth KPI is 100,000 human sessions in a rolling 30-day window. Its current value is unknown. Search Console opportunities, server requests, keyword volume estimates and synthetic checks are separate metrics and must never be substituted for that KPI. See `PUBLICATION_RECEIPT.json` for measurements and limitations.

Continue through the existing central task `6ae5fe6216e0819197eddcfe2786a44e` at 09:00, 14:00 and 19:00 Europe/Paris. No additional automation or paid infrastructure was created.
