import { PublicRoom, CreateRoomRequest, JoinRoomRequest } from "@argumint/shared";
import { apiClient } from "./api.js";

export class RoomService {
  static async createRoom(data: CreateRoomRequest): Promise<PublicRoom> {
    const response = await apiClient("/api/rooms", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to create room");
    }

    return response.json();
  }

  static async joinRoom(data: JoinRoomRequest): Promise<PublicRoom> {
    const response = await apiClient("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to join room");
    }

    return response.json();
  }

  static async getPublicRooms(): Promise<PublicRoom[]> {
    const response = await apiClient("/api/rooms");

    if (!response.ok) {
      throw new Error("Failed to fetch public rooms");
    }

    return response.json();
  }

  static async getUserRooms(): Promise<PublicRoom[]> {
    const response = await apiClient("/api/rooms/my-rooms");

    if (!response.ok) {
      throw new Error("Failed to fetch user rooms");
    }

    return response.json();
  }

  static async getRoomById(id: string): Promise<PublicRoom> {
    const response = await apiClient(`/api/rooms/${id}`);

    if (!response.ok) {
      throw new Error("Failed to fetch room");
    }

    return response.json();
  }

  static async getRoomByCode(code: string): Promise<PublicRoom> {
    const response = await apiClient(`/api/rooms/code/${code}`);

    if (!response.ok) {
      throw new Error("Failed to fetch room");
    }

    return response.json();
  }

  static async updateRoom(
    id: string,
    data: Partial<CreateRoomRequest>
  ): Promise<PublicRoom> {
    const response = await apiClient(`/api/rooms/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to update room");
    }

    return response.json();
  }

  static async leaveRoom(id: string): Promise<void> {
    const response = await apiClient(`/api/rooms/${id}/leave`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to leave room");
    }
  }

  static async deleteRoom(id: string): Promise<void> {
    const response = await apiClient(`/api/rooms/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to delete room");
    }
  }

  static async startRoom(id: string): Promise<PublicRoom> {
    const response = await apiClient(`/api/rooms/${id}/start`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to start room");
    }

    return response.json();
  }

  static async endRoom(id: string): Promise<PublicRoom> {
    const response = await apiClient(`/api/rooms/${id}/end`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to end room");
    }

    return response.json();
  }
}
