import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ConnectionStatusBanner } from "../components/ConnectionStatusBanner";
import { useSocket } from "../hooks/useSocket";
import { useRecorder } from "../hooks/useRecorder";
import { InAppBrowserGate } from "../components/InAppBrowserGate";
import { useWebRTCMesh } from "../hooks/useWebRTCMesh";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
import { useReconnectHandler } from "../hooks/useReconnectHandler";
import { useIsMobile } from "../hooks/useIsMobile";
import { debateApi } from "../services/api";
import type { Debate, Round, BuzzerState } from "@argumint/shared";

const MIN_SUBMIT_DURATION_SEC = 3;

// ── UA detection ─────────────────────────────────────────────────────────────
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
// Android Chrome: Web Speech API can't share the mic with an active MediaRecorder
// stream on this platform — skip live captions, Whisper handles final transcription.
const isAndroidChrome =
  /android/i.test(ua) &&
  /Chrome\/[\d.]+/.test(ua) &&
  !/OPR\/|EdgA\/|SamsungBrowser/.test(ua);

// iOS (all browsers): WebKit on iOS doesn't allow SpeechRecognition and
// MediaRecorder to hold the mic simultaneously — same symptom as Android Chrome.
const isIOSSafari = /iPhone|iPad|iPod/i.test(ua);

// True on any platform where live captions aren't available.
const noLiveCaptions = isAndroidChrome || isIOSSafari;

// ── Mic-active strip (shown on Android / iOS instead of live captions) ────────
function MicActiveStrip({ elapsed, isUploading }: { elapsed: number; isUploading: boolean }) {
  return (
    <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", borderRadius: "0.625rem", background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", display: "flex", alignItems: "center", gap: "1rem" }}>
      {isUploading ? (
        <>
          <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>⏳</span>
          <div>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gold)" }}>Processing</div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.15rem" }}>Transcribing your argument…</div>
          </div>
        </>
      ) : (
        <>
          <div className="pulse-dot pulse-dot-red" style={{ flexShrink: 0, width: 12, height: 12 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--against)" }}>Mic Active — you're being recorded</div>
            <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.15rem" }}>
              Your argument will be transcribed when you submit
              {elapsed > 0 && <> · <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--text)" }}>{elapsed}s</span> captured</>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function DebatePage() {
  const { code, debateId } = useParams<{ code: string; debateId: string }>();
  const navigate           = useNavigate();
  const { user }           = useAuth();
  const { socket, isConnected, isReconnecting, onReconnect } = useSocket();
  const isMobile           = useIsMobile();

  // Preview routes are restricted to the admin account only.
  const PREVIEW_EMAIL   = "bkumar28899@gmail.com";
  const isAdminUser     = user?.email === PREVIEW_EMAIL;
  const isPreview       = isAdminUser && (debateId === "preview" || debateId === "preview-buzzer");
  const isPreviewBuzzer = isAdminUser && debateId === "preview-buzzer";

  const [debate, setDebate]           = useState<Debate | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [now, setNow]                 = useState(() => Date.now());
  const [isUploading, setIsUploading] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // ── Judge / spectator state ────────────────────────────────────────────────
  // Role is written to sessionStorage by RoomLobby when the user joins.
  // In preview mode a local override lets you toggle between roles.
  const [previewRole, setPreviewRole] = useState<"participant" | "judge" | "spectator">("participant");
  const myRoomRole = isPreview
    ? previewRole
    : (sessionStorage.getItem("argumint_room_role") ?? "participant");
  const [showJudgePanel, setShowJudgePanel]           = useState(false);
  const [judgeScores, setJudgeScores]                 = useState<Record<string, number>>({}); // userId → score 0-100
  const [judgeSubmitted, setJudgeSubmitted]           = useState(false);
  const [scoringWindowEndsAt, setScoringWindowEndsAt] = useState<number | null>(null);

  // ── Buzzer mode state ────────────────────────────────────────────────────
  const [buzzerState, setBuzzerState] = useState<BuzzerState | null>(null);
  const [buzzerWarning, setBuzzerWarning] = useState(false);
  const [grabError, setGrabError]     = useState<string | null>(null);
  const grabErrTimerRef               = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Buzzer timing state ──────────────────────────────────────────────────
  const [preparingEndsAt, setPreparingEndsAt] = useState<number | null>(null);
  const [holderUrgentAll, setHolderUrgentAll] = useState(false);

  // ── Room presence (judges / spectators) ───────────────────────────────────
  // Populated from debate:get-state response and kept live via room:participant-* events.
  const [roomPresence, setRoomPresence] = useState<
    { userId: string; username: string; role: string; status: string }[]
  >([]);

  // ── Recording ─────────────────────────────────────────────────────────────
  const recorder   = useRecorder(isAndroidChrome);
  const sr         = useSpeechRecognition();
  const submittedRef = useRef(false);
  // isUploading tracked via ref to avoid stale-closure guards in the shared helper.
  const isUploadingRef = useRef(false);

  const captionsEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    captionsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sr.transcript, sr.interim]);

  // ── Preview / fake-data mode — ALTERNATE ─────────────────────────────────
  // Route: /room/PREVIEW/debate/preview
  useEffect(() => {
    if (debateId !== "preview" || !user) return;
    const mockEndsAt = new Date(Date.now() + 72 * 1000);
    const mockDebate: Debate = {
      _id:          "preview",
      roomId:       "preview-room",
      roomCode:     "PREVIEW",
      creatorId:    user.id,
      topic:        "Artificial Intelligence will do more good than harm for humanity",
      mode:         "alternate",
      totalRounds:  3,
      turnDuration: 90,
      prepDuration: 60,
      status:       "in_progress",
      turnOrder: [
        { userId: user.id,   username: user.username, side: "for"     },
        { userId: "mock-p2", username: "Challenger",  side: "against" },
      ],
      currentTurn: {
        roundNumber:     3,
        speakerId:       "mock-p2",
        speakerUsername: "Challenger",
        side:            "against",
        endsAt:          mockEndsAt,
      },
      rounds: [
        {
          roundNumber:     1,
          speakerId:       user.id,
          speakerUsername: user.username,
          side:            "for",
          argument:        "AI has already saved countless lives through early cancer detection, drug discovery, and predictive maintenance of critical infrastructure. The evidence is overwhelming — the benefits far outweigh the risks when we apply responsible governance frameworks.",
          submittedAt:     new Date(Date.now() - 4 * 60 * 1000),
          durationSeconds: 85,
        },
        {
          roundNumber:     2,
          speakerId:       "mock-p2",
          speakerUsername: "Challenger",
          side:            "against",
          argument:        "The displacement of millions of workers is not a theoretical risk — it's already happening. AI-driven automation has decimated entire industries without adequate social safety nets. We must acknowledge the very real human cost before we celebrate the gains.",
          submittedAt:     new Date(Date.now() - 2 * 60 * 1000),
          durationSeconds: 78,
        },
      ],
      result:      null,
      buzzerState: null,
    } as unknown as Debate;
    setDebate(mockDebate);
    setShowTranscript(true);
  }, [debateId, user]);

  // ── Preview / fake-data mode — BUZZER ────────────────────────────────────
  // Route: /room/PREVIEW/debate/preview-buzzer
  // Shows "Challenger" currently holding the mic with ~40 s left, plus two
  // previous turns in the transcript so all the buzzer UI is visible.
  useEffect(() => {
    if (debateId !== "preview-buzzer" || !user) return;
    const holderStarted = new Date(Date.now() - 50 * 1000); // 50 s ago
    const mockBuzzerState: BuzzerState = {
      currentHolder:    "mock-p2",
      holderStartedAt:  holderStarted,
      grabWindowOpen:   false,
      grabWindowEndsAt: null,
      cooldowns:        [],
      speakHistory:     ["mock-p2", user.id],
      lastSpeaker:      user.id,
      bonusXPAwarded:   [],
    } as unknown as BuzzerState;
    const mockDebate: Debate = {
      _id:          "preview-buzzer",
      roomId:       "preview-room",
      roomCode:     "PREVIEW",
      creatorId:    user.id,
      topic:        "Social media does more harm than good to society",
      mode:         "buzzer",
      totalRounds:  0,
      turnDuration: 90,
      prepDuration: 60,
      status:       "in_progress",
      turnOrder: [
        { userId: user.id,   username: user.username, side: "for"     },
        { userId: "mock-p2", username: "Challenger",  side: "against" },
      ],
      currentTurn:  null,
      rounds: [
        {
          roundNumber:     1,
          speakerId:       user.id,
          speakerUsername: user.username,
          side:            "for",
          argument:        "Studies consistently show that platforms designed to maximise engagement exploit psychological vulnerabilities — particularly in adolescents. The correlation between heavy social media use and anxiety is now backed by multiple longitudinal studies.",
          submittedAt:     new Date(Date.now() - 3 * 60 * 1000),
          durationSeconds: 62,
        },
        {
          roundNumber:     2,
          speakerId:       "mock-p2",
          speakerUsername: "Challenger",
          side:            "against",
          argument:        "Social media toppled dictatorships during the Arab Spring and gave marginalised communities a voice they never had before. Blaming the platform ignores agency — the harm is systemic, not inherent to the medium.",
          submittedAt:     new Date(Date.now() - 90 * 1000),
          durationSeconds: 55,
        },
      ],
      result:      null,
      buzzerState: mockBuzzerState,
    } as unknown as Debate;
    setDebate(mockDebate);
    setBuzzerState(mockBuzzerState);
    setShowTranscript(true);
  }, [debateId, user]);

  useLeaveRoomOnNavigate(code, debate?.roomId, socket);

  // ── Reconnection handling ─────────────────────────────────────────────────
  const reconnectParamsRef = useRef({ socket, debateId });
  useEffect(() => { reconnectParamsRef.current = { socket, debateId }; });

  useReconnectHandler({
    onReconnect,
    enabled: !!debateId,
    reconnectFn: () => {
      const { socket: s, debateId: id } = reconnectParamsRef.current;
      if (!s || !id) return;
      s.emit("debate:get-state", { debateId: id }, (res: any) => {
        if (!res?.success) return;
        const d = res.debate as Debate;
        setDebate(d);
        if (d.mode === "buzzer" && d.buzzerState) setBuzzerState(d.buzzerState as BuzzerState);
        // Restore judge panel if debate ended and we haven't submitted yet
        if (d.status === "finished" && isJudge && !judgeSubmitted) setShowJudgePanel(true);
      });
    },
  });

  // isHost derived from debate.creatorId — no sessionStorage needed.
  const isHost = !!user && !!debate?.creatorId && debate.creatorId === user.id;

  // An observer is anyone not in the turn order (judges and spectators).
  // We derive this from the debate itself so it works even after a page refresh.
  // IMPORTANT: declare before isMyTurn / isHolder which reference isObserver.
  const isInTurnOrder = !!user && (debate?.turnOrder.some((t) => t.userId === user.id) ?? false);
  // In preview, role picker overrides the observer flag directly.
  const isObserver    = isPreview
    ? previewRole !== "participant"
    : (!!debate && !isInTurnOrder && !isHost);
  const isJudge       = isObserver && myRoomRole === "judge";

  const isBuzzer         = debate?.mode === "buzzer";
  const speakerUserId    = debate?.currentTurn?.speakerId ?? null;
  // Observers (judges/spectators) are never the active speaker
  const isMyTurn         = !isBuzzer && !!user && !!speakerUserId && speakerUserId === user.id && !isObserver;
  const isHolder         = isBuzzer && !!user && buzzerState?.currentHolder === user.id && !isObserver;
  const activeSpeakerUserId = isBuzzer ? (buzzerState?.currentHolder ?? null) : speakerUserId;
  const isActiveSpeaker  = isBuzzer ? isHolder : isMyTurn;

  // ── Buzzer derived values ─────────────────────────────────────────────────
  const nowDate         = new Date(now);
  const grabCooldown    = buzzerState?.cooldowns.find((c) => c.userId === user?.id);
  const isOnCooldown    = !!grabCooldown && new Date(grabCooldown.unlocksAt) > nowDate;
  const cooldownSecsLeft = isOnCooldown
    ? Math.ceil((new Date(grabCooldown!.unlocksAt).getTime() - now) / 1000)
    : 0;
  const isExcludedFromWindow =
    buzzerState?.grabWindowOpen && buzzerState?.lastSpeaker === user?.id;
  const canGrab =
    isBuzzer &&
    !!user &&
    !isObserver &&
    !isHolder &&
    !isOnCooldown &&
    !isUploading &&
    !isExcludedFromWindow &&
    (buzzerState?.currentHolder === null || buzzerState?.grabWindowOpen === true);

  const grabWindowEndsAt = buzzerState?.grabWindowEndsAt
    ? new Date(buzzerState.grabWindowEndsAt).getTime()
    : null;
  const grabWindowSecsLeft =
    grabWindowEndsAt != null && buzzerState?.grabWindowOpen
      ? Math.max(0, Math.ceil((grabWindowEndsAt - now) / 1000))
      : null;

  const holderStartedAt = buzzerState?.holderStartedAt
    ? new Date(buzzerState.holderStartedAt).getTime()
    : null;
  const holderSecsElapsed =
    holderStartedAt != null
      ? Math.min(Math.floor((now - holderStartedAt) / 1000), debate?.turnDuration ?? 60)
      : 0;
  const holderSecsLeft =
    holderStartedAt != null ? Math.max(0, (debate?.turnDuration ?? 60) - holderSecsElapsed) : null;
  const holderIsUrgent = holderSecsLeft !== null && holderSecsLeft <= 10;

  const { audioBlocked, resumeAudio } = useWebRTCMesh({
    socket,
    roomId: debate?.roomId ?? null,
    selfUserId: user?.id ?? null,
    // Observers never broadcast a mic track — they only receive audio
    isSpeaker: isObserver ? false : isActiveSpeaker,
    activeSpeakerUserId,
    getExternalStream: isObserver ? undefined : recorder.getStream,
  });

  // ── Initial state load ────────────────────────────────────────────────────
  useEffect(() => {
    if (isPreview) return;
    if (!socket || !isConnected || !debateId) return;
    socket.emit("debate:get-state", { debateId }, (res: any) => {
      if (!res?.success) { setError(res?.error || "Failed to load debate"); return; }
      const d = res.debate as Debate;
      setDebate(d);
      if (d.mode === "buzzer" && d.buzzerState) setBuzzerState(d.buzzerState as BuzzerState);
      if (res.roomParticipants) setRoomPresence(res.roomParticipants);
    });
  }, [socket, isConnected, debateId]);

  // ── Clock tick ────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onTurnStarted = (data: any) => {
      setDebate((prev) => prev ? { ...prev, currentTurn: data.currentTurn, status: "in_progress" as const } : prev);
    };
    const onArgumentSubmitted = (data: any) => {
      setDebate((prev) => prev ? { ...prev, rounds: data.rounds as Round[] } : prev);
    };
    const onTurnEnded   = () => {};
    const onDebateEnded = (data: any) => {
      setDebate((prev) => prev ? { ...prev, status: "ended" as const, currentTurn: null, rounds: data.rounds ?? prev.rounds } : prev);
      // Don't navigate yet — wait for debate:scoring-window-opened which tells
      // everyone whether there are judges and when the window closes.
    };
    const onScoringWindowOpened = (data: any) => {
      if (!data.hasJudges) {
        // No judges in the room — navigate immediately (no one to wait for).
        if (code && debateId) navigate(`/room/${code}/result/${debateId}`);
        return;
      }
      setScoringWindowEndsAt(new Date(data.locksAt).getTime());
      if (isJudge) setShowJudgePanel(true);
    };
    const onJudgeScoresLocked = () => {
      setScoringWindowEndsAt(null);
      if (code && debateId) navigate(`/room/${code}/result/${debateId}`);
    };

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
      // When someone grabs the mic, clear any prep/urgent state
      if (data.holder) {
        setHolderUrgentAll(false);
        setPreparingEndsAt(null);
      }
      setBuzzerState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentHolder:    data.holder ?? null,
          holderStartedAt:  data.holder ? new Date() : null,
          grabWindowOpen:   data.grabWindowOpen ?? false,
          grabWindowEndsAt: data.grabWindowEndsAt ? new Date(data.grabWindowEndsAt) : null,
          lastSpeaker:      data.excludedUserId ?? prev.lastSpeaker,
        };
      });
    };
    const onWindowOpen   = (data: any) => {
      // Prep phase is over — window is now open
      setPreparingEndsAt(null);
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
      if (data.debateId === debateId) void handleBuzzerRelease();
    };
    // 5-second "Get Ready" prep phase after a speaker releases the mic
    const onPreparing = (data: any) => {
      setPreparingEndsAt(new Date(data.endsAt).getTime());
    };
    // Server fires this 10 s before holder auto-timeout so non-holders can
    // see the standby grab button early (whoever clicks first will grab it).
    const onHolderUrgent = () => {
      setHolderUrgentAll(true);
    };

    // Room presence — keep judges/spectators panel live
    const onParticipantJoined = (data: any) => {
      if (data.participants) setRoomPresence(data.participants);
    };
    const onParticipantLeft = (data: any) => {
      if (data.participants) setRoomPresence(data.participants);
    };

    socket.on("debate:turn-started",       onTurnStarted);
    socket.on("debate:argument-submitted", onArgumentSubmitted);
    socket.on("debate:turn-ended",         onTurnEnded);
    socket.on("debate:ended",                  onDebateEnded);
    socket.on("debate:scoring-window-opened",  onScoringWindowOpened);
    socket.on("debate:judge-scores-locked",    onJudgeScoresLocked);
    socket.on("buzzer:warning",                onBuzzerWarning);
    socket.on("buzzer:open",               onBuzzerOpen);
    socket.on("buzzer:holder-changed",     onHolderChanged);
    socket.on("buzzer:window-open",        onWindowOpen);
    socket.on("buzzer:window-closed",      onWindowClosed);
    socket.on("buzzer:speaker-timeout",    onSpeakerTimeout);
    socket.on("buzzer:preparing",          onPreparing);
    socket.on("buzzer:holder-urgent",      onHolderUrgent);
    socket.on("room:participant-joined",   onParticipantJoined);
    socket.on("room:participant-left",     onParticipantLeft);

    return () => {
      socket.off("debate:turn-started",       onTurnStarted);
      socket.off("debate:argument-submitted", onArgumentSubmitted);
      socket.off("debate:turn-ended",         onTurnEnded);
      socket.off("debate:ended",                  onDebateEnded);
      socket.off("debate:scoring-window-opened",  onScoringWindowOpened);
      socket.off("debate:judge-scores-locked",    onJudgeScoresLocked);
      socket.off("buzzer:warning",                onBuzzerWarning);
      socket.off("buzzer:open",               onBuzzerOpen);
      socket.off("buzzer:holder-changed",     onHolderChanged);
      socket.off("buzzer:window-open",        onWindowOpen);
      socket.off("buzzer:window-closed",      onWindowClosed);
      socket.off("buzzer:speaker-timeout",    onSpeakerTimeout);
      socket.off("buzzer:preparing",          onPreparing);
      socket.off("buzzer:holder-urgent",      onHolderUrgent);
      socket.off("room:participant-joined",   onParticipantJoined);
      socket.off("room:participant-left",     onParticipantLeft);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, code, navigate, debateId]);

  // ── Scoring-window countdown (driven by the existing `now` ticker) ─────────
  // scoringSecsLeft counts down from 60 for both judges and non-judges.
  const scoringSecsLeft = scoringWindowEndsAt != null
    ? Math.max(0, Math.ceil((scoringWindowEndsAt - now) / 1000))
    : null;

  // ── Start/stop recording when active speaker status changes ───────────────
  // Observers (judges / spectators) never record — they only receive audio.
  useEffect(() => {
    if (isObserver) return;
    if (isActiveSpeaker) {
      submittedRef.current = false;
      void recorder.start();
      if (!noLiveCaptions) sr.start("en-US");
    } else {
      recorder.cancel();
      sr.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveSpeaker, isObserver]);

  // ── Shared transcription + submit helper ──────────────────────────────────
  // Both handleSubmit (alternate mode) and handleBuzzerRelease (buzzer mode)
  // use this: stop recording → try Whisper → fall back to SR → call onEmit.
  const transcribeAndEmit = async (onEmit: (text: string) => void) => {
    if (!debateId || isUploadingRef.current || submittedRef.current) return;
    submittedRef.current  = true;
    isUploadingRef.current = true;
    setIsUploading(true);
    // Capture SR transcript synchronously before any await — the isActiveSpeaker
    // effect may call sr.reset() during recorder.stop(), wiping the transcript.
    const srFallback = sr.stop();
    try {
      const { blob, durationSec } = await recorder.stop();
      let text = durationSec >= MIN_SUBMIT_DURATION_SEC ? srFallback : "";
      if (durationSec >= MIN_SUBMIT_DURATION_SEC && blob && blob.size > 0) {
        try {
          const whisperText = await debateApi.transcribe(debateId, blob);
          if (whisperText?.trim()) text = whisperText;
        } catch (err) {
          console.error("[Transcribe] Whisper error:", err);
        }
      }
      onEmit(text);
    } catch (err: any) {
      setError(err?.message || "Failed to submit");
    } finally {
      isUploadingRef.current = false;
      setIsUploading(false);
    }
  };

  // ── Alternate mode: submit argument ──────────────────────────────────────
  // bypassTurnCheck=true when called from the auto-submit timer — the server
  // may have already advanced the turn, making isMyTurn false, but the backend
  // still validates ownership so the argument won't be accepted out-of-turn.
  const handleSubmit = (bypassTurnCheck = false) => {
    resumeAudio();
    if (!bypassTurnCheck && !isMyTurn) return;
    void transcribeAndEmit((text) => {
      socket?.emit("debate:submit-argument", { debateId, argument: text }, (res: any) => {
        if (!res?.success) setError(res?.error || "Failed to submit argument");
      });
    });
  };

  // ── Buzzer mode: release the mic ──────────────────────────────────────────
  const handleBuzzerRelease = () => {
    resumeAudio();
    void transcribeAndEmit((text) => {
      socket?.emit("buzzer:release", { debateId, argument: text }, (res: any) => {
        if (!res?.success) setError(res?.error || "Failed to release mic");
        submittedRef.current = false; // allow re-grab for next turn
      });
    });
  };

  // ── Buzzer mode: grab the mic ─────────────────────────────────────────────
  const handleGrab = () => {
    resumeAudio();
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

  // ── Judge: submit scores ──────────────────────────────────────────────────
  const handleJudgeSubmit = () => {
    if (!debateId || !debate) return;
    const scores = debate.turnOrder.map((p) => ({
      userId: p.userId,
      score:  judgeScores[p.userId] ?? 50,
    }));
    socket?.emit("debate:submit-judge-scores", { debateId, scores }, (res: any) => {
      if (res?.success) {
        setJudgeSubmitted(true);
        // Lock scores — this triggers debate:judge-scores-locked on the server
        // which navigates ALL clients (judges + spectators + debaters) at once.
        socket?.emit("debate:lock-judge-scores", { debateId });
      } else {
        setError(res?.error || "Failed to submit scores");
      }
    });
  };

  // ── Host end debate (buzzer mode) ─────────────────────────────────────────
  const handleHostEnd = () => {
    if (!debateId) return;
    socket?.emit("debate:host-end", { debateId }, (res: any) => {
      if (!res?.success) setError(res?.error || "Failed to end debate");
    });
  };

  // ── Alternate mode: countdown + auto-submit ───────────────────────────────
  const turnEndsAt   = debate?.currentTurn?.endsAt ? new Date(debate.currentTurn.endsAt).getTime() : null;
  const secondsLeft  = turnEndsAt != null ? Math.max(0, Math.ceil((turnEndsAt - now) / 1000)) : null;
  const turnDuration = debate?.turnDuration ?? 180;
  const ringPct      = secondsLeft != null ? secondsLeft / turnDuration : 1;
  const circumference = 2 * Math.PI * 54;
  const ringOffset   = circumference * (1 - ringPct);
  const isUrgent     = secondsLeft !== null && secondsLeft <= 15;

  useEffect(() => {
    if (!isMyTurn) return;
    if (secondsLeft === 0 && !submittedRef.current && !isUploadingRef.current) handleSubmit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isMyTurn]);

  const mySide = useMemo<"for" | "against" | null>(() => {
    if (!debate || !user) return null;
    return debate.turnOrder.find((t) => t.userId === user.id)?.side ?? null;
  }, [debate, user]);

  const holderSide = useMemo(() => {
    if (!debate || !buzzerState?.currentHolder) return null;
    return debate.turnOrder.find((t) => t.userId === buzzerState.currentHolder)?.side ?? null;
  }, [debate, buzzerState?.currentHolder]);

  const holderUsername = useMemo(() => {
    if (!debate || !buzzerState?.currentHolder) return null;
    return debate.turnOrder.find((t) => t.userId === buzzerState.currentHolder)?.username ?? null;
  }, [debate, buzzerState?.currentHolder]);

  const buzzerCircumference = 2 * Math.PI * 54;
  const buzzerRingPct    = holderSecsLeft !== null ? holderSecsLeft / (debate?.turnDuration ?? 60) : 1;
  const buzzerRingOffset = buzzerCircumference * (1 - buzzerRingPct);
  const windowCircumference = 2 * Math.PI * 28;
  const windowRingPct    = grabWindowSecsLeft != null ? grabWindowSecsLeft / 5 : 0;
  const windowRingOffset = windowCircumference * (1 - windowRingPct);

  // "Get Ready" prep phase countdown (5 s before the grab window opens)
  const preparingSecsLeft = preparingEndsAt != null
    ? Math.max(0, Math.ceil((preparingEndsAt - now) / 1000))
    : null;

  // ── Preview-buzzer: simulate holder urgent warning at ≤10 s ─────────────
  useEffect(() => {
    if (!isPreviewBuzzer || !buzzerState?.currentHolder || holderSecsLeft === null) return;
    if (holderSecsLeft === 10) setHolderUrgentAll(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewBuzzer, holderSecsLeft]);

  // ── Preview-buzzer: simulate holder timeout → 5-second prep phase ────────
  // When the mock holder's clock hits 0 the server would normally emit
  // buzzer:preparing. We replicate that here without a real socket.
  useEffect(() => {
    if (!isPreviewBuzzer || holderSecsLeft !== 0 || !buzzerState?.currentHolder) return;
    const released = buzzerState.currentHolder; // "mock-p2"
    // Clear holder immediately, enter prep phase
    setBuzzerState((prev) => prev ? {
      ...prev,
      currentHolder:   null,
      holderStartedAt: null,
      grabWindowOpen:  false,
      grabWindowEndsAt: null,
      lastSpeaker:     released,
    } : prev);
    setHolderUrgentAll(false);
    setPreparingEndsAt(Date.now() + 5_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewBuzzer, holderSecsLeft]);

  // ── Preview-buzzer: prep phase ends → open grab window ───────────────────
  useEffect(() => {
    if (!isPreviewBuzzer || preparingSecsLeft !== 0 || preparingEndsAt === null) return;
    setPreparingEndsAt(null);
    setBuzzerState((prev) => prev ? {
      ...prev,
      grabWindowOpen:   true,
      grabWindowEndsAt: new Date(Date.now() + 5_000),
    } : prev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewBuzzer, preparingSecsLeft, preparingEndsAt]);

  // ── Preview-buzzer: close grab window after it expires ────────────────────
  useEffect(() => {
    if (!isPreviewBuzzer || !buzzerState?.grabWindowOpen || grabWindowSecsLeft !== 0) return;
    setBuzzerState((prev) => prev ? {
      ...prev,
      grabWindowOpen:   false,
      grabWindowEndsAt: null,
    } : prev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewBuzzer, buzzerState?.grabWindowOpen, grabWindowSecsLeft]);

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


  const turn     = debate.currentTurn;
  const finished = debate.status === "ended";

  // Derived participant lists
  const forParticipants     = debate.turnOrder.filter((p) => p.side === "for");
  const againstParticipants = debate.turnOrder.filter((p) => p.side === "against");

  // Room presence split by role
  const judgeMembers     = roomPresence.filter((p) => p.role === "judge");
  const spectatorMembers = roomPresence.filter((p) => p.role === "spectator");

  // ── Center ring constants ─────────────────────────────────────────────────
  const RING_R    = 90;
  const RING_CIRC = 2 * Math.PI * RING_R;   // ≈ 565.5 SVG units

  // The ring diameter rendered in px
  const ringSize  = isMobile ? 156 : 184;

  // Which arc progress to show (0 = empty, 1 = full)
  const stageRingPct: number = (() => {
    if (isBuzzer) {
      if (buzzerState?.currentHolder && holderSecsLeft !== null)
        return holderSecsLeft / (debate.turnDuration ?? 60);
      if (preparingSecsLeft !== null && preparingSecsLeft > 0)
        return preparingSecsLeft / 5;
      if (buzzerState?.grabWindowOpen && grabWindowSecsLeft !== null)
        return grabWindowSecsLeft / 5;
      return 0;
    }
    return secondsLeft !== null ? secondsLeft / (debate.turnDuration ?? 180) : 1;
  })();
  const stageRingOffset = RING_CIRC * (1 - stageRingPct);

  const stageRingColor: string = (() => {
    if (isBuzzer) {
      if (buzzerState?.currentHolder)
        return holderIsUrgent ? "var(--against)" : (holderSide === "for" ? "var(--for)" : "var(--against)");
      if (preparingSecsLeft !== null && preparingSecsLeft > 0) return "var(--gold)";
      if (buzzerState?.grabWindowOpen) return "var(--cyan)";
      return "rgba(255,255,255,0.12)";
    }
    if (!turn) return "rgba(255,255,255,0.12)";
    return isUrgent ? "var(--against)" : (turn.side === "for" ? "var(--for)" : "var(--against)");
  })();

  // ── Compact side-panel participant card ───────────────────────────────────
  const SideCard = ({ p }: { p: { userId: string; username: string; side: "for" | "against" } }) => {
    const isActive   = p.userId === activeSpeakerUserId;
    const isYou      = p.userId === user?.id;
    const side       = p.side;
    const accentRgb  = side === "for" ? "var(--for-rgb)" : "var(--against-rgb)";
    const accentVar  = side === "for" ? "var(--for)" : "var(--against)";
    const speakCount = isBuzzer
      ? (buzzerState?.speakHistory.filter((id) => id === p.userId).length ?? 0)
      : debate.rounds.filter((r) => r.speakerId === p.userId).length;
    const userCd = isBuzzer ? buzzerState?.cooldowns.find((c) => c.userId === p.userId) : null;
    const cdSec  = userCd && new Date(userCd.unlocksAt) > nowDate
      ? Math.ceil((new Date(userCd.unlocksAt).getTime() - now) / 1000) : 0;

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem",
        padding: "0.4rem 0.25rem", borderRadius: "0.5rem",
        background: isActive ? `rgba(${accentRgb},0.1)` : "transparent",
        transition: "background 0.3s",
      }}>
        <div
          className={isActive ? (side === "for" ? "avatar-speaking-for" : "avatar-speaking-against") : ""}
          style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0, position: "relative",
            background: `linear-gradient(135deg,rgba(${accentRgb},0.15),rgba(${accentRgb},0.3))`,
            border: `2px solid ${isActive ? accentVar : "var(--border)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.82rem", fontWeight: 900, color: accentVar, transition: "border-color 0.3s",
          }}
        >
          {p.username.charAt(0).toUpperCase()}
          {isYou && (
            <span style={{
              position: "absolute", bottom: -3, right: -3,
              fontSize: "0.48rem", background: "var(--gold)", color: "#fff",
              borderRadius: "50%", width: 13, height: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 900, border: "1.5px solid var(--bg)",
            }}>★</span>
          )}
        </div>
        <div style={{
          fontSize: "0.62rem", fontWeight: isActive ? 800 : 600,
          color: isActive ? "var(--text)" : "var(--muted)",
          maxWidth: 76, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textAlign: "center", transition: "color 0.2s",
        }}>{p.username}</div>
        <div style={{ fontSize: "0.55rem", color: isActive ? accentVar : "var(--muted)", textAlign: "center" }}>
          {isActive ? <span style={{ fontWeight: 700 }}>Speaking</span>
            : cdSec > 0 ? <span style={{ color: "var(--against)" }}>CD {cdSec}s</span>
            : <span>{speakCount > 0 ? `${speakCount}×` : "—"}</span>}
        </div>

        {/* Inline judge score — visible to judges throughout the debate */}
        {isJudge && (
          <div style={{ marginTop: "0.18rem", display: "flex", alignItems: "center", gap: "0.15rem" }}>
            <button
              onClick={() => setJudgeScores(prev => ({ ...prev, [p.userId]: Math.max(0, (prev[p.userId] ?? 50) - 5) }))}
              disabled={judgeSubmitted}
              style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--muted)", fontSize: "0.6rem", lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
            >−</button>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 900,
              minWidth: 20, textAlign: "center",
              color: (judgeScores[p.userId] ?? 50) >= 70 ? "var(--for)" : (judgeScores[p.userId] ?? 50) >= 40 ? "var(--cyan)" : "var(--against)",
            }}>{judgeScores[p.userId] ?? 50}</span>
            <button
              onClick={() => setJudgeScores(prev => ({ ...prev, [p.userId]: Math.min(100, (prev[p.userId] ?? 50) + 5) }))}
              disabled={judgeSubmitted}
              style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--muted)", fontSize: "0.6rem", lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}
            >+</button>
          </div>
        )}
      </div>
    );
  };

  // ── Observer chip (judge or spectator pill) ───────────────────────────────
  const ObserverChip = ({
    member, isJudgeMember = false,
  }: {
    member: { userId: string; username: string; role: string };
    isJudgeMember?: boolean;
  }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.25rem",
      padding: "0.15rem 0.4rem 0.15rem 0.2rem", borderRadius: "2rem",
      background: isJudgeMember ? "rgba(167,139,250,0.12)" : "rgba(107,114,128,0.08)",
      border: `1px solid ${isJudgeMember ? "rgba(167,139,250,0.25)" : "var(--border)"}`,
      flexShrink: 0,
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%",
        background: isJudgeMember ? "rgba(167,139,250,0.22)" : "var(--surface2)",
        border: `1px solid ${isJudgeMember ? "#a78bfa" : "var(--border)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.55rem", fontWeight: 800,
        color: isJudgeMember ? "#a78bfa" : "var(--muted)", flexShrink: 0,
      }}>
        {member.username.charAt(0).toUpperCase()}
      </div>
      <span style={{
        fontSize: "0.58rem", fontWeight: 600,
        color: isJudgeMember ? "#a78bfa" : "var(--muted)",
        maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{member.username}</span>
    </div>
  );

  // Preview mock observers (shown when isPreview and no real presence data)
  const mockJudges: { userId: string; username: string; role: string }[] =
    isPreview && judgeMembers.length === 0
      ? [{ userId: "mj1", username: "Justice", role: "judge" }, { userId: "mj2", username: "Arbiter", role: "judge" }]
      : judgeMembers;
  const mockSpectators: { userId: string; username: string; role: string }[] =
    isPreview && spectatorMembers.length === 0
      ? [{ userId: "ms1", username: "Viewer1", role: "spectator" }, { userId: "ms2", username: "Viewer2", role: "spectator" }, { userId: "ms3", username: "Crowd3", role: "spectator" }]
      : spectatorMembers;
  const showObservers = mockJudges.length > 0 || mockSpectators.length > 0;

  return (
    <InAppBrowserGate>
      {!isPreview && <ConnectionStatusBanner isConnected={isConnected} isReconnecting={isReconnecting} />}

      {/* Buzzer warning flash overlay */}
      {buzzerWarning && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(244,63,94,0.08)", animation: "flashPulse 0.5s ease-in-out 3" }}>
          <div style={{ padding: "0.875rem 2rem", borderRadius: "0.875rem", background: "rgba(244,63,94,0.15)", border: "2px solid rgba(244,63,94,0.5)", boxShadow: "0 0 40px rgba(244,63,94,0.3)" }}>
            <span style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--against)", letterSpacing: "0.08em" }}>🎙 GET READY TO GRAB!</span>
          </div>
        </div>
      )}

      {/* Fixed error banners */}
      {recorder.micError && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 49, background: "rgba(244,63,94,0.95)", color: "#fff", textAlign: "center", padding: "0.4rem 1rem", fontSize: "0.78rem", fontWeight: 700 }}>
          ⚠ {recorder.micError}
        </div>
      )}
      {audioBlocked && (
        <div onClick={resumeAudio} style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 49, background: "rgba(217,119,6,0.95)", backdropFilter: "blur(8px)", color: "#fff", textAlign: "center", padding: "0.4rem 1rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}>
          🔇 Tap here to hear other speakers
        </div>
      )}

      <div className="bg-grid" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>

        {/* ── PREVIEW BANNER ── */}
        {isPreview && (
          <div style={{ flexShrink: 0, padding: "0.35rem 0.75rem", background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.7rem", flexShrink: 0 }}>🧪</span>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--gold)", letterSpacing: "0.06em", flexShrink: 0 }}>PREVIEW</span>
            {/* Role picker */}
            <div style={{ display: "flex", gap: "0.25rem", marginLeft: "0.25rem" }}>
              {([ ["participant", "⚔️", "Debater"], ["judge", "⚖️", "Judge"], ["spectator", "👁️", "Spectator"] ] as [typeof previewRole, string, string][]).map(([role, icon, label]) => (
                <button
                  key={role}
                  onClick={() => {
                    setPreviewRole(role);
                    // Show judge scoring panel immediately when switching to judge
                    if (role === "judge") {
                      setShowJudgePanel(true);
                      setScoringWindowEndsAt(Date.now() + 60_000);
                    } else {
                      setShowJudgePanel(false);
                      setScoringWindowEndsAt(null);
                    }
                  }}
                  style={{
                    padding: "0.18rem 0.45rem", fontSize: "0.62rem", fontWeight: previewRole === role ? 800 : 600,
                    borderRadius: "0.375rem", border: `1px solid ${previewRole === role ? "rgba(245,158,11,0.6)" : "var(--border)"}`,
                    background: previewRole === role ? "rgba(245,158,11,0.14)" : "transparent",
                    color: previewRole === role ? "var(--gold)" : "var(--muted)", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "0.2rem",
                  }}
                >{icon} {label}</button>
              ))}
            </div>
            {!isMobile && <span style={{ fontSize: "0.62rem", color: "var(--muted)", flex: 1 }}>No mic or network needed.</span>}
            <div style={{ flex: isMobile ? 1 : undefined }} />
            <button onClick={() => navigate("/")} className="btn-ghost" style={{ padding: "0.2rem 0.55rem", fontSize: "0.68rem", flexShrink: 0 }}>← Home</button>
          </div>
        )}

        {/* ── MOTION STRIP ── */}
        <div className="glass" style={{
          flexShrink: 0, margin: "0.4rem 0.625rem 0", borderRadius: "0.75rem",
          padding: isMobile ? "0.5rem 0.875rem" : "0.375rem 0.875rem",
          display: "flex", flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? "0.3rem" : "0.5rem",
        }}>
          {/* Top row (mobile) / single row (desktop): label + badges */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", width: isMobile ? "100%" : undefined, flexShrink: 0 }}>
            <span style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", flexShrink: 0 }}>Motion</span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flex: isMobile ? 1 : undefined }}>
              {!isBuzzer && turn && !finished && (
                <span className="badge badge-muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem" }}>R{turn.roundNumber}/{debate.totalRounds}</span>
              )}
              {isBuzzer && !finished && (
                <span className="badge badge-muted" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem" }}>{debate.rounds.length} turns</span>
              )}
              {mySide && !isObserver && (
                <span className={`badge ${mySide === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize: "0.58rem" }}>{mySide === "for" ? "FOR" : "AGN"}</span>
              )}
              {isObserver && (
                <span className="badge badge-muted" style={{ fontSize: "0.58rem", background: isJudge ? "rgba(167,139,250,0.15)" : undefined, color: isJudge ? "#a78bfa" : undefined }}>
                  {isJudge ? "⚖️ JUDGE" : "👁 SPECTATOR"}
                </span>
              )}
              {isBuzzer && isHost && !finished && (
                <button onClick={handleHostEnd} className="btn-danger" style={{ padding: "0.15rem 0.4rem", fontSize: "0.62rem" }}>⏹ End</button>
              )}
              <span className="badge badge-muted" style={{ fontSize: "0.58rem", textTransform: "capitalize" }}>{debate.mode} · {debate.turnDuration}s</span>
              <div className={(isConnected || isPreview) ? "pulse-dot pulse-dot-green" : "pulse-dot pulse-dot-red"} />
            </div>
          </div>
          {/* Topic text — full wrap on mobile, truncated on desktop */}
          <span style={{
            fontWeight: 700, color: "var(--text)",
            fontSize: isMobile ? "0.92rem" : "0.82rem",
            lineHeight: 1.3,
            ...(isMobile ? {} : { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }),
          }}>{debate.topic}</span>
        </div>

        {/* ── MAIN ARENA ── */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "0.4rem", padding: "0.4rem 0.625rem 0.625rem" }}>

          {/* ── ROW 1: side panels + center stage ── */}
          <div style={{
            flex: "1 1 0", minHeight: 0,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "106px 1fr 106px",
            gap: "0.4rem",
          }}>

            {/* FOR panel (desktop) */}
            {!isMobile && (
              <div className="glass" style={{
                borderRadius: "0.75rem", padding: "0.5rem 0.3rem",
                display: "flex", flexDirection: "column", gap: "0.1rem", overflow: "hidden",
                background: "rgba(var(--for-rgb),0.04)", border: "1px solid rgba(var(--for-rgb),0.18)",
              }}>
                <div style={{ fontSize: "0.52rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--for)", textAlign: "center", marginBottom: "0.25rem" }}>FOR</div>
                {forParticipants.map((p) => <SideCard key={p.userId} p={p} />)}
              </div>
            )}

            {/* ── CENTER STAGE ── */}
            <div className="glass" style={{
              borderRadius: "0.875rem", overflow: "hidden",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              padding: isMobile ? "0.75rem 0.5rem" : "0.875rem",
              gap: "0.375rem",
              background: isBuzzer
                ? (buzzerState?.currentHolder
                    ? (holderSide === "for" ? "rgba(var(--for-rgb),0.04)" : "rgba(var(--against-rgb),0.04)")
                    : "rgba(var(--blue-rgb),0.03)")
                : (turn
                    ? (turn.side === "for" ? "rgba(var(--for-rgb),0.04)" : "rgba(var(--against-rgb),0.04)")
                    : "transparent"),
              border: `1px solid ${isBuzzer
                ? (buzzerState?.currentHolder
                    ? (holderSide === "for" ? "rgba(var(--for-rgb),0.22)" : "rgba(var(--against-rgb),0.22)")
                    : "rgba(var(--blue-rgb),0.1)")
                : (turn
                    ? (turn.side === "for" ? "rgba(var(--for-rgb),0.22)" : "rgba(var(--against-rgb),0.22)")
                    : "var(--border)")}`,
              transition: "background 0.3s, border-color 0.3s",
            }}>

              {showJudgePanel && isJudge ? (

                /* ── JUDGE SCORING PANEL ── */
                <div style={{ width: "100%", overflowY: "auto", maxHeight: "100%", padding: "0 0.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.625rem", flexWrap: "wrap", gap: "0.4rem" }}>
                    <div>
                      <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a78bfa" }}>Judge Scoring</div>
                      <div style={{ fontSize: "0.95rem", fontWeight: 900, color: "var(--text)" }}>Score the Debaters</div>
                    </div>
                    {!judgeSubmitted && scoringSecsLeft !== null && (
                      <div style={{ padding: "0.25rem 0.5rem", borderRadius: "0.4rem", background: scoringSecsLeft <= 10 ? "rgba(var(--against-rgb),0.12)" : "rgba(167,139,250,0.1)", border: `1px solid ${scoringSecsLeft <= 10 ? "rgba(var(--against-rgb),0.3)" : "rgba(167,139,250,0.2)"}` }}>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.88rem", fontWeight: 800, color: scoringSecsLeft <= 10 ? "var(--against)" : "#a78bfa" }}>{scoringSecsLeft}s</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.625rem" }}>
                    {debate.turnOrder.map((p) => {
                      const score = judgeScores[p.userId] ?? 50;
                      return (
                        <div key={p.userId} style={{ padding: "0.5rem 0.625rem", borderRadius: "0.5rem", background: "var(--surface2)", border: "1px solid var(--border)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" }}>
                            <div className={`avatar ${p.side === "for" ? "avatar-for" : "avatar-against"}`} style={{ width: "1.4rem", height: "1.4rem", fontSize: "0.62rem" }}>{p.username.charAt(0).toUpperCase()}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.78rem" }}>{p.username}</div>
                              <span className={`badge ${p.side === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize: "0.52rem" }}>{p.side === "for" ? "FOR" : "AGAINST"}</span>
                            </div>
                            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1rem", fontWeight: 900, color: score >= 70 ? "var(--for)" : score >= 40 ? "var(--cyan)" : "var(--against)" }}>{score}</div>
                          </div>
                          <input type="range" min={0} max={100} step={5} value={score} disabled={judgeSubmitted}
                            onChange={(e) => setJudgeScores((prev) => ({ ...prev, [p.userId]: Number(e.target.value) }))}
                            style={{ width: "100%", accentColor: "#a78bfa" }} />
                        </div>
                      );
                    })}
                  </div>
                  {!judgeSubmitted ? (
                    <button onClick={handleJudgeSubmit} className="btn-primary" style={{ width: "100%", padding: "0.55rem", fontSize: "0.82rem", fontWeight: 800, background: "linear-gradient(135deg,#7c3aed,#a78bfa)" }}>⚖️ Lock Scores →</button>
                  ) : (
                    <div style={{ padding: "0.5rem", background: "rgba(var(--for-rgb),0.1)", border: "1px solid rgba(var(--for-rgb),0.3)", borderRadius: "0.5rem", textAlign: "center", color: "var(--for)", fontWeight: 700, fontSize: "0.78rem" }}>✓ Scores locked — waiting for results…</div>
                  )}
                </div>

              ) : scoringSecsLeft !== null && !isJudge ? (

                /* ── NON-JUDGE SCORING WAIT SCREEN ── */
                <div style={{ textAlign: "center", padding: "0.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                  {/* Pulsing gavel icon */}
                  <div style={{ fontSize: "2rem", animation: "pulse 1.8s ease-in-out infinite" }}>⚖️</div>
                  <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#a78bfa" }}>Scoring in Progress</div>
                  <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--text)" }}>Judges are locking<br />their scores</div>
                  <p style={{ color: "var(--muted)", fontSize: "0.68rem", margin: 0, lineHeight: 1.5 }}>
                    Results will appear once<br />judges finalise their verdict
                  </p>
                  {/* Countdown ring */}
                  <div style={{ position: "relative", width: 56, height: 56, marginTop: "0.25rem" }}>
                    <svg viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}>
                      <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(167,139,250,0.12)" strokeWidth="5" />
                      <circle cx="28" cy="28" r="22" fill="none"
                        stroke="#a78bfa" strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 22}
                        strokeDashoffset={2 * Math.PI * 22 * (1 - scoringSecsLeft / 60)}
                        style={{ transition: "stroke-dashoffset 0.9s linear" }} />
                    </svg>
                    <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", fontWeight: 900, color: scoringSecsLeft <= 10 ? "var(--against)" : "#a78bfa" }}>
                      {scoringSecsLeft}
                    </span>
                  </div>
                </div>

              ) : finished ? (

                /* ── FINISHED ── */
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem" }}>🏆</div>
                  <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold)", margin: "0.25rem 0 0.1rem" }}>Debate Complete</div>
                  <p style={{ color: "var(--muted)", fontSize: "0.72rem", margin: 0 }}>Navigating to results…</p>
                </div>

              ) : isObserver && !showJudgePanel ? (

                /* ── OBSERVER BANNER ── */
                <div style={{ textAlign: "center", padding: "0.5rem" }}>
                  <div style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>{isJudge ? "⚖️" : "👁️"}</div>
                  <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.15rem" }}>
                    {isJudge ? "Judging" : "Spectating"}
                  </div>
                  <p style={{ color: "var(--muted)", fontSize: "0.7rem", margin: 0 }}>
                    {isJudge ? "Use the +/− buttons beside each debater to score as you watch" : "Watching live"}
                  </p>
                </div>

              ) : (

                /* ── RING STAGE ── */
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.375rem", width: "100%" }}>

                  {/* The ring with embedded center content */}
                  <div style={{ position: "relative", width: ringSize, height: ringSize, flexShrink: 0 }}>
                    <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                      <circle cx="100" cy="100" r={RING_R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                      <circle cx="100" cy="100" r={RING_R} fill="none"
                        stroke={stageRingColor} strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={RING_CIRC} strokeDashoffset={stageRingOffset}
                        style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }} />
                    </svg>

                    {/* Center content */}
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.15rem" }}>
                      {isBuzzer ? (
                        buzzerState?.currentHolder ? (
                          <>
                            <div style={{
                              width: 44, height: 44, borderRadius: "50%",
                              background: holderSide === "for"
                                ? "linear-gradient(135deg,rgba(var(--for-rgb),0.2),rgba(var(--for-rgb),0.38))"
                                : "linear-gradient(135deg,rgba(var(--against-rgb),0.2),rgba(var(--against-rgb),0.38))",
                              border: `2.5px solid ${holderIsUrgent ? "var(--against)" : (holderSide === "for" ? "var(--for)" : "var(--against)")}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "1.1rem", fontWeight: 900,
                              color: holderSide === "for" ? "var(--for)" : "var(--against)",
                              transition: "border-color 0.3s",
                            }}>
                              {holderUsername?.charAt(0).toUpperCase() ?? "?"}
                            </div>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.35rem", fontWeight: 800, lineHeight: 1, color: holderIsUrgent ? "var(--against)" : (holderSide === "for" ? "var(--for)" : "var(--against)"), transition: "color 0.3s" }}>
                              {holderSecsLeft ?? "—"}
                            </span>
                            <span style={{ fontSize: "0.46rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em" }}>SEC</span>
                          </>
                        ) : preparingSecsLeft !== null && preparingSecsLeft > 0 ? (
                          <>
                            <span style={{ fontSize: "1.1rem" }}>⏳</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.35rem", fontWeight: 800, color: "var(--gold)", lineHeight: 1 }}>{preparingSecsLeft}</span>
                            <span style={{ fontSize: "0.46rem", fontWeight: 700, color: "var(--gold)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Ready</span>
                          </>
                        ) : (
                          /* Mic grab button lives inside the ring */
                          <button
                            onClick={handleGrab} disabled={!canGrab}
                            className={canGrab ? "mic-grab-pulse" : ""}
                            style={{
                              width: 62, height: 62, borderRadius: "50%",
                              border: "none", cursor: canGrab ? "pointer" : "not-allowed",
                              background: canGrab
                                ? "linear-gradient(135deg,var(--blue),var(--violet))"
                                : "var(--surface2)",
                              color: canGrab ? "#fff" : "var(--muted)",
                              fontSize: "1.5rem",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              opacity: canGrab ? 1 : 0.4, transition: "all 0.2s",
                              boxShadow: canGrab ? "0 4px 22px rgba(var(--blue-rgb),0.45)" : "none",
                            }}
                          >🎙</button>
                        )
                      ) : (
                        /* Alternate mode */
                        turn ? (
                          <>
                            <div style={{
                              width: 44, height: 44, borderRadius: "50%",
                              background: turn.side === "for"
                                ? "linear-gradient(135deg,rgba(var(--for-rgb),0.2),rgba(var(--for-rgb),0.38))"
                                : "linear-gradient(135deg,rgba(var(--against-rgb),0.2),rgba(var(--against-rgb),0.38))",
                              border: `2.5px solid ${isUrgent ? "var(--against)" : (turn.side === "for" ? "var(--for)" : "var(--against)")}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "1.1rem", fontWeight: 900,
                              color: turn.side === "for" ? "var(--for)" : "var(--against)",
                            }}>
                              {turn.speakerUsername.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.35rem", fontWeight: 800, lineHeight: 1, color: isUrgent ? "var(--against)" : (turn.side === "for" ? "var(--for)" : "var(--against)") }}>
                              {secondsLeft ?? "—"}
                            </span>
                            <span style={{ fontSize: "0.46rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em" }}>SEC</span>
                          </>
                        ) : (
                          <div className="pulse-dot pulse-dot-cyan" style={{ width: 10, height: 10 }} />
                        )
                      )}
                    </div>
                  </div>

                  {/* Status text below ring */}
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.15rem", minHeight: "2rem" }}>
                    {isBuzzer ? (
                      buzzerState?.currentHolder ? (
                        <>
                          <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: holderSide === "for" ? "var(--for)" : "var(--against)" }}>
                            {isHolder ? "🎙 Your turn" : "🎙 Now speaking"}
                          </div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--text)" }}>
                            {holderUsername}{isHolder && <span style={{ fontSize: "0.65rem", color: "var(--cyan)", marginLeft: "0.3rem" }}>you</span>}
                          </div>
                          {holderSide && <span className={`badge ${holderSide === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize: "0.55rem" }}>{holderSide === "for" ? "FOR" : "AGAINST"}</span>}
                        </>
                      ) : preparingSecsLeft !== null && preparingSecsLeft > 0 ? (
                        <>
                          <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "var(--gold)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Get Ready</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Mic opens in {preparingSecsLeft}s</div>
                        </>
                      ) : buzzerState?.grabWindowOpen ? (
                        <>
                          <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cyan)" }}>⚡ Grab Window</div>
                          {grabWindowSecsLeft != null && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.85rem", fontWeight: 800, color: "var(--cyan)" }}>{grabWindowSecsLeft}s</div>}
                          {isOnCooldown && <div style={{ fontSize: "0.62rem", color: "var(--against)" }}>Cooldown: {cooldownSecsLeft}s</div>}
                          {isExcludedFromWindow && <div style={{ fontSize: "0.62rem", color: "var(--muted)" }}>You just spoke</div>}
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Waiting</div>
                          {isOnCooldown && <div style={{ fontSize: "0.62rem", color: "var(--against)" }}>Cooldown: {cooldownSecsLeft}s</div>}
                        </>
                      )
                    ) : (
                      turn ? (
                        <>
                          <div style={{ fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: turn.side === "for" ? "var(--for)" : "var(--against)" }}>
                            {isMyTurn ? "Your turn" : "Now speaking"}
                          </div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "var(--text)" }}>
                            {turn.speakerUsername}{isMyTurn && <span style={{ fontSize: "0.65rem", color: "var(--cyan)", marginLeft: "0.3rem" }}>you</span>}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: "0.68rem", color: "var(--muted)" }}>Waiting for next turn…</div>
                      )
                    )}
                    {(error || grabError) && (
                      <div style={{ fontSize: "0.65rem", color: "var(--against)", marginTop: "0.1rem" }}>⚠ {error || grabError}</div>
                    )}
                  </div>

                  {/* ── ENERGY STRIP ─────────────────────────────────────────── */}
                  {/* Waveform — visible when someone is actively speaking */}
                  {activeSpeakerUserId && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: 28, padding: "0 0.25rem" }}>
                      {[0.9, 0.5, 1, 0.7, 0.4, 0.85, 0.6, 1, 0.45, 0.75, 0.55, 0.9, 0.35].map((h, i) => {
                        const side = isBuzzer ? holderSide : turn?.side;
                        const color = side === "for" ? "var(--for)" : "var(--against)";
                        return (
                          <span key={i} className="waveform-bar" style={{
                            height: `${h * 100}%`, background: color,
                            opacity: 0.75,
                            "--bar-dur": `${0.6 + (i % 5) * 0.12}s`,
                            "--bar-delay": `${(i * 0.07) % 0.5}s`,
                          } as React.CSSProperties} />
                        );
                      })}
                    </div>
                  )}

                  {/* Speaking streak + live stats row */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", justifyContent: "center" }}>
                    {/* Round / turn count */}
                    {debate.rounds.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", padding: "0.12rem 0.4rem", borderRadius: "9999px", background: "rgba(var(--blue-rgb),0.07)", border: "1px solid rgba(var(--blue-rgb),0.15)" }}>
                        <span style={{ fontSize: "0.52rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Rounds</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", fontWeight: 900, color: "var(--blue)" }}>{debate.rounds.length}</span>
                      </div>
                    )}
                    {/* Streak — if active speaker has spoken 2+ times */}
                    {(() => {
                      const speakerId = activeSpeakerUserId;
                      if (!speakerId) return null;
                      const streak = isBuzzer
                        ? (buzzerState?.speakHistory.filter(id => id === speakerId).length ?? 0)
                        : debate.rounds.filter(r => r.speakerId === speakerId).length;
                      if (streak < 2) return null;
                      return (
                        <div className="streak-glow" style={{ display: "flex", alignItems: "center", gap: "0.2rem", padding: "0.12rem 0.4rem", borderRadius: "9999px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                          <span style={{ fontSize: "0.65rem" }}>🔥</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 900, color: "var(--gold)" }}>{streak}× streak</span>
                        </div>
                      );
                    })()}
                    {/* Judge evaluating indicator — shown after argument submitted while judges are present */}
                    {debate.rounds.length > 0 && judgeMembers.length > 0 && !finished && !showJudgePanel && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.12rem 0.4rem", borderRadius: "9999px", background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }}>
                        <div className="pulse-dot pulse-dot-cyan" style={{ width: 6, height: 6 }} />
                        <span style={{ fontSize: "0.52rem", fontWeight: 700, color: "#a78bfa", letterSpacing: "0.06em" }}>Judge watching</span>
                      </div>
                    )}
                    {/* AI evaluation indicator — shown briefly after a round is submitted */}
                    {isUploading && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.12rem 0.4rem", borderRadius: "9999px", background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)" }}>
                        <div className="pulse-dot pulse-dot-cyan" style={{ width: 6, height: 6 }} />
                        <span style={{ fontSize: "0.52rem", fontWeight: 700, color: "var(--cyan)", letterSpacing: "0.06em" }}>AI evaluating…</span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                    {isHolder && (
                      <button onClick={handleBuzzerRelease} disabled={isUploading} className="btn-danger" style={{ padding: "0.4rem 0.875rem", fontSize: "0.78rem" }}>
                        {isUploading ? "Transcribing…" : "🎙 Release"}
                      </button>
                    )}
                    {isBuzzer && !isHolder && !isObserver && (holderIsUrgent || holderUrgentAll) && buzzerState?.currentHolder && (
                      <button onClick={handleGrab} disabled={!canGrab} className={canGrab ? "mic-grab-pulse" : ""} style={{
                        padding: "0.3rem 0.65rem", fontSize: "0.68rem", borderRadius: "2rem",
                        border: "none", cursor: canGrab ? "pointer" : "not-allowed",
                        background: canGrab ? "linear-gradient(135deg,var(--blue),var(--violet))" : "var(--surface2)",
                        color: canGrab ? "#fff" : "var(--muted)", fontWeight: 700,
                        opacity: canGrab ? 1 : 0.5,
                      }}>
                        🎙 Standby · {holderSecsLeft}s
                      </button>
                    )}
                    {isMyTurn && (
                      <button onClick={() => handleSubmit()} disabled={isUploading} className="btn-primary" style={{ padding: "0.4rem 0.875rem", fontSize: "0.78rem" }}>
                        {isUploading ? "Transcribing…" : "Done → Submit"}
                      </button>
                    )}
                  </div>

                  {/* Mic active / live captions strip */}
                  {(isHolder || isMyTurn) && (
                    noLiveCaptions ? (
                      <MicActiveStrip elapsed={recorder.elapsed} isUploading={isUploading} />
                    ) : (
                      <div style={{ width: "100%", maxWidth: 340, padding: "0.45rem 0.625rem", borderRadius: "0.5rem", background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.2rem" }}>
                          <div className="pulse-dot pulse-dot-cyan" />
                          <span style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--cyan)" }}>Live captions</span>
                        </div>
                        <p style={{ color: "var(--text)", fontSize: "0.75rem", margin: 0, lineHeight: 1.4 }}>
                          {sr.transcript || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Listening…</span>}
                          {sr.interim && <span style={{ color: "var(--muted)", fontStyle: "italic" }}> {sr.interim}</span>}
                        </p>
                        <div ref={captionsEndRef} />
                      </div>
                    )
                  )}

                </div>
              )}
            </div>

            {/* AGAINST panel (desktop) */}
            {!isMobile && (
              <div className="glass" style={{
                borderRadius: "0.75rem", padding: "0.5rem 0.3rem",
                display: "flex", flexDirection: "column", gap: "0.1rem", overflow: "hidden",
                background: "rgba(var(--against-rgb),0.04)", border: "1px solid rgba(var(--against-rgb),0.18)",
              }}>
                <div style={{ fontSize: "0.52rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--against)", textAlign: "center", marginBottom: "0.25rem" }}>AGAINST</div>
                {againstParticipants.map((p) => <SideCard key={p.userId} p={p} />)}
              </div>
            )}
          </div>

          {/* ── MOBILE: FOR + AGAINST mini row ── */}
          {isMobile && (
            <div style={{ flexShrink: 0, display: "flex", gap: "0.4rem" }}>
              <div className="glass" style={{ flex: 1, borderRadius: "0.5rem", padding: "0.35rem 0.5rem", display: "flex", gap: "0.3rem", alignItems: "center", background: "rgba(var(--for-rgb),0.04)", border: "1px solid rgba(var(--for-rgb),0.15)" }}>
                <span style={{ fontSize: "0.48rem", fontWeight: 800, color: "var(--for)", letterSpacing: "0.1em", flexShrink: 0, writingMode: "vertical-rl", transform: "rotate(180deg)" }}>FOR</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {forParticipants.map((p) => {
                    const isActive = p.userId === activeSpeakerUserId;
                    return (
                      <div key={p.userId} className={isActive ? "avatar-speaking-for" : ""} style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(var(--for-rgb),0.2)", border: `1.5px solid ${isActive ? "var(--for)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 900, color: "var(--for)" }}>
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="glass" style={{ flex: 1, borderRadius: "0.5rem", padding: "0.35rem 0.5rem", display: "flex", gap: "0.3rem", alignItems: "center", justifyContent: "flex-end", background: "rgba(var(--against-rgb),0.04)", border: "1px solid rgba(var(--against-rgb),0.15)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", justifyContent: "flex-end" }}>
                  {againstParticipants.map((p) => {
                    const isActive = p.userId === activeSpeakerUserId;
                    return (
                      <div key={p.userId} className={isActive ? "avatar-speaking-against" : ""} style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(var(--against-rgb),0.2)", border: `1.5px solid ${isActive ? "var(--against)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 900, color: "var(--against)" }}>
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontSize: "0.48rem", fontWeight: 800, color: "var(--against)", letterSpacing: "0.1em", flexShrink: 0, writingMode: "vertical-rl" }}>AGN</span>
              </div>
            </div>
          )}

          {/* ── OBSERVERS STRIP (judges + spectators) ── */}
          {showObservers && (
            <div className="glass" style={{
              flexShrink: 0, borderRadius: "0.625rem", padding: "0.3rem 0.75rem",
              display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden",
              background: "rgba(107,114,128,0.03)", border: "1px solid var(--border)",
            }}>
              {/* Judges */}
              {mockJudges.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#a78bfa", flexShrink: 0 }}>⚖️ Judges</span>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    {mockJudges.map((m) => <ObserverChip key={m.userId} member={m} isJudgeMember />)}
                  </div>
                </div>
              )}
              {mockJudges.length > 0 && mockSpectators.length > 0 && (
                <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />
              )}
              {/* Spectators */}
              {mockSpectators.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <span style={{ fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", flexShrink: 0 }}>👁 Spectators</span>
                  <div style={{ display: "flex", gap: "0.25rem", overflow: "hidden" }}>
                    {mockSpectators.map((m) => <ObserverChip key={m.userId} member={m} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TRANSCRIPT ── */}
          <div className="glass" style={{
            flex: "0 1 160px", minHeight: 80, overflow: "hidden",
            display: "flex", flexDirection: "column",
            borderRadius: "0.875rem", padding: "0.5rem 0.75rem",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem", flexShrink: 0 }}>
              <span style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)" }}>Transcript</span>
              <span style={{ fontSize: "0.58rem", color: "var(--muted)" }}>{debate.rounds.length} arg{debate.rounds.length !== 1 ? "s" : ""}</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              {!isBuzzer && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "var(--muted)" }}>
                  {debate.rounds.length}/{debate.turnOrder.length * debate.totalRounds}
                </span>
              )}
            </div>
            {!isBuzzer && (
              <div className="score-bar-track" style={{ flexShrink: 0, marginBottom: "0.4rem" }}>
                <div className="score-bar-fill" style={{ width: `${debate.turnOrder.length * debate.totalRounds > 0 ? (debate.rounds.length / (debate.turnOrder.length * debate.totalRounds)) * 100 : 0}%` }} />
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {debate.rounds.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: "0.72rem", textAlign: "center", margin: "0.5rem 0", fontStyle: "italic" }}>
                  Arguments appear here as speakers finish.
                </p>
              ) : (
                debate.rounds.map((r: Round, i: number) => (
                  <div key={i} style={{
                    padding: "0.4rem 0.5rem", borderRadius: "0.4rem", flexShrink: 0,
                    background: r.side === "for" ? "rgba(var(--for-rgb),0.06)" : "rgba(var(--against-rgb),0.06)",
                    border: `1px solid ${r.side === "for" ? "rgba(var(--for-rgb),0.16)" : "rgba(var(--against-rgb),0.16)"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.2rem" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem", color: "var(--muted)" }}>#{r.roundNumber}</span>
                      <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.7rem" }}>{r.speakerUsername}</span>
                      <span className={`badge ${r.side === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize: "0.5rem", marginLeft: "auto" }}>{r.side === "for" ? "FOR" : "AGN"}</span>
                    </div>
                    <p style={{ color: r.argument ? "var(--text)" : "var(--muted)", fontSize: "0.72rem", margin: 0, lineHeight: 1.4, fontStyle: r.argument ? "normal" : "italic" }}>
                      {r.argument || "(no transcript captured)"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </InAppBrowserGate>
  );
}
