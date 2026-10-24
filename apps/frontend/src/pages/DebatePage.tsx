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
import { RoomHeader, type RoomStatusTone } from "../components/RoomHeader";
import { Icon } from "../components/Icon";
import { initials } from "../components/AppShell";
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

// ── Board helpers ────────────────────────────────────────────────────────────
// Judge purple is the judge role colour across the app (kept as-is).
const JUDGE      = "var(--ds-judge)";
const JUDGE_SOFT = "rgba(var(--ds-judge-rgb),0.14)";
const JUDGE_LINE = "rgba(var(--ds-judge-rgb),0.35)";

type Side = "for" | "against";
const sideLabel = (s: Side) => (s === "for" ? "FOR" : "AGAINST");
const sideText  = (s: Side) => (s === "for" ? "var(--ds-for-text)" : "var(--ds-against-text)");
const sideMid   = (s: Side) => (s === "for" ? "var(--ds-for-mid)" : "var(--ds-against-mid)");
const sideBg    = (s: Side) => (s === "for" ? "var(--ds-for-bg)" : "var(--ds-against-bg)");
const sideLine  = (s: Side) => (s === "for" ? "var(--ds-for-line)" : "var(--ds-against-line)");

/** 75 → "1:15" */
const fmtClock = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Judge score colour bands: strong / middling / weak */
const scoreColor = (score: number) =>
  score >= 70 ? "var(--ds-for-text)" : score >= 40 ? "var(--ds-text)" : "var(--ds-against-text)";

// Static voice-level silhouette (px of a 48px box) — animated with .waveform-bar
const WAVE = [10, 18, 26, 34, 40, 30, 22, 36, 44, 38, 28, 20, 30, 42, 46, 36, 26, 18, 28, 38, 32, 24, 16, 22, 30, 20, 12, 8];

const eyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ds-muted)" };
const panel: React.CSSProperties   = { background: "var(--ds-panel)", border: "1px solid var(--ds-border)", boxSizing: "border-box", minWidth: 0 };

function StagePill({ tone, children }: { tone: "primary" | "for" | "against" | "gold" | "neutral"; children: React.ReactNode }) {
  const look: Record<typeof tone, React.CSSProperties> = {
    primary: { background: "var(--ds-primary-fill)", color: "var(--ds-on-primary)" },
    for:     { background: "var(--ds-for-bg)",       color: "var(--ds-for-text)" },
    against: { background: "var(--ds-against-bg)",   color: "var(--ds-against-text)" },
    gold:    { background: "var(--ds-gold-bg)",      color: "var(--ds-gold-text)" },
    neutral: { background: "var(--ds-neutral-bg)",   color: "var(--ds-neutral-text)" },
  };
  return (
    <span style={{ height: 28, padding: "0 12px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", ...look[tone] }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />
      {children}
    </span>
  );
}

// ── Mic-active strip (shown on Android / iOS instead of live captions) ────────
function MicActiveStrip({ elapsed, isUploading }: { elapsed: number; isUploading: boolean }) {
  return (
    <div style={{ width: "100%", maxWidth: 640, boxSizing: "border-box", padding: "16px 18px", borderRadius: 18, background: isUploading ? "var(--ds-gold-bg)" : "var(--ds-against-bg)", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
      {isUploading ? (
        <>
          <span style={{ color: "var(--ds-gold-text)", display: "flex", flexShrink: 0 }}><Icon name="timer" size={20} /></span>
          <div>
            <div style={{ ...eyebrow, color: "var(--ds-gold-text)" }}>Processing</div>
            <div style={{ fontSize: 14, color: "var(--ds-text3)", marginTop: 2 }}>Transcribing your argument…</div>
          </div>
        </>
      ) : (
        <>
          <div className="pulse-dot pulse-dot-red" style={{ flexShrink: 0, width: 12, height: 12 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...eyebrow, color: "var(--ds-against-text)" }}>Mic Active — you're being recorded</div>
            <div style={{ fontSize: 14, color: "var(--ds-text3)", marginTop: 2 }}>
              Your argument will be transcribed when you submit
              {elapsed > 0 && <> · <span className="ds-mono" style={{ fontWeight: 700, color: "var(--ds-text)" }}>{elapsed}s</span> captured</>}
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
  // Below 1200px the three-column board drops its right column under the stage.
  const isCompact          = useIsMobile(1200);

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
      <div style={{ minHeight: "100vh", boxSizing: "border-box", padding: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--ds-bg)", color: "var(--ds-text)" }}>
        <div className="ds-card" style={{ padding: 32, width: "100%", maxWidth: 400, boxSizing: "border-box", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
          <span style={{ width: 48, height: 48, borderRadius: 16, background: "var(--ds-against-bg)", color: "var(--ds-against-text)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="info" size={22} /></span>
          <p style={{ margin: 0, fontSize: 15, color: "var(--ds-against-text)" }}>{error}</p>
          <button type="button" onClick={() => navigate("/")} className="ds-btn ds-btn-secondary">Back to Home</button>
        </div>
      </div>
    );
  }
  if (!debate) {
    return (
      <div style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--ds-bg)" }}>
        <img src="/logo/brand/argumint-app-icon-dark.svg" alt="Loading…" className="logo-heartbeat" style={{ width: 72, height: 72 }} />
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

  // Preview mock observers (shown when isPreview and no real presence data)
  const mockJudges: { userId: string; username: string; role: string }[] =
    isPreview && judgeMembers.length === 0
      ? [{ userId: "mj1", username: "Justice", role: "judge" }, { userId: "mj2", username: "Arbiter", role: "judge" }]
      : judgeMembers;
  const mockSpectators: { userId: string; username: string; role: string }[] =
    isPreview && spectatorMembers.length === 0
      ? [{ userId: "ms1", username: "Viewer1", role: "spectator" }, { userId: "ms2", username: "Viewer2", role: "spectator" }, { userId: "ms3", username: "Crowd3", role: "spectator" }]
      : spectatorMembers;

  // ── Turn bookkeeping ──────────────────────────────────────────────────────
  // Alternate turns walk turnOrder in sequence each round (server: buildTurn).
  const turnIdx = turn
    ? (typeof turn.turnIndex === "number" ? turn.turnIndex : debate.turnOrder.findIndex((t) => t.userId === turn.speakerId))
    : -1;
  const nextIdx = turn && !finished
    ? (turnIdx + 1 < debate.turnOrder.length ? turnIdx + 1 : (turn.roundNumber < debate.totalRounds ? 0 : -1))
    : -1;

  const speakCountFor = (userId: string) => isBuzzer
    ? (buzzerState?.speakHistory.filter((id) => id === userId).length ?? 0)
    : debate.rounds.filter((r) => r.speakerId === userId).length;

  // Buzzer floor time = seconds used in finished turns (+ the live turn for the holder)
  const floorSecsFor = (userId: string) =>
    debate.rounds.filter((r) => r.speakerId === userId).reduce((sum, r) => sum + (r.durationSeconds || 0), 0) +
    (isBuzzer && buzzerState?.currentHolder === userId ? holderSecsElapsed : 0);
  const maxFloorSecs = Math.max(1, ...debate.turnOrder.map((p) => floorSecsFor(p.userId)));

  const cooldownSecsFor = (userId: string) => {
    const cd = isBuzzer ? buzzerState?.cooldowns.find((c) => c.userId === userId) : null;
    return cd && new Date(cd.unlocksAt) > nowDate ? Math.ceil((new Date(cd.unlocksAt).getTime() - now) / 1000) : 0;
  };

  const usernameOf = (userId: string | null | undefined) =>
    userId ? debate.turnOrder.find((t) => t.userId === userId)?.username ?? null : null;

  // ── Header status pill ────────────────────────────────────────────────────
  const headerStatus: { label: string; tone: RoomStatusTone } = (() => {
    if ((showJudgePanel && isJudge) || scoringSecsLeft !== null) return { label: "Scoring window", tone: "accent" };
    if (finished) return { label: "Finished", tone: "neutral" };
    if (isBuzzer) {
      if (buzzerState?.currentHolder) return { label: `Buzzer · ${debate.rounds.length} turns`, tone: "live" };
      if (buzzerState?.grabWindowOpen) return { label: "Buzzer · Floor open", tone: "for" };
      return { label: `Buzzer · ${debate.rounds.length} turns`, tone: "accent" };
    }
    if (turn) return { label: `Round ${turn.roundNumber} of ${debate.totalRounds} · Live`, tone: "accent" };
    return { label: "Between turns", tone: "neutral" };
  })();

  // Role / side / mode chips + host controls (header row on desktop, second row on mobile)
  const headerChips = (
    <>
      {mySide && !isObserver && (
        <span className={`ds-chip ds-chip-${mySide}`}>You · {sideLabel(mySide)}</span>
      )}
      {isObserver && (
        <span className="ds-chip" style={isJudge ? { background: JUDGE_SOFT, color: JUDGE } : { background: "var(--ds-neutral-bg)", color: "var(--ds-neutral-text)" }}>
          <Icon name={isJudge ? "scale" : "eye"} size={14} />{isJudge ? "Judge" : "Spectator"}
        </span>
      )}
      {(isMobile || !isCompact) && (
        <span className="ds-chip ds-chip-neutral">{debate.turnDuration}s {isBuzzer ? "per grab" : "per turn"}</span>
      )}
      <span
        role="img"
        aria-label={(isConnected || isPreview) ? "Connected" : "Disconnected"}
        className={(isConnected || isPreview) ? "pulse-dot pulse-dot-green" : "pulse-dot pulse-dot-red"}
        style={{ flexShrink: 0 }}
      />
      {isBuzzer && isHost && !finished && (
        <button type="button" onClick={handleHostEnd} className="ds-btn ds-btn-danger ds-btn-sm" style={{ height: 36, padding: "0 12px", fontSize: 13 }}>
          <Icon name="flag" size={16} />End debate
        </button>
      )}
    </>
  );

  // ── Small render helpers (plain functions, not components, so the 250 ms
  //    clock tick doesn't remount them and steal focus) ──────────────────────
  const avatarBox = (name: string, size: number, radius: number, bg = "var(--ds-raised)", extraClass?: string) => (
    <span className={extraClass} style={{ width: size, height: size, borderRadius: radius, background: bg, color: "var(--ds-text)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size >= 44 ? 14 : 12, fontWeight: 700 }}>
      {initials(name)}
    </span>
  );

  const stepBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 8, border: "1px solid var(--ds-border2)", background: "var(--ds-raised)",
    color: "var(--ds-text)", fontSize: 14, lineHeight: 1, cursor: "pointer", padding: 0, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
  };

  // Inline judge score — visible to judges throughout the debate
  const judgeStepper = (p: { userId: string; username: string }) => {
    const score = judgeScores[p.userId] ?? 50;
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <button type="button" aria-label={`Lower ${p.username}'s score`} style={stepBtn} disabled={judgeSubmitted}
          onClick={() => setJudgeScores(prev => ({ ...prev, [p.userId]: Math.max(0, (prev[p.userId] ?? 50) - 5) }))}>−</button>
        <span className="ds-mono" style={{ minWidth: 26, textAlign: "center", fontSize: 13, fontWeight: 700, color: scoreColor(score) }}>{score}</span>
        <button type="button" aria-label={`Raise ${p.username}'s score`} style={stepBtn} disabled={judgeSubmitted}
          onClick={() => setJudgeScores(prev => ({ ...prev, [p.userId]: Math.min(100, (prev[p.userId] ?? 50) + 5) }))}>+</button>
      </span>
    );
  };

  // Alternate mode — one debater row inside the FOR / AGAINST team card
  const teamRow = (p: { userId: string; username: string; side: Side }) => {
    const isActive = p.userId === activeSpeakerUserId;
    const isYou    = p.userId === user?.id;
    const spoke    = speakCountFor(p.userId);
    const isNext   = nextIdx >= 0 && debate.turnOrder[nextIdx]?.userId === p.userId;
    const sub = isActive ? "Speaking now"
      : isNext ? "Up next"
      : spoke > 0 ? `Spoke · ${spoke} turn${spoke !== 1 ? "s" : ""}`
      : "Waiting";
    return (
      <div key={p.userId} style={{
        display: "flex", alignItems: "center", gap: 10, minHeight: 52, padding: "8px 10px", borderRadius: 14, boxSizing: "border-box",
        background: isActive ? "var(--ds-accent-soft)" : "var(--ds-panel)",
        border: `1px solid ${isActive ? "var(--ds-accent-line)" : "transparent"}`,
        transition: "background 0.3s, border-color 0.3s",
      }}>
        {avatarBox(p.username, 34, 11, "var(--ds-raised)", isActive ? `avatar-speaking-${p.side}` : undefined)}
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.username}{isYou && " (you)"}</span>
          <span style={{ fontSize: 12, color: isActive ? "var(--ds-accent)" : isNext ? sideText(p.side) : "var(--ds-muted)" }}>{sub}</span>
        </span>
        {isJudge && judgeStepper(p)}
        <span style={{ color: isActive ? sideText(p.side) : "var(--ds-faint)", display: "flex", flexShrink: 0 }}>
          <Icon name={isActive ? "mic" : "micoff"} size={16} />
        </span>
      </div>
    );
  };

  const teamCard = (side: Side, members: typeof debate.turnOrder) => (
    <div style={{ padding: 16, borderRadius: 20, background: sideBg(side), border: `1px solid ${sideLine(side)}`, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: sideText(side) }}>
        {sideLabel(side)}<span className="ds-mono" style={{ letterSpacing: 0 }}>{members.length}</span>
      </span>
      {members.map((p) => teamRow(p))}
    </div>
  );

  // Judges + spectators in the room (plus the AI judge, which scores every debate)
  const observerChip = (m: { userId: string; username: string }, isJudgeMember: boolean) => (
    <span key={m.userId} className="ds-chip" style={{
      maxWidth: 150, paddingLeft: 4,
      background: isJudgeMember ? JUDGE_SOFT : "var(--ds-neutral-bg)",
      color: isJudgeMember ? JUDGE : "var(--ds-neutral-text)",
    }}>
      <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, background: "var(--ds-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>{initials(m.username)}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.username}</span>
    </span>
  );

  const observersCard = (
    <div style={{ ...panel, padding: "14px 16px", borderRadius: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ds-muted)" }}>
        <span style={{ color: JUDGE, display: "flex", flexShrink: 0 }}><Icon name="scale" size={16} /></span>
        <span>{mockJudges.length > 0
          ? `AI judge + ${mockJudges.length} human judge${mockJudges.length !== 1 ? "s" : ""} listening`
          : "AI judge listening"}</span>
      </span>
      {mockJudges.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...eyebrow, fontSize: 11, color: JUDGE }}>Judges</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{mockJudges.map((m) => observerChip(m, true))}</div>
        </div>
      )}
      {mockSpectators.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...eyebrow, fontSize: 11 }}>Spectators</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{mockSpectators.map((m) => observerChip(m, false))}</div>
        </div>
      )}
    </div>
  );

  // Countdown ring used for the alternate turn and the buzzer holder
  const timerRing = (secs: number | null, total: number, color: string, urgent: boolean, label: string) => {
    const size = isMobile ? 170 : 220;
    const C    = 2 * Math.PI * 45;
    const pct  = secs !== null && total > 0 ? Math.min(1, secs / total) : 0;
    return (
      <div role="timer" aria-label={label} style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--ds-track)" strokeWidth="5" />
          <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }} />
        </svg>
        <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <span className="ds-mono" style={{ fontWeight: 600, fontSize: isMobile ? 44 : 56, letterSpacing: "-0.02em", color: urgent ? "var(--ds-against-text)" : "var(--ds-text)", transition: "color 0.3s" }}>
            {secs !== null ? fmtClock(secs) : "—"}
          </span>
          <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>of {fmtClock(total)}</span>
        </span>
      </div>
    );
  };

  // Waveform — visible when someone is actively speaking
  const waveform = (side: Side | null | undefined) => (
    <div role="img" aria-label="Speaker voice level" style={{ width: "100%", maxWidth: 420, height: 48, display: "grid", gridTemplateColumns: `repeat(${WAVE.length}, minmax(0, 1fr))`, gap: 3, alignItems: "center" }}>
      {WAVE.map((h, i) => (
        <span key={i} className="waveform-bar" style={{
          width: "100%", height: h, borderRadius: 3, transformOrigin: "center",
          background: side ? sideMid(side) : "var(--ds-mid)",
          "--bar-dur": `${0.6 + (i % 5) * 0.12}s`,
          "--bar-delay": `${(i * 0.07) % 0.5}s`,
        } as React.CSSProperties} />
      ))}
    </div>
  );

  // Mic active / live captions — only for the person currently speaking
  const liveCaptions = (isHolder || isMyTurn) && (
    noLiveCaptions ? (
      <MicActiveStrip elapsed={recorder.elapsed} isUploading={isUploading} />
    ) : (
      <div style={{ width: "100%", maxWidth: 640, boxSizing: "border-box", padding: "16px 18px", borderRadius: 18, background: "var(--ds-raised)", display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
        <span style={{ ...eyebrow, display: "flex", alignItems: "center", gap: 8 }}><Icon name="message" size={14} />Live transcript</span>
        <p style={{ margin: 0, fontSize: isMobile ? 15 : 17, lineHeight: 1.55, color: "var(--ds-text3)" }}>
          {sr.transcript || <span style={{ color: "var(--ds-faint)", fontStyle: "italic" }}>Listening…</span>}
          {sr.interim && <span style={{ color: "var(--ds-text)", fontWeight: 600 }}> {sr.interim}</span>}
          <span aria-hidden="true" style={{ display: "inline-block", width: 2, height: "1em", marginLeft: 2, verticalAlign: -2, background: "var(--ds-accent-mid)" }} />
        </p>
        <div ref={captionsEndRef} />
      </div>
    )
  );

  // Rounds / streak / judge watching / AI evaluating
  const streak = activeSpeakerUserId ? speakCountFor(activeSpeakerUserId) : 0;
  const liveStats = (
    debate.rounds.length > 0 || streak >= 2 || isUploading
  ) && (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
      {debate.rounds.length > 0 && (
        <span className="ds-chip ds-chip-neutral">Rounds <span className="ds-mono" style={{ color: "var(--ds-text)" }}>{debate.rounds.length}</span></span>
      )}
      {/* Streak — if active speaker has spoken 2+ times */}
      {streak >= 2 && (
        <span className="ds-chip ds-chip-gold streak-glow"><Icon name="bolt" size={14} /><span className="ds-mono">{streak}× streak</span></span>
      )}
      {/* Judge evaluating indicator — shown after argument submitted while judges are present */}
      {debate.rounds.length > 0 && judgeMembers.length > 0 && !finished && !showJudgePanel && (
        <span className="ds-chip" style={{ background: JUDGE_SOFT, color: JUDGE }}><Icon name="eye" size={14} />Judge watching</span>
      )}
      {/* AI evaluation indicator — shown briefly after a round is submitted */}
      {isUploading && (
        <span className="ds-chip ds-chip-accent"><span className="pulse-dot pulse-dot-cyan" style={{ width: 6, height: 6 }} />AI evaluating…</span>
      )}
    </div>
  );

  const errorLine = (error || grabError) && (
    <div role="alert" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ds-against-text)" }}>
      <Icon name="info" size={14} />{error || grabError}
    </div>
  );

  const bigBtn: React.CSSProperties = { flex: 1, height: 56, borderRadius: 16, fontSize: 16 };

  // Spectator / judge banner on top of the live stage
  const observerBanner = isObserver && (
    <div style={{ width: "100%", maxWidth: 640, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 16, textAlign: "left", background: isJudge ? JUDGE_SOFT : "var(--ds-neutral-bg)", border: `1px solid ${isJudge ? JUDGE_LINE : "var(--ds-neutral-line)"}` }}>
      <span style={{ color: isJudge ? JUDGE : "var(--ds-neutral-text)", display: "flex", flexShrink: 0 }}><Icon name={isJudge ? "scale" : "eye"} size={20} /></span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{isJudge ? "Judging" : "Spectating"}</span>
        <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>
          {isJudge ? "Use the +/− buttons beside each debater to score as you watch" : "Watching live"}
        </span>
      </span>
    </div>
  );

  // ── Stage: non-judge scoring wait / finished ──────────────────────────────
  const scoringWait = scoringSecsLeft !== null && (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 0" }}>
      <span style={{ width: 64, height: 64, borderRadius: 20, background: JUDGE_SOFT, color: JUDGE, display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse-dot 1.8s ease-in-out infinite" }}><Icon name="scale" size={30} /></span>
      <span style={{ ...eyebrow, color: JUDGE }}>Scoring in Progress</span>
      <h2 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 20 : 28, letterSpacing: "-0.02em" }}>Judges are locking their scores</h2>
      <p style={{ margin: 0, fontSize: 15, color: "var(--ds-muted)" }}>Results will appear once judges finalise their verdict</p>
      {/* Countdown ring */}
      <div role="timer" aria-label={`${scoringSecsLeft} seconds until scores lock`} style={{ position: "relative", width: 96, height: 96, marginTop: 8 }}>
        <svg viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }} aria-hidden="true">
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--ds-track)" strokeWidth="4" />
          <circle cx="28" cy="28" r="22" fill="none" stroke={JUDGE} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 22}
            strokeDashoffset={2 * Math.PI * 22 * (1 - scoringSecsLeft / 60)}
            style={{ transition: "stroke-dashoffset 0.9s linear" }} />
        </svg>
        <span className="ds-mono" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600, color: scoringSecsLeft <= 10 ? "var(--ds-against-text)" : JUDGE }}>
          {scoringSecsLeft}
        </span>
      </div>
    </div>
  );

  const finishedPanel = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "12px 0" }}>
      <span style={{ width: 64, height: 64, borderRadius: 20, background: "var(--ds-gold-bg)", color: "var(--ds-gold-text)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="trophy" size={30} /></span>
      <h2 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 20 : 28, letterSpacing: "-0.02em" }}>Debate Complete</h2>
      <p style={{ margin: 0, fontSize: 15, color: "var(--ds-muted)" }}>Navigating to results…</p>
    </div>
  );

  // ── Stage: alternate mode ─────────────────────────────────────────────────
  const alternateStage = turn ? (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {isMyTurn
          ? <StagePill tone="primary">You're on</StagePill>
          : <StagePill tone={turn.side}>Now speaking</StagePill>}
        <span style={{ fontSize: 15, color: "var(--ds-text3)" }}>
          {turn.speakerUsername}{isMyTurn && " (you)"} · {sideLabel(turn.side)} · Round {turn.roundNumber}, turn {turnIdx + 1} of {debate.turnOrder.length}
        </span>
      </div>
      {timerRing(secondsLeft, turnDuration, isUrgent ? "var(--ds-against-mid)" : sideMid(turn.side), isUrgent,
        `${secondsLeft ?? 0} seconds left in ${isMyTurn ? "your" : `${turn.speakerUsername}'s`} turn`)}
      {waveform(turn.side)}
    </>
  ) : (
    <>
      <StagePill tone="neutral">Waiting</StagePill>
      <div style={{ width: isMobile ? 170 : 220, height: isMobile ? 170 : 220, borderRadius: "50%", border: "5px solid var(--ds-track)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="pulse-dot pulse-dot-cyan" style={{ width: 10, height: 10 }} />
      </div>
      <span style={{ fontSize: 15, color: "var(--ds-muted)" }}>Waiting for next turn…</span>
    </>
  );

  // ── Stage: buzzer mode ────────────────────────────────────────────────────
  const buzzerCircle = isMobile ? 260 : 340;
  const buzzerButton = isMobile ? 196 : 252;
  const lastSpeakerName = buzzerState?.lastSpeaker === user?.id ? "You" : usernameOf(buzzerState?.lastSpeaker);
  const isPreparing = preparingSecsLeft !== null && preparingSecsLeft > 0;

  const buzzerStage = buzzerState?.currentHolder ? (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {isHolder
          ? <StagePill tone="primary">You're on</StagePill>
          : <StagePill tone={holderSide ?? "neutral"}>Now speaking</StagePill>}
        <span style={{ fontSize: 15, color: "var(--ds-text3)" }}>
          {holderUsername}{isHolder && " (you)"}{holderSide && ` · ${sideLabel(holderSide)}`}
        </span>
      </div>
      {timerRing(holderSecsLeft, debate.turnDuration ?? 60,
        holderIsUrgent ? "var(--ds-against-mid)" : holderSide ? sideMid(holderSide) : "var(--ds-accent-mid)", holderIsUrgent,
        `${holderSecsLeft ?? 0} seconds left on the floor`)}
      {waveform(holderSide)}
    </>
  ) : isPreparing ? (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <StagePill tone="gold">Get Ready</StagePill>
        <h2 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 20 : 28, letterSpacing: "-0.02em" }}>Mic opens in {preparingSecsLeft}s</h2>
        <span style={{ fontSize: 15, color: "var(--ds-muted)" }}>Get set — the re-grab window opens next.</span>
      </div>
      <div role="timer" aria-label={`Mic opens in ${preparingSecsLeft} seconds`} style={{ position: "relative", width: buzzerCircle, height: buzzerCircle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px dashed var(--ds-gold-line)" }} />
        <span aria-hidden="true" style={{ position: "absolute", inset: isMobile ? 18 : 24, borderRadius: "50%", background: "var(--ds-gold-bg)" }} />
        <span style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: "var(--ds-gold-text)" }}>
          <span className="ds-mono" style={{ fontSize: isMobile ? 56 : 72, fontWeight: 600, lineHeight: 1 }}>{preparingSecsLeft}</span>
          <span style={{ ...eyebrow, color: "inherit" }}>Ready</span>
        </span>
      </div>
    </>
  ) : (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {buzzerState?.grabWindowOpen
          ? <StagePill tone="for">Floor open</StagePill>
          : <StagePill tone="neutral">Waiting</StagePill>}
        <h2 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 20 : 28, letterSpacing: "-0.02em" }}>
          {buzzerState?.grabWindowOpen
            ? (lastSpeakerName ? `${lastSpeakerName} released the mic` : "The floor is open")
            : "The floor is free"}
        </h2>
        <span style={{ fontSize: 15, color: "var(--ds-muted)" }}>
          {buzzerState?.grabWindowOpen
            ? "Re-grab window is open. First to buzz takes the floor."
            : isObserver ? "Waiting for a debater to take the floor." : "Grab the mic to take the floor."}
        </span>
      </div>
      <div style={{ position: "relative", width: buzzerCircle, height: buzzerCircle, maxWidth: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px dashed ${canGrab ? "var(--ds-accent-line)" : "var(--ds-border2)"}` }} />
        <span aria-hidden="true" style={{ position: "absolute", inset: isMobile ? 18 : 24, borderRadius: "50%", background: canGrab ? "var(--ds-accent-soft)" : "var(--ds-raised)" }} />
        {isObserver ? (
          <span style={{ position: "relative", width: buzzerButton, height: buzzerButton, borderRadius: "50%", background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-muted)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, fontWeight: 700, fontSize: isMobile ? 15 : 17 }}>
            <Icon name="mic" size={isMobile ? 32 : 40} />
            <span>{buzzerState?.grabWindowOpen ? "Floor open" : "No one speaking"}</span>
          </span>
        ) : (
          /* Mic grab button lives inside the ring */
          <button
            type="button" onClick={handleGrab} disabled={!canGrab}
            className={canGrab ? "mic-grab-pulse" : undefined}
            style={{
              position: "relative", width: buzzerButton, height: buzzerButton, borderRadius: "50%", border: 0,
              background: canGrab ? "var(--ds-primary-fill)" : "var(--ds-raised)",
              color: canGrab ? "var(--ds-on-primary)" : "var(--ds-muted)",
              boxShadow: canGrab ? "var(--ds-primary-shadow)" : "none",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
              fontFamily: "inherit", fontWeight: 800, fontSize: isMobile ? 17 : 21, letterSpacing: "-0.01em",
              cursor: canGrab ? "pointer" : "not-allowed", opacity: canGrab ? 1 : 0.6, transition: "all 0.2s",
            }}
          >
            <Icon name="mic" size={isMobile ? 32 : 40} />
            <span>Grab the mic</span>
          </button>
        )}
      </div>
      {buzzerState?.grabWindowOpen && grabWindowSecsLeft != null && (
        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: "var(--ds-text3)" }}>Window closes in</span>
            <span className="ds-mono" style={{ color: "var(--ds-accent)" }}>{grabWindowSecsLeft} s</span>
          </span>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={grabWindowSecsLeft} aria-label="Re-grab window" className="ds-track">
            <div style={{ width: `${Math.min(100, (grabWindowSecsLeft / 5) * 100)}%`, background: "var(--ds-accent-mid)", transition: "width 0.25s linear" }} />
          </div>
        </div>
      )}
      {isOnCooldown && <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-against-text)" }}>Cooldown: {cooldownSecsLeft}s</div>}
      {isExcludedFromWindow && <div style={{ fontSize: 13, color: "var(--ds-muted)" }}>You just spoke</div>}
    </>
  );

  // Action buttons (finish turn / release / standby grab)
  const showStandby = isBuzzer && !isHolder && !isObserver && (holderIsUrgent || holderUrgentAll) && !!buzzerState?.currentHolder;
  const stageActions = (isMyTurn || isHolder || showStandby) && (
    <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 420 }}>
      {isHolder && (
        <button type="button" onClick={handleBuzzerRelease} disabled={isUploading} className="ds-btn ds-btn-primary" style={bigBtn}>
          {isUploading ? "Transcribing…" : <>Release mic<Icon name="micoff" size={18} /></>}
        </button>
      )}
      {showStandby && (
        <button type="button" onClick={handleGrab} disabled={!canGrab} className={`ds-btn ds-btn-secondary${canGrab ? " mic-grab-pulse" : ""}`} style={bigBtn}>
          <Icon name="mic" size={18} />Standby · {holderSecsLeft}s
        </button>
      )}
      {isMyTurn && (
        <button type="button" onClick={() => handleSubmit()} disabled={isUploading} className="ds-btn ds-btn-primary" style={bigBtn}>
          {isUploading ? "Transcribing…" : <>Finish turn<Icon name="check" size={18} /></>}
        </button>
      )}
    </div>
  );

  const stageHighlighted = !finished && scoringSecsLeft === null && isActiveSpeaker;
  const stageSection = (
    <section aria-label={isBuzzer ? "Buzzer" : "Current speaker"} style={{
      ...panel, gridArea: "stage",
      padding: isBuzzer ? (isMobile ? "24px 16px 30px" : "32px 28px 40px") : (isMobile ? "22px 16px" : 28),
      borderRadius: 28, boxShadow: "var(--ds-shadow)",
      borderColor: stageHighlighted ? "var(--ds-accent-line)" : "var(--ds-border)",
      display: "flex", flexDirection: "column", alignItems: "center", gap: isMobile ? 18 : 22, textAlign: "center",
      transition: "border-color 0.3s",
    }}>
      {scoringSecsLeft !== null && !isJudge ? scoringWait
        : finished ? finishedPanel
        : (
          <>
            {observerBanner}
            {isBuzzer ? buzzerStage : alternateStage}
            {liveCaptions}
            {liveStats}
            {errorLine}
            {stageActions}
          </>
        )}
    </section>
  );

  // ── Alternate: this round's turn strip ────────────────────────────────────
  const turnsSection = (
    <section aria-label="Turn order" style={{ ...panel, gridArea: "turns", padding: 16, borderRadius: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ ...eyebrow, display: "flex", justifyContent: "space-between", gap: 8 }}>
        {turn ? `Round ${turn.roundNumber} turns` : "Turn order"}
        <span style={{ letterSpacing: 0, textTransform: "none" }}>
          {turn ? (turn.roundNumber < debate.totalRounds ? `Round ${turn.roundNumber + 1} next` : "Final round") : `${debate.totalRounds} rounds`}
        </span>
      </span>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: `repeat(${Math.max(1, debate.turnOrder.length)}, minmax(76px, 1fr))`, gap: 8, overflowX: "auto" }}>
        {debate.turnOrder.map((p, i) => {
          const state = !turn ? (finished ? "Done" : "Waiting")
            : i < turnIdx ? "Done" : i === turnIdx ? "Live" : i === nextIdx ? "Next" : "Waiting";
          const live = state === "Live";
          return (
            <li key={p.userId} style={{ minWidth: 76, padding: 10, borderRadius: 14, boxSizing: "border-box", background: live ? "var(--ds-accent-soft)" : "var(--ds-raised)", border: `1px solid ${live ? "var(--ds-accent-line)" : "transparent"}`, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ height: 4, borderRadius: 4, background: live ? "var(--ds-accent-mid)" : state === "Done" ? sideMid(p.side) : "var(--ds-border2)" }} />
              <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.userId === user?.id ? "You" : p.username}</span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: sideText(p.side) }}>{`${sideLabel(p.side)} · ${state}`}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );

  // ── Buzzer: floor time per debater ────────────────────────────────────────
  const playersSection = (
    <section aria-label="Players" style={{ gridArea: "players", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div style={{ ...panel, padding: 18, borderRadius: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={eyebrow}>Floor time</span>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
          {debate.turnOrder.map((p) => {
            const isActive = p.userId === activeSpeakerUserId;
            const secs  = floorSecsFor(p.userId);
            const count = speakCountFor(p.userId);
            const cdSec = cooldownSecsFor(p.userId);
            return (
              <div key={p.userId} style={{ padding: 12, borderRadius: 16, background: "var(--ds-raised)", border: `1px solid ${isActive ? "var(--ds-accent-line)" : "transparent"}`, display: "flex", flexDirection: "column", gap: 10, transition: "border-color 0.3s" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {avatarBox(p.username, 34, 11, "var(--ds-panel)", isActive ? `avatar-speaking-${p.side}` : undefined)}
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.userId === user?.id ? "You" : p.username}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: sideText(p.side) }}>
                      {sideLabel(p.side)}
                      {isActive ? <span style={{ color: "var(--ds-accent)" }}> · Speaking</span>
                        : cdSec > 0 ? <span style={{ color: "var(--ds-against-text)" }}> · CD {cdSec}s</span>
                        : count > 0 ? <span style={{ color: "var(--ds-muted)" }}> · {count}×</span> : null}
                    </span>
                  </span>
                  {isJudge && judgeStepper(p)}
                  <span className="ds-mono" style={{ fontSize: 13, fontWeight: 600 }}>{fmtClock(secs)}</span>
                </span>
                <span style={{ height: 6, borderRadius: 99, background: "var(--ds-track)", overflow: "hidden" }}>
                  <span style={{ display: "block", height: 6, width: `${(secs / maxFloorSecs) * 100}%`, background: sideMid(p.side), transition: "width 0.3s" }} />
                </span>
              </div>
            );
          })}
        </div>
        <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ds-muted)" }}>
          Each grab holds the floor for up to {debate.turnDuration}s. The ring turns red in the last 10 seconds.
        </span>
      </div>
      {observersCard}
    </section>
  );

  // ── Arguments log (alternate) / live feed (buzzer) — newest first ─────────
  const totalTurns = debate.turnOrder.length * debate.totalRounds;
  const logEntries = debate.rounds.map((r, i) => ({
    r, i,
    // position of this argument within its round (alternate) → "R2 · T1"
    t: debate.rounds.slice(0, i + 1).filter((x) => x.roundNumber === r.roundNumber).length,
  })).reverse();

  const logSection = (
    <section aria-label={isBuzzer ? "Activity" : "Transcript"} style={{ ...panel, gridArea: isBuzzer ? "feed" : "log", padding: 18, borderRadius: isBuzzer ? 22 : 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ ...eyebrow, display: "flex", justifyContent: "space-between", gap: 8 }}>
        {isBuzzer ? "Live feed" : "Arguments so far"}
        <span className="ds-mono" style={{ letterSpacing: 0 }}>
          {isBuzzer ? `${debate.rounds.length} arg${debate.rounds.length !== 1 ? "s" : ""}` : `${debate.rounds.length}/${totalTurns}`}
        </span>
      </span>
      {!isBuzzer && (
        <div className="ds-track" style={{ height: 6 }} aria-hidden="true">
          <div style={{ width: `${totalTurns > 0 ? (debate.rounds.length / totalTurns) * 100 : 0}%` }} />
        </div>
      )}
      <ol style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: isMobile ? 420 : 640, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {debate.rounds.length === 0 ? (
          <li style={{ color: "var(--ds-muted)", fontSize: 14, textAlign: "center", padding: "12px 0", fontStyle: "italic" }}>
            Arguments appear here as speakers finish.
          </li>
        ) : (
          logEntries.map(({ r, i, t }) => (
            <li key={i} style={{ padding: "12px 14px", borderRadius: 14, background: "var(--ds-raised)", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: sideText(r.side), letterSpacing: "0.06em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isBuzzer ? `${r.speakerUsername} · ${sideLabel(r.side)}` : `${sideLabel(r.side)} · ${r.speakerUsername}`}
                </span>
                <span className="ds-mono" style={{ color: "var(--ds-faint)", flexShrink: 0 }}>
                  {isBuzzer ? fmtClock(r.durationSeconds) : `R${r.roundNumber} · T${t}`}
                </span>
              </span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: r.argument ? "var(--ds-text3)" : "var(--ds-faint)", fontStyle: r.argument ? "normal" : "italic" }}>
                {r.argument || "(no transcript captured)"}
              </p>
            </li>
          ))
        )}
      </ol>
    </section>
  );

  const teamsSection = (
    <section aria-label="Teams" style={{ gridArea: "teams", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14, minWidth: 0 }}>
      {teamCard("for", forParticipants)}
      {teamCard("against", againstParticipants)}
      {observersCard}
    </section>
  );

  // Desktop: three columns. <1200: right column drops under the stage. Mobile: one column, stage first.
  const arenaGrid: React.CSSProperties = isBuzzer ? {
    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : isCompact ? "260px minmax(0, 1fr)" : "300px minmax(0, 1fr) 360px",
    gridTemplateAreas:   isMobile ? '"stage" "players" "feed"' : isCompact ? '"players stage" "feed feed"' : '"players stage feed"',
  } : {
    gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : isCompact ? "260px minmax(0, 1fr)" : "280px minmax(0, 1fr) 360px",
    gridTemplateAreas:   isMobile ? '"stage" "turns" "teams" "log"' : isCompact ? '"teams stage" "teams turns" "log log"' : '"teams stage log" "teams turns log"',
  };

  // ── Judge scoring board (replaces the arena once the scoring window opens) ─
  const ranking = [...debate.turnOrder].sort((a, b) => (judgeScores[b.userId] ?? 50) - (judgeScores[a.userId] ?? 50));
  const judgeBoard = (
    <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...eyebrow, display: "flex", alignItems: "center", gap: 8, color: JUDGE }}><Icon name="scale" size={16} />You're judging</span>
          <h1 className="ds-h1" style={isMobile ? { fontSize: 24 } : undefined}>Score each debater</h1>
          <p className="ds-sub" style={{ maxWidth: 560 }}>Rate every speaker from 0 to 100. Judge the arguments, not the side you agree with.</p>
        </div>
        {!judgeSubmitted && scoringSecsLeft !== null && (
          <div role="timer" aria-label={`${scoringSecsLeft} seconds until the scoring window closes`} style={{ ...panel, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 16, borderColor: scoringSecsLeft <= 10 ? "var(--ds-against-line)" : "var(--ds-border)" }}>
            <span style={{ color: scoringSecsLeft <= 10 ? "var(--ds-against-text)" : JUDGE, display: "flex" }}><Icon name="timer" size={20} /></span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 12, color: "var(--ds-muted)", fontWeight: 600 }}>Window closes in</span>
              <span className="ds-mono" style={{ fontWeight: 600, fontSize: 20, color: scoringSecsLeft <= 10 ? "var(--ds-against-text)" : "var(--ds-text)" }}>{fmtClock(scoringSecsLeft)}</span>
            </span>
          </div>
        )}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : isCompact ? "minmax(0, 1fr) 300px" : "minmax(0, 1fr) 340px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
          {debate.turnOrder.map((p) => {
            const score = judgeScores[p.userId] ?? 50;
            const turns = speakCountFor(p.userId);
            const id    = `judge-score-${p.userId}`;
            return (
              <article key={p.userId} style={{ ...panel, padding: isMobile ? 18 : 22, borderRadius: 22, boxShadow: "var(--ds-shadow)", display: "flex", flexDirection: "column", gap: 16 }}>
                <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {avatarBox(p.username, 44, 14)}
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.username}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: sideText(p.side) }}>{`${sideLabel(p.side)} · ${turns} turn${turns !== 1 ? "s" : ""}`}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                    <span style={{ fontWeight: 800, fontSize: 30, color: scoreColor(score) }}>{score}</span>
                    <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>/100</span>
                  </span>
                </header>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <label htmlFor={id} style={{ fontWeight: 600, color: "var(--ds-text3)" }}>Overall score</label>
                    <span className="ds-mono" style={{ fontWeight: 600 }}>{score}</span>
                  </span>
                  <input id={id} type="range" min={0} max={100} step={5} value={score} disabled={judgeSubmitted}
                    onChange={(e) => setJudgeScores((prev) => ({ ...prev, [p.userId]: Number(e.target.value) }))}
                    style={{ width: "100%", height: 28, margin: 0, accentColor: JUDGE }} />
                </div>
              </article>
            );
          })}
        </div>

        <aside style={{ ...panel, padding: isMobile ? 18 : 22, borderRadius: 22, boxShadow: "var(--ds-shadow)", display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={eyebrow}>Your ranking</span>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {ranking.map((p, i) => (
              <li key={p.userId} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: "0 12px", borderRadius: 12, background: "var(--ds-raised)" }}>
                <span className="ds-mono" style={{ width: 20, fontWeight: 600, color: "var(--ds-muted)" }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.username}</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: sideText(p.side) }}>{sideLabel(p.side)}</span>
                <span className="ds-mono" style={{ width: 34, textAlign: "right", fontWeight: 600 }}>{judgeScores[p.userId] ?? 50}</span>
              </li>
            ))}
          </ol>
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: JUDGE_SOFT, fontSize: 13, lineHeight: 1.5, color: "var(--ds-text3)" }}>
            <span style={{ color: JUDGE, flexShrink: 0, display: "flex" }}><Icon name="shield" size={18} /></span>
            <span>Your credibility is scored on how well your ranking and score gaps hold up — and giving everyone the same score counts against you.</span>
          </div>
          {!judgeSubmitted ? (
            <button type="button" onClick={handleJudgeSubmit} className="ds-btn ds-btn-primary ds-btn-block" style={{ height: 56, borderRadius: 16, fontSize: 16 }}>
              <Icon name="lock" size={18} />Lock scores
            </button>
          ) : (
            <div role="status" style={{ height: 56, borderRadius: 16, background: "var(--ds-for-bg)", border: "1px solid var(--ds-for-line)", color: "var(--ds-for-text)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
              <Icon name="check" size={18} />Scores locked — waiting for results…
            </div>
          )}
          {error && <div role="alert" style={{ fontSize: 13, color: "var(--ds-against-text)", textAlign: "center" }}>{error}</div>}
          <span style={{ fontSize: 12, textAlign: "center", color: "var(--ds-muted)" }}>Locked scores can't be changed.</span>
        </aside>
      </div>

      {/* Arguments stay readable while scoring */}
      {logSection}
    </div>
  );

  const fixedBar: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, zIndex: 49, padding: "8px 16px", boxSizing: "border-box",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 700,
    background: "var(--ds-panel)", boxShadow: "var(--ds-shadow)",
  };

  return (
    <InAppBrowserGate>
      {!isPreview && <ConnectionStatusBanner isConnected={isConnected} isReconnecting={isReconnecting} />}

      {/* Buzzer warning flash overlay */}
      {buzzerWarning && (
        <div role="status" style={{ position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--ds-against-bg)", animation: "flashPulse 0.5s ease-in-out 3" }}>
          <div style={{ padding: "14px 28px", borderRadius: 18, background: "var(--ds-panel)", border: "2px solid var(--ds-against-line)", boxShadow: "var(--ds-shadow)", display: "flex", alignItems: "center", gap: 10, color: "var(--ds-against-text)" }}>
            <Icon name="mic" size={22} />
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.08em" }}>GET READY TO GRAB!</span>
          </div>
        </div>
      )}

      {/* Fixed error banners */}
      {recorder.micError && (
        <div role="alert" style={{ ...fixedBar, color: "var(--ds-against-text)", borderBottom: "1px solid var(--ds-against-line)" }}>
          <Icon name="info" size={16} />{recorder.micError}
        </div>
      )}
      {audioBlocked && (
        <button type="button" onClick={resumeAudio} style={{ ...fixedBar, width: "100%", border: 0, borderBottom: "1px solid var(--ds-gold-line)", color: "var(--ds-gold-text)", cursor: "pointer", fontFamily: "inherit" }}>
          <Icon name="volume" size={16} />Tap here to hear other speakers
        </button>
      )}

      <div className="ds-room-page">

        {/* ── PREVIEW BAR (admin dev preview) ── */}
        {isPreview && (
          <div style={{ flexShrink: 0, padding: isMobile ? "8px 16px" : "8px 32px", background: "var(--ds-gold-bg)", borderBottom: "1px solid var(--ds-gold-line)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...eyebrow, color: "var(--ds-gold-text)" }}>Preview</span>
            {/* Role picker */}
            <div role="group" aria-label="Preview role" style={{ display: "flex", gap: 6 }}>
              {([["participant", "mic", "Debater"], ["judge", "scale", "Judge"], ["spectator", "eye", "Spectator"]] as [typeof previewRole, "mic" | "scale" | "eye", string][]).map(([role, icon, label]) => (
                <button
                  key={role}
                  type="button"
                  aria-pressed={previewRole === role}
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
                    height: 32, padding: "0 10px", borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 6,
                    border: `1px solid ${previewRole === role ? "var(--ds-gold-line)" : "var(--ds-border)"}`,
                    background: previewRole === role ? "var(--ds-panel)" : "transparent",
                    color: previewRole === role ? "var(--ds-gold-text)" : "var(--ds-muted)",
                  }}
                ><Icon name={icon} size={14} />{label}</button>
              ))}
            </div>
            {!isMobile && <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>No mic or network needed.</span>}
          </div>
        )}

        <RoomHeader
          onLeave={() => navigate("/")}
          motion={debate.topic}
          status={headerStatus}
          code={debate.roomCode || code}
          extra={!isMobile ? <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{headerChips}</div> : undefined}
        >
          {isMobile && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{headerChips}</div>}
        </RoomHeader>

        <main className="ds-room-main" style={showJudgePanel && isJudge ? undefined : { padding: isMobile ? "14px 12px 28px" : "20px 24px 28px" }}>
          {showJudgePanel && isJudge ? judgeBoard : (
            <div style={{ display: "grid", gap: 16, alignItems: "start", ...arenaGrid }}>
              {stageSection}
              {isBuzzer ? playersSection : <>{turnsSection}{teamsSection}</>}
              {logSection}
            </div>
          )}
        </main>
      </div>
    </InAppBrowserGate>
  );
}
