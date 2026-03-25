import { Mic, MicOff } from "lucide-react";

interface MicControlProps {
  isListening: boolean;
  onClaimMic: () => void;
  disabled?: boolean;
  cooldownMessage?: string;
}

export default function MicControl({
  isListening,
  onClaimMic,
  disabled = false,
  cooldownMessage,
}: MicControlProps) {
  return (
    <div className="mic-control">
      <button
        onClick={onClaimMic}
        disabled={disabled || isListening}
        className={`mic-button ${isListening ? "active" : ""} ${disabled ? "disabled" : ""}`}
      >
        {isListening ? (
          <>
            <Mic className="icon active" />
            <span>Recording...</span>
          </>
        ) : (
          <>
            <MicOff className="icon" />
            <span>Claim Mic</span>
          </>
        )}
      </button>

      {cooldownMessage && (
        <div className="cooldown-message">{cooldownMessage}</div>
      )}

      <div className="mic-info">
        <p className="text-sm">Click the button above to claim the mic and start speaking.</p>
      </div>
    </div>
  );
}
