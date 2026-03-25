import mongoose, { Schema, Document } from "mongoose";

export interface IArgument extends Document {
  debateId: string;
  roundNumber: number;
  speakerId: string;
  speakerUsername: string;
  audioUrl?: string; // Optional: if we want to store audio blobs
  transcript: string;
  aiScore?: number; // Score provided by AI
  duration: number; // in seconds
  startedAt: Date;
  endedAt: Date;
  side?: "for" | "against";
}

export interface IDebateRound extends Document {
  debateId: string;
  roundNumber: number;
  currentSpeakerId?: string;
  currentSpeakerUsername?: string;
  speakersInRound: string[]; // Array of userIds who have spoken in this round
  maxDuration: number; // Max time allowed per speaker in seconds
  roundStartedAt: Date;
  roundEndedAt?: Date;
  status: "waiting" | "speaking" | "finished";
}

export interface IDebate extends Document {
  roomId: string;
  topic: string;
  status: "ready" | "in-progress" | "finished";
  rounds: IDebateRound[];
  arguments: IArgument[];
  participantIds: string[]; // All participants in the debate
  currentRoundNumber: number;
  startedAt: Date;
  endedAt?: Date;
}

// Argument Schema
const argumentSchema = new Schema<IArgument>(
  {
    debateId: {
      type: String,
      required: true,
      index: true,
    },
    roundNumber: {
      type: Number,
      required: true,
    },
    speakerId: {
      type: String,
      required: true,
    },
    speakerUsername: {
      type: String,
      required: true,
    },
    audioUrl: {
      type: String,
      required: false,
    },
    transcript: {
      type: String,
      required: true,
    },
    aiScore: {
      type: Number,
      required: false,
      min: 0,
      max: 100,
    },
    duration: {
      type: Number,
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      required: true,
    },
    side: {
      type: String,
      enum: ["for", "against"],
      required: false,
    },
  },
  { timestamps: true }
);

// Debate Round Schema
const debateRoundSchema = new Schema<IDebateRound>(
  {
    debateId: {
      type: String,
      required: true,
      index: true,
    },
    roundNumber: {
      type: Number,
      required: true,
    },
    currentSpeakerId: {
      type: String,
      required: false,
    },
    currentSpeakerUsername: {
      type: String,
      required: false,
    },
    speakersInRound: {
      type: [String],
      default: [],
    },
    maxDuration: {
      type: Number,
      required: true,
      default: 300, // 5 minutes
    },
    roundStartedAt: {
      type: Date,
      required: true,
    },
    roundEndedAt: {
      type: Date,
      required: false,
    },
    status: {
      type: String,
      enum: ["waiting", "speaking", "finished"],
      default: "waiting",
    },
  },
  { timestamps: true }
);

// Debate Schema
const debateSchema = new Schema<IDebate>(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    topic: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["ready", "in-progress", "finished"],
      default: "ready",
    },
    rounds: [debateRoundSchema],
    arguments: [argumentSchema],
    participantIds: {
      type: [String],
      required: true,
    },
    currentRoundNumber: {
      type: Number,
      default: 1,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true }
);

export const Debate = mongoose.model<IDebate>("Debate", debateSchema);
export const DebateRound = mongoose.model<IDebateRound>("DebateRound", debateRoundSchema);
export const Argument = mongoose.model<IArgument>("Argument", argumentSchema);
