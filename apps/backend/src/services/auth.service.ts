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

  // ------------------- LOGIN -------------------
  async login(data: LoginInput): Promise<{ user: PublicUser; token: string }> {
    const normalizedEmail = data.email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) throw new Error("Invalid email or password");

    const isPasswordValid = await user.comparePassword(data.password);
    if (!isPasswordValid) throw new Error("Invalid email or password");

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY },
    );

    if (this.redisClient) {
      await this.redisClient.setex(`session:${user._id}`, SESSION_EXPIRY, token);
    }

    return { user: toPublicUser(user), token };
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

  // ------------------- LOGOUT -------------------
  async logout(userId: string): Promise<void> {
    if (this.redisClient) {
      const sessionKey = `session:${userId}`;
      await this.redisClient.del(sessionKey);
    }
  }
}