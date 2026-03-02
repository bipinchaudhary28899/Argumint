import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import Redis from "ioredis";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export function createSocketAuthMiddleware(redisClient: Redis | null) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      // Extract token from socket handshake auth
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
        email: string;
        username?: string;
      };

      // Verify session in Redis
      if (redisClient) {
        const sessionKey = `session:${decoded.userId}`;
        const sessionToken = await redisClient.get(sessionKey);
        if (!sessionToken || sessionToken !== token) {
          return next(new Error("Session invalid or expired"));
        }
      }

      // Attach user info to socket
      socket.data.userId = decoded.userId;
      socket.data.email = decoded.email;
      socket.data.username = decoded.username || decoded.email.split("@")[0];

      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  };
}
