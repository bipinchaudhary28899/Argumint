/**
 * admin.routes.ts
 *
 * Developer-only routes for the Argumint dev dashboard.
 * Every endpoint is gated by the DEV_SECRET env var — the client must send
 *   x-dev-secret: <value>
 * in the request header. If DEV_SECRET is not set the routes always return 403.
 *
 * Mounted at /admin in server.ts.
 *
 * Routes:
 *   GET /admin/users    – all users with subscription segments
 *   GET /admin/summary  – aggregate counts per segment + platform totals
 */

import express, { Request, Response, NextFunction } from "express";
import { User } from "../models/User.model.js";

// ─── Helper: guard middleware ────────────────────────────────────────────────

function devGuard(req: Request, res: Response, next: NextFunction) {
  const secret    = req.headers["x-dev-secret"] as string | undefined;
  const DEV_SECRET = process.env.DEV_SECRET;

  if (!DEV_SECRET) {
    return res.status(403).json({ error: "DEV_SECRET not configured on server" });
  }
  if (secret !== DEV_SECRET) {
    return res.status(403).json({ error: "Invalid dev secret" });
  }
  next();
}

// ─── Segment classifier ──────────────────────────────────────────────────────

type UserSegment = "pro_active" | "pro_cancelled" | "abandoned_checkout" | "free";

function classifyUser(u: any): UserSegment {
  if (u.isPro && u.subscriptionStatus !== "cancelled") return "pro_active";
  if (u.isPro && u.subscriptionStatus === "cancelled")  return "pro_cancelled";
  // Has started checkout (createSubscription was called) but never paid
  if (!u.isPro && u.subscriptionId)                     return "abandoned_checkout";
  return "free";
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export function createAdminRoutes() {
  const router = express.Router();

  /**
   * GET /admin/users
   * Returns all users (newest first) with subscription segment classification.
   */
  router.get("/users", devGuard, async (_req: Request, res: Response) => {
    try {
      const users = await User.find({})
        .sort({ createdAt: -1 })
        .select("username email isPro subscriptionStatus subscriptionId razorpayCustomerId xp stats createdAt")
        .lean();

      const result = users.map((u: any) => ({
        id:                  u._id.toString(),
        username:            u.username,
        email:               u.email,
        isPro:               u.isPro ?? false,
        subscriptionStatus:  u.subscriptionStatus ?? null,
        subscriptionId:      u.subscriptionId     ?? null,
        hasRazorpayCustomer: !!u.razorpayCustomerId,
        xp:                  u.xp ?? 0,
        stats: {
          debatesWon:   u.stats?.debatesWon   ?? 0,
          debatesLost:  u.stats?.debatesLost  ?? 0,
          totalDebates: u.stats?.totalDebates ?? 0,
        },
        createdAt: u.createdAt,
        segment:   classifyUser(u),
      }));

      res.json(result);
    } catch (err: any) {
      console.error("[Admin] /users error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch users" });
    }
  });

  /**
   * GET /admin/summary
   * Returns aggregate counts: total users, segment breakdown, platform totals.
   */
  router.get("/summary", devGuard, async (_req: Request, res: Response) => {
    try {
      const [users, Room, Debate] = await Promise.all([
        User.find({}).select("isPro subscriptionStatus subscriptionId xp stats").lean(),
        import("../models/Room.model.js").then(m => m.Room),
        import("../models/Debate.model.js").then(m => m.Debate),
      ]);

      const [totalRooms, totalDebates, activeRooms, liveDebates] = await Promise.all([
        Room.countDocuments({}),
        Debate.countDocuments({}),
        Room.countDocuments({ status: { $in: ["lobby", "voting", "ready-up", "prep"] } }),
        Room.countDocuments({ status: "live" }),
      ]);

      const segments = { pro_active: 0, pro_cancelled: 0, abandoned_checkout: 0, free: 0 };
      let totalXP = 0;

      for (const u of users as any[]) {
        segments[classifyUser(u)]++;
        totalXP += u.xp ?? 0;
      }

      res.json({
        users: {
          total:    users.length,
          segments,
          totalXP,
          avgXP:    users.length > 0 ? Math.round(totalXP / users.length) : 0,
        },
        platform: { totalRooms, totalDebates, activeRooms, liveDebates },
      });
    } catch (err: any) {
      console.error("[Admin] /summary error:", err);
      res.status(500).json({ error: err.message || "Failed to fetch summary" });
    }
  });

  return router;
}
