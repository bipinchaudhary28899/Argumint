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
   * GET /auth/history - Debate history for the authenticated user
   * Returns their ended debates with: topic, debaters, judges, rank, points earned
   */
  router.get("/history", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { Debate } = await import("../models/Debate.model.js");
      const userId = (req as any).user?.userId as string;

      // Find all ended debates this user participated in
      const debates = await Debate.find({
        status: "ended",
        "turnOrder.userId": userId,
      })
        .sort({ endedAt: -1 })
        .limit(50)
        .select("topic mode endedAt startedAt turnOrder judgeScores result roomCode")
        .lean();

      const history = debates.map((d: any) => {
        const totalDebaters = d.turnOrder?.length ?? 0;
        const totalJudges   = d.judgeScores?.length ?? 0;

        // Find this user's score entry
        const scores: any[] = d.result?.scores ?? [];
        const myScore = scores.find((s: any) => s.userId === userId);

        // Rank = position when sorted by total score descending (1-indexed)
        const sorted = [...scores].sort((a: any, b: any) => (b.total ?? 0) - (a.total ?? 0));
        const rank   = myScore ? sorted.findIndex((s: any) => s.userId === userId) + 1 : null;

        // Determine if user was on the winning side
        const mySide   = d.turnOrder?.find((t: any) => t.userId === userId)?.side ?? null;
        const isWinner = d.result?.winnerSide ? d.result.winnerSide === mySide : null;

        return {
          id:            (d._id as any).toString(),
          roomCode:      d.roomCode,
          topic:         d.topic,
          mode:          d.mode,
          endedAt:       d.endedAt ?? d.startedAt,
          totalDebaters,
          totalJudges,
          rank:          rank ?? null,
          totalParticipants: scores.length || totalDebaters,
          points:        myScore?.total ?? null,
          isWinner,
          side:          mySide,
        };
      });

      res.json(history);
    } catch (err) {
      console.error("[history]", err);
      res.json([]);
    }
  });

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
