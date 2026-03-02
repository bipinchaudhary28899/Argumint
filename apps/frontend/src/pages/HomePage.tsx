import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PublicRoom } from "@argumint/shared";
import { RoomService } from "../services/room.service.js";
import { RoomCard } from "../components/RoomCard.js";
import { useAuth } from "../contexts/AuthContext.js";

export function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        setLoading(true);
        const publicRooms = await RoomService.getPublicRooms();
        setRooms(publicRooms);
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

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Argumint</h1>
            <div className="flex gap-4 items-center">
              {user && <span className="text-gray-700 text-sm">{user.email}</span>}
              <button
                onClick={() => navigate("/create-room")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Create Room
              </button>
              <button
                onClick={() => navigate("/join-room")}
                className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
              >
                Join Room
              </button>
              <button
                onClick={() => navigate("/my-rooms")}
                className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
              >
                My Rooms
              </button>
              <button
                onClick={handleLogout}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">
          Public Debates
        </h2>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500">Loading rooms...</div>
        ) : rooms.length === 0 ? (
          <div className="text-center text-gray-500">
            No public rooms available. Create one to get started!
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <RoomCard
                key={room._id}
                room={room}
                onJoin={() => navigate(`/join-room?code=${room.code}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
