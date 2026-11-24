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
