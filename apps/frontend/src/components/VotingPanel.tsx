import { useEffect, useState } from "react";
import { useRoom } from "../contexts/RoomContext";
import { useSocket } from "../hooks/useSocket";
import type { IVotingTopic } from "@argumint/shared";

interface VotingPanelProps {
  votingTopics: IVotingTopic[];
  votingDuration: number;
  isHost: boolean;
  roomId: string;
  onVotingStatusChange?: (status: boolean) => void;
}

export function VotingPanel({
  votingTopics,
  votingDuration,
  isHost,
  roomId,
  onVotingStatusChange,
}: VotingPanelProps) {
  const { votingInProgress, userVote, setUserVote, setVotingInProgress, selectedTopic } =
    useRoom();
  const { socket } = useSocket();
  const [votingTimer, setVotingTimer] = useState(votingDuration);
  const [isVotingStarted, setIsVotingStarted] = useState(false);
  const [votingEnded, setVotingEnded] = useState(false);
  const [currentTopics, setCurrentTopics] = useState(votingTopics);

  // Handle voting timer
  useEffect(() => {
    if (!isVotingStarted || votingEnded) return;

    if (votingTimer <= 0) {
      // Voting time ended
      if (isHost) {
        socket?.emit("room:end-voting", { roomId }, (response: any) => {
          if (response.success) {
            console.log("[v0] Voting ended:", response.room);
            setVotingEnded(true);
            setIsVotingStarted(false);
            setVotingInProgress(false);
          }
        });
      }
      return;
    }

    const timer = setTimeout(() => {
      setVotingTimer((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [votingTimer, isVotingStarted, isHost, roomId, socket, votingEnded, setVotingInProgress]);

  // Listen for voting updates
  useEffect(() => {
    if (!socket) return;

    socket.on("room:voting-started", (data: any) => {
      console.log("[v0] Voting started:", data);
      setIsVotingStarted(true);
      setVotingEnded(false);
      setVotingTimer(votingDuration);
      setCurrentTopics(data.votingTopics);
      setVotingInProgress(true);
      onVotingStatusChange?.(true);
    });

    socket.on("room:voting-update", (data: any) => {
      console.log("[v0] Voting update:", data);
      setCurrentTopics(data.votingTopics);
    });

    socket.on("room:voting-ended", (data: any) => {
      console.log("[v0] Voting ended:", data);
      setVotingEnded(true);
      setIsVotingStarted(false);
      setVotingInProgress(false);
      setCurrentTopics(data.votingTopics);
      onVotingStatusChange?.(false);
    });

    return () => {
      socket.off("room:voting-started");
      socket.off("room:voting-update");
      socket.off("room:voting-ended");
    };
  }, [socket, votingDuration, setVotingInProgress, onVotingStatusChange]);

  const handleVote = (topicId: string) => {
    if (!votingInProgress || !isVotingStarted) return;

    socket?.emit("room:vote-topic", { roomId, topicId }, (response: any) => {
      if (response.success) {
        setUserVote(topicId);
        console.log("[v0] Vote recorded for topic:", topicId);
      } else {
        console.error("[v0] Vote failed:", response.error);
      }
    });
  };

  const handleStartVoting = () => {
    if (!isHost) return;

    socket?.emit("room:start-voting", { roomId }, (response: any) => {
      if (response.success) {
        console.log("[v0] Voting started by host");
      } else {
        console.error("[v0] Failed to start voting:", response.error);
      }
    });
  };

  // If voting not enabled, don't render
  if (!votingTopics || votingTopics.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Voting Topics</h2>
        {isVotingStarted && (
          <div className="text-center">
            <p className="text-sm text-gray-600 uppercase font-semibold">Time Remaining</p>
            <p className={`text-2xl font-bold ${votingTimer <= 10 ? "text-red-600" : "text-indigo-600"}`}>
              {votingTimer}s
            </p>
          </div>
        )}
      </div>

      {/* Status message */}
      {!isVotingStarted && !votingEnded && isHost && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">Click "Start Voting" to begin the voting phase.</p>
        </div>
      )}

      {votingEnded && selectedTopic && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800">
            Voting ended! Selected topic:{" "}
            <span className="font-semibold">
              {currentTopics.find((t) => t.id === selectedTopic)?.text}
            </span>
          </p>
        </div>
      )}

      {/* Voting topics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {currentTopics.map((topic) => (
          <button
            key={topic.id}
            onClick={() => handleVote(topic.id)}
            disabled={!isVotingStarted || votingEnded}
            className={`relative p-4 rounded-lg border-2 transition ${
              userVote === topic.id
                ? "border-indigo-600 bg-indigo-50"
                : "border-gray-200 bg-gray-50 hover:border-indigo-300"
            } ${!isVotingStarted || votingEnded ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900 text-left">{topic.text}</p>
              <div className="ml-4 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold">
                  {topic.votes}
                </span>
                {userVote === topic.id && (
                  <span className="text-indigo-600 font-bold">✓</span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Host controls */}
      {isHost && !isVotingStarted && !votingEnded && (
        <button
          onClick={handleStartVoting}
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition font-semibold"
        >
          Start Voting
        </button>
      )}

      {isHost && votingEnded && (
        <button
          onClick={() => {
            setVotingEnded(false);
            setIsVotingStarted(false);
            setVotingTimer(votingDuration);
            setUserVote(null);
            setCurrentTopics(votingTopics);
          }}
          className="w-full px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition font-semibold"
        >
          Start New Voting
        </button>
      )}
    </div>
  );
}
