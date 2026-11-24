// Plain-code checks on what Nano read. A small model gives no confidence score,
// so we ask: do the numbers agree with each other and with the month?
import { shareInMonth } from "./ledger";
import type { Fields, Flag } from "./types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2027-01" -> "January 2027" */
const label = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1] ?? m} ${m.slice(0, 4)}`;

const isDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

export function checkFields(f: Fields, month: string): Flag[] {
  const flags: Flag[] = [];
  const need = (field: string, v: unknown, label: string) => {
    if (v === null || v === undefined || v === "") flags.push({ field, message: `Couldn't read the ${label}. Please type it in.` });
  };
  const inMonth = (field: string, s: string | null, e: string | null) => {
    if (!isDate(s)) return;
    const end = isDate(e) ? e! : s!;
    if (end < s!) flags.push({ field, message: "End date is before the start date." });
    const days = (Date.parse(end) - Date.parse(s!)) / 86_400_000 + 1;
    // Pay periods and gig summaries cover a month at most. A longer span usually means a misread year.
    if (days > 35) flags.push({ field, message: `These dates span ${Math.round(days)} days. Check the year.` });
    if (end.slice(0, 7) < month && s!.slice(0, 7) < month) flags.push({ field, message: `The dates are before ${label(month)}. Is this the right document?` });
    if (s!.slice(0, 7) > month) flags.push({ field, message: `The dates are after ${label(month)}. Is this the right document?` });
  };
  // Only the days inside the month count. When that cuts a document's hours or pay, say so,
  // because it changes the total and a misread date shows up here first.
  const partial = (field: string, s: string | null, e: string | null, what: string, amount: number | null) => {
    if (!isDate(s) || !isDate(e) || e! < s!) return;
    const share = shareInMonth(s, e, month);
    if (share <= 0 || share >= 1) return;
    const days = Math.round((Date.parse(e!) - Date.parse(s!)) / 86_400_000) + 1;
    const inside = Math.round(share * days);
    const r = (n: number) => Math.round(n * 100) / 100;
    const part = amount === null ? "" : what === "pay"
      ? `, so $${(amount * share).toFixed(2)} of $${amount.toFixed(2)} counts`
      : `, so ${r(amount * share)} of ${r(amount)} hours count`;
    flags.push({ field, message: `Only ${inside} of ${days} days are in ${label(month)}${part}. Check the dates.` });
  };

  if (f.type === "pay_stub") {
    need("periodStart", f.periodStart, "pay period start");
    need("periodEnd", f.periodEnd, "pay period end");
    need("hours", f.hours, "hours");
    need("gross", f.gross, "gross pay");
    if (f.hours !== null && f.rate !== null && f.gross !== null && f.rate > 0) {
      const expect = f.hours * f.rate;
      // Overtime pays more, never less. Allow a little rounding.
      if (f.gross + 1 < expect || f.gross > expect * 1.6 + 1) {
        flags.push({
          field: "gross",
          message: `${f.hours} hours × $${f.rate.toFixed(2)} is $${expect.toFixed(2)}, but gross reads $${f.gross.toFixed(2)}. Check the stub.`,
        });
      }
    }
    if (f.hours !== null && (f.hours <= 0 || f.hours > 200)) flags.push({ field: "hours", message: "Hours look out of range for one pay period." });
    inMonth("periodStart", f.periodStart, f.periodEnd);
    partial("periodStart", f.periodStart, f.periodEnd, "hours", f.hours);
  } else if (f.type === "gig_summary") {
    need("rangeStart", f.rangeStart, "start date");
    need("earnings", f.earnings, "earnings");
    need("activeMinutes", f.activeMinutes, "active time");
    if (f.activeMinutes !== null && f.onlineMinutes !== null && f.activeMinutes > f.onlineMinutes) {
      flags.push({ field: "activeMinutes", message: "Active time is longer than online time. Check the screenshot." });
    }
    inMonth("rangeStart", f.rangeStart, f.rangeEnd);
    partial("rangeStart", f.rangeStart, f.rangeEnd, "pay", f.earnings);
  } else if (f.type === "volunteer_letter") {
    need("org", f.org, "organization");
    need("hours", f.hours, "hours");
    need("periodStart", f.periodStart, "start date");
    need("contact", f.contact, "contact person");
    inMonth("periodStart", f.periodStart, f.periodEnd);
    partial("periodStart", f.periodStart, f.periodEnd, "hours", f.hours);
  } else if (f.type === "school_record") {
    need("status", f.status, "enrollment status");
    need("termStart", f.termStart, "term dates");
  }
  return flags;
}
