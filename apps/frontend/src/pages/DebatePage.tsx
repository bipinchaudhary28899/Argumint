import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { NavLogo } from "../components/NavLogo";
import { useWebRTCMesh } from "../hooks/useWebRTCMesh";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
import { useIsMobile } from "../hooks/useIsMobile";
import { debateApi } from "../services/api";
import type { Debate, Round, BuzzerState } from "@argumint/shared";

const MIN_SUBMIT_DURATION_SEC = 3;

export function DebatePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const isMobile = useIsMobile();

  const [debate, setDebate] = useState<Debate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isUploading, setIsUploading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // ── Buzzer mode state ────────────────────────────────────────────────────
  const [buzzerState, setBuzzerState] = useState<BuzzerState | null>(null);
  const [buzzerWarning, setBuzzerWarning] = useState(false); // 10s prep flash
  const [grabError, setGrabError] = useState<string | null>(null);
  const grabErrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ────────────────────────────────────────────────────────────────────────

  const sr = useSpeechRecognition();
  // Ref to keep the captions box scrolled to the bottom as text grows
  const captionsEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sr.transcript, sr.interim]);

  useLeaveRoomOnNavigate(code, debate?.roomId, socket);

  const debateId = typeof window !== "undefined" ? sessionStorage.getItem("activeDebateId") : null;

  const isBuzzer = debate?.mode === "buzzer";

  // Alternate mode: is it this user's turn?
  const speakerUserId = debate?.currentTurn?.speakerId ?? null;
  const isMyTurn = !isBuzzer && !!user && !!speakerUserId && speakerUserId === user.id;

  // Buzzer mode: does this user currently hold the mic?
  const isHolder = isBuzzer && !!user && buzzerState?.currentHolder === user.id;

  // Who is the active speaker (used for WebRTC mesh)?
  const activeSpeakerUserId = isBuzzer
    ? (buzzerState?.currentHolder ?? null)
    : speakerUserId;

  // Whether this user is currently the one speaking (either mode).
  const isActiveSpeaker = isBuzzer ? isHolder : isMyTurn;

  // Buzzer: can this user grab the mic?
  const nowDate = new Date(now);
  const grabCooldown = buzzerState?.cooldowns.find((c) => c.userId === user?.id);
  const isOnCooldown = !!grabCooldown && new Date(grabCooldown.unlocksAt) > nowDate;
  const cooldownSecsLeft = isOnCooldown
    ? Math.ceil((new Date(grabCooldown!.unlocksAt).getTime() - now) / 1000)
    : 0;
  const isExcludedFromWindow =
    buzzerState?.grabWindowOpen && buzzerState?.lastSpeaker === user?.id;
  const canGrab =
    isBuzzer &&
    !!user &&
    !isHolder &&
    !isOnCooldown &&
    !isUploading &&
    !isExcludedFromWindow &&
    (buzzerState?.currentHolder === null || buzzerState?.grabWindowOpen === true);

  // Grab window countdown
  const grabWindowEndsAt = buzzerState?.grabWindowEndsAt
    ? new Date(buzzerState.grabWindowEndsAt).getTime()
    : null;
  const grabWindowSecsLeft =
    grabWindowEndsAt != null && buzzerState?.grabWindowOpen
      ? Math.max(0, Math.ceil((grabWindowEndsAt - now) / 1000))
      : null;

  // Holder's speak timer (countdown from turnDuration)
  const holderStartedAt = buzzerState?.holderStartedAt
    ? new Date(buzzerState.holderStartedAt).getTime()
    : null;
  const holderSecsElapsed =
    holderStartedAt != null ? Math.min(Math.floor((now - holderStartedAt) / 1000), (debate?.turnDuration ?? 60)) : 0;
  const holderSecsLeft =
    holderStartedAt != null ? Math.max(0, (debate?.turnDuration ?? 60) - holderSecsElapsed) : null;
  const holderIsUrgent = holderSecsLeft !== null && holderSecsLeft <= 10;

  const { audioBlocked, resumeAudio } = useWebRTCMesh({
    socket,
    roomId: debate?.roomId ?? null,
    selfUserId: user?.id ?? null,
    isSpeaker: isActiveSpeaker,
    activeSpeakerUserId,
  });

  // ── Initial state load ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !isConnected || !debateId) return;
    socket.emit("debate:get-state", { debateId }, (res: any) => {
      if (!res?.success) { setError(res?.error || "Failed to load debate"); return; }
      const d = res.debate as Debate;
      setDebate(d);
      if (d.mode === "buzzer" && d.buzzerState) {
        setBuzzerState(d.buzzerState as BuzzerState);
      }
    });
  }, [socket, isConnected, debateId]);

  // ── Clock tick ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // ── Socket event listeners ────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Alternate mode events
    const onTurnStarted = (data: any) => {
      setDebate((prev) => prev ? { ...prev, currentTurn: data.currentTurn, status: "in_progress" as const } : prev);
    };
    const onArgumentSubmitted = (data: any) => {
      setDebate((prev) => prev ? { ...prev, rounds: data.rounds as Round[] } : prev);
    };
    const onTurnEnded = () => {};
    const onDebateEnded = (data: any) => {
      setDebate((prev) => prev ? { ...prev, status: "ended" as const, currentTurn: null, rounds: data.rounds ?? prev.rounds } : prev);
      if (code) navigate(`/room/${code}/result`);
    };

    // Buzzer mode events
    const onBuzzerWarning = () => {
      setBuzzerWarning(true);
      setTimeout(() => setBuzzerWarning(false), 4_000);
    };
    const onBuzzerOpen = () => {
      setDebate((prev) => prev ? { ...prev, status: "in_progress" as const } : prev);
      setBuzzerState((prev) => prev
        ? { ...prev, grabWindowOpen: true }
        : {
            currentHolder: null, holderStartedAt: null,
            grabWindowOpen: true, grabWindowEndsAt: null,
            cooldowns: [], speakHistory: [], lastSpeaker: null, bonusXPAwarded: [],
          }
      );
    };
    const onHolderChanged = (data: any) => {
      setBuzzerState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentHolder: data.holder ?? null,
          holderStartedAt: data.holder ? new Date() : null,
          grabWindowOpen: data.grabWindowOpen ?? false,
          grabWindowEndsAt: data.grabWindowEndsAt ? new Date(data.grabWindowEndsAt) : null,
          lastSpeaker: data.excludedUserId ?? prev.lastSpeaker,
        };
      });
    };
    const onWindowOpen = (data: any) => {
      setBuzzerState((prev) => prev ? {
        ...prev,
        grabWindowOpen: true,
        grabWindowEndsAt: new Date(data.endsAt),
        lastSpeaker: data.excludedUserId ?? prev.lastSpeaker,
      } : prev);
    };
    const onWindowClosed = () => {
      setBuzzerState((prev) => prev ? { ...prev, grabWindowOpen: false, grabWindowEndsAt: null } : prev);
    };
    const onSpeakerTimeout = (data: any) => {
      if (data.debateId === debateId) {
        // Our turn timed out — submit whatever we have immediately.
        void handleBuzzerRelease();
      }
    };

    socket.on("debate:turn-started", onTurnStarted);
    socket.on("debate:argument-submitted", onArgumentSubmitted);
    socket.on("debate:turn-ended", onTurnEnded);
    socket.on("debate:ended", onDebateEnded);
    socket.on("buzzer:warning", onBuzzerWarning);
    socket.on("buzzer:open", onBuzzerOpen);
    socket.on("buzzer:holder-changed", onHolderChanged);
    socket.on("buzzer:window-open", onWindowOpen);
    socket.on("buzzer:window-closed", onWindowClosed);
    socket.on("buzzer:speaker-timeout", onSpeakerTimeout);

    return () => {
      socket.off("debate:turn-started", onTurnStarted);
      socket.off("debate:argument-submitted", onArgumentSubmitted);
      socket.off("debate:turn-ended", onTurnEnded);
      socket.off("debate:ended", onDebateEnded);
      socket.off("buzzer:warning", onBuzzerWarning);
      socket.off("buzzer:open", onBuzzerOpen);
      socket.off("buzzer:holder-changed", onHolderChanged);
      socket.off("buzzer:window-open", onWindowOpen);
      socket.off("buzzer:window-closed", onWindowClosed);
      socket.off("buzzer:speaker-timeout", onSpeakerTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, code, navigate, debateId]);

  // ── Recording refs ────────────────────────────────────────────────────
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  const startRecording = async () => {
    submittedRef.current = false;
    recordedChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      recorderStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data); };
      recorderRef.current = recorder;
      recordStartedAtRef.current = Date.now();
      recorder.start(250);
      sr.start("en-US");
    } catch {
      setError("Could not access microphone. Allow mic access in your browser to speak.");
    }
  };

  const stopRecording = (): Promise<{ blob: Blob | null; durationSec: number }> => {
    return new Promise((resolve) => {
      const startedAt = recordStartedAtRef.current;
      const computeDuration = () => startedAt ? Math.max(0, (Date.now() - startedAt) / 1000) : 0;
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        recorderStreamRef.current?.getTracks().forEach((t) => t.stop());
        recorderStreamRef.current = null;
        return resolve({ blob: null, durationSec: computeDuration() });
      }
      rec.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: rec.mimeType || "audio/webm" });
        recorderStreamRef.current?.getTracks().forEach((t) => t.stop());
        recorderStreamRef.current = null;
        recorderRef.current = null;
        resolve({ blob, durationSec: computeDuration() });
      };
      try { rec.stop(); } catch { resolve({ blob: null, durationSec: computeDuration() }); }
    });
  };

  // ── Start/stop recording based on active speaker status ───────────────
  useEffect(() => {
    if (isActiveSpeaker) {
      startRecording();
    } else {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try { recorderRef.current.stop(); } catch {}
      }
      recorderStreamRef.current?.getTracks().forEach((t) => t.stop());
      recorderStreamRef.current = null;
      sr.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveSpeaker]);

  // ── Alternate mode: submit argument ──────────────────────────────────
  const handleSubmit = async () => {
    resumeAudio(); // unblock mobile audio on user gesture
    if (!isMyTurn || !debateId || isUploading || submittedRef.current) return;
    submittedRef.current = true;
    // Capture SR transcript synchronously BEFORE any await — the isActiveSpeaker
    // effect may fire sr.reset() during the async stopRecording() call, wiping
    // the transcript ref and making sr.stop() return "" later.
    const srFallback = sr.stop();
    setIsUploading(true);
    try {
      const { blob, durationSec } = await stopRecording();
      if (durationSec < MIN_SUBMIT_DURATION_SEC) {
        socket?.emit("debate:submit-argument", { debateId, argument: srFallback }, () => {});
        return;
      }
      let text = srFallback; // start with SR transcript as baseline
      if (blob && blob.size > 0) {
        try {
          const whisperText = await debateApi.transcribe(debateId, blob);
          // Prefer Whisper if it returned something; otherwise keep SR text.
          if (whisperText && whisperText.trim().length > 0) text = whisperText;
        } catch {
          // Whisper failed (e.g. turn already advanced on server) — SR fallback is already set.
        }
      }
      socket?.emit("debate:submit-argument", { debateId, argument: text }, (res: any) => {
        if (!res?.success) setError(res?.error || "Failed to submit argument");
      });
    } catch (err: any) {
      setError(err?.message || "Failed to submit");
    } finally {
      setIsUploading(false);
    }
  };

  // ── Buzzer mode: release the mic ──────────────────────────────────────
  const handleBuzzerRelease = async () => {
    resumeAudio(); // unblock mobile audio on user gesture
    if (!debateId || isUploading || submittedRef.current) return;
    submittedRef.current = true;
    // Capture SR transcript synchronously BEFORE any await — same race as in
    // handleSubmit: the isActiveSpeaker effect may call sr.reset() during the
    // await, wiping the transcript before we can use it as a fallback.
    const srFallback = sr.stop();
    setIsUploading(true);
    try {
      const { blob, durationSec } = await stopRecording();
      let text = durationSec >= MIN_SUBMIT_DURATION_SEC ? srFallback : "";
      if (durationSec >= MIN_SUBMIT_DURATION_SEC && blob && blob.size > 0) {
        try {
          const whisperText = await debateApi.transcribe(debateId, blob);
          if (whisperText && whisperText.trim().length > 0) text = whisperText;
        } catch {
          // Whisper failed — SR fallback already set above.
        }
      }
      socket?.emit("buzzer:release", { debateId, argument: text }, (res: any) => {
        if (!res?.success) setError(res?.error || "Failed to release mic");
      });
    } catch (err: any) {
      setError(err?.message || "Failed to release");
    } finally {
      setIsUploading(false);
      submittedRef.current = false;
    }
  };

  // ── Buzzer mode: grab the mic ─────────────────────────────────────────
  const handleGrab = () => {
    resumeAudio(); // unblock mobile audio on first user gesture
    if (!debateId || !canGrab) return;
    setGrabError(null);
    socket?.emit("buzzer:grab", { debateId }, (res: any) => {
      if (!res?.success) {
        const msg = res?.error || "Could not grab mic";
        setGrabError(msg);
        if (grabErrTimerRef.current) clearTimeout(grabErrTimerRef.current);
        grabErrTimerRef.current = setTimeout(() => setGrabError(null), 3_000);
      }
    });
  };

  // ── Host end debate (buzzer mode) ─────────────────────────────────────
  const isHost = !!user && debate?.roomId
    ? (sessionStorage.getItem("isHost") === "true")
    : false;

  const handleHostEnd = () => {
    if (!debateId) return;
    socket?.emit("debate:host-end", { debateId }, (res: any) => {
      if (!res?.success) setError(res?.error || "Failed to end debate");
    });
  };

  // ── Alternate mode: auto-submit on timer ──────────────────────────────
  const turnEndsAt = debate?.currentTurn?.endsAt ? new Date(debate.currentTurn.endsAt).getTime() : null;
  const secondsLeft = turnEndsAt != null ? Math.max(0, Math.ceil((turnEndsAt - now) / 1000)) : null;
  const turnDuration = debate?.turnDuration ?? 180;
  const ringPct = secondsLeft != null ? secondsLeft / turnDuration : 1;
  const circumference = 2 * Math.PI * 54;
  const ringOffset = circumference * (1 - ringPct);
  const isUrgent = secondsLeft !== null && secondsLeft <= 15;

  useEffect(() => {
    if (!isMyTurn) return;
    if (secondsLeft === 0 && !submittedRef.current && !isUploading) handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isMyTurn]);

  const mySide = useMemo<"for" | "against" | null>(() => {
    if (!debate || !user) return null;
    return debate.turnOrder.find((t) => t.userId === user.id)?.side ?? null;
  }, [debate, user]);

  // ── Derive buzzer speaker's side for display ──────────────────────────
  const holderSide = useMemo(() => {
    if (!debate || !buzzerState?.currentHolder) return null;
    return debate.turnOrder.find((t) => t.userId === buzzerState.currentHolder)?.side ?? null;
  }, [debate, buzzerState?.currentHolder]);

  const holderUsername = useMemo(() => {
    if (!debate || !buzzerState?.currentHolder) return null;
    return debate.turnOrder.find((t) => t.userId === buzzerState.currentHolder)?.username ?? null;
  }, [debate, buzzerState?.currentHolder]);

  // ── Ring math for holder's speak countdown ────────────────────────────
  const buzzerCircumference = 2 * Math.PI * 54;
  const buzzerRingPct = holderSecsLeft !== null ? holderSecsLeft / (debate?.turnDuration ?? 60) : 1;
  const buzzerRingOffset = buzzerCircumference * (1 - buzzerRingPct);

  // ── Grab window ring ──────────────────────────────────────────────────
  const windowCircumference = 2 * Math.PI * 28;
  const windowRingPct = grabWindowSecsLeft != null ? grabWindowSecsLeft / 5 : 0;
  const windowRingOffset = windowCircumference * (1 - windowRingPct);

  if (error && !debate) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div className="glass" style={{ padding: "2.5rem", textAlign: "center", maxWidth: 400 }}>
          <p style={{ color: "var(--against)", marginBottom: "1.5rem" }}>⚠ {error}</p>
          <button onClick={() => navigate("/")} className="btn-ghost">Back to Home</button>
        </div>
      </div>
    );
  }
  if (!debate) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <img src="/logo/logo.png" alt="Loading…" className="logo-heartbeat" style={{ width: 72, height: 72 }} />
      </div>
    );
  }

  const turn = debate.currentTurn;
  const finished = debate.status === "ended";

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* Prep warning flash (buzzer mode) */}
      {buzzerWarning && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(244,63,94,0.08)",
          animation: "flashPulse 0.5s ease-in-out 3",
        }}>
          <div style={{
            padding: "1rem 2.5rem", borderRadius: "1rem",
            background: "rgba(244,63,94,0.15)", border: "2px solid rgba(244,63,94,0.5)",
            boxShadow: "0 0 40px rgba(244,63,94,0.3)",
          }}>
            <span style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--against)", letterSpacing: "0.08em" }}>
              🎙 GET READY TO GRAB!
            </span>
          </div>
        </div>
      )}

      {/* ── Audio blocked banner (mobile autoplay gate) ── */}
      {audioBlocked && (
        <div
          onClick={resumeAudio}
          style={{
            position: "fixed", top: 50, left: 0, right: 0, zIndex: 49,
            background: "rgba(217,119,6,0.95)", backdropFilter: "blur(8px)",
            color: "#fff", textAlign: "center", padding: "0.6rem 1rem",
            fontSize: "0.82rem", fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
          }}
        >
          🔇 Tap here to hear other speakers
        </div>
      )}

      <nav className="game-nav">
        <NavLogo />
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1rem" }}>
          {!isBuzzer && turn && !finished && (
            <div className="badge badge-muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem" }}>
              R{turn.roundNumber}/{debate.totalRounds}
            </div>
          )}
          {isBuzzer && !finished && !isMobile && (
            <div className="badge badge-muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem" }}>
              {debate.rounds.length} turn{debate.rounds.length !== 1 ? "s" : ""} · Buzzer
            </div>
          )}
          {mySide && (
            <span className={`badge ${mySide === "for" ? "badge-for" : "badge-against"}`}>
              {mySide === "for" ? "FOR" : "AGN"}
            </span>
          )}
          {isBuzzer && isHost && !finished && (
            <button onClick={handleHostEnd} className="btn-danger" style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}>
              ⏹ {isMobile ? "End" : "End Debate"}
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div className={isConnected ? "pulse-dot pulse-dot-green" : "pulse-dot pulse-dot-red"} />
            {!isMobile && <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{isConnected ? "Live" : "Offline"}</span>}
          </div>
        </div>
      </nav>

      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", padding: isMobile ? "0.75rem" : "0.875rem 1rem 0" }}>
        <div style={{ maxWidth: 1100, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1, gap: "0.875rem" }}>

          {/* Motion strip */}
          <div className="glass fade-up" style={{ flexShrink: 0, padding: "0.625rem 1rem", display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: "0.5rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", flexShrink: 0 }}>Motion</div>
              <div style={{ fontWeight: 700, color: "var(--text)", fontSize: isMobile ? "0.85rem" : "0.95rem", flex: 1 }}>{debate.topic}</div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <span className="badge badge-muted" style={{ fontSize: "0.7rem", textTransform: "capitalize" }}>Mode: {debate.mode}</span>
              <span className="badge badge-muted" style={{ fontSize: "0.7rem" }}>Slot: {debate.turnDuration}s</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", gap: "0.875rem", paddingBottom: "0.875rem" }}>
            {/* Main arena */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>

              {/* ── BUZZER MODE ARENA ── */}
              {isBuzzer && !finished && (
                <>
                  {/* Current holder spotlight */}
                  <div className={`fade-up ${isHolder ? (mySide === "for" ? "active-speaker-for" : "active-speaker-against") : (holderSide === "for" ? "glow-for" : holderSide === "against" ? "glow-against" : "")}`}
                    style={{
                      borderRadius: "1rem", padding: isMobile ? "1rem" : "1.75rem 2rem",
                      background: buzzerState?.currentHolder
                        ? (holderSide === "for" ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)")
                        : "rgba(79,142,247,0.05)",
                      border: `1px solid ${buzzerState?.currentHolder
                        ? (holderSide === "for" ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)")
                        : "rgba(79,142,247,0.2)"}`,
                      transition: "background 0.3s, border-color 0.3s",
                    }}>

                    {buzzerState?.currentHolder ? (
                      /* Someone is speaking */
                      <div style={{ display: "flex", alignItems: "flex-start", gap: isMobile ? "0.875rem" : "1.5rem", flexWrap: "wrap" }}>
                        {/* Speak countdown ring */}
                        <div style={{ position: "relative", width: isMobile ? 80 : 110, height: isMobile ? 80 : 110, flexShrink: 0 }}>
                          <svg viewBox="0 0 120 120" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="6" />
                            <circle cx="60" cy="60" r="54" fill="none"
                              stroke={holderIsUrgent ? "var(--against)" : (holderSide === "for" ? "var(--for)" : "var(--against)")}
                              strokeWidth="6" strokeLinecap="round"
                              strokeDasharray={buzzerCircumference}
                              strokeDashoffset={buzzerRingOffset}
                              style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }} />
                          </svg>
                          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "1.6rem", fontWeight: 800, lineHeight: 1,
                              color: holderIsUrgent ? "var(--against)" : (holderSide === "for" ? "var(--for)" : "var(--against)"),
                              textShadow: holderIsUrgent ? "0 0 16px rgba(244,63,94,0.6)" : "none",
                            }}>
                              {holderSecsLeft ?? "–"}
                            </span>
                            <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>sec</span>
                          </div>
                        </div>

                        {/* Speaker info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: holderSide === "for" ? "var(--for)" : "var(--against)", marginBottom: "0.3rem" }}>
                            {isHolder ? "🎙 You have the mic" : "🎙 Now speaking"}
                          </div>
                          <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                            {holderUsername ?? "…"}
                            {isHolder && <span style={{ fontSize: "0.9rem", color: "var(--cyan)", marginLeft: "0.5rem" }}>← you</span>}
                          </div>
                          <div style={{ marginTop: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {holderSide && (
                              <span className={`badge ${holderSide === "for" ? "badge-for" : "badge-against"}`}>
                                {holderSide === "for" ? "FOR" : "AGAINST"}
                              </span>
                            )}
                            {isHolder ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                <div className="pulse-dot pulse-dot-red" />
                                <span style={{ fontSize: "0.75rem", color: "var(--against)", fontWeight: 700 }}>Recording</span>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                <div className="pulse-dot pulse-dot-cyan" />
                                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Listening live</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Release button (only for holder) */}
                        {isHolder && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flexShrink: 0 }}>
                            <button onClick={handleBuzzerRelease} disabled={isUploading} className="btn-danger"
                              style={{ padding: "0.75rem 1.5rem", fontSize: "0.9rem" }}>
                              {isUploading ? "Transcribing…" : "🎙 Release Mic"}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Mic is free — show grab UI */
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "0.5rem" }}>
                            {buzzerState?.grabWindowOpen ? "⚡ RE-GRAB WINDOW" : "Mic is free"}
                          </div>
                          <div style={{ fontSize: "2.5rem", fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em" }}>
                            {buzzerState?.grabWindowOpen ? "First to grab wins!" : "Waiting…"}
                          </div>
                          {isOnCooldown && (
                            <div style={{ marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                              Cooling down — <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)", fontWeight: 700 }}>{cooldownSecsLeft}s</span>
                            </div>
                          )}
                          {isExcludedFromWindow && (
                            <div style={{ marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                              You just spoke — let others grab
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                          {/* Grab window arc */}
                          {buzzerState?.grabWindowOpen && grabWindowSecsLeft != null && (
                            <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                              <svg viewBox="0 0 64 64" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--border)" strokeWidth="4" />
                                <circle cx="32" cy="32" r="28" fill="none"
                                  stroke="var(--cyan)" strokeWidth="4" strokeLinecap="round"
                                  strokeDasharray={windowCircumference}
                                  strokeDashoffset={windowRingOffset}
                                  style={{ transition: "stroke-dashoffset 0.25s linear" }} />
                              </svg>
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--cyan)" }}>{grabWindowSecsLeft}</span>
                              </div>
                            </div>
                          )}

                          {/* Grab mic button */}
                          <button
                            onClick={handleGrab}
                            disabled={!canGrab}
                            className={canGrab ? "btn-primary" : "btn-ghost"}
                            style={{
                              fontSize: "1.25rem", padding: "1rem 3rem",
                              opacity: canGrab ? 1 : 0.45,
                              cursor: canGrab ? "pointer" : "not-allowed",
                              transition: "all 0.15s",
                              ...(canGrab ? { boxShadow: "0 0 24px rgba(79,142,247,0.4)" } : {}),
                            }}>
                            🎙 {isOnCooldown ? `Wait ${cooldownSecsLeft}s` : isExcludedFromWindow ? "Excluded" : "Grab Mic"}
                          </button>
                        </div>

                        {grabError && (
                          <div style={{ padding: "0.5rem 1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "0.5rem", color: "var(--against)", fontSize: "0.85rem" }}>
                            ⚠ {grabError}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Live captions (when holder) */}
                    {isHolder && (
                      <div style={{ marginTop: "1rem", padding: "0.875rem 1rem", borderRadius: "0.625rem", background: "rgba(224,242,254,0.75)", border: "1px solid rgba(14,165,233,0.25)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                          <div className="pulse-dot pulse-dot-cyan" />
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cyan)" }}>Live captions</span>
                        </div>
                        <div style={{ maxHeight: "8rem", overflowY: "auto", wordBreak: "break-word" }}>
                          <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.6, margin: 0 }}>
                            {sr.transcript || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Listening…</span>}
                            {sr.interim && (
                              <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
                                {sr.transcript ? " " : ""}{sr.interim}
                              </span>
                            )}
                          </p>
                          <div ref={captionsEndRef} />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── ALTERNATE MODE ARENA ── */}
              {!isBuzzer && turn && !finished && (
                <div className={`fade-up ${isMyTurn ? (mySide === "for" ? "active-speaker-for" : "active-speaker-against") : (turn.side === "for" ? "glow-for" : "glow-against")}`}
                  style={{
                    borderRadius: "1rem", padding: isMobile ? "1rem" : "1.75rem 2rem",
                    background: turn.side === "for" ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)",
                    border: `1px solid ${turn.side === "for" ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
                  }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: isMobile ? "0.875rem" : "1.5rem", flexWrap: "wrap" }}>
                    {/* Countdown ring */}
                    <div style={{ position: "relative", width: isMobile ? 80 : 110, height: isMobile ? 80 : 110, flexShrink: 0 }}>
                      <svg viewBox="0 0 120 120" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="6" />
                        <circle cx="60" cy="60" r="54" fill="none"
                          stroke={isUrgent ? "var(--against)" : (turn.side === "for" ? "var(--for)" : "var(--against)")}
                          strokeWidth="6" strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={ringOffset}
                          style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }} />
                      </svg>
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: "1.6rem", fontWeight: 800, lineHeight: 1,
                          color: isUrgent ? "var(--against)" : (turn.side === "for" ? "var(--for)" : "var(--against)"),
                          textShadow: isUrgent ? "0 0 16px rgba(244,63,94,0.6)" : (turn.side === "for" ? "0 0 16px rgba(16,185,129,0.5)" : "0 0 16px rgba(244,63,94,0.5)"),
                        }}>
                          {secondsLeft ?? "–"}
                        </span>
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>sec</span>
                      </div>
                    </div>

                    {/* Speaker info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: turn.side === "for" ? "var(--for)" : "var(--against)", marginBottom: "0.3rem" }}>
                        {isMyTurn ? "Your turn — speak now" : "Now speaking"}
                      </div>
                      <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                        {turn.speakerUsername}
                        {isMyTurn && <span style={{ fontSize: "0.9rem", color: "var(--cyan)", marginLeft: "0.5rem" }}>← you</span>}
                      </div>
                      <div style={{ marginTop: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className={`badge ${turn.side === "for" ? "badge-for" : "badge-against"}`}>
                          {turn.side === "for" ? "FOR" : "AGAINST"}
                        </span>
                        {isMyTurn && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <div className="pulse-dot pulse-dot-red" />
                            <span style={{ fontSize: "0.75rem", color: "var(--against)", fontWeight: 700 }}>Recording</span>
                          </div>
                        )}
                        {!isMyTurn && (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <div className="pulse-dot pulse-dot-cyan" />
                            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Listening live</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Submit button */}
                    {isMyTurn && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flexShrink: 0 }}>
                        <button onClick={handleSubmit} disabled={isUploading} className="btn-primary"
                          style={{ padding: "0.75rem 1.5rem", fontSize: "0.9rem" }}>
                          {isUploading ? "Transcribing…" : "Done → Submit"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Live captions */}
                  {isMyTurn && (
                    <div style={{ marginTop: "1rem", padding: "0.875rem 1rem", borderRadius: "0.625rem", background: "rgba(224,242,254,0.75)", border: "1px solid rgba(14,165,233,0.25)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                        <div className="pulse-dot pulse-dot-cyan" />
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cyan)" }}>Live captions</span>
                      </div>
                      <div style={{ maxHeight: "8rem", overflowY: "auto", wordBreak: "break-word" }}>
                        <p style={{ color: "var(--text)", fontSize: "0.875rem", lineHeight: 1.6, margin: 0 }}>
                          {sr.transcript || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Listening…</span>}
                          {sr.interim && (
                            <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
                              {sr.transcript ? " " : ""}{sr.interim}
                            </span>
                          )}
                        </p>
                        <div ref={captionsEndRef} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Finished */}
              {finished && (
                <div className="glass fade-up glow-gold" style={{ padding: "2.5rem", textAlign: "center", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--gold)", marginBottom: "0.5rem" }}>Debate Complete</div>
                  <h2 style={{ fontSize: "2rem", fontWeight: 900, color: "var(--text)", margin: "0 0 0.5rem", letterSpacing: "-0.02em" }} className="text-glow-gold">All turns finished</h2>
                  <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Navigating to results…</p>
                </div>
              )}

              {error && (
                <div style={{ padding: "0.875rem 1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "0.75rem", color: "#f43f5e", fontSize: "0.875rem" }}>⚠ {error}</div>
              )}

              {/* Transcript feed */}
              <div className="glass fade-up" style={{ padding: "1.5rem 1.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: showTranscript ? "1rem" : 0, cursor: "pointer" }}
                  onClick={() => setShowTranscript((v) => !v)}>
                  <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)" }}>
                    Transcript — {debate.rounds.length} argument{debate.rounds.length !== 1 ? "s" : ""}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{showTranscript ? "▲" : "▼"}</span>
                </div>
                {showTranscript && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {debate.rounds.length === 0 && (
                      <p style={{ color: "var(--muted)", fontSize: "0.875rem", textAlign: "center", padding: "0.5rem" }}>
                        Arguments appear here as speakers finish their turn.
                      </p>
                    )}
                    {debate.rounds.map((r: Round, i: number) => (
                      <div key={i} style={{
                        padding: "0.875rem 1rem", borderRadius: "0.625rem",
                        background: r.side === "for" ? "rgba(16,185,129,0.06)" : "rgba(244,63,94,0.06)",
                        border: `1px solid ${r.side === "for" ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", color: "var(--muted)" }}>#{r.roundNumber}</span>
                          <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.85rem" }}>{r.speakerUsername}</span>
                          <span className={`badge ${r.side === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize: "0.62rem", marginLeft: "auto" }}>
                            {r.side === "for" ? "FOR" : "AGAINST"}
                          </span>
                        </div>
                        <p style={{ color: r.argument ? "var(--text)" : "var(--muted)", fontSize: "0.875rem", margin: 0, lineHeight: 1.55, fontStyle: r.argument ? "normal" : "italic" }}>
                          {r.argument || "(no transcript captured)"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>

              {/* Buzzer: participant panel */}
              {isBuzzer ? (
                <div className="glass fade-up" style={{ padding: "1.5rem" }}>
                  <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "1rem" }}>
                    Participants
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {debate.turnOrder.map((p) => {
                      const isActive = buzzerState?.currentHolder === p.userId;
                      const isYou = p.userId === user?.id;
                      const userCd = buzzerState?.cooldowns.find((c) => c.userId === p.userId);
                      const cdSec = userCd && new Date(userCd.unlocksAt) > nowDate
                        ? Math.ceil((new Date(userCd.unlocksAt).getTime() - now) / 1000)
                        : 0;
                      const speakCount = buzzerState?.speakHistory.filter((id) => id === p.userId).length ?? 0;
                      return (
                        <div key={p.userId} style={{
                          display: "flex", alignItems: "center", gap: "0.625rem",
                          padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                          background: isActive ? (p.side === "for" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)") : "rgba(249,247,255,0.5)",
                          border: `1px solid ${isActive ? (p.side === "for" ? "rgba(16,185,129,0.4)" : "rgba(244,63,94,0.4)") : "var(--border)"}`,
                          transition: "all 0.2s",
                        }}>
                          <div className={`avatar ${p.side === "for" ? "avatar-for" : "avatar-against"}`}
                            style={{ width: "1.6rem", height: "1.6rem", fontSize: "0.7rem" }}>
                            {p.username.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ fontWeight: isActive ? 800 : 600, color: isActive ? "var(--text)" : "var(--subtle)", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.username}{isYou ? " ★" : ""}
                            </div>
                            <div style={{ fontSize: "0.65rem", color: "var(--muted)", display: "flex", gap: "0.4rem" }}>
                              <span>{speakCount} turn{speakCount !== 1 ? "s" : ""}</span>
                              {cdSec > 0 && <span style={{ color: "var(--against)" }}>· CD {cdSec}s</span>}
                            </div>
                          </div>
                          {isActive && <div className="pulse-dot pulse-dot-red" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Alternate mode: speaker queue */
                <div className="glass fade-up" style={{ padding: "1.5rem" }}>
                  <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "1rem" }}>
                    Speaker Queue
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {debate.turnOrder.map((p, i) => {
                      const isActive = turn && p.userId === turn.speakerId;
                      const isYou = p.userId === user?.id;
                      return (
                        <div key={p.userId} style={{
                          display: "flex", alignItems: "center", gap: "0.625rem",
                          padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                          background: isActive ? (p.side === "for" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)") : "rgba(249,247,255,0.5)",
                          border: `1px solid ${isActive ? (p.side === "for" ? "rgba(16,185,129,0.4)" : "rgba(244,63,94,0.4)") : "var(--border)"}`,
                          transition: "all 0.2s",
                        }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", color: "var(--muted)", width: 18, flexShrink: 0, textAlign: "right" }}>{i + 1}.</span>
                          <div className={`avatar ${p.side === "for" ? "avatar-for" : "avatar-against"}`}
                            style={{ width: "1.6rem", height: "1.6rem", fontSize: "0.7rem" }}>
                            {p.username.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: isActive ? 800 : 600, color: isActive ? "var(--text)" : "var(--subtle)", fontSize: "0.85rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.username}{isYou ? " ★" : ""}
                          </span>
                          {isActive && <div className="pulse-dot pulse-dot-cyan" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Progress */}
              <div className="glass fade-up" style={{ padding: "1rem 1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {isBuzzer ? "Turns taken" : "Progress"}
                  </span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>
                    {isBuzzer
                      ? debate.rounds.length
                      : `${debate.rounds.length}/${debate.turnOrder.length * debate.totalRounds}`}
                  </span>
                </div>
                {!isBuzzer && (
                  <>
                    <div className="score-bar-track">
                      <div className="score-bar-fill"
                        style={{ width: `${debate.turnOrder.length * debate.totalRounds > 0 ? (debate.rounds.length / (debate.turnOrder.length * debate.totalRounds)) * 100 : 0}%` }} />
                    </div>
                    <p style={{ color: "var(--muted)", fontSize: "0.72rem", marginTop: "0.4rem" }}>
                      {debate.totalRounds} round{debate.totalRounds !== 1 ? "s" : ""} · {debate.turnOrder.length} speakers
                    </p>
                  </>
                )}
                {isBuzzer && (
                  <p style={{ color: "var(--muted)", fontSize: "0.72rem", marginTop: "0.3rem" }}>
                    Free-for-all · Host ends debate
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
