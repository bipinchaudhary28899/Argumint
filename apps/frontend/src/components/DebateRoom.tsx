import { useEffect, useState } from "react";
import { useDebateSocket } from "../hooks/useDebateSocket.js";
import { useWebSpeech } from "../hooks/useWebSpeech.js";
import { useDebateTimer } from "../hooks/useDebateTimer.js";
import MicControl from "./MicControl.js";
import TranscriptDisplay from "./TranscriptDisplay.js";
import ArgumentHistory from "./ArgumentHistory.js";
import SpeakerTimer from "./SpeakerTimer.js";
import { Argument } from "@argumint/shared";

interface DebateRoomProps {
  debateId: string;
  roomId: string;
  topic: string;
  userId: string;
  username: string;
  maxDurationPerTurn?: number;
  onDebateEnd?: () => void;
}

export default function DebateRoom({
  debateId,
  roomId,
  topic,
  userId,
  username,
  maxDurationPerTurn = 300,
  onDebateEnd,
}: DebateRoomProps) {
  const debateSocket = useDebateSocket();
  const { isListening, transcript, interimTranscript, startListening, stopListening, resetTranscript } = useWebSpeech({
    continuous: true,
    interimResults: true,
  });

  const { timeRemaining, isRunning, startTimer, stopTimer, resetTimer, elapsedTime } = useDebateTimer({
    maxDuration: maxDurationPerTurn,
  });

  const [currentSpeaker, setCurrentSpeaker] = useState<{ userId: string; username: string } | null>(null);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [arguments, setArguments] = useState<Argument[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [debateStatus, setDebateStatus] = useState<"ready" | "in-progress" | "finished">("ready");
  const [error, setError] = useState<string | null>(null);
  const [showCooldown, setShowCooldown] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Handle mic claimed event
  useEffect(() => {
    debateSocket.onMicClaimed((data) => {
      setCurrentSpeaker(data.speaker);
      if (data.speaker.userId === userId) {
        setIsUserSpeaking(true);
        startListening();
        startTimer(data.maxDuration);
      }
    });
  }, [debateSocket, userId, startListening, startTimer]);

  // Handle mic released event
  useEffect(() => {
    debateSocket.onMicReleased((data) => {
      if (data.speaker.userId === userId) {
        setIsUserSpeaking(false);
        stopListening();
        stopTimer();
        resetTimer();
        resetTranscript();
      }
      setCurrentSpeaker(null);
      
      // Add to arguments history
      if (data.argumentId) {
        const newArgument: Argument = {
          debateId: data.debateId,
          roundNumber: data.roundNumber,
          speakerId: data.speaker.userId,
          speakerUsername: data.speaker.username,
          transcript: data.transcript,
          duration: data.duration,
          startedAt: new Date(),
          endedAt: new Date(),
        };
        setArguments((prev) => [...prev, newArgument]);
      }

      // Show cooldown
      setShowCooldown(true);
      setCooldownRemaining(5);
      const countdown = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            setShowCooldown(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });
  }, [debateSocket, userId, stopListening, stopTimer, resetTimer, resetTranscript]);

  // Handle mic available event
  useEffect(() => {
    debateSocket.onMicAvailable(() => {
      setError(null);
    });
  }, [debateSocket]);

  // Handle debate started event
  useEffect(() => {
    debateSocket.onDebateStarted((data) => {
      setDebateStatus("in-progress");
      setRoundNumber(data.currentRound || 1);
    });
  }, [debateSocket]);

  // Handle round started event
  useEffect(() => {
    debateSocket.onRoundStarted((data) => {
      setRoundNumber(data.roundNumber);
    });
  }, [debateSocket]);

  // Handle debate finished event
  useEffect(() => {
    debateSocket.onDebateFinished(() => {
      setDebateStatus("finished");
      onDebateEnd?.();
    });
  }, [debateSocket, onDebateEnd]);

  // Handle time up
  useEffect(() => {
    if (timeRemaining === 0 && isRunning) {
      handleFinishSpeaking();
    }
  }, [timeRemaining, isRunning]);

  const handleClaimMic = async () => {
    try {
      setError(null);
      const result = await debateSocket.claimMic({ debateId, roomId });
      if (!result.success) {
        setError(result.error || "Failed to claim mic");
      }
    } catch (err: any) {
      setError(err.message || "Error claiming mic");
    }
  };

  const handleFinishSpeaking = async () => {
    try {
      setError(null);
      const fullTranscript = transcript + interimTranscript;
      
      if (!fullTranscript.trim()) {
        setError("Please say something before finishing");
        return;
      }

      stopListening();
      stopTimer();

      const result = await debateSocket.releaseMic({
        debateId,
        roomId,
        transcript: fullTranscript,
        duration: elapsedTime,
      });

      if (!result.success) {
        setError(result.error || "Failed to finish speaking");
      }
    } catch (err: any) {
      setError(err.message || "Error finishing speech");
    }
  };

  const handleNextRound = async () => {
    try {
      setError(null);
      const result = await debateSocket.nextRound({ debateId, roomId });
      if (!result.success) {
        setError(result.error || "Failed to move to next round");
      }
    } catch (err: any) {
      setError(err.message || "Error moving to next round");
    }
  };

  const handleEndDebate = async () => {
    try {
      setError(null);
      const result = await debateSocket.endDebate({ debateId, roomId });
      if (!result.success) {
        setError(result.error || "Failed to end debate");
      }
    } catch (err: any) {
      setError(err.message || "Error ending debate");
    }
  };

  if (debateStatus === "finished") {
    return (
      <div className="debate-room finished">
        <h2>Debate Finished</h2>
        <ArgumentHistory arguments={arguments} />
      </div>
    );
  }

  return (
    <div className="debate-room">
      <div className="debate-header">
        <h1>{topic}</h1>
        <div className="round-info">Round {roundNumber}</div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {currentSpeaker && (
        <div className="current-speaker-section">
          <h3>Currently Speaking: {currentSpeaker.username}</h3>
          {isUserSpeaking && (
            <>
              <SpeakerTimer
                timeRemaining={timeRemaining}
                maxDuration={maxDurationPerTurn}
                percentageUsed={(elapsedTime / maxDurationPerTurn) * 100}
              />
              <TranscriptDisplay
                finalTranscript={transcript}
                interimTranscript={interimTranscript}
              />
              <button onClick={handleFinishSpeaking} className="finish-button">
                Finish Speaking
              </button>
            </>
          )}
        </div>
      )}

      {!isUserSpeaking && (
        <MicControl
          isListening={isListening}
          onClaimMic={handleClaimMic}
          disabled={showCooldown || !!currentSpeaker}
          cooldownMessage={showCooldown ? `Wait ${cooldownRemaining}s before claiming mic` : undefined}
        />
      )}

      <ArgumentHistory arguments={arguments} />

      <div className="debate-controls">
        <button onClick={handleNextRound} className="next-round-button">
          Next Round
        </button>
        <button onClick={handleEndDebate} className="end-debate-button">
          End Debate
        </button>
      </div>
    </div>
  );
}
