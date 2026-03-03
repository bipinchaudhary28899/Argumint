import { Room } from "../models/Room.model.js";
import { generateUniqueRoomCode } from "../utils/room.utils.js";
import { CreateRoomInput, UpdateRoomSettingsInput } from "@argumint/shared";

export class RoomService {
  /**
   * Create a new room
   */
  static async createRoom(
    creatorId: string,
    creatorUsername: string,
    data: CreateRoomInput
  ) {
    const code = await generateUniqueRoomCode();

    // Process voting topics if voting is enabled
    const votingTopics = data.votingEnabled && data.votingTopics
      ? data.votingTopics
          .map((text: string) => text.trim()) // Trim whitespace
          .filter((text: string) => text.length > 0) // Remove empty strings
          .map((text: string, index: number) => ({
            id: `topic-${index + 1}`,
            text,
            votes: 0,
          }))
      : [];

    const room = new Room({
      code,
      creatorId,
      creatorUsername,
      topic: data.topic,
      description: data.description,
      debateMode: data.debateMode || "buzzer",
      maxParticipants: data.maxParticipants || 10,
      votingEnabled: data.votingEnabled || false,
      votingTopics: votingTopics,
      votingDuration: data.votingDuration || 30,
      prepDuration: data.prepDuration || 120,
      turnDuration: data.turnDuration || 300,
      participants: [
        {
          userId: creatorId,
          username: creatorUsername,
          role: "moderator",
          joinedAt: new Date(),
          status: "joined",
        },
      ],
      status: "lobby",
    });

    await room.save();
    return room;
  }

  /**
   * Get room by code
   */
  static async getRoomByCode(code: string) {
    return Room.findOne({ code: code.toUpperCase() });
  }

  /**
   * Get room by ID
   */
  static async getRoomById(roomId: string) {
    return Room.findById(roomId);
  }

  /**
   * Join room with user
   */
  static async joinRoom(roomCode: string, userId: string, username: string) {
    console.log("[v0-SERVICE] joinRoom called with:", { roomCode, userId, username });
    
    const room = await this.getRoomByCode(roomCode);
    
    if (!room) {
      throw new Error("Room not found");
    }

    console.log("[v0-SERVICE] Room found:", { roomId: room._id, participantCount: room.participants.length });

    // Check if room is full
    if (room.participants.length >= room.maxParticipants) {
      throw new Error("Room is full");
    }

    // Check if user already joined
    const alreadyJoined = room.participants.some(
      (p) => p.userId === userId
    );

    console.log("[v0-SERVICE] User already joined?", alreadyJoined);

    if (alreadyJoined) {
      console.log("[v0-SERVICE] User already in room, returning existing room");
      return room; // Already joined, return room as is
    }

    // Add participant
    room.participants.push({
      userId,
      username,
      role: "participant",
      joinedAt: new Date(),
      status: "joined",
    });

    console.log("[v0-SERVICE] Participant added, saving room with", room.participants.length, "participants");
    await room.save();
    console.log("[v0-SERVICE] Room saved successfully");
    return room;
  }

  /**
   * Update room settings (only creator can do this)
   */
  static async updateRoomSettings(
    roomId: string,
    creatorId: string,
    updates: UpdateRoomSettingsInput
  ) {
    const room = await this.getRoomById(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.creatorId !== creatorId) {
      throw new Error("Only room creator can update settings");
    }

    if (room.status !== "lobby") {
      throw new Error("Cannot update settings after debate starts");
    }

    // Update allowed fields
    if (updates.topic !== undefined) room.topic = updates.topic;
    if (updates.description !== undefined) room.description = updates.description;
    if (updates.debateMode !== undefined) room.debateMode = updates.debateMode;
    if (updates.maxParticipants !== undefined)
      room.maxParticipants = updates.maxParticipants;
    if (updates.votingDuration !== undefined)
      room.votingDuration = updates.votingDuration;
    if (updates.prepDuration !== undefined)
      room.prepDuration = updates.prepDuration;
    if (updates.turnDuration !== undefined)
      room.turnDuration = updates.turnDuration;

    await room.save();
    return room;
  }

  /**
   * Update participant status
   */
  static async updateParticipantStatus(
    roomId: string,
    userId: string,
    status: string
  ) {
    const room = await this.getRoomById(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    const participant = room.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new Error("Participant not found in room");
    }

    participant.status = status as any;
    await room.save();
    return room;
  }

  /**
   * Remove participant from room
   */
  static async removeParticipant(roomId: string, userId: string) {
    const room = await this.getRoomById(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    room.participants = room.participants.filter((p) => p.userId !== userId);

    // Delete room if no participants left
    if (room.participants.length === 0) {
      await Room.deleteOne({ _id: roomId });
      return null;
    }

    await room.save();
    return room;
  }
}
