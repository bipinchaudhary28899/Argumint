import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────
// axios.create() is called at module-load time inside api.ts, so we capture
// the interceptor callbacks via the mock so we can invoke them in tests.
const mock = vi.hoisted(() => ({
  post:              vi.fn(),
  get:               vi.fn(),
  put:               vi.fn(),
  reqInterceptor:    null as null | ((cfg: any) => any),
  resInterceptor:    null as null | ((res: any) => any),
  resErrInterceptor: null as null | ((err: any) => Promise<any>),
}));

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      post: (...args: any[]) => mock.post(...args),
      get:  (...args: any[]) => mock.get(...args),
      put:  (...args: any[]) => mock.put(...args),
      interceptors: {
        request: {
          use: (fn: any) => { mock.reqInterceptor = fn; },
        },
        response: {
          use: (ok: any, err: any) => {
            mock.resInterceptor    = ok;
            mock.resErrInterceptor = err;
          },
        },
      },
    })),
  },
  AxiosError: class AxiosError extends Error {
    response: any; config: any; code: any;
    constructor(msg = "") { super(msg); }
  },
}));

import { authApi, roomApi, platformApi, historyApi, debateApi } from "../api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeAxiosErr = (data?: any, status = 400, url = "/rooms/thing") => ({
  response:  data !== undefined ? { data, status } : undefined,
  config:    { url },
  message:   "Request failed",
  isAxiosError: true,
});

const hrefSpy = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(window, "location", {
    value:        { ...window.location, set href(v: string) { hrefSpy(v); } },
    writable:     true,
    configurable: true,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Request interceptor", () => {
  it("attaches Authorization header when token exists in localStorage", () => {
    localStorage.setItem("token", "my-jwt");
    const cfg: any = { headers: {} };
    mock.reqInterceptor!(cfg);
    expect(cfg.headers.Authorization).toBe("Bearer my-jwt");
  });

  it("does NOT add Authorization when no token in localStorage", () => {
    const cfg: any = { headers: {} };
    mock.reqInterceptor!(cfg);
    expect(cfg.headers.Authorization).toBeUndefined();
  });

  it("returns the config object", () => {
    const cfg: any = { headers: {} };
    const result = mock.reqInterceptor!(cfg);
    expect(result).toBe(cfg);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Response success interceptor", () => {
  it("saves token to localStorage when response body contains token", () => {
    const res = { data: { token: "server-token", user: {} } };
    mock.resInterceptor!(res);
    expect(localStorage.getItem("token")).toBe("server-token");
  });

  it("does not touch localStorage when response has no token", () => {
    localStorage.setItem("token", "old-token");
    const res = { data: { user: {} } };
    mock.resInterceptor!(res);
    expect(localStorage.getItem("token")).toBe("old-token");
  });

  it("returns the response", () => {
    const res = { data: {} };
    const result = mock.resInterceptor!(res);
    expect(result).toBe(res);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Response error interceptor", () => {
  it("clears localStorage and redirects on 401 non-auth endpoint with token", async () => {
    localStorage.setItem("token", "tok");
    localStorage.setItem("argumint_user", JSON.stringify({ id: "1" }));
    const err = makeAxiosErr({ error: "Unauthorized" }, 401, "/rooms/abc");
    // Interceptor returns a never-resolving promise — we don't await it
    mock.resErrInterceptor!(err);
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("argumint_user")).toBeNull();
    expect(hrefSpy).toHaveBeenCalledWith("/login?reason=session_expired");
  });

  it("does NOT redirect on 401 for /auth/ endpoints", async () => {
    localStorage.setItem("token", "tok");
    const err = makeAxiosErr({ error: "Unauthorized" }, 401, "/auth/login");
    await expect(mock.resErrInterceptor!(err)).rejects.toBeDefined();
    expect(hrefSpy).not.toHaveBeenCalled();
  });

  it("does NOT redirect on 401 when no session exists", async () => {
    const err = makeAxiosErr({ error: "Unauthorized" }, 401, "/rooms/abc");
    await expect(mock.resErrInterceptor!(err)).rejects.toBeDefined();
    expect(hrefSpy).not.toHaveBeenCalled();
  });

  it("rejects on non-401 errors", async () => {
    const err = makeAxiosErr({ error: "Not Found" }, 404, "/rooms/abc");
    await expect(mock.resErrInterceptor!(err)).rejects.toBeDefined();
  });

  it("detects session via argumint_user even if token is gone", async () => {
    localStorage.setItem("argumint_user", JSON.stringify({ id: "1" }));
    // no token in localStorage
    const err = makeAxiosErr({ error: "Unauthorized" }, 401, "/rooms/abc");
    mock.resErrInterceptor!(err);
    expect(hrefSpy).toHaveBeenCalledWith("/login?reason=session_expired");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("handleError (error wrapping)", () => {
  it("wraps AxiosError with server message field", async () => {
    mock.post.mockRejectedValue(makeAxiosErr({ message: "Email taken", error: "Conflict" }));
    await expect(authApi.register({} as any)).rejects.toThrow("Email taken");
  });

  it("falls back to server error field when message is absent", async () => {
    mock.post.mockRejectedValue(makeAxiosErr({ error: "Bad Request" }));
    await expect(authApi.register({} as any)).rejects.toThrow("Bad Request");
  });

  it("uses fallback text when neither message nor error present", async () => {
    mock.post.mockRejectedValue(makeAxiosErr({}));
    await expect(authApi.register({} as any)).rejects.toThrow("An error occurred");
  });

  it("rethrows network errors (no response) as-is", async () => {
    const netErr = { message: "Network Error", code: "ERR_NETWORK" };
    mock.post.mockRejectedValue(netErr);
    await expect(authApi.register({} as any)).rejects.toBe(netErr);
  });

  it("attaches .response to wrapped error", async () => {
    const fakeRes = { data: { message: "Oops" }, status: 400 };
    mock.post.mockRejectedValue({ response: fakeRes, config: { url: "/x" } });
    await expect(authApi.register({} as any)).rejects.toMatchObject({ response: fakeRes });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("authApi", () => {
  it("register — calls POST /auth/register and returns response.data", async () => {
    const payload = { username: "alice", email: "a@b.com", password: "P@ss1", confirmPassword: "P@ss1" };
    const userData = { user: { id: "1" }, token: "tok" };
    mock.post.mockResolvedValue({ data: userData });
    const result = await authApi.register(payload as any);
    expect(mock.post).toHaveBeenCalledWith("/auth/register", payload);
    expect(result).toEqual(userData);
  });

  it("login — calls POST /auth/login and returns response.data", async () => {
    const payload = { email: "a@b.com", password: "pw" };
    const userData = { user: { id: "1" }, token: "tok" };
    mock.post.mockResolvedValue({ data: userData });
    const result = await authApi.login(payload);
    expect(mock.post).toHaveBeenCalledWith("/auth/login", payload);
    expect(result).toEqual(userData);
  });

  it("logout — calls POST /auth/logout", async () => {
    mock.post.mockResolvedValue({ data: {} });
    await authApi.logout();
    expect(mock.post).toHaveBeenCalledWith("/auth/logout");
  });

  it("getMe — calls GET /auth/me and returns response.data", async () => {
    const userData = { user: { id: "1" } };
    mock.get.mockResolvedValue({ data: userData });
    const result = await authApi.getMe();
    expect(mock.get).toHaveBeenCalledWith("/auth/me");
    expect(result).toEqual(userData);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("roomApi", () => {
  it("createRoom — calls POST /rooms/create", async () => {
    const room = { _id: "r1", code: "ABCD1" };
    mock.post.mockResolvedValue({ data: room });
    const result = await roomApi.createRoom({ topic: "AI" } as any);
    expect(mock.post).toHaveBeenCalledWith("/rooms/create", { topic: "AI" });
    expect(result).toEqual(room);
  });

  it("getRoomByCode — calls GET /rooms/:code", async () => {
    const room = { _id: "r1", code: "ABCD1" };
    mock.get.mockResolvedValue({ data: room });
    const result = await roomApi.getRoomByCode("ABCD1");
    expect(mock.get).toHaveBeenCalledWith("/rooms/ABCD1");
    expect(result).toEqual(room);
  });

  it("joinRoom — calls POST /rooms/join", async () => {
    const room = { _id: "r1" };
    mock.post.mockResolvedValue({ data: room });
    await roomApi.joinRoom({ code: "ABCD1", role: "debater" } as any);
    expect(mock.post).toHaveBeenCalledWith("/rooms/join", { code: "ABCD1", role: "debater" });
  });

  it("updateRoomSettings — calls PUT /rooms/:id/settings", async () => {
    const room = { _id: "r1" };
    mock.put.mockResolvedValue({ data: room });
    await roomApi.updateRoomSettings("r1", { topic: "Updated" } as any);
    expect(mock.put).toHaveBeenCalledWith("/rooms/r1/settings", { topic: "Updated" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("platformApi", () => {
  it("getStats — returns stats data", async () => {
    mock.get.mockResolvedValue({ data: { activeRooms: 5, liveDebates: 2, totalDebates: 100 } });
    const result = await platformApi.getStats();
    expect(result.activeRooms).toBe(5);
  });

  it("getStats — returns zeros on error", async () => {
    mock.get.mockRejectedValue(new Error("fail"));
    const result = await platformApi.getStats();
    expect(result).toEqual({ activeRooms: 0, liveDebates: 0, totalDebates: 0 });
  });

  it("getLeaderboard — returns data", async () => {
    const board = [{ id: "1", username: "alice", xp: 100, debatesWon: 3, totalDebates: 5 }];
    mock.get.mockResolvedValue({ data: board });
    const result = await platformApi.getLeaderboard();
    expect(result).toEqual(board);
  });

  it("getLeaderboard — returns empty array on error", async () => {
    mock.get.mockRejectedValue(new Error("fail"));
    const result = await platformApi.getLeaderboard();
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("historyApi", () => {
  it("getHistory — returns array of entries", async () => {
    const entries = [{ id: "d1", roomCode: "ABCD1", topic: "AI" }];
    mock.get.mockResolvedValue({ data: entries });
    const result = await historyApi.getHistory();
    expect(result).toEqual(entries);
  });

  it("getHistory — returns empty array on error", async () => {
    mock.get.mockRejectedValue(new Error("fail"));
    const result = await historyApi.getHistory();
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("debateApi", () => {
  it("transcribe — calls POST /debates/:id/transcribe with FormData", async () => {
    mock.post.mockResolvedValue({ data: { text: "hello world" } });
    const blob = new Blob(["audio"], { type: "audio/webm" });
    const result = await debateApi.transcribe("debate-1", blob);
    expect(mock.post).toHaveBeenCalledWith(
      "/debates/debate-1/transcribe",
      expect.any(FormData),
      expect.objectContaining({ headers: { "Content-Type": "multipart/form-data" } }),
    );
    expect(result).toBe("hello world");
  });

  it("transcribe — uses speech.ogg filename for audio/ogg blobs", async () => {
    mock.post.mockResolvedValue({ data: { text: "ogg" } });
    const blob = new Blob(["audio"], { type: "audio/ogg" });
    await debateApi.transcribe("debate-1", blob);
    const formData: FormData = mock.post.mock.calls[0][1];
    const file = formData.get("audio") as File;
    expect(file.name).toBe("speech.ogg");
  });

  it("transcribe — throws wrapped error on failure", async () => {
    mock.post.mockRejectedValue(makeAxiosErr({ message: "Transcription failed" }));
    await expect(debateApi.transcribe("d1", new Blob())).rejects.toThrow("Transcription failed");
  });
});
