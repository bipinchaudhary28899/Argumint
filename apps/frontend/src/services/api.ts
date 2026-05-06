import axios, { AxiosError } from "axios";
import { 
  type LoginInput, 
  type AuthResponse, 
  type RegisterRequest,
  type Room,
  type CreateRoomInput,
  type JoinRoomInput,
  type UpdateRoomSettingsInput,
} from "@argumint/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // This includes cookies in requests
  headers: {
    "Content-Type": "application/json",
  },
});

// Response interceptor to store token from response
apiClient.interceptors.response.use(
  (response) => {
    // Check if response contains a token (for login/register)
    const data = response.data as { token?: string };
    if (data.token) {
      localStorage.setItem("token", data.token);
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Error handler
// Error handler — for HTTP errors (4xx/5xx) we throw a plain Error with the
// server's message but also attach .response so callers can distinguish an
// HTTP failure from a network failure (no .response = server unreachable).
// For network errors we rethrow the original AxiosError so its .code /
// .message ("Network Error") and absent .response are preserved intact.
const handleError = (error: AxiosError): never => {
  if (error.response?.data && typeof error.response.data === "object") {
    const data = error.response.data as { error?: string };
    const wrapped = Object.assign(new Error(data.error || "An error occurred"), {
      response: error.response,
    });
    throw wrapped;
  }
  throw error; // network error — preserve original AxiosError
};

export const authApi = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
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

export const roomApi = {
  async createRoom(data: CreateRoomInput): Promise<Room> {
    try {
      const response = await apiClient.post<Room>("/rooms/create", data);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },

  async getRoomByCode(code: string): Promise<Room> {
    try {
      const response = await apiClient.get<Room>(`/rooms/${code}`);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },

  async joinRoom(data: JoinRoomInput): Promise<Room> {
    try {
      const response = await apiClient.post<Room>("/rooms/join", data);
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },

  async updateRoomSettings(
    roomId: string,
    data: UpdateRoomSettingsInput
  ): Promise<Room> {
    try {
      const response = await apiClient.put<Room>(
        `/rooms/${roomId}/settings`,
        data
      );
      return response.data;
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },
};

export const debateApi = {
  /**
   * Upload an audio blob to /debates/:id/transcribe and get back the
   * Whisper transcript text. Caller is responsible for then emitting
   * `debate:submit-argument` over the socket with the returned text.
   */
  async transcribe(debateId: string, audio: Blob): Promise<string> {
    try {
      const form = new FormData();
      // Use a sensible filename so the backend hands Whisper a recognizable extension.
      const filename = audio.type.includes("ogg")
        ? "speech.ogg"
        : audio.type.includes("mp4")
        ? "speech.mp4"
        : "speech.webm";
      form.append("audio", audio, filename);
      const response = await apiClient.post<{ text: string }>(
        `/debates/${debateId}/transcribe`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data.text;
    } catch (error) {
      handleError(error as AxiosError);
      throw error;
    }
  },
};
