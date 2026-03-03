import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { type Room } from "@argumint/shared";

export interface RoomContextType {
  room: Room | null;
  setRoom: (room: Room | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  votingInProgress: boolean;
  setVotingInProgress: (voting: boolean) => void;
  userVote: string | null;
  setUserVote: (topicId: string | null) => void;
  selectedTopic: string | null;
  setSelectedTopic: (topicId: string | null) => void;
  votingTimer: number;
  setVotingTimer: (time: number) => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [votingInProgress, setVotingInProgress] = useState(false);
  const [userVote, setUserVote] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [votingTimer, setVotingTimer] = useState(0);

  const value: RoomContextType = {
    room,
    setRoom,
    isLoading,
    setIsLoading,
    error,
    setError,
    votingInProgress,
    setVotingInProgress,
    userVote,
    setUserVote,
    selectedTopic,
    setSelectedTopic,
    votingTimer,
    setVotingTimer,
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (context === undefined) {
    throw new Error("useRoom must be used within a RoomProvider");
  }
  return context;
}
