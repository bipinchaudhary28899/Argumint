import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PublicRoom } from "@argumint/shared";
import { RoomService } from "../services/room.service.js";

export function LobbyPage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!roomId) {
      navigate("/");
      return;
    }

    const fetchRoom = async () => {
      try {
        setLoading(true);
        const roomData = await RoomService.getRoomById(roomId);
        setRoom(roomData);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch room";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();

    // Poll for room updates
    const interval = setInterval(fetchRoom, 3000);
    return () => clearInterval(interval);
  }, [roomId, navigate]);

  const handleLeaveRoom = async () => {
    if (!room || !confirm("Leave this room?")) return;

    try {
      setActionLoading(true);
      await RoomService.leaveRoom(room._id);
      navigate("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to leave room";
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartDebate = async () => {
    if (!room) return;

    try {
      setActionLoading(true);
      const updatedRoom = await RoomService.startRoom(room._id);
      setRoom(updatedRoom);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start debate";
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndDebate = async () => {
    if (!room || !confirm("End this debate?")) return;

    try {
      setActionLoading(true);
      const updatedRoom = await RoomService.endRoom(room._id);
      setRoom(updatedRoom);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to end debate";
      setError(message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading room...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="mb-4 text-red-600">{error || "Room not found"}</p>
          <button
            onClick={() => navigate("/")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Back Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{room.name}</h1>
              <p className="mt-1 text-sm text-gray-600">{room.topic}</p>
            </div>
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

        <div className="grid gap-6 md:grid-cols-3">
          {/* Room Info */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Room Info
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium text-gray-700">Code:</span>{" "}
                <span className="font-mono text-lg text-blue-600">{room.code}</span>
              </p>
              <p>
                <span className="font-medium text-gray-700">Mode:</span>{" "}
                {room.mode === "solo" ? "Solo" : "Team"}
              </p>
              <p>
                <span className="font-medium text-gray-700">Privacy:</span>{" "}
                {room.privacy === "public" ? "Public" : "Private"}
              </p>
              <p>
                <span className="font-medium text-gray-700">Status:</span>{" "}
                <span
                  className={`rounded px-2 py-1 ${
                    room.status === "waiting"
                      ? "bg-yellow-100 text-yellow-700"
                      : room.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {room.status.charAt(0).toUpperCase() + room.status.slice(1)}
                </span>
              </p>
              <p>
                <span className="font-medium text-gray-700">
                  Max Participants:
                </span>{" "}
                {room.maxParticipants}
              </p>
              <p>
                <span className="font-medium text-gray-700">Created:</span>{" "}
                {new Date(room.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Participants */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Participants ({room.participants.length}/{room.maxParticipants})
            </h2>
            <div className="space-y-2">
              {room.participants.length === 0 ? (
                <p className="text-sm text-gray-500">No participants yet</p>
              ) : (
                room.participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className="rounded-lg bg-gray-50 p-3 text-sm"
                  >
                    <p className="font-medium text-gray-900">
                      {participant.username}
                    </p>
                    <p className="text-xs text-gray-600">
                      Side:{" "}
                      <span className="capitalize">{participant.side}</span>
                    </p>
                    <p className="text-xs text-gray-600">
                      Ready:{" "}
                      <span
                        className={
                          participant.isReady
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {participant.isReady ? "Yes" : "No"}
                      </span>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Actions
            </h2>
            <div className="space-y-3">
              {room.status === "waiting" && (
                <button
                  onClick={handleStartDebate}
                  disabled={actionLoading || room.participants.length < 2}
                  className="w-full rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  Start Debate
                </button>
              )}

              {room.status === "active" && (
                <button
                  onClick={handleEndDebate}
                  disabled={actionLoading}
                  className="w-full rounded-lg bg-red-600 px-4 py-2 text-white font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  End Debate
                </button>
              )}

              <button
                onClick={handleLeaveRoom}
                disabled={actionLoading}
                className="w-full rounded-lg bg-yellow-600 px-4 py-2 text-white font-medium hover:bg-yellow-700 disabled:opacity-50"
              >
                Leave Room
              </button>

              <p className="text-xs text-gray-600 text-center">
                {room.participants.length < 2 && room.status === "waiting"
                  ? "Need at least 2 participants to start"
                  : ""}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
