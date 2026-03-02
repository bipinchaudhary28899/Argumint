import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PublicRoom } from "@argumint/shared";
import { RoomService } from "../services/room.service.js";
import { RoomCard } from "../components/RoomCard.js";

export function MyRoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        setLoading(true);
        const userRooms = await RoomService.getUserRooms();
        setRooms(userRooms);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch rooms";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, []);

  const handleLeaveRoom = async (roomId: string) => {
    if (!confirm("Are you sure you want to leave this room?")) {
      return;
    }

    try {
      await RoomService.leaveRoom(roomId);
      setRooms(rooms.filter((r) => r._id !== roomId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to leave room";
      setError(message);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm("Are you sure you want to delete this room?")) {
      return;
    }

    try {
      await RoomService.deleteRoom(roomId);
      setRooms(rooms.filter((r) => r._id !== roomId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete room";
      setError(message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">My Rooms</h1>
            <button
              onClick={() => navigate("/")}
              className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
            >
              Back
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500">Loading your rooms...</div>
        ) : rooms.length === 0 ? (
          <div className="text-center text-gray-500">
            You don't have any rooms yet.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <div
                key={room._id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow"
              >
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  {room.name}
                </h3>
                <p className="mb-2 text-sm text-gray-600">{room.topic}</p>
                <div className="mb-4 flex gap-2">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
                    {room.mode === "solo" ? "Solo" : "Team"}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      room.privacy === "public"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {room.privacy === "public" ? "Public" : "Private"}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      room.status === "waiting"
                        ? "bg-yellow-100 text-yellow-700"
                        : room.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {room.status.charAt(0).toUpperCase() +
                      room.status.slice(1)}
                  </span>
                </div>
                <p className="mb-4 text-sm text-gray-600">
                  Code: <strong>{room.code}</strong>
                </p>
                <p className="mb-4 text-sm text-gray-600">
                  Participants: {room.participants.length}/{room.maxParticipants}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/lobby/${room._id}`)}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleLeaveRoom(room._id)}
                    className="flex-1 rounded-lg bg-yellow-600 px-3 py-2 text-sm text-white hover:bg-yellow-700"
                  >
                    Leave
                  </button>
                  <button
                    onClick={() => handleDeleteRoom(room._id)}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
