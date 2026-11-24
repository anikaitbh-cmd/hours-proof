import { describe, expect, it } from "vitest";
import { ledger, shareInMonth } from "../src/ledger";
import type { Doc, Fields } from "../src/types";

export const doc = (fields: Fields, id = Math.random().toString(36)): Doc => ({
  id, name: id, imageUrl: "", sample: true, status: "done", fields, flags: [], confirmed: new Set(),
});

describe("shareInMonth", () => {
  it("counts a period fully inside the month", () => expect(shareInMonth("2027-01-03", "2027-01-16", "2027-01")).toBe(1));
  it("prorates a period that crosses months", () => expect(shareInMonth("2027-01-25", "2027-02-07", "2027-01")).toBeCloseTo(7 / 14));
  it("ignores other months", () => expect(shareInMonth("2026-12-01", "2026-12-14", "2027-01")).toBe(0));
  it("rejects bad dates", () => expect(shareInMonth("01/03/2027", null, "2027-01")).toBe(0));
});

describe("Dana's month", () => {
  const docs = [
    doc({ type: "pay_stub", employer: "Riverbend Grocery", periodStart: "2027-01-03", periodEnd: "2027-01-16", hours: 18, rate: 15, gross: 270 }),
    doc({ type: "pay_stub", employer: "Riverbend Grocery", periodStart: "2027-01-17", periodEnd: "2027-01-30", hours: 12, rate: 15, gross: 180 }),
    doc({ type: "volunteer_letter", org: "Northside Community Pantry", address: "x", periodStart: "2027-01-02", periodEnd: "2027-01-30", hours: 28, activity: "x", contact: "x" }),
    doc({ type: "gig_summary", platform: "QuickCart Driver", rangeStart: "2027-01-01", rangeEnd: "2027-01-31", earnings: 186.4, activeMinutes: 845, onlineMinutes: 1290 }),
  ];
  const { totals } = ledger(docs, "2027-01");
  it("adds hours from stubs and volunteering, not gig time", () => {
    expect(totals.workHours).toBe(30);
    expect(totals.volunteerHours).toBe(28);
    expect(totals.totalHours).toBe(58);
    expect(totals.gigActiveHours).toBeCloseTo(14.08, 2);
  });
  it("counts gig earnings as pay", () => {
    expect(totals.income).toBe(636.4);
    expect(totals.gigIncome).toBe(186.4);
  });
  it("is short on hours but meets the $580 income route", () => {
    expect(totals.meetsHours).toBe(false);
    expect(totals.meetsIncome).toBe(true);
  });
  it("would miss the income route without the gig app", () => {
    expect(ledger(docs.slice(0, 3), "2027-01").totals.meetsIncome).toBe(false);
  });
});

describe("school", () => {
  it("half-time enrollment meets the requirement on its own", () => {
    const { totals } = ledger([doc({ type: "school_record", school: "STLCC", status: "Half-time", termStart: "2027-01-12", termEnd: "2027-05-08" })], "2027-02");
    expect(totals.meetsHours).toBe(true);
  });
});
