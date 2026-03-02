import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { roomApi } from "../services/api";
import type { CreateRoomInput } from "@argumint/shared";

export function CreateRoom() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setRoom, setError } = useRoom();
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState<CreateRoomInput>({
    topic: "",
    description: "",
    debateMode: "buzzer",
    maxParticipants: 10,
    votingDuration: 30,
    prepDuration: 120,
    turnDuration: 300,
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.topic.trim()) {
      setError("Topic is required");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const newRoom = await roomApi.createRoom(formData);
      setRoom(newRoom);
      // Go straight to lobby
      navigate(`/room/${newRoom.code}/lobby`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create room";
      setError(message);
      console.error("Create room error:", err);
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

      <main className="flex flex-col items-center justify-center py-12 px-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-10">
          <h1 className="text-3xl font-extrabold text-indigo-600 mb-8">
            Create a New Debate
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Topic */}
            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-gray-700">
                Debate Topic *
              </label>
              <input
                type="text"
                id="topic"
                name="topic"
                value={formData.topic}
                onChange={handleChange}
                placeholder="e.g., Should social media be regulated by governments?"
                maxLength={500}
                required
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                  focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                {formData.topic.length}/500
              </p>
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
                placeholder="Add any additional details or context..."
                maxLength={2000}
                rows={4}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                  focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                {(formData.description || "").length}/2000
              </p>
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
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                  focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="buzzer">Buzzer (First to speak wins turn)</option>
                <option value="round-robin">Round-robin (Taking turns)</option>
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
                min={2}
                max={100}
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                  focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Timings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="votingDuration" className="block text-sm font-medium text-gray-700">
                  Voting Time (sec)
                </label>
                <input
                  type="number"
                  id="votingDuration"
                  name="votingDuration"
                  value={formData.votingDuration}
                  onChange={handleChange}
                  min={10}
                  max={300}
                  className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                    focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prepDuration" className="block text-sm font-medium text-gray-700">
                  Prep Time (sec)
                </label>
                <input
                  type="number"
                  id="prepDuration"
                  name="prepDuration"
                  value={formData.prepDuration}
                  onChange={handleChange}
                  min={30}
                  max={600}
                  className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                    focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="turnDuration" className="block text-sm font-medium text-gray-700">
                  Turn Time (sec)
                </label>
                <input
                  type="number"
                  id="turnDuration"
                  name="turnDuration"
                  value={formData.turnDuration}
                  onChange={handleChange}
                  min={60}
                  max={900}
                  className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded-md
                    focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Error Message */}
            {/* {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
                {error}
              </div>
            )} */}

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-md
                  hover:bg-indigo-700 disabled:opacity-50 transition font-medium"
              >
                {isLoading ? "Creating..." : "Create Room"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex-1 px-6 py-3 border border-indigo-600 text-indigo-600
                  rounded-md hover:bg-indigo-50 transition font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
