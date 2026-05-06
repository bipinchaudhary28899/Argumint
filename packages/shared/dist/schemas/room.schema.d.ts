import { z } from "zod";
export declare const ParticipantSchema: z.ZodObject<{
    userId: z.ZodString;
    username: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<["moderator", "participant"]>>;
    joinedAt: z.ZodDate;
    status: z.ZodEnum<["joined", "ready", "in-debate", "disconnected"]>;
    side: z.ZodOptional<z.ZodEnum<["for", "against"]>>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    username: string;
    joinedAt: Date;
    status: "joined" | "ready" | "in-debate" | "disconnected";
    role?: "moderator" | "participant" | undefined;
    side?: "for" | "against" | undefined;
}, {
    userId: string;
    username: string;
    joinedAt: Date;
    status: "joined" | "ready" | "in-debate" | "disconnected";
    role?: "moderator" | "participant" | undefined;
    side?: "for" | "against" | undefined;
}>;
export declare const VotingTopicSchema: z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    votes: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    text: string;
    votes: number;
}, {
    id: string;
    text: string;
    votes?: number | undefined;
}>;
export declare const RoomSchema: z.ZodObject<{
    _id: z.ZodOptional<z.ZodString>;
    code: z.ZodString;
    creatorId: z.ZodString;
    creatorUsername: z.ZodString;
    topic: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    debateMode: z.ZodEnum<["buzzer", "alternate"]>;
    maxParticipants: z.ZodNumber;
    participants: z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        username: z.ZodString;
        role: z.ZodOptional<z.ZodEnum<["moderator", "participant"]>>;
        joinedAt: z.ZodDate;
        status: z.ZodEnum<["joined", "ready", "in-debate", "disconnected"]>;
        side: z.ZodOptional<z.ZodEnum<["for", "against"]>>;
    }, "strip", z.ZodTypeAny, {
        userId: string;
        username: string;
        joinedAt: Date;
        status: "joined" | "ready" | "in-debate" | "disconnected";
        role?: "moderator" | "participant" | undefined;
        side?: "for" | "against" | undefined;
    }, {
        userId: string;
        username: string;
        joinedAt: Date;
        status: "joined" | "ready" | "in-debate" | "disconnected";
        role?: "moderator" | "participant" | undefined;
        side?: "for" | "against" | undefined;
    }>, "many">;
    status: z.ZodEnum<["lobby", "voting", "ready-up", "prep", "live", "finished"]>;
    votingEnabled: z.ZodDefault<z.ZodBoolean>;
    votingTopics: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
        votes: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        text: string;
        votes: number;
    }, {
        id: string;
        text: string;
        votes?: number | undefined;
    }>, "many">>;
    votingDuration: z.ZodNumber;
    prepDuration: z.ZodNumber;
    turnDuration: z.ZodNumber;
    totalRounds: z.ZodNumber;
    transcriptionMode: z.ZodEnum<["whisper", "browser", "off"]>;
    whisperBudgetMinutes: z.ZodOptional<z.ZodNumber>;
    whisperMinutesUsed: z.ZodDefault<z.ZodNumber>;
    activeDebateId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    status: "lobby" | "voting" | "ready-up" | "prep" | "live" | "finished";
    code: string;
    creatorId: string;
    creatorUsername: string;
    topic: string;
    debateMode: "buzzer" | "alternate";
    maxParticipants: number;
    participants: {
        userId: string;
        username: string;
        joinedAt: Date;
        status: "joined" | "ready" | "in-debate" | "disconnected";
        role?: "moderator" | "participant" | undefined;
        side?: "for" | "against" | undefined;
    }[];
    votingEnabled: boolean;
    votingTopics: {
        id: string;
        text: string;
        votes: number;
    }[];
    votingDuration: number;
    prepDuration: number;
    turnDuration: number;
    totalRounds: number;
    transcriptionMode: "whisper" | "browser" | "off";
    whisperMinutesUsed: number;
    createdAt: Date;
    updatedAt: Date;
    _id?: string | undefined;
    description?: string | undefined;
    whisperBudgetMinutes?: number | undefined;
    activeDebateId?: string | undefined;
}, {
    status: "lobby" | "voting" | "ready-up" | "prep" | "live" | "finished";
    code: string;
    creatorId: string;
    creatorUsername: string;
    topic: string;
    debateMode: "buzzer" | "alternate";
    maxParticipants: number;
    participants: {
        userId: string;
        username: string;
        joinedAt: Date;
        status: "joined" | "ready" | "in-debate" | "disconnected";
        role?: "moderator" | "participant" | undefined;
        side?: "for" | "against" | undefined;
    }[];
    votingDuration: number;
    prepDuration: number;
    turnDuration: number;
    totalRounds: number;
    transcriptionMode: "whisper" | "browser" | "off";
    createdAt: Date;
    updatedAt: Date;
    _id?: string | undefined;
    description?: string | undefined;
    votingEnabled?: boolean | undefined;
    votingTopics?: {
        id: string;
        text: string;
        votes?: number | undefined;
    }[] | undefined;
    whisperBudgetMinutes?: number | undefined;
    whisperMinutesUsed?: number | undefined;
    activeDebateId?: string | undefined;
}>;
export declare const CreateRoomSchema: z.ZodEffects<z.ZodObject<{
    topic: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    description: z.ZodOptional<z.ZodString>;
    debateMode: z.ZodDefault<z.ZodEnum<["buzzer", "alternate"]>>;
    maxParticipants: z.ZodDefault<z.ZodNumber>;
    votingEnabled: z.ZodDefault<z.ZodBoolean>;
    votingTopics: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    votingDuration: z.ZodDefault<z.ZodNumber>;
    prepDuration: z.ZodDefault<z.ZodNumber>;
    turnDuration: z.ZodDefault<z.ZodNumber>;
    totalRounds: z.ZodDefault<z.ZodNumber>;
    transcriptionMode: z.ZodDefault<z.ZodEnum<["whisper", "browser", "off"]>>;
    whisperBudgetMinutes: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    topic: string;
    debateMode: "buzzer" | "alternate";
    maxParticipants: number;
    votingEnabled: boolean;
    votingTopics: string[];
    votingDuration: number;
    prepDuration: number;
    turnDuration: number;
    totalRounds: number;
    transcriptionMode: "whisper" | "browser" | "off";
    description?: string | undefined;
    whisperBudgetMinutes?: number | undefined;
}, {
    topic?: string | undefined;
    description?: string | undefined;
    debateMode?: "buzzer" | "alternate" | undefined;
    maxParticipants?: number | undefined;
    votingEnabled?: boolean | undefined;
    votingTopics?: string[] | undefined;
    votingDuration?: number | undefined;
    prepDuration?: number | undefined;
    turnDuration?: number | undefined;
    totalRounds?: number | undefined;
    transcriptionMode?: "whisper" | "browser" | "off" | undefined;
    whisperBudgetMinutes?: number | undefined;
}>, {
    topic: string;
    debateMode: "buzzer" | "alternate";
    maxParticipants: number;
    votingEnabled: boolean;
    votingTopics: string[];
    votingDuration: number;
    prepDuration: number;
    turnDuration: number;
    totalRounds: number;
    transcriptionMode: "whisper" | "browser" | "off";
    description?: string | undefined;
    whisperBudgetMinutes?: number | undefined;
}, {
    topic?: string | undefined;
    description?: string | undefined;
    debateMode?: "buzzer" | "alternate" | undefined;
    maxParticipants?: number | undefined;
    votingEnabled?: boolean | undefined;
    votingTopics?: string[] | undefined;
    votingDuration?: number | undefined;
    prepDuration?: number | undefined;
    turnDuration?: number | undefined;
    totalRounds?: number | undefined;
    transcriptionMode?: "whisper" | "browser" | "off" | undefined;
    whisperBudgetMinutes?: number | undefined;
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
    debateMode: z.ZodOptional<z.ZodEnum<["buzzer", "alternate"]>>;
    maxParticipants: z.ZodOptional<z.ZodNumber>;
    votingDuration: z.ZodOptional<z.ZodNumber>;
    prepDuration: z.ZodOptional<z.ZodNumber>;
    turnDuration: z.ZodOptional<z.ZodNumber>;
    totalRounds: z.ZodOptional<z.ZodNumber>;
    transcriptionMode: z.ZodOptional<z.ZodEnum<["whisper", "browser", "off"]>>;
    whisperBudgetMinutes: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    topic?: string | undefined;
    description?: string | undefined;
    debateMode?: "buzzer" | "alternate" | undefined;
    maxParticipants?: number | undefined;
    votingDuration?: number | undefined;
    prepDuration?: number | undefined;
    turnDuration?: number | undefined;
    totalRounds?: number | undefined;
    transcriptionMode?: "whisper" | "browser" | "off" | undefined;
    whisperBudgetMinutes?: number | undefined;
}, {
    topic?: string | undefined;
    description?: string | undefined;
    debateMode?: "buzzer" | "alternate" | undefined;
    maxParticipants?: number | undefined;
    votingDuration?: number | undefined;
    prepDuration?: number | undefined;
    turnDuration?: number | undefined;
    totalRounds?: number | undefined;
    transcriptionMode?: "whisper" | "browser" | "off" | undefined;
    whisperBudgetMinutes?: number | undefined;
}>;
export type Participant = z.infer<typeof ParticipantSchema>;
export type VotingTopic = z.infer<typeof VotingTopicSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type UpdateRoomSettingsInput = z.infer<typeof UpdateRoomSettingsSchema>;
