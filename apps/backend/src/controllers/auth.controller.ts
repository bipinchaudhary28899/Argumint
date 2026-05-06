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
      // Validate input
      const validationResult = LoginSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten(),
        });
        return;
      }

      const { user, token } = await this.authService.login(
        validationResult.data,
      );

      // Evict any existing socket for this user instantly —
      // fires session:evicted on Device A and disconnects it before
      // we even respond to Device B.
      evictUserSocket(user.id);

      // Set HTTP-only cookie
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
