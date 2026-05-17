import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Module mocks ─────────────────────────────────────────────────────────────
const mockRegister = vi.fn();
const mockLogin    = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ register: mockRegister, login: mockLogin }),
}));

import { useAuthForm } from "../useAuthForm";

describe("useAuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue(undefined);
    mockLogin.mockResolvedValue(undefined);
  });

  // ── Initial state ──────────────────────────────────────────────────────────
  it("starts with isSubmitting = false", () => {
    const { result } = renderHook(() => useAuthForm());
    expect(result.current.isSubmitting).toBe(false);
  });

  it("starts with empty errors object", () => {
    const { result } = renderHook(() => useAuthForm());
    expect(result.current.errors).toEqual({});
  });

  it("exposes handleRegister, handleLogin, setErrors functions", () => {
    const { result } = renderHook(() => useAuthForm());
    expect(typeof result.current.handleRegister).toBe("function");
    expect(typeof result.current.handleLogin).toBe("function");
    expect(typeof result.current.setErrors).toBe("function");
  });

  // ── handleRegister ─────────────────────────────────────────────────────────
  describe("handleRegister", () => {
    const registerData = { username: "alice", email: "alice@example.com", password: "Password1", confirmPassword: "Password1" };

    it("calls register() with provided data", async () => {
      const { result } = renderHook(() => useAuthForm());
      await act(async () => {
        await result.current.handleRegister(registerData);
      });
      expect(mockRegister).toHaveBeenCalledWith(registerData);
    });

    it("returns true on successful register", async () => {
      const { result } = renderHook(() => useAuthForm());
      let returnVal: boolean | undefined;
      await act(async () => {
        returnVal = await result.current.handleRegister(registerData);
      });
      expect(returnVal).toBe(true);
    });

    it("sets isSubmitting = true while registering", async () => {
      let resolveRegister: () => void;
      mockRegister.mockReturnValue(new Promise<void>(res => { resolveRegister = res; }));
      const { result } = renderHook(() => useAuthForm());

      act(() => { result.current.handleRegister(registerData); });
      expect(result.current.isSubmitting).toBe(true);

      await act(async () => { resolveRegister!(); });
      expect(result.current.isSubmitting).toBe(false);
    });

    it("resets errors to {} before registering", async () => {
      const { result } = renderHook(() => useAuthForm());
      // Pre-set an error
      act(() => { result.current.setErrors({ submit: "Old error" }); });
      await act(async () => { await result.current.handleRegister(registerData); });
      expect(result.current.errors).toEqual({});
    });

    it("returns false and sets errors.submit on register failure", async () => {
      mockRegister.mockRejectedValue(new Error("Username taken"));
      const { result } = renderHook(() => useAuthForm());
      let returnVal: boolean | undefined;
      await act(async () => {
        returnVal = await result.current.handleRegister(registerData);
      });
      expect(returnVal).toBe(false);
      expect(result.current.errors.submit).toBe("Username taken");
    });

    it("sets errors.submit to 'Registration failed' for non-Error throws", async () => {
      mockRegister.mockRejectedValue("string error");
      const { result } = renderHook(() => useAuthForm());
      await act(async () => { await result.current.handleRegister(registerData); });
      expect(result.current.errors.submit).toBe("Registration failed");
    });

    it("resets isSubmitting to false after failure", async () => {
      mockRegister.mockRejectedValue(new Error("Fail"));
      const { result } = renderHook(() => useAuthForm());
      await act(async () => { await result.current.handleRegister(registerData); });
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  // ── handleLogin ────────────────────────────────────────────────────────────
  describe("handleLogin", () => {
    const loginData = { email: "alice@example.com", password: "Password1" };

    it("calls login() with provided data", async () => {
      const { result } = renderHook(() => useAuthForm());
      await act(async () => { await result.current.handleLogin(loginData); });
      expect(mockLogin).toHaveBeenCalledWith(loginData);
    });

    it("returns true on successful login", async () => {
      const { result } = renderHook(() => useAuthForm());
      let returnVal: boolean | undefined;
      await act(async () => { returnVal = await result.current.handleLogin(loginData); });
      expect(returnVal).toBe(true);
    });

    it("sets isSubmitting = true while logging in", async () => {
      let resolveLogin: () => void;
      mockLogin.mockReturnValue(new Promise<void>(res => { resolveLogin = res; }));
      const { result } = renderHook(() => useAuthForm());

      act(() => { result.current.handleLogin(loginData); });
      expect(result.current.isSubmitting).toBe(true);

      await act(async () => { resolveLogin!(); });
      expect(result.current.isSubmitting).toBe(false);
    });

    it("returns false and sets errors.submit on login failure", async () => {
      mockLogin.mockRejectedValue(new Error("Invalid credentials"));
      const { result } = renderHook(() => useAuthForm());
      let returnVal: boolean | undefined;
      await act(async () => { returnVal = await result.current.handleLogin(loginData); });
      expect(returnVal).toBe(false);
      expect(result.current.errors.submit).toBe("Invalid credentials");
    });

    it("sets errors.submit to 'Login failed' for non-Error throws", async () => {
      mockLogin.mockRejectedValue(42);
      const { result } = renderHook(() => useAuthForm());
      await act(async () => { await result.current.handleLogin(loginData); });
      expect(result.current.errors.submit).toBe("Login failed");
    });
  });

  // ── setErrors ─────────────────────────────────────────────────────────────
  it("setErrors updates the errors state", () => {
    const { result } = renderHook(() => useAuthForm());
    act(() => { result.current.setErrors({ email: "bad email" }); });
    expect(result.current.errors.email).toBe("bad email");
  });
});
