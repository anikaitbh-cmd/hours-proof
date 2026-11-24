/** Durations are copied as printed, then converted here: code does arithmetic, not the model. */
export function minutes(s: unknown): number | null {
  if (typeof s === "number") return s;
  if (typeof s !== "string" || !s.trim()) return null;
  const t = s.toLowerCase();
  const hm = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b\.?\s*(?:(\d+)\s*(?:m|min|mins|minutes)\b)?/);
  if (hm) return Math.round(parseFloat(hm[1]) * 60 + (hm[2] ? parseInt(hm[2]) : 0));
  const colon = t.match(/^(\d+):(\d{2})$/);
  if (colon) return parseInt(colon[1]) * 60 + parseInt(colon[2]);
  const m = t.match(/(\d+)\s*(?:m|min|mins|minutes)\b/);
  return m ? parseInt(m[1]) : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Dates come back in whatever format the document used. Convert to YYYY-MM-DD here, in code. */
export function isoDate(s: unknown): string | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})(?:[-/.]|,?\s+)(\d{1,2})(?:[-/.]|,?\s+)(\d{2}|\d{4})$/); // US order: month/day/year
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2]);
  m = t.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo >= 0) return valid(+m[3], mo + 1, +m[2]);
  }
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) return valid(+m[3], mo + 1, +m[1]);
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** "$1,234.50" -> 1234.5 */
export function amount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = parseFloat(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * A date range as printed. A start date with no year ("Oct 19 - Nov 18, 2026") borrows the end
 * date's year, minus one if the range crosses New Year ("Dec 20 - Jan 2, 2027").
 */
export function isoRange(start: unknown, end: unknown): [string | null, string | null] {
  // A whole range copied into one field: "Apr 06 - May 06, 2026".
  for (const one of [start, end]) {
    if (typeof one !== "string") continue;
    const parts = one.split(/\s+(?:-|–|—|to|through)\s+/i);
    if (parts.length === 2) return isoRange(parts[0], parts[1]);
  }
  const e = isoDate(end);
  let s = isoDate(start);
  if (!s && e && typeof start === "string") {
    const m = start.trim().match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/) ?? null;
    const n = start.trim().match(/^(\d{1,2})[/.-](\d{1,2})$/);
    let mo = -1, day = 0;
    if (m) { mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1; day = +m[2]; }
    else if (n) { mo = +n[1]; day = +n[2]; }
    if (mo > 0) {
      const y = +e.slice(0, 4);
      s = valid(y, mo, day);
      if (s && s > e) s = valid(y - 1, mo, day);
    }
  }
  return [s, e];
}
