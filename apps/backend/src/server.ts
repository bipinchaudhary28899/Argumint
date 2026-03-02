import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app, { attachAuthRoutes, attachRoomRoutes } from "./app.js";
import { connectMongo } from "./db/mongo.js";
import { connectRedis, getRedisClient } from "./db/redis.js";
import { initializeSocketIO } from "./socket/index.js";

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI!;
const REDIS_URL = process.env.REDIS_URL!;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const start = async () => {
  await connectMongo(MONGODB_URI);
  connectRedis(REDIS_URL);

  // Attach routes after Redis is connected
  const redisClient = getRedisClient();
  await attachAuthRoutes(app, redisClient);
  await attachRoomRoutes(app, redisClient);

  // Create HTTP server for Socket.io
  const httpServer = http.createServer(app);

  // Initialize Socket.io
  initializeSocketIO(httpServer, redisClient, FRONTEND_URL);

  httpServer.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
    console.log(`Socket.io enabled with CORS origin: ${FRONTEND_URL}`);
  });
};

start();
