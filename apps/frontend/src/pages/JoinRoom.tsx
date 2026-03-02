import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { roomApi } from "../services/api";

export function JoinRoom() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setRoom, error, setError } = useRoom();
  const [isLoading, setIsLoading] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!roomCode.trim()) {
      setError("Room code is required");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const code = roomCode.toUpperCase().trim();
      const room = await roomApi.joinRoom({ code });
      setRoom(room);
      navigate(`/room/${room.code}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to join room";
      setError(message);
      console.error("Join room error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <button
              onClick={() => navigate("/")}
              className="text-2xl font-extrabold text-indigo-600 hover:opacity-80"
            >
              Argumint
            </button>
            <span className="text-gray-700">{user?.email}</span>
          </div>
        </div>
      </nav>

      <main className="flex flex-col items-center justify-center py-12 px-4 h-[calc(100vh-64px)]">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-10">
          <h1 className="text-3xl font-extrabold text-indigo-600 mb-8 text-center">
            Join a Debate
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700">
                Room Code
              </label>
              <input
                type="text"
                id="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g., ABC123"
                maxLength={6}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                  focus:ring-indigo-500 focus:border-indigo-500 uppercase text-center text-lg
                  font-mono"
              />
              <p className="mt-2 text-sm text-gray-600 text-center">
                Ask the debate creator for the room code
              </p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="submit"
                disabled={isLoading || roomCode.length !== 6}
                className="w-full px-6 py-3 bg-indigo-600 text-white rounded-md
                  hover:bg-indigo-700 disabled:opacity-50 transition font-medium"
              >
                {isLoading ? "Joining..." : "Join Room"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="w-full px-6 py-3 border border-indigo-600 text-indigo-600
                  rounded-md hover:bg-indigo-50 transition font-medium"
              >
                Back to Home
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
