import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { isMongoConnected } from "./db/mongo.js";
import { isRedisConnected } from "./db/redis.js";
import Redis from "ioredis";

const app = express();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    const allowed = [process.env.FRONTEND_URL]
      // always allow our default dev host
      .concat("http://localhost:5173")
      // support any localhost port for development
      .concat(origin.match(/^https?:\/\/localhost(:\d+)?$/) ? [origin] : []);

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS policy rejects origin: ${origin}`));
  },
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

// Routes will be attached in server.ts
export async function attachAuthRoutes(
  app: express.Application,
  redisClient: Redis | null
) {
  const { createAuthRoutes } = await import("./routes/auth.routes.js");
  const authRoutes = createAuthRoutes(redisClient);
  app.use("/auth", authRoutes);
}

export async function attachRoomRoutes(
  app: express.Application,
  redisClient: Redis | null
) {
  const { createRoomRoutes } = await import("./routes/room.routes.js");
  const roomRoutes = createRoomRoutes(redisClient);
  app.use("/rooms", roomRoutes);
}

export default app;
