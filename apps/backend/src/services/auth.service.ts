import jwt from "jsonwebtoken";
import { User } from "../models/User.model.js";
import { RegisterInput, LoginInput, PublicUser, toPublicUser } from "@argumint/shared";
import Redis from "ioredis";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRY = "7d";
const SESSION_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export class AuthService {
  constructor(private redisClient: Redis | null) {}

  // ------------------- REGISTER -------------------
  async register(data: RegisterInput): Promise<PublicUser> {
  const normalizedEmail = data.email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new Error("Email already registered");
  }

  // Create new user with plain password
  const user = new User({
    email: normalizedEmail,
    username: data.username,
    passwordHash: data.password, // pass plain password; Mongoose will hash it
    stats: { debatesWon: 0, debatesLost: 0, totalDebates: 0 },
  });

  await user.save();
  return toPublicUser(user);
}

  // ------------------- VALIDATE CREDENTIALS (no session created) -------------------
  // Use this to verify email + password without touching Redis.
  // Lets the login endpoint check for session conflicts before committing.
  async validateCredentials(email: string, password: string): Promise<{ user: PublicUser; userId: string; userEmail: string; username: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) throw new Error("Invalid email or password");
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) throw new Error("Invalid email or password");
    return {
      user: toPublicUser(user),
      userId: user._id.toString(),
      userEmail: user.email,
      username: user.username,
    };
  }

  // ------------------- CREATE SESSION (token + Redis) -------------------
  // Call only after the session-conflict check passes.
  async createSession(userId: string, email: string, username: string): Promise<string> {
    const token = jwt.sign(
      { userId, email, username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY },
    );
    if (this.redisClient) {
      await this.redisClient.setex(`session:${userId}`, SESSION_EXPIRY, token);
    }
    return token;
  }

  // ------------------- LOGIN (kept for backward-compat, e.g. auto-login after register) -------------------
  async login(data: LoginInput): Promise<{ user: PublicUser; token: string }> {
    const { user, userId, userEmail, username } = await this.validateCredentials(data.email, data.password);
    const token = await this.createSession(userId, userEmail, username);
    return { user, token };
  }

  // ------------------- VERIFY TOKEN -------------------
  async verifyToken(token: string): Promise<{ userId: string; email: string }> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

      if (this.redisClient) {
        const sessionKey = `session:${decoded.userId}`;
        const sessionToken = await this.redisClient.get(sessionKey);
        if (!sessionToken || sessionToken !== token) {
          throw new Error("Session invalid or expired");
        }
      }

      return decoded;
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  // ------------------- GET USER -------------------
  async getUser(userId: string): Promise<PublicUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return toPublicUser(user);
  }

  // ------------------- HAS ACTIVE SESSION -------------------
  // Returns true if there is a live session token in Redis for this user.
  // Used by the login endpoint to detect concurrent logins before evicting.
  async hasActiveSession(userId: string): Promise<boolean> {
    if (!this.redisClient) return false;
    const existing = await this.redisClient.get(`session:${userId}`);
    return !!existing;
  }

  // ------------------- LOGOUT -------------------
  async logout(userId: string): Promise<void> {
    if (this.redisClient) {
      const sessionKey = `session:${userId}`;
      await this.redisClient.del(sessionKey);
    }
  }
}