import express from "express";
import { isMongoConnected } from "./db/mongo.js";
import { isRedisConnected } from "./db/redis.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mongo: isMongoConnected(),
    redis: isRedisConnected()
  });
});

export default app;