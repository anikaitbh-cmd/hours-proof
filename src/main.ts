import { getCloudModel, loadRemoteConfig, nanoState, SIMULATE_NO_NANO, warmUpNano, type NanoState } from "./ai";
import { checkFields } from "./checks";
import { checkRules, cloudPayload, draftReply, PLACEHOLDERS, type RuleCheck } from "./cloud";
import { RULE, RULE_SOURCES } from "./config";
import { NoNano, readDocument } from "./extract";
import { blockedRequests, installGuard, LeakBlocked } from "./guard";
import { ledger } from "./ledger";
import type { Doc, DocType, Fields, Where } from "./types";

installGuard();

// ---------------------------------------------------------------- state
interface LogRow { step: string; where: Where; ms: number; at: string }
const S = {
  online: navigator.onLine,
  nano: "no-api" as NanoState,
  nanoProgress: null as number | null,
  month: "2027-01",
  docs: [] as Doc[],
  blobs: new Map<string, Blob>(),
  rules: loadRules(),
  rulesBusy: false,
  consent: false,
  reply: null as null | { text: string; where: Where; ms: number },
  replyBusy: false,
  fill: { "[CLIENT NAME]": "", "[CASE NUMBER]": "", "[NOTICE DATE]": "", "[ASSISTER NAME]": "", "[ORGANIZATION]": "" } as Record<string, string>,
  log: [] as LogRow[],
  error: "" as string,
  howOpen: false,
};

function loadRules(): RuleCheck | null {
  try { return JSON.parse(localStorage.getItem("hp.rules") || "null"); } catch { return null; }
}
function saveRules(r: RuleCheck) {
  try { localStorage.setItem("hp.rules", JSON.stringify(r)); } catch { /* private window */ }
}

// ---------------------------------------------------------------- helpers
const $app = document.getElementById("app")!;
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (x: number) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = (x: number) => (Math.round(x * 100) / 100).toLocaleString("en-US");
const uid = () => Math.random().toString(36).slice(2, 9);
const monthName = (m: string) =>
  new Date(m + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

const TYPE_LABEL: Record<DocType, string> = {
  pay_stub: "Pay stub", gig_summary: "Gig app summary", volunteer_letter: "Volunteer letter",
  school_record: "School record", other: "Other document",
};

type FieldDef = [key: string, label: string, kind: "text" | "date" | "num" | "money"];
const FIELD_DEFS: Record<DocType, FieldDef[]> = {
  pay_stub: [["employer", "Employer", "text"], ["periodStart", "Period start", "date"], ["periodEnd", "Period end", "date"],
    ["hours", "Hours", "num"], ["rate", "Rate", "money"], ["gross", "Gross pay", "money"]],
  gig_summary: [["platform", "App", "text"], ["rangeStart", "From", "date"], ["rangeEnd", "To", "date"],
    ["earnings", "Earnings", "money"], ["activeMinutes", "Active time (min)", "num"], ["onlineMinutes", "Online time (min)", "num"]],
  volunteer_letter: [["org", "Organization", "text"], ["address", "Address", "text"], ["periodStart", "From", "date"],
    ["periodEnd", "To", "date"], ["hours", "Hours", "num"], ["activity", "Activity", "text"], ["contact", "Signed by", "text"]],
  school_record: [["school", "School", "text"], ["status", "Enrollment", "text"], ["termStart", "Term start", "date"], ["termEnd", "Term end", "date"]],
  other: [],
};

function emptyFields(type: DocType): Fields {
  const f: Record<string, unknown> = { type };
  for (const [k] of FIELD_DEFS[type]) f[k] = null;
  if (type === "other") f.note = null;
  return f as unknown as Fields;
}

function badge(where?: Where, ms?: number, sample?: boolean) {
  if (!where) return "";
  const t = ms ? ` · ${(ms / 1000).toFixed(1)} s` : "";
  if (where === "on_device") return `<span class="badge device">On device · Gemini Nano${t}</span>`;
  if (where === "in_cloud") return `<span class="badge cloud">Cloud · Gemini${sample ? " · fictional sample" : ""}${t}</span>`;
  return `<span class="badge hand">Typed by hand</span>`;
}

function openFlags(d: Doc) {
  return d.flags.filter((f) => !d.confirmed.has(f.field));
}

// ---------------------------------------------------------------- render
function render() {
  const { lines, totals } = ledger(S.docs, S.month);
  const flagged = S.docs.reduce((n, d) => n + openFlags(d).length, 0);
  const reading = S.docs.some((d) => d.status === "reading");
  const anySample = S.docs.some((d) => d.sample);
  const meets = totals.meetsHours || totals.meetsIncome;

  $app.innerHTML = `
  <header class="top">
    <div class="brand"><img src="/favicon.svg" alt="" width="28" height="28"><span>Hours Proof</span></div>
    <div class="pills">
      ${anySample ? `<span class="pill sample">Fictional client, fictional documents</span>` : ""}
      <span class="pill ${S.online ? "on" : "off"}">${S.online ? "Online" : "Offline"}</span>
      <span class="pill ${S.nano === "available" ? "on" : "warn"}">${nanoLabel()}</span>
    </div>
  </header>

  ${nanoBanner()}
  ${S.error ? `<div class="alert" role="alert">${esc(S.error)} <button data-act="dismiss" class="link">Dismiss</button></div>` : ""}

  <main class="grid">
    <section class="col">
      <div class="step">
        <h2><span class="n">1</span> Documents</h2>
        <p class="sub">Pay stubs, gig app summaries, volunteer letters, school records. They're read on this laptop and never uploaded.</p>
        <label class="drop" id="drop">
          <input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/heic" multiple hidden>
          <strong>Drop document photos here</strong><span>or click to choose files</span>
        </label>
        ${S.docs.length === 0 ? `<button class="btn ghost wide" data-act="samples">Try it with Dana's fictional documents</button>` : ""}
        <div class="docs">${S.docs.map(docCard).join("")}</div>
      </div>
    </section>

    <section class="col">
      <div class="step">
        <h2><span class="n">2</span> ${esc(monthName(S.month))}</h2>
        <label class="month">Month the state is asking about <input type="month" id="month" value="${S.month}"></label>
        ${meter("Hours of work, school or volunteering", totals.totalHours, RULE.hoursPerMonth, `${hrs(totals.totalHours)} of ${RULE.hoursPerMonth} hours`)}
        ${meter(`Pay (80 hours × $${RULE.federalMinWage} federal minimum wage)`, totals.income, RULE.incomeRoute, `${money(totals.income)} of ${money(RULE.incomeRoute)}`)}
        ${S.docs.length ? verdict(totals, flagged, reading) : `<p class="muted">Add documents to see the month.</p>`}
        ${lines.length ? `
        <table class="ledger">
          <thead><tr><th>Source</th><th>Counted</th><th class="r">Hours</th><th class="r">Pay</th></tr></thead>
          <tbody>${lines.map((l) => `
            <tr><td>${esc(l.label)}${l.note ? `<div class="note">${esc(l.note)}</div>` : ""}</td>
            <td>${l.share >= 0.999 ? "All" : l.share === 0 ? "Other month" : Math.round(l.share * 100) + "%"}</td>
            <td class="r">${l.hours ? hrs(l.hours) : "–"}</td><td class="r">${l.income ? money(l.income) : "–"}</td></tr>`).join("")}
          </tbody>
          <tfoot><tr><td colspan="2">Total</td><td class="r">${hrs(totals.totalHours)}</td><td class="r">${money(totals.income)}</td></tr></tfoot>
        </table>
        <p class="fine">All math is plain code. No model adds up hours or pay. Pay periods that cross months are counted by the share of days inside ${esc(monthName(S.month))}.</p>` : ""}
      </div>

      <div class="step">
        <h2><span class="n">3</span> Rules and reply</h2>
        ${rulesBlock(totals)}
        ${replyBlock(totals, meets, flagged, reading)}
      </div>
    </section>
  </main>

  ${howItRan()}
  <footer class="foot">Fictional examples only. Hours Proof helps an assister prepare proof; it is not legal advice, and the state makes the decision.</footer>
  <div id="print"></div>`;
  bind();
}

function nanoLabel() {
  switch (S.nano) {
    case "available": return "Gemini Nano ready";
    case "downloading": return S.nanoProgress !== null ? `Gemini Nano ${Math.round(S.nanoProgress * 100)}%` : "Gemini Nano downloading";
    case "downloadable": return "Gemini Nano not set up";
    default: return "No Gemini Nano";
  }
}

function nanoBanner() {
  if (S.nano === "downloadable" || S.nano === "downloading") {
    return `<div class="banner">
      <div><strong>Set up on-device reading.</strong> Chrome downloads Gemini Nano once, then documents are read with no network at all.</div>
      ${S.nano === "downloading" && S.nanoProgress !== null
        ? `<progress max="1" value="${S.nanoProgress}"></progress>`
        : `<button class="btn" data-act="nano">Set up Gemini Nano</button>`}
    </div>`;
  }
  if (S.nano === "no-api" || S.nano === "unavailable") {
    return `<div class="banner quiet">
      <div><strong>${SIMULATE_NO_NANO ? "Simulating a browser without Gemini Nano." : "This browser can't run Gemini Nano."}</strong> Client documents are never sent to the cloud instead, so you type their numbers in and everything else still works.
      The fictional samples can be read in the cloud so you can see the flow. Desktop Chrome runs it on device.</div>
    </div>`;
  }
  return "";
}

function meter(label: string, value: number, goal: number, text: string) {
  const pct = Math.min(100, (value / goal) * 100);
  return `<div class="meter ${value >= goal ? "met" : ""}">
    <div class="meter-top"><span>${esc(label)}</span><strong>${esc(text)}</strong></div>
    <div class="bar"><i style="width:${pct}%"></i></div></div>`;
}

function verdict(t: ReturnType<typeof ledger>["totals"], flagged: number, reading: boolean) {
  if (reading) return `<div class="verdict wait">Reading documents…</div>`;
  if (flagged) return `<div class="verdict wait">${flagged} item${flagged > 1 ? "s" : ""} to check before the month is final.</div>`;
  if (t.meetsHours) return `<div class="verdict ok">Meets the requirement with ${hrs(t.totalHours)} hours${t.schoolHalfTime ? " (school, at least half-time)" : ""}.</div>`;
  if (t.meetsIncome) return `<div class="verdict ok">${hrs(t.totalHours)} hours is short of 80, but pay of ${money(t.income)} meets the ${money(RULE.incomeRoute)} income route.</div>`;
  return `<div class="verdict short">Short: ${hrs(RULE.hoursPerMonth - t.totalHours)} more hours or ${money(RULE.incomeRoute - t.income)} more pay needed for ${esc(monthName(t.month))}.</div>`;
}

function docCard(d: Doc) {
  const type = d.fields?.type ?? "other";
  const flags = openFlags(d);
  const head = `<div class="doc-head">
      <img src="${d.imageUrl}" alt="${esc(d.name)}" class="thumb" data-act="zoom" data-id="${d.id}">
      <div class="doc-title">
        <strong>${d.fields ? TYPE_LABEL[type] : esc(d.name)}</strong>
        <span class="muted small">${esc(d.name)}${d.sample ? " · fictional" : ""}</span>
        <div>${d.status === "reading" ? `<span class="badge busy">${d.sample || S.nano === "available" ? "Reading…" : "Waiting"}</span>` : badge(d.where, d.ms, d.sample)}</div>
      </div>
      <button class="x" data-act="remove" data-id="${d.id}" aria-label="Remove ${esc(d.name)}">×</button>
    </div>`;
  if (d.status === "reading") return `<article class="doc">${head}</article>`;
  if (d.status === "error") return `<article class="doc err">${head}<p class="small">${esc(d.error)}</p></article>`;
  const typeSelect = `<label class="field"><span>Type</span><select data-act="type" data-id="${d.id}">
      ${(Object.keys(TYPE_LABEL) as DocType[]).map((t) => `<option value="${t}" ${t === type ? "selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}
    </select></label>`;
  const note = d.status === "needs_entry"
    ? `<p class="small hand-note">${esc(d.error || "Gemini Nano isn't available here, so this document wasn't read. Type the numbers from it.")}</p>` : "";
  const fields = (FIELD_DEFS[type] ?? []).map(([k, label, kind]) => {
    const v = (d.fields as unknown as Record<string, unknown> | undefined)?.[k];
    const flag = flags.find((f) => f.field === k);
    return `<label class="field ${flag ? "flag" : ""} ${kind === "text" && (k === "address" || k === "activity") ? "span2" : ""}">
      <span>${label}</span>
      <input data-act="field" data-id="${d.id}" data-key="${k}" data-kind="${kind}"
        type="${kind === "date" ? "date" : kind === "text" ? "text" : "number"}" ${kind === "money" || kind === "num" ? 'step="0.01"' : ""}
        value="${v === null || v === undefined ? "" : esc(v)}"></label>`;
  }).join("");
  const flagList = flags.map((f) => `<div class="flagmsg"><span>${esc(f.message)}</span>
      <button class="btn small" data-act="confirm" data-id="${d.id}" data-key="${f.field}">It's right</button></div>`).join("");
  return `<article class="doc ${flags.length ? "has-flag" : ""}">${head}${note}${flagList}<div class="fields">${typeSelect}${fields}</div></article>`;
}

function rulesBlock(t: ReturnType<typeof ledger>["totals"]) {
  const r = S.rules;
  const consent = S.consent ? `
    <div class="consent">
      <div class="consent-head"><strong>This is everything that will be sent</strong><span class="badge cloud">Cloud · Gemini · ${esc(getCloudModel())}</span></div>
      <pre>${esc(cloudPayload(t))}</pre>
      <p class="small">No names, employers, addresses, images or document text. Gemini reads only these public pages:</p>
      <ul class="src">${RULE_SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("")}</ul>
      <div class="row"><button class="btn" data-act="send-rules" ${S.rulesBusy ? "disabled" : ""}>${S.rulesBusy ? "Checking…" : "Send totals and check"}</button>
      <button class="btn ghost" data-act="cancel-consent">Cancel</button></div>
    </div>` : "";
  const result = r ? `
    <div class="rules">
      <div class="rules-head"><strong>${r.status === "meets" ? "Meets the rules as checked" : r.status === "short" ? "Short under the rules as checked" : "Rules check: some things are open"}</strong>
        ${badge(r.where)}</div>
      <p>${esc(r.summary)}</p>
      <ul class="rule-list">${r.rules.map((x) => `<li class="${x.applies ? "yes" : ""}"><strong>${esc(x.rule)}</strong> ${esc(x.detail)}
        ${x.sourceUrl ? `<a href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">source</a>` : ""}</li>`).join("")}</ul>
      ${r.startDate ? `<p class="small"><strong>Start date:</strong> ${esc(r.startDate)}</p>` : ""}
      ${r.openQuestions.length ? `<p class="small"><strong>Still open:</strong> ${r.openQuestions.map(esc).join(" · ")}</p>` : ""}
      <p class="fine">Rules last checked ${new Date(r.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}${r.sourcesRead.length ? ` · ${r.sourcesRead.length} of ${RULE_SOURCES.length} pages read` : ""}. Missouri can still change its start date.</p>
    </div>` : `<p class="muted">Missouri's rules haven't been checked on this computer yet.</p>`;
  const can = S.docs.length > 0 && S.online;
  return `${result}${consent}${!S.consent ? `<button class="btn ${r ? "ghost" : ""}" data-act="consent" ${can ? "" : "disabled"}>
      ${r ? "Check the rules again" : "Check Missouri's rules"}</button>
      ${!S.online ? `<span class="small muted"> Needs internet. Everything else works offline.</span>` : ""}` : ""}`;
}

function replyBlock(t: ReturnType<typeof ledger>["totals"], meets: boolean, flagged: number, reading: boolean) {
  const ready = meets && !flagged && !reading && S.docs.length > 0;
  const why = !S.docs.length ? "Add documents first." : reading ? "Waiting for documents." : flagged ? "Check the highlighted items first." : !meets ? "The month doesn't meet the requirement yet, so there's nothing to claim." : "";
  const letter = S.reply ? `
    <div class="reply">
      <div class="reply-head"><strong>Reply to the state's notice</strong>${badge(S.reply.where, S.reply.ms)}</div>
      <div class="fill">${PLACEHOLDERS.map((p) => `<label class="field"><span>${esc(p.slice(1, -1).toLowerCase())}</span>
        <input data-act="fill" data-key="${esc(p)}" value="${esc(S.fill[p])}" placeholder="${p === "[NOTICE DATE]" ? "e.g. March 2, 2027" : ""}"></label>`).join("")}</div>
      <p class="fine">Names you type here stay on this laptop. They're filled in after the draft is written.</p>
      <pre class="letter" id="letter">${esc(filled(S.reply.text))}</pre>
      <div class="row"><button class="btn" data-act="packet">Export reply + proof packet</button>
      <button class="btn ghost" data-act="redraft">Draft again</button></div>
    </div>` : "";
  return `<div class="reply-zone">${letter}${!S.reply ? `<button class="btn" data-act="draft" ${ready && !S.replyBusy ? "" : "disabled"}>
      ${S.replyBusy ? "Drafting…" : "Draft the reply"}</button>
      <span class="small muted">${why || (S.online ? "Runs on Gemini Nano when available, otherwise in the cloud with totals only." : "Offline: Gemini Nano drafts it on this laptop.")}</span>` : ""}</div>`;
}

const filled = (text: string) => PLACEHOLDERS.reduce((s, p) => (S.fill[p] ? s.split(p).join(S.fill[p]) : s), text);

function howItRan() {
  const blocked = blockedRequests();
  return `<details class="how" ${S.howOpen ? "open" : ""}>
    <summary>How it ran</summary>
    <div class="how-grid">
      <div><h3>Model calls</h3>${S.log.length ? `<table><tbody>${S.log.map((l) => `<tr><td>${esc(l.step)}</td><td>${badge(l.where)}</td><td class="r">${(l.ms / 1000).toFixed(1)} s</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">None yet.</p>`}</div>
      <div><h3>Routing</h3><ul class="small">
        <li><strong>Client documents:</strong> <code>ONLY_ON_DEVICE</code>, after our own <code>LanguageModel.availability()</code> check. No Nano means no reading, never the cloud.</li>
        <li><strong>Fictional samples:</strong> <code>PREFER_ON_DEVICE</code>, so they work anywhere.</li>
        <li><strong>Rules:</strong> <code>ONLY_IN_CLOUD</code> with URL context over ${RULE_SOURCES.length} public pages. Totals only.</li>
        <li><strong>Reply:</strong> <code>PREFER_ON_DEVICE</code>. Totals only, so either side is safe.</li>
        <li><strong>Leak guard:</strong> ${blocked.length} request${blocked.length === 1 ? "" : "s"} blocked this session.</li>
        <li><strong>Cloud model:</strong> ${esc(getCloudModel())} (Remote Config). App Check: reCAPTCHA Enterprise, limited-use tokens.</li>
      </ul></div>
    </div></details>`;
}

// ---------------------------------------------------------------- events
function bind() {
  const file = document.getElementById("file") as HTMLInputElement;
  file.onchange = () => { if (file.files) addFiles([...file.files]); file.value = ""; };
  const drop = document.getElementById("drop")!;
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove("over");
    addFiles([...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/")));
  };
  (document.getElementById("month") as HTMLInputElement).onchange = (e) => {
    const v = (e.target as HTMLInputElement).value;
    if (v) { S.month = v; S.reply = null; recheckAll(); render(); }
  };
  const how = document.querySelector("details.how") as HTMLDetailsElement;
  how.ontoggle = () => (S.howOpen = how.open);
}

$app.addEventListener("click", async (e) => {
  const el = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id, key = el.dataset.key!;
  const doc = S.docs.find((d) => d.id === id);
  switch (act) {
    case "samples": return loadSamples();
    case "nano": return setupNano();
    case "dismiss": S.error = ""; return render();
    case "remove":
      S.docs = S.docs.filter((d) => d.id !== id); S.reply = null; return render();
    case "confirm":
      doc?.confirmed.add(key); return render();
    case "zoom": return zoom(doc!);
    case "consent": S.consent = true; return render();
    case "cancel-consent": S.consent = false; return render();
    case "send-rules": return runRules();
    case "draft": case "redraft": return runReply();
    case "packet": return exportPacket();
  }
});

$app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const doc = S.docs.find((d) => d.id === el.dataset.id);
  if (el.dataset.act === "type" && doc) {
    doc.fields = emptyFields(el.value as DocType);
    doc.flags = checkFields(doc.fields, S.month);
    doc.confirmed.clear();
    S.reply = null;
    return render();
  }
  if (el.dataset.act === "field" && doc?.fields) {
    const kind = el.dataset.kind, key = el.dataset.key!;
    const raw = el.value.trim();
    (doc.fields as unknown as Record<string, unknown>)[key] =
      raw === "" ? null : kind === "num" || kind === "money" ? Number(raw) : raw;
    doc.confirmed.add(key); // the assister typed it, so it's confirmed
    doc.flags = checkFields(doc.fields, S.month);
    S.reply = null;
    return render();
  }
});

$app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.act === "fill") {
    S.fill[el.dataset.key!] = el.value;
    const letter = document.getElementById("letter");
    if (letter && S.reply) letter.textContent = filled(S.reply.text);
  }
});

addEventListener("online", () => { S.online = true; render(); });
addEventListener("offline", () => { S.online = false; S.consent = false; render(); });

// ---------------------------------------------------------------- actions
function recheckAll() {
  for (const d of S.docs) if (d.fields) d.flags = checkFields(d.fields, S.month);
}

function addFiles(files: File[], sample = false) {
  for (const f of files) {
    const d: Doc = {
      id: uid(), name: f.name, imageUrl: URL.createObjectURL(f), sample,
      status: "reading", flags: [], confirmed: new Set(),
    };
    S.docs.push(d);
    S.blobs.set(d.id, f);
  }
  S.reply = null;
  render();
  pump();
}

let pumping = false;
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const d = S.docs.find((x) => x.status === "reading");
      if (!d) break;
      try {
        const r = await readDocument(S.blobs.get(d.id)!, { sample: d.sample, month: S.month });
        Object.assign(d, { fields: r.fields, where: r.where, ms: r.ms, flags: r.flags, status: "done" });
        S.log.push({ step: `Read ${r.fields ? TYPE_LABEL[r.fields.type] : "document"}`, where: r.where, ms: r.ms, at: new Date().toISOString() });
      } catch (err) {
        if (err instanceof NoNano || (d.sample && !S.online)) {
          Object.assign(d, { status: "needs_entry", where: "hand_entry", fields: emptyFields("pay_stub"), flags: [] });
          d.error = d.sample && !S.online ? "Offline and Gemini Nano isn't available, so this sample wasn't read. Type the numbers, or reconnect." : "";
          d.flags = checkFields(d.fields!, S.month);
        } else if (err instanceof LeakBlocked) {
          Object.assign(d, { status: "error", error: "The leak guard blocked a request that contained this document. Nothing was sent." });
        } else {
          console.error(err);
          Object.assign(d, { status: "error", error: "Couldn't read this document. Remove it and try a clearer photo, or type the numbers." });
        }
      }
      render();
    }
  } finally {
    pumping = false;
  }
}

async function loadSamples() {
  const names = ["pay-stub-jan-1.png", "pay-stub-jan-2.png", "volunteer-letter-jan.png", "gig-summary-jan.png"];
  S.month = "2027-01";
  const files = await Promise.all(names.map(async (n) => {
    const b = await (await fetch(`/samples/dana/${n}`)).blob();
    return new File([b], n, { type: "image/png" });
  }));
  addFiles(files, true);
}

async function setupNano() {
  S.nano = "downloading"; S.nanoProgress = 0; render();
  try {
    await warmUpNano((p) => { S.nanoProgress = p; render(); });
  } catch (err) {
    console.error(err);
    S.error = "Gemini Nano couldn't be set up in this browser. Hand entry still works.";
  }
  S.nanoProgress = null;
  S.nano = await nanoState();
  render();
}

async function runRules() {
  const { totals } = ledger(S.docs, S.month);
  S.rulesBusy = true; render();
  const t0 = performance.now();
  try {
    const r = await checkRules(totals);
    S.rules = r; saveRules(r);
    S.log.push({ step: "Check Missouri rules", where: r.where, ms: Math.round(performance.now() - t0), at: r.checkedAt });
    S.consent = false;
  } catch (err) {
    console.error(err);
    S.error = err instanceof LeakBlocked ? "The leak guard blocked the rule check. Nothing was sent." : (err as Error).message;
  }
  S.rulesBusy = false; render();
}

async function runReply() {
  const { totals } = ledger(S.docs, S.month);
  S.replyBusy = true; S.reply = null; render();
  try {
    const types = [...new Set(S.docs.filter((d) => d.fields).map((d) => TYPE_LABEL[d.fields!.type].toLowerCase()))];
    const counts = types.map((t) => `${S.docs.filter((d) => d.fields && TYPE_LABEL[d.fields.type].toLowerCase() === t).length} ${t}${S.docs.filter((d) => d.fields && TYPE_LABEL[d.fields.type].toLowerCase() === t).length > 1 ? "s" : ""}`);
    S.reply = await draftReply(totals, S.rules, counts);
    S.log.push({ step: "Draft the reply", where: S.reply.where, ms: S.reply.ms, at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    S.error = !S.online && S.nano !== "available"
      ? "Offline without Gemini Nano, so the reply can't be drafted here. Reconnect to draft it in the cloud from totals."
      : "The reply couldn't be drafted. Try again.";
  }
  S.replyBusy = false; render();
}

function zoom(d: Doc) {
  const dlg = document.createElement("dialog");
  dlg.className = "zoom";
  dlg.innerHTML = `<img src="${d.imageUrl}" alt="${esc(d.name)}"><form method="dialog"><button class="btn">Close</button></form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.showModal();
}

const ORDER: DocType[] = ["pay_stub", "gig_summary", "volunteer_letter", "school_record", "other"];

function exportPacket() {
  const { lines, totals } = ledger(S.docs, S.month);
  const docs = [...S.docs].filter((d) => d.fields).sort((a, b) => ORDER.indexOf(a.fields!.type) - ORDER.indexOf(b.fields!.type));
  const p = document.getElementById("print")!;
  p.innerHTML = `
    <section class="pp"><pre class="letter">${esc(filled(S.reply?.text ?? ""))}</pre></section>
    <section class="pp"><h1>Proof summary · ${esc(monthName(S.month))}</h1>
      <p>Total hours: <strong>${hrs(totals.totalHours)}</strong> (work ${hrs(totals.workHours)}, volunteering ${hrs(totals.volunteerHours)}).
      Monthly pay: <strong>${money(totals.income)}</strong>, including ${money(totals.gigIncome)} from gig apps.</p>
      <p>Requirement: ${RULE.hoursPerMonth} hours a month, or pay of at least ${money(RULE.incomeRoute)} (${RULE.hoursPerMonth} × $${RULE.federalMinWage}).
      Result: ${totals.meetsHours ? "meets through hours" : totals.meetsIncome ? "meets through the income route" : "does not meet"}.</p>
      <table class="ledger"><thead><tr><th>Document</th><th>Counted</th><th>Hours</th><th>Pay</th></tr></thead><tbody>
      ${lines.map((l, i) => `<tr><td>${i + 1}. ${esc(l.label)}</td><td>${l.share >= 0.999 ? "All" : Math.round(l.share * 100) + "%"}</td><td>${l.hours ? hrs(l.hours) : "–"}</td><td>${l.income ? money(l.income) : "–"}</td></tr>`).join("")}
      </tbody></table>
      ${S.rules ? `<p class="fine">Rules checked ${new Date(S.rules.checkedAt).toLocaleDateString("en-US", { dateStyle: "medium" })} against: ${RULE_SOURCES.map((s) => esc(s.url)).join(" · ")}</p>` : ""}
    </section>
    ${docs.map((d, i) => `<section class="pp doc-page"><h2>${i + 1}. ${TYPE_LABEL[d.fields!.type]}</h2><img src="${d.imageUrl}" alt=""></section>`).join("")}`;
  const imgs = [...p.querySelectorAll("img")];
  Promise.all(imgs.map((im) => (im.complete ? 0 : new Promise((r) => (im.onload = r))))).then(() => window.print());
}

// ---------------------------------------------------------------- start
render();
(async () => {
  S.nano = await nanoState();
  render();
  await loadRemoteConfig();
  render();
})();
