import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ConnectionStatusBanner } from "../components/ConnectionStatusBanner";
import { useSocket } from "../hooks/useSocket";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
import { useReconnectHandler } from "../hooks/useReconnectHandler";
import { useIsMobile } from "../hooks/useIsMobile";
import { getLevelInfo } from "@argumint/shared";
import type { Debate, ScoreBreakdown } from "@argumint/shared";

// ─── Display labels (plain language, not jargon) ────────────────────────────
const BAR_LABELS: Record<string, string> = {
  clarity:      "Clarity",
  evidence:     "Proof",
  rebuttal:     "Counter",
  organization: "Structure",
};
const BAR_ORDER = ["clarity", "evidence", "rebuttal", "organization"] as Array<keyof ScoreBreakdown>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function barColor(val: number): string {
  if (val >= 18) return "linear-gradient(90deg,#059669,#10b981)";
  if (val >= 10) return "linear-gradient(90deg,#d97706,#f59e0b)";
  return "linear-gradient(90deg,#e11d48,#f43f5e)";
}

function scoreGradient(n: number) {
  if (n >= 80) return "linear-gradient(135deg,#059669,#10b981)";
  if (n >= 60) return "linear-gradient(135deg,#4f8ef7,#22d3ee)";
  if (n >= 40) return "linear-gradient(135deg,#d97706,#f59e0b)";
  return "linear-gradient(135deg,#e11d48,#f43f5e)";
}

function ordinal(n: number) {
  const s=["th","st","nd","rd"],v=n%100;
  return n+(s[(v-20)%10]||s[v]||s[0]);
}

function clip(s: string, max = 52): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function getOutcome(rank: number, won: boolean) {
  if (won && rank === 1) return { label:"🏆 MVP",        badge:"VICTORY",        color:"var(--for)",    glow:"glow-for"  };
  if (won)              return { label:"✓ WINNER",      badge:`${ordinal(rank)} OVERALL`, color:"var(--for)",    glow:"glow-for"  };
  if (rank === 2)       return { label:"RUNNER-UP",     badge:"2nd PLACE",       color:"var(--cyan)",   glow:"glow-cyan" };
  return                       { label:`${ordinal(rank)} PLACE`, badge:"DEFEATED", color:"var(--muted)", glow:""          };
}

// ─── Score Bar ───────────────────────────────────────────────────────────────

function ScoreBar({ k, val }: { k: string; val: number }) {
  const pct = Math.max(0, Math.min(100, (val / 25) * 100));
  const color = barColor(val);
  const isZero = val === 0;
  return (
    <div style={{ marginBottom:"0.45rem" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginBottom:"0.18rem" }}>
        <span style={{ fontSize:"0.68rem", fontWeight:700, color:"var(--subtle)", textTransform:"uppercase", letterSpacing:"0.04em", width:60, flexShrink:0 }}>
          {BAR_LABELS[k]}
        </span>
        <div className="score-bar-track" style={{ flex:1 }}>
          <div style={{ height:"100%", borderRadius:"9999px", background:color, width:`${pct}%`, transition:"width 1.3s cubic-bezier(.4,0,.2,1)" }} />
        </div>
        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, fontSize:"0.75rem", color:"var(--text)", width:26, textAlign:"right", flexShrink:0 }}>
          {val}
        </span>
        {isZero && <span style={{ fontSize:"0.65rem", color:"var(--against)", flexShrink:0 }}>✗</span>}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function ResultPage() {
  const { code, debateId } = useParams<{ code: string; debateId: string }>();
  const navigate   = useNavigate();
  const { user, checkAuth } = useAuth();
  const { socket, isConnected, isReconnecting, onReconnect } = useSocket();
  const isMobile   = useIsMobile();
  const isPro      = (user as any)?.isPro ?? false;
  const isPreview  = debateId === "preview";

  const [debate,        setDebate]        = useState<Debate | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [judgingError,  setJudgingError]  = useState<string | null>(null);
  const [showTx,        setShowTx]        = useState(false);
  const [myXPAward, setMyXPAward] = useState<{ xpGained: number; newXP: number; leveledUp: boolean; newLevel: number; newLevelTitle: string } | null>(null);
  // Human judge scores — updated live as judges submit during the judging window
  const [judgeScores,   setJudgeScores]   = useState<Array<{
    judgeId: string;
    judgeUsername: string;
    scores: Array<{ userId: string; score: number }>;
    submittedAt: Date;
  }>>([]);

  // ── XP animation state machine ───────────────────────────────────────────
  const [popupVisible,  setPopupVisible]  = useState(false);   // overlay mounted
  const [popupOpacity,  setPopupOpacity]  = useState(0);       // CSS opacity
  const [popupCount,    setPopupCount]    = useState(0);       // counter 0→xpGained
  const [barPct,        setBarPct]        = useState(0);       // animated bar %
  const [barTransition, setBarTransition] = useState(true);    // CSS transition on/off
  const [showLevelUp,   setShowLevelUp]   = useState(false);   // level-up banner
  // Level badge display — starts at OLD level, flips to new level on level-up
  const [displayedLevel, setDisplayedLevel]   = useState<number | null>(null);
  const [displayedTitle, setDisplayedTitle]   = useState<string | null>(null);
  const [levelBadgePop,  setLevelBadgePop]    = useState(false); // triggers pop anim
  const [displayedBarNext, setDisplayedBarNext] = useState<boolean>(true); // show bar?
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useLeaveRoomOnNavigate(code, debate?.roomId, socket);

  // ── Reconnection: re-fetch debate state on socket restore ────────────────
  const reconnectParamsRef = useRef({ socket, debateId });
  useEffect(() => { reconnectParamsRef.current = { socket, debateId }; });

  useReconnectHandler({
    onReconnect,
    enabled: !!debateId && !isPreview,
    reconnectFn: () => {
      const { socket: s, debateId: id } = reconnectParamsRef.current;
      if (!s || !id) return;
      s.emit("debate:get-state", { debateId: id }, (res: any) => {
        if (!res?.success) return;
        setDebate(res.debate as Debate);
        if (res.debate?.status === "ended") void checkAuth();
      });
    },
  });

  // ── Preview mock ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPreview || !user) return;
    const baseXP   = (user as any)?.xp ?? 0;
    const xpGained = 81;
    const newXP    = baseXP + xpGained;
    const lvInfo   = getLevelInfo(newXP);
    const mockDebate: Debate = {
      _id:       "preview",
      roomId:    "preview-room",
      roomCode:  "PREVIEW",
      creatorId: user.id,
      topic:     "Artificial Intelligence will do more good than harm for humanity",
      mode:      "alternate",
      totalRounds:  3,
      turnDuration: 120,
      prepDuration: 60,
      turnOrder: [
        { userId: user.id,   username: user.username, side: "for"     },
        { userId: "mock-p2", username: "Challenger",  side: "against" },
      ],
      rounds:      [],
      currentTurn: null,
      status:      "ended",
      result: {
        winnerSide: "for",
        winningPoints: [
          "Strong empirical evidence for AI medical breakthroughs",
          "Proactive safety frameworks argued convincingly",
          "Economic adaptation case backed with data",
        ],
        summary:
          "The FOR side presented a compelling case with concrete examples of AI benefiting healthcare, education, and productivity. The AGAINST side raised valid concerns about job displacement but failed to rebut the long-term economic adaptation arguments.",
        scores: [
          {
            userId:       user.id,
            username:     user.username,
            side:         "for",
            clarity:      22,
            evidence:     20,
            rebuttal:     18,
            organization: 21,
            total:        81,
            feedback:     "Exceptional clarity and strong evidence usage. Rebuttals were well-timed and effective throughout all three rounds.",
            strengths:    [
              "Clear structure with compelling opening and closing statements",
              "Used real-world examples to ground abstract claims effectively",
            ],
            improvements: [
              "Could push rebuttal depth further on economic disruption points",
              "Slightly rushed delivery in round 2 — slow down for impact",
            ],
          },
          {
            userId:       "mock-p2",
            username:     "Challenger",
            side:         "against",
            clarity:      17,
            evidence:     15,
            rebuttal:     14,
            organization: 16,
            total:        62,
            feedback:     "Raised important concerns but lacked concrete data to back claims. Counter-arguments were too broad.",
            strengths:    [
              "Strong emotional appeal on job displacement narrative",
              "Maintained consistent argument thread throughout",
            ],
            improvements: [
              "Needs more empirical evidence — cite specific studies",
              "Rebuttals were too general to land effectively",
            ],
          },
        ],
        judgedAt:   new Date(),
        judgeModel: "gpt-4o",
      },
    };
    setDebate(mockDebate);
    setMyXPAward({
      xpGained,
      newXP,
      leveledUp:     false,
      newLevel:      lvInfo.current.level,
      newLevelTitle: lvInfo.current.title,
    });
  }, [isPreview, user]);

  useEffect(() => {
    if (isPreview || !socket || !isConnected || !debateId) return;
    socket.emit("debate:get-state", { debateId }, (res: any) => {
      if (!res?.success) { setError(res?.error || "Failed to load debate"); return; }
      setDebate(res.debate as Debate);
      // If debate is already ended (navigating directly to result URL),
      // refresh user so stats/XP in the UI reflect the latest DB values.
      if (res.debate?.status === "ended") void checkAuth();
    });
  }, [socket, isConnected, debateId]);

  useEffect(() => {
    if (isPreview || !socket) return;
    const onReady  = (d: any) => {
      setDebate((p) => p ? { ...p, result: d.result } : p);
      // Find this user's XP award in the broadcast
      if (user && Array.isArray(d.xpAwards)) {
        const award = d.xpAwards.find((a: any) => a.userId === user.id);
        if (award) setMyXPAward(award);
      }
      // Capture judge scores included in result-ready broadcast
      if (Array.isArray(d.judgeScores) && d.judgeScores.length > 0) {
        setJudgeScores(d.judgeScores);
      }
      // Refresh user so Home page stats (Won/Lost/Total/XP) are up to date
      void checkAuth();
    };
    const onFailed = (d: any) => setJudgingError(d?.error || "Judge unavailable");
    const onJudgeScoresUpdated = (d: any) => {
      if (Array.isArray(d.judgeScores)) setJudgeScores(d.judgeScores);
    };
    socket.on("debate:result-ready",         onReady);
    socket.on("debate:result-failed",        onFailed);
    socket.on("debate:judge-scores-updated", onJudgeScoresUpdated);
    return () => {
      socket.off("debate:result-ready",         onReady);
      socket.off("debate:result-failed",        onFailed);
      socket.off("debate:judge-scores-updated", onJudgeScoresUpdated);
    };
  }, [socket]);

  // ── Animation sequence ───────────────────────────────────────────────────
  // Runs once when the result + myScore both land.
  // Derived scores — declared BEFORE the animation effect so they're
  // in scope when the effect's dependency array is evaluated.
  const myScore = useMemo<ScoreBreakdown | null>(() => {
    if (!debate?.result || !user) return null;
    return debate.result.scores.find((s) => s.userId === user.id) ?? null;
  }, [debate, user]);

  const rankedAll = useMemo<ScoreBreakdown[]>(() => {
    if (!debate?.result) return [];
    return debate.result.scores.slice().sort((a, b) => b.total - a.total);
  }, [debate]);

  const myRank = useMemo(() => {
    if (!user || !rankedAll.length) return 1;
    const i = rankedAll.findIndex((s) => s.userId === user.id);
    return i === -1 ? rankedAll.length : i + 1;
  }, [rankedAll, user]);

  // T+0    result arrives
  // T+400  popup fades in, counter starts (1 400 ms, ease-out)
  // T+2100 popup fades out (400 ms)
  // T+2500 popup hidden; bar animates old→new (CSS transition)
  //   ↳ if level-up: bar fills to 100 % first, then banner + reset
  useEffect(() => {
    if (!debate?.result || !myScore) return;
    const ts = timersRef.current;

    const push = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      ts.push(id);
    };

    const _xpGained    = myXPAward?.xpGained ?? myScore.total ?? 0;
    const _newXP       = myXPAward?.newXP ?? ((user as any)?.xp ?? 0) + _xpGained;
    const _leveledUp   = myXPAward?.leveledUp ?? false;

    // Initialise bar at the OLD position so it can animate forward
    const oldXP      = Math.max(0, _xpGained > 0 ? _newXP - _xpGained : _newXP);
    const oldInfo    = getLevelInfo(oldXP);
    const targetInfo = getLevelInfo(_newXP);
    setBarPct(oldInfo.next ? oldInfo.progressPct : 100);
    setBarTransition(true);

    // Start badge showing OLD level so the user sees the progression
    setDisplayedLevel(oldInfo.current.level);
    setDisplayedTitle(oldInfo.current.title);
    setDisplayedBarNext(!!oldInfo.next);
    setLevelBadgePop(false);

    // ── Phase 1: show popup ──────────────────────────────────────────────
    push(() => {
      setPopupVisible(true);
      // Fade-in next frame
      setTimeout(() => setPopupOpacity(1), 20);
      // Counter ticks: 40 steps over 1 400 ms (ease-out via sqrt)
      const steps = 40;
      for (let i = 1; i <= steps; i++) {
        push(() => {
          const eased = Math.sqrt(i / steps);
          setPopupCount(Math.round(eased * _xpGained));
        }, i * (1400 / steps));
      }
    }, 400);

    // ── Phase 2: fade popup out ──────────────────────────────────────────
    push(() => setPopupOpacity(0), 2100);
    push(() => setPopupVisible(false), 2500);

    // ── Phase 3: animate bar ─────────────────────────────────────────────
    push(() => {
      if (_leveledUp) {
        // Fill bar to 100 %
        setBarPct(100);
        // Flip badge to NEW level + show banner after bar reaches full
        push(() => {
          setShowLevelUp(true);
          setDisplayedLevel(targetInfo.current.level);
          setDisplayedTitle(targetInfo.current.title);
          setDisplayedBarNext(!!targetInfo.next);
          setLevelBadgePop(true);
          // Clear the pop class after the animation so it can re-trigger if needed
          setTimeout(() => setLevelBadgePop(false), 600);
        }, 900);
        // Reset bar without transition, then fill remainder
        push(() => {
          setBarTransition(false);
          setBarPct(0);
        }, 1000);
        push(() => {
          setBarTransition(true);
          setBarPct(targetInfo.next ? targetInfo.progressPct : 100);
        }, 1060);
      } else {
        setBarPct(targetInfo.next ? targetInfo.progressPct : 100);
      }
    }, 2500);

    return () => { ts.forEach(clearTimeout); timersRef.current = []; };
  }, [debate?.result, myScore, myXPAward, user]);

  // ── Error/loading ─────────────────────────────────────────────────────────

  if (error) return (
    <div className="bg-grid" style={{ height:"100vh", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)" }}>
      <div className="glass" style={{ padding:"2.5rem", textAlign:"center", maxWidth:400 }}>
        <p style={{ color:"var(--against)", marginBottom:"0.875rem" }}>⚠ {error}</p>
        <button onClick={() => navigate("/")} className="btn-ghost">Back to Home</button>
      </div>
    </div>
  );

  if (!debate) return (
    <div className="bg-grid" style={{ height:"100vh", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)" }}>
      <img src="/logo/logo.png" alt="Loading…" className="logo-heartbeat" style={{ width: 72, height: 72 }} />
    </div>
  );

  const result    = debate.result;
  const isJudging = !result && !judgingError;
  const myWon     = !!(result && myScore && myScore.side === result.winnerSide);
  const outcome   = myScore ? getOutcome(myRank, myWon) : null;
  const strengths    = ((myScore as any)?.strengths   as string[] | undefined) ?? [];
  const improvements = ((myScore as any)?.improvements as string[] | undefined) ?? [];
  const bestMove  = strengths[0]   ? clip(strengths[0])   : null;
  const missed    = improvements[0] ? clip(improvements[0]) : null;

  // XP / Level derived data
  const xpGained    = myXPAward?.xpGained ?? myScore?.total ?? 0;
  const newXP       = myXPAward?.newXP ?? ((user as any)?.xp ?? 0) + xpGained;
  const levelInfo   = getLevelInfo(newXP);
  const leveledUp   = myXPAward?.leveledUp ?? false;
  const newLevelTitle = myXPAward?.newLevelTitle ?? levelInfo.current.title;

  // ── Lock overlay for Pro-only cards ──────────────────────────────────────
  const lockOverlay = (name: string) => (
    <div style={{
      position: "absolute", inset: 0, zIndex: 2,
      background: "linear-gradient(160deg,rgba(10,6,24,0.62) 0%,rgba(5,3,15,0.94) 100%)",
      backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      borderRadius: "inherit",
    }}>
      <div style={{ textAlign: "center", padding: "0.75rem 1rem" }}>
        <div style={{ fontSize: "1.1rem", marginBottom: "0.22rem" }}>🔒</div>
        <div style={{ fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.14em", color: "#d97706", marginBottom: "0.15rem", textTransform: "uppercase" }}>Pro Feature</div>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#e2e8f0", marginBottom: "0.45rem", lineHeight: 1.3, maxWidth: 130 }}>{name}</div>
        <button onClick={() => navigate("/pricing")} style={{
          fontSize: "0.65rem", fontWeight: 800, padding: "0.28rem 0.75rem",
          borderRadius: "9999px", background: "linear-gradient(135deg,#f59e0b,#d97706)",
          color: "#000", border: "none", cursor: "pointer", fontFamily: "inherit",
        }}>⚡ Unlock Pro</button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes mvpPulse {
          0%,100% { box-shadow:0 0 0 0 rgba(16,185,129,0); }
          50%      { box-shadow:0 0 18px 4px rgba(16,185,129,0.35); }
        }
        @keyframes levelUpPop {
          0%   { transform:scale(0.7) translateY(12px); opacity:0; }
          60%  { transform:scale(1.06) translateY(-2px); opacity:1; }
          100% { transform:scale(1) translateY(0); opacity:1; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        @keyframes levelBadgePop {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.45); box-shadow: 0 0 14px 4px rgba(16,185,129,0.55); }
          60%  { transform: scale(0.92); }
          100% { transform: scale(1); box-shadow: none; }
        }
        @keyframes cardFadeUp {
          0%   { opacity:0; transform:translateY(10px); }
          100% { opacity:1; transform:translateY(0); }
        }
        @keyframes heroWinPulse {
          0%,100% { border-color:rgba(16,185,129,0.45); box-shadow:0 4px 32px rgba(16,185,129,0.10); }
          50%      { border-color:rgba(16,185,129,0.75); box-shadow:0 4px 32px rgba(16,185,129,0.22); }
        }
        @keyframes heroLosePulse {
          0%,100% { box-shadow:0 2px 20px rgba(79,70,229,0.10); }
          50%      { box-shadow:0 2px 28px rgba(79,70,229,0.20); }
        }
        .mvp-glow        { animation: mvpPulse 2s ease-in-out infinite; }
        .hero-win-anim   { animation: heroWinPulse 2.8s ease-in-out infinite; }
        .hero-lose-anim  { animation: heroLosePulse 3s ease-in-out infinite; }
        .level-up-pop    { animation: levelUpPop 0.5s cubic-bezier(.34,1.56,.64,1) forwards; }
        .level-badge-pop { animation: levelBadgePop 0.55s cubic-bezier(.34,1.56,.64,1) forwards; }
        .res-col > * { animation: cardFadeUp 0.38s cubic-bezier(.4,0,.2,1) both; }
        .res-col > *:nth-child(1) { animation-delay:0.06s; }
        .res-col > *:nth-child(2) { animation-delay:0.12s; }
        .res-col > *:nth-child(3) { animation-delay:0.18s; }
        .res-col > *:nth-child(4) { animation-delay:0.24s; }
        .res-row { transition: background 0.18s, transform 0.15s; }
        .res-row:hover { transform: translateX(2px); }
        .shimmer-text {
          background: linear-gradient(90deg, #f59e0b, #10b981, #22d3ee, #f59e0b);
          background-size: 300% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 2s linear infinite;
        }
        .play-btn { transition: transform 0.15s, box-shadow 0.15s; }
        .play-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(124,58,237,0.48) !important; }
        .play-btn:active { transform: translateY(0); }
      `}</style>

      {/* ── XP EARNED POPUP ── */}
      {popupVisible && (
        <div style={{
          position:"fixed", inset:0, zIndex:9999,
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(0,0,0,0.55)",
          opacity: popupOpacity,
          transition:"opacity 0.35s ease",
          pointerEvents:"none",
        }}>
          <div className="glass" style={{
            textAlign:"center",
            padding: isMobile ? "2rem 2.5rem" : "2.5rem 4rem",
            borderRadius:"1.25rem",
            border:"1px solid rgba(245,158,11,0.35)",
            background:"rgba(10,10,20,0.85)",
            boxShadow:"0 0 40px rgba(245,158,11,0.2)",
          }}>
            <div style={{ fontSize:"0.7rem", fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:"var(--gold)", marginBottom:"0.5rem" }}>
              Points Earned
            </div>
            <div style={{
              fontFamily:"'JetBrains Mono',monospace",
              fontSize: isMobile ? "4.5rem" : "6rem",
              fontWeight:900,
              lineHeight:1,
              background:"linear-gradient(135deg,#f59e0b,#fbbf24,#fde68a)",
              WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent",
              backgroundClip:"text",
              letterSpacing:"-0.03em",
            }}>
              +{popupCount}
            </div>
            <div style={{ fontSize:"1rem", fontWeight:800, color:"var(--gold)", letterSpacing:"0.15em", textTransform:"uppercase", marginTop:"0.25rem" }}>
              XP
            </div>
          </div>
        </div>
      )}

      <ConnectionStatusBanner isConnected={isConnected} isReconnecting={isReconnecting} />
      <div className="bg-grid" style={{ height:"100vh", display:"flex", flexDirection:"column", background:"var(--bg)", overflow:"hidden", position:"relative" }}>
        {/* Ambient gradient */}
        <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0,
          background:"radial-gradient(ellipse 65% 55% at 15% 5%,rgba(124,58,237,0.09) 0%,transparent 58%),radial-gradient(ellipse 45% 45% at 85% 95%,rgba(16,185,129,0.05) 0%,transparent 55%)"
        }} />

        {/* ── JUDGING ── */}
        {isJudging && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", zIndex:1 }}>
            <div className="glass fade-up glow-cyan" style={{ padding:isMobile?"1.5rem 1.25rem":"2.5rem 3rem", textAlign:"center", border:"1px solid rgba(34,211,238,0.2)", maxWidth:380 }}>
              <img src="/logo/logo.png" alt="Judging…" className="logo-heartbeat" style={{ width:64, height:64, margin:"0 auto 1.25rem" }} />
              <h2 style={{ fontSize:"1.2rem", fontWeight:800, color:"var(--text)", margin:"0 0 0.35rem" }} className="text-glow-cyan">AI Judge reviewing…</h2>
              <p style={{ color:"var(--muted)", fontSize:"0.82rem", margin:0 }}>Scoring all speakers — 5–15 sec</p>
            </div>
          </div>
        )}

        {/* ── JUDGE FAILED ── */}
        {judgingError && !result && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", zIndex:1 }}>
            <div style={{ padding:"1.5rem 2rem", background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:"1rem", textAlign:"center", maxWidth:380 }}>
              <p style={{ fontWeight:700, color:"var(--gold)", marginBottom:"0.25rem" }}>Judge unavailable</p>
              <p style={{ color:"var(--muted)", fontSize:"0.82rem", margin:0 }}>{judgingError}</p>
            </div>
          </div>
        )}

        {/* ── NO SCORE FALLBACK ── */}
        {result && !myScore && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", zIndex:1 }}>
            <div className="glass" style={{ padding:"2rem", textAlign:"center", maxWidth:340 }}>
              <p style={{ color:"var(--muted)", marginBottom:"1rem" }}>Score not available — you may not have been in this debate.</p>
              <button onClick={() => navigate("/")} className="btn-primary">Back to Home</button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            MAIN RESULT LAYOUT (unified Free + Pro)
            ══════════════════════════════════════════ */}
        {result && myScore && (
          <div style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", position:"relative", zIndex:1, padding:isMobile?"0.5rem":"0.5rem 0.875rem 0.625rem", gap:"0.4rem" }}>

            {/* ── TOP BAR ── */}
            <div style={{ display:"flex", alignItems:"center", gap:"0.625rem", flexShrink:0 }}>
              <button onClick={() => navigate("/")} className="btn-ghost" style={{ fontSize:"0.78rem", padding:"0.25rem 0.6rem", flexShrink:0 }}>← Home</button>
              <span style={{ fontSize:"0.54rem", fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--muted)", flexShrink:0 }}>Motion</span>
              <span style={{ fontSize:"0.78rem", fontWeight:700, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:isMobile?"normal":"nowrap", flex:1 }}>{debate.topic}</span>
            </div>

            {/* ── HERO BANNER ── */}
            <div className={myWon ? "hero-win-anim" : "hero-lose-anim"} style={{
              flexShrink:0, borderRadius:"1rem",
              padding:isMobile?"0.75rem 0.875rem":"0.6rem 1.125rem",
              background:myWon
                ? "linear-gradient(135deg,rgba(16,185,129,0.11) 0%,rgba(5,150,105,0.04) 50%,rgba(8,8,20,0.75) 100%)"
                : "linear-gradient(135deg,rgba(79,70,229,0.11) 0%,rgba(30,27,75,0.04) 50%,rgba(8,8,20,0.75) 100%)",
              border:`1.5px solid ${myWon ? "rgba(16,185,129,0.45)" : "rgba(79,70,229,0.4)"}`,
              backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
              display:"flex", alignItems:"center", gap:isMobile?"0.75rem":"1.25rem", flexWrap:"wrap",
            }}>
              {/* Winner declaration */}
              <div style={{ display:"flex", flexDirection:"column", gap:"0.15rem", minWidth:0, flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:"0.45rem", flexWrap:"wrap" }}>
                  <span style={{ fontSize:isMobile?"1.1rem":"1.4rem", fontWeight:900, letterSpacing:"-0.02em", lineHeight:1, color:result.winnerSide==="for"?"var(--for)":"var(--against)" }}>
                    {result.winnerSide==="for"?"FOR":"AGAINST"} WINS
                  </span>
                  <div style={{ display:"flex", gap:"0.3rem", flexWrap:"wrap" }}>
                    {rankedAll.filter(s => s.side===result.winnerSide).map(s => (
                      <span key={s.userId} style={{
                        fontSize:"0.75rem", fontWeight:800,
                        padding:"0.1rem 0.45rem", borderRadius:"9999px",
                        background:s.userId===user?.id?"rgba(245,158,11,0.15)":"var(--surface2)",
                        border:`1px solid ${s.userId===user?.id?"rgba(245,158,11,0.4)":"var(--border)"}`,
                        color:s.userId===user?.id?"#fbbf24":"var(--text)",
                      }}>{s.username}{s.userId===user?.id?" 🔥":""}</span>
                    ))}
                  </div>
                </div>
                {outcome && <div style={{ fontSize:"0.58rem", fontWeight:700, color:"var(--muted)", letterSpacing:"0.08em", textTransform:"uppercase" }}>{outcome.badge}</div>}
              </div>

              {/* Outcome label */}
              {outcome && (
                <div style={{ textAlign:"center", flexShrink:0 }}>
                  <div style={{ fontSize:isMobile?"0.9rem":"1.05rem", fontWeight:900, color:outcome.color, letterSpacing:"-0.01em" }}>{outcome.label}</div>
                </div>
              )}

              {/* My Score */}
              <div className={myWon?"mvp-glow":""} style={{
                textAlign:"center", flexShrink:0, borderRadius:"0.7rem",
                padding:"0.2rem 0.65rem",
                background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
              }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:isMobile?"1.75rem":"2.3rem", fontWeight:900, lineHeight:1,
                  background:scoreGradient(myScore.total), WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
                }}>{myScore.total}</div>
                <div style={{ fontSize:"0.5rem", color:"var(--muted)", fontWeight:600, letterSpacing:"0.06em" }}>/ 100</div>
              </div>

              {/* XP + Level */}
              <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", flexShrink:0 }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:"0.95rem", fontWeight:900, lineHeight:1,
                    background:scoreGradient(xpGained), WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text"
                  }}>+{xpGained}</div>
                  <div style={{ fontSize:"0.5rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.1em" }}>XP</div>
                </div>
                {(() => {
                  const shownLevel = displayedLevel ?? levelInfo.current.level;
                  const shownTitle = displayedTitle ?? levelInfo.current.title;
                  const shownHasNext = displayedBarNext;
                  const badgeIsNew = leveledUp && shownLevel === levelInfo.current.level;
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:"0.18rem", minWidth:isMobile?85:105 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"0.35rem" }}>
                        <span className={levelBadgePop?"level-badge-pop":""} style={{
                          fontFamily:"'JetBrains Mono',monospace", fontSize:"0.62rem", fontWeight:900,
                          padding:"0.08rem 0.32rem", borderRadius:"0.3rem",
                          background:badgeIsNew?"rgba(16,185,129,0.15)":"rgba(79,142,247,0.12)",
                          border:`1px solid ${badgeIsNew?"rgba(16,185,129,0.4)":"rgba(79,142,247,0.3)"}`,
                          color:badgeIsNew?"var(--for)":"var(--cyan)",
                          transition:"background 0.3s,border-color 0.3s,color 0.3s",
                        }}>Lv.{shownLevel}</span>
                        <span style={{ fontSize:"0.65rem", fontWeight:700, color:"var(--text)" }}>{shownTitle}</span>
                      </div>
                      {shownHasNext && (
                        <div>
                          <div className="score-bar-track" style={{ height:4 }}>
                            <div className="xp-bar-fill" style={{ height:"100%", borderRadius:"9999px", width:`${barPct}%`, transition:barTransition?"width 0.85s cubic-bezier(.4,0,.2,1)":"none" }} />
                          </div>
                          <div style={{ fontSize:"0.48rem", color:"var(--muted)", marginTop:"0.1rem" }}>{levelInfo.progressXP}/{levelInfo.neededXP} XP</div>
                        </div>
                      )}
                      {!shownHasNext && <div style={{ fontSize:"0.52rem", color:"var(--for)", fontWeight:700 }}>MAX LEVEL</div>}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── LEVEL-UP BANNER ── */}
            {showLevelUp && (
              <div className="level-up-pop" style={{
                flexShrink:0, padding:"0.55rem 1rem", borderRadius:"0.875rem",
                background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.4)",
                display:"flex", alignItems:"center", gap:"0.75rem",
                boxShadow:"0 0 24px rgba(16,185,129,0.18)",
              }}>
                <span style={{ fontSize:"1.5rem", flexShrink:0 }}>⬆</span>
                <div>
                  <div className="shimmer-text" style={{ fontSize:"0.95rem", fontWeight:900 }}>LEVEL UP!</div>
                  <div style={{ fontSize:"0.75rem", color:"var(--text)", fontWeight:700 }}>
                    You are now <span style={{ color:"var(--for)" }}>Level {levelInfo.current.level}</span> — {newLevelTitle}
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════
                3-COLUMN DASHBOARD GRID
                ══════════════════════════════════════════ */}
            <div style={{
              flex:1, minHeight:0,
              display: isMobile ? "flex" : "grid",
              flexDirection: isMobile ? "column" : undefined,
              gridTemplateColumns: isMobile ? undefined : "1fr 1.1fr 1fr",
              gap:"0.5rem",
              overflow: isMobile ? "auto" : "hidden",
            }}>

              {/* ──────────────── LEFT SIDEBAR ──────────────── */}
              <div className="res-col" style={{ display:"flex", flexDirection:"column", gap:"0.5rem", overflow:"hidden", minHeight:0 }}>

                {/* Performance Breakdown */}
                <div style={{ position:"relative", borderRadius:"0.875rem", overflow:"hidden", flexShrink:0 }}>
                  <div className="glass" style={{ padding:"0.7rem 0.875rem", ...(isPro?{}:{ filter:"blur(5px)", pointerEvents:"none", userSelect:"none" }) }}>
                    <div style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--cyan)", marginBottom:"0.5rem" }}>📊 Performance</div>
                    {BAR_ORDER.map((k) => <ScoreBar key={k as string} k={k as string} val={myScore[k] as number} />)}
                  </div>
                  {!isPro && lockOverlay("Performance Breakdown")}
                </div>

                {/* Strengths */}
                <div style={{ position:"relative", borderRadius:"0.875rem", overflow:"hidden", flex:1, minHeight:0 }}>
                  <div className="glass" style={{ height:"100%", padding:"0.7rem 0.875rem", display:"flex", flexDirection:"column", ...(isPro?{}:{ filter:"blur(5px)", pointerEvents:"none", userSelect:"none" }) }}>
                    <div style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--for)", marginBottom:"0.4rem", flexShrink:0 }}>✅ Strengths</div>
                    <div style={{ flex:1, minHeight:0, overflowY:"auto", display:"flex", flexDirection:"column", gap:"0.28rem" }}>
                      {strengths.length > 0 ? strengths.slice(0,4).map((s,i) => (
                        <div key={i} style={{
                          display:"flex", alignItems:"flex-start", gap:"0.35rem",
                          padding:"0.28rem 0.45rem", borderRadius:"0.4rem",
                          background:"rgba(16,185,129,0.07)", border:"1px solid rgba(16,185,129,0.17)",
                        }}>
                          <span style={{ color:"var(--for)", fontSize:"0.62rem", flexShrink:0, marginTop:"0.1rem" }}>•</span>
                          <span style={{ color:"var(--subtle)", fontSize:"0.7rem", lineHeight:1.4 }}>{clip(s,60)}</span>
                        </div>
                      )) : <p style={{ color:"var(--muted)", fontSize:"0.7rem", margin:0, fontStyle:"italic" }}>Nothing stood out yet</p>}
                    </div>
                  </div>
                  {!isPro && lockOverlay("Strengths Analysis")}
                </div>

                {/* Key Moments */}
                <div style={{ position:"relative", borderRadius:"0.875rem", overflow:"hidden", flexShrink:0 }}>
                  <div className="glass" style={{ padding:"0.7rem 0.875rem", ...(isPro?{}:{ filter:"blur(5px)", pointerEvents:"none", userSelect:"none" }) }}>
                    <div style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--gold)", marginBottom:"0.38rem" }}>⚡ Key Moments</div>
                    {bestMove ? (
                      <div style={{ marginBottom:missed?"0.38rem":0 }}>
                        <div style={{ fontSize:"0.58rem", fontWeight:700, color:"var(--for)", marginBottom:"0.12rem" }}>🔥 Best Move</div>
                        <p style={{ margin:0, fontSize:"0.7rem", color:"var(--subtle)", lineHeight:1.4, fontStyle:"italic" }}>"{bestMove}"</p>
                      </div>
                    ) : <p style={{ margin:0, fontSize:"0.7rem", color:"var(--muted)", fontStyle:"italic" }}>No highlights captured.</p>}
                    {missed && (
                      <div>
                        <div style={{ fontSize:"0.58rem", fontWeight:700, color:"var(--against)", marginBottom:"0.12rem" }}>✗ Missed</div>
                        <p style={{ margin:0, fontSize:"0.7rem", color:"var(--subtle)", lineHeight:1.4, fontStyle:"italic" }}>"{missed}"</p>
                      </div>
                    )}
                  </div>
                  {!isPro && lockOverlay("Key Moments")}
                </div>
              </div>

              {/* ──────────────── CENTER ──────────────── */}
              <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem", overflow:"hidden", minHeight:0 }}>

                {/* Standings */}
                <div className="glass" style={{ flex:1, minHeight:0, display:"flex", flexDirection:"column", padding:"0.7rem 0.875rem" }}>
                  <div style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--cyan)", marginBottom:"0.45rem", flexShrink:0 }}>🏆 Standings</div>
                  <div style={{ flex:1, minHeight:0, overflowY:"auto", display:"flex", flexDirection:"column", gap:"0.28rem" }}>
                    {rankedAll.map((s,idx) => {
                      const isMe = s.userId===user?.id;
                      const won  = s.side===result.winnerSide;
                      const mc   = idx===0?"#f59e0b":idx===1?"#94a3b8":idx===2?"#b45309":"var(--muted)";
                      const mbg  = idx===0?"rgba(245,158,11,0.1)":idx===1?"rgba(148,163,184,0.07)":idx===2?"rgba(180,83,9,0.09)":"var(--surface2)";
                      return (
                        <div key={s.userId} className="res-row" style={{
                          display:"flex", alignItems:"center", gap:"0.45rem",
                          padding:"0.45rem 0.6rem", borderRadius:"0.55rem",
                          background:isMe?(myWon?"rgba(16,185,129,0.1)":"rgba(79,142,247,0.08)"):mbg,
                          border:`1px solid ${isMe?(myWon?"rgba(16,185,129,0.38)":"rgba(79,142,247,0.28)"):`${mc}33`}`,
                        }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.8rem", width:24, flexShrink:0, textAlign:"center" }}>
                            {idx===0?"🥇":idx===1?"🥈":idx===2?"🥉":`#${idx+1}`}
                          </span>
                          <span style={{ flex:1, fontWeight:800, fontSize:"0.8rem", color:isMe?(myWon?"var(--for)":"var(--cyan)"):"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {s.username}{isMe?" 👤":""}
                          </span>
                          <span className={`badge ${s.side==="for"?"badge-for":"badge-against"}`} style={{ fontSize:"0.52rem" }}>{s.side==="for"?"FOR":"AGN"}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:"1rem", background:scoreGradient(s.total), WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", flexShrink:0, minWidth:28, textAlign:"right" }}>
                            {s.total}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Arguments */}
                <div className="glass" style={{ padding:"0.5rem 0.875rem", flexShrink:0 }}>
                  <div style={{ display:"flex", alignItems:"center", cursor:"pointer", marginBottom:showTx?"0.38rem":0 }} onClick={()=>setShowTx(v=>!v)}>
                    <span style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--cyan)", flex:1 }}>🎤 Arguments ({debate.rounds.length})</span>
                    <span style={{ color:"var(--muted)", fontSize:"0.65rem" }}>{showTx?"▲":"▼"}</span>
                  </div>
                  {showTx && (
                    <div style={{ display:"flex", flexDirection:"column", gap:"0.28rem", maxHeight:"5.5rem", overflowY:"auto" }}>
                      {debate.rounds.length===0 && <p style={{ color:"var(--muted)", fontSize:"0.7rem", textAlign:"center", margin:0 }}>Nothing captured.</p>}
                      {debate.rounds.map((r,i) => (
                        <div key={i} style={{
                          padding:"0.32rem 0.48rem", borderRadius:"0.375rem",
                          background:r.side==="for"?"rgba(16,185,129,0.05)":"rgba(244,63,94,0.05)",
                          border:`1px solid ${r.side==="for"?"rgba(16,185,129,0.15)":"rgba(244,63,94,0.15)"}`,
                        }}>
                          <div style={{ display:"flex", gap:"0.28rem", alignItems:"center", marginBottom:"0.08rem" }}>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.57rem", color:"var(--muted)" }}>R{r.roundNumber}</span>
                            <span style={{ fontWeight:700, color:"var(--text)", fontSize:"0.67rem" }}>{r.speakerUsername}</span>
                            <span className={`badge ${r.side==="for"?"badge-for":"badge-against"}`} style={{ fontSize:"0.51rem", marginLeft:"auto" }}>{r.side==="for"?"FOR":"AGN"}</span>
                          </div>
                          <p style={{ color:"var(--subtle)", fontSize:"0.67rem", margin:0, lineHeight:1.35 }}>{r.argument?clip(r.argument,90):"(no transcript)"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display:"flex", gap:"0.4rem", flexShrink:0 }}>
                  <button className="play-btn" onClick={()=>navigate("/")} style={{
                    flex:1, padding:"0.55rem", borderRadius:"0.625rem",
                    background:"linear-gradient(135deg,#4f46e5,#7c3aed)",
                    border:"none", color:"#fff", fontWeight:900, fontSize:"0.875rem",
                    cursor:"pointer", fontFamily:"inherit",
                    boxShadow:"0 4px 18px rgba(124,58,237,0.35)",
                    letterSpacing:"0.01em",
                  }}>⚔️ Play Again</button>
                  <button className="btn-ghost" style={{ padding:"0.55rem 0.75rem", fontSize:"0.82rem" }}
                    onClick={()=>{
                      const txt=`I just debated "${debate.topic}" on Argumint${myWon?" and WON":""}! Score: ${myScore.total}/100`;
                      if(navigator.share)navigator.share({title:"Argumint Result",text:txt,url:window.location.href});
                      else navigator.clipboard?.writeText(txt);
                    }}>📤</button>
                </div>
              </div>

              {/* ──────────────── RIGHT SIDEBAR ──────────────── */}
              <div className="res-col" style={{ display:"flex", flexDirection:"column", gap:"0.5rem", overflow:"hidden", minHeight:0 }}>

                {/* Why They Won */}
                {result.winningPoints.length>0 && (
                  <div style={{ position:"relative", borderRadius:"0.875rem", overflow:"hidden", flexShrink:0 }}>
                    <div className="glass" style={{ padding:"0.7rem 0.875rem", ...(isPro?{}:{ filter:"blur(5px)", pointerEvents:"none", userSelect:"none" }) }}>
                      <div style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--gold)", marginBottom:"0.38rem" }}>
                        🔥 Why {result.winnerSide==="for"?"FOR":"AGAINST"} Won
                      </div>
                      <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:"0.28rem" }}>
                        {result.winningPoints.slice(0,4).map((pt,i)=>(
                          <li key={i} style={{ display:"flex", gap:"0.38rem", alignItems:"flex-start" }}>
                            <span style={{ color:"var(--for)", fontSize:"0.62rem", flexShrink:0, marginTop:"0.12rem" }}>✦</span>
                            <span style={{ color:"var(--text)", fontSize:"0.7rem", lineHeight:1.4 }}>{clip(pt,68)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {!isPro && lockOverlay("Why They Won")}
                  </div>
                )}

                {/* Weaknesses */}
                <div style={{ position:"relative", borderRadius:"0.875rem", overflow:"hidden", flexShrink:0 }}>
                  <div className="glass" style={{ padding:"0.7rem 0.875rem", ...(isPro?{}:{ filter:"blur(5px)", pointerEvents:"none", userSelect:"none" }) }}>
                    <div style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--against)", marginBottom:"0.38rem" }}>❌ Weaknesses</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:"0.25rem" }}>
                      {improvements.length>0 ? improvements.slice(0,3).map((s,i)=>(
                        <div key={i} style={{
                          display:"flex", alignItems:"flex-start", gap:"0.35rem",
                          padding:"0.25rem 0.42rem", borderRadius:"0.4rem",
                          background:"rgba(244,63,94,0.06)", border:"1px solid rgba(244,63,94,0.14)",
                        }}>
                          <span style={{ color:"var(--against)", fontSize:"0.62rem", flexShrink:0, marginTop:"0.1rem" }}>•</span>
                          <span style={{ color:"var(--subtle)", fontSize:"0.7rem", lineHeight:1.4 }}>{clip(s,60)}</span>
                        </div>
                      )) : <p style={{ color:"var(--muted)", fontSize:"0.7rem", margin:0, fontStyle:"italic" }}>No major gaps found.</p>}
                    </div>
                  </div>
                  {!isPro && lockOverlay("Weakness Detection")}
                </div>

                {/* AI Analysis */}
                <div style={{ position:"relative", borderRadius:"0.875rem", overflow:"hidden", flex:1, minHeight:0 }}>
                  <div className="glass" style={{ height:"100%", padding:"0.7rem 0.875rem", display:"flex", flexDirection:"column", ...(isPro?{}:{ filter:"blur(5px)", pointerEvents:"none", userSelect:"none" }) }}>
                    <div style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"#a78bfa", marginBottom:"0.38rem", flexShrink:0 }}>🤖 AI Analysis</div>
                    <p style={{ margin:0, fontSize:"0.72rem", color:"var(--subtle)", lineHeight:1.55, flex:1, minHeight:0, overflowY:"auto" }}>
                      {myScore.feedback||result.summary||"No AI feedback available."}
                    </p>
                  </div>
                  {!isPro && lockOverlay("AI Judge Analysis")}
                </div>

                {/* Judge Scores (if any) */}
                {judgeScores.length>0 && (
                  <div style={{ position:"relative", borderRadius:"0.875rem", overflow:"hidden", flexShrink:0 }}>
                    <div className="glass" style={{ padding:"0.7rem 0.875rem", ...(isPro?{}:{ filter:"blur(5px)", pointerEvents:"none", userSelect:"none" }) }}>
                      <div style={{ fontSize:"0.53rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"#a78bfa", marginBottom:"0.38rem" }}>⚖️ Judge Scores</div>
                      {result.scores.map(aiScore=>{
                        const sfu=judgeScores.map(js=>({ judgeUsername:js.judgeUsername, score:js.scores.find(s=>s.userId===aiScore.userId)?.score??null })).filter(s=>s.score!==null) as {judgeUsername:string;score:number}[];
                        const avg=sfu.length>0?Math.round(sfu.reduce((a,x)=>a+x.score,0)/sfu.length):null;
                        const bl=avg!==null?Math.round((aiScore.total+avg)/2):null;
                        const isMe=aiScore.userId===user?.id;
                        return (
                          <div key={aiScore.userId} style={{ display:"flex", alignItems:"center", gap:"0.45rem", padding:"0.28rem 0", borderBottom:"1px solid var(--border)" }}>
                            <span style={{ flex:1, fontWeight:700, fontSize:"0.72rem", color:isMe?"var(--cyan)":"var(--text)" }}>{aiScore.username}{isMe?" 👤":""}</span>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.7rem", color:"var(--muted)" }}>AI: <strong style={{ color:"var(--cyan)" }}>{aiScore.total}</strong></span>
                            {avg!==null&&<span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.7rem", color:"var(--muted)" }}>→ <strong style={{ color:"#a78bfa" }}>{bl}</strong></span>}
                          </div>
                        );
                      })}
                    </div>
                    {!isPro && lockOverlay("Judge Scores")}
                  </div>
                )}
              </div>

            </div>{/* end 3-col grid */}
          </div>
        )}{/* end result && myScore */}

      </div>
    </>
  );
}
