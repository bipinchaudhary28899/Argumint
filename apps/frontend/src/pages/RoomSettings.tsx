import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { roomApi } from "../services/api";
import type { UpdateRoomSettingsInput } from "@argumint/shared";

export function RoomSettings() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { room, setRoom, setError } = useRoom();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  
  const [formData, setFormData] = useState<UpdateRoomSettingsInput>({
    topic: "",
    description: "",
    debateMode: "buzzer",
    maxParticipants: 10,
    votingDuration: 30,
    prepDuration: 120,
    turnDuration: 300,
  });

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        if (!code) {
          setError("Room code not found");
          return;
        }

        const fetchedRoom = await roomApi.getRoomByCode(code);
        setRoom(fetchedRoom);
        
        // Check if current user is the creator
        const isRoomCreator = fetchedRoom.creatorId === user?.username; // Adjust based on actual user structure
        setIsCreator(isRoomCreator);

        // Populate form with room data
        setFormData({
          topic: fetchedRoom.topic,
          description: fetchedRoom.description,
          debateMode: fetchedRoom.debateMode,
          maxParticipants: fetchedRoom.maxParticipants,
          votingDuration: fetchedRoom.votingDuration,
          prepDuration: fetchedRoom.prepDuration,
          turnDuration: fetchedRoom.turnDuration,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch room";
        setError(message);
        console.error("Fetch room error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoom();
  }, [code, user]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "number" ? (value ? parseInt(value, 10) : 0) : value,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!room?._id) return;

    try {
      setIsSaving(true);
      setError(null);
      const updatedRoom = await roomApi.updateRoomSettings(room._id, formData);
      setRoom(updatedRoom);
      
      // Show success message
      alert("Room settings updated successfully!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update settings";
      setError(message);
      console.error("Update error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartDebate = () => {
    // TODO: Move to Phase D for voting/lobby
    navigate(`/room/${code}/lobby`);
  };

  if (isLoading) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <img src="/logo/logo.png" alt="Loading…" className="logo-heartbeat" style={{ width: 72, height: 72 }} />
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

      <main className="max-w-6xl mx-auto py-12 px-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Room Info Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-4">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Room Code</h2>
              
              <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl p-6 text-white mb-6 text-center">
                <p className="text-sm opacity-90 mb-2">Share this code</p>
                <p className="text-4xl font-mono font-bold tracking-widest">{code}</p>
              </div>

              <button
                onClick={handleCopyCode}
                className="w-full px-4 py-2 bg-indigo-100 text-indigo-700 rounded-md
                  hover:bg-indigo-200 transition mb-4 font-medium"
              >
                {copied ? "Copied!" : "Copy Code"}
              </button>

              {/* Room Stats */}
              <div className="space-y-4 border-t pt-6">
                <div>
                  <p className="text-xs text-gray-600 uppercase font-semibold">Creator</p>
                  <p className="text-sm font-medium text-gray-900">{room.creatorUsername}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 uppercase font-semibold">Participants</p>
                  <p className="text-sm font-medium text-gray-900">
                    {room.participants.length}/{room.maxParticipants}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 uppercase font-semibold">Status</p>
                  <p className="text-sm font-medium text-indigo-600 capitalize">{room.status}</p>
                </div>
              </div>

              {isCreator && (
                <button
                  onClick={handleStartDebate}
                  disabled={room.participants.length < 2}
                  className="w-full mt-6 px-4 py-3 bg-green-600 text-white rounded-md
                    hover:bg-green-700 disabled:opacity-50 transition font-medium"
                  title={room.participants.length < 2 ? "Need at least 2 participants" : ""}
                >
                  Go to Lobby
                </button>
              )}
            </div>
          </div>

          {/* Settings Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Room Settings</h2>
                {!isCreator && (
                  <span className="text-sm text-gray-600">Read-only mode</span>
                )}
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                {/* Topic */}
                <div>
                  <label htmlFor="topic" className="block text-sm font-medium text-gray-700">
                    Debate Topic
                  </label>
                  <input
                    type="text"
                    id="topic"
                    name="topic"
                    value={formData.topic}
                    onChange={handleChange}
                    disabled={!isCreator}
                    maxLength={500}
                    className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                      focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description || ""}
                    onChange={handleChange}
                    disabled={!isCreator}
                    maxLength={2000}
                    rows={4}
                    className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                      focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                  />
                </div>

                {/* Debate Mode */}
                <div>
                  <label htmlFor="debateMode" className="block text-sm font-medium text-gray-700">
                    Debate Mode
                  </label>
                  <select
                    id="debateMode"
                    name="debateMode"
                    value={formData.debateMode}
                    onChange={handleChange}
                    disabled={!isCreator}
                    className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                      focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                  >
                    <option value="buzzer">Buzzer Mode</option>
                    <option value="alternate">Alternate Mode</option>
                  </select>
                </div>

                {/* Max Participants */}
                <div>
                  <label htmlFor="maxParticipants" className="block text-sm font-medium text-gray-700">
                    Max Participants
                  </label>
                  <input
                    type="number"
                    id="maxParticipants"
                    name="maxParticipants"
                    value={formData.maxParticipants}
                    onChange={handleChange}
                    disabled={!isCreator}
                    min={2}
                    max={100}
                    className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                      focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                  />
                </div>

                {/* Timings */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="votingDuration" className="block text-sm font-medium text-gray-700">
                      Voting Duration (sec)
                    </label>
                    <input
                      type="number"
                      id="votingDuration"
                      name="votingDuration"
                      value={formData.votingDuration}
                      onChange={handleChange}
                      disabled={!isCreator}
                      min={10}
                      max={300}
                      className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                        focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="prepDuration" className="block text-sm font-medium text-gray-700">
                      Prep Duration (sec)
                    </label>
                    <input
                      type="number"
                      id="prepDuration"
                      name="prepDuration"
                      value={formData.prepDuration}
                      onChange={handleChange}
                      disabled={!isCreator}
                      min={30}
                      max={600}
                      className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                        focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="turnDuration" className="block text-sm font-medium text-gray-700">
                      Turn Duration (sec)
                    </label>
                    <input
                      type="number"
                      id="turnDuration"
                      name="turnDuration"
                      value={formData.turnDuration}
                      onChange={handleChange}
                      disabled={!isCreator}
                      min={60}
                      max={900}
                      className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                        focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50"
                    />
                  </div>
                </div>

                {/* Buttons */}
                {isCreator && (
                  <div className="flex flex-col gap-4 pt-4">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="w-full px-6 py-3 bg-indigo-600 text-white rounded-md
                        hover:bg-indigo-700 disabled:opacity-50 transition font-medium"
                    >
                      {isSaving ? "Saving..." : "Save Settings"}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/room/${code}/lobby`)}
                      className="w-full px-6 py-3 bg-green-600 text-white rounded-md
                        hover:bg-green-700 transition font-medium"
                    >
                      Start Room
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/")}
                      className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-md
                        hover:bg-gray-50 transition font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
