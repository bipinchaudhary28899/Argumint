import { Debate, IDebate, ITurnOrderEntry } from "../models/Debate.model.js";
import { Room } from "../models/Room.model.js";

/**
 * Fisher–Yates shuffle (in place). Used to randomize who speaks first
 * and also which side each participant lands on.
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class DebateService {
  /**
   * Host starts the debate. Validates state, randomly splits participants
   * into for/against, builds the turn order, creates the Debate document,
   * marks the room as "prep", and returns the new Debate.
   *
   * Caller is responsible for kicking off the prep timer.
   */
  static async startDebate(roomId: string, hostUserId: string): Promise<IDebate> {
    const room = await Room.findById(roomId);
    if (!room) throw new Error("Room not found");

    // Only the host (creator/moderator) may start the debate.
    const hostParticipant = room.participants.find(
      (p) => p.userId === hostUserId,
    );
    const isHost =
      room.creatorId === hostUserId || hostParticipant?.role === "moderator";
    if (!isHost) throw new Error("Only the host can start the debate");

    if (room.status !== "lobby") {
      throw new Error(`Cannot start debate from status "${room.status}"`);
    }

    if (room.participants.length < 2) {
      throw new Error("Need at least 2 participants to start a debate");
    }

    const everyoneReady = room.participants.every((p) => p.status === "ready");
    if (!everyoneReady) {
      throw new Error("All participants must be ready");
    }

    if (!room.topic || room.topic.trim().length < 5) {
      throw new Error("Room must have a topic (run voting first if enabled)");
    }

    // Shuffle participants, split into two equal(ish) halves, then
    // interleave so turns alternate for → against → for → against …
    // Odd person out goes to "for" (the first group). If one side runs
    // out of speakers before the other, the remaining speakers are
    // appended at the end.
    const shuffled = shuffle([...room.participants]);
    const half = Math.ceil(shuffled.length / 2);
    const forGroup  = shuffled.slice(0, half);
    const againstGroup = shuffled.slice(half);

    const interleaved: typeof shuffled = [];
    const maxLen = Math.max(forGroup.length, againstGroup.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < forGroup.length)     interleaved.push(forGroup[i]);
      if (i < againstGroup.length) interleaved.push(againstGroup[i]);
    }

    const turnOrder: ITurnOrderEntry[] = interleaved.map((p) => ({
      userId: p.userId,
      username: p.username,
      side: forGroup.includes(p) ? "for" : "against",
    }));

    // Mirror sides back onto room.participants for the lobby/prep UI.
    for (const entry of turnOrder) {
      const p = room.participants.find((x) => x.userId === entry.userId);
      if (p) {
        p.side = entry.side;
        p.status = "in-debate";
      }
    }

    const prepEndsAt = new Date(Date.now() + room.prepDuration * 1000);

    const debate = await Debate.create({
      roomId: room._id.toString(),
      roomCode: room.code,
      topic: room.topic,
      mode: room.debateMode,
      totalRounds: room.totalRounds,
      turnDuration: room.turnDuration,
      prepDuration: room.prepDuration,
      turnOrder,
      rounds: [],
      currentTurn: null,
      status: "prep",
      prepEndsAt,
      startedAt: new Date(),
      // Carry transcription policy from the room so the debate is
      // self-contained — clients read mode/budget off the debate doc.
      transcriptionMode: room.transcriptionMode,
      whisperBudgetMinutes: room.whisperBudgetMinutes,
      whisperMinutesUsed: 0,
    });

    room.status = "prep";
    room.activeDebateId = debate._id.toString();
    await room.save();

    return debate;
  }

  /**
   * Begin the first turn. Called when the prep timer fires.
   * Returns the updated debate with currentTurn populated.
   */
  static async startFirstTurn(debateId: string): Promise<IDebate> {
    const debate = await Debate.findById(debateId);
    if (!debate) throw new Error("Debate not found");
    if (debate.status !== "prep") {
      // Idempotent: if we somehow got called twice, just return current state.
      return debate;
    }

    debate.status = "in_progress";
    debate.currentTurn = this.buildTurn(debate, 1, 0);
    await debate.save();

    // Flip the room over to "live"
    await Room.updateOne({ _id: debate.roomId }, { status: "live" });

    return debate;
  }

  /**
   * Move on to the next turn (or next round, or end the debate).
   * Returns { debate, finished }. If finished, currentTurn is null and
   * caller should broadcast debate:ended.
   */
  static async advanceTurn(
    debateId: string,
  ): Promise<{ debate: IDebate; finished: boolean }> {
    const debate = await Debate.findById(debateId);
    if (!debate) throw new Error("Debate not found");
    if (debate.status === "ended") {
      return { debate, finished: true };
    }

    const current = debate.currentTurn;
    if (!current) {
      // No turn in progress — start the first one.
      debate.status = "in_progress";
      debate.currentTurn = this.buildTurn(debate, 1, 0);
      await debate.save();
      return { debate, finished: false };
    }

    let nextRound = current.roundNumber;
    let nextIndex = current.turnIndex + 1;

    if (nextIndex >= debate.turnOrder.length) {
      // Round complete — move to next round.
      nextRound += 1;
      nextIndex = 0;
    }

    if (nextRound > debate.totalRounds) {
      // All rounds complete — finish the debate.
      debate.currentTurn = null;
      debate.status = "ended";
      debate.endedAt = new Date();
      await debate.save();
      await Room.updateOne({ _id: debate.roomId }, { status: "finished" });
      return { debate, finished: true };
    }

    debate.currentTurn = this.buildTurn(debate, nextRound, nextIndex);
    await debate.save();
    return { debate, finished: false };
  }

  /**
   * Record a submitted argument for the current turn. Does NOT advance the
   * turn — caller must call advanceTurn afterwards (and clear any pending
   * turn-end timer). We separate the two so the socket layer can decide
   * whether to broadcast "argument-submitted" before or after the next
   * "turn-started" event.
   */
  static async submitArgument(
    debateId: string,
    speakerId: string,
    argument: string,
  ): Promise<IDebate> {
    const debate = await Debate.findById(debateId);
    if (!debate) throw new Error("Debate not found");
    if (debate.status !== "in_progress" || !debate.currentTurn) {
      throw new Error("No active turn");
    }
    if (debate.currentTurn.speakerId !== speakerId) {
      throw new Error("It is not your turn");
    }

    const turn = debate.currentTurn;
    const now = new Date();
    const elapsedSec = Math.max(
      0,
      Math.round((now.getTime() - turn.startedAt.getTime()) / 1000),
    );

    debate.rounds.push({
      roundNumber: turn.roundNumber,
      speakerId: turn.speakerId,
      speakerUsername: turn.speakerUsername,
      side: turn.side,
      argument,
      submittedAt: now,
      durationSeconds: elapsedSec,
    });

    await debate.save();
    return debate;
  }

  /**
   * Transition a buzzer-mode debate from "prep" to "in_progress".
   * Initializes buzzerState and opens the first grab window.
   * Called when the prep timer fires (instead of startFirstTurn).
   */
  static async openBuzzerDebate(debateId: string): Promise<IDebate> {
    const debate = await Debate.findById(debateId);
    if (!debate) throw new Error("Debate not found");
    if (debate.status !== "prep") return debate; // idempotent

    debate.status = "in_progress";
    debate.buzzerState = {
      currentHolder: null,
      holderStartedAt: null,
      grabWindowOpen: true,
      grabWindowEndsAt: null,
      cooldowns: [],
      speakHistory: [],
      lastSpeaker: null,
      bonusXPAwarded: [],
    };
    await debate.save();

    await Room.updateOne({ _id: debate.roomId }, { status: "live" });
    return debate;
  }

  static async getById(debateId: string): Promise<IDebate | null> {
    return Debate.findById(debateId);
  }

  static async getByRoomId(roomId: string): Promise<IDebate | null> {
    // Newest debate for this room.
    return Debate.findOne({ roomId }).sort({ createdAt: -1 });
  }

  /**
   * Internal: construct the CurrentTurn snapshot for a (round, turnIndex) pair.
   * Sets startedAt to now and endsAt to now + turnDuration. The endsAt
   * timestamp is what clients use to render their countdown.
   */
  private static buildTurn(
    debate: IDebate,
    roundNumber: number,
    turnIndex: number,
  ) {
    const entry = debate.turnOrder[turnIndex];
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + debate.turnDuration * 1000);
    return {
      roundNumber,
      turnIndex,
      speakerId: entry.userId,
      speakerUsername: entry.username,
      side: entry.side,
      startedAt,
      endsAt,
      durationSeconds: debate.turnDuration,
    };
  }
}
