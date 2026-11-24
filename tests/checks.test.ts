import { describe, expect, it } from "vitest";
import { checkFields } from "../src/checks";

const stub = (o: object) => ({ type: "pay_stub" as const, employer: "A", periodStart: "2027-01-03", periodEnd: "2027-01-16", hours: 18, rate: 15, gross: 270, ...o });

describe("checkFields", () => {
  it("passes a consistent stub", () => expect(checkFields(stub({}), "2027-01")).toEqual([]));
  it("flags gross that doesn't match hours x rate (a misread digit)", () => {
    const f = checkFields(stub({ gross: 210 }), "2027-01");
    expect(f.map((x) => x.field)).toContain("gross");
  });
  it("allows overtime", () => expect(checkFields(stub({ gross: 300 }), "2027-01")).toEqual([]));
  it("flags missing hours", () => expect(checkFields(stub({ hours: null }), "2027-01").map((x) => x.field)).toContain("hours"));
  it("flags a stub from the wrong month", () =>
    expect(checkFields(stub({ periodStart: "2026-11-01", periodEnd: "2026-11-14" }), "2027-01").length).toBe(1));
});

import { minutes } from "../src/parse";
describe("minutes (durations converted in code)", () => {
  it.each([["14h 05m", 845], ["21h 30m", 1290], ["3 hr 5 min", 185], ["2 hours", 120], ["14:05", 845], ["45 min", 45], [null, null], ["", null]])(
    "%s -> %s", (s, m) => expect(minutes(s)).toBe(m));
});

import { amount, isoDate } from "../src/parse";
describe("isoDate (formats fixed in code)", () => {
  it.each([["2027-01-03", "2027-01-03"], ["01/18/2026", "2026-01-18"], ["1/3/27", "2027-01-03"], ["Jan 03, 2027", "2027-01-03"],
    ["January 3, 2027", "2027-01-03"], ["3 Jan 2027", "2027-01-03"], ["02/30/2027", null], ["soon", null], [null, null]])("%s -> %s", (s, d) => expect(isoDate(s)).toBe(d));
});
describe("amount", () => {
  it.each([["$1,234.50", 1234.5], [270, 270], ["n/a", null]])("%s -> %s", (s, n) => expect(amount(s)).toBe(n));
});

import { isoRange } from "../src/parse";
describe("isoRange (year borrowed from the end date)", () => {
  it.each([
    ["Oct 19", "Nov 18, 2026", "2026-10-19", "2026-11-18"],
    ["Dec 20", "Jan 02, 2027", "2026-12-20", "2027-01-02"],
    ["01/03/2027", "01/16/2027", "2027-01-03", "2027-01-16"],
    ["12/28", "01/10/2027", "2026-12-28", "2027-01-10"],
  ])("%s .. %s", (s, e, ws, we) => expect(isoRange(s, e)).toEqual([ws, we]));
});

describe("date variants seen from Nano in the bench", () => {
  it.each([["05 03 2026", "2026-05-03"], ["07 05, 2026", "2026-07-05"], ["Jan 1, 17", null]])("%s -> %s", (s, d) => expect(isoDate(s)).toBe(d));
  it("splits a range copied into one field", () => expect(isoRange("Apr 06 - May 06, 2026", null)).toEqual(["2026-04-06", "2026-05-06"]));
  it("splits a range even when the end is also filled", () => expect(isoRange("Jan 11 - Jan 17, 2027", "Jan 17, 2027")).toEqual(["2027-01-11", "2027-01-17"]));
  it("leaves dates with no year blank", () => expect(isoRange("Jan 04", "Feb 03")).toEqual([null, null]));
});

describe("partial-month flag (Dana's letter misread as Jan 30 - Feb 2, seen live 11/24)", () => {
  const letter = { type: "volunteer_letter", org: "Northside Community Pantry", address: "x", periodStart: "2027-01-30", periodEnd: "2027-02-02", hours: 28, activity: "x", contact: "Grace Holloway" } as const;
  it("flags it and says how much counts", () => {
    const f = checkFields(letter as never, "2027-01");
    expect(f.map((x) => x.message).join(" ")).toContain("Only 2 of 4 days are in 2027-01, so 14 of 28 hours count");
  });
  it("stays quiet when the whole period is inside the month", () => {
    expect(checkFields({ ...letter, periodStart: "2027-01-02", periodEnd: "2027-01-30" } as never, "2027-01")).toEqual([]);
  });
});
