import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { JoinRoomRequest } from "@argumint/shared";
import { RoomService } from "../services/room.service.js";

export function JoinRoomPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codeFromUrl = searchParams.get("code") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<JoinRoomRequest>({
    code: codeFromUrl,
    password: undefined,
  });
  const [isPrivate, setIsPrivate] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value || undefined,
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      password: e.target.value || undefined,
    }));
  };

  const handleCheckCode = async () => {
    if (!formData.code || formData.code.length !== 6) {
      setError("Room code must be exactly 6 characters");
      return;
    }

    try {
      setError(null);
      const room = await RoomService.getRoomByCode(formData.code);
      setIsPrivate(room.privacy === "private");
      if (room.privacy === "public") {
        // Auto-join public rooms
        await joinRoom();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Room not found";
      setError(message);
      setIsPrivate(false);
    }
  };

  const joinRoom = async () => {
    setError(null);
    setLoading(true);

    try {
      const room = await RoomService.joinRoom(formData);
      navigate(`/lobby/${room._id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to join room";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPrivate) {
      await handleCheckCode();
    } else {
      await joinRoom();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        <h1 className="mb-8 text-center text-3xl font-bold text-gray-900">
          Join Debate Room
        </h1>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 rounded-lg bg-white p-6 shadow">
          {/* Room Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Room Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="code"
              value={formData.code}
              onChange={handleInputChange}
              placeholder="e.g., ABC123"
              maxLength={6}
              required
              disabled={isPrivate}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
            />
            <p className="mt-2 text-sm text-gray-500">
              Ask the room creator for the 6-character code
            </p>
          </div>

          {/* Password (if private) */}
          {isPrivate && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Room Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.password || ""}
                onChange={handlePasswordChange}
                placeholder="Enter room password"
                required={isPrivate}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || formData.code.length !== 6}
            className="w-full rounded-lg bg-blue-600 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              "Joining..."
            ) : isPrivate ? (
              "Join Room"
            ) : (
              "Check & Join"
            )}
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
