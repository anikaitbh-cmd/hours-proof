import { InferenceSource } from "firebase/ai";
import { cloudWithUrls, preferDevice } from "./ai";
import { RULE, RULE_SOURCES } from "./config";
import type { Totals, Where } from "./types";

/**
 * The only payload that may leave the device. Built field by field from Totals, so a new
 * field can't slip in by accident. The leak test checks this function.
 */
export function cloudPayload(t: Totals): string {
  const safe: Totals = {
    state: "MO",
    month: String(t.month).slice(0, 7),
    workHours: Number(t.workHours),
    volunteerHours: Number(t.volunteerHours),
    schoolHalfTime: Boolean(t.schoolHalfTime),
    totalHours: Number(t.totalHours),
    income: Number(t.income),
    gigIncome: Number(t.gigIncome),
    gigActiveHours: Number(t.gigActiveHours),
    meetsHours: Boolean(t.meetsHours),
    meetsIncome: Boolean(t.meetsIncome),
  };
  return JSON.stringify(safe, null, 2);
}

export interface RuleCheck {
  status: "meets" | "short" | "unclear";
  summary: string;
  rules: { rule: string; applies: boolean; detail: string; sourceUrl: string }[];
  startDate: string;
  openQuestions: string[];
  checkedAt: string;
  where: Where;
  sourcesRead: string[];
  /** The exact totals payload this check was run on. A result only applies to those totals. */
  forPayload?: string;
}

const RULES_SYSTEM =
  "You help a Medicaid enrollment assister in Missouri check a client's month against the community engagement " +
  "(work requirement) rules. Use only the rule pages you are given. Every rule you cite must link the page it came " +
  "from. If the pages don't settle something, say so instead of guessing. Plain language, short sentences.";

export async function checkRules(t: Totals): Promise<RuleCheck> {
  const prompt =
    `Rule pages:\n${RULE_SOURCES.map((s) => `- ${s.url}`).join("\n")}\n\n` +
    `Client totals (no personal details):\n${cloudPayload(t)}\n\n` +
    "These totals are final: the app already counted only the days inside the month. Quote them as given; " +
    "never add hours up yourself. Gig app active time (gigActiveHours) is not counted in totalHours.\n\n" +
    `Federal baseline the app already uses: ${RULE.hoursPerMonth} hours a month, or monthly income of at least ` +
    `$${RULE.incomeRoute} (${RULE.hoursPerMonth} hours x $${RULE.federalMinWage} federal minimum wage).\n\n` +
    "Answer with one JSON object in a ```json block, with keys:\n" +
    '  "status": "meets" | "short" | "unclear",\n' +
    '  "summary": two sentences for the assister,\n' +
    '  "rules": up to 5 items {"rule", "applies" (true/false for this client), "detail", "sourceUrl"},\n' +
    '  "startDate": when the requirement starts in Missouri, as the pages state it,\n' +
    '  "openQuestions": things the pages leave open that matter for this client (for example whether gig ' +
    "app active time counts as hours).";
  const r = await cloudWithUrls(RULES_SYSTEM).generateContent(prompt).catch((e: Error) => {
    throw new Error(cloudError(e));
  });
  const text = r.response.text();
  const m = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (!m) throw new Error("The rule check didn't return a readable answer. Try again.");
  const j = JSON.parse(m[1]);
  const meta = r.response.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? [];
  return {
    status: j.status ?? "unclear",
    summary: j.summary ?? "",
    rules: Array.isArray(j.rules) ? j.rules.slice(0, 5) : [],
    startDate: j.startDate ?? "",
    openQuestions: Array.isArray(j.openQuestions) ? j.openQuestions : [],
    checkedAt: new Date().toISOString(),
    forPayload: cloudPayload(t),
    where: r.response.inferenceSource === InferenceSource.ON_DEVICE ? "on_device" : "in_cloud",
    sourcesRead: meta
      .filter((u) => String(u.urlRetrievalStatus ?? "").includes("SUCCESS"))
      .map((u) => u.retrievedUrl ?? "")
      .filter(Boolean),
  };
}

const REPLY_SYSTEM =
  "You draft short, plain letters from a Medicaid enrollment assister to the Missouri Family Support Division. " +
  "Use the placeholders exactly as given. Never invent names, numbers, dates or case details.";

/** "2027-01" -> "January 2027", so letters read like letters. */
export function monthName(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const PLACEHOLDERS = ["[CLIENT NAME]", "[CASE NUMBER]", "[NOTICE DATE]", "[ASSISTER NAME]", "[ORGANIZATION]"];

/** Inputs are totals and the rule summary only, so this may run on Nano or in the cloud. */
export async function draftReply(t: Totals, rules: RuleCheck | null, docList: string[]) {
  const prompt =
    `Month: ${monthName(t.month)}\n` +
    `Work hours: ${t.workHours}\nVolunteer hours: ${t.volunteerHours}\nTotal hours: ${t.totalHours}\n` +
    `Monthly income: $${t.income.toFixed(2)} (of which gig app earnings: $${t.gigIncome.toFixed(2)})\n` +
    `Meets 80 hours: ${t.meetsHours ? "yes" : "no"}\nMeets $${RULE.incomeRoute} income: ${t.meetsIncome ? "yes" : "no"}\n` +
    (rules ? `Rule check: ${rules.summary}\n` : "") +
    `Enclosed proof, by type: ${docList.join(", ")}\n\n` +
    "Write the letter responding to a notice that the state could not verify community engagement for this month. " +
    "Start with 'To: Missouri Family Support Division', then 'Re: [CLIENT NAME], case [CASE NUMBER], notice dated [NOTICE DATE]'. " +
    "In 3 short paragraphs: say the client meets the requirement and which way (hours or income), give the totals, " +
    "list the enclosed proof by type. Sign as [ASSISTER NAME], [ORGANIZATION]. Under 180 words.";
  const t0 = performance.now();
  const r = await preferDevice(REPLY_SYSTEM).generateContent(prompt);
  return {
    text: r.response.text().trim(),
    where: (r.response.inferenceSource === InferenceSource.IN_CLOUD ? "in_cloud" : "on_device") as Where,
    ms: Math.round(performance.now() - t0),
  };
}

/** Plain-language messages for the cloud errors an assister could actually hit. */
export function cloudError(e: Error): string {
  const m = String(e?.message ?? e);
  if (/prepayment|billing|429|quota|RESOURCE_EXHAUSTED/i.test(m)) return "The cloud is over its limit right now. Everything on this laptop still works. Try the rule check again later.";
  if (/app.?check|403|PERMISSION/i.test(m)) return "The cloud didn't accept this browser's App Check token. Reload the page and try again.";
  if (/fetch|network|Failed to fetch/i.test(m)) return "Couldn't reach the cloud. Check the connection and try again.";
  return "The rule check didn't finish. Try again.";
}
