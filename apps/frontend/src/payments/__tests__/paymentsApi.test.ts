import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ────────────────────────────────────────────────────────
const mock = vi.hoisted(() => ({
  post: vi.fn(),
  get:  vi.fn(),
  reqInterceptor: null as null | ((cfg: any) => any),
}));

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => ({
      post: (...args: any[]) => mock.post(...args),
      get:  (...args: any[]) => mock.get(...args),
      interceptors: {
        request: {
          use: (fn: any) => { mock.reqInterceptor = fn; },
        },
      },
    })),
  },
}));

import { paymentsApi } from "../paymentsApi";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("request interceptor", () => {
  it("attaches Authorization header from localStorage token", () => {
    localStorage.setItem("token", "pay-token");
    const cfg: any = { headers: {} };
    mock.reqInterceptor!(cfg);
    expect(cfg.headers.Authorization).toBe("Bearer pay-token");
  });

  it("does not add Authorization when no token", () => {
    const cfg: any = { headers: {} };
    mock.reqInterceptor!(cfg);
    expect(cfg.headers.Authorization).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("paymentsApi.createSubscription", () => {
  it("POSTs to /payments/create-subscription and returns subscriptionId + keyId", async () => {
    const data = { subscriptionId: "sub_123", keyId: "rzp_test_key" };
    mock.post.mockResolvedValue({ data });
    const result = await paymentsApi.createSubscription();
    expect(mock.post).toHaveBeenCalledWith("/payments/create-subscription");
    expect(result).toEqual(data);
  });

  it("propagates errors from the backend", async () => {
    mock.post.mockRejectedValue(new Error("Subscription creation failed"));
    await expect(paymentsApi.createSubscription()).rejects.toThrow("Subscription creation failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("paymentsApi.verifyPayment", () => {
  it("POSTs to /payments/verify-payment with the right body", async () => {
    mock.post.mockResolvedValue({ data: {} });
    await paymentsApi.verifyPayment("pay_abc", "sub_123", "sig_xyz");
    expect(mock.post).toHaveBeenCalledWith("/payments/verify-payment", {
      paymentId:      "pay_abc",
      subscriptionId: "sub_123",
      signature:      "sig_xyz",
    });
  });

  it("resolves without a return value", async () => {
    mock.post.mockResolvedValue({ data: {} });
    const result = await paymentsApi.verifyPayment("a", "b", "c");
    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("paymentsApi.cancelSubscription", () => {
  it("POSTs to /payments/cancel-subscription", async () => {
    mock.post.mockResolvedValue({ data: {} });
    await paymentsApi.cancelSubscription();
    expect(mock.post).toHaveBeenCalledWith("/payments/cancel-subscription");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("paymentsApi.getSubscriptionStatus", () => {
  it("GETs /payments/subscription-status and returns the data", async () => {
    const status = { isPro: true, status: "active", currentPeriodEnd: "2026-01-01", subscriptionId: "sub_1" };
    mock.get.mockResolvedValue({ data: status });
    const result = await paymentsApi.getSubscriptionStatus();
    expect(mock.get).toHaveBeenCalledWith("/payments/subscription-status");
    expect(result).toEqual(status);
  });
});
