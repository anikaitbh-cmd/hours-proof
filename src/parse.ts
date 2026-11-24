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
