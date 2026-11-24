import { readDocument } from "./extract";

type Ans = Record<string, Record<string, unknown>>;
const KEYS: Record<string, string[]> = {
  pay_stub: ["periodStart", "periodEnd", "hours", "gross"],
  gig_summary: ["rangeStart", "rangeEnd", "earnings", "activeMinutes"],
  volunteer_letter: ["org", "periodStart", "periodEnd", "hours"],
};
const same = (a: unknown, b: unknown) =>
  typeof b === "number" ? Number(a) === b : String(a ?? "").trim().toLowerCase() === String(b).trim().toLowerCase();

const out = document.getElementById("out")!;
const status = document.getElementById("status")!;

document.getElementById("go")!.onclick = async () => {
  const answers: Ans = await (await fetch("/bench/fixtures/answers.json")).json();
  const sets = [["clean", "png"], ["messy", "jpg"]].filter(([s]) => (document.getElementById(s) as HTMLInputElement).checked);
  const rows: unknown[] = [];
  for (const [set, ext] of sets) {
    for (const [name, ans] of Object.entries(answers)) {
      status.textContent = `${set}/${name}…`;
      const blob = await (await fetch(`/bench/fixtures/${set}/${name}.${ext}`)).blob();
      try {
        const r = await readDocument(blob, { sample: false, month: String(ans.periodStart ?? ans.rangeStart).slice(0, 7) });
        const got = r.fields as unknown as Record<string, unknown>;
        const keys = KEYS[ans.type as string];
        const fields = keys.map((k) => ({ k, want: ans[k], got: got?.[k], ok: got?.type === ans.type && same(got?.[k], ans[k]) }));
        rows.push({ set, name, type: ans.type, gotType: got?.type, where: r.where, ms: r.ms, flags: r.flags.map((f) => f.field), fields });
      } catch (e) {
        rows.push({ set, name, type: ans.type, error: String(e) });
      }
      out.textContent = JSON.stringify(rows, null, 1);
    }
  }
  (window as unknown as { __bench: unknown }).__bench = rows;
  status.textContent = "done";
};
