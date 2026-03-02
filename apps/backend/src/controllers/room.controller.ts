import { Request, Response } from "express";
import { RoomService } from "../services/room.service.js";
import {
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
} from "@argumint/shared";
import { ZodError } from "zod";

export class RoomController {
  private roomService: RoomService;

  constructor() {
    this.roomService = new RoomService();
  }

  async createRoom(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const email = req.email;

      if (!userId || !email) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Validate request body
      const validatedData = CreateRoomRequestSchema.parse(req.body);

      // Get username from body or email
      const username =
        (req.body.username as string) ||
        email.split("@")[0];

      const room = await this.roomService.createRoom(
        userId,
        username,
        validatedData
      );

      res.status(201).json(room);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ errors: error.errors });
      } else {
        const err = error as Error;
        res.status(500).json({ error: err.message });
      }
    }
  }

  async joinRoom(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const email = req.email;

      if (!userId || !email) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const validatedData = JoinRoomRequestSchema.parse(req.body);
      const username =
        (req.body.username as string) ||
        email.split("@")[0];

      const room = await this.roomService.joinRoom(
        userId,
        username,
        validatedData.code,
        validatedData.password
      );

      res.status(200).json(room);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ errors: error.errors });
      } else {
        const err = error as Error;
        const message = err.message;
        if (
          message.includes("Room not found") ||
          message.includes("Invalid")
        ) {
          res.status(404).json({ error: message });
        } else if (message.includes("full") || message.includes("already")) {
          res.status(400).json({ error: message });
        } else {
          res.status(500).json({ error: message });
        }
      }
    }
  }

  async getPublicRooms(req: Request, res: Response): Promise<void> {
    try {
      const rooms = await this.roomService.getPublicRooms();
      res.status(200).json(rooms);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }

  async getUserRooms(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const rooms = await this.roomService.getUserRooms(userId);
      res.status(200).json(rooms);
    } catch (error) {
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  }

  async getRoomById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const room = await this.roomService.getRoomById(id);
      res.status(200).json(room);
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }

  async getRoomByCode(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.params;
      const room = await this.roomService.getRoomByCode(code);
      res.status(200).json(room);
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }

  async updateRoom(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const validatedData = CreateRoomRequestSchema.partial().parse(req.body);
      const room = await this.roomService.updateRoom(id, userId, validatedData);

      res.status(200).json(room);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ errors: error.errors });
      } else {
        const err = error as Error;
        if (
          err.message.includes("not found") ||
          err.message.includes("not in waiting")
        ) {
          res.status(404).json({ error: err.message });
        } else if (err.message.includes("Only room creator")) {
          res.status(403).json({ error: err.message });
        } else {
          res.status(500).json({ error: err.message });
        }
      }
    }
  }

  async leaveRoom(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      await this.roomService.leaveRoom(id, userId);
      res.status(200).json({ message: "Left room successfully" });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }

  async deleteRoom(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      await this.roomService.deleteRoom(id, userId);
      res.status(200).json({ message: "Room deleted successfully" });
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
      } else if (err.message.includes("Only room creator")) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }

  async startRoom(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const room = await this.roomService.startRoom(id, userId);
      res.status(200).json(room);
    } catch (error) {
      const err = error as Error;
      if (
        err.message.includes("not found") ||
        err.message.includes("not in waiting")
      ) {
        res.status(404).json({ error: err.message });
      } else if (err.message.includes("Only room creator")) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }

  async endRoom(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const { id } = req.params;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const room = await this.roomService.endRoom(id, userId);
      res.status(200).json(room);
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
      } else if (err.message.includes("Only room creator")) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  }
}
