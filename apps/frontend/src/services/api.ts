import axios, { AxiosError } from "axios";
import { type RegisterInput, type LoginInput, type AuthResponse } from "@argumint/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // This includes cookies in requests
  headers: {
    "Content-Type": "application/json",
  },
});

// Error handler
const handleError = (error: AxiosError) => {
  if (error.response?.data && typeof error.response.data === "object") {
    const data = error.response.data as { error?: string };
    throw new Error(data.error || "An error occurred");
  }
  throw new Error(error.message || "An error occurred");
};

export const authApi = {
  async register(data: RegisterInput): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>("/auth/register", data);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },

  async login(data: LoginInput): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>("/auth/login", data);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post("/auth/logout");
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },

  async getMe(): Promise<AuthResponse> {
    try {
      const response = await apiClient.get<AuthResponse>("/auth/me");
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },
};
