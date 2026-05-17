import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockNavigate, mockCheckAuth, mockCreateSubscription, mockVerifyPayment, mockCancelSubscription } =
  vi.hoisted(() => ({
    mockNavigate:           vi.fn(),
    mockCheckAuth:          vi.fn(),
    mockCreateSubscription: vi.fn(),
    mockVerifyPayment:      vi.fn(),
    mockCancelSubscription: vi.fn(),
  }));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

let mockUser: any = null;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, checkAuth: mockCheckAuth }),
}));

vi.mock("../paymentsApi", () => ({
  paymentsApi: {
    createSubscription: (...args: any[]) => mockCreateSubscription(...args),
    verifyPayment:      (...args: any[]) => mockVerifyPayment(...args),
    cancelSubscription: (...args: any[]) => mockCancelSubscription(...args),
  },
}));

import { useSubscription } from "../useSubscription";

// ── Helpers ───────────────────────────────────────────────────────────────────

let mockRzpOpen: ReturnType<typeof vi.fn>;
let mockRzpConfig: any;

function setupRazorpay() {
  mockRzpOpen = vi.fn();
  // Must use a regular function (not an arrow function) because openCheckout
  // calls `new Razorpay(config)`. vi.fn() skips arrow-function implementations
  // when called as a constructor, so we need `function` to capture the config.
  (window as any).Razorpay = vi.fn(function (config: any) {
    mockRzpConfig = config;
    return { open: mockRzpOpen };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = null;
  mockRzpConfig = undefined;
  delete (window as any).Razorpay;
  mockCheckAuth.mockResolvedValue(undefined);
  mockCreateSubscription.mockResolvedValue({ subscriptionId: "sub_123", keyId: "rzp_test_key" });
  mockVerifyPayment.mockResolvedValue(undefined);
  mockCancelSubscription.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("derived state from user", () => {
  it("isPro is false when user is null", () => {
    const { result } = renderHook(() => useSubscription());
    expect(result.current.isPro).toBe(false);
  });

  it("isPro is false for free user", () => {
    mockUser = { isPro: false, subscriptionStatus: null };
    const { result } = renderHook(() => useSubscription());
    expect(result.current.isPro).toBe(false);
  });

  it("isPro is true for Pro user", () => {
    mockUser = { isPro: true, subscriptionStatus: "active" };
    const { result } = renderHook(() => useSubscription());
    expect(result.current.isPro).toBe(true);
  });

  it("status reflects user.subscriptionStatus", () => {
    mockUser = { isPro: true, subscriptionStatus: "active" };
    const { result } = renderHook(() => useSubscription());
    expect(result.current.status).toBe("active");
  });

  it("status is null when user has no subscriptionStatus", () => {
    mockUser = { isPro: false };
    const { result } = renderHook(() => useSubscription());
    expect(result.current.status).toBeNull();
  });

  it("currentPeriodEnd is a Date when user has the field", () => {
    mockUser = { isPro: true, currentPeriodEnd: "2025-12-31T00:00:00Z" };
    const { result } = renderHook(() => useSubscription());
    expect(result.current.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it("currentPeriodEnd is null when user has no field", () => {
    mockUser = { isPro: false };
    const { result } = renderHook(() => useSubscription());
    expect(result.current.currentPeriodEnd).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("initial loading state", () => {
  it("isLoading starts as false", () => {
    const { result } = renderHook(() => useSubscription());
    expect(result.current.isLoading).toBe(false);
  });

  it("error starts as null", () => {
    const { result } = renderHook(() => useSubscription());
    expect(result.current.error).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("cancelSubscription", () => {
  it("calls paymentsApi.cancelSubscription", async () => {
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.cancelSubscription(); });
    expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
  });

  it("calls checkAuth after cancel to refresh user", async () => {
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.cancelSubscription(); });
    expect(mockCheckAuth).toHaveBeenCalledTimes(1);
  });

  it("isLoading is false after successful cancel", async () => {
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.cancelSubscription(); });
    expect(result.current.isLoading).toBe(false);
  });

  it("sets error and clears isLoading on cancel failure", async () => {
    mockCancelSubscription.mockRejectedValue(new Error("Cancel failed"));
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.cancelSubscription(); });
    expect(result.current.error).toBe("Cancel failed");
    expect(result.current.isLoading).toBe(false);
  });

  it("uses err.response.data.error if present", async () => {
    mockCancelSubscription.mockRejectedValue({
      response: { data: { error: "Subscription not found" } },
    });
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.cancelSubscription(); });
    expect(result.current.error).toBe("Subscription not found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("openCheckout", () => {
  it("calls paymentsApi.createSubscription", async () => {
    setupRazorpay();
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.openCheckout(); });
    expect(mockCreateSubscription).toHaveBeenCalledTimes(1);
  });

  it("opens Razorpay with returned subscriptionId and keyId", async () => {
    setupRazorpay();
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.openCheckout(); });
    expect(mockRzpOpen).toHaveBeenCalledTimes(1);
    expect((window as any).Razorpay).toHaveBeenCalledWith(
      expect.objectContaining({
        key:             "rzp_test_key",
        subscription_id: "sub_123",
      }),
    );
  });

  it("sets error and clears isLoading when createSubscription fails", async () => {
    mockCreateSubscription.mockRejectedValue(new Error("Backend error"));
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.openCheckout(); });
    expect(result.current.error).toBe("Backend error");
    expect(result.current.isLoading).toBe(false);
  });

  it("clears isLoading when user dismisses Razorpay modal", async () => {
    setupRazorpay();
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.openCheckout(); });
    // Simulate modal dismiss
    act(() => { mockRzpConfig.modal.ondismiss(); });
    expect(result.current.isLoading).toBe(false);
  });

  it("on payment success: calls verifyPayment, checkAuth, and navigates", async () => {
    setupRazorpay();
    mockUser = { username: "alice", email: "a@b.com" };
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.openCheckout(); });

    // Simulate successful Razorpay payment callback
    await act(async () => {
      await mockRzpConfig.handler({
        razorpay_payment_id:      "pay_123",
        razorpay_subscription_id: "sub_123",
        razorpay_signature:       "sig_abc",
      });
    });

    expect(mockVerifyPayment).toHaveBeenCalledWith("pay_123", "sub_123", "sig_abc");
    expect(mockCheckAuth).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/subscription/success");
  });

  it("sets error when verifyPayment fails", async () => {
    setupRazorpay();
    mockVerifyPayment.mockRejectedValue(new Error("Signature mismatch"));
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.openCheckout(); });

    await act(async () => {
      await mockRzpConfig.handler({
        razorpay_payment_id:      "pay_x",
        razorpay_subscription_id: "sub_x",
        razorpay_signature:       "sig_x",
      });
    });

    expect(result.current.error).toBe("Signature mismatch");
  });

  it("prefills user name and email in Razorpay config", async () => {
    setupRazorpay();
    mockUser = { username: "bob", email: "bob@test.com" };
    const { result } = renderHook(() => useSubscription());
    await act(async () => { await result.current.openCheckout(); });
    expect((window as any).Razorpay).toHaveBeenCalledWith(
      expect.objectContaining({
        prefill: { name: "bob", email: "bob@test.com" },
      }),
    );
  });
});
