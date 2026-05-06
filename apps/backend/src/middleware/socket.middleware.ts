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

      // Verify session in Redis — with a 1 s timeout so a slow Redis never
      // blocks the connection handshake. If Redis times out we trust the
      // JWT signature alone (it was verified above).
      if (redisClient) {
        try {
          const sessionKey = `session:${decoded.userId}`;
          const sessionToken = await Promise.race([
            redisClient.get(sessionKey),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
          ]);
          if (sessionToken !== null && sessionToken !== token) {
            return next(new Error("Session invalid or expired"));
          }
        } catch {
          // Redis unavailable — fall through and trust the JWT
        }
      }

      // Attach user info + the raw token to socket.data.
      // The token is stored so the periodic session-validity check can compare
      // it against whatever is currently in Redis (see initializeSocketIO).
      socket.data.userId = decoded.userId;
      socket.data.email = decoded.email;
      socket.data.username = decoded.username || decoded.email.split("@")[0];
      socket.data.token = token;

      next();
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  };
}
