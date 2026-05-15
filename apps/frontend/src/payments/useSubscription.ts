/**
 * useSubscription.ts
 *
 * React hook that surfaces the current user's Pro subscription state and
 * provides helpers to open Razorpay Checkout or cancel the subscription.
 *
 * Flow:
 *  1. openCheckout() calls backend to create a Razorpay subscription
 *  2. Loads Razorpay Checkout.js dynamically if not already on the page
 *  3. Opens the Razorpay payment popup
 *  4. On success, calls backend to verify the payment signature
 *  5. Re-fetches the auth user so isPro flips to true in the UI
 *  6. Navigates to /subscription/success
 *
 * Usage:
 *   const { isPro, openCheckout, cancelSubscription, isLoading, error } = useSubscription();
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { paymentsApi } from "./paymentsApi";

// ─── Razorpay Checkout.js loader ─────────────────────────────────────────────

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) {
      resolve();
      return;
    }
    const script    = document.createElement("script");
    script.src      = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload   = () => resolve();
    script.onerror  = () => reject(new Error("Failed to load Razorpay Checkout script"));
    document.body.appendChild(script);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export interface UseSubscriptionReturn {
  /** True when the user has an active Pro subscription */
  isPro:              boolean;
  /** Razorpay subscription status string, or null for free users */
  status:             string | null;
  /** When the current billing period ends / next charge date (null for free) */
  currentPeriodEnd:   Date | null;
  /** True while a payment action is in progress */
  isLoading:          boolean;
  /** Error message if the last action failed */
  error:              string | null;
  /** Open the Razorpay Checkout popup to start a Pro subscription */
  openCheckout:       () => Promise<void>;
  /** Cancel the active subscription at the end of the current billing cycle */
  cancelSubscription: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionReturn {
  const { user, checkAuth } = useAuth();
  const navigate            = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Derive state from AuthContext — AuthContext re-fetches on login and after
  // checkAuth() is called, so no separate polling is needed.
  const isPro             = user?.isPro ?? false;
  const status            = user?.subscriptionStatus ?? null;
  const currentPeriodEnd  = user?.currentPeriodEnd ? new Date(user.currentPeriodEnd) : null;

  const openCheckout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Create the Razorpay subscription on the backend
      const { subscriptionId, keyId } = await paymentsApi.createSubscription();

      // 2. Ensure the Razorpay Checkout.js script is loaded
      await loadRazorpayScript();

      // 3. Open the payment popup
      const rzp = new (window as any).Razorpay({
        key:             keyId,
        subscription_id: subscriptionId,
        name:            "Argumint",
        description:     "Pro Plan — ₹50/month",
        prefill: {
          name:  user?.username ?? "",
          email: user?.email    ?? "",
        },
        theme: { color: "#4f8ef7" },

        // 4. Called by Razorpay on successful payment
        handler: async (response: {
          razorpay_payment_id:      string;
          razorpay_subscription_id: string;
          razorpay_signature:       string;
        }) => {
          try {
            // 5. Verify signature on the backend — activates Pro
            await paymentsApi.verifyPayment(
              response.razorpay_payment_id,
              response.razorpay_subscription_id,
              response.razorpay_signature,
            );
            // 6. Refresh user so isPro flips immediately
            await checkAuth();
            navigate("/subscription/success");
          } catch (err: any) {
            setError(
              err?.response?.data?.error ??
              err?.message ??
              "Payment verification failed. Please contact support.",
            );
          }
          setIsLoading(false);
        },

        modal: {
          ondismiss: () => {
            // User closed the popup without paying
            setIsLoading(false);
          },
        },
      });

      rzp.open();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Failed to start checkout");
      setIsLoading(false);
    }
    // Note: on success, isLoading is cleared inside the handler callback above
  }, [user, checkAuth, navigate]);

  const cancelSubscription = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await paymentsApi.cancelSubscription();
      await checkAuth(); // refresh so UI reflects cancelled status
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Failed to cancel subscription");
    }
    setIsLoading(false);
  }, [checkAuth]);

  return {
    isPro,
    status,
    currentPeriodEnd,
    isLoading,
    error,
    openCheckout,
    cancelSubscription,
  };
}
