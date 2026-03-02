import { PublicUser } from "./auth.types";

export interface UserDocument {
  _id: string;
  email: string;
  password: string; // hashed
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUserInfo {
  id: string;
  email: string;
  createdAt: Date;
}

export function toPublicUser(user: {
  _id: { toString(): string };
  email: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    createdAt: user.createdAt,
  };
}
