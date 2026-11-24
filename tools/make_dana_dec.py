"""Dana's fifth demo document: a December 2026 pay stub she brought by mistake.

It sits entirely outside January 2027, so Hours Proof flags it and counts none of it.
Her January totals stay 58 h and $636.40. Kept apart from make_docs.py so the seeded
bench fixtures don't change. Run: python3 tools/make_dana_dec.py
"""
import json
from datetime import date

from make_docs import EMPLOYERS, ROOT, stub_a, stub_answer, stub_fields
import random

samples = ROOT / "public/samples/dana"
f = stub_fields(random.Random(1206), *EMPLOYERS[0], "Dana Whitfield", date(2026, 12, 6), 16.0, 15.0)
f["ytd"] = 3915.0
stub_a(f).save(samples / "pay-stub-dec.png")
answers = json.loads((samples / "answers.json").read_text())
answers["pay-stub-dec.png"] = stub_answer(f)
(samples / "answers.json").write_text(json.dumps(answers, indent=2))
print(stub_answer(f))
