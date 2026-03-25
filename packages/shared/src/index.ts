// Auth Schemas
export {
  RegisterSchema,
  LoginSchema,
  AuthResponseSchema,
  UserSchema,
  PublicUserSchema,
  type RegisterInput,
  type RegisterRequest,
  type LoginInput,
  type AuthResponse,
  type User,
  type PublicUser,
} from "./schemas/auth.schema.js";

// Auth Types
export {
  type AuthState,
  type AuthContextType,
} from "./types/auth.types.js";

// User Types and Utilities
export {
  type UserDocument,
  type PublicUserInfo,
  toPublicUser,
} from "./types/user.types.js";

// Room Schemas and Types
export {
  ParticipantSchema,
  RoomSchema,
  CreateRoomSchema,
  JoinRoomSchema,
  UpdateRoomSettingsSchema,
  type Participant,
  type Room,
  type VotingTopic,
  type CreateRoomInput,
  type JoinRoomInput,
  type UpdateRoomSettingsInput,
} from "./schemas/room.schema.js";

// Debate Schemas and Types
export {
  startDebateSchema,
  claimMicSchema,
  releaseMicSchema,
  nextRoundSchema,
  endDebateSchema,
  getDebateStateSchema,
  argumentSchema,
  debateRoundSchema,
  debateStateSchema,
  type StartDebateInput,
  type ClaimMicInput,
  type ReleaseMicInput,
  type NextRoundInput,
  type EndDebateInput,
  type GetDebateStateInput,
  type Argument,
  type DebateRound,
  type DebateState,
} from "./schemas/debate.schema.js";
