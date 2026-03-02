import dotenv from "dotenv";
dotenv.config();

import app, { attachAuthRoutes, attachRoomRoutes } from "./app.js";
import { connectMongo } from "./db/mongo.js";
import { connectRedis, getRedisClient } from "./db/redis.js";

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI!;
const REDIS_URL = process.env.REDIS_URL!;

const start = async () => {
  await connectMongo(MONGODB_URI);
  connectRedis(REDIS_URL);

  // Attach routes after Redis is connected
  const redisClient = getRedisClient();
  await attachAuthRoutes(app, redisClient);
  await attachRoomRoutes(app, redisClient);

  app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
  });
};

start();
