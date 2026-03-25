interface TranscriptDisplayProps {
  finalTranscript: string;
  interimTranscript?: string;
}

export default function TranscriptDisplay({
  finalTranscript,
  interimTranscript = "",
}: TranscriptDisplayProps) {
  return (
    <div className="transcript-display">
      <div className="transcript-header">
        <h4>Live Transcript</h4>
      </div>
      
      <div className="transcript-content">
        {finalTranscript && (
          <p className="final-transcript">{finalTranscript}</p>
        )}
        
        {interimTranscript && (
          <p className="interim-transcript italic text-gray-500">
            {interimTranscript}
          </p>
        )}
        
        {!finalTranscript && !interimTranscript && (
          <p className="placeholder text-gray-400">
            Start speaking... your words will appear here
          </p>
        )}
      </div>
    </div>
  );
}
