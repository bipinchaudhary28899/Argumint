import { Server, Socket } from "socket.io";
import { createSocketAuthMiddleware } from "../middleware/socket.middleware.js";
import { RoomService } from "../services/room.service.js";
import { DebateService } from "../services/debate.service.js";
import { JudgeService } from "../services/judge.service.js";
import { type IDebate, Debate } from "../models/Debate.model.js";
import { Room } from "../models/Room.model.js";
import { User } from "../models/User.model.js";
import { getLevelInfo } from "@argumint/shared";
import Redis from "ioredis";

/**
 * In-memory map of active debate timers, keyed by debateId.
 * Single-node only — for horizontal scaling move to Redis.
 */
const activeTimers = new Map<string, NodeJS.Timeout>();

/**
 * userId → socket.id for every currently-connected socket.
 * Used to evict a stale connection instantly when the same user
 * logs in on a second device — no polling needed.
 */
const userSocketMap = new Map<string, string>();

/** Reference to the Socket.IO server, set once initializeSocketIO runs. */
let _io: Server | null = null;

/**
 * Evict any live socket belonging to userId.
 * Called by the auth controller immediately after a new session is created,
 * so Device A is disconnected at the moment Device B logs in.
 */
export function evictUserSocket(userId: string): void {
  if (!_io) return;
  const socketId = userSocketMap.get(userId);
  if (!socketId) return;
  const staleSocket = _io.sockets.sockets.get(socketId);
  if (staleSocket) {
    // Emit the eviction event first, then close the transport after a short
    // delay. Calling disconnect(true) synchronously after emit() can kill the
    // connection before the event is flushed to the client.
    staleSocket.emit("session:evicted");
    setTimeout(() => {
      try { staleSocket.disconnect(true); } catch { /* already gone */ }
    }, 300);
  }
  userSocketMap.delete(userId);
}

function clearDebateTimer(debateId: string) {
  const existing = activeTimers.get(debateId);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(debateId);
  }
}

export function initializeSocketIO(
  httpServer: any,
  redisClient: Redis | null,
  corsOrigin: string,
) {
  // In your socket initialization
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        const allowed = [
          corsOrigin, // passed-in FRONTEND_URL env var
          "http://localhost:5173",
          "https://argumint-frontend.vercel.app",
        ].filter(Boolean);

        if (
          allowed.includes(origin) ||
          /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
          /https:\/\/argumint.*\.vercel\.app$/.test(origin) // all Vercel preview URLs
        ) {
          return callback(null, true);
        }

        callback(new Error(`CORS policy rejects origin: ${origin}`));
      },
      credentials: true,
    },
  });

  // Apply authentication middleware
  io.use(createSocketAuthMiddleware(redisClient));

  // Store the server reference so evictUserSocket() can use it
  _io = io;

  // ── userId → socketId registry ──────────────────────────────────────────
  // Register every connected socket so evictUserSocket() can find and
  // disconnect it instantly when the user logs in on another device.
  io.on("connection", (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (userId) userSocketMap.set(userId, socket.id);
    socket.on("disconnect", () => {
      // Only delete if this socket is still the registered one
      // (a rapid reconnect could have already replaced it)
      if (userSocketMap.get(userId ?? "") === socket.id) {
        userSocketMap.delete(userId ?? "");
      }
    });
  });

  // ==================== DEBATE FLOW HELPERS ====================

  /**
   * Schedule a turn-end. Called every time a new turn starts. When the
   * timer fires the speaker hasn't submitted, so we auto-advance.
   *
   * Idempotent: callers should clearDebateTimer first if they're advancing
   * because the speaker submitted (vs ran out of time).
   */
  const scheduleTurnEnd = (debateId: string, roomCode: string, ms: number) => {
    clearDebateTimer(debateId);
    const t = setTimeout(async () => {
      activeTimers.delete(debateId);
      try {
        await advanceTurnAndBroadcast(debateId, roomCode, "timeout");
      } catch (err) {
        console.error("[Debate] Auto-advance error:", err);
      }
    }, ms);
    activeTimers.set(debateId, t);
  };

  /**
   * Fire-and-forget runner for the AI judge. Called after a debate
   * transitions to "ended". Broadcasts:
   *   - debate:result-ready { debateId, result } on success
   *   - debate:result-failed { debateId, error } on hard failure
   *
   * We do NOT await this in the calling code — the LLM call takes a
   * few seconds and would block the turn-advance broadcast. Instead
   * the result page on each client renders "judging…" until the
   * result-ready event arrives.
   */
  const runJudgeAsync = (debateId: string, roomId: string) => {
    void (async () => {
      try {
        const result = await JudgeService.judge(debateId);

        // Award XP and update win/loss/total stats for every participant
        const xpAwards: { userId: string; xpGained: number; newXP: number; leveledUp: boolean; newLevel: number; newLevelTitle: string }[] = [];
        await Promise.all(
          result.scores.map(async (score) => {
            const xpGained = score.total;
            const won = score.side === result.winnerSide;
            const updated = await User.findByIdAndUpdate(
              score.userId,
              {
                $inc: {
                  xp: xpGained,
                  "stats.totalDebates": 1,
                  "stats.debatesWon": won ? 1 : 0,
                  "stats.debatesLost": won ? 0 : 1,
                },
              },
              { new: true, select: "xp" },
            );
            const newXP = updated?.xp ?? xpGained;
            const prevXP = newXP - xpGained;
            const prev = getLevelInfo(prevXP);
            const curr = getLevelInfo(newXP);
            xpAwards.push({
              userId: score.userId,
              xpGained,
              newXP,
              leveledUp: curr.current.level > prev.current.level,
              newLevel: curr.current.level,
              newLevelTitle: curr.current.title,
            });
          })
        );

        // Fetch the latest judgeScores in case judges submitted during AI judging
        const freshDebate = await Debate.findById(debateId).select("judgeScores");
        io.to(`room:${roomId}`).emit("debate:result-ready", {
          debateId,
          result,
          xpAwards,
          judgeScores: freshDebate?.judgeScores ?? [],
        });
      } catch (err: any) {
        console.error("[Judge] Failed:", err?.message);
        io.to(`room:${roomId}`).emit("debate:result-failed", {
          debateId,
          error: err?.message || "Failed to judge debate",
        });
      }
    })();
  };

  /**
   * Open the 60-second judge scoring window after a debate ends.
   * Checks if the room has active judges. Broadcasts:
   *   debate:scoring-window-opened { debateId, locksAt, hasJudges, windowSecs }
   * After 60 s auto-locks scores and broadcasts:
   *   debate:judge-scores-locked { debateId, autoLocked: true }
   */
  const SCORING_WINDOW_SEC = 60;
  const openScoringWindow = async (debateId: string, roomId: string) => {
    try {
      const room = await Room.findById(roomId).lean();
      const activeJudges = ((room as any)?.participants ?? []).filter(
        (p: any) => p.role === "judge" && p.status !== "disconnected",
      );
      const hasJudges = activeJudges.length > 0;
      const locksAt   = new Date(Date.now() + SCORING_WINDOW_SEC * 1_000);

      io.to(`room:${roomId}`).emit("debate:scoring-window-opened", {
        debateId,
        locksAt:    locksAt.toISOString(),
        hasJudges,
        windowSecs: SCORING_WINDOW_SEC,
      });

      if (!hasJudges) return; // no one to wait for — clients navigate immediately

      // Server-side safety net: auto-lock when window expires.
      const lockTimer = setTimeout(async () => {
        activeTimers.delete(`${debateId}:scoring`);
        try {
          const d = await Debate.findById(debateId);
          if (d && !d.judgeScoresLockedAt) {
            d.judgeScoresLockedAt = new Date();
            await d.save();
          }
        } catch { /* best-effort */ }
        io.to(`room:${roomId}`).emit("debate:judge-scores-locked", {
          debateId,
          autoLocked: true,
        });
      }, SCORING_WINDOW_SEC * 1_000);
      activeTimers.set(`${debateId}:scoring`, lockTimer);
    } catch (err) {
      console.error("[ScoringWindow] Error:", err);
    }
  };

  /**
   * Broadcast the *current* turn (whatever's currently set on the debate)
   * and schedule its auto-end. Accepts an already-fetched debate to avoid
   * a redundant DB round-trip after startFirstTurn.
   */
  const broadcastCurrentTurn = async (
    debateId: string,
    roomCode: string,
    preloadedDebate?: IDebate | null,
  ) => {
    const debate = preloadedDebate ?? await DebateService.getById(debateId);
    if (!debate || !debate.currentTurn) return;
    const turn = debate.currentTurn;
    io.to(`room:${debate.roomId}`).emit("debate:turn-started", {
      debateId,
      roomCode,
      currentTurn: turn,
      roundNumber: turn.roundNumber,
      totalRounds: debate.totalRounds,
      turnIndex: turn.turnIndex,
    });
    const msUntilEnd = new Date(turn.endsAt).getTime() - Date.now();
    scheduleTurnEnd(debateId, roomCode, Math.max(0, msUntilEnd));
  };

  /**
   * Advance the debate one step (next speaker / next round / end) and
   * broadcast the resulting state to the room. Used for both the
   * "speaker submitted early" and "speaker timed out" transitions —
   * NOT for the very first turn after prep (that's broadcastCurrentTurn).
   */
  const advanceTurnAndBroadcast = async (
    debateId: string,
    roomCode: string,
    reason: "timeout" | "submitted",
  ) => {
    const { debate, finished } = await DebateService.advanceTurn(debateId);

    io.to(`room:${debate.roomId}`).emit("debate:turn-ended", {
      debateId,
      reason,
    });

    if (finished) {
      io.to(`room:${debate.roomId}`).emit("debate:ended", {
        debateId,
        rounds: debate.rounds,
        endedAt: debate.endedAt,
      });
      // Kick off the AI judge fire-and-forget. Clients show a "judging…"
      // state on the result page until we broadcast debate:result-ready.
      runJudgeAsync(debateId, debate.roomId);
      // Open the 60-second judge-scoring window.
      void openScoringWindow(debateId, debate.roomId);
      return;
    }

    const turn = debate.currentTurn!;
    io.to(`room:${debate.roomId}`).emit("debate:turn-started", {
      debateId,
      roomCode,
      currentTurn: turn,
      roundNumber: turn.roundNumber,
      totalRounds: debate.totalRounds,
      turnIndex: turn.turnIndex,
    });

    const msUntilEnd = new Date(turn.endsAt).getTime() - Date.now();
    scheduleTurnEnd(debateId, roomCode, Math.max(0, msUntilEnd));
  };

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

        // Only hit the DB to join/revive if the user isn't already an active
        // participant. This eliminates a redundant write every time the lobby
        // page mounts for someone who is already in the room.
        const existingSlot = room.participants.find(
          (p: any) => p.userId === userId && p.status !== "disconnected",
        );
        // The role from data.role is only used when creating a brand-new slot.
        // Once a slot exists the DB role is authoritative — the host may have
        // reassigned it via room:change-role, and we must never overwrite that
        // with the stale URL param the client sends on every page load/refresh.
        const desiredRole = (data.role as string) || "participant";

        if (!existingSlot) {
          room = await RoomService.joinRoom(roomCode, userId, username, desiredRole as any);
        }
        // If existingSlot is found, we intentionally skip joinRoom so the
        // DB role is preserved. Username refresh is handled inside joinRoom
        // Case 1b, but we don't need it here since the socket already knows
        // the username from the auth token.

        // Auto-ready the host/creator: their status should always be "ready"
        // because they're the one starting the debate. This handles the case
        // where the host reconnects (from DebatePage back to RoomLobby) and
        // their slot was revived to "joined" instead of "ready".
        const mySlot = room.participants.find((p: any) => p.userId === userId);
        if (
          mySlot &&
          mySlot.status === "joined" &&
          (room.creatorId === userId || mySlot.role === "moderator")
        ) {
          room = await RoomService.updateParticipantStatus(
            room._id.toString(),
            userId,
            "ready",
          );
        }

        // Join socket.io room FIRST with room ID
        socket.join(`room:${room._id}`);
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
          io.to(`room:${room._id}`).emit(
            "room:participant-joined",
            broadcastData,
          );
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
            // Include updated host info so clients re-derive isHost correctly
            creatorId: room.creatorId,
            creatorUsername: room.creatorUsername,
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
          status,
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
          status: room.status,
        });

        callback({ success: true, room: room.toObject() });
      } catch (error) {
        console.error("[Socket] Start voting error:", error);
        callback({
          success: false,
          error: (error as any).message || "Failed to start voting",
        });
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
          return callback({
            success: false,
            error: "Room ID and topic ID required",
          });
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
        callback({
          success: false,
          error: (error as any).message || "Failed to record vote",
        });
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
        const selectedTopicObj = room.votingTopics.find(
          (t) => t.id === room.selectedTopic,
        );

        // Broadcast voting ended to all in room.
        // Include the promoted room.topic and new status so clients can
        // refresh their lobby view (room.topic now holds the winning text,
        // status moved out of "voting" back to "lobby").
        io.to(`room:${roomId}`).emit("room:voting-ended", {
          roomId,
          votingInProgress: false,
          selectedTopic: room.selectedTopic,
          selectedTopicText: selectedTopicObj?.text,
          votingTopics: room.votingTopics,
          topic: room.topic,
          status: room.status,
        });

        callback({ success: true, room: room.toObject() });
      } catch (error) {
        console.error("[Socket] End voting error:", error);
        callback({
          success: false,
          error: (error as any).message || "Failed to end voting",
        });
      }
    });

    // ==================== DEBATE EVENTS ====================

    /**
     * Host starts the debate.
     * Client emits: { roomId: string }
     * Side assignment is randomized server-side. After this returns,
     * the room is in "prep" and a setTimeout is scheduled for prep-end.
     */
    socket.on("room:start-debate", async (data, callback) => {
      try {
        const { roomId } = data;
        if (!roomId) {
          return callback({ success: false, error: "Room ID required" });
        }

        const [debate, room] = await Promise.all([
          DebateService.startDebate(roomId, userId),
          RoomService.getRoomById(roomId),
        ]);

        // Broadcast debate-started so clients can navigate to /prep.
        io.to(`room:${roomId}`).emit("debate:started", {
          debateId: debate._id.toString(),
          roomId,
          roomCode: room?.code,
          topic: debate.topic,
          mode: debate.mode,
          totalRounds: debate.totalRounds,
          turnDuration: debate.turnDuration,
          prepDuration: debate.prepDuration,
          prepEndsAt: debate.prepEndsAt,
          turnOrder: debate.turnOrder,
          // Include updated participants so the lobby UI reflects assigned sides.
          participants: room?.participants ?? [],
          status: room?.status ?? "prep",
        });

        // Schedule the prep-end transition. When the timer fires we move
        // the debate from "prep" to "in_progress".
        const debateId = debate._id.toString();
        const roomCode = room?.code ?? "";
        const msUntilPrepEnd =
          (debate.prepEndsAt?.getTime() ?? Date.now()) - Date.now();

        // For buzzer mode: emit a 10s "get ready" warning before prep ends.
        if (debate.mode === "buzzer") {
          const msWarning = msUntilPrepEnd - 10_000;
          if (msWarning > 0) {
            const warnTimer = setTimeout(() => {
              activeTimers.delete(`${debateId}:warning`);
              io.to(`room:${roomId}`).emit("buzzer:warning", { secondsLeft: 10 });
            }, msWarning);
            activeTimers.set(`${debateId}:warning`, warnTimer);
          }
        }

        clearDebateTimer(debateId);
        const t = setTimeout(async () => {
          activeTimers.delete(debateId);
          try {
            if (debate.mode === "buzzer") {
              // Open the free-for-all grab window — no fixed first turn.
              const openedDebate = await DebateService.openBuzzerDebate(debateId);
              io.to(`room:${roomId}`).emit("buzzer:open", {
                debateId,
                roomCode,
                turnOrder: openedDebate.turnOrder,
              });
            } else {
              // Alternate mode: startFirstTurn sets currentTurn to (round 1, turn 0).
              // Broadcast directly — advanceTurn would skip the first speaker.
              const updatedDebate = await DebateService.startFirstTurn(debateId);
              await broadcastCurrentTurn(debateId, roomCode, updatedDebate);
            }
          } catch (err) {
            console.error("[Debate] Prep-end transition error:", err);
          }
        }, Math.max(0, msUntilPrepEnd));
        activeTimers.set(debateId, t);

        callback({ success: true, debate: debate.toObject() });
      } catch (error: any) {
        console.error("[Socket] Start debate error:", error);
        callback({
          success: false,
          error: error?.message || "Failed to start debate",
        });
      }
    });

    /**
     * Get current debate state (used by clients on page load /
     * navigation into /prep or /debate). This is also where a freshly
     * connected socket subscribes to the room broadcast channel —
     * each page mount creates a new socket via useSocket(), and without
     * this join the new socket would miss every io.to(`room:...`) emit.
     * Client emits: { debateId: string }
     */
    socket.on("debate:get-state", async (data, callback) => {
      try {
        const { debateId } = data;
        if (!debateId) {
          return callback({ success: false, error: "Debate ID required" });
        }
        const debate = await DebateService.getById(debateId);
        if (!debate) {
          return callback({ success: false, error: "Debate not found" });
        }

        // Subscribe this socket to the room broadcast channel so it
        // receives debate:turn-started, debate:argument-submitted, etc.
        socket.join(`room:${debate.roomId}`);
        socket.data.roomId = debate.roomId;
        socket.data.roomCode = debate.roomCode;

        // Include active room participants so the debate page can render
        // the judges/spectators panel without a separate round-trip.
        const room = await Room.findById(debate.roomId).lean();
        const roomParticipants = (room?.participants ?? []).filter(
          (p: any) => p.status !== "disconnected",
        );

        callback({ success: true, debate: debate.toObject(), roomParticipants });
      } catch (error: any) {
        console.error("[Socket] Get debate state error:", error);
        callback({
          success: false,
          error: error?.message || "Failed to get debate state",
        });
      }
    });

    /**
     * Speaker submits their argument (transcript text from Whisper).
     * Client emits: { debateId: string, argument: string }
     * On success, server records the round, broadcasts the new round,
     * cancels the pending turn-end timer, and immediately advances
     * (which broadcasts turn-ended + the next turn-started).
     */
    socket.on("debate:submit-argument", async (data, callback) => {
      try {
        const { debateId, argument } = data;
        if (!debateId || typeof argument !== "string") {
          return callback({
            success: false,
            error: "debateId and argument required",
          });
        }

        const debate = await DebateService.submitArgument(
          debateId,
          userId,
          argument,
        );

        const lastRound = debate.rounds[debate.rounds.length - 1];
        io.to(`room:${debate.roomId}`).emit("debate:argument-submitted", {
          debateId,
          round: lastRound,
          rounds: debate.rounds,
        });

        // Cancel the auto-timeout and advance immediately.
        clearDebateTimer(debateId);
        await advanceTurnAndBroadcast(
          debateId,
          debate.roomCode,
          "submitted",
        );

        callback({ success: true });
      } catch (error: any) {
        console.error("[Socket] Submit argument error:", error);
        callback({
          success: false,
          error: error?.message || "Failed to submit argument",
        });
      }
    });

    // ==================== BUZZER MODE EVENTS ====================

    /**
     * Shared helper: release the mic in buzzer mode. Records the round,
     * applies anti-starvation cooldown, opens the 5-second re-grab window.
     * Extracted so both the socket handler AND the server-side auto-timeout
     * can call it without duplicating logic.
     */
    const handleBuzzerRelease = async (
      debateId: string,
      speakerId: string,
      argument: string,
    ) => {
      const debate = await Debate.findById(debateId);
      if (!debate?.buzzerState) return;
      const bs = debate.buzzerState;

      // Stale event guard — only act if this user still holds the mic.
      if (bs.currentHolder !== speakerId) return;

      const now = new Date();
      const holderStart = bs.holderStartedAt ?? now;
      const elapsedSec = Math.max(
        0,
        Math.round((now.getTime() - holderStart.getTime()) / 1000),
      );
      const entry = debate.turnOrder.find((t) => t.userId === speakerId);
      const side = entry?.side ?? "for";

      // Record the round (roundNumber = total rounds so far + 1).
      debate.rounds.push({
        roundNumber: debate.rounds.length + 1,
        speakerId,
        speakerUsername: entry?.username ?? speakerId,
        side,
        argument: argument || "",
        submittedAt: now,
        durationSeconds: elapsedSec,
      });

      // Cancel per-speaker timers (auto-timeout + 10-second urgent warning).
      for (const key of [`${debateId}:speaker`, `${debateId}:urgent`]) {
        const t = activeTimers.get(key);
        if (t) { clearTimeout(t); activeTimers.delete(key); }
      }

      // Dynamic anti-starvation cooldown:
      // 1st speech → 15s, 2nd → 25s, 3rd → 35s … capped at 60s.
      const speakCount = bs.speakHistory.filter((id) => id === speakerId).length;
      const cooldownSec = Math.min(15 + (speakCount - 1) * 10, 60);
      const unlocksAt = new Date(now.getTime() + cooldownSec * 1_000);

      const cdIndex = bs.cooldowns.findIndex((c) => c.userId === speakerId);
      if (cdIndex >= 0) {
        bs.cooldowns[cdIndex].unlocksAt = unlocksAt;
      } else {
        bs.cooldowns.push({ userId: speakerId, unlocksAt });
      }

      bs.lastSpeaker = speakerId;
      bs.currentHolder = null;
      bs.holderStartedAt = null;

      // ── "Get Ready" prep phase ────────────────────────────────────────────
      // Grab window is NOT open yet — everyone has 5 seconds to prepare.
      debate.markModified("buzzerState");
      await debate.save();

      const lastRound = debate.rounds[debate.rounds.length - 1];
      const prepEndsAt = new Date(now.getTime() + 5_000);

      io.to(`room:${debate.roomId}`).emit("debate:argument-submitted", {
        debateId,
        round: lastRound,
        rounds: debate.rounds,
      });

      // Holder is gone; window not open yet.
      io.to(`room:${debate.roomId}`).emit("buzzer:holder-changed", {
        holder: null,
        username: null,
        grabWindowOpen: false,
        grabWindowEndsAt: null,
        excludedUserId: speakerId,
      });

      // Countdown broadcast so clients can show a "Get Ready" UI.
      io.to(`room:${debate.roomId}`).emit("buzzer:preparing", {
        endsAt: prepEndsAt,
        excludedUserId: speakerId,
      });

      // After 5 s prep: open the actual 5-second grab window.
      const prepTimer = setTimeout(async () => {
        activeTimers.delete(`${debateId}:preparing`);
        const d = await Debate.findById(debateId);
        if (!d?.buzzerState || d.buzzerState.grabWindowOpen || d.status !== "in_progress") return;
        const windowEndsAt = new Date(Date.now() + 5_000);
        d.buzzerState.grabWindowOpen = true;
        d.buzzerState.grabWindowEndsAt = windowEndsAt;
        d.markModified("buzzerState");
        await d.save();

        io.to(`room:${d.roomId}`).emit("buzzer:holder-changed", {
          holder: null,
          username: null,
          grabWindowOpen: true,
          grabWindowEndsAt: windowEndsAt,
          excludedUserId: speakerId,
        });
        io.to(`room:${d.roomId}`).emit("buzzer:window-open", {
          endsAt: windowEndsAt,
          excludedUserId: speakerId,
        });

        // Auto-close grab window after 5 s if nobody grabbed.
        const winTimer = setTimeout(async () => {
          activeTimers.delete(`${debateId}:window`);
          const d2 = await Debate.findById(debateId);
          if (!d2?.buzzerState || !d2.buzzerState.grabWindowOpen) return;
          d2.buzzerState.grabWindowOpen = false;
          d2.buzzerState.grabWindowEndsAt = null;
          d2.markModified("buzzerState");
          await d2.save();
          io.to(`room:${d2.roomId}`).emit("buzzer:window-closed", { debateId });
          io.to(`room:${d2.roomId}`).emit("buzzer:holder-changed", {
            holder: null, username: null,
            grabWindowOpen: false, grabWindowEndsAt: null, excludedUserId: null,
          });
        }, 5_000);
        activeTimers.set(`${debateId}:window`, winTimer);
      }, 5_000);
      activeTimers.set(`${debateId}:preparing`, prepTimer);
    };

    /**
     * Mic grab — first valid caller wins the floor.
     * Client emits: { debateId: string }
     */
    socket.on("buzzer:grab", async (data, callback) => {
      try {
        const { debateId } = data;
        if (!debateId) {
          return callback?.({ success: false, error: "debateId required" });
        }

        const debate = await Debate.findById(debateId);
        if (!debate || debate.mode !== "buzzer" || debate.status !== "in_progress") {
          return callback?.({ success: false, error: "Invalid debate state" });
        }

        const bs = debate.buzzerState;
        if (!bs) {
          return callback?.({ success: false, error: "Buzzer not initialized" });
        }

        const now = new Date();

        // Mic is held and no re-grab window is open → reject.
        if (bs.currentHolder !== null && !bs.grabWindowOpen) {
          return callback?.({ success: false, error: "Mic is busy" });
        }

        // Prep phase is active — grab window not open yet, reject early clickers.
        if (activeTimers.has(`${debateId}:preparing`)) {
          return callback?.({ success: false, error: "Get ready — mic opens shortly" });
        }

        // During re-grab window: last speaker cannot immediately re-grab.
        if (bs.grabWindowOpen && bs.lastSpeaker === userId) {
          return callback?.({ success: false, error: "You just spoke — let others have a turn" });
        }

        // Per-user cooldown check.
        const cd = bs.cooldowns.find((c) => c.userId === userId);
        if (cd && cd.unlocksAt > now) {
          const secsLeft = Math.ceil((cd.unlocksAt.getTime() - now.getTime()) / 1000);
          return callback?.({ success: false, error: `Cooling down — ${secsLeft}s remaining` });
        }

        // ── Grab is valid ──────────────────────────────────────────────────

        // Cancel any open grab-window timer (someone grabbed in time).
        const winTimer = activeTimers.get(`${debateId}:window`);
        if (winTimer) {
          clearTimeout(winTimer);
          activeTimers.delete(`${debateId}:window`);
        }

        const entry = debate.turnOrder.find((t) => t.userId === userId);
        const side = entry?.side ?? "for";

        bs.currentHolder = userId;
        bs.holderStartedAt = now;
        bs.grabWindowOpen = false;
        bs.grabWindowEndsAt = null;
        bs.speakHistory.push(userId);

        // First-grab bonus XP (+5) — awarded once per user per debate.
        let bonusXP = 0;
        if (!bs.bonusXPAwarded.includes(userId)) {
          bs.bonusXPAwarded.push(userId);
          bonusXP = 5;
          void User.findByIdAndUpdate(userId, { $inc: { xp: bonusXP } });
        }

        debate.markModified("buzzerState");
        await debate.save();

        // Per-speaker auto-timeout: server notifies holder when time is up.
        const speakerMs = debate.turnDuration * 1_000;
        const speakerTimer = setTimeout(async () => {
          activeTimers.delete(`${debateId}:speaker`);
          // Tell the holder's socket to submit immediately.
          const holderSocketId = userSocketMap.get(userId);
          if (holderSocketId) {
            io.to(holderSocketId).emit("buzzer:speaker-timeout", { debateId });
          } else {
            // Holder disconnected — server-side release with empty argument.
            await handleBuzzerRelease(debateId, userId, "");
          }
        }, speakerMs);
        activeTimers.set(`${debateId}:speaker`, speakerTimer);

        // 10-second urgent warning — fires 10 s before auto-timeout so all
        // non-holders can see the standby grab button early.
        if (speakerMs > 10_000) {
          const urgentTimer = setTimeout(() => {
            activeTimers.delete(`${debateId}:urgent`);
            io.to(`room:${debate.roomId}`).emit("buzzer:holder-urgent", {
              debateId,
              secsLeft: 10,
            });
          }, speakerMs - 10_000);
          activeTimers.set(`${debateId}:urgent`, urgentTimer);
        }

        io.to(`room:${debate.roomId}`).emit("buzzer:holder-changed", {
          holder: userId,
          username,
          side,
          grabWindowOpen: false,
          grabWindowEndsAt: null,
          excludedUserId: null,
          bonusXP: bonusXP > 0 ? bonusXP : undefined,
        });

        callback?.({ success: true, bonusXP });
      } catch (err: any) {
        console.error("[Buzzer] Grab error:", err);
        callback?.({ success: false, error: err?.message || "Failed to grab" });
      }
    });

    /**
     * Speaker releases the mic (voluntary).
     * Client emits: { debateId: string, argument: string }
     */
    socket.on("buzzer:release", async (data, callback) => {
      try {
        const { debateId, argument } = data;
        if (!debateId) {
          return callback?.({ success: false, error: "debateId required" });
        }

        const debate = await Debate.findById(debateId);
        if (!debate?.buzzerState || debate.buzzerState.currentHolder !== userId) {
          return callback?.({ success: false, error: "You don't hold the mic" });
        }

        await handleBuzzerRelease(debateId, userId, argument ?? "");
        callback?.({ success: true });
      } catch (err: any) {
        console.error("[Buzzer] Release error:", err);
        callback?.({ success: false, error: err?.message || "Failed to release" });
      }
    });

    /**
     * Host manually ends a buzzer debate.
     * Client emits: { debateId: string }
     */
    socket.on("debate:host-end", async (data, callback) => {
      try {
        const { debateId } = data;
        if (!debateId) {
          return callback?.({ success: false, error: "debateId required" });
        }

        const debate = await Debate.findById(debateId);
        if (!debate) {
          return callback?.({ success: false, error: "Debate not found" });
        }

        const room = await RoomService.getRoomById(debate.roomId);
        if (!room || room.creatorId !== userId) {
          return callback?.({ success: false, error: "Only the host can end the debate" });
        }

        if (debate.status === "ended") {
          return callback?.({ success: true }); // idempotent
        }

        // Clear all buzzer timers for this debate.
        for (const key of [`${debateId}:warning`, `${debateId}:speaker`, `${debateId}:window`, `${debateId}:preparing`, `${debateId}:urgent`, `${debateId}:scoring`, debateId]) {
          const t = activeTimers.get(key);
          if (t) { clearTimeout(t); activeTimers.delete(key); }
        }

        debate.status = "ended";
        debate.currentTurn = null;
        debate.endedAt = new Date();
        await debate.save();

        await Room.updateOne({ _id: debate.roomId }, { status: "finished" });

        io.to(`room:${debate.roomId}`).emit("debate:ended", {
          debateId,
          rounds: debate.rounds,
          endedAt: debate.endedAt,
        });

        runJudgeAsync(debateId, debate.roomId);
        void openScoringWindow(debateId, debate.roomId);
        callback?.({ success: true });
      } catch (err: any) {
        console.error("[Buzzer] Host-end error:", err);
        callback?.({ success: false, error: err?.message || "Failed to end debate" });
      }
    });

    // ==================== WEBRTC SIGNALING ====================

    /**
     * Forward a WebRTC offer from one peer to another. Each event carries
     * the target socket id; we route via io.to(targetSocketId). The sender's
     * own socket id is attached so the recipient knows where to reply.
     *
     * Mesh model: every participant maintains an RTCPeerConnection to every
     * other participant. The active speaker's mic is the only sending track;
     * everyone else listens. The frontend hook decides who initiates the
     * offer (deterministic by lower userId) so we don't double-offer.
     */
    socket.on("webrtc:offer", (data) => {
      const { targetSocketId, sdp } = data;
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit("webrtc:offer", {
        fromSocketId: socket.id,
        fromUserId: userId,
        fromUsername: username,
        sdp,
      });
    });

    socket.on("webrtc:answer", (data) => {
      const { targetSocketId, sdp } = data;
      if (!targetSocketId || !sdp) return;
      io.to(targetSocketId).emit("webrtc:answer", {
        fromSocketId: socket.id,
        fromUserId: userId,
        sdp,
      });
    });

    socket.on("webrtc:ice-candidate", (data) => {
      const { targetSocketId, candidate } = data;
      if (!targetSocketId || !candidate) return;
      io.to(targetSocketId).emit("webrtc:ice-candidate", {
        fromSocketId: socket.id,
        fromUserId: userId,
        candidate,
      });
    });

    /**
     * After a client joins a debate room, it asks the server "who else is
     * in this room?" so it knows which peers to open RTCPeerConnections to.
     */
    socket.on("webrtc:get-peers", async (data, callback) => {
      try {
        const { roomId } = data;
        if (!roomId) {
          return callback({ success: false, error: "Room ID required" });
        }
        const sockets = await io.in(`room:${roomId}`).fetchSockets();
        const peers = sockets
          .filter((s) => s.id !== socket.id)
          .map((s) => ({
            socketId: s.id,
            userId: s.data.userId,
            username: s.data.username,
          }));
        callback({ success: true, peers });
      } catch (err: any) {
        console.error("[Socket] webrtc:get-peers error:", err);
        callback({ success: false, error: err?.message || "Failed" });
      }
    });

    // ==================== ROLE MANAGEMENT EVENTS ====================

    /**
     * Host changes a participant's role (participant / judge / spectator).
     * Rooms must be in "lobby" status — roles lock once the debate starts.
     * Client emits: { roomId, targetUserId, newRole }
     */
    socket.on("room:change-role", async (data, callback) => {
      try {
        const { roomId, targetUserId, newRole } = data;
        if (!roomId || !targetUserId || !newRole) {
          return callback?.({ success: false, error: "roomId, targetUserId and newRole required" });
        }
        const room = await RoomService.changeParticipantRole(roomId, userId, targetUserId, newRole);
        io.to(`room:${roomId}`).emit("room:role-changed", {
          targetUserId,
          newRole,
          participants: room.participants,
        });
        callback?.({ success: true, participants: room.participants });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || "Failed to change role" });
      }
    });

    /**
     * Host transfers host privileges to another participant.
     * Client emits: { roomId, targetUserId }
     */
    socket.on("room:transfer-host", async (data, callback) => {
      try {
        const { roomId, targetUserId } = data;
        if (!roomId || !targetUserId) {
          return callback?.({ success: false, error: "roomId and targetUserId required" });
        }
        const room = await RoomService.transferHost(roomId, userId, targetUserId);
        io.to(`room:${roomId}`).emit("room:host-transferred", {
          newHostId:       room.creatorId,
          newHostUsername: room.creatorUsername,
          participants:    room.participants,
        });
        callback?.({ success: true });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || "Failed to transfer host" });
      }
    });

    // ==================== JUDGE SCORING EVENTS ====================

    /**
     * Judge submits scores for all debating participants.
     * Client emits: { debateId, scores: [{ userId, score }] }
     * Each score is 0–100. One submission per judge (subsequent calls overwrite).
     */
    socket.on("debate:submit-judge-scores", async (data, callback) => {
      try {
        const { debateId, scores } = data;
        if (!debateId || !Array.isArray(scores)) {
          return callback?.({ success: false, error: "debateId and scores array required" });
        }

        const debate = await Debate.findById(debateId);
        if (!debate) return callback?.({ success: false, error: "Debate not found" });

        if (debate.status !== "ended") {
          return callback?.({ success: false, error: "Scoring is only available after the debate ends" });
        }

        if (debate.judgeScoresLockedAt) {
          return callback?.({ success: false, error: "Judge scoring window has closed" });
        }

        // Verify this user is a judge in the room
        const room = await RoomService.getRoomById(debate.roomId);
        const participant = room?.participants.find((p) => p.userId === userId);
        if (participant?.role !== "judge" && room?.creatorId !== userId) {
          // Allow host to submit judge scores too (host may also be acting as a judge)
          if (participant?.role !== "moderator") {
            return callback?.({ success: false, error: "Only judges can submit scores" });
          }
        }

        // Upsert: replace existing scores from this judge, or push new entry
        const existingIndex = debate.judgeScores.findIndex((js) => js.judgeId === userId);
        const entry = {
          judgeId:       userId,
          judgeUsername: username,
          scores:        scores.map((s: any) => ({ userId: s.userId, score: Math.min(100, Math.max(0, Number(s.score))) })),
          submittedAt:   new Date(),
        };

        if (existingIndex >= 0) {
          debate.judgeScores[existingIndex] = entry;
        } else {
          debate.judgeScores.push(entry);
        }
        debate.markModified("judgeScores");
        await debate.save();

        io.to(`room:${debate.roomId}`).emit("debate:judge-scores-updated", {
          debateId,
          judgeScores: debate.judgeScores,
        });

        callback?.({ success: true });
      } catch (err: any) {
        console.error("[Judge Scores] Submit error:", err);
        callback?.({ success: false, error: err?.message || "Failed to submit judge scores" });
      }
    });

    /**
     * Lock the judge scoring window (called client-side when the timer expires,
     * or the judge themselves can call it to finalize early).
     * Client emits: { debateId }
     */
    socket.on("debate:lock-judge-scores", async (data, callback) => {
      try {
        const { debateId } = data;
        if (!debateId) return callback?.({ success: false, error: "debateId required" });

        const debate = await Debate.findById(debateId);
        if (!debate) return callback?.({ success: false, error: "Debate not found" });

        if (!debate.judgeScoresLockedAt) {
          debate.judgeScoresLockedAt = new Date();
          await debate.save();
          // Cancel the server-side auto-lock timer — a judge locked early.
          const scoringTimer = activeTimers.get(`${debateId}:scoring`);
          if (scoringTimer) { clearTimeout(scoringTimer); activeTimers.delete(`${debateId}:scoring`); }
          io.to(`room:${debate.roomId}`).emit("debate:judge-scores-locked", { debateId });
        }
        callback?.({ success: true });
      } catch (err: any) {
        callback?.({ success: false, error: err?.message || "Failed to lock judge scores" });
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
            "disconnected",
          );

          io.to(`room:${socket.data.roomId}`).emit(
            "room:participant-disconnected",
            {
              userId,
              username,
              participants: room.participants,
            },
          );

          // If this user was holding the buzzer mic, auto-release with empty argument.
          if (room.activeDebateId) {
            try {
              const debate = await Debate.findById(room.activeDebateId);
              if (
                debate?.mode === "buzzer" &&
                debate.status === "in_progress" &&
                debate.buzzerState?.currentHolder === userId
              ) {
                await handleBuzzerRelease(room.activeDebateId, userId, "");
              }
            } catch (buzzerErr) {
              console.error("[Buzzer] Disconnect auto-release error:", buzzerErr);
            }
          }
        } catch (error) {
          console.error("[Socket] Disconnect cleanup error:", error);
        }
      }
    });
  });

  return io;
}
