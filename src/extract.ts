import { InferenceSource, type Part } from "firebase/ai";
import { deviceOnly, imagePart, nanoState, preferDevice } from "./ai";
import { checkFields } from "./checks";
import { amount, isoRange, minutes } from "./parse";
import { registerImage, registerText } from "./guard";
import type { DocType, Fields, Where } from "./types";

const str = { type: ["string", "null"] };
const num = { type: ["number", "null"] };
// Dates are copied as printed (e.g. "01/03/2027") and converted in code. Asking the model to reformat invents years.
const date = { type: ["string", "null"], description: "copied exactly as printed" };

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const CLASSIFY_SCHEMA = obj({
  type: { type: "string", enum: ["pay_stub", "gig_summary", "volunteer_letter", "school_record", "other"] },
});

export const SCHEMAS: Record<Exclude<DocType, "other">, { schema: Record<string, unknown>; ask: string }> = {
  pay_stub: {
    schema: obj({ employer: str, periodStart: date, periodEnd: date, hours: num, rate: num, gross: num }),
    ask:
      "This is a pay stub. Return the employer name, the pay period start and end dates copied exactly as printed, " +
      "the hours worked in this pay period, the hourly rate, and the gross pay for this pay period. " +
      "Gross pay is before deductions: not net pay, not take-home, not year-to-date. Use null for anything not shown.",
  },
  gig_summary: {
    schema: obj({ platform: str, rangeStart: date, rangeEnd: date, earnings: num, activeTime: str, onlineTime: str }),
    ask:
      "This is an earnings summary from a gig or delivery app. Return the app name, the first and last date " +
      "of the summary copied exactly as printed, the earliest date first, the total earnings in dollars, and the active time and online time copied " +
      "exactly as printed (for example \"14h 05m\"). Use null for anything not shown.",
  },
  volunteer_letter: {
    schema: obj({ org: str, address: str, periodStart: date, periodEnd: date, hours: num, activity: str, contact: str }),
    ask:
      "This is a letter confirming volunteer work. Return the organization name, its address, the first and " +
      "last date volunteered (the dates of the volunteering, usually after \"from\" and \"through\"; never the date the letter was written), copied exactly as printed, the total hours, a short description of the activity, and the name " +
      "of the person who signed it. Use null for anything not shown.",
  },
  school_record: {
    schema: obj({ school: str, status: str, termStart: date, termEnd: date }),
    ask:
      "This is a school enrollment record. Return the school name, the enrollment status exactly as written " +
      "(for example full-time or half-time), and the term start and end dates copied exactly as printed. Use null for anything not shown.",
  },
};

const SYSTEM =
  "You read one document image and return only the requested fields as JSON. Copy numbers and dates exactly " +
  "as printed. Never guess: if a value is not clearly printed, return null.";

// Text that identifies a person or business. Registered with the leak guard for real documents.
const IDENTITY_FIELDS = ["employer", "platform", "org", "address", "activity", "contact", "school", "note"];

export interface ReadResult {
  fields?: Fields;
  where: Where;
  ms: number;
  flags: ReturnType<typeof checkFields>;
  /** What the model returned before normalizing, for the bench. */
  raw?: Record<string, unknown>;
}

export class NoNano extends Error {}

const DATE_PAIRS = [["periodStart", "periodEnd"], ["rangeStart", "rangeEnd"], ["termStart", "termEnd"]];
const NUM_KEYS = ["hours", "rate", "gross", "earnings"];

/** Model output is copied text. Units, formats and arithmetic are fixed here, in code. */
export function normalize(raw: Record<string, unknown>): Fields {
  const f: Record<string, unknown> = { ...raw };
  for (const [a, b] of DATE_PAIRS) if (a in f || b in f) {
    let [s, e] = isoRange(f[a], f[b]);
    if (s && e && s > e) [s, e] = [e, s]; // read in the wrong order
    f[a] = s; f[b] = e;
  }
  for (const k of NUM_KEYS) if (k in f) f[k] = amount(f[k]);
  if (f.type === "gig_summary") {
    const { activeTime, onlineTime, ...rest } = f;
    return { ...rest, activeMinutes: minutes(activeTime), onlineMinutes: minutes(onlineTime) } as unknown as Fields;
  }
  return f as unknown as Fields;
}

function source(r: { response: { inferenceSource?: string } }): Where {
  return r.response.inferenceSource === InferenceSource.IN_CLOUD ? "in_cloud" : "on_device";
}

export async function readDocument(blob: Blob, opts: { sample: boolean; month: string }): Promise<ReadResult> {
  const t0 = performance.now();
  const { part, base64 } = await imagePart(blob);

  if (!opts.sample) {
    // Real documents: register first, so even a misrouted request would be blocked,
    // then refuse to run anywhere but this laptop.
    registerImage(base64);
    if ((await nanoState()) !== "available") throw new NoNano("Gemini Nano is not available in this browser.");
  }
  const model = (schema: Record<string, unknown>) => (opts.sample ? preferDevice(SYSTEM, schema) : deviceOnly(SYSTEM, schema));

  const run = async (schema: Record<string, unknown>, ask: string) => {
    const parts: Part[] = [{ type: "text", text: ask }, part];
    const r = await model(schema).generateContent(parts);
    return { json: JSON.parse(r.response.text()), where: source(r) };
  };

  const c = await run(CLASSIFY_SCHEMA, "What kind of document is this?");
  const type = c.json.type as DocType;
  let where: Where = c.where;
  let fields: Fields;
  let raw: Record<string, unknown> | undefined;
  if (type === "other") {
    fields = { type: "other", note: null };
  } else {
    const e = await run(SCHEMAS[type].schema, SCHEMAS[type].ask);
    raw = e.json;
    fields = normalize({ ...e.json, type });
    if (e.where === "in_cloud") where = "in_cloud";
  }
  if (!opts.sample) for (const k of IDENTITY_FIELDS) registerText((fields as unknown as Record<string, unknown>)[k]);

  return { fields, where, ms: Math.round(performance.now() - t0), flags: checkFields(fields, opts.month), raw };
}
