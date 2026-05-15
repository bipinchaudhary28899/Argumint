/**
 * webhook.handler.ts
 *
 * Processes inbound Razorpay webhook events.
 *
 * The raw request body MUST be passed here (not the parsed JSON body) so the
 * HMAC-SHA256 signature can be verified against the raw bytes.
 * Make sure express.raw() is applied on the /payments/webhook route BEFORE
 * express.json() in the router.
 *
 * Razorpay webhook signature header: x-razorpay-signature
 * Signature = HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
 */

import type { Request, Response } from "express";
import crypto from "crypto";
import { activateProForSubscription, deactivateProForSubscription } from "./razorpay.service.js";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  try {
  if (!WEBHOOK_SECRET) {
    console.error("[Webhook] RAZORPAY_WEBHOOK_SECRET is not set");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  const sig = req.headers["x-razorpay-signature"];
  if (!sig || typeof sig !== "string") {
    res.status(400).json({ error: "Missing x-razorpay-signature header" });
    return;
  }

  // Use the raw body captured by express.json()'s verify callback.
  // Route-level express.raw() doesn't work because the global express.json()
  // runs first and body-parser won't re-parse an already-parsed body.
  const rawBody: Buffer | undefined = (req as any).rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    console.error("[Webhook] rawBody not available — check express.json verify option in app.ts");
    res.status(400).json({ error: "Raw body unavailable" });
    return;
  }

  // Verify HMAC-SHA256 signature
  const expectedSig = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expectedSig !== sig) {
    console.error("[Webhook] Signature verification failed");
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  console.info(`[Webhook] Received event: ${event.event}`);

  try {
    switch (event.event) {

      // ── Subscription activated (first payment succeeded) ─────────────────
      case "subscription.activated": {
        const sub           = event.payload?.subscription?.entity;
        const subscriptionId: string = sub?.id;
        const periodEnd: number      = sub?.charge_at ?? 0;
        if (subscriptionId) {
          await activateProForSubscription(subscriptionId, "active", periodEnd);
        }
        break;
      }

      // ── Recurring charge succeeded (renewal) ─────────────────────────────
      case "subscription.charged": {
        const sub           = event.payload?.subscription?.entity;
        const subscriptionId: string = sub?.id;
        const periodEnd: number      = sub?.charge_at ?? 0;
        if (subscriptionId) {
          await activateProForSubscription(subscriptionId, "active", periodEnd);
        }
        break;
      }

      // ── Subscription cancelled by user or at cycle end ───────────────────
      case "subscription.cancelled":
      // ── Subscription completed (all total_count cycles done) ─────────────
      case "subscription.completed":
      // ── Subscription halted (too many payment failures) ───────────────────
      case "subscription.halted": {
        const sub           = event.payload?.subscription?.entity;
        const subscriptionId: string = sub?.id;
        const status: string         = sub?.status ?? event.event.split(".")[1];
        if (subscriptionId) {
          await deactivateProForSubscription(subscriptionId, status);
        }
        break;
      }

      // ── Payment failed — log only; subscription.halted handles downgrade ──
      case "payment.failed": {
        const payment    = event.payload?.payment?.entity;
        const customerId = payment?.customer_id ?? "unknown";
        console.warn(`[Webhook] Payment failed for customer ${customerId}`);
        break;
      }

      default:
        // Unhandled event — acknowledge so Razorpay doesn't retry
        break;
    }
  } catch (err) {
    console.error(`[Webhook] Error processing ${event.event}:`, err);
    // Still return 200 so Razorpay doesn't retry — investigate in logs
  }

  res.json({ received: true });

  } catch (err) {
    // Catch-all: never let a webhook crash the server process.
    console.error("[Webhook] Unhandled error — returning 200 to prevent Razorpay retries:", err);
    if (!res.headersSent) res.json({ received: true });
  }
}
