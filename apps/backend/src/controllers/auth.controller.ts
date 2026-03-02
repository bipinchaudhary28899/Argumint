import { Request, Response } from "express";
import { RegisterSchema, LoginSchema } from "@argumint/shared";
import { AuthService } from "../services/auth.service.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class AuthController {
  constructor(private authService: AuthService) {}

  async register(req: Request, res: Response): Promise<void> {
    try {
      // Validate input
      const validationResult = RegisterSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten(),
        });
        return;
      }

      const user = await this.authService.register(validationResult.data);
      res.status(201).json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
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

      const { user, token } = await this.authService.login(validationResult.data);

      // Set HTTP-only cookie
      res.cookie("authToken", token, COOKIE_OPTIONS);

      res.json({ user });
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
      const message = error instanceof Error ? error.message : "Failed to get user";
      res.status(400).json({ error: message });
    }
  }
}
