import { Room, type ParticipantRole } from "../models/Room.model.js";
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
          .map((text: string) => text.trim())
          .filter((text: string) => text.length > 0)
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
      maxJudges: 3,
      maxSpectators: 50,
      isPremiumRoom: false,
      votingEnabled: data.votingEnabled || false,
      votingTopics: votingTopics,
      votingDuration: data.votingDuration || 30,
      prepDuration: data.prepDuration || 120,
      turnDuration: data.turnDuration || 300,
      totalRounds: data.totalRounds || 2,
      transcriptionMode: data.transcriptionMode || "whisper",
      whisperBudgetMinutes: data.whisperBudgetMinutes,
      whisperMinutesUsed: 0,
      participants: [
        {
          userId: creatorId,
          username: creatorUsername,
          role: "moderator",
          joinedAt: new Date(),
          status: "ready",
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
   * Join room with user.
   *
   * Uses atomic findOneAndUpdate operations to avoid Mongoose VersionError
   * when multiple sockets emit room:join concurrently for the same room.
   *
   * @param role - The role the user wants to join as. Defaults to "participant".
   *               "moderator" is reserved for the host and cannot be self-assigned.
   */
  static async joinRoom(
    roomCode: string,
    userId: string,
    username: string,
    role: ParticipantRole = "participant",
  ) {
    // Prevent guests from self-assigning host role
    const safeRole: ParticipantRole =
      role === "moderator" ? "participant" : role;
    const code = roomCode.toUpperCase();

    // ── Case 1a: existing slot, disconnected → revive to "joined" ───────
    const revivedRoom = await Room.findOneAndUpdate(
      { code, "participants.userId": userId, "participants.status": "disconnected" },
      {
        $set: {
          "participants.$[elem].status": "joined",
          "participants.$[elem].username": username,
          "participants.$[elem].joinedAt": new Date(),
          // Update role only if they're changing from participant; preserve moderator role
          "participants.$[elem].role": safeRole,
        },
      },
      { arrayFilters: [{ "elem.userId": userId }], new: true },
    );
    if (revivedRoom) return revivedRoom;

    // ── Case 1b: existing slot, non-disconnected → refresh username ──────
    const existingRoom = await Room.findOneAndUpdate(
      { code, "participants.userId": userId },
      { $set: { "participants.$[elem].username": username } },
      { arrayFilters: [{ "elem.userId": userId }], new: true },
    );
    if (existingRoom) return existingRoom;

    // ── Case 2: new participant — atomic capacity-check + push ──────────
    // The filter `"participants.userId": { $ne: userId }` ensures we only
    // push if the user truly doesn't have a slot yet. Two concurrent calls
    // can't both succeed because the second will no longer satisfy the
    // filter after the first inserts the subdoc — eliminating the TOCTOU
    // race that caused duplicate entries.
    const room = await Room.findOne({ code });
    if (!room) throw new Error("Room not found");

    const activeCount = room.participants.filter(
      (p) => p.status !== "disconnected"
    ).length;
    if (activeCount >= room.maxParticipants) {
      throw new Error("Room is full");
    }

    const newRoom = await Room.findOneAndUpdate(
      {
        code,
        // Only push if this user truly has no slot (prevents concurrent-join dups)
        "participants.userId": { $ne: userId },
        // Re-check capacity atomically in the same query filter
        $expr: {
          $lt: [
            { $size: { $filter: { input: "$participants", as: "p", cond: { $ne: ["$$p.status", "disconnected"] } } } },
            "$maxParticipants",
          ],
        },
      },
      {
        $push: {
          participants: {
            userId,
            username,
            role: safeRole,
            joinedAt: new Date(),
            status: "joined",
          },
        },
      },
      { new: true }
    );

    // If newRoom is null here it means either the room was just filled by
    // a concurrent join, OR this user's slot appeared (another concurrent
    // join for the same user succeeded first). Re-fetch and return.
    if (!newRoom) {
      const finalRoom = await Room.findOne({ code });
      if (!finalRoom) throw new Error("Room not found");
      // Check if we ended up in the participants list (race winner inserted us)
      const inRoom = finalRoom.participants.some((p) => p.userId === userId);
      if (!inRoom) throw new Error("Room is full");
      return finalRoom;
    }
    return newRoom;
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
    if (updates.totalRounds !== undefined)
      room.totalRounds = updates.totalRounds;
    if (updates.transcriptionMode !== undefined)
      room.transcriptionMode = updates.transcriptionMode;
    if (updates.whisperBudgetMinutes !== undefined)
      room.whisperBudgetMinutes = updates.whisperBudgetMinutes;

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
    const room = await Room.findOneAndUpdate(
      { _id: roomId, "participants.userId": userId },
      { $set: { "participants.$[elem].status": status } },
      { arrayFilters: [{ "elem.userId": userId }], new: true },
    );
    if (!room) throw new Error("Room or participant not found");
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

    // Find the participant being removed so we can tell if they were host/moderator
    const leavingParticipant = room.participants.find((p) => p.userId === userId);

    // Remove the participant from the room
    room.participants = room.participants.filter((p) => p.userId !== userId);

    // If no participants left, close (delete) the room
    if (room.participants.length === 0) {
      await Room.deleteOne({ _id: roomId });
      return null;
    }

    // If the leaving participant was the host/moderator, promote a new host.
    // Priority: judges first, then participants, then spectators.
    if (leavingParticipant?.role === "moderator") {
      // Clear any existing moderator roles just in case
      room.participants.forEach((p) => {
        if (p.role === "moderator") p.role = "participant";
      });

      // Pick by priority: judge → participant → spectator
      const priorityOrder: ParticipantRole[] = ["judge", "participant", "spectator"];
      let newHost: typeof room.participants[0] | undefined;
      for (const priorityRole of priorityOrder) {
        const candidates = room.participants.filter((p) => p.role === priorityRole);
        if (candidates.length > 0) {
          newHost = candidates[Math.floor(Math.random() * candidates.length)];
          break;
        }
      }
      // Fallback: any remaining participant
      if (!newHost) newHost = room.participants[0];

      newHost.role = "moderator";
      newHost.status = "ready" as any;

      // Update creator info so future "creator-only" checks align with the current host
      room.creatorId = newHost.userId;
      room.creatorUsername = newHost.username;
    }

    await room.save();
    return room;
  }

  /**
   * Start voting phase
   */
  static async startVoting(roomId: string) {
    const room = await this.getRoomById(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    if (!room.votingEnabled || room.votingTopics.length === 0) {
      throw new Error("Voting is not enabled for this room");
    }

    // Reset voting state
    room.votingInProgress = true;
    room.userVotes = [];
    room.votingTopics.forEach((topic) => {
      topic.votes = 0;
    });
    room.votingStartTime = new Date();
    room.status = "voting";

    await room.save();
    return room;
  }

  /**
   * Record user vote
   */
  static async recordVote(roomId: string, userId: string, topicId: string) {
    const room = await this.getRoomById(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    if (!room.votingInProgress) {
      throw new Error("Voting is not in progress");
    }

    // Check if topic exists
    const topic = room.votingTopics.find((t) => t.id === topicId);
    if (!topic) {
      throw new Error("Topic not found");
    }

    // Remove previous vote by this user (if any)
    room.userVotes = room.userVotes.filter((v) => v.userId !== userId);

    // Add new vote
    room.userVotes.push({
      userId,
      topicId,
    });

    // Update vote count
    room.votingTopics.forEach((t) => {
      t.votes = room.userVotes.filter((v) => v.topicId === t.id).length;
    });

    await room.save();
    return room;
  }

  /**
   * Change a participant's role. Only the host may call this, and only
   * while the room is in "lobby" status (roles lock once the debate starts).
   * The moderator role cannot be assigned this way — use transferHost instead.
   */
  static async changeParticipantRole(
    roomId: string,
    requesterId: string,
    targetUserId: string,
    newRole: ParticipantRole,
  ) {
    const room = await this.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    const requester = room.participants.find((p) => p.userId === requesterId);
    const isHost = room.creatorId === requesterId || requester?.role === "moderator";
    if (!isHost) throw new Error("Only the host can change participant roles");

    if (room.status !== "lobby") {
      throw new Error("Roles are locked once the debate has started");
    }

    const validRoles: ParticipantRole[] = ["participant", "judge", "spectator"];
    if (!validRoles.includes(newRole)) {
      throw new Error("Invalid role — choose participant, judge, or spectator");
    }

    // Cannot change the host's own role via this method
    if (targetUserId === requesterId) {
      throw new Error("Use transfer-host to change the host role");
    }

    const updated = await Room.findOneAndUpdate(
      { _id: roomId, "participants.userId": targetUserId },
      { $set: { "participants.$[elem].role": newRole } },
      { arrayFilters: [{ "elem.userId": targetUserId }], new: true },
    );
    if (!updated) throw new Error("Participant not found");
    return updated;
  }

  /**
   * Transfer the host role to another participant.
   * The old host becomes a regular participant.
   * Only the current host may call this.
   */
  static async transferHost(
    roomId: string,
    currentHostId: string,
    targetUserId: string,
  ) {
    const room = await this.getRoomById(roomId);
    if (!room) throw new Error("Room not found");

    const isHost =
      room.creatorId === currentHostId ||
      room.participants.find((p) => p.userId === currentHostId)?.role === "moderator";
    if (!isHost) throw new Error("Only the current host can transfer host");

    const target = room.participants.find((p) => p.userId === targetUserId);
    if (!target) throw new Error("Target participant not found");

    // Demote old host
    room.participants.forEach((p) => {
      if (p.userId === currentHostId) p.role = "participant";
    });

    // Promote new host
    target.role = "moderator";
    target.status = "ready" as any;

    room.creatorId = targetUserId;
    room.creatorUsername = target.username;

    await room.save();
    return room;
  }

  /**
   * End voting and select winner
   */
  static async endVoting(roomId: string) {
    const room = await this.getRoomById(roomId);

    if (!room) {
      throw new Error("Room not found");
    }

    if (!room.votingInProgress) {
      throw new Error("Voting is not in progress");
    }

    // Find topic with most votes
    let winnerTopic = room.votingTopics[0];
    for (const topic of room.votingTopics) {
      if (topic.votes > winnerTopic.votes) {
        winnerTopic = topic;
      }
    }

    room.votingInProgress = false;
    room.selectedTopic = winnerTopic.id;
    // Promote the winning topic text to room.topic so the lobby
    // and all downstream phases (prep/live) display the chosen motion.
    room.topic = winnerTopic.text;
    // Move room out of the voting phase. We return to lobby so
    // participants can ready up before the host starts the debate.
    room.status = "lobby";

    await room.save();
    return room;
  }
}
