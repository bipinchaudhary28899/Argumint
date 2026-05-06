import { useEffect, useRef, useState } from "react";

/**
 * Browser SpeechRecognition wrapper.
 *
 * We use this as the primary transcription path during a debate turn;
 * Whisper is only called as a fallback. Costs nothing per use — runs
 * locally on the speaker's device.
 *
 * Browser support: webkitSpeechRecognition is in Chrome/Edge/Safari.
 * Firefox doesn't ship it. `supported === false` callers should fall
 * back to the server-side transcription endpoint.
 */
type SRConstructor = new () => SRInstance;

interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: any) => void) | null;
  onerror: ((ev: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

function getCtor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  // @ts-expect-error - vendor prefixed APIs aren't in lib.dom
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export interface UseSpeechRecognitionResult {
  supported: boolean;
  isListening: boolean;
  /** Final committed transcript across this listening session. */
  transcript: string;
  /** Last interim (in-flight) chunk, useful for live captioning UI. */
  interim: string;
  error: string | null;
  /** Begin recognition. Resets transcript/interim. */
  start: (lang?: string) => void;
  /** Stop and resolve to whatever final transcript we have so far. */
  stop: () => string;
  /** Hard-reset state without starting again. */
  reset: () => void;
}

/**
 * Important: SR's "no-speech" error fires after ~5s of silence. We treat
 * it as recoverable — auto-restart while the caller still wants to listen.
 */
export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [supported] = useState(() => !!getCtor());
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SRInstance | null>(null);
  const wantListeningRef = useRef(false);
  const transcriptRef = useRef("");

  const buildRecognizer = (lang: string) => {
    const Ctor = getCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (ev: any) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const alt = r[0]?.transcript ?? "";
        if (r.isFinal) finalChunk += alt;
        else interimChunk += alt;
      }
      if (finalChunk) {
        const sep = transcriptRef.current && !transcriptRef.current.endsWith(" ")
          ? " "
          : "";
        transcriptRef.current = transcriptRef.current + sep + finalChunk;
        setTranscript(transcriptRef.current.trim());
      }
      setInterim(interimChunk.trim());
    };

    rec.onerror = (ev: any) => {
      // "no-speech", "aborted", "audio-capture" are common transient issues.
      // We surface them but don't treat them as fatal unless the caller
      // explicitly stops.
      const code = ev?.error || "unknown";
      if (code === "no-speech") {
        // recoverable — onend will fire and we'll auto-restart below
        return;
      }
      if (code === "aborted") return;
      setError(code);
    };

    rec.onend = () => {
      // SR auto-stops after long pauses or browser-imposed timers; if the
      // caller still wants us listening, restart silently.
      if (wantListeningRef.current) {
        try {
          rec.start();
        } catch {
          // Some browsers throw if we restart too fast — give up gracefully.
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    return rec;
  };

  const start = (lang = "en-US") => {
    if (!supported) {
      setError("not-supported");
      return;
    }
    setError(null);
    setTranscript("");
    setInterim("");
    transcriptRef.current = "";
    wantListeningRef.current = true;

    const rec = buildRecognizer(lang);
    if (!rec) {
      setError("not-supported");
      return;
    }
    recRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
    } catch (err: any) {
      setError(err?.message || "failed-to-start");
      setIsListening(false);
    }
  };

  const stop = (): string => {
    wantListeningRef.current = false;
    const rec = recRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    setIsListening(false);
    // Return the latest committed transcript synchronously — onresult may
    // still deliver one more chunk but the caller usually wants whatever
    // is final right now.
    return transcriptRef.current.trim();
  };

  const reset = () => {
    wantListeningRef.current = false;
    setTranscript("");
    setInterim("");
    setError(null);
    transcriptRef.current = "";
    const rec = recRef.current;
    if (rec) {
      try {
        rec.abort?.();
      } catch {
        /* ignore */
      }
    }
    setIsListening(false);
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      const rec = recRef.current;
      if (rec) {
        try {
          rec.abort?.();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return {
    supported,
    isListening,
    transcript,
    interim,
    error,
    start,
    stop,
    reset,
  };
}
