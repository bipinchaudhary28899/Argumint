import mongoose, { Schema, Document } from "mongoose";

export interface IParticipant {
  userId: string;
  username: string;
  role?: "moderator" | "participant";
  joinedAt: Date;
  status: "joined" | "ready" | "in-debate" | "disconnected";
  side?: "for" | "against"; // Assigned during debate start
}

export interface IRoom extends Document {
  code: string; // Unique room code
  creatorId: string;
  creatorUsername: string;
  topic: string;
  description?: string;
  debateMode: "buzzer" | "round-robin"; // Buzzer or Round-robin
  maxParticipants: number;
  participants: IParticipant[];
  status: "lobby" | "voting" | "ready-up" | "prep" | "live" | "finished";
  
  // Timing configuration
  votingDuration: number; // in seconds
  prepDuration: number; // in seconds
  turnDuration: number; // in seconds per turn
  
  createdAt: Date;
  updatedAt: Date;
}

const participantSchema = new Schema<IParticipant>(
  {
    userId: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["moderator", "participant"],
      default: "participant",
    },
    joinedAt: {
      type: Date,
      default: () => new Date(),
    },
    status: {
      type: String,
      enum: ["joined", "ready", "in-debate", "disconnected"],
      default: "joined",
    },
    side: {
      type: String,
      enum: ["for", "against"],
      required: false,
    },
  },
  { _id: false }
);

const roomSchema = new Schema<IRoom>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      match: /^[A-Z0-9]{6}$/,
    },
    creatorId: {
      type: String,
      required: true,
      index: true,
    },
    creatorUsername: {
      type: String,
      required: true,
    },
    topic: {
      type: String,
      required: true,
      minlength: 5,
      maxlength: 500,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    debateMode: {
      type: String,
      enum: ["buzzer", "round-robin"],
      default: "buzzer",
    },
    maxParticipants: {
      type: Number,
      default: 10,
      min: 2,
      max: 100,
    },
    participants: [participantSchema],
    status: {
      type: String,
      enum: ["lobby", "voting", "ready-up", "prep", "live", "finished"],
      default: "lobby",
    },
    votingDuration: {
      type: Number,
      default: 30, // 30 seconds
    },
    prepDuration: {
      type: Number,
      default: 120, // 2 minutes
    },
    turnDuration: {
      type: Number,
      default: 300, // 5 minutes
    },
  },
  { timestamps: true }
);

export const Room = mongoose.model<IRoom>("Room", roomSchema);
