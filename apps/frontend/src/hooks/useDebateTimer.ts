import { useState, useEffect, useRef } from "react";

interface UseDebateTimerOptions {
  maxDuration?: number;
  onTimeUp?: () => void;
}

interface UseDebateTimerReturn {
  timeRemaining: number;
  isRunning: boolean;
  startTimer: (duration?: number) => void;
  stopTimer: () => void;
  resetTimer: () => void;
  elapsedTime: number;
  percentageUsed: number;
}

export function useDebateTimer(
  options: UseDebateTimerOptions = {}
): UseDebateTimerReturn {
  const { maxDuration = 300, onTimeUp } = options;

  const [timeRemaining, setTimeRemaining] = useState(maxDuration);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setElapsedTime((prev) => {
        const newElapsed = prev + 1;
        const remaining = maxDuration - newElapsed;

        if (remaining <= 0) {
          setIsRunning(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
          onTimeUp?.();
          return maxDuration;
        }

        setTimeRemaining(remaining);
        return newElapsed;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, maxDuration, onTimeUp]);

  const startTimer = (duration?: number) => {
    const timerDuration = duration || maxDuration;
    setTimeRemaining(timerDuration);
    setElapsedTime(0);
    setIsRunning(true);
    startTimeRef.current = Date.now();
  };

  const stopTimer = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const resetTimer = () => {
    stopTimer();
    setTimeRemaining(maxDuration);
    setElapsedTime(0);
  };

  const percentageUsed = (elapsedTime / maxDuration) * 100;

  return {
    timeRemaining,
    isRunning,
    startTimer,
    stopTimer,
    resetTimer,
    elapsedTime,
    percentageUsed,
  };
}
