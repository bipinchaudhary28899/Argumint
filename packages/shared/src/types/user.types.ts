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

export function toPublicUser(user: UserDocument): PublicUserInfo {
  return {
    id: user._id,
    email: user.email,
    createdAt: user.createdAt,
  };
}
