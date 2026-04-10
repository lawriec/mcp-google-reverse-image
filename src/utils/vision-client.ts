import type { VisionImage } from "./image-source.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

function getTimeoutMs(): number {
  const envVal = process.env.VISION_TIMEOUT_MS;
  return envVal && Number.isFinite(Number(envVal))
    ? Math.max(1000, Number(envVal))
    : DEFAULT_TIMEOUT_MS;
}

// --- Response types matching the WebDetection schema ---

export interface WebEntity {
  entityId?: string;
  score?: number;
  description?: string;
}

export interface WebImage {
  url: string;
  score?: number;
}

export interface WebPage {
  url: string;
  pageTitle?: string;
  score?: number;
  fullMatchingImages?: WebImage[];
  partialMatchingImages?: WebImage[];
}

export interface WebLabel {
  label: string;
  languageCode?: string;
}

export interface WebDetection {
  webEntities?: WebEntity[];
  fullMatchingImages?: WebImage[];
  partialMatchingImages?: WebImage[];
  pagesWithMatchingImages?: WebPage[];
  visuallySimilarImages?: WebImage[];
  bestGuessLabels?: WebLabel[];
}

interface AnnotateResponse {
  responses?: Array<{
    webDetection?: WebDetection;
    error?: { code?: number; message?: string; status?: string };
  }>;
}

interface VisionErrorBody {
  error?: { code?: number; message?: string; status?: string };
}

// --- Request ---

export async function visionWebDetection(args: {
  imageSource: VisionImage;
  apiKey: string;
  maxResults: number;
}): Promise<WebDetection> {
  const body = {
    requests: [
      {
        image: args.imageSource,
        features: [{ type: "WEB_DETECTION", maxResults: args.maxResults }],
      },
    ],
  };

  const url = `${VISION_ENDPOINT}?key=${encodeURIComponent(args.apiKey)}`;
  const timeoutMs = getTimeoutMs();

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    await throwForStatus(response);
  }

  let data: AnnotateResponse;
  try {
    data = (await response.json()) as AnnotateResponse;
  } catch {
    throw new Error("Google Vision returned invalid JSON.");
  }

  const first = data.responses?.[0];
  if (!first) {
    throw new Error("Google Vision returned an empty response body.");
  }

  if (first.error && (first.error.code ?? 0) !== 0) {
    const msg = first.error.message ?? "unknown error";
    throw new Error(`Google Vision error: ${msg}`);
  }

  return first.webDetection ?? {};
}

// --- Fetch with single retry on 5xx / network / timeout ---

async function fetchWithRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  try {
    const res = await fetch(url, init);
    if (res.status >= 500 && res.status < 600) {
      await sleep(500);
      return await fetch(url, { ...init, signal: freshSignal(init.signal) });
    }
    return res;
  } catch (error) {
    if (isTransientError(error)) {
      await sleep(500);
      try {
        return await fetch(url, { ...init, signal: freshSignal(init.signal) });
      } catch (retryError) {
        throwForNetworkError(retryError);
      }
    }
    throwForNetworkError(error);
  }
}

function freshSignal(original: AbortSignal | null | undefined): AbortSignal {
  // On retry, reuse the original deadline-bearing signal if not yet aborted;
  // otherwise give the retry its own short deadline.
  if (original && !original.aborted) return original;
  return AbortSignal.timeout(getTimeoutMs());
}

function isTransientError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  if (
    error instanceof TypeError &&
    (error.message.includes("fetch failed") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ECONNRESET") ||
      error.message.includes("ETIMEDOUT"))
  )
    return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwForNetworkError(error: unknown): never {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    throw new Error(
      `Google Vision request timed out after ${getTimeoutMs() / 1000}s.`
    );
  }
  if (
    error instanceof TypeError &&
    (error.message.includes("fetch failed") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ECONNRESET") ||
      error.message.includes("ETIMEDOUT"))
  ) {
    throw new Error(
      "Cannot reach Google Vision API. Check your internet connection."
    );
  }
  throw error instanceof Error ? error : new Error(String(error));
}

async function throwForStatus(response: Response): Promise<never> {
  const rawBody = await response.text().catch(() => "");
  let parsed: VisionErrorBody | undefined;
  try {
    parsed = JSON.parse(rawBody) as VisionErrorBody;
  } catch {
    parsed = undefined;
  }
  const apiMessage = parsed?.error?.message ?? "";
  const status = response.status;

  if (status === 400) {
    throw new Error(
      `Google Vision rejected the request (HTTP 400): ${
        apiMessage || rawBody.slice(0, 500) || "bad request"
      }`
    );
  }

  if (status === 401 || status === 403) {
    const quotaIndicators = ["quota", "exceeded", "billing", "limit"];
    const isQuota = quotaIndicators.some((k) =>
      apiMessage.toLowerCase().includes(k)
    );
    if (isQuota) {
      throw new Error(
        "Google Vision quota exceeded. Free tier is 1000 Web Detection calls/month. " +
          "Either wait until next billing cycle or enable billing on your GCP project. " +
          `(API message: ${apiMessage})`
      );
    }
    throw new Error(
      `Google Vision rejected the API key (HTTP ${status}). ` +
        "Verify GOOGLE_VISION_API_KEY is correct, that the Cloud Vision API is enabled on your GCP project, " +
        "and that the key has no HTTP-referrer restrictions (stdio servers send no referrer). " +
        `(API message: ${apiMessage || "none"})`
    );
  }

  if (status === 413) {
    throw new Error(
      "Image payload too large for Vision API (HTTP 413). Resize below ~7 MB."
    );
  }

  if (status === 429) {
    throw new Error(
      "Rate limited by Google Vision (HTTP 429). Wait a few seconds and retry."
    );
  }

  throw new Error(
    `Google Vision returned HTTP ${status}: ${
      apiMessage || rawBody.slice(0, 500) || "unknown error"
    }`
  );
}
