// All the math lives here, in plain code. No model ever adds up hours or pay.
import { RULE } from "./config";
import type { Doc, Totals } from "./types";

const DAY = 86_400_000;

function parse(d: string | null): number | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = Date.parse(d + "T00:00:00Z");
  return Number.isNaN(t) ? null : t;
}

/** Fraction of an inclusive date range [start, end] that falls inside month YYYY-MM. */
export function shareInMonth(start: string | null, end: string | null, month: string): number {
  const s = parse(start);
  const e = parse(end) ?? s;
  if (s === null || e === null || e < s) return 0;
  const [y, m] = month.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, 1);
  const me = Date.UTC(y, m, 1) - DAY; // last day of month
  const lo = Math.max(s, ms);
  const hi = Math.min(e, me);
  if (hi < lo) return 0;
  const days = (e - s) / DAY + 1;
  return ((hi - lo) / DAY + 1) / days;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface LedgerLine {
  docId: string;
  label: string;
  share: number; // fraction counted for this month
  hours: number; // hours counted toward 80
  income: number; // pay counted toward $580
  note?: string;
}

export function ledger(docs: Doc[], month: string): { lines: LedgerLine[]; totals: Totals } {
  const lines: LedgerLine[] = [];
  let work = 0, vol = 0, income = 0, gigIncome = 0, gigActive = 0;
  let school = false;
  for (const doc of docs) {
    const f = doc.fields;
    if (!f || doc.status !== "done") continue;
    if (f.type === "pay_stub") {
      const sh = shareInMonth(f.periodStart, f.periodEnd, month);
      const h = r2((f.hours ?? 0) * sh), p = r2((f.gross ?? 0) * sh);
      work += h; income += p;
      lines.push({ docId: doc.id, label: f.employer ?? "Pay stub", share: sh, hours: h, income: p });
    } else if (f.type === "gig_summary") {
      const sh = shareInMonth(f.rangeStart, f.rangeEnd, month);
      const p = r2((f.earnings ?? 0) * sh);
      const a = r2(((f.activeMinutes ?? 0) / 60) * sh);
      income += p; gigIncome += p; gigActive += a;
      lines.push({
        docId: doc.id, label: f.platform ?? "Gig app", share: sh, hours: 0, income: p,
        note: `${a} h active time shown, not counted as hours`,
      });
    } else if (f.type === "volunteer_letter") {
      const sh = shareInMonth(f.periodStart, f.periodEnd, month);
      const h = r2((f.hours ?? 0) * sh);
      vol += h;
      lines.push({ docId: doc.id, label: f.org ?? "Volunteer letter", share: sh, hours: h, income: 0 });
    } else if (f.type === "school_record") {
      const sh = shareInMonth(f.termStart, f.termEnd ?? f.termStart, month);
      const half = sh > 0 && /half|full/i.test(f.status ?? "");
      school ||= half;
      lines.push({
        docId: doc.id, label: f.school ?? "School record", share: sh, hours: 0, income: 0,
        note: half ? "Enrolled at least half-time: meets the requirement on its own" : "Enrollment not at least half-time",
      });
    }
  }
  const totalHours = r2(work + vol);
  const inc = r2(income);
  return {
    lines,
    totals: {
      state: "MO",
      month,
      workHours: r2(work),
      volunteerHours: r2(vol),
      schoolHalfTime: school,
      totalHours,
      income: inc,
      gigIncome: r2(gigIncome),
      gigActiveHours: r2(gigActive),
      meetsHours: totalHours >= RULE.hoursPerMonth || school,
      meetsIncome: inc >= RULE.incomeRoute,
    },
  };
}
