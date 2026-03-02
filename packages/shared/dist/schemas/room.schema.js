import { z } from "zod";
export const ParticipantSchema = z.object({
    userId: z.string(),
    username: z.string(),
    role: z.enum(["moderator", "participant"]).optional(),
    joinedAt: z.date(),
    status: z.enum(["joined", "ready", "in-debate", "disconnected"]),
    side: z.enum(["for", "against"]).optional(),
});
export const RoomSchema = z.object({
    _id: z.string().optional(),
    code: z.string().regex(/^[A-Z0-9]{6}$/),
    creatorId: z.string(),
    creatorUsername: z.string(),
    topic: z.string().min(5).max(500),
    description: z.string().max(2000).optional(),
    debateMode: z.enum(["buzzer", "round-robin"]),
    maxParticipants: z.number().min(2).max(100),
    participants: z.array(ParticipantSchema),
    status: z.enum(["lobby", "voting", "ready-up", "prep", "live", "finished"]),
    votingDuration: z.number(),
    prepDuration: z.number(),
    turnDuration: z.number(),
    createdAt: z.date(),
    updatedAt: z.date(),
});
export const CreateRoomSchema = z.object({
    topic: z.string().min(5).max(500),
    description: z.string().max(2000).optional(),
    debateMode: z.enum(["buzzer", "round-robin"]).default("buzzer"),
    maxParticipants: z.number().min(2).max(100).default(10),
    votingDuration: z.number().default(30),
    prepDuration: z.number().default(120),
    turnDuration: z.number().default(300),
});
export const JoinRoomSchema = z.object({
    code: z.string().regex(/^[A-Z0-9]{6}$/),
});
export const UpdateRoomSettingsSchema = z.object({
    topic: z.string().min(5).max(500).optional(),
    description: z.string().max(2000).optional(),
    debateMode: z.enum(["buzzer", "round-robin"]).optional(),
    maxParticipants: z.number().min(2).max(100).optional(),
    votingDuration: z.number().optional(),
    prepDuration: z.number().optional(),
    turnDuration: z.number().optional(),
});
