import { Server, Socket } from "socket.io";
import { createSocketAuthMiddleware } from "../middleware/socket.middleware.js";
import { RoomService } from "../services/room.service.js";
import Redis from "ioredis";

export function initializeSocketIO(
  httpServer: any,
  redisClient: Redis | null,
  corsOrigin: string
) {
  // In your socket initialization
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) return callback(null, true);
      if (origin === process.env.FRONTEND_URL) return callback(null, true);
      callback(new Error(`CORS policy rejects origin: ${origin}`));
    },
    credentials: true,
  },
});

  // Apply authentication middleware
  io.use(createSocketAuthMiddleware(redisClient));

  // Connection handler
  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId;
    const username = socket.data.username;

    // ==================== ROOM EVENTS ====================

    /**
     * Join room event
     * Client emits: { roomCode: string }
     * Server responds: { success: bool, room?: Room, error?: string }
     */
    socket.on("room:join", async (data, callback) => {
      try {
        const { roomCode } = data;

        if (!roomCode) {
          return callback({ success: false, error: "Room code required" });
        }

        let room = await RoomService.getRoomByCode(roomCode);

        if (!room) {
          return callback({ success: false, error: "Room not found" });
        }

        // Check if user already in participants
        const isParticipant = room.participants.some((p) => p.userId === userId);

        // If not already a participant, add them
        if (!isParticipant) {
          room = await RoomService.joinRoom(roomCode, userId, username);
        }

        // Join socket.io room FIRST with room ID
        socket.join(`room:${room._id}`);
        // ADD THIS - check who is actually in the channel
    const socketsInRoom = await io.in(`room:${room._id}`).fetchSockets();
        // Store room context on socket
        socket.data.roomId = room._id.toString();
        socket.data.roomCode = roomCode;

        // Respond to client with updated room
        callback({
          success: true,
          room: room.toObject(),
        });


        // THEN broadcast participant joined to ALL in room (this will reach the new user since they just joined the socket room)
        const broadcastData = {
          roomId: room._id.toString(),
          participants: room.participants,
          message: `${username} joined the room`,
        };
        
        try {
          io.to(`room:${room._id}`).emit("room:participant-joined", broadcastData);
        } catch (broadcastError) {
          console.error("[v0] Error during broadcast:", broadcastError);
        }
      } catch (error) {
        console.error("[Socket] Room join error:", error);
        callback({ success: false, error: "Failed to join room" });
      }
    });

    /**
     * Leave room event
     * Client emits: { roomId: string }
     */
    socket.on("room:leave", async (data) => {
      try {
        const { roomId } = data;

        if (!roomId) return;

        // Leave socket.io room
        socket.leave(`room:${roomId}`);

        // Update participant status
        const room = await RoomService.removeParticipant(roomId, userId);

        // Notify others
        if (room) {
          io.to(`room:${roomId}`).emit("room:participant-left", {
            userId,
            username,
            participants: room.participants,
          });
        } else {
          // Room is empty, notify all clients
          io.emit("room:deleted", { roomId });
        }
      } catch (error) {
        console.error("[Socket] Room leave error:", error);
      }
    });

    /**
     * Update participant status (e.g., "ready")
     * Client emits: { roomId: string, status: string }
     */
    socket.on("room:update-status", async (data) => {
      try {
        const { roomId, status } = data;

        if (!roomId || !status) return;

        const room = await RoomService.updateParticipantStatus(
          roomId,
          userId,
          status
        );

        // Broadcast status update to room
        io.to(`room:${roomId}`).emit("room:participant-status-updated", {
          userId,
          username,
          status,
          participants: room.participants,
        });

      } catch (error) {
        console.error("[Socket] Update status error:", error);
      }
    });

    /**
     * Get current room state
     * Client emits: { roomId: string }
     * Server responds with current room data
     */
    socket.on("room:get-state", async (data, callback) => {
      try {
        const { roomId } = data;

        if (!roomId) {
          return callback({ success: false, error: "Room ID required" });
        }

        const room = await RoomService.getRoomById(roomId);

        if (!room) {
          return callback({ success: false, error: "Room not found" });
        }

        callback({
          success: true,
          room: room.toObject(),
        });
      } catch (error) {
        console.error("[Socket] Get state error:", error);
        callback({ success: false, error: "Failed to get room state" });
      }
    });

    // ==================== VOTING EVENTS ====================

    /**
     * Start voting phase
     * Client emits: { roomId: string }
     */
    socket.on("room:start-voting", async (data, callback) => {
      try {
        const { roomId } = data;

        if (!roomId) {
          return callback({ success: false, error: "Room ID required" });
        }

        const room = await RoomService.startVoting(roomId);

        // Broadcast voting started to all in room
        io.to(`room:${roomId}`).emit("room:voting-started", {
          roomId,
          votingInProgress: true,
          votingTopics: room.votingTopics,
          votingStartTime: room.votingStartTime,
        });

        callback({ success: true, room: room.toObject() });
      } catch (error) {
        console.error("[Socket] Start voting error:", error);
        callback({ success: false, error: (error as any).message || "Failed to start voting" });
      }
    });

    /**
     * Vote on a topic
     * Client emits: { roomId: string, topicId: string }
     */
    socket.on("room:vote-topic", async (data, callback) => {
      try {
        const { roomId, topicId } = data;

        if (!roomId || !topicId) {
          return callback({ success: false, error: "Room ID and topic ID required" });
        }

        const room = await RoomService.recordVote(roomId, userId, topicId);

        // Broadcast vote update to all in room
        io.to(`room:${roomId}`).emit("room:voting-update", {
          roomId,
          votingTopics: room.votingTopics,
          userVotes: room.userVotes,
        });

        callback({ success: true, room: room.toObject() });
      } catch (error) {
        console.error("[Socket] Vote topic error:", error);
        callback({ success: false, error: (error as any).message || "Failed to record vote" });
      }
    });

    /**
     * End voting phase
     * Client emits: { roomId: string }
     */
    socket.on("room:end-voting", async (data, callback) => {
      try {
        const { roomId } = data;

        if (!roomId) {
          return callback({ success: false, error: "Room ID required" });
        }

        const room = await RoomService.endVoting(roomId);

        // Find the selected topic text
        const selectedTopicObj = room.votingTopics.find((t) => t.id === room.selectedTopic);

        // Broadcast voting ended to all in room
        io.to(`room:${roomId}`).emit("room:voting-ended", {
          roomId,
          votingInProgress: false,
          selectedTopic: room.selectedTopic,
          selectedTopicText: selectedTopicObj?.text,
          votingTopics: room.votingTopics,
        });

        callback({ success: true, room: room.toObject() });
      } catch (error) {
        console.error("[Socket] End voting error:", error);
        callback({ success: false, error: (error as any).message || "Failed to end voting" });
      }
    });

    // ==================== DISCONNECT HANDLER ====================

    socket.on("disconnect", async () => {

      // Try to clean up room if user was in one
      if (socket.data.roomId) {
        try {
          const room = await RoomService.updateParticipantStatus(
            socket.data.roomId,
            userId,
            "disconnected"
          );

          io.to(`room:${socket.data.roomId}`).emit(
            "room:participant-disconnected",
            {
              userId,
              username,
              participants: room.participants,
            }
          );
        } catch (error) {
          console.error("[Socket] Disconnect cleanup error:", error);
        }
      }
    });
  });

  return io;
}
