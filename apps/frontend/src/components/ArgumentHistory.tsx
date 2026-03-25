import { Argument } from "@argumint/shared";

interface ArgumentHistoryProps {
  arguments: Argument[];
}

export default function ArgumentHistory({ arguments }: ArgumentHistoryProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (arguments.length === 0) {
    return (
      <div className="argument-history empty">
        <p className="text-gray-500">No arguments yet. Start claiming the mic!</p>
      </div>
    );
  }

  return (
    <div className="argument-history">
      <h3>Arguments History</h3>

      <div className="arguments-list">
        {arguments.map((arg, index) => (
          <div key={index} className="argument-card">
            <div className="argument-header">
              <span className="speaker-name">{arg.speakerUsername}</span>
              <span className="round-badge">Round {arg.roundNumber}</span>
              <span className="duration-badge">{formatTime(arg.duration)}</span>
              {arg.aiScore !== undefined && (
                <span className="score-badge">Score: {arg.aiScore}/100</span>
              )}
            </div>

            <div className="argument-transcript">
              <p>{arg.transcript}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
