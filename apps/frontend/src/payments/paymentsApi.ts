/**
 * paymentsApi.ts
 *
 * Typed wrappers around the /payments backend endpoints.
 * Import this instead of calling apiClient directly so all payment
 * network calls stay in one place.
 */

import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Attach Bearer token from localStorage (same pattern as services/api.ts)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface SubscriptionStatus {
  isPro:            boolean;
  status:           string | null;
  currentPeriodEnd: string | null; // ISO date string from JSON
  subscriptionId:   string | null;
}

export const paymentsApi = {
  /**
   * Create a Razorpay Subscription on the backend.
   * Returns the subscription ID and public key ID for Razorpay Checkout.js.
   */
  async createSubscription(): Promise<{ subscriptionId: string; keyId: string }> {
    const res = await apiClient.post<{ subscriptionId: string; keyId: string }>(
      "/payments/create-subscription",
    );
    return res.data;
  },

  /**
   * Verify the Razorpay payment signature after the Checkout popup succeeds.
   * Activates Pro on the user account if the signature is valid.
   */
  async verifyPayment(
    paymentId:      string,
    subscriptionId: string,
    signature:      string,
  ): Promise<void> {
    await apiClient.post("/payments/verify-payment", {
      paymentId,
      subscriptionId,
      signature,
    });
  },

  /**
   * Cancel the current subscription at the end of the billing cycle.
   * Pro access continues until the period the user already paid for expires.
   */
  async cancelSubscription(): Promise<void> {
    await apiClient.post("/payments/cancel-subscription");
  },

  /**
   * Fetch the current user's subscription status directly from the DB.
   * Useful for the account page and feature-gate checks.
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    const res = await apiClient.get<SubscriptionStatus>("/payments/subscription-status");
    return res.data;
  },
};
