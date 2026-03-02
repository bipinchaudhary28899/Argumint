import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcrypt";

export interface IParticipant {
  userId: string;
  username: string;
  side: "for" | "against" | "neutral";
  isReady: boolean;
  joinedAt: Date;
}

export interface IRoom extends Document {
  code: string;
  name: string;
  topic: string;
  mode: "solo" | "team";
  privacy: "public" | "private";
  status: "waiting" | "active" | "ended";
  createdBy: string;
  participants: IParticipant[];
  maxParticipants: number;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const participantSchema = new Schema<IParticipant>({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  side: {
    type: String,
    enum: ["for", "against", "neutral"],
    required: true,
  },
  isReady: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
});

const roomSchema = new Schema<IRoom>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      length: 6,
      index: true,
    },
    name: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 60,
      trim: true,
    },
    topic: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 200,
      trim: true,
    },
    mode: {
      type: String,
      enum: ["solo", "team"],
      required: true,
    },
    privacy: {
      type: String,
      enum: ["public", "private"],
      required: true,
    },
    status: {
      type: String,
      enum: ["waiting", "active", "ended"],
      default: "waiting",
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
    participants: [participantSchema],
    maxParticipants: {
      type: Number,
      required: true,
      min: 2,
      max: 20,
      default: 10,
    },
    password: {
      type: String,
    },
  },
  { timestamps: true }
);

// Hash password before saving if it's modified
roomSchema.pre<IRoom>("save", async function (next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }

  try {
    const hashed = await bcrypt.hash(this.password, 10);
    this.password = hashed;
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare passwords
roomSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.password);
};

export const Room = mongoose.model<IRoom>("Room", roomSchema);
