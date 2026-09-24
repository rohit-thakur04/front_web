// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, setToken } from "./api";

function mockResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  // Stubbed globals are not undone by restoreAllMocks, and a leaked window stub
  // breaks every test that follows.
  vi.unstubAllGlobals();
  vi.resetModules();
  window.localStorage.clear();
});

describe("API base URL", () => {
  // Regression guard: the API host must follow whatever address the page was
  // opened at. Hardcoding one host breaks the other — pinning it to a LAN IP
  // made the app unreachable at localhost, and pinning it to localhost makes it
  // unreachable from a phone, where "localhost" is the phone itself.
  async function baseFor(hostname: string, protocol = "http:") {
    vi.resetModules();
    vi.stubGlobal("window", {
      location: { hostname, protocol },
      localStorage: window.localStorage,
    });
    const mod = await import("./api");
    return mod.apiBase;
  }

  it("uses the page's own hostname when opened at localhost", async () => {
    expect(await baseFor("localhost")).toBe("http://localhost:5000");
  });

  it("uses the LAN address when opened from a phone", async () => {
    expect(await baseFor("192.168.1.66")).toBe("http://192.168.1.66:5000");
  });

  it("preserves the page's protocol", async () => {
    expect(await baseFor("example.com", "https:")).toBe("https://example.com:5000");
  });
});

describe("api 401 handling", () => {
  it("surfaces the server's message when login credentials are rejected", async () => {
    // A 401 from /auth/login means bad credentials, NOT a lapsed session. It
    // must not be rewritten into "your session has expired".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(401, { message: "Invalid email or password" })),
    );

    await expect(
      api("/auth/login", { method: "POST", body: { email: "a@b.com", password: "wrong" } }),
    ).rejects.toThrowError("Invalid email or password");
  });

  it("does not clear an existing token because a login attempt failed", async () => {
    setToken("existing-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(401, { message: "Invalid email or password" })),
    );

    await expect(api("/auth/login", { method: "POST", body: {} })).rejects.toThrow();
    expect(window.localStorage.getItem("crm.token")).toBe("existing-token");
  });

  it("treats a 401 on any other route as a lapsed session and drops the token", async () => {
    setToken("stale-token");
    vi.stubGlobal("fetch", vi.fn(async () => mockResponse(401, { message: "Unauthorized" })));

    await expect(api("/pipelines")).rejects.toThrowError(/session has expired/i);
    expect(window.localStorage.getItem("crm.token")).toBeNull();
  });

  it("passes through other error messages verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockResponse(409, { message: "An account with that email already exists" })),
    );

    await expect(api("/auth/users", { method: "POST", body: {} })).rejects.toThrowError(
      "An account with that email already exists",
    );
  });

  it("reports the status on an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockResponse(404, { message: "Not found" })));

    const err: unknown = await api("/pipelines/abc").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });
});
