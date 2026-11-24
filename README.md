# Hours Proof

A web app for Medicaid enrollment assisters that turns pay stubs and gig screenshots into proof of 80 work hours. Gemini Nano reads the documents on the laptop. The cloud only ever sees totals.

**Live:** https://hours-proof.web.app · **Try without Gemini Nano:** https://hours-proof.web.app/?no-nano

All documents in this repo and in the demo are fictional.

## Why

Starting in 2027, many adults on Medicaid will have to prove 80 hours a month of work, school or volunteering, or monthly pay of at least $580 (80 hours at the federal minimum wage). CMS estimates 8.8 million of them can't be checked from state data and will have to send proof themselves. That proof is pay stubs, gig app screenshots and volunteer letters, and a lot of it lands on the desk of an enrollment assister at a clinic.

Hours Proof is built for that desk. The assister drops in one client's mixed pile, and gets:

1. **Every document read on device** by Gemini Nano in Chrome, into structured fields.
2. **Anything doubtful highlighted**: numbers that don't agree with each other (hours × rate ≠ gross), missing fields, dates outside the month.
3. **The month added up in plain code**: hours toward 80, pay toward $580, pay periods prorated by days in the month, gig app time shown separately (it's time online, not time worked).
4. **Missouri's rules checked in the cloud**, from a fixed list of public CMS and Missouri DSS pages, with source links and a "last checked" time.
5. **A reply to the state's notice**, drafted from totals, then a printable packet with the reply, the summary and the proof.

## How the work is split

| Step | Private data? | Where it runs | Firebase AI Logic mode | Why |
|---|---|---|---|---|
| Read stubs, gig summaries, letters | Yes | On device only | `ONLY_ON_DEVICE` + our own `LanguageModel.availability()` check | Documents never leave the laptop |
| Add up hours and income | Yes | Plain code | none | Math shouldn't depend on a model |
| Check state rules | No (totals) | Cloud | `ONLY_IN_CLOUD` + URL context | Public, long, and still changing |
| Draft the reply | No (totals) | On device if available, else cloud | `PREFER_ON_DEVICE` | No document text in the input |
| Fictional samples | Fictional | On device preferred | `PREFER_ON_DEVICE` | Anyone can try it, with or without Nano |

Without Gemini Nano, client documents are **not** sent to the cloud. The assister types the numbers in, and the ledger, rule check, reply and packet all still work.

```
 client documents ──► Gemini Nano (Chrome, on device) ──► fields ──► plain-code ledger ──► totals
                                                                                            │
                         consent screen: "this is everything that will be sent" ◄───────────┘
                                                                                            │
           Gemini (cloud) + URL context over CMS / Missouri DSS pages ◄─────── totals only ─┘
                                        │
                     rule summary ──► reply draft (Nano or cloud, totals only) ──► packet (local print)
```

## Privacy, enforced in code

- **Our own availability check.** Firebase's `ONLY_ON_DEVICE` currently sends requests to the cloud when the `LanguageModel` global is missing ([firebase-js-sdk #10635](https://github.com/firebase/firebase-js-sdk/issues/10635)). Hours Proof checks `LanguageModel.availability()` itself before every document call and refuses to run otherwise (`src/extract.ts`).
- **A runtime leak guard.** Before a real document is read, fingerprints of its image are registered, and after reading, every identifying string (employer, organization, address, contact). A `fetch` wrapper blocks any outbound request whose body contains one of them (`src/guard.ts`).
- **One way out.** The only cloud payload is built field by field from the `Totals` type (`cloudPayload` in `src/cloud.ts`). Names typed into the reply are filled in locally after the draft is written.
- **The leak test** (`tests/leak.test.ts`) fails the build if the totals payload, the rule-check prompt or the reply prompt contains any text from a client document, or if the guard lets a document through.

## Firebase pieces

- **Firebase AI Logic** hybrid inference: Gemini Nano in Chrome and `gemini-3.5-flash-lite` in the cloud, with `inferenceSource` shown as an On device / Cloud badge on every result.
- **Structured output on both sides:** one JSON Schema used as `responseConstraint` on device and `responseJsonSchema` in the cloud.
- **App Check** with reCAPTCHA Enterprise and limited-use tokens (replay protection).
- **Remote Config** for the cloud model name, changeable without a redeploy.
- **Hosting** for the live app.

## Accuracy

`bench.html` runs Gemini Nano on device over fictional fixtures with known answers (`bench/fixtures`, drawn by `tools/make_docs.py`) and scores every field. Latest run ([`bench/RESULTS.md`](bench/RESULTS.md)):

| Set | Docs | Fields exact | Wrong but not flagged |
|---|---|---|---|
| Clean | 32 | 127/128 (99.2%) | 0 |
| Phone-photo style (tilted, shadowed, blurred, JPEG) | 32 | 125/128 (97.7%) | 0 |

What got it there, all in code rather than prompts: the model copies dates and durations exactly as printed, and code converts them (asking Nano to reformat dates made it invent years: 93.8% before). Hours × rate is checked against gross pay, and period lengths over 35 days are flagged as a likely misread year.

## Run it

Needs desktop Chrome 148+ for on-device inference (it works without it, using hand entry).

```bash
npm install
npm run dev      # http://localhost:5173 (needs an App Check debug token in .env.local: VITE_APPCHECK_DEBUG_TOKEN=...)
npm test         # ledger math, checks, duration parsing, and the leak test
npm run build    # type check + tests + production build
```

## Limits

- Missouri hasn't said whether gig app active time counts as hours. Hours Proof counts gig earnings as pay and shows active time separately for the assister to decide.
- Missouri can still delay its start date to June 30, 2027 (decision due December 11, 2026). Nothing is hard-coded; the rule check reads the current pages.
- Hours Proof prepares proof. It isn't legal advice, and the state makes the decision.

## License

MIT
