import { PublicRoom } from "@argumint/shared";

interface RoomCardProps {
  room: PublicRoom;
  onJoin: () => void;
}

export function RoomCard({ room, onJoin }: RoomCardProps) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow transition-shadow hover:shadow-lg">
      {/* Title and Tags */}
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{room.name}</h3>
      
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
          {room.mode === "solo" ? "Solo Mode" : "Team Mode"}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            room.privacy === "public"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {room.privacy === "public" ? "Public" : "Private"}
        </span>
      </div>

      {/* Topic */}
      <p className="mb-4 flex-1 text-sm text-gray-600 line-clamp-2">
        {room.topic}
      </p>

      {/* Room Info */}
      <div className="mb-4 space-y-2 border-t border-gray-200 pt-4 text-sm text-gray-600">
        <p>
          <span className="font-medium">Code:</span> {room.code}
        </p>
        <p>
          <span className="font-medium">Participants:</span> {room.participants.length}/
          {room.maxParticipants}
        </p>
        <p>
          <span className="font-medium">Created:</span>{" "}
          {new Date(room.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Join Button */}
      <button
        onClick={onJoin}
        disabled={room.participants.length >= room.maxParticipants}
        className="w-full rounded-lg bg-blue-600 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {room.participants.length >= room.maxParticipants
          ? "Room Full"
          : "Join Room"}
      </button>
    </div>
  );
}
