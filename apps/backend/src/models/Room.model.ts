import mongoose, { Schema, Document } from "mongoose";

export interface IParticipant {
  userId: string;
  username: string;
  role?: "moderator" | "participant";
  joinedAt: Date;
  status: "joined" | "ready" | "in-debate" | "disconnected";
  side?: "for" | "against"; // Assigned during debate start
}

export interface IVotingTopic {
  id: string;
  text: string;
  votes: number;
}

export interface IUserVote {
  userId: string;
  topicId: string;
}

export interface IRoom extends Document {
  code: string; // Unique room code
  creatorId: string;
  creatorUsername: string;
  topic: string;
  description?: string;
  debateMode: "buzzer" | "alternate"; // Buzzer or Alternate
  maxParticipants: number;
  participants: IParticipant[];
  status: "lobby" | "voting" | "ready-up" | "prep" | "live" | "finished";
  
  // Voting configuration
  votingEnabled: boolean;
  votingTopics: IVotingTopic[];
  
  // Voting state
  votingInProgress: boolean;
  userVotes: IUserVote[]; // Track which user voted for which topic
  selectedTopic?: string; // Selected topic ID after voting ends
  votingStartTime?: Date; // When voting started
  
  // Timing configuration
  votingDuration: number; // in seconds
  prepDuration: number; // in seconds
  turnDuration: number; // in seconds per turn

  // Debate configuration
  totalRounds: number; // how many rotations through participants

  // Cost / quality controls for transcription
  transcriptionMode: "whisper" | "browser" | "off";
  whisperBudgetMinutes?: number; // optional cap; undefined = unlimited
  whisperMinutesUsed: number; // running tally (trimmed minutes)

  // Debate runtime — populated once host starts the debate
  activeDebateId?: string;

  createdAt: Date;
  updatedAt: Date;
}

const userVoteSchema = new Schema<IUserVote>(
  {
    userId: {
      type: String,
      required: true,
    },
    topicId: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const votingTopicSchema = new Schema<IVotingTopic>(
  {
    id: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
      minlength: [1, "Voting topic cannot be empty"],
      maxlength: 500,
      trim: true,
    },
    votes: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

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
      required: function(this: IRoom) {
        return !this.votingEnabled; // topic is required only if voting is disabled
      },
      maxlength: 500,
    },
    description: {
      type: String,
      maxlength: 2000,
    },
    debateMode: {
      type: String,
      enum: ["buzzer", "alternate"],
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
    votingEnabled: {
      type: Boolean,
      default: false,
    },
    votingTopics: [votingTopicSchema],
    votingInProgress: {
      type: Boolean,
      default: false,
    },
    userVotes: [userVoteSchema],
    selectedTopic: {
      type: String,
      required: false,
    },
    votingStartTime: {
      type: Date,
      required: false,
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
    totalRounds: {
      type: Number,
      default: 2,
      min: 1,
      max: 5,
    },
    transcriptionMode: {
      type: String,
      enum: ["whisper", "browser", "off"],
      default: "whisper",
    },
    whisperBudgetMinutes: {
      type: Number,
      required: false,
    },
    whisperMinutesUsed: {
      type: Number,
      default: 0,
    },
    activeDebateId: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

// Custom validator for topic field
roomSchema.pre("validate", function(next) {
  // If voting is disabled, topic must be at least 5 characters
  if (!this.votingEnabled && this.topic && this.topic.length < 5) {
    this.invalidate("topic", "Topic must be at least 5 characters long when voting is disabled");
  }
  next();
});

export const Room = mongoose.model<IRoom>("Room", roomSchema);
