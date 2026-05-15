/**
 * razorpay.service.ts
 *
 * All Razorpay SDK calls live here. Nothing else in the codebase should
 * import `razorpay` directly — go through this service so the integration
 * stays isolated and easy to swap or mock.
 *
 * Required env vars (set in .env):
 *   RAZORPAY_KEY_ID         – rzp_live_… (live key)
 *   RAZORPAY_KEY_SECRET     – your live key secret
 *   RAZORPAY_PLAN_ID        – plan_… for the ₹50/mo production plan
 *   RAZORPAY_PLAN_ID_DEV    – plan_… for the ₹1/mo dev/test plan (optional)
 *                             When set, non-production environments use this
 *                             plan so you never accidentally charge ₹50 while
 *                             testing locally.
 *   RAZORPAY_WEBHOOK_SECRET – the webhook secret set in the Razorpay dashboard
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import { User } from "../models/User.model.js";

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn("[Razorpay] RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set — payments will be unavailable");
}

export const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     ?? "",
  key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
});

/**
 * Active plan ID.
 * - Production  (NODE_ENV=production) → RAZORPAY_PLAN_ID        (₹50/mo)
 * - Everything else                   → RAZORPAY_PLAN_ID_DEV    (₹1/mo)
 *   falls back to RAZORPAY_PLAN_ID if the dev plan var isn't set.
 */
const IS_PROD = process.env.NODE_ENV === "production";
const PLAN_ID = IS_PROD
  ? (process.env.RAZORPAY_PLAN_ID ?? "")
  : (process.env.RAZORPAY_PLAN_ID_DEV ?? process.env.RAZORPAY_PLAN_ID ?? "");

console.log(`[Razorpay] Using ${IS_PROD ? "PRODUCTION (₹50)" : "DEV (₹1)"} plan: ${PLAN_ID || "(not set)"}`);

// ─────────────────────────────────────────────────────────────────────────────
// Customer helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find or create a Razorpay Customer for the given user.
 * Persists razorpayCustomerId on the User document.
 */
export async function getOrCreateCustomer(userId: string): Promise<string> {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (user.razorpayCustomerId) return user.razorpayCustomerId;

  let customerId: string;

  try {
    const customer = await razorpay.customers.create({
      name:  user.username,
      email: user.email,
      notes: { userId },
    });
    customerId = customer.id;
  } catch (err: any) {
    // Razorpay returns 400 "Customer already exists for the merchant" when the
    // same email is reused — common during dev/test after DB wipes or manual
    // field clears. Fetch the existing customer by email and reuse their ID
    // instead of failing.
    const isAlreadyExists =
      err?.statusCode === 400 &&
      err?.error?.description?.toLowerCase().includes("customer already exists");

    if (!isAlreadyExists) throw err;

    console.log(`[Razorpay] Customer already exists for ${user.email} — fetching existing customer`);
    const list = await (razorpay.customers as any).all({ email: user.email, count: 1 });
    const found = list?.items?.[0];
    if (!found?.id) {
      throw new Error("Customer exists in Razorpay but could not be fetched — check Razorpay dashboard");
    }
    customerId = found.id;
  }

  user.razorpayCustomerId = customerId;
  await user.save();
  return customerId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Razorpay Subscription for the Pro plan.
 * Returns the subscription ID and the public key ID needed by Checkout.js.
 * The frontend opens the Razorpay popup using these values.
 */
export async function createSubscription(userId: string): Promise<{ subscriptionId: string; keyId: string }> {
  if (!PLAN_ID) throw new Error("RAZORPAY_PLAN_ID env var is not configured");

  await getOrCreateCustomer(userId);

  // ── Reuse an existing pending subscription if one exists ─────────────────
  // Without this check, every "Upgrade" button click creates a fresh Razorpay
  // subscription. If the user dismisses the popup and retries, they'd see two
  // separate OTP flows (one per subscription). We avoid that by reusing the
  // still-pending subscription — only create a new one if there isn't one or
  // if the previous one reached a terminal state.
  const REUSABLE_STATUSES = ["created", "authenticated", "pending"];
  const existing = await User.findById(userId).lean();
  if (existing?.subscriptionId && existing.subscriptionStatus &&
      REUSABLE_STATUSES.includes(existing.subscriptionStatus)) {
    console.log(`[Razorpay] Reusing existing subscription ${existing.subscriptionId} (status: ${existing.subscriptionStatus})`);
    return {
      subscriptionId: existing.subscriptionId,
      keyId:          process.env.RAZORPAY_KEY_ID!,
    };
  }

  const subscription = await razorpay.subscriptions.create({
    plan_id:         PLAN_ID,
    customer_notify: 1,
    quantity:        1,
    total_count:     120,   // 120 billing cycles = 10 years
    notes:           { userId },
  });

  // Persist the subscription ID immediately so webhooks can find this user
  await User.findByIdAndUpdate(userId, {
    subscriptionId:     subscription.id,
    subscriptionStatus: subscription.status,
  });

  return {
    subscriptionId: subscription.id,
    keyId:          process.env.RAZORPAY_KEY_ID!,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment verification (called after Checkout.js popup succeeds)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the HMAC signature returned by Razorpay Checkout, then activate Pro.
 * Throws if the signature doesn't match — never trust an unverified payment.
 */
export async function verifyAndActivate(
  paymentId:      string,
  subscriptionId: string,
  signature:      string,
  userId:         string,
): Promise<void> {
  // Razorpay signature = HMAC-SHA256(paymentId + "|" + subscriptionId, key_secret)
  const body        = `${paymentId}|${subscriptionId}`;
  const expectedSig = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(body)
    .digest("hex");

  if (expectedSig !== signature) {
    throw new Error("Payment signature verification failed");
  }

  // Fetch live subscription details for accurate status / next billing date
  const sub       = await razorpay.subscriptions.fetch(subscriptionId);
  const periodEnd = sub.charge_at ?? 0; // unix timestamp of the next billing date

  await User.findByIdAndUpdate(userId, {
    isPro:              true,
    subscriptionId:     sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd:   periodEnd ? new Date(periodEnd * 1000) : null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel subscription
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cancel the user's subscription at the end of the current billing cycle.
 * Pro access continues until `currentPeriodEnd`; the webhook will update
 * the DB when the cycle ends and the subscription moves to `cancelled`.
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  if (!user.subscriptionId) throw new Error("No active subscription found");

  // cancelAtCycleEnd = true → access continues until period end
  await razorpay.subscriptions.cancel(user.subscriptionId, true);

  // Optimistically mark as cancellation-pending; webhook confirms it later
  await User.findByIdAndUpdate(userId, { subscriptionStatus: "cancelled" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription status
// ─────────────────────────────────────────────────────────────────────────────

export interface SubscriptionInfo {
  isPro:             boolean;
  status:            string | null;
  currentPeriodEnd:  Date | null;
  subscriptionId:    string | null;
}

export async function getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error("User not found");
  return {
    isPro:            user.isPro            ?? false,
    status:           user.subscriptionStatus ?? null,
    currentPeriodEnd: user.currentPeriodEnd   ?? null,
    subscriptionId:   user.subscriptionId     ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB sync helpers (called from webhook handler)
// ─────────────────────────────────────────────────────────────────────────────

/** Mark user as Pro — called on subscription.activated / subscription.charged. */
export async function activateProForSubscription(
  subscriptionId: string,
  status:         string,
  periodEnd:      number, // unix timestamp
): Promise<void> {
  await User.findOneAndUpdate(
    { subscriptionId },
    {
      isPro:              true,
      subscriptionStatus: status,
      currentPeriodEnd:   periodEnd ? new Date(periodEnd * 1000) : null,
    },
  );
}

/** Downgrade user — called on subscription.cancelled / subscription.halted. */
export async function deactivateProForSubscription(
  subscriptionId: string,
  status:         string,
): Promise<void> {
  await User.findOneAndUpdate(
    { subscriptionId },
    {
      isPro:              false,
      subscriptionStatus: status,
    },
  );
}
