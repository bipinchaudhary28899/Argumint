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

// Room Schemas
export {
  RoomSchema,
  PublicRoomSchema,
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  ParticipantSchema,
  type Room,
  type PublicRoom,
  type CreateRoomRequest,
  type JoinRoomRequest,
  type Participant,
} from "./schemas/room.schema.js";

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
