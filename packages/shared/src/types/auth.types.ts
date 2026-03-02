import type { PublicUser, RegisterInput, LoginInput, AuthResponse } from "../schemas/auth.schema.js";

export interface AuthState {
  user: PublicUser | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextType extends AuthState {
  register: (data: RegisterInput) => Promise<void>;
  login: (data: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export type { PublicUser, RegisterInput, LoginInput, AuthResponse };
