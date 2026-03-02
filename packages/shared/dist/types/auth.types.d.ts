import type { PublicUser, RegisterInput, LoginInput, AuthResponse, RegisterRequest } from "../schemas/auth.schema";
export interface AuthState {
    user: PublicUser | null;
    isLoading: boolean;
    error: string | null;
}
export interface AuthContextType extends AuthState {
    register: (data: RegisterRequest) => Promise<void>;
    login: (data: LoginInput) => Promise<void>;
    logout: () => Promise<void>;
    checkAuth: () => Promise<void>;
}
export type { PublicUser, RegisterInput, RegisterRequest, LoginInput, AuthResponse };
