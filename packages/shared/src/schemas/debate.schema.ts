import { z } from "zod";

/**
 * Running OpenAI API cost tally for one debate.
 */
export const ApiCostsSchema = z.object({
  whisperCalls:      z.number().default(0),
  whisperMinutes:    z.number().default(0),
  whisperCostUSD:    z.number().default(0),
  judgeInputTokens:  z.number().default(0),
  judgeOutputTokens: z.number().default(0),
  judgeCostUSD:      z.number().default(0),
  totalCostUSD:      z.number().default(0),
});

/**
 * Per-user cooldown entry for buzzer mode.
 */
export const BuzzerCooldownEntrySchema = z.object({
  userId: z.string(),
  unlocksAt: z.date(),
});

/**
 * Live state machine for free-for-all buzzer debates.
 * Only present when mode === "buzzer".
 */
export const BuzzerStateSchema = z.object({
  currentHolder: z.string().nullable(),
  holderStartedAt: z.date().nullable(),
  grabWindowOpen: z.boolean(),
  grabWindowEndsAt: z.date().nullable(),
  cooldowns: z.array(BuzzerCooldownEntrySchema),
  speakHistory: z.array(z.string()),
  lastSpeaker: z.string().nullable(),
  bonusXPAwarded: z.array(z.string()),
});

/**
 * One completed turn — a participant's argument in a single round.
 */
export const RoundSchema = z.object({
  roundNumber: z.number().int().min(1),
  speakerId: z.string(),
  speakerUsername: z.string(),
  side: z.enum(["for", "against"]),
  argument: z.string(),                  // Whisper transcript text
  audioUrl: z.string().optional(),        // (future) link to recorded audio blob
  submittedAt: z.date(),
  durationSeconds: z.number(),            // how long the speaker actually used
});

/**
 * The active turn snapshot — written to Mongo whenever a turn begins
 * so a late joiner can rebuild state. `endsAt` is the authoritative
 * server timestamp clients use to render their countdown.
 */
export const CurrentTurnSchema = z.object({
  roundNumber: z.number().int().min(1),
  turnIndex: z.number().int().min(0),     // index within turnOrder for this round
  speakerId: z.string(),
  speakerUsername: z.string(),
  side: z.enum(["for", "against"]),
  startedAt: z.date(),
  endsAt: z.date(),                       // server clock — clients diff against Date.now()
  durationSeconds: z.number(),
});

export const TurnOrderEntrySchema = z.object({
  userId: z.string(),
  username: z.string(),
  side: z.enum(["for", "against"]),
});

/**
 * Per-speaker rubric scoring. Each sub-dimension is /25, sum is /100.
 * `total` is enforced server-side to equal the sum of the four parts so
 * the UI can trust either field.
 */
export const ScoreBreakdownSchema = z.object({
  userId: z.string(),
  username: z.string(),
  side: z.enum(["for", "against"]),
  clarity: z.number().min(0).max(25),
  evidence: z.number().min(0).max(25),
  rebuttal: z.number().min(0).max(25),
  organization: z.number().min(0).max(25),
  total: z.number().min(0).max(100),
  feedback: z.string(),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
});

/**
 * The post-debate AI judgment. Shared across all clients — each client
 * highlights their own row in the `scores` array as "your score".
 */
export const DebateResultSchema = z.object({
  winnerSide: z.enum(["for", "against"]),
  winningPoints: z.array(z.string()),
  summary: z.string(),
  scores: z.array(ScoreBreakdownSchema),
  judgedAt: z.date(),
  judgeModel: z.string(),
});

export const DebateSchema = z.object({
  _id: z.string().optional(),
  roomId: z.string(),
  roomCode: z.string(),
  topic: z.string(),
  mode: z.enum(["buzzer", "alternate"]),
  totalRounds: z.number().int().min(1).max(5),
  turnDuration: z.number(),
  prepDuration: z.number(),
  turnOrder: z.array(TurnOrderEntrySchema),
  rounds: z.array(RoundSchema),
  currentTurn: CurrentTurnSchema.nullable(),
  status: z.enum(["prep", "in_progress", "ended"]),
  prepEndsAt: z.date().optional(),
  startedAt: z.date(),
  endedAt: z.date().optional(),
  // Mirrored from the room when the debate starts so the debate is
  // self-contained for clients (no need to refetch the room).
  transcriptionMode: z.enum(["whisper", "browser", "off"]).default("whisper"),
  whisperBudgetMinutes: z.number().min(0).optional(),
  whisperMinutesUsed: z.number().default(0),
  // Populated asynchronously by the AI judge after the debate ends.
  // Null while the judge is still running or if it failed.
  result: DebateResultSchema.nullable().optional(),
  // Live state for buzzer mode — null for alternate mode debates.
  buzzerState: BuzzerStateSchema.nullable().optional(),
  // Running tally of OpenAI API costs for this debate.
  apiCosts: ApiCostsSchema.optional(),
});

export type Round = z.infer<typeof RoundSchema>;
export type CurrentTurn = z.infer<typeof CurrentTurnSchema>;
export type TurnOrderEntry = z.infer<typeof TurnOrderEntrySchema>;
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
export type DebateResult = z.infer<typeof DebateResultSchema>;
export type Debate = z.infer<typeof DebateSchema>;
export type BuzzerState = z.infer<typeof BuzzerStateSchema>;
export type BuzzerCooldownEntry = z.infer<typeof BuzzerCooldownEntrySchema>;
export type ApiCosts = z.infer<typeof ApiCostsSchema>;
