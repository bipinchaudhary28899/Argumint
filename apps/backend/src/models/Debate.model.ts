import mongoose, { Schema, Document } from "mongoose";

export interface ICooldownEntry {
  userId: string;
  unlocksAt: Date;
}

export interface IBuzzerState {
  currentHolder: string | null;
  holderStartedAt: Date | null;
  grabWindowOpen: boolean;
  grabWindowEndsAt: Date | null;
  cooldowns: ICooldownEntry[];
  speakHistory: string[];
  lastSpeaker: string | null;
  bonusXPAwarded: string[];
}

export interface IRound {
  roundNumber: number;
  speakerId: string;
  speakerUsername: string;
  side: "for" | "against";
  argument: string;
  audioUrl?: string;
  submittedAt: Date;
  durationSeconds: number;
}

export interface ICurrentTurn {
  roundNumber: number;
  turnIndex: number;
  speakerId: string;
  speakerUsername: string;
  side: "for" | "against";
  startedAt: Date;
  endsAt: Date;
  durationSeconds: number;
}

export interface ITurnOrderEntry {
  userId: string;
  username: string;
  side: "for" | "against";
}

export interface IScoreBreakdown {
  userId: string;
  username: string;
  side: "for" | "against";
  clarity: number;
  evidence: number;
  rebuttal: number;
  organization: number;
  total: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

export interface IApiCosts {
  whisperCalls: number;
  whisperMinutes: number;
  whisperCostUSD: number;
  judgeInputTokens: number;
  judgeOutputTokens: number;
  judgeCostUSD: number;
  totalCostUSD: number;
}

export interface IJudgeParticipantScore {
  userId: string;
  score: number; // 0–100
}

export interface IJudgeScore {
  judgeId: string;
  judgeUsername: string;
  scores: IJudgeParticipantScore[];
  submittedAt: Date;
}

export interface IDebateResult {
  winnerSide: "for" | "against";
  winningPoints: string[];
  summary: string;
  scores: IScoreBreakdown[];
  judgedAt: Date;
  judgeModel: string;
}

export interface IDebate extends Document {
  roomId: string;
  roomCode: string;
  creatorId: string;
  topic: string;
  mode: "buzzer" | "alternate";
  totalRounds: number;
  turnDuration: number;
  prepDuration: number;
  turnOrder: ITurnOrderEntry[];
  rounds: IRound[];
  currentTurn: ICurrentTurn | null;
  status: "prep" | "in_progress" | "ended";
  prepEndsAt?: Date;
  startedAt: Date;
  endedAt?: Date;
  // Mirrored from Room at debate-start time
  transcriptionMode: "whisper" | "browser" | "off";
  whisperBudgetMinutes?: number;
  whisperMinutesUsed: number;
  // Populated asynchronously by the judge after the debate ends.
  result?: IDebateResult | null;
  // Only populated for mode === "buzzer"
  buzzerState?: IBuzzerState | null;
  // Running tally of OpenAI API usage for this debate
  apiCosts: IApiCosts;
  // Human judge scores — populated after debate ends when judges submit
  judgeScores: IJudgeScore[];
  judgeScoresLockedAt?: Date;
}

const apiCostsSchema = new Schema<IApiCosts>(
  {
    whisperCalls:      { type: Number, default: 0 },
    whisperMinutes:    { type: Number, default: 0 },
    whisperCostUSD:    { type: Number, default: 0 },
    judgeInputTokens:  { type: Number, default: 0 },
    judgeOutputTokens: { type: Number, default: 0 },
    judgeCostUSD:      { type: Number, default: 0 },
    totalCostUSD:      { type: Number, default: 0 },
  },
  { _id: false },
);

const cooldownEntrySchema = new Schema<ICooldownEntry>(
  {
    userId: { type: String, required: true },
    unlocksAt: { type: Date, required: true },
  },
  { _id: false },
);

const buzzerStateSchema = new Schema<IBuzzerState>(
  {
    currentHolder: { type: String, default: null },
    holderStartedAt: { type: Date, default: null },
    grabWindowOpen: { type: Boolean, default: false },
    grabWindowEndsAt: { type: Date, default: null },
    cooldowns: { type: [cooldownEntrySchema], default: [] },
    speakHistory: { type: [String], default: [] },
    lastSpeaker: { type: String, default: null },
    bonusXPAwarded: { type: [String], default: [] },
  },
  { _id: false },
);

const roundSchema = new Schema<IRound>(
  {
    roundNumber: { type: Number, required: true },
    speakerId: { type: String, required: true },
    speakerUsername: { type: String, required: true },
    side: { type: String, enum: ["for", "against"], required: true },
    argument: { type: String, default: "" },
    audioUrl: { type: String },
    submittedAt: { type: Date, default: () => new Date() },
    durationSeconds: { type: Number, required: true },
  },
  { _id: false },
);

const currentTurnSchema = new Schema<ICurrentTurn>(
  {
    roundNumber: { type: Number, required: true },
    turnIndex: { type: Number, required: true },
    speakerId: { type: String, required: true },
    speakerUsername: { type: String, required: true },
    side: { type: String, enum: ["for", "against"], required: true },
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    durationSeconds: { type: Number, required: true },
  },
  { _id: false },
);

const turnOrderEntrySchema = new Schema<ITurnOrderEntry>(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    side: { type: String, enum: ["for", "against"], required: true },
  },
  { _id: false },
);

const scoreBreakdownSchema = new Schema<IScoreBreakdown>(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    side: { type: String, enum: ["for", "against"], required: true },
    clarity: { type: Number, required: true, min: 0, max: 25 },
    evidence: { type: Number, required: true, min: 0, max: 25 },
    rebuttal: { type: Number, required: true, min: 0, max: 25 },
    organization: { type: Number, required: true, min: 0, max: 25 },
    total: { type: Number, required: true, min: 0, max: 100 },
    feedback: { type: String, required: true, default: "" },
    strengths: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
  },
  { _id: false },
);

const debateResultSchema = new Schema<IDebateResult>(
  {
    winnerSide: { type: String, enum: ["for", "against"], required: true },
    winningPoints: { type: [String], default: [] },
    summary: { type: String, default: "" },
    scores: { type: [scoreBreakdownSchema], default: [] },
    judgedAt: { type: Date, default: () => new Date() },
    judgeModel: { type: String, required: true },
  },
  { _id: false },
);

const judgeParticipantScoreSchema = new Schema<IJudgeParticipantScore>(
  {
    userId: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false },
);

const judgeScoreSchema = new Schema<IJudgeScore>(
  {
    judgeId:       { type: String, required: true },
    judgeUsername: { type: String, required: true },
    scores:        { type: [judgeParticipantScoreSchema], default: [] },
    submittedAt:   { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const debateSchema = new Schema<IDebate>(
  {
    roomId: { type: String, required: true, index: true },
    roomCode: { type: String, required: true },
    creatorId: { type: String, required: true },
    topic: { type: String, required: true },
    mode: { type: String, enum: ["buzzer", "alternate"], required: true },
    totalRounds: { type: Number, required: true },
    turnDuration: { type: Number, required: true },
    prepDuration: { type: Number, required: true },
    turnOrder: { type: [turnOrderEntrySchema], required: true },
    rounds: { type: [roundSchema], default: [] },
    currentTurn: { type: currentTurnSchema, default: null },
    status: {
      type: String,
      enum: ["prep", "in_progress", "ended"],
      default: "prep",
    },
    prepEndsAt: { type: Date },
    startedAt: { type: Date, default: () => new Date() },
    endedAt: { type: Date },
    transcriptionMode: {
      type: String,
      enum: ["whisper", "browser", "off"],
      default: "whisper",
    },
    whisperBudgetMinutes: { type: Number, required: false },
    whisperMinutesUsed: { type: Number, default: 0 },
    result: { type: debateResultSchema, default: null },
    buzzerState: { type: buzzerStateSchema, default: null },
    apiCosts: { type: apiCostsSchema, default: () => ({}) },
    judgeScores: { type: [judgeScoreSchema], default: [] },
    judgeScoresLockedAt: { type: Date },
  },
  { timestamps: true },
);

// Indexes for fast socket queries
debateSchema.index({ roomCode: 1 });
debateSchema.index({ roomId: 1, status: 1 });
debateSchema.index({ status: 1 });

export const Debate = mongoose.model<IDebate>("Debate", debateSchema);
