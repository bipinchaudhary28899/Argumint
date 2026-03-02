import { Router } from "express";
import { RoomController } from "../controllers/room.controller.js";
import { createAuthMiddleware } from "../middleware/auth.middleware.js";
import Redis from "ioredis";

export function createRoomRoutes(redisClient: Redis | null): Router {
  const router = Router();
  const roomController = new RoomController();
  const authMiddleware = createAuthMiddleware(redisClient);

  // Create room (protected)
  router.post("/", authMiddleware, (req, res) =>
    roomController.createRoom(req, res)
  );

  // Join room (protected)
  router.post("/join", authMiddleware, (req, res) =>
    roomController.joinRoom(req, res)
  );

  // Get public rooms (protected)
  router.get("/", authMiddleware, (req, res) =>
    roomController.getPublicRooms(req, res)
  );

  // Get user's rooms (protected)
  router.get("/my-rooms", authMiddleware, (req, res) =>
    roomController.getUserRooms(req, res)
  );

  // Get room by ID (protected)
  router.get("/:id", authMiddleware, (req, res) =>
    roomController.getRoomById(req, res)
  );

  // Get room by code (protected)
  router.get("/code/:code", authMiddleware, (req, res) =>
    roomController.getRoomByCode(req, res)
  );

  // Update room (protected, owner only)
  router.put("/:id", authMiddleware, (req, res) =>
    roomController.updateRoom(req, res)
  );

  // Delete room (protected, owner only)
  router.delete("/:id", authMiddleware, (req, res) =>
    roomController.deleteRoom(req, res)
  );

  // Leave room (protected)
  router.post("/:id/leave", authMiddleware, (req, res) =>
    roomController.leaveRoom(req, res)
  );

  // Start room (protected, owner only)
  router.post("/:id/start", authMiddleware, (req, res) =>
    roomController.startRoom(req, res)
  );

  // End room (protected, owner only)
  router.post("/:id/end", authMiddleware, (req, res) =>
    roomController.endRoom(req, res)
  );

  return router;
}
