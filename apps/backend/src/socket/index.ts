import { Server, Socket } from "socket.io";
import { createSocketAuthMiddleware } from "../middleware/socket.middleware.js";
import { RoomService } from "../services/room.service.js";
import Redis from "ioredis";

export function initializeSocketIO(
  httpServer: any,
  redisClient: Redis | null,
  corsOrigin: string
) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin || "http://localhost:5173",
      credentials: true,
    },
  });

  // Apply authentication middleware
  io.use(createSocketAuthMiddleware(redisClient));

  // Connection handler
  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId;
    const username = socket.data.username;

    console.log(`[Socket] User ${username} (${userId}) connected:`, socket.id);

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

        // Store room context on socket
        socket.data.roomId = room._id.toString();
        socket.data.roomCode = roomCode;

        console.log(
          `[v0] User ${username} joined room ${roomCode} (${room._id}), isParticipant: ${isParticipant}, totalParticipants: ${room.participants.length}`
        );

        // Respond to client with updated room
        callback({
          success: true,
          room: room.toObject(),
        });

        // THEN broadcast participant joined to ALL in room (this will reach the new user since they just joined the socket room)
        console.log(`[v0] Broadcasting room:participant-joined to room:${room._id} with ${room.participants.length} participants`);
        io.to(`room:${room._id}`).emit("room:participant-joined", {
          roomId: room._id.toString(),
          participants: room.participants,
          message: `${username} joined the room`,
        });
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

        console.log(
          `[Socket] User ${username} left room ${roomId}`
        );
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

        console.log(
          `[Socket] User ${username} status updated to ${status} in room ${roomId}`
        );
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

    // ==================== DISCONNECT HANDLER ====================

    socket.on("disconnect", async () => {
      console.log(
        `[v0] User ${username} (${userId}) disconnected:`,
        socket.id
      );

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
