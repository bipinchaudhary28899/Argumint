import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { isMongoConnected } from "./db/mongo.js";
import { isRedisConnected } from "./db/redis.js";
import Redis from "ioredis";

const app = express();

// Trust the first proxy hop (Render's load balancer) so that express-rate-limit
// reads the real client IP from X-Forwarded-For instead of the proxy IP.
// Without this every user appears to share the same IP and the rate limit
// bucket is drained collectively, causing innocent users to get 429.
app.set("trust proxy", 1);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowed = [
      process.env.FRONTEND_URL,
      "http://localhost:5173",
      "https://argumint-frontend.vercel.app",
      "https://argumint-frontend-git-main-bkumar28899-4688s-projects.vercel.app",
    ].filter(Boolean);

    // allow any vercel preview deployments too
    if (allowed.includes(origin) || origin.match(/https:\/\/argumint.*\.vercel\.app$/)) {
      return callback(null, true);
    }

    callback(new Error(`CORS policy rejects origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({
  // Store the raw body buffer on the request so the Razorpay webhook handler
  // can verify the HMAC signature against the exact bytes Razorpay sent.
  // express.raw() scoped to the route doesn't work here because express.json()
  // runs first globally and body-parser won't re-parse an already-parsed body.
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
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

export async function attachDebateRoutes(
  app: express.Application,
  redisClient: Redis | null
) {
  const { createDebateRoutes } = await import("./routes/debate.routes.js");
  const debateRoutes = createDebateRoutes(redisClient);
  app.use("/debates", debateRoutes);
}

export async function attachPaymentRoutes(
  app: express.Application,
  redisClient: Redis | null
) {
  const { createPaymentRoutes } = await import("./payments/payments.routes.js");
  // NOTE: The webhook route uses express.raw() internally, so it must be
  // registered BEFORE the global express.json() middleware would re-parse
  // the body. Because we scope express.raw() to just that one route inside
  // createPaymentRoutes, the ordering here is fine.
  const paymentRoutes = createPaymentRoutes(redisClient);
  app.use("/payments", paymentRoutes);
}

export async function attachAdminRoutes(app: express.Application) {
  const { createAdminRoutes } = await import("./routes/admin.routes.js");
  app.use("/admin", createAdminRoutes());
}

export default app;
