# Bench results (2026-11-24)

Gemini Nano in Chrome, on device only (`ONLY_ON_DEVICE` + our availability check), on fictional fixtures
drawn by `tools/make_docs.py`. Each document = 2 calls (classify, then extract). A field counts only if the
document type is also right. Messy = the same documents rotated, shaded, blurred, noised, downscaled, JPEG.

| Set | Docs | Fields exact | Hours + money exact | Dates exact | Type right | Silent errors (wrong, not flagged) | Median s/doc |
|---|---|---|---|---|---|---|---|
| clean | 32 | 128/128 = 100.0% | 58/58 | 64/64 | 32/32 | 0 | 6.2 |
| messy | 32 | 124/128 = 96.9% | 56/58 | 62/64 | 32/32 | 0 | 7.2 |

A flagged field is highlighted on its document and needs the assister's "It's right" before it counts.

## Misses

- messy/stub-07 `gross`: wanted `468.88`, got `15.5` (flagged)
- messy/gig-02 `rangeStart`: wanted `2027-01-04`, got `None` (flagged)
- messy/gig-02 `rangeEnd`: wanted `2027-02-03`, got `None` (flagged)
- messy/gig-05 `activeMinutes`: wanted `724`, got `None` (flagged)
