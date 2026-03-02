import { z } from "zod";
export declare const ParticipantSchema: z.ZodObject<{
    userId: z.ZodString;
    username: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<["moderator", "participant"]>>;
    joinedAt: z.ZodDate;
    status: z.ZodEnum<["joined", "ready", "in-debate", "disconnected"]>;
    side: z.ZodOptional<z.ZodEnum<["for", "against"]>>;
}, "strip", z.ZodTypeAny, {
    username: string;
    status: "joined" | "ready" | "in-debate" | "disconnected";
    userId: string;
    joinedAt: Date;
    role?: "moderator" | "participant" | undefined;
    side?: "for" | "against" | undefined;
}, {
    username: string;
    status: "joined" | "ready" | "in-debate" | "disconnected";
    userId: string;
    joinedAt: Date;
    role?: "moderator" | "participant" | undefined;
    side?: "for" | "against" | undefined;
}>;
export declare const RoomSchema: z.ZodObject<{
    _id: z.ZodOptional<z.ZodString>;
    code: z.ZodString;
    creatorId: z.ZodString;
    creatorUsername: z.ZodString;
    topic: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    debateMode: z.ZodEnum<["buzzer", "round-robin"]>;
    maxParticipants: z.ZodNumber;
    participants: z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        username: z.ZodString;
        role: z.ZodOptional<z.ZodEnum<["moderator", "participant"]>>;
        joinedAt: z.ZodDate;
        status: z.ZodEnum<["joined", "ready", "in-debate", "disconnected"]>;
        side: z.ZodOptional<z.ZodEnum<["for", "against"]>>;
    }, "strip", z.ZodTypeAny, {
        username: string;
        status: "joined" | "ready" | "in-debate" | "disconnected";
        userId: string;
        joinedAt: Date;
        role?: "moderator" | "participant" | undefined;
        side?: "for" | "against" | undefined;
    }, {
        username: string;
        status: "joined" | "ready" | "in-debate" | "disconnected";
        userId: string;
        joinedAt: Date;
        role?: "moderator" | "participant" | undefined;
        side?: "for" | "against" | undefined;
    }>, "many">;
    status: z.ZodEnum<["lobby", "voting", "ready-up", "prep", "live", "finished"]>;
    votingDuration: z.ZodNumber;
    prepDuration: z.ZodNumber;
    turnDuration: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    code: string;
    status: "lobby" | "voting" | "ready-up" | "prep" | "live" | "finished";
    createdAt: Date;
    updatedAt: Date;
    creatorId: string;
    creatorUsername: string;
    topic: string;
    debateMode: "buzzer" | "round-robin";
    maxParticipants: number;
    participants: {
        username: string;
        status: "joined" | "ready" | "in-debate" | "disconnected";
        userId: string;
        joinedAt: Date;
        role?: "moderator" | "participant" | undefined;
        side?: "for" | "against" | undefined;
    }[];
    votingDuration: number;
    prepDuration: number;
    turnDuration: number;
    _id?: string | undefined;
    description?: string | undefined;
}, {
    code: string;
    status: "lobby" | "voting" | "ready-up" | "prep" | "live" | "finished";
    createdAt: Date;
    updatedAt: Date;
    creatorId: string;
    creatorUsername: string;
    topic: string;
    debateMode: "buzzer" | "round-robin";
    maxParticipants: number;
    participants: {
        username: string;
        status: "joined" | "ready" | "in-debate" | "disconnected";
        userId: string;
        joinedAt: Date;
        role?: "moderator" | "participant" | undefined;
        side?: "for" | "against" | undefined;
    }[];
    votingDuration: number;
    prepDuration: number;
    turnDuration: number;
    _id?: string | undefined;
    description?: string | undefined;
}>;
export declare const CreateRoomSchema: z.ZodObject<{
    topic: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    debateMode: z.ZodDefault<z.ZodEnum<["buzzer", "round-robin"]>>;
    maxParticipants: z.ZodDefault<z.ZodNumber>;
    votingDuration: z.ZodDefault<z.ZodNumber>;
    prepDuration: z.ZodDefault<z.ZodNumber>;
    turnDuration: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    topic: string;
    debateMode: "buzzer" | "round-robin";
    maxParticipants: number;
    votingDuration: number;
    prepDuration: number;
    turnDuration: number;
    description?: string | undefined;
}, {
    topic: string;
    description?: string | undefined;
    debateMode?: "buzzer" | "round-robin" | undefined;
    maxParticipants?: number | undefined;
    votingDuration?: number | undefined;
    prepDuration?: number | undefined;
    turnDuration?: number | undefined;
}>;
export declare const JoinRoomSchema: z.ZodObject<{
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
export declare const UpdateRoomSettingsSchema: z.ZodObject<{
    topic: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    debateMode: z.ZodOptional<z.ZodEnum<["buzzer", "round-robin"]>>;
    maxParticipants: z.ZodOptional<z.ZodNumber>;
    votingDuration: z.ZodOptional<z.ZodNumber>;
    prepDuration: z.ZodOptional<z.ZodNumber>;
    turnDuration: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    topic?: string | undefined;
    description?: string | undefined;
    debateMode?: "buzzer" | "round-robin" | undefined;
    maxParticipants?: number | undefined;
    votingDuration?: number | undefined;
    prepDuration?: number | undefined;
    turnDuration?: number | undefined;
}, {
    topic?: string | undefined;
    description?: string | undefined;
    debateMode?: "buzzer" | "round-robin" | undefined;
    maxParticipants?: number | undefined;
    votingDuration?: number | undefined;
    prepDuration?: number | undefined;
    turnDuration?: number | undefined;
}>;
export type Participant = z.infer<typeof ParticipantSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type UpdateRoomSettingsInput = z.infer<typeof UpdateRoomSettingsSchema>;
