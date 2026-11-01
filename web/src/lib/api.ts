const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? "5000";

/**
 * Resolves the API base URL.
 *
 * By default the API is assumed to be on the same host the page was served from,
 * just on a different port. That makes the app work unchanged whether it's opened
 * at localhost or at a LAN address from a phone — hardcoding either one would
 * break the other, since "localhost" on a phone means the phone itself.
 *
 * NEXT_PUBLIC_API_URL overrides this outright when the API lives elsewhere.
 */
function resolveBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  // During SSR there is no window; requests are client-side, so this is only a
  // placeholder for the server render pass.
  if (typeof window === "undefined") return `http://localhost:${API_PORT}`;

  return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
}

const BASE = resolveBase();

const TOKEN_KEY = "crm.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  /**
   * The rest of the error body, when the endpoint sent one.
   *
   * Some refusals are lists rather than sentences — publishing a workflow with
   * three unconfigured steps should name all three, not just say no. Collapsing
   * the body to `message` threw that away and left the UI with nothing specific
   * to show.
   */
  detail?: Record<string, unknown>;

  constructor(status: number, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  // Multipart uploads set their own Content-Type boundary, so we must not.
  formData?: FormData;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData } = options;

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  // A 401 from the login call means the credentials were wrong, not that a
  // session lapsed — let it fall through so the server's own message shows.
  const isLoginAttempt = path === "/auth/login";

  if (res.status === 401 && !isLoginAttempt) {
    // The token is missing, expired, or its account is gone. Drop it and bounce
    // to login rather than letting every subsequent call fail silently.
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
let message = `Request failed (${res.status})`;
    let detail: Record<string, unknown> | undefined;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
      if (data && typeof data === "object") detail = data as Record<string, unknown>;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(res.status, message, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiBase = BASE;
