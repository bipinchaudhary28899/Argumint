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

// Level System
export {
  LEVEL_TABLE,
  getLevelInfo,
  type LevelEntry,
  type LevelInfo,
} from "./utils/levels.js";

// Debate Schemas and Types
export {
  RoundSchema,
  CurrentTurnSchema,
  TurnOrderEntrySchema,
  ScoreBreakdownSchema,
  DebateResultSchema,
  DebateSchema,
  BuzzerStateSchema,
  BuzzerCooldownEntrySchema,
  type Round,
  type CurrentTurn,
  type TurnOrderEntry,
  type ScoreBreakdown,
  type DebateResult,
  type Debate,
  type BuzzerState,
  type BuzzerCooldownEntry,
} from "./schemas/debate.schema.js";