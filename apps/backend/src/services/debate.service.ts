import { Debate, DebateRound, Argument, IArgument, IDebateRound } from "../models/Debate.model.js";
import { ObjectId } from "mongoose";

export class DebateService {
  /**
   * Create a new debate
   */
  static async createDebate(
    roomId: string,
    topic: string,
    participantIds: string[],
    maxDurationPerTurn: number = 300 // 5 minutes default
  ) {
    const debate = new Debate({
      roomId,
      topic,
      status: "ready",
      participantIds,
      currentRoundNumber: 1,
      startedAt: new Date(),
      rounds: [
        {
          debateId: undefined, // Will be set after debate is created
          roundNumber: 1,
          speakersInRound: [],
          maxDuration: maxDurationPerTurn,
          roundStartedAt: new Date(),
          status: "waiting",
        },
      ],
      arguments: [],
    });

    const savedDebate = await debate.save();
    
    // Update the round's debateId
    if (savedDebate.rounds[0]) {
      savedDebate.rounds[0].debateId = savedDebate._id.toString();
    }
    await savedDebate.save();

    return savedDebate;
  }

  /**
   * Get debate by ID
   */
  static async getDebateById(debateId: string) {
    return Debate.findById(debateId);
  }

  /**
   * Get debate by room ID
   */
  static async getDebateByRoomId(roomId: string) {
    return Debate.findOne({ roomId });
  }

  /**
   * Get current round for a debate
   */
  static async getCurrentRound(debateId: string) {
    const debate = await this.getDebateById(debateId);
    if (!debate) throw new Error("Debate not found");

    const currentRound = debate.rounds[debate.currentRoundNumber - 1];
    return currentRound;
  }

  /**
   * Claim the mic for a user in the current round
   * Returns the current speaker info and debate state
   */
  static async claimMic(debateId: string, userId: string, username: string) {
    const debate = await this.getDebateById(debateId);
    if (!debate) throw new Error("Debate not found");

    const currentRound = debate.rounds[debate.currentRoundNumber - 1];
    if (!currentRound) throw new Error("Current round not found");

    // Check if user has already spoken in this round
    if (currentRound.speakersInRound.includes(userId)) {
      throw new Error("You have already spoken in this round");
    }

    // Check if someone is already speaking
    if (currentRound.currentSpeakerId) {
      throw new Error("Someone is already speaking");
    }

    // Claim the mic
    currentRound.currentSpeakerId = userId;
    currentRound.currentSpeakerUsername = username;
    currentRound.status = "speaking";

    await debate.save();

    return {
      debateId,
      roundNumber: currentRound.roundNumber,
      currentSpeaker: {
        userId,
        username,
      },
      maxDuration: currentRound.maxDuration,
    };
  }

  /**
   * Release the mic (finish speaking)
   * Returns the speaker's transcript and argument info
   */
  static async releaseMic(
    debateId: string,
    userId: string,
    transcript: string,
    duration: number // in seconds
  ) {
    const debate = await this.getDebateById(debateId);
    if (!debate) throw new Error("Debate not found");

    const currentRound = debate.rounds[debate.currentRoundNumber - 1];
    if (!currentRound) throw new Error("Current round not found");

    if (currentRound.currentSpeakerId !== userId) {
      throw new Error("You are not the current speaker");
    }

    // Get the current speaker username
    const speakerUsername = currentRound.currentSpeakerUsername || "";

    // Create argument record
    const argument = {
      debateId: debateId,
      roundNumber: currentRound.roundNumber,
      speakerId: userId,
      speakerUsername: speakerUsername,
      transcript,
      duration,
      startedAt: new Date(new Date().getTime() - duration * 1000),
      endedAt: new Date(),
    };

    debate.arguments.push(argument as IArgument);

    // Mark speaker as having spoken in this round
    if (!currentRound.speakersInRound.includes(userId)) {
      currentRound.speakersInRound.push(userId);
    }

    // Release the mic
    currentRound.currentSpeakerId = undefined;
    currentRound.currentSpeakerUsername = undefined;
    currentRound.status = "waiting";

    await debate.save();

    return {
      debateId,
      roundNumber: currentRound.roundNumber,
      argumentId: debate.arguments[debate.arguments.length - 1]._id,
      transcript,
      duration,
    };
  }

  /**
   * Move to next round
   */
  static async moveToNextRound(debateId: string) {
    const debate = await this.getDebateById(debateId);
    if (!debate) throw new Error("Debate not found");

    const nextRoundNumber = debate.currentRoundNumber + 1;

    // Create new round
    const newRound: IDebateRound = {
      debateId: debateId,
      roundNumber: nextRoundNumber,
      speakersInRound: [],
      maxDuration: debate.rounds[0]?.maxDuration || 300,
      roundStartedAt: new Date(),
      status: "waiting",
    } as IDebateRound;

    debate.rounds.push(newRound);
    debate.currentRoundNumber = nextRoundNumber;

    await debate.save();

    return {
      debateId,
      roundNumber: nextRoundNumber,
    };
  }

  /**
   * Get all arguments for a debate in order
   */
  static async getArgumentsInOrder(debateId: string) {
    const debate = await this.getDebateById(debateId);
    if (!debate) throw new Error("Debate not found");

    // Arguments are already stored in order by roundNumber and insertion order
    return debate.arguments.sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) {
        return a.roundNumber - b.roundNumber;
      }
      // If same round, maintain insertion order (MongoDB preserves this)
      return 0;
    });
  }

  /**
   * Update AI score for an argument
   */
  static async updateArgumentScore(
    debateId: string,
    argumentIndex: number,
    score: number
  ) {
    const debate = await this.getDebateById(debateId);
    if (!debate) throw new Error("Debate not found");

    if (argumentIndex < 0 || argumentIndex >= debate.arguments.length) {
      throw new Error("Argument index out of bounds");
    }

    debate.arguments[argumentIndex].aiScore = score;
    await debate.save();

    return debate.arguments[argumentIndex];
  }

  /**
   * End debate
   */
  static async endDebate(debateId: string) {
    const debate = await this.getDebateById(debateId);
    if (!debate) throw new Error("Debate not found");

    debate.status = "finished";
    debate.endedAt = new Date();

    await debate.save();

    return debate;
  }

  /**
   * Get debate summary (for final results page)
   */
  static async getDebateSummary(debateId: string) {
    const debate = await this.getDebateById(debateId);
    if (!debate) throw new Error("Debate not found");

    return {
      topic: debate.topic,
      status: debate.status,
      totalRounds: debate.currentRoundNumber,
      arguments: debate.arguments,
      duration: debate.endedAt
        ? (debate.endedAt.getTime() - debate.startedAt.getTime()) / 1000
        : 0,
    };
  }
}
