import { z } from "zod";

export const ParticipantSchema = z.object({
  userId: z.string(),
  username: z.string(),
  side: z.enum(["for", "against", "neutral"]),
  isReady: z.boolean().default(false),
  joinedAt: z.date(),
});

export const RoomSchema = z.object({
  _id: z.string(),
  code: z.string().length(6),
  name: z.string().min(3).max(60),
  topic: z.string().min(10).max(200),
  mode: z.enum(["solo", "team"]),
  privacy: z.enum(["public", "private"]),
  status: z.enum(["waiting", "active", "ended"]),
  createdBy: z.string(),
  participants: z.array(ParticipantSchema),
  maxParticipants: z.number().min(2).max(20),
  password: z.string().optional(),
  createdAt: z.date(),
});

export const PublicRoomSchema = RoomSchema.omit({ password: true });

export const CreateRoomRequestSchema = z.object({
  name: z.string().min(3).max(60),
  topic: z.string().min(10).max(200),
  mode: z.enum(["solo", "team"]),
  privacy: z.enum(["public", "private"]),
  password: z.string().optional(),
  maxParticipants: z.number().min(2).max(20).default(10),
}).refine(
  (data) => data.privacy === "public" || data.password,
  {
    message: "Password is required for private rooms",
    path: ["password"],
  }
);

export const JoinRoomRequestSchema = z.object({
  code: z.string().length(6),
  password: z.string().optional(),
});

export type Participant = z.infer<typeof ParticipantSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type PublicRoom = z.infer<typeof PublicRoomSchema>;
export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
