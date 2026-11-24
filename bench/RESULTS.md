# Bench results (2026-11-24)

Gemini Nano in Chrome, on device only (`ONLY_ON_DEVICE` + our availability check), on fictional fixtures
drawn by `tools/make_docs.py`. Each document = 2 calls (classify, then extract). A field counts only if the
document type is also right. Messy = the same documents rotated, shaded, blurred, noised, downscaled, JPEG.

| Set | Docs | Fields exact | Hours + money exact | Dates exact | Type right | Silent errors (wrong, not flagged) | Median s/doc |
|---|---|---|---|---|---|---|---|
| clean | 32 | 127/128 = 99.2% | 57/58 | 64/64 | 32/32 | 0 | 12.4 |
| messy | 32 | 125/128 = 97.7% | 56/58 | 63/64 | 32/32 | 0 | 12.7 |

A flagged field is highlighted on the card and needs the assister's "It's right" before it counts.

## Misses

After this run, `isoRange` also splits a range copied into one field (the messy/gig-00 miss below); covered by a unit test.

- clean/gig-02 `activeMinutes`: wanted `2121`, got `None` (flagged)
- messy/stub-07 `gross`: wanted `468.88`, got `15.5` (flagged)
- messy/gig-00 `rangeStart`: wanted `2027-01-11`, got `None` (flagged)
- messy/gig-05 `activeMinutes`: wanted `724`, got `None` (flagged)
