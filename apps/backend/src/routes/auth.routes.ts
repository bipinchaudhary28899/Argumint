import { Router, Request, Response } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { AuthService } from "../services/auth.service.js";
import { createAuthMiddleware } from "../middleware/auth.middleware.js";
import { loginRateLimiter } from "../middleware/rateLimit.middleware.js";
import Redis from "ioredis";

export function createAuthRoutes(
  redisClient: Redis | null
): Router {
  const router = Router();
  const authService = new AuthService(redisClient);
  const authController = new AuthController(authService);
  const authMiddleware = createAuthMiddleware(redisClient);

  // Public routes
  router.post("/register", (req, res) => authController.register(req, res));
  router.post("/login", loginRateLimiter, (req, res) =>
    authController.login(req, res)
  );

  // Protected routes
  router.post("/logout", authMiddleware, (req, res) =>
    authController.logout(req, res)
  );
  router.get("/me", authMiddleware, (req, res) =>
    authController.me(req, res)
  );

  /**
   * GET /auth/leaderboard - Top 10 users by XP (auth required)
   */
  router.get("/leaderboard", authMiddleware, async (_req: Request, res: Response) => {
    try {
      const { User } = await import("../models/User.model.js");
      const users = await User.find({})
        .sort({ xp: -1 })
        .limit(10)
        .select("username xp stats")
        .lean();
      res.json(users.map((u: any) => ({
        id: u._id.toString(),
        username: u.username,
        xp: u.xp ?? 0,
        debatesWon: u.stats?.debatesWon ?? 0,
        totalDebates: u.stats?.totalDebates ?? 0,
      })));
    } catch {
      res.json([]);
    }
  });

  return router;
}
