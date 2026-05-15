import { Request, Response } from "express";
import { RegisterSchema, LoginSchema } from "@argumint/shared";
import { AuthService } from "../services/auth.service.js";
import { evictUserSocket } from "../socket/index.js";

const sameSite: "none" | "lax" = process.env.NODE_ENV === "production" ? "none" : "lax";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response): Promise<void> {
    try {
      // Extract only email and password (confirmPassword is validated client-side)
      const { email, username, password } = req.body;

      if (!email || !username || !password) {
        res.status(400).json({
          error: "Validation failed",
          details: {
            fieldErrors: {
              email: !email ? ["Required"] : [],
              username: !username ? ["Required"] : [],
              password: !password ? ["Required"] : [],
            },
          },
        });
        return;
      }

      const user = await this.authService.register({
        email,
        username,
        password,
        confirmPassword:password
      });

      // Auto-login after successful registration
      const loginResult = await this.authService.login({ email, password });
      res.cookie("authToken", loginResult.token, COOKIE_OPTIONS);

      res.status(201).json({ user, token: loginResult.token });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Registration failed";
      res.status(400).json({ error: message });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      // Validate input (ignore the extra `force` field Zod doesn't know about)
      const validationResult = LoginSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten(),
        });
        return;
      }

      const force = req.body.force === true;

      // Step 1: Verify credentials WITHOUT creating a session yet.
      // This ensures we don't overwrite the old token in Redis before
      // we know whether the user is allowed to proceed.
      const { user, userId, userEmail, username } =
        await this.authService.validateCredentials(
          validationResult.data.email,
          validationResult.data.password,
        );

      // Step 2: Check for an existing active session.
      // If one exists and force is false, tell the frontend so it can
      // prompt "Sign in here → (end the other session)".
      const hasActiveSession = await this.authService.hasActiveSession(userId);
      if (hasActiveSession && !force) {
        res.status(409).json({
          error: "active_session",
          message: "You are already signed in on another device. Sign in here to end that session.",
        });
        return;
      }

      // Step 3: Create the new session (generates + stores token in Redis).
      // Only reached when there is no conflict, or the user chose force=true.
      const token = await this.authService.createSession(userId, userEmail, username);

      // Step 4: Evict the old socket AFTER the new session is committed.
      // This fires session:evicted on the other device so it redirects cleanly.
      evictUserSocket(userId);

      // Set HTTP-only cookie (kept for same-origin / legacy clients)
      res.cookie("authToken", token, COOKIE_OPTIONS);

      res.json({ user, token });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
      res.status(401).json({ error: message });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      await this.authService.logout(userId);
      res.clearCookie("authToken");
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ error: "Logout failed" });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      const user = await this.authService.getUser(userId);
      res.json({ user });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to get user";
      res.status(400).json({ error: message });
    }
  }
}
