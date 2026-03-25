interface SpeakerTimerProps {
  timeRemaining: number;
  maxDuration: number;
  percentageUsed: number;
}

export default function SpeakerTimer({
  timeRemaining,
  maxDuration,
  percentageUsed,
}: SpeakerTimerProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Change color based on remaining time
  const getTimerColor = () => {
    if (percentageUsed > 90) return "text-red-600";
    if (percentageUsed > 70) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="speaker-timer">
      <div className="timer-display">
        <div className={`time-remaining ${getTimerColor()}`}>
          {formatTime(timeRemaining)}
        </div>
        <div className="timer-label">Time Remaining</div>
      </div>

      <div className="timer-bar">
        <div
          className="timer-progress"
          style={{ width: `${percentageUsed}%` }}
        />
      </div>

      <div className="timer-stats">
        <span className="max-duration">Max: {formatTime(maxDuration)}</span>
        <span className="percentage">{Math.round(percentageUsed)}%</span>
      </div>
    </div>
  );
}
