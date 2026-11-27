import { API_URL } from "./constants";
import type { APIResponse } from "@/types/api";

export class HttpError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  authMode: "session" | "bearer";
  constructor(
    message: string,
    status: number,
    errors?: Record<string, string[]>,
    authMode: "session" | "bearer" = "session",
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.authMode = authMode;
  }
}

// `.`/`..` path segments, plain or percent-encoded, with `/` or `\` separators
// (the URL parser normalizes all of them).
const DOT_SEGMENT = /(^|[/\\])(\.|%2e){1,2}([/\\]|$)/i;

export function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<APIResponse<T>> {
  return requestJSON(path, init, false) as Promise<APIResponse<T>>;
}

// Relay proxy endpoints return configuration directly, without an APIResponse envelope.
export function apiFetchJSON<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestJSON(path, init, true) as Promise<T>;
}

async function requestJSON(path: string, init: RequestInit, requireJSON: boolean): Promise<unknown> {
  // Callers (e.g. useCustom) often pass `${API_URL}/...`; with a relative
  // API_URL ("/api/v1") that must not be prefixed a second time.
  const url = path.startsWith("http") || path.startsWith(`${API_URL}/`)
    ? path
    : `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;

  // IDs from routes/localStorage are interpolated raw into paths; refuse dot
  // segments so a crafted id can't retarget the request to another endpoint.
  if (DOT_SEGMENT.test(url.split(/[?#]/, 1)[0])) {
    throw new HttpError("Invalid request path", 400);
  }

  // Spread init first so caller headers merge with (not replace) the defaults.
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  let body: unknown = null;
  let parsed = false;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
      parsed = true;
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const error = body as APIResponse | null;
    throw new HttpError(
      error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      error?.errors,
      new Headers(init.headers).get("Authorization")?.startsWith("Bearer ") ? "bearer" : "session",
    );
  }

  if (requireJSON && !parsed) throw new HttpError("Response is not valid JSON", res.status);
  return requireJSON ? body : body ?? {};
}
