import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { useSocket } from "../hooks/useSocket";
import { roomApi } from "../services/api";
import type { Room, Participant } from "@argumint/shared";

export function RoomLobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { room: contextRoom, setRoom, setError } = useRoom();
  const { socket, isConnected } = useSocket();

  const [room, setLocalRoom] = useState<Room | null>(contextRoom || null);
  const [isLoading, setIsLoading] = useState(!contextRoom);
  const [userReady, setUserReady] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // Fetch room if not in context
  useEffect(() => {
    if (!contextRoom && code) {
      const fetchRoom = async () => {
        try {
          const fetchedRoom = await roomApi.getRoomByCode(code);
          setLocalRoom(fetchedRoom);
          setRoom(fetchedRoom);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to fetch room";
          setError(message);
          console.error("Fetch room error:", err);
        } finally {
          setIsLoading(false);
        }
      };

      fetchRoom();
    } else if (contextRoom) {
      setLocalRoom(contextRoom);
      setIsLoading(false);
    }
  }, [contextRoom, code]);

  // Setup socket connection and listeners
  useEffect(() => {
    if (!socket || !isConnected || !room || !code) return;

    console.log("[Socket] Setting up room listeners", { roomId: room._id, code });

    // Join room via socket
    socket.emit("room:join", { roomCode: code }, (response: any) => {
      console.log("[Socket] Join room response:", response);
      if (!response.success) {
        setError(response.error || "Failed to join room");
      }
    });

    // Listen for participant joined
    socket.on("room:participant-joined", (data: any) => {
      console.log("[Socket] Participant joined:", data);
      setLocalRoom(data.room || { ...room, participants: data.participants });
    });

    // Listen for participant left
    socket.on("room:participant-left", (data: any) => {
      console.log("[Socket] Participant left:", data);
      if (data.participants) {
        setLocalRoom((prev) => ({
          ...prev!,
          participants: data.participants,
        }));
      }
    });

    // Listen for participant status update
    socket.on("room:participant-status-updated", (data: any) => {
      console.log("[Socket] Participant status updated:", data);
      if (data.participants) {
        setLocalRoom((prev) => ({
          ...prev!,
          participants: data.participants,
        }));
      }
    });

    // Listen for participant disconnected
    socket.on("room:participant-disconnected", (data: any) => {
      console.log("[Socket] Participant disconnected:", data);
      if (data.participants) {
        setLocalRoom((prev) => ({
          ...prev!,
          participants: data.participants,
        }));
      }
    });

    // Cleanup on unmount
    return () => {
      socket.off("room:participant-joined");
      socket.off("room:participant-left");
      socket.off("room:participant-status-updated");
      socket.off("room:participant-disconnected");
    };
  }, [socket, isConnected, room, code]);

  const handleReady = async () => {
    if (!room || !socket) return;

    try {
      setUserReady(true);
      socket.emit("room:update-status", {
        roomId: room._id,
        status: "ready",
      });
    } catch (err) {
      console.error("Ready error:", err);
      setUserReady(false);
    }
  };

  const handleUnready = async () => {
    if (!room || !socket) return;

    try {
      setUserReady(false);
      socket.emit("room:update-status", {
        roomId: room._id,
        status: "joined",
      });
    } catch (err) {
      console.error("Unready error:", err);
      setUserReady(true);
    }
  };

  const handleStartDebate = () => {
    if (room && isCreator && allReady) {
      // TODO: Move to voting phase
      console.log("Starting debate...");
    }
  };

  const handleLeave = () => {
    if (room && socket) {
      socket.emit("room:leave", { roomId: room._id });
      navigate("/");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
        <div className="text-gray-600">Loading room...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Room not found</p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const isCreator = room.creatorId === user?.username;
  const currentUser = room.participants.find((p) => p.userId === user?.username);
  const allReady = room.participants.every((p) => p.status === "ready");
  const readyCount = room.participants.filter((p) => p.status === "ready").length;

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
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
              </span>
              <span className="text-gray-700">{user?.email}</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-12 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Room Info */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{room.topic}</h1>
              {room.description && (
                <p className="text-gray-600 mb-6">{room.description}</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase font-semibold">Mode</p>
                  <p className="text-lg font-bold text-indigo-600 capitalize">
                    {room.debateMode}
                  </p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase font-semibold">Ready</p>
                  <p className="text-lg font-bold text-indigo-600">
                    {readyCount}/{room.participants.length}
                  </p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase font-semibold">Voting</p>
                  <p className="text-lg font-bold text-indigo-600">{room.votingDuration}s</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 uppercase font-semibold">Turn</p>
                  <p className="text-lg font-bold text-indigo-600">{room.turnDuration}s</p>
                </div>
              </div>
            </div>

            {/* Participants List */}
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Participants ({room.participants.length}/{room.maxParticipants})
              </h2>
              <div className="space-y-3">
                {room.participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                        {participant.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{participant.username}</p>
                        <p className="text-xs text-gray-600">
                          {participant.role === "moderator" ? "Host" : "Participant"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          participant.status === "ready"
                            ? "bg-green-100 text-green-700"
                            : participant.status === "disconnected"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {participant.status === "disconnected" ? "Offline" : "Ready"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar - Actions */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-4 space-y-4">
              <h3 className="text-lg font-bold text-gray-900">Your Status</h3>

              {!userReady ? (
                <button
                  onClick={handleReady}
                  disabled={isJoining}
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-md
                    hover:bg-green-700 disabled:opacity-50 transition font-medium"
                >
                  {isJoining ? "Marking ready..." : "Ready Up"}
                </button>
              ) : (
                <button
                  onClick={handleUnready}
                  className="w-full px-6 py-3 bg-orange-600 text-white rounded-md
                    hover:bg-orange-700 transition font-medium"
                >
                  Not Ready
                </button>
              )}

              {isCreator && allReady && room.participants.length >= 2 && (
                <button
                  onClick={handleStartDebate}
                  className="w-full px-6 py-3 bg-indigo-600 text-white rounded-md
                    hover:bg-indigo-700 transition font-bold text-lg"
                >
                  Start Debate
                </button>
              )}

              {isCreator && (!allReady || room.participants.length < 2) && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    {room.participants.length < 2
                      ? "Need at least 2 participants"
                      : `Waiting for ${room.participants.length - readyCount} participant(s) to ready up`}
                  </p>
                </div>
              )}

              <button
                onClick={handleLeave}
                className="w-full px-6 py-3 border border-red-600 text-red-600 rounded-md
                  hover:bg-red-50 transition font-medium"
              >
                Leave Room
              </button>

              {/* Connection Status */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600 uppercase font-semibold mb-2">
                  Connection
                </p>
                <p className={`text-sm font-medium ${isConnected ? "text-green-600" : "text-red-600"}`}>
                  {isConnected ? "Connected" : "Disconnected"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
