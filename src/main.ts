import "@uswds/uswds/css/uswds.min.css";
import "./styles.css";
import sprite from "@uswds/uswds/img/sprite.svg?url";
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

/** A USWDS icon from the package's own sprite. */
const icon = (name: string, cls = "") =>
  `<svg class="usa-icon ${cls}" aria-hidden="true" focusable="false" role="img"><use href="${sprite}#${name}"></use></svg>`;

function badge(where?: Where, ms?: number, sample?: boolean) {
  if (!where) return "";
  const t = ms ? ` · ${(ms / 1000).toFixed(1)} s` : "";
  if (where === "on_device") return `<span class="usa-tag hp-tag--device">On device · Gemini Nano${t}</span>`;
  if (where === "in_cloud") return `<span class="usa-tag hp-tag--cloud">Cloud · Gemini${sample ? " · fictional sample" : ""}${t}</span>`;
  return `<span class="usa-tag hp-tag--hand">Typed by hand</span>`;
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
  const docsDone = S.docs.length > 0 && !reading && flagged === 0;
  const freshRules = !!S.rules && S.rules.forPayload === cloudPayload(totals);

  $app.innerHTML = `
  <a class="usa-skipnav" href="#main">Skip to main content</a>
  ${anySample ? `<div class="hp-demo"><div class="grid-container">Fictional client and documents, made up for this demo.</div></div>` : ""}
  <header class="hp-header"><div class="grid-container hp-header__inner">
    <div class="usa-logo hp-logo"><em class="usa-logo__text">Hours Proof</em><span class="hp-logo__sub">for Medicaid enrollment assisters</span></div>
    <ul class="usa-list usa-list--unstyled hp-status">
      <li class="${S.online ? "" : "is-off"}">${icon("wifi")}${S.online ? "Online" : "Offline"}</li>
      <li class="${S.nano === "available" ? "" : "is-warn"}">${icon(S.nano === "available" ? "check_circle" : "info")}${nanoLabel()}</li>
    </ul>
  </div></header>

  <main id="main" class="grid-container hp-main">
    ${nanoBanner()}
    ${S.error ? `<div class="usa-alert usa-alert--error usa-alert--slim" role="alert"><div class="usa-alert__body"><p class="usa-alert__text">${esc(S.error)} <button data-act="dismiss" class="usa-button usa-button--unstyled">Dismiss</button></p></div></div>` : ""}
    ${steps([
      ["Documents", docsDone],
      ["Totals", docsDone && meets],
      ["Rules", freshRules],
      ["Reply", !!S.reply],
    ])}
    <div class="hp-title">
      <h1>${esc(monthName(S.month))}</h1>
      <div><label class="usa-label" for="month">Month the state asked about</label>
      <input class="usa-input" type="month" id="month" value="${S.month}"></div>
    </div>

    <div class="grid-row grid-gap-lg">
      <section class="desktop:grid-col-7 hp-col" aria-labelledby="h-docs">
        <h2 class="hp-h2" id="h-docs">Documents</h2>
        <p class="hp-lead">Pay stubs, gig app summaries, volunteer letters and school records. They're read on this laptop and never uploaded.</p>
        <label class="hp-drop" id="drop">
          <input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/heic" multiple hidden>
          ${icon("file_upload", "usa-icon--size-4")}<span>Drag photos of the documents here or <span class="hp-choose">choose from a folder</span></span>
        </label>
        ${S.docs.length === 0 ? `<button class="usa-button usa-button--outline hp-samples" data-act="samples">Try it with Dana's fictional documents</button>` : ""}
        ${S.docs.length ? `<div class="hp-docs">${S.docs.map(docRow).join("")}</div>` : ""}
      </section>

      <section class="desktop:grid-col-5 hp-col" aria-labelledby="h-totals">
        <h2 class="hp-h2" id="h-totals">Totals</h2>
        <div class="usa-summary-box hp-totals" role="region" aria-label="Totals for ${esc(monthName(S.month))}"><div class="usa-summary-box__body">
          ${meter("Hours of work, school or volunteering", totals.totalHours, RULE.hoursPerMonth, `${hrs(totals.totalHours)} of ${RULE.hoursPerMonth}`)}
          ${meter("Pay", totals.income, RULE.incomeRoute, `${money(totals.income)} of ${`$${RULE.incomeRoute}`}`)}
          ${S.docs.length ? verdict(totals, flagged, reading) : `<p class="hp-verdict">Add documents to see the month.</p>`}
          <p class="hp-note">${`$${RULE.incomeRoute}`} is ${RULE.hoursPerMonth} hours at the $${RULE.federalMinWage} federal minimum wage.</p>
        </div></div>
        ${lines.length ? `
        <table class="usa-table usa-table--borderless usa-table--compact hp-ledger">
          <caption class="usa-sr-only">What counts toward ${esc(monthName(S.month))}</caption>
          <thead><tr><th scope="col">Source</th><th scope="col">Counted</th><th scope="col" class="r">Hours</th><th scope="col" class="r">Pay</th></tr></thead>
          <tbody>${lines.map((l) => `
            <tr><td>${esc(l.label)}${l.note ? `<div class="hp-sub">${esc(l.note)}</div>` : ""}</td>
            <td>${l.share >= 0.999 ? "All" : l.share === 0 ? "Other month" : Math.round(l.share * 100) + "%"}</td>
            <td class="r">${l.hours ? hrs(l.hours) : "–"}</td><td class="r">${l.income ? money(l.income) : "–"}</td></tr>`).join("")}
          </tbody>
          <tfoot><tr><td colspan="2">Total</td><td class="r">${hrs(totals.totalHours)}</td><td class="r">${money(totals.income)}</td></tr></tfoot>
        </table>
        <p class="hp-hint">The math is plain code. No model adds up hours or pay. A pay period that crosses months counts by the share of its days inside ${esc(monthName(S.month))}.</p>` : ""}

        <h2 class="hp-h2">Missouri's rules</h2>
        ${rulesBlock(totals)}

        <h2 class="hp-h2">Reply to the state</h2>
        ${replyBlock(totals, meets, flagged, reading)}
      </section>
    </div>

    ${howItRan()}
  </main>
  <footer class="hp-footer"><div class="grid-container">Every example here is fictional. Hours Proof helps an assister prepare proof. It isn't legal advice, and the state makes the decision.</div></footer>
  <div id="print"></div>`;
  bind();
}

/** USWDS step indicator with counters. The current step is the first one not yet complete. */
function steps(raw: [label: string, done: boolean][]) {
  // A step only counts as done when every step before it is done.
  const list = raw.map(([l, d], i) => [l, d && raw.slice(0, i).every(([, p]) => p)] as [string, boolean]);
  let cur = list.findIndex(([, done]) => !done);
  if (cur === -1) cur = list.length - 1;
  const allDone = list.every(([, d]) => d);
  return `<div class="usa-step-indicator usa-step-indicator--counters-sm" aria-label="Progress">
    <ol class="usa-step-indicator__segments">${list.map(([label, done], i) => {
      const state = done && !(allDone && i === cur) ? "complete" : i === cur ? "current" : "";
      return `<li class="usa-step-indicator__segment ${state ? `usa-step-indicator__segment--${state}` : ""}" ${state === "current" ? 'aria-current="true"' : ""}>
        <span class="usa-step-indicator__segment-label">${label}${state === "complete" ? ' <span class="usa-sr-only">completed</span>' : state ? "" : ' <span class="usa-sr-only">not completed</span>'}</span></li>`;
    }).join("")}</ol>
  </div>`;
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
    return `<div class="usa-alert usa-alert--info"><div class="usa-alert__body">
      <h2 class="usa-alert__heading">Set up on-device reading</h2>
      <p class="usa-alert__text">Chrome downloads Gemini Nano once. After that, documents are read with no network at all.</p>
      ${S.nano === "downloading" && S.nanoProgress !== null
        ? `<progress max="1" value="${S.nanoProgress}"></progress>`
        : `<button class="usa-button" data-act="nano">Set up Gemini Nano</button>`}
    </div></div>`;
  }
  if (S.nano === "no-api" || S.nano === "unavailable") {
    return `<div class="usa-alert usa-alert--warning"><div class="usa-alert__body">
      <h2 class="usa-alert__heading">${SIMULATE_NO_NANO ? "Simulating a browser without Gemini Nano" : "This browser can't run Gemini Nano"}</h2>
      <p class="usa-alert__text">Client documents are never sent to the cloud instead. You type their numbers in, and everything else still works.
      The fictional samples can be read in the cloud so you can see the flow. Desktop Chrome runs it on device.</p>
    </div></div>`;
  }
  return "";
}

function meter(label: string, value: number, goal: number, text: string) {
  const pct = Math.min(100, (value / goal) * 100);
  return `<div class="hp-meter ${value >= goal ? "is-met" : ""}">
    <div class="hp-meter__top"><span>${esc(label)}</span><strong>${esc(text)}</strong></div>
    <div class="hp-meter__bar"><i style="width:${pct}%"></i></div></div>`;
}

function verdict(t: ReturnType<typeof ledger>["totals"], flagged: number, reading: boolean) {
  if (reading) return `<p class="hp-verdict">Reading documents…</p>`;
  if (flagged) return `<p class="hp-verdict">${icon("flag")}${flagged} item${flagged > 1 ? "s" : ""} to check before the month is final.</p>`;
  if (t.meetsHours) return `<p class="hp-verdict">Meets the requirement with ${hrs(t.totalHours)} hours${t.schoolHalfTime ? " (school, at least half-time)" : ""}.</p>`;
  if (t.meetsIncome) return `<p class="hp-verdict">${hrs(t.totalHours)} hours is short of 80, but ${money(t.income)} of pay meets the ${`$${RULE.incomeRoute}`} income route.</p>`;
  return `<p class="hp-verdict">Short by ${hrs(RULE.hoursPerMonth - t.totalHours)} hours or ${money(RULE.incomeRoute - t.income)} of pay for ${esc(monthName(t.month))}.</p>`;
}

function docRow(d: Doc) {
  const type = d.fields?.type ?? "other";
  const flags = openFlags(d);
  const head = `<div class="hp-doc__head">
      <img src="${d.imageUrl}" alt="Photo of ${esc(d.name)}" class="hp-doc__thumb" data-act="zoom" data-id="${d.id}">
      <div class="hp-doc__title">
        <h3>${d.fields ? TYPE_LABEL[type] : esc(d.name)}</h3>
        <p class="hp-doc__file">${esc(d.name)}${d.sample ? " · fictional" : ""}</p>
        ${d.status === "reading" ? `<span class="usa-tag hp-tag--busy">${d.sample || S.nano === "available" ? "Reading…" : "Waiting"}</span>` : badge(d.where, d.ms, d.sample)}
      </div>
      <button class="usa-button usa-button--unstyled hp-doc__remove" data-act="remove" data-id="${d.id}" aria-label="Remove ${esc(d.name)}">${icon("close")}Remove</button>
    </div>`;
  if (d.status === "reading") return `<article class="hp-doc">${head}</article>`;
  if (d.status === "error") return `<article class="hp-doc">${head}<div class="usa-alert usa-alert--error usa-alert--slim"><div class="usa-alert__body"><p class="usa-alert__text">${esc(d.error)}</p></div></div></article>`;
  const typeSelect = `<div class="usa-form-group"><label class="usa-label" for="${d.id}-type">Type</label>
    <select class="usa-select" id="${d.id}-type" data-act="type" data-id="${d.id}">
      ${(Object.keys(TYPE_LABEL) as DocType[]).map((t) => `<option value="${t}" ${t === type ? "selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}
    </select></div>`;
  const note = d.status === "needs_entry"
    ? `<div class="usa-alert usa-alert--info usa-alert--slim"><div class="usa-alert__body"><p class="usa-alert__text">${esc(d.error || "Gemini Nano isn't available here, so this document wasn't read. Type the numbers from it.")}</p></div></div>` : "";
  const fields = (FIELD_DEFS[type] ?? []).map(([k, label, kind]) => {
    const v = (d.fields as unknown as Record<string, unknown> | undefined)?.[k];
    const flag = flags.find((f) => f.field === k);
    return `<div class="usa-form-group ${flag ? "is-flagged" : ""} ${kind === "text" && (k === "address" || k === "activity") ? "span2" : ""}">
      <label class="usa-label" for="${d.id}-${k}">${label}</label>
      <input class="usa-input" id="${d.id}-${k}" data-act="field" data-id="${d.id}" data-key="${k}" data-kind="${kind}"
        type="${kind === "date" ? "date" : kind === "text" ? "text" : "number"}" ${kind === "money" || kind === "num" ? 'step="0.01"' : ""}
        value="${v === null || v === undefined ? "" : esc(v)}"></div>`;
  }).join("");
  const flagList = flags.map((f) => `<div class="hp-flag"><p>${icon("flag")}${esc(f.message)}</p>
      <button class="usa-button usa-button--outline" data-act="confirm" data-id="${d.id}" data-key="${f.field}">It's right</button></div>`).join("");
  return `<article class="hp-doc ${flags.length ? "is-flagged" : ""}">${head}${note}${flagList}<div class="hp-fields">${typeSelect}${fields}</div></article>`;
}

function rulesBlock(t: ReturnType<typeof ledger>["totals"]) {
  const r = S.rules;
  const stale = !!r && r.forPayload !== cloudPayload(t);
  const consent = S.consent ? `
    <div class="hp-panel">
      <div class="hp-panel__head"><h3>This is everything that will be sent</h3><span class="usa-tag hp-tag--cloud">Cloud · ${esc(getCloudModel())}</span></div>
      <pre class="hp-pre">${esc(cloudPayload(t))}</pre>
      <p>No names, employers, addresses, images or document text. Gemini reads only these public pages:</p>
      <ul class="usa-list">${RULE_SOURCES.map((s) => `<li><a class="usa-link usa-link--external" href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("")}</ul>
      <div class="hp-actions"><button class="usa-button" data-act="send-rules" ${S.rulesBusy ? "disabled" : ""}>${S.rulesBusy ? "Checking…" : "Send totals and check"}</button>
      <button class="usa-button usa-button--unstyled" data-act="cancel-consent">Cancel</button></div>
    </div>` : "";
  const result = r ? `
    <div class="hp-panel">
      <div class="hp-panel__head"><h3>${stale ? "Rules checked for different totals" : r.status === "meets" ? "Meets the rules as checked" : r.status === "short" ? "Short under the rules as checked" : "Some things are still open"}</h3>
        ${badge(r.where)}</div>
      <p>${stale ? "The totals have changed since this check. The rules below still apply. Check again for a result on these totals." : esc(r.summary)}</p>
      <ul class="usa-list usa-list--unstyled hp-rules">${r.rules.map((x) => `<li>${x.applies && !stale ? icon("check") : `<span class="hp-dot"></span>`}<span><strong>${esc(x.rule.replace(/\.+$/, ""))}.</strong> ${esc(x.detail)}
        ${x.sourceUrl ? `<a class="usa-link usa-link--external" href="${esc(x.sourceUrl)}" target="_blank" rel="noopener">Source</a>` : ""}</span></li>`).join("")}</ul>
      ${r.startDate ? `<p><strong>Start date.</strong> ${esc(r.startDate)}</p>` : ""}
      ${r.openQuestions.length && !stale ? `<p><strong>Still open.</strong> ${r.openQuestions.map(esc).join(" ")}</p>` : ""}
      <p class="hp-hint">Checked ${new Date(r.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}${r.sourcesRead.length ? `, ${r.sourcesRead.length} of ${RULE_SOURCES.length} pages read` : ""}. Missouri can still change its start date.</p>
    </div>` : S.consent ? "" : `<p>Missouri's rules haven't been checked on this computer yet.</p>`;
  const can = S.docs.length > 0 && S.online;
  return `${result}${consent}${!S.consent ? `<div class="hp-actions"><button class="usa-button ${r ? "usa-button--outline" : ""}" data-act="consent" ${can ? "" : "disabled"}>
      ${r ? "Check the rules again" : "Check Missouri's rules"}</button>
      ${!S.online ? `<span class="hp-hint">Needs internet. Everything else works offline.</span>` : ""}</div>` : ""}`;
}

function replyBlock(t: ReturnType<typeof ledger>["totals"], meets: boolean, flagged: number, reading: boolean) {
  void t;
  const ready = meets && !flagged && !reading && S.docs.length > 0;
  const why = !S.docs.length ? "Add documents first." : reading ? "Waiting for documents." : flagged ? "Check the flagged items first." : !meets ? "The month doesn't meet the requirement yet, so there's nothing to claim." : "";
  if (S.reply) return `
    <div class="hp-panel">
      <div class="hp-panel__head">${badge(S.reply.where, S.reply.ms)}</div>
      <div class="hp-fill">${PLACEHOLDERS.map((p, i) => `<div><label class="usa-label" for="fill-${i}">${esc(p.slice(1, -1).charAt(0) + p.slice(2, -1).toLowerCase())}</label>
        <input class="usa-input" id="fill-${i}" data-act="fill" data-key="${esc(p)}" value="${esc(S.fill[p])}" placeholder="${p === "[NOTICE DATE]" ? "March 2, 2027" : ""}"></div>`).join("")}</div>
      <p class="hp-hint">Names typed here stay on this laptop. They're filled in after the draft is written.</p>
      <pre class="hp-letter" id="letter">${esc(filled(S.reply.text))}</pre>
      <div class="hp-actions"><button class="usa-button" data-act="packet">${icon("print")} Export reply and proof</button>
      <button class="usa-button usa-button--outline" data-act="redraft">Draft again</button></div>
    </div>`;
  return `<div class="hp-actions"><button class="usa-button" data-act="draft" ${ready && !S.replyBusy ? "" : "disabled"}>${S.replyBusy ? "Drafting…" : "Draft the reply"}</button></div>
    <p class="hp-hint">${why || (S.online ? "Runs on Gemini Nano when it's available, otherwise in the cloud from totals only." : "Offline, so Gemini Nano drafts it on this laptop.")}</p>`;
}

const filled = (text: string) => PLACEHOLDERS.reduce((s, p) => (S.fill[p] ? s.split(p).join(S.fill[p]) : s), text);

function howItRan() {
  const blocked = blockedRequests();
  return `<details class="hp-how" ${S.howOpen ? "open" : ""}>
    <summary>How it ran</summary>
    <div class="hp-how__body">
      <div><h3>Model calls</h3>${S.log.length ? `<table class="usa-table usa-table--borderless usa-table--compact"><tbody>${S.log.map((l) => `<tr><td>${esc(l.step)}</td><td>${badge(l.where)}</td><td>${(l.ms / 1000).toFixed(1)} s</td></tr>`).join("")}</tbody></table>` : `<p class="hp-hint">None yet.</p>`}</div>
      <div><h3>Routing</h3><ul class="usa-list">
        <li>Client documents use <code>ONLY_ON_DEVICE</code>, after our own <code>LanguageModel.availability()</code> check. No Nano means no reading, never the cloud.</li>
        <li>Fictional samples use <code>PREFER_ON_DEVICE</code>, so they work anywhere.</li>
        <li>The rules check uses <code>ONLY_IN_CLOUD</code> with URL context over ${RULE_SOURCES.length} public pages, and sends totals only.</li>
        <li>The reply uses <code>PREFER_ON_DEVICE</code>. It's written from totals, so either side is safe.</li>
        <li>The leak guard blocked ${blocked.length} request${blocked.length === 1 ? "" : "s"} this session.</li>
        <li>Cloud model ${esc(getCloudModel())}, set in Remote Config. App Check uses reCAPTCHA Enterprise with limited-use tokens.</li>
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
  const how = document.querySelector("details.hp-how") as HTMLDetailsElement;
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
  const names = ["pay-stub-jan-1.png", "pay-stub-jan-2.png", "pay-stub-dec.png", "volunteer-letter-jan.png", "gig-summary-jan.png"];
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
    const fresh = S.rules && S.rules.forPayload === cloudPayload(totals) ? S.rules : null;
    S.reply = await draftReply(totals, fresh, counts);
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
  dlg.className = "hp-zoom";
  dlg.innerHTML = `<img src="${d.imageUrl}" alt="${esc(d.name)}"><form method="dialog"><button class="usa-button">Close</button></form>`;
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
    <section class="pp"><pre class="hp-letter">${esc(filled(S.reply?.text ?? ""))}</pre></section>
    <section class="pp"><h1>Proof summary · ${esc(monthName(S.month))}</h1>
      <p>Total hours: <strong>${hrs(totals.totalHours)}</strong> (work ${hrs(totals.workHours)}, volunteering ${hrs(totals.volunteerHours)}).
      Monthly pay: <strong>${money(totals.income)}</strong>, including ${money(totals.gigIncome)} from gig apps.</p>
      <p>Requirement: ${RULE.hoursPerMonth} hours a month, or pay of at least ${`$${RULE.incomeRoute}`} (${RULE.hoursPerMonth} × $${RULE.federalMinWage}).
      Result: ${totals.meetsHours ? "meets through hours" : totals.meetsIncome ? "meets through the income route" : "does not meet"}.</p>
      <table><thead><tr><th>Document</th><th>Counted</th><th>Hours</th><th>Pay</th></tr></thead><tbody>
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
