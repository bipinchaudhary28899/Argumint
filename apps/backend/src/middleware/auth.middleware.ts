import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Redis from "ioredis";
import { User } from "../models/User.model.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      email?: string;
      username?: string; // ← added
    }
  }
}

export function createAuthMiddleware(redisClient: Redis | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Prefer Authorization: Bearer header — this is required for cross-domain
      // deployments (e.g. Vercel frontend + Render backend) because browsers
      // block third-party httpOnly cookies across different origins.
      // Fall back to the cookie for same-origin or legacy clients.
      const authHeader = req.headers.authorization;
      const token =
        (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined) ??
        req.cookies?.authToken ??
        null;

      if (!token) {
        return res.status(401).json({ error: "No token provided" });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        email: string;
      };

      // Check if session exists in Redis
      if (redisClient) {
        const sessionKey = `session:${decoded.userId}`;
        const sessionToken = await redisClient.get(sessionKey);
        if (!sessionToken || sessionToken !== token) {
          return res.status(401).json({ error: "Session invalid or expired" });
        }
      }

      // Fetch actual username from DB instead of deriving from email
      const user = await User.findById(decoded.userId).select("username").lean();
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      req.userId = decoded.userId;
      req.email = decoded.email;
      req.username = user.username; // ← attach real username
      next();
    } catch (error) {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}