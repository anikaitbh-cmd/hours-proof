// Leak guard. Every string read from a real client document, and a fingerprint of every
// real document image, is registered here. Any outbound request whose body contains one
// of them is blocked before it leaves the browser. Fictional samples are not registered.

const secrets = new Set<string>();
const blocked: { url: string; at: string }[] = [];

/** Register a value read from a real document (names, employers, addresses, dates as text). */
export function registerText(value: unknown) {
  if (typeof value !== "string") return;
  const v = value.trim();
  if (v.length >= 4) secrets.add(v.toLowerCase());
}

/** Register a real document image by base64 fingerprints taken from several places in it. */
export function registerImage(base64: string) {
  const n = base64.length;
  if (n < 400) return;
  for (const at of [0.25, 0.5, 0.75]) {
    const i = Math.floor(n * at);
    secrets.add(base64.slice(i, i + 120).toLowerCase());
  }
}

export function findLeak(body: string): string | null {
  const b = body.toLowerCase();
  for (const s of secrets) if (b.includes(s)) return s;
  return null;
}

export class LeakBlocked extends Error {
  constructor(public url: string) {
    super("Blocked: this request contained text from a client document.");
  }
}

export function blockedRequests() {
  return [...blocked];
}

export function resetGuard() {
  secrets.clear();
  blocked.length = 0;
}

async function bodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  const body = init?.body;
  if (typeof body === "string") return body;
  if (body instanceof Blob) return await body.text();
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body as ArrayBuffer);
  }
  if (input instanceof Request) {
    try { return await input.clone().text(); } catch { return ""; }
  }
  return "";
}

/** Wrap fetch so every request leaving the page is checked. Same-origin requests are allowed. */
export function installGuard(target: { fetch: typeof fetch } = globalThis) {
  const original = target.fetch.bind(target);
  target.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const sameOrigin = typeof location !== "undefined" && url.startsWith(location.origin);
    if (!sameOrigin && secrets.size) {
      const text = await bodyText(input, init);
      if (findLeak(text)) {
        blocked.push({ url, at: new Date().toISOString() });
        throw new LeakBlocked(url);
      }
    }
    return original(input, init);
  };
}
