import { useEffect, useRef, useState } from "react";

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
  // @ts-expect-error - vendor prefixed
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export interface UseSpeechRecognitionResult {
  supported: boolean;
  isListening: boolean;
  transcript: string;
  interim: string;
  error: string | null;
  start: (lang?: string) => void;
  stop: () => string;
  reset: () => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [supported] = useState(() => !!getCtor());
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef            = useRef<SRInstance | null>(null);
  const wantListeningRef  = useRef(false);
  const transcriptRef     = useRef("");
  const lastInterimRef    = useRef("");   // tracks last interim so we can rescue it on restart
  const langRef           = useRef("en-US");
  const restartTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Build a fresh recogniser instance ─────────────────────────────────────
  const buildRecognizer = (lang: string): SRInstance | null => {
    const Ctor = getCtor();
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = lang;

    rec.onresult = (ev: any) => {
      let finalChunk   = "";
      let interimChunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r   = ev.results[i];
        const alt = r[0]?.transcript ?? "";
        if (r.isFinal) finalChunk   += alt;
        else           interimChunk += alt;
      }
      if (finalChunk) {
        const sep = transcriptRef.current && !transcriptRef.current.endsWith(" ") ? " " : "";
        transcriptRef.current = transcriptRef.current + sep + finalChunk;
        setTranscript(transcriptRef.current.trim());
        lastInterimRef.current = "";          // final received — clear rescue buffer
      }
      lastInterimRef.current = interimChunk; // keep latest interim for rescue on restart
      setInterim(interimChunk.trim());
    };

    rec.onerror = (ev: any) => {
      const code = ev?.error || "unknown";
      // "no-speech" and "aborted" are normal on all platforms.
      // "network" is recoverable on Android Chrome — it uses Google's servers
      // and occasionally drops with a transient network error; restarting fixes it.
      if (code === "no-speech" || code === "aborted" || code === "network") return;
      setError(code);
    };

    rec.onend = () => {
      // ── Rescue any in-flight interim that never got finalised ─────────────
      // When the session ends mid-word the browser drops the interim text.
      // Appending it ourselves keeps the captions complete.
      if (lastInterimRef.current.trim()) {
        const rescued = lastInterimRef.current.trim();
        const sep = transcriptRef.current && !transcriptRef.current.endsWith(" ") ? " " : "";
        transcriptRef.current = transcriptRef.current + sep + rescued;
        setTranscript(transcriptRef.current.trim());
        lastInterimRef.current = "";
        setInterim("");
      }

      if (!wantListeningRef.current) {
        setIsListening(false);
        return;
      }

      // ── Restart with a fresh instance after a short delay ─────────────────
      // Reusing the same object after onend is unreliable on mobile Chrome/Safari.
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      // Android Chrome needs ~300 ms to fully release the mic lock after onend.
      // iOS Safari is fine with 80 ms. We detect Android by checking userAgent.
      const isAndroid = typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
      const restartDelay = isAndroid ? 300 : 80;
      restartTimerRef.current = setTimeout(() => {
        if (!wantListeningRef.current) { setIsListening(false); return; }
        try {
          const fresh = buildRecognizer(langRef.current);
          if (!fresh) { setIsListening(false); return; }
          recRef.current = fresh;
          fresh.start();
          // isListening stays true — no flicker needed
        } catch {
          setIsListening(false);
        }
      }, restartDelay);
    };

    return rec;
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  const start = (lang = "en-US") => {
    if (!supported) { setError("not-supported"); return; }
    langRef.current        = lang;
    wantListeningRef.current = true;
    lastInterimRef.current = "";
    transcriptRef.current  = "";
    setTranscript("");
    setInterim("");
    setError(null);

    const rec = buildRecognizer(lang);
    if (!rec) { setError("not-supported"); return; }
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
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }

    // Rescue any remaining interim before we stop
    if (lastInterimRef.current.trim()) {
      const rescued = lastInterimRef.current.trim();
      const sep = transcriptRef.current && !transcriptRef.current.endsWith(" ") ? " " : "";
      transcriptRef.current = transcriptRef.current + sep + rescued;
      setTranscript(transcriptRef.current.trim());
      lastInterimRef.current = "";
      setInterim("");
    }

    const rec = recRef.current;
    if (rec) { try { rec.stop(); } catch { /* ignore */ } }
    setIsListening(false);
    return transcriptRef.current.trim();
  };

  const reset = () => {
    wantListeningRef.current = false;
    lastInterimRef.current   = "";
    transcriptRef.current    = "";
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    setTranscript("");
    setInterim("");
    setError(null);
    const rec = recRef.current;
    if (rec) { try { rec.abort?.(); } catch { /* ignore */ } }
    setIsListening(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      const rec = recRef.current;
      if (rec) { try { rec.abort?.(); } catch { /* ignore */ } }
    };
  }, []);

  return { supported, isListening, transcript, interim, error, start, stop, reset };
}
