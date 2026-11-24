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

// Results are saved after every document, so a page reload resumes instead of starting over.
const KEY = "hp.bench";
// `?only=messy/gig-00,clean/vol-04` reruns just those documents.
const ONLY = (new URLSearchParams(location.search).get("only") ?? "").split(",").filter(Boolean);
type Row = { set: string; name: string } & Record<string, unknown>;
const load = (): Row[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; } };
const save = (r: Row[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* ignore */ }
  fetch("/__bench-save", { method: "POST", body: JSON.stringify(r, null, 1) }).catch(() => {});
};

async function run() {
  localStorage.setItem(KEY + ".running", "1");
  const answers: Ans = await (await fetch("/bench/fixtures/answers.json")).json();
  const sets = [["clean", "png"], ["messy", "jpg"]].filter(([s]) => (document.getElementById(s) as HTMLInputElement).checked);
  const rows: Row[] = load();
  for (const [set, ext] of sets) {
    for (const [name, ans] of Object.entries(answers)) {
      if (rows.some((r) => r.set === set && r.name === name)) continue;
      if (ONLY.length && !ONLY.includes(`${set}/${name}`)) continue;
      status.textContent = `${set}/${name}…`;
      const blob = await (await fetch(`/bench/fixtures/${set}/${name}.${ext}`)).blob();
      try {
        const r = await readDocument(blob, { sample: false, month: String(ans.periodStart ?? ans.rangeStart).slice(0, 7) });
        const got = r.fields as unknown as Record<string, unknown>;
        const keys = KEYS[ans.type as string];
        const fields = keys.map((k) => ({ k, want: ans[k], got: got?.[k], ok: got?.type === ans.type && same(got?.[k], ans[k]) }));
        rows.push({ set, name, type: ans.type, gotType: got?.type, where: r.where, ms: r.ms, flags: r.flags.map((f) => f.field), fields, raw: r.raw });
      } catch (e) {
        rows.push({ set, name, type: ans.type, error: String(e) });
      }
      save(rows);
      out.textContent = JSON.stringify(rows, null, 1);
    }
  }
  localStorage.removeItem(KEY + ".running");
  out.textContent = JSON.stringify(rows, null, 1);
  status.textContent = "done";
}

document.getElementById("go")!.onclick = () => { save([]); run(); };
if (localStorage.getItem(KEY + ".running")) { status.textContent = "resuming…"; run(); }
else if (load().length) { const r = load(); save(r); out.textContent = JSON.stringify(r, null, 1); status.textContent = `last run: ${r.length} docs`; }
