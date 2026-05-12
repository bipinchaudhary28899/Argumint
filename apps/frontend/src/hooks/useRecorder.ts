import { useRef, useState, useCallback } from "react";

export interface RecorderResult {
  blob: Blob | null;
  durationSec: number;
}

/**
 * Manages the full MediaRecorder lifecycle for a single speaking turn.
 *
 * - start()  — acquires the mic once, creates a MediaRecorder, starts it.
 *              The same stream is exposed via getStream() so WebRTC can
 *              reuse it without a second getUserMedia call.
 * - stop()   — returns a Promise<RecorderResult>. Safe to call even if the
 *              recorder was already stopped by cancel() — it returns the
 *              blob captured by the persistent onstop handler.
 * - cancel() — silently stops recorder + mic tracks (e.g. when a turn ends
 *              before the user submits). Does not resolve any stop() promise.
 *
 * `elapsed`     — seconds since start(), updated every second (Android Chrome
 *                 fallback display since Web Speech API can't run concurrently).
 * `isRecording` — true between start() and stop()/cancel().
 * `micError`    — set if getUserMedia is rejected; cleared on next start().
 */
export function useRecorder(isAndroidChrome: boolean) {
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const lastBlobRef   = useRef<Blob | null>(null);
  const startedAtRef  = useRef<number | null>(null);
  const mimeTypeRef   = useRef<string>("audio/webm");
  const stopResolveRef = useRef<((v: RecorderResult) => void) | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed]         = useState(0);
  const [micError, setMicError]       = useState<string | null>(null);

  /** Returns the live mic stream so WebRTC can attach it as a sender track. */
  const getStream = useCallback(() => streamRef.current, []);

  const _clearElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const start = useCallback(async () => {
    chunksRef.current    = [];
    lastBlobRef.current  = null;
    stopResolveRef.current = null;
    setElapsed(0);
    _clearElapsedTimer();
    elapsedTimerRef.current = setInterval(
      () => setElapsed((e) => e + 1),
      1000,
    );

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Pick the best supported codec. iOS Safari only supports audio/mp4;
      // passing audio/webm throws NotSupportedError and kills recording.
      let recorder: MediaRecorder;
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        recorder = new MediaRecorder(stream, { mimeType: "audio/mp4" });
      } else {
        recorder = new MediaRecorder(stream);
      }
      mimeTypeRef.current = recorder.mimeType || "audio/webm";

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      // Persistent onstop — fires regardless of who called stop() (the
      // component effect or the user's explicit submit). Populates lastBlobRef
      // so stop() always returns a blob even when cancel() ran first.
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        lastBlobRef.current = blob;
        streamRef.current   = null;
        recorderRef.current = null;
        setIsRecording(false);
        _clearElapsedTimer();
        if (stopResolveRef.current) {
          const resolve = stopResolveRef.current;
          stopResolveRef.current = null;
          const durationSec = startedAtRef.current
            ? Math.max(0, (Date.now() - startedAtRef.current) / 1000)
            : 0;
          resolve({ blob, durationSec });
        }
      };

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start(250);
      setIsRecording(true);
      setMicError(null);
    } catch {
      _clearElapsedTimer();
      setMicError(
        "Could not access microphone. Allow mic access in your browser to speak.",
      );
    }
  // isAndroidChrome is stable (derived from UA string) so excluded from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Promise-based stop. If the recorder was already stopped by cancel(),
   * returns lastBlobRef immediately (populated by the persistent onstop).
   */
  const stop = useCallback((): Promise<RecorderResult> => {
    _clearElapsedTimer();
    return new Promise((resolve) => {
      const computeDuration = () =>
        startedAtRef.current
          ? Math.max(0, (Date.now() - startedAtRef.current) / 1000)
          : 0;
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        streamRef.current = null;
        return resolve({ blob: lastBlobRef.current, durationSec: computeDuration() });
      }
      // Recorder still active — register the resolver so onstop completes it.
      stopResolveRef.current = resolve;
      try {
        rec.stop();
      } catch {
        stopResolveRef.current = null;
        resolve({ blob: lastBlobRef.current, durationSec: computeDuration() });
      }
    });
  }, []);

  /**
   * Silently stops the recorder and releases the mic stream.
   * Called by the isActiveSpeaker effect when a turn ends without an
   * explicit submit (e.g. server advanced the turn or turn timed out).
   */
  const cancel = useCallback(() => {
    _clearElapsedTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsRecording(false);
  }, []);

  return { start, stop, cancel, isRecording, elapsed, micError, getStream };
}
