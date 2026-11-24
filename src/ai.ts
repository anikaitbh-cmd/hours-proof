import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { fetchAndActivate, getRemoteConfig, getValue } from "firebase/remote-config";
import {
  getAI, getGenerativeModel, GoogleAIBackend, InferenceMode,
  type GenerativeModel, type Part,
} from "firebase/ai";
import { DEFAULT_CLOUD_MODEL, RECAPTCHA_ENTERPRISE_SITE_KEY, firebaseConfig } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined;
}

// `?no-nano` hides Gemini Nano from the page, to show what a browser without it gets.
export const SIMULATE_NO_NANO = new URLSearchParams(location.search).has("no-nano");
if (SIMULATE_NO_NANO) {
  try { Object.defineProperty(globalThis, "LanguageModel", { value: undefined, configurable: true }); } catch { /* ignore */ }
}

export const app = initializeApp(firebaseConfig);

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  // Local development only. The token is registered in the console, never committed.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string) || true;
}
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});

// Limited-use tokens enable App Check replay protection on every cloud call.
export const ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });

// ---------------------------------------------------------------- Remote Config
let cloudModel = DEFAULT_CLOUD_MODEL;
export async function loadRemoteConfig() {
  try {
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = 3_600_000;
    rc.defaultConfig = { cloud_model: DEFAULT_CLOUD_MODEL };
    await fetchAndActivate(rc);
    cloudModel = getValue(rc, "cloud_model").asString() || DEFAULT_CLOUD_MODEL;
  } catch {
    cloudModel = DEFAULT_CLOUD_MODEL; // offline: keep the default
  }
  return cloudModel;
}
export const getCloudModel = () => cloudModel;

// ---------------------------------------------------------------- Gemini Nano status
// The options passed to availability() must match the ones the session is created with.
export const DEVICE_CREATE_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
} as const;

export type NanoState = "no-api" | "unavailable" | "downloadable" | "downloading" | "available";

/**
 * Our own check, run before every document call. The SDK sends ONLY_ON_DEVICE requests to
 * the cloud when the LanguageModel global is missing (firebase-js-sdk issue #10635), so we
 * never rely on the mode alone.
 */
export async function nanoState(): Promise<NanoState> {
  const LM = (globalThis as { LanguageModel?: { availability(o: unknown): Promise<string> } }).LanguageModel;
  if (!LM) return "no-api";
  try {
    return (await LM.availability(DEVICE_CREATE_OPTIONS)) as NanoState;
  } catch {
    return "unavailable";
  }
}

// ---------------------------------------------------------------- models
type Json = Record<string, unknown>;

function hybrid(mode: InferenceMode, system: string, schema?: Json, tools?: unknown[]): GenerativeModel {
  return getGenerativeModel(ai, {
    mode,
    onDeviceParams: {
      createOptions: {
        ...DEVICE_CREATE_OPTIONS,
        initialPrompts: [{ role: "system", content: system }],
      } as never,
      promptOptions: schema ? { responseConstraint: schema } : undefined,
    },
    inCloudParams: {
      model: cloudModel,
      systemInstruction: system,
      generationConfig: schema ? { responseMimeType: "application/json", responseJsonSchema: schema } : undefined,
      tools: tools as never,
    },
  });
}

/** Real client documents: on device or not at all. */
export const deviceOnly = (system: string, schema: Json) => hybrid(InferenceMode.ONLY_ON_DEVICE, system, schema);
/** Fictional samples and totals-only steps: Nano when present, cloud otherwise. */
export const preferDevice = (system: string, schema?: Json) => hybrid(InferenceMode.PREFER_ON_DEVICE, system, schema);
/** Public rule pages: cloud only, with URL context. */
export const cloudWithUrls = (system: string) =>
  hybrid(InferenceMode.ONLY_IN_CLOUD, system, undefined, [{ urlContext: {} }]);

/** Download or warm up Nano. Must run from a click. */
export async function warmUpNano(onProgress: (p: number) => void) {
  await preferDevice("You read documents.").initializeDeviceModel(onProgress);
}

export async function imagePart(blob: Blob): Promise<{ part: Part; base64: string }> {
  const png = await toPngOrJpeg(blob);
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(png);
  });
  return { part: { type: "inlineData", inlineData: { mimeType: png.type, data: base64 } }, base64 };
}

/** On-device image input accepts JPEG and PNG only. Convert anything else (HEIC, WebP) via canvas. */
async function toPngOrJpeg(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png" || blob.type === "image/jpeg") return blob;
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}
