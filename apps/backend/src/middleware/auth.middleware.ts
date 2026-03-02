import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Redis from "ioredis";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      email?: string;
    }
  }
}

export function createAuthMiddleware(redisClient: Redis | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.cookies.authToken;

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

      req.userId = decoded.userId;
      req.email = decoded.email;
      next();
    } catch (error) {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}
