import { Room } from "../models/Room.model.js";
import {
  CreateRoomRequest,
  PublicRoom,
  Participant,
} from "@argumint/shared";

// Generate a 6-character alphanumeric code
function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate a unique room code with retry logic
async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode();
    const existing = await Room.findOne({ code });
    if (!existing) {
      return code;
    }
  }
  throw new Error("Failed to generate unique room code");
}

export class RoomService {
  async createRoom(
    userId: string,
    username: string,
    data: CreateRoomRequest
  ): Promise<PublicRoom> {
    const code = await generateUniqueCode();

    const participant: Participant = {
      userId,
      username,
      side: "neutral",
      isReady: false,
      joinedAt: new Date(),
    };

    const room = await Room.create({
      ...data,
      code,
      createdBy: userId,
      participants: [participant],
      status: "waiting",
    });

    return this.formatPublicRoom(room);
  }

  async joinRoom(
    userId: string,
    username: string,
    code: string,
    password?: string
  ): Promise<PublicRoom> {
    const room = await Room.findOne({ code });
    if (!room) {
      throw new Error("Room not found");
    }

    // Check room status
    if (room.status !== "waiting") {
      throw new Error("Room is not accepting new participants");
    }

    // Check participant limit
    if (room.participants.length >= room.maxParticipants) {
      throw new Error("Room is full");
    }

    // Check if user is already in the room
    if (room.participants.some((p) => p.userId === userId)) {
      throw new Error("User already in room");
    }

    // Check password if private
    if (room.privacy === "private") {
      if (!password) {
        throw new Error("Password required for private room");
      }
      const isPasswordValid = await room.comparePassword(password);
      if (!isPasswordValid) {
        throw new Error("Invalid room password");
      }
    }

    // Add participant
    const participant: Participant = {
      userId,
      username,
      side: room.mode === "team" ? "neutral" : "neutral",
      isReady: false,
      joinedAt: new Date(),
    };

    room.participants.push(participant);
    await room.save();

    return this.formatPublicRoom(room);
  }

  async getPublicRooms(): Promise<PublicRoom[]> {
    const rooms = await Room.find({
      privacy: "public",
      status: "waiting",
    })
      .sort({ createdAt: -1 })
      .lean();

    return rooms.map((room) => this.formatPublicRoom(room));
  }

  async getUserRooms(userId: string): Promise<PublicRoom[]> {
    const rooms = await Room.find({
      $or: [
        { createdBy: userId },
        { "participants.userId": userId },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    return rooms.map((room) => this.formatPublicRoom(room));
  }

  async getRoomById(roomId: string): Promise<PublicRoom> {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    return this.formatPublicRoom(room);
  }

  async getRoomByCode(code: string): Promise<PublicRoom> {
    const room = await Room.findOne({ code });
    if (!room) {
      throw new Error("Room not found");
    }
    return this.formatPublicRoom(room);
  }

  async updateRoom(
    roomId: string,
    userId: string,
    data: Partial<CreateRoomRequest>
  ): Promise<PublicRoom> {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.createdBy !== userId) {
      throw new Error("Only room creator can update the room");
    }

    if (room.status !== "waiting") {
      throw new Error("Cannot update a room that is not in waiting status");
    }

    // Update fields
    if (data.name) room.name = data.name;
    if (data.topic) room.topic = data.topic;
    if (data.maxParticipants) room.maxParticipants = data.maxParticipants;
    if (data.privacy) room.privacy = data.privacy;
    if (data.password) room.password = data.password;

    await room.save();
    return this.formatPublicRoom(room);
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    // Remove participant
    room.participants = room.participants.filter((p) => p.userId !== userId);

    // If creator leaves, delete the room
    if (room.createdBy === userId) {
      await Room.deleteOne({ _id: roomId });
      return;
    }

    // If no participants left, delete the room
    if (room.participants.length === 0) {
      await Room.deleteOne({ _id: roomId });
      return;
    }

    await room.save();
  }

  async deleteRoom(roomId: string, userId: string): Promise<void> {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.createdBy !== userId) {
      throw new Error("Only room creator can delete the room");
    }

    await Room.deleteOne({ _id: roomId });
  }

  async startRoom(roomId: string, userId: string): Promise<PublicRoom> {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.createdBy !== userId) {
      throw new Error("Only room creator can start the debate");
    }

    if (room.status !== "waiting") {
      throw new Error("Room is not in waiting status");
    }

    room.status = "active";
    await room.save();
    return this.formatPublicRoom(room);
  }

  async endRoom(roomId: string, userId: string): Promise<PublicRoom> {
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.createdBy !== userId) {
      throw new Error("Only room creator can end the debate");
    }

    room.status = "ended";
    await room.save();
    return this.formatPublicRoom(room);
  }

  private formatPublicRoom(room: any): PublicRoom {
    const { password, ...publicRoom } = room.toObject ? room.toObject() : room;
    return publicRoom;
  }
}
