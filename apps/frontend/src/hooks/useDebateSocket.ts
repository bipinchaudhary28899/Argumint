import { useCallback, useEffect } from "react";
import { useSocket } from "./useSocket.js";
import {
  StartDebateInput,
  ClaimMicInput,
  ReleaseMicInput,
  NextRoundInput,
  EndDebateInput,
  GetDebateStateInput,
  Argument,
} from "@argumint/shared";

export interface DebateSocketHook {
  startDebate: (input: StartDebateInput) => Promise<{ success: boolean; debateId?: string }>;
  claimMic: (input: ClaimMicInput) => Promise<{ success: boolean; currentSpeaker?: any }>;
  releaseMic: (input: ReleaseMicInput) => Promise<{ success: boolean; transcript?: string }>;
  nextRound: (input: NextRoundInput) => Promise<{ success: boolean; roundNumber?: number }>;
  endDebate: (input: EndDebateInput) => Promise<{ success: boolean; debate?: any }>;
  getDebateState: (input: GetDebateStateInput) => Promise<{ success: boolean; debate?: any; arguments?: Argument[] }>;
  
  // Event listeners
  onDebateStarted: (callback: (data: any) => void) => void;
  onMicClaimed: (callback: (data: any) => void) => void;
  onMicReleased: (callback: (data: any) => void) => void;
  onMicAvailable: (callback: (data: any) => void) => void;
  onMicCountdown: (callback: (data: any) => void) => void;
  onRoundStarted: (callback: (data: any) => void) => void;
  onDebateFinished: (callback: (data: any) => void) => void;
}

export function useDebateSocket(): DebateSocketHook {
  const { socket } = useSocket();

  const startDebate = useCallback(
    (input: StartDebateInput) => {
      return new Promise((resolve) => {
        socket?.emit("debate:start", input, (response: any) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  const claimMic = useCallback(
    (input: ClaimMicInput) => {
      return new Promise((resolve) => {
        socket?.emit("debate:claim-mic", input, (response: any) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  const releaseMic = useCallback(
    (input: ReleaseMicInput) => {
      return new Promise((resolve) => {
        socket?.emit("debate:release-mic", input, (response: any) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  const nextRound = useCallback(
    (input: NextRoundInput) => {
      return new Promise((resolve) => {
        socket?.emit("debate:next-round", input, (response: any) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  const endDebate = useCallback(
    (input: EndDebateInput) => {
      return new Promise((resolve) => {
        socket?.emit("debate:end", input, (response: any) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  const getDebateState = useCallback(
    (input: GetDebateStateInput) => {
      return new Promise((resolve) => {
        socket?.emit("debate:get-state", input, (response: any) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  const onDebateStarted = useCallback(
    (callback: (data: any) => void) => {
      socket?.on("debate:started", callback);
    },
    [socket]
  );

  const onMicClaimed = useCallback(
    (callback: (data: any) => void) => {
      socket?.on("debate:mic-claimed", callback);
    },
    [socket]
  );

  const onMicReleased = useCallback(
    (callback: (data: any) => void) => {
      socket?.on("debate:mic-released", callback);
    },
    [socket]
  );

  const onMicAvailable = useCallback(
    (callback: (data: any) => void) => {
      socket?.on("debate:mic-available", callback);
    },
    [socket]
  );

  const onMicCountdown = useCallback(
    (callback: (data: any) => void) => {
      socket?.on("debate:mic-countdown", callback);
    },
    [socket]
  );

  const onRoundStarted = useCallback(
    (callback: (data: any) => void) => {
      socket?.on("debate:round-started", callback);
    },
    [socket]
  );

  const onDebateFinished = useCallback(
    (callback: (data: any) => void) => {
      socket?.on("debate:finished", callback);
    },
    [socket]
  );

  return {
    startDebate,
    claimMic,
    releaseMic,
    nextRound,
    endDebate,
    getDebateState,
    onDebateStarted,
    onMicClaimed,
    onMicReleased,
    onMicAvailable,
    onMicCountdown,
    onRoundStarted,
    onDebateFinished,
  };
}
