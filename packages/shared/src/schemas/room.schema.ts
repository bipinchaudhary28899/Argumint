import { z } from "zod";

export const ParticipantSchema = z.object({
  userId: z.string(),
  username: z.string(),
  role: z.enum(["moderator", "participant"]).optional(),
  joinedAt: z.date(),
  status: z.enum(["joined", "ready", "in-debate", "disconnected"]),
  side: z.enum(["for", "against"]).optional(),
});

export const VotingTopicSchema = z.object({
  id: z.string(),
  text: z.string().min(5).max(500),
  votes: z.number().default(0),
});

export const RoomSchema = z.object({
  _id: z.string().optional(),
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  creatorId: z.string(),
  creatorUsername: z.string(),
  topic: z.string().min(5).max(500),
  description: z.string().max(2000).optional(),
  debateMode: z.enum(["buzzer", "alternate"]),
  maxParticipants: z.number().min(2).max(100),
  participants: z.array(ParticipantSchema),
  status: z.enum(["lobby", "voting", "ready-up", "prep", "live", "finished"]),
  votingEnabled: z.boolean().default(false),
  votingTopics: z.array(VotingTopicSchema).default([]),
  votingDuration: z.number(),
  prepDuration: z.number(),
  turnDuration: z.number(),
  totalRounds: z.number().min(1).max(5),
  // Transcription mode for the debate phase.
  //   "whisper" — browser SR with Whisper fallback (default, current behavior)
  //   "browser" — browser SR only, never call Whisper (cheapest)
  //   "off"     — no transcription at all, store empty arguments
  transcriptionMode: z.enum(["whisper", "browser", "off"]),
  // Optional cap on Whisper minutes per debate. Undefined = unlimited.
  whisperBudgetMinutes: z.number().min(0).optional(),
  // Running total of trimmed Whisper minutes used in the active debate.
  whisperMinutesUsed: z.number().default(0),
  activeDebateId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateRoomSchema = z
  .object({
    topic: z.string().max(500).optional().default(""),
    description: z.string().max(2000).optional(),
    debateMode: z.enum(["buzzer", "alternate"]).default("buzzer"),
    maxParticipants: z.number().min(2).max(100).default(10),
    votingEnabled: z.boolean().default(false),
    votingTopics: z.array(z.string().trim().min(1).max(500)).default([]),
    votingDuration: z.number().default(30),
    prepDuration: z.number().default(120),
    turnDuration: z.number().default(300),
    totalRounds: z.number().min(1).max(5).default(2),
    transcriptionMode: z
      .enum(["whisper", "browser", "off"])
      .default("whisper"),
    whisperBudgetMinutes: z.number().min(0).optional(),
  })
  .refine(
    (data) => {
      // If voting is disabled, topic must be provided and at least 5 chars
      if (!data.votingEnabled) {
        return data.topic && data.topic.trim().length >= 5;
      }
      // If voting is enabled, at least one voting topic must be provided
      if (data.votingEnabled) {
        return data.votingTopics && data.votingTopics.length > 0 && 
               data.votingTopics.every((topic: string) => topic.trim().length > 0);
      }
      return true;
    },
    {
      message:
        "Either provide a topic (when voting disabled) or voting topics (when voting enabled)",
      path: ["votingTopics"],
    }
  );

export const JoinRoomSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
});

export const UpdateRoomSettingsSchema = z.object({
  topic: z.string().min(5).max(500).optional(),
  description: z.string().max(2000).optional(),
  debateMode: z.enum(["buzzer", "alternate"]).optional(),
  maxParticipants: z.number().min(2).max(100).optional(),
  votingDuration: z.number().optional(),
  prepDuration: z.number().optional(),
  turnDuration: z.number().optional(),
  totalRounds: z.number().min(1).max(5).optional(),
  transcriptionMode: z.enum(["whisper", "browser", "off"]).optional(),
  whisperBudgetMinutes: z.number().min(0).optional(),
});

export type Participant = z.infer<typeof ParticipantSchema>;
export type VotingTopic = z.infer<typeof VotingTopicSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type UpdateRoomSettingsInput = z.infer<typeof UpdateRoomSettingsSchema>;
