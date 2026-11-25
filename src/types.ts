export type DocType = "pay_stub" | "gig_summary" | "volunteer_letter" | "school_record" | "other";

export interface PayStub {
  type: "pay_stub";
  employer: string | null;
  periodStart: string | null; // YYYY-MM-DD
  periodEnd: string | null;
  hours: number | null;
  rate: number | null;
  gross: number | null;
}

export interface GigSummary {
  type: "gig_summary";
  platform: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  earnings: number | null;
  activeMinutes: number | null;
  onlineMinutes: number | null;
}

export interface VolunteerLetter {
  type: "volunteer_letter";
  org: string | null;
  address: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  hours: number | null;
  activity: string | null;
  contact: string | null;
}

export interface SchoolRecord {
  type: "school_record";
  school: string | null;
  status: string | null; // e.g. "half-time or more"
  termStart: string | null;
  termEnd: string | null;
}

export interface OtherDoc {
  type: "other";
  note: string | null;
}

export type Fields = PayStub | GigSummary | VolunteerLetter | SchoolRecord | OtherDoc;

export type Where = "on_device" | "in_cloud" | "hand_entry";

export interface Flag {
  field: string;
  message: string;
}

export interface Doc {
  id: string;
  name: string;
  imageUrl: string; // object URL, never uploaded
  sample: boolean; // fictional sample: may use the cloud when Nano is missing
  status: "reading" | "done" | "needs_entry" | "error";
  fields?: Fields;
  where?: Where;
  ms?: number;
  startedAt?: number; // performance.now() when the read began
  flags: Flag[];
  confirmed: Set<string>;
  error?: string;
}

/** The only thing that may ever leave the device. No names, employers, images or text. */
export interface Totals {
  state: "MO";
  month: string; // YYYY-MM
  workHours: number;
  volunteerHours: number;
  schoolHalfTime: boolean;
  totalHours: number;
  income: number;
  gigIncome: number;
  gigActiveHours: number;
  meetsHours: boolean;
  meetsIncome: boolean;
}
