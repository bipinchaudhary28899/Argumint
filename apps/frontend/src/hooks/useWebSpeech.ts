import { useState, useRef, useEffect } from "react";

type RecognitionEvent = Event & {
  results: SpeechRecognitionResultList;
  isFinal: boolean;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
};

interface UseWebSpeechOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

interface UseWebSpeechReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  isSupported: boolean;
}

export function useWebSpeech(
  options: UseWebSpeechOptions = {}
): UseWebSpeechReturn {
  const {
    language = "en-US",
    continuous = true,
    interimResults = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isSupported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  useEffect(() => {
    if (!isSupported) return;

    // Initialize speech recognition
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();

    const recognition = recognitionRef.current;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: RecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.results.length - 1; i >= 0; i--) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          final += transcript + " ";
        } else {
          interim += transcript;
        }
      }

      setInterimTranscript(interim);
      if (final) {
        setTranscript((prev) => prev + final);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(event.error);
      console.error("[useWebSpeech] Error:", event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    return () => {
      if (recognition && isListening) {
        recognition.stop();
      }
    };
  }, [isSupported, continuous, interimResults, language]);

  const startListening = () => {
    if (!isSupported || !recognitionRef.current) return;

    setError(null);
    setTranscript("");
    setInterimTranscript("");

    try {
      recognitionRef.current.start();
    } catch (err: any) {
      // Handle error if already listening
      if (err.message && err.message.includes("already started")) {
        console.log("[useWebSpeech] Already listening");
      }
    }
  };

  const stopListening = () => {
    if (!isSupported || !recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error("[useWebSpeech] Error stopping:", err);
    }
  };

  const resetTranscript = () => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  };

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
    isSupported,
  };
}
