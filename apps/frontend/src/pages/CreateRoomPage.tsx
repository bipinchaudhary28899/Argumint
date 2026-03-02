import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreateRoomRequest } from "@argumint/shared";
import { RoomService } from "../services/room.service.js";

export function CreateRoomPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateRoomRequest>({
    name: "",
    topic: "",
    mode: "solo",
    privacy: "public",
    maxParticipants: 10,
  });

  const [password, setPassword] = useState("");

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "maxParticipants" ? parseInt(value) : value,
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const roomData = {
        ...formData,
        ...(formData.privacy === "private" && password && { password }),
      };

      const room = await RoomService.createRoom(roomData);
      navigate(`/lobby/${room._id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create room";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <h1 className="mb-8 text-center text-3xl font-bold text-gray-900">
          Create Debate Room
        </h1>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 rounded-lg bg-white p-6 shadow">
          {/* Room Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Room Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., AI Ethics Debate"
              minLength={3}
              maxLength={60}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Debate Topic <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="topic"
              value={formData.topic}
              onChange={handleInputChange}
              placeholder="e.g., AI should be regulated by governments"
              minLength={10}
              maxLength={200}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Debate Mode <span className="text-red-500">*</span>
            </label>
            <select
              name="mode"
              value={formData.mode}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="solo">Solo (Individual)</option>
              <option value="team">Team (For vs Against)</option>
            </select>
            <p className="mt-2 text-sm text-gray-500">
              {formData.mode === "solo"
                ? "Each participant argues individually"
                : "Participants are split into two teams"}
            </p>
          </div>

          {/* Privacy */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Privacy <span className="text-red-500">*</span>
            </label>
            <select
              name="privacy"
              value={formData.privacy}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>

          {/* Password (if private) */}
          {formData.privacy === "private" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Room Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={handlePasswordChange}
                placeholder="Enter a password"
                required={formData.privacy === "private"}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {/* Max Participants */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Max Participants <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              name="maxParticipants"
              value={formData.maxParticipants}
              onChange={handleInputChange}
              min={2}
              max={20}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Room"}
          </button>

          {/* Back Button */}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full rounded-lg bg-gray-200 py-2 text-gray-800 font-medium hover:bg-gray-300"
          >
            Back
          </button>
        </form>
      </div>
    </div>
  );
}
