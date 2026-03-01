import Redis from "ioredis";

let redisClient: Redis | null = null;
let redisConnected = false;

export const connectRedis = (url: string) => {
  try {
    redisClient = new Redis(url);

    redisClient.on("connect", () => {
      redisConnected = true;
      console.log("Redis connected");
    });

    redisClient.on("error", (err) => {
      redisConnected = false;
      console.error("Redis connection failed:", err);
    });
  } catch (error) {
    redisConnected = false;
    console.error(error);
  }
};

export const isRedisConnected = () => redisConnected;