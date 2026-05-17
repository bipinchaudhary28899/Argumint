import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockGetMe, mockRegisterApi, mockLoginApi, mockLogoutApi } = vi.hoisted(() => ({
  mockGetMe:       vi.fn(),
  mockRegisterApi: vi.fn(),
  mockLoginApi:    vi.fn(),
  mockLogoutApi:   vi.fn(),
}));

vi.mock("../../services/api", () => ({
  authApi: {
    getMe:    (...args: any[]) => mockGetMe(...args),
    register: (...args: any[]) => mockRegisterApi(...args),
    login:    (...args: any[]) => mockLoginApi(...args),
    logout:   (...args: any[]) => mockLogoutApi(...args),
  },
}));

import { AuthProvider, useAuth } from "../AuthContext";

const FAKE_USER = { id: "user-1", username: "alice", email: "alice@example.com" } as any;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: /auth/me succeeds
    mockGetMe.mockResolvedValue({ user: FAKE_USER });
    mockRegisterApi.mockResolvedValue({ user: FAKE_USER });
    mockLoginApi.mockResolvedValue({ user: FAKE_USER });
    mockLogoutApi.mockResolvedValue(undefined);
  });

  // ── useAuth outside provider ───────────────────────────────────────────────
  it("throws when useAuth is called outside AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider"
    );
  });

  // ── Initial state ──────────────────────────────────────────────────────────
  it("starts with isLoading = true (before checkAuth resolves)", async () => {
    mockGetMe.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it("seeds user from localStorage cache on init", async () => {
    localStorage.setItem("argumint_user", JSON.stringify(FAKE_USER));
    // getMe resolves immediately to confirm cache
    const { result } = renderHook(() => useAuth(), { wrapper });
    // Cached user is available synchronously before getMe resolves
    expect(result.current.user).toEqual(FAKE_USER);
  });

  it("starts with null user when localStorage has no cached user", async () => {
    mockGetMe.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.user).toBeNull();
  });

  // ── checkAuth ─────────────────────────────────────────────────────────────
  it("checkAuth calls authApi.getMe", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetMe).toHaveBeenCalled();
  });

  it("checkAuth sets user and isLoading=false on success", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(FAKE_USER);
  });

  it("checkAuth caches user to localStorage on success", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const cached = JSON.parse(localStorage.getItem("argumint_user")!);
    expect(cached).toEqual(FAKE_USER);
  });

  it("checkAuth keeps cached user on network error", async () => {
    localStorage.setItem("argumint_user", JSON.stringify(FAKE_USER));
    mockGetMe.mockRejectedValue({ message: "Network Error", code: "ERR_NETWORK" });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // User should still be set from the cache — not cleared
    expect(result.current.user).toEqual(FAKE_USER);
  });

  it("checkAuth clears user on 401 auth failure", async () => {
    localStorage.setItem("argumint_user", JSON.stringify(FAKE_USER));
    mockGetMe.mockRejectedValue({ response: { status: 401 } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  // ── register ───────────────────────────────────────────────────────────────
  describe("register", () => {
    it("calls authApi.register with provided data", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const data = { username: "alice", email: "alice@example.com", password: "Password1", confirmPassword: "Password1" } as any;
      await act(async () => { await result.current.register(data); });

      expect(mockRegisterApi).toHaveBeenCalledWith(data);
    });

    it("sets user after successful register", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.register({ username: "alice", email: "alice@example.com", password: "Password1", confirmPassword: "Password1" } as any);
      });

      expect(result.current.user).toEqual(FAKE_USER);
    });

    it("throws and sets error on register failure", async () => {
      mockRegisterApi.mockRejectedValue(new Error("Username taken"));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await expect(result.current.register({} as any)).rejects.toThrow("Username taken");
      });

      expect(result.current.error).toBe("Username taken");
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────
  describe("login", () => {
    it("calls authApi.login with provided data", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const data = { email: "alice@example.com", password: "Password1" };
      await act(async () => { await result.current.login(data); });

      expect(mockLoginApi).toHaveBeenCalledWith(data);
    });

    it("sets user after successful login", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login({ email: "alice@example.com", password: "Password1" });
      });

      expect(result.current.user).toEqual(FAKE_USER);
    });

    it("throws and sets error on login failure", async () => {
      mockLoginApi.mockRejectedValue(new Error("Invalid credentials"));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await expect(
          result.current.login({ email: "alice@example.com", password: "wrong" })
        ).rejects.toThrow("Invalid credentials");
      });

      expect(result.current.error).toBe("Invalid credentials");
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────
  describe("logout", () => {
    it("calls authApi.logout", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(async () => { await result.current.logout(); });
      expect(mockLogoutApi).toHaveBeenCalled();
    });

    it("clears user after logout", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      // User is set from getMe
      expect(result.current.user).toEqual(FAKE_USER);

      await act(async () => { await result.current.logout(); });
      expect(result.current.user).toBeNull();
    });

    it("clears cached user from localStorage after logout", async () => {
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(async () => { await result.current.logout(); });
      expect(localStorage.getItem("argumint_user")).toBeNull();
    });

    it("throws and sets error on logout failure", async () => {
      mockLogoutApi.mockRejectedValue(new Error("Logout failed"));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await expect(result.current.logout()).rejects.toThrow("Logout failed");
      });

      expect(result.current.error).toBe("Logout failed");
    });
  });
});
