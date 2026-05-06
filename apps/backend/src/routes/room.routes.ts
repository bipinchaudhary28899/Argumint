import express, { Request, Response } from "express";
import { createAuthMiddleware } from "../middleware/auth.middleware.js";
import Redis from "ioredis";
import {
  CreateRoomSchema,
  JoinRoomSchema,
  UpdateRoomSettingsSchema,
} from "@argumint/shared";
import { RoomService } from "../services/room.service.js";

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

      const room = await RoomService.createRoom(
        req.userId!,
        req.username!, // ← was: req.email!.split("@")[0]
        parsed.data
      );

      res.status(201).json(room);
    } catch (error) {
      console.error("[RoomRoutes] Create room error:", error);
      res.status(500).json({ error: "Failed to create room" });
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
   */
  router.post("/join", authMiddleware, async (req: Request, res: Response) => {
    try {
      const parsed = JoinRoomSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error });
      }

      const room = await RoomService.joinRoom(
        parsed.data.code,
        req.userId!,
        req.username! // ← was: req.email!.split("@")[0]
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