import express, { Request, Response } from "express";
import { createAuthMiddleware } from "../middleware/auth.middleware.js";
import Redis from "ioredis";
import {
  CreateRoomSchema,
  JoinRoomSchema,
  UpdateRoomSettingsSchema,
} from "@argumint/shared";
import { RoomService } from "../services/room.service.js";
import { User } from "../models/User.model.js";

export function createRoomRoutes(redisClient: Redis | null) {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(redisClient);

  /**
   * POST /rooms/create - Create a new room
   */
  router.post("/create", authMiddleware, async (req: Request, res: Response) => {
    try {
      const parsed = CreateRoomSchema.safeParse(req.body);
      if (!parsed.success) {
        console.error("[RoomRoutes] Validation error:", parsed.error.flatten());
        const errorMessages = parsed.error.flatten().fieldErrors;
        return res.status(400).json({
          error: "Invalid input",
          details: errorMessages,
          message: Object.values(errorMessages).flat().join("; "),
        });
      }

      // ── Pro feature enforcement ───────────────────────────────────────────
      // Verify Pro status server-side so the frontend gate can't be bypassed.
      const hostUser = await User.findById(req.userId!).lean();
      const hostIsPro = hostUser?.isPro ?? false;

      if (!hostIsPro) {
        if ((parsed.data as any).maxJudges > 0) {
          return res.status(403).json({ error: "Judges require a Pro subscription" });
        }
        if ((parsed.data as any).maxSpectators > 0) {
          return res.status(403).json({ error: "Spectators require a Pro subscription" });
        }
        if (parsed.data.debateMode === "buzzer") {
          return res.status(403).json({ error: "Buzzer mode requires a Pro subscription" });
        }
        if (parsed.data.votingEnabled) {
          return res.status(403).json({ error: "Topic voting requires a Pro subscription" });
        }
      }

      const room = await RoomService.createRoom(
        req.userId!,
        req.username!,
        parsed.data
      );

      res.status(201).json(room);
    } catch (error) {
      console.error("[RoomRoutes] Create room error:", error);
      res.status(500).json({ error: "Failed to create room" });
    }
  });

  /**
   * GET /rooms/stats - Live platform activity counts (auth required)
   */
  router.get("/stats", authMiddleware, async (_req: Request, res: Response) => {
    try {
      const [{ Room }, { Debate }] = await Promise.all([
        import("../models/Room.model.js"),
        import("../models/Debate.model.js"),
      ]);
      const [activeRooms, liveDebates, totalDebates] = await Promise.all([
        Room.countDocuments({ status: { $in: ["lobby", "voting", "ready-up", "prep"] } }),
        Room.countDocuments({ status: "live" }),
        Debate.countDocuments({}),
      ]);
      res.json({ activeRooms, liveDebates, totalDebates });
    } catch {
      res.json({ activeRooms: 0, liveDebates: 0, totalDebates: 0 });
    }
  });

  /**
   * GET /rooms/:code - Get room details by code (auth required)
   */
  router.get("/:code", authMiddleware, async (req: Request, res: Response) => {
    try {
      const room = await RoomService.getRoomByCode(req.params.code);

      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      res.json(room);
    } catch (error) {
      console.error("[RoomRoutes] Get room error:", error);
      res.status(500).json({ error: "Failed to get room" });
    }
  });

  /**
   * POST /rooms/join - Join an existing room
   *
   * Accepts an optional `role` field ("participant" | "judge" | "spectator").
   * Defaults to "participant" when omitted.  The role is enforced against
   * maxJudges / maxSpectators in RoomService.joinRoom so that capacity
   * violations surface here, before the user ever reaches the lobby.
   */
  router.post("/join", authMiddleware, async (req: Request, res: Response) => {
    try {
      // Extend JoinRoomSchema with optional role field
      const { z } = await import("zod");
      const JoinRoomWithRoleSchema = JoinRoomSchema.and(
        z.object({
          role: z.enum(["participant", "judge", "spectator"]).optional().default("participant"),
        })
      );

      const parsed = JoinRoomWithRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error });
      }

      const room = await RoomService.joinRoom(
        parsed.data.code,
        req.userId!,
        req.username!,
        parsed.data.role as any,
      );

      res.json(room);
    } catch (error: any) {
      console.error("[RoomRoutes] Join room error:", error);

      if (error.message === "Room not found") {
        return res.status(404).json({ error: "Room not found" });
      }
      if (error.message === "Room is full") {
        return res.status(403).json({ error: "Room is full" });
      }
      // Capacity errors for specific roles (e.g. "Judge slots are full (max 2)")
      if (/slots are full/i.test(error.message)) {
        return res.status(403).json({ error: error.message });
      }

      res.status(500).json({ error: "Failed to join room" });
    }
  });

  /**
   * PUT /rooms/:roomId/settings - Update room settings (creator only)
   */
  router.put(
    "/:roomId/settings",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const parsed = UpdateRoomSettingsSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid input", details: parsed.error });
        }

        const room = await RoomService.updateRoomSettings(
          req.params.roomId,
          req.userId!,
          parsed.data
        );

        res.json(room);
      } catch (error: any) {
        console.error("[RoomRoutes] Update room settings error:", error);

        if (error.message === "Room not found") {
          return res.status(404).json({ error: "Room not found" });
        }
        if (error.message === "Only room creator can update settings") {
          return res.status(403).json({ error: "Not authorized" });
        }
        if (error.message === "Cannot update settings after debate starts") {
          return res.status(400).json({ error: error.message });
        }

        res.status(500).json({ error: "Failed to update room settings" });
      }
    }
  );

  return router;
}