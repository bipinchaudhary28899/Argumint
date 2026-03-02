import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { isMongoConnected } from "./db/mongo.js";
import { isRedisConnected } from "./db/redis.js";
import Redis from "ioredis";

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mongo: isMongoConnected(),
    redis: isRedisConnected()
  });
});

// Auth routes will be attached in server.ts
export function attachAuthRoutes(app: express.Application, redisClient: Redis | null) {
  const { createAuthRoutes } = await import("./routes/auth.routes.js");
  const authRoutes = createAuthRoutes(redisClient);
  app.use("/auth", authRoutes);
}

export default app;
