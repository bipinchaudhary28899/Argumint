/**
 * payments.routes.ts
 *
 * Mounted at /payments in app.ts.
 *
 * Routes:
 *   POST /payments/create-subscription   – create a Razorpay subscription
 *   POST /payments/verify-payment        – verify Razorpay signature + activate Pro
 *   POST /payments/cancel-subscription   – cancel subscription at cycle end
 *   GET  /payments/subscription-status   – current user's Pro status
 *   POST /payments/webhook               – Razorpay webhook (raw body, no auth)
 */

import express, { type Request, type Response } from "express";
import { createAuthMiddleware } from "../middleware/auth.middleware.js";
import {
  createSubscription,
  verifyAndActivate,
  cancelSubscription,
  getSubscriptionInfo,
} from "./razorpay.service.js";
import { handleRazorpayWebhook } from "./webhook.handler.js";
import Redis from "ioredis";

export function createPaymentRoutes(redisClient: Redis | null) {
  const router         = express.Router();
  const authMiddleware = createAuthMiddleware(redisClient);

  // ── Webhook — no auth, raw body is captured by express.json()'s verify ────
  // The raw bytes are stored on req.rawBody in app.ts so the HMAC signature
  // can be verified. express.raw() here is NOT used (global json() runs first).
  router.post("/webhook", handleRazorpayWebhook);

  // ── Create Subscription ───────────────────────────────────────────────────
  // Returns { subscriptionId, keyId } — the frontend passes these to Razorpay
  // Checkout.js to open the payment popup.
  router.post("/create-subscription", authMiddleware, async (req: Request, res: Response) => {
    try {
      const result = await createSubscription(req.userId!);
      res.json(result);
    } catch (err: any) {
      console.error("[Payments] create-subscription error:", err);
      res.status(500).json({ error: err.message || "Failed to create subscription" });
    }
  });

  // ── Verify Payment ────────────────────────────────────────────────────────
  // Called by the frontend after the Razorpay popup's handler callback fires.
  // Verifies the HMAC signature then activates Pro on the user account.
  router.post("/verify-payment", authMiddleware, async (req: Request, res: Response) => {
    const { paymentId, subscriptionId, signature } = req.body as {
      paymentId:      string;
      subscriptionId: string;
      signature:      string;
    };

    if (!paymentId || !subscriptionId || !signature) {
      res.status(400).json({ error: "paymentId, subscriptionId, and signature are required" });
      return;
    }

    try {
      await verifyAndActivate(paymentId, subscriptionId, signature, req.userId!);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Payments] verify-payment error:", err);
      const status = err.message?.includes("signature") ? 400 : 500;
      res.status(status).json({ error: err.message || "Payment verification failed" });
    }
  });

  // ── Cancel Subscription ───────────────────────────────────────────────────
  // Cancels at the end of the current billing cycle so the user keeps Pro
  // access until the period they already paid for expires.
  router.post("/cancel-subscription", authMiddleware, async (req: Request, res: Response) => {
    try {
      await cancelSubscription(req.userId!);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Payments] cancel-subscription error:", err);
      res.status(500).json({ error: err.message || "Failed to cancel subscription" });
    }
  });

  // ── Subscription Status ───────────────────────────────────────────────────
  router.get("/subscription-status", authMiddleware, async (req: Request, res: Response) => {
    try {
      const info = await getSubscriptionInfo(req.userId!);
      res.json(info);
    } catch (err: any) {
      console.error("[Payments] subscription-status error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch subscription status" });
    }
  });

  return router;
}
