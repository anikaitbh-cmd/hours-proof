# Bench results (2026-11-24)

Gemini Nano in Chrome, on device only (`ONLY_ON_DEVICE` + our availability check), on fictional fixtures
drawn by `tools/make_docs.py`. Each document = 2 calls (classify, then extract). A field counts only if the
document type is also right. Messy = the same documents rotated, shaded, blurred, noised, downscaled, JPEG.

| Set | Docs | Fields exact | Hours + money exact | Dates exact | Type right | Silent errors (wrong, not flagged) | Median s/doc |
|---|---|---|---|---|---|---|---|
| clean | 32 | 125/128 = 97.7% | 58/58 | 61/64 | 32/32 | 0 | 11.8 |
| messy | 32 | 117/128 = 91.4% | 56/58 | 55/64 | 32/32 | 0 | 12.2 |

A flagged field is highlighted on the card and needs the assister's "It's right" before it counts.

## Misses

- clean/vol-03 `periodStart`: wanted `2026-05-03`, got `None` (flagged)
- clean/vol-04 `periodStart`: wanted `2026-07-05`, got `None` (flagged)
- clean/vol-04 `periodEnd`: wanted `2026-07-27`, got `None` (flagged)
- messy/stub-07 `gross`: wanted `468.88`, got `15.5` (flagged)
- messy/gig-00 `rangeStart`: wanted `2027-01-11`, got `None` (flagged)
- messy/gig-02 `rangeStart`: wanted `2027-01-04`, got `None` (flagged)
- messy/gig-02 `rangeEnd`: wanted `2027-02-03`, got `None` (flagged)
- messy/gig-04 `rangeStart`: wanted `2026-04-06`, got `None` (flagged)
- messy/gig-04 `rangeEnd`: wanted `2026-05-06`, got `None` (flagged)
- messy/gig-05 `activeMinutes`: wanted `724`, got `None` (flagged)
- messy/vol-03 `periodStart`: wanted `2026-05-03`, got `None` (flagged)
- messy/vol-03 `periodEnd`: wanted `2026-05-25`, got `None` (flagged)
- messy/vol-04 `periodStart`: wanted `2026-07-05`, got `None` (flagged)
- messy/vol-04 `periodEnd`: wanted `2026-07-27`, got `None` (flagged)
