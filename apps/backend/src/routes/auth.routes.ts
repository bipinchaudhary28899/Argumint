import { Router } from "express";
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

  return router;
}
