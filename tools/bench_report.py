"""Turn a bench run (bench/last-run.json, saved from bench.html) into bench/RESULTS.md."""
import json, statistics, sys
from pathlib import Path
from datetime import date
root = Path(__file__).resolve().parent.parent
rows = json.loads((root / "bench/last-run.json").read_text())
out = [f"# Bench results ({date.today().isoformat()})", "",
       "Gemini Nano in Chrome, on device only (`ONLY_ON_DEVICE` + our availability check), on fictional fixtures",
       "drawn by `tools/make_docs.py`. Each document = 2 calls (classify, then extract). A field counts only if the",
       "document type is also right. Messy = the same documents rotated, shaded, blurred, noised, downscaled, JPEG.", ""]
out += ["| Set | Docs | Fields exact | Hours + money exact | Dates exact | Type right | Silent errors (wrong, not flagged) | Median s/doc |", "|---|---|---|---|---|---|---|---|"]
NUMERIC = {"hours", "gross", "earnings", "activeMinutes"}
detail = []
for s in ["clean", "messy", "phone"]:
    rs = [r for r in rows if r["set"] == s]
    if not rs: continue
    ok = [r for r in rs if "fields" in r]
    f = [x for r in ok for x in r["fields"]]
    good = sum(x["ok"] for x in f)
    wrong = [(r, x) for r in ok for x in r["fields"] if not x["ok"]]
    caught = sum(1 for r, x in wrong if r["flags"])
    types = sum(r["gotType"] == r["type"] for r in ok)
    flagged = sum(1 for r in ok if r["flags"])
    med = statistics.median(r["ms"] for r in ok) / 1000 if ok else 0
    num = [x for x in f if x["k"] in NUMERIC]; dat = [x for x in f if "Start" in x["k"] or "End" in x["k"]]
    pct = lambda xs: f"{sum(x['ok'] for x in xs)}/{len(xs)}"
    out.append(f"| {s} | {len(rs)} | {good}/{len(f)} = {100*good/max(1,len(f)):.1f}% | {pct(num)} | {pct(dat)} | {types}/{len(ok)} | {len(wrong)-caught} | {med:.1f} |")
    for r, x in wrong:
        detail.append(f"- {s}/{r['name']} `{x['k']}`: wanted `{x['want']}`, got `{x['got']}`{' (flagged)' if r['flags'] else ''}")
    for r in rs:
        if "error" in r: detail.append(f"- {s}/{r['name']}: error {r['error'][:120]}")
out += ["", "A flagged field is highlighted on its document and needs the assister's \"It's right\" before it counts.", "", "## Misses", ""] + (detail or ["None."])
(root / "bench/RESULTS.md").write_text("\n".join(out) + "\n")
print("\n".join(out[6:10]))
