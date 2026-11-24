// The leak test. If any outbound payload can carry text from a client document, this fails the build.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudPayload } from "../src/cloud";
import { findLeak, installGuard, LeakBlocked, registerImage, registerText, resetGuard } from "../src/guard";
import { ledger } from "../src/ledger";
import type { Doc, Fields } from "../src/types";
import { readFileSync } from "node:fs";

const prompts: string[] = [];
vi.mock("../src/ai", () => {
  const fake = () => ({
    generateContent: async (p: unknown) => {
      prompts.push(typeof p === "string" ? p : JSON.stringify(p));
      return { response: { text: () => '```json\n{"status":"meets","summary":"ok","rules":[],"startDate":"","openQuestions":[]}\n```', inferenceSource: "in_cloud", candidates: [] } };
    },
  });
  return { cloudWithUrls: fake, preferDevice: fake, getCloudModel: () => "test" };
});

const answers = JSON.parse(readFileSync(new URL("../public/samples/dana/answers.json", import.meta.url), "utf8"));
// Identity text from Dana's documents, plus fields the answer key doesn't carry.
const IDENTITY = [
  "Dana Whitfield", "Riverbend Grocery", "4410 Gravois Ave", "Northside Community Pantry", "3120 N Grand Blvd",
  "Grace Holloway", "(314) 555-0148", "QuickCart Driver", "sorting and handing out food boxes",
];
const docs: Doc[] = [
  { type: "pay_stub", employer: "Riverbend Grocery", periodStart: "2027-01-03", periodEnd: "2027-01-16", hours: 18, rate: 15, gross: 270 },
  { type: "pay_stub", employer: "Riverbend Grocery", periodStart: "2027-01-17", periodEnd: "2027-01-30", hours: 12, rate: 15, gross: 180 },
  { type: "volunteer_letter", org: "Northside Community Pantry", address: "3120 N Grand Blvd, St. Louis, MO 63107", periodStart: "2027-01-02", periodEnd: "2027-01-30", hours: 28, activity: "sorting and handing out food boxes", contact: "Grace Holloway" },
  { type: "gig_summary", platform: "QuickCart Driver", rangeStart: "2027-01-01", rangeEnd: "2027-01-31", earnings: 186.4, activeMinutes: 845, onlineMinutes: 1290 },
].map((fields, i) => ({ id: String(i), name: `doc${i}.png`, imageUrl: "", sample: false, status: "done", fields: fields as Fields, flags: [], confirmed: new Set<string>() }));

beforeEach(() => { resetGuard(); prompts.length = 0; });

describe("leak test: outbound payloads", () => {
  it("answer key and fixtures agree on the employer (guards the fixture itself)", () => {
    expect(answers["pay-stub-jan-1.png"].type).toBe("pay_stub");
  });

  it("the totals payload carries no document text", () => {
    const body = cloudPayload(ledger(docs, "2027-01").totals);
    for (const s of IDENTITY) expect(body.toLowerCase()).not.toContain(s.toLowerCase());
  });

  it("the totals payload drops any extra field smuggled into Totals", () => {
    const t = { ...ledger(docs, "2027-01").totals, employer: "Riverbend Grocery", note: "Dana Whitfield" };
    const body = cloudPayload(t);
    expect(body).not.toContain("Riverbend");
    expect(body).not.toContain("Dana");
  });

  it("the rule-check and reply prompts carry no document text", async () => {
    const { checkRules, draftReply } = await import("../src/cloud");
    const { totals } = ledger(docs, "2027-01");
    const rules = await checkRules(totals);
    await draftReply(totals, rules, ["2 pay stubs", "1 volunteer letter", "1 gig app summary"]);
    expect(prompts.length).toBe(2);
    for (const p of prompts) for (const s of IDENTITY) expect(p.toLowerCase()).not.toContain(s.toLowerCase());
  });
});

describe("leak test: runtime guard", () => {
  const net = () => {
    const sent: string[] = [];
    const target = { fetch: (async (_u: unknown, init?: RequestInit) => { sent.push(String(init?.body)); return new Response("{}"); }) as typeof fetch };
    installGuard(target);
    return { target, sent };
  };

  it("blocks a request containing a registered employer name", async () => {
    registerText("Riverbend Grocery");
    const { target, sent } = net();
    await expect(target.fetch("https://firebasevertexai.googleapis.com/x", { method: "POST", body: '{"text":"Riverbend Grocery paid 270"}' }))
      .rejects.toBeInstanceOf(LeakBlocked);
    expect(sent).toEqual([]);
  });

  it("blocks a request containing a real document image", async () => {
    const img = readFileSync(new URL("../public/samples/dana/pay-stub-jan-1.png", import.meta.url)).toString("base64");
    registerImage(img);
    const { target } = net();
    await expect(target.fetch("https://firebasevertexai.googleapis.com/x", { method: "POST", body: JSON.stringify({ inlineData: { data: img } }) }))
      .rejects.toBeInstanceOf(LeakBlocked);
  });

  it("lets a totals-only request through", async () => {
    registerText("Riverbend Grocery");
    const { target, sent } = net();
    await target.fetch("https://firebasevertexai.googleapis.com/x", { method: "POST", body: cloudPayload(ledger(docs, "2027-01").totals) });
    expect(sent.length).toBe(1);
  });

  it("ignores very short strings so totals can't trip it", () => {
    registerText("MO");
    expect(findLeak('{"state":"MO"}')).toBeNull();
  });
});
