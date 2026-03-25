import { z } from "zod";

export const startDebateSchema = z.object({
  roomId: z.string().min(1),
  topic: z.string().min(5).max(500),
  maxDurationPerTurn: z.number().int().positive().default(300),
});

export type StartDebateInput = z.infer<typeof startDebateSchema>;

export const claimMicSchema = z.object({
  debateId: z.string().min(1),
  roomId: z.string().min(1),
});

export type ClaimMicInput = z.infer<typeof claimMicSchema>;

export const releaseMicSchema = z.object({
  debateId: z.string().min(1),
  roomId: z.string().min(1),
  transcript: z.string().min(1).max(5000),
  duration: z.number().int().nonnegative(),
});

export type ReleaseMicInput = z.infer<typeof releaseMicSchema>;

export const nextRoundSchema = z.object({
  debateId: z.string().min(1),
  roomId: z.string().min(1),
});

export type NextRoundInput = z.infer<typeof nextRoundSchema>;

export const endDebateSchema = z.object({
  debateId: z.string().min(1),
  roomId: z.string().min(1),
});

export type EndDebateInput = z.infer<typeof endDebateSchema>;

export const getDebateStateSchema = z.object({
  debateId: z.string().min(1),
});

export type GetDebateStateInput = z.infer<typeof getDebateStateSchema>;

// Response types
export const argumentSchema = z.object({
  debateId: z.string(),
  roundNumber: z.number().int().positive(),
  speakerId: z.string(),
  speakerUsername: z.string(),
  transcript: z.string(),
  aiScore: z.number().min(0).max(100).optional(),
  duration: z.number().int().nonnegative(),
  startedAt: z.date(),
  endedAt: z.date(),
  side: z.enum(["for", "against"]).optional(),
});

export type Argument = z.infer<typeof argumentSchema>;

export const debateRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  currentSpeakerId: z.string().optional(),
  currentSpeakerUsername: z.string().optional(),
  speakersInRound: z.array(z.string()),
  maxDuration: z.number().int().positive(),
  status: z.enum(["waiting", "speaking", "finished"]),
});

export type DebateRound = z.infer<typeof debateRoundSchema>;

export const debateStateSchema = z.object({
  debateId: z.string(),
  roomId: z.string(),
  topic: z.string(),
  status: z.enum(["ready", "in-progress", "finished"]),
  currentRoundNumber: z.number().int().positive(),
  arguments: z.array(argumentSchema),
  participantIds: z.array(z.string()),
  startedAt: z.date(),
  endedAt: z.date().optional(),
});

export type DebateState = z.infer<typeof debateStateSchema>;
