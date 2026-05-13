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
    enabled: !!debateId,
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

  useEffect(() => {
    if (!socket || !isConnected || !debateId) return;
    socket.emit("debate:get-state", { debateId }, (res: any) => {
      if (!res?.success) { setError(res?.error || "Failed to load debate"); return; }
      setDebate(res.debate as Debate);
      // If debate is already ended (navigating directly to result URL),
      // refresh user so stats/XP in the UI reflect the latest DB values.
      if (res.debate?.status === "ended") void checkAuth();
    });
  }, [socket, isConnected, debateId]);

  useEffect(() => {
    if (!socket) return;
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

  return (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes mvpPulse {
          0%,100% { box-shadow:0 0 0 0 rgba(16,185,129,0.0); }
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
        .mvp-glow { animation: mvpPulse 2s ease-in-out infinite; }
        .level-up-pop { animation: levelUpPop 0.5s cubic-bezier(.34,1.56,.64,1) forwards; }
        .level-badge-pop { animation: levelBadgePop 0.55s cubic-bezier(.34,1.56,.64,1) forwards; }
        .shimmer-text {
          background: linear-gradient(90deg, #f59e0b, #10b981, #22d3ee, #f59e0b);
          background-size: 300% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 2s linear infinite;
        }
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
      <div className="bg-grid" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"var(--bg)" }}>


        {/* ── MAIN ── */}
        <main style={{ flex:1, overflow:"auto", display:"flex", flexDirection:"column", padding: isMobile ? "0.75rem 0.75rem 2rem" : "0.5rem 0.875rem 1.5rem" }}>
          <button onClick={() => navigate("/")} className="btn-ghost" style={{ alignSelf:"flex-start", fontSize:"0.82rem", padding:"0.35rem 0.75rem", marginBottom:"0.5rem" }}>← Home</button>

          {/* Motion strip */}
          <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"0.5rem" }}>
            <span style={{ fontSize:"0.6rem", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--muted)", flexShrink:0 }}>Motion</span>
            <span style={{ fontSize:"0.82rem", fontWeight:800, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace: isMobile ? "normal" : "nowrap" }}>{debate.topic}</span>
          </div>

          {/* ── JUDGING ── */}
          {isJudging && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div className="glass fade-up glow-cyan" style={{ padding: isMobile ? "1.5rem 1.25rem" : "2.5rem 3rem", textAlign:"center", border:"1px solid rgba(34,211,238,0.2)", maxWidth:380 }}>
                <img src="/logo/logo.png" alt="Judging…" className="logo-heartbeat" style={{ width: 64, height: 64, margin: "0 auto 1.25rem" }} />
                <h2 style={{ fontSize:"1.2rem", fontWeight:800, color:"var(--text)", margin:"0 0 0.35rem" }} className="text-glow-cyan">AI Judge reviewing…</h2>
                <p style={{ color:"var(--muted)", fontSize:"0.82rem", margin:0 }}>Scoring all speakers — 5–15 sec</p>
              </div>
            </div>
          )}

          {/* ── JUDGE FAILED ── */}
          {judgingError && !result && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ padding:"1.5rem 2rem", background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:"1rem", textAlign:"center", maxWidth:380 }}>
                <p style={{ fontWeight:700, color:"var(--gold)", marginBottom:"0.25rem" }}>Judge unavailable</p>
                <p style={{ color:"var(--muted)", fontSize:"0.82rem", margin:0 }}>{judgingError}</p>
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {result && myScore && (
            <>
              {/* ── HERO BANNER ── */}
              <div className={`glass fade-up ${myWon ? "mvp-glow" : ""}`} style={{
                marginBottom:"0.5rem", padding:"0.625rem 1rem",
                background: myWon ? "rgba(16,185,129,0.08)" : "rgba(249,247,255,0.88)",
                border:`1px solid ${myWon ? "rgba(16,185,129,0.45)" : "var(--border2)"}`,
                display:"flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? "0.625rem" : "1.5rem",
              }}>
                {/* Top row: winning side + outcome + score */}
                <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", width:"100%", flexWrap:"wrap" }}>
                  {/* Winning side */}
                  <span style={{ fontSize: isMobile ? "1.1rem" : "1.35rem", fontWeight:900, letterSpacing:"-0.02em", color: result.winnerSide==="for" ? "var(--for)" : "var(--against)" }}>
                    {result.winnerSide==="for" ? "FOR" : "AGAINST"} WINS
                  </span>
                  {/* Winner name(s) */}
                  <div style={{ display:"flex", gap:"0.4rem", flexWrap:"wrap", flex:1 }}>
                    {rankedAll.filter(s => s.side===result.winnerSide).map(s => (
                      <span key={s.userId} style={{ fontSize:"0.82rem", fontWeight:800, color:"var(--text)" }}>
                        {s.username}{s.userId===user?.id ? " 🔥" : ""}
                      </span>
                    ))}
                  </div>
                  {/* Outcome badge */}
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <div style={{ fontSize: isMobile ? "0.9rem" : "1.05rem", fontWeight:900, color:outcome?.color, letterSpacing:"-0.01em" }}>{outcome?.label}</div>
                    <div style={{ fontSize:"0.58rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.08em" }}>{outcome?.badge}</div>
                  </div>
                  {/* My score */}
                  <div style={{ textAlign:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize: isMobile ? "1.6rem" : "2.2rem", fontWeight:900, lineHeight:1, background:scoreGradient(myScore.total), WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>
                      {myScore.total}
                    </span>
                    <div style={{ fontSize:"0.58rem", color:"var(--muted)", fontWeight:600 }}>/ 100</div>
                  </div>
                </div>

                {/* XP Gained + Level progress */}
                <div style={{ display:"flex", alignItems:"center", gap:"0.875rem", flexShrink:0 }}>
                  {/* +XP static badge (visible after popup) */}
                  <div style={{ textAlign:"center", flexShrink:0 }}>
                    <div style={{ fontSize:"1.1rem", fontWeight:900, background:scoreGradient(xpGained), WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", lineHeight:1 }}>
                      +{xpGained}
                    </div>
                    <div style={{ fontSize:"0.58rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.1em" }}>XP</div>
                  </div>

                  {/* Level badge + animated progress bar */}
                  {(() => {
                    const shownLevel = displayedLevel ?? levelInfo.current.level;
                    const shownTitle = displayedTitle ?? levelInfo.current.title;
                    const shownHasNext = displayedBarNext;
                    const badgeIsNew = leveledUp && shownLevel === levelInfo.current.level;
                    return (
                      <div style={{ display:"flex", flexDirection:"column", gap:"0.2rem", minWidth: isMobile ? 100 : 120 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", flexWrap:"wrap" }}>
                          <span
                            className={levelBadgePop ? "level-badge-pop" : ""}
                            style={{
                              fontFamily:"'JetBrains Mono',monospace", fontSize:"0.7rem", fontWeight:900,
                              padding:"0.1rem 0.4rem", borderRadius:"0.3rem",
                              background: badgeIsNew ? "rgba(16,185,129,0.15)" : "rgba(79,142,247,0.12)",
                              border:`1px solid ${badgeIsNew ? "rgba(16,185,129,0.4)" : "rgba(79,142,247,0.3)"}`,
                              color: badgeIsNew ? "var(--for)" : "var(--cyan)",
                              display:"inline-block",
                              transition:"background 0.3s, border-color 0.3s, color 0.3s",
                            }}>
                            Lv.{shownLevel}
                          </span>
                          <span style={{ fontSize:"0.72rem", fontWeight:700, color:"var(--text)", transition:"color 0.3s" }}>{shownTitle}</span>
                        </div>
                        {shownHasNext && (
                          <div>
                            <div className="score-bar-track" style={{ height:5 }}>
                              <div style={{ height:"100%", borderRadius:"9999px", background:"linear-gradient(90deg,#4f8ef7,#22d3ee)", width:`${barPct}%`, transition: barTransition ? "width 0.85s cubic-bezier(.4,0,.2,1)" : "none" }} />
                            </div>
                            <div style={{ fontSize:"0.56rem", color:"var(--muted)", marginTop:"0.15rem" }}>
                              {levelInfo.progressXP}/{levelInfo.neededXP} XP
                            </div>
                          </div>
                        )}
                        {!shownHasNext && (
                          <div style={{ fontSize:"0.6rem", color:"var(--for)", fontWeight:700 }}>MAX LEVEL</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── LEVEL-UP BANNER ── */}
              {showLevelUp && (
                <div className="level-up-pop" style={{
                  marginBottom:"0.5rem", padding:"0.875rem 1.25rem",
                  borderRadius:"0.875rem",
                  background:"rgba(16,185,129,0.08)",
                  border:"1px solid rgba(16,185,129,0.4)",
                  display:"flex", alignItems:"center", gap:"1rem",
                  boxShadow:"0 0 24px rgba(16,185,129,0.18)",
                }}>
                  <span style={{ fontSize: isMobile ? "1.75rem" : "2.25rem", flexShrink:0 }}>⬆</span>
                  <div>
                    <div className="shimmer-text" style={{ fontSize: isMobile ? "1rem" : "1.2rem", fontWeight:900, letterSpacing:"-0.01em" }}>
                      LEVEL UP!
                    </div>
                    <div style={{ fontSize:"0.82rem", color:"var(--text)", fontWeight:700, marginTop:"0.1rem" }}>
                      You are now <span style={{ color:"var(--for)" }}>Level {levelInfo.current.level}</span> — {newLevelTitle}
                    </div>
                  </div>
                </div>
              )}

              {/* ── 3-COLUMN GRID ── */}
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.1fr 0.85fr", gap:"0.5rem", paddingBottom:"0.5rem" }}>

                {/* ══ COL A: BARS + KEY MOMENTS ══ */}
                <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>

                  {/* Score bars */}
                  <div className="glass fade-up" style={{ padding:"0.875rem 1rem", flex:"none" }}>
                    <div style={{ fontSize:"0.58rem", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--cyan)", marginBottom:"0.625rem" }}>
                      Your Scores
                    </div>
                    {BAR_ORDER.map((k) => (
                      <ScoreBar key={k as string} k={k as string} val={myScore[k] as number} />
                    ))}
                  </div>

                  {/* Key Moments */}
                  {(bestMove || missed) && (
                    <div className="glass fade-up" style={{ padding:"0.875rem 1rem" }}>
                      <div style={{ fontSize:"0.58rem", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--cyan)", marginBottom:"0.625rem" }}>
                        Key Moments
                      </div>
                      {bestMove && (
                        <div style={{ marginBottom:"0.55rem" }}>
                          <div style={{ fontSize:"0.65rem", fontWeight:700, color:"var(--for)", marginBottom:"0.2rem" }}>🔥 Best Move</div>
                          <p style={{ margin:0, fontSize:"0.78rem", color:"var(--subtle)", lineHeight:1.45, fontStyle:"italic" }}>"{bestMove}"</p>
                        </div>
                      )}
                      {missed && (
                        <div>
                          <div style={{ fontSize:"0.65rem", fontWeight:700, color:"var(--against)", marginBottom:"0.2rem" }}>✗ Missed</div>
                          <p style={{ margin:0, fontSize:"0.78rem", color:"var(--subtle)", lineHeight:1.45, fontStyle:"italic" }}>"{missed}"</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ══ COL B: STRONG/WEAK + WHY WON ══ */}
                <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>

                  {/* Strong / Weak side-by-side */}
                  <div className="glass fade-up" style={{ padding:"0.875rem 1rem" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.75rem" }}>
                      {/* Strong */}
                      <div>
                        <div style={{ fontSize:"0.62rem", fontWeight:700, color:"var(--for)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"0.5rem" }}>✅ Strong</div>
                        {strengths.length > 0 ? (
                          <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:"0.4rem" }}>
                            {strengths.slice(0, 3).map((s, i) => (
                              <li key={i} style={{ display:"flex", gap:"0.35rem", alignItems:"flex-start" }}>
                                <span style={{ color:"var(--for)", fontSize:"0.68rem", flexShrink:0, marginTop:"0.1rem" }}>•</span>
                                <span style={{ color:"var(--subtle)", fontSize:"0.75rem", lineHeight:1.4 }}>{clip(s, 60)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ color:"var(--muted)", fontSize:"0.75rem", margin:0, fontStyle:"italic" }}>Nothing stood out</p>
                        )}
                      </div>
                      {/* Weak */}
                      <div>
                        <div style={{ fontSize:"0.62rem", fontWeight:700, color:"var(--against)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"0.5rem" }}>❌ Weak</div>
                        {improvements.length > 0 ? (
                          <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:"0.4rem" }}>
                            {improvements.slice(0, 3).map((s, i) => (
                              <li key={i} style={{ display:"flex", gap:"0.35rem", alignItems:"flex-start" }}>
                                <span style={{ color:"var(--against)", fontSize:"0.68rem", flexShrink:0, marginTop:"0.1rem" }}>•</span>
                                <span style={{ color:"var(--subtle)", fontSize:"0.75rem", lineHeight:1.4 }}>{clip(s, 60)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ color:"var(--muted)", fontSize:"0.75rem", margin:0, fontStyle:"italic" }}>No major gaps</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Why won — game hints */}
                  {result.winningPoints.length > 0 && (
                    <div className="glass fade-up" style={{ padding:"0.875rem 1rem" }}>
                      <div style={{ fontSize:"0.58rem", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--cyan)", marginBottom:"0.55rem" }}>
                        🔥 Why {result.winnerSide==="for" ? "FOR" : "AGAINST"} Won
                      </div>
                      <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:"0.4rem" }}>
                        {result.winningPoints.slice(0, 4).map((pt, i) => (
                          <li key={i} style={{ display:"flex", gap:"0.45rem", alignItems:"flex-start" }}>
                            <span style={{ color:"var(--for)", fontSize:"0.7rem", flexShrink:0, marginTop:"0.1rem" }}>•</span>
                            <span style={{ color:"var(--text)", fontSize:"0.77rem", lineHeight:1.45 }}>{clip(pt, 72)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* ══ COL C: LEADERBOARD + TRANSCRIPT + CTA ══ */}
                <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>

                  {/* Leaderboard */}
                  <div className="glass fade-up" style={{ padding:"0.875rem 1rem" }}>
                    <div style={{ fontSize:"0.58rem", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"var(--cyan)", marginBottom:"0.625rem" }}>
                      Standings
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:"0.35rem" }}>
                      {rankedAll.map((s, idx) => {
                        const isMe = s.userId === user?.id;
                        const won  = s.side === result.winnerSide;
                        return (
                          <div key={s.userId} style={{
                            display:"flex", alignItems:"center", gap:"0.5rem",
                            padding:"0.5rem 0.625rem", borderRadius:"0.5rem",
                            background: isMe
                              ? (myWon ? "rgba(16,185,129,0.12)" : "rgba(79,142,247,0.1)")
                              : "rgba(249,247,255,0.45)",
                            border:`1px solid ${isMe ? (myWon ? "rgba(16,185,129,0.4)" : "rgba(79,142,247,0.35)") : "var(--border)"}`,
                          }}>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.65rem", color:"var(--muted)", width:20, flexShrink:0 }}>
                              #{idx+1}
                            </span>
                            {won && idx===0 && <span style={{ fontSize:"0.7rem", flexShrink:0 }}>🏆</span>}
                            <span style={{ flex:1, fontWeight:800, fontSize:"0.82rem", color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {s.username}{isMe ? " 👤" : ""}
                            </span>
                            <span style={{
                              fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:"1rem",
                              background:scoreGradient(s.total), WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
                              flexShrink:0,
                            }}>
                              {s.total}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Transcript */}
                  <div className="glass fade-up" style={{ padding:"0.5rem 0.875rem" }}>
                    <div style={{ display:"flex", alignItems:"center", cursor:"pointer", marginBottom: showTx ? "0.5rem" : 0 }}
                      onClick={() => setShowTx(v => !v)}>
                      <span style={{ fontSize:"0.58rem", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--cyan)", flex:1 }}>
                        🎤 Arguments ({debate.rounds.length})
                      </span>
                      <span style={{ color:"var(--muted)", fontSize:"0.7rem" }}>{showTx ? "▲" : "▼"}</span>
                    </div>
                    {showTx && (
                      <div style={{ display:"flex", flexDirection:"column", gap:"0.35rem", maxHeight:"6.5rem", overflowY:"auto" }}>
                        {debate.rounds.length === 0 && (
                          <p style={{ color:"var(--muted)", fontSize:"0.75rem", textAlign:"center", margin:0 }}>Nothing captured.</p>
                        )}
                        {debate.rounds.map((r, i) => (
                          <div key={i} style={{
                            padding:"0.4rem 0.55rem", borderRadius:"0.375rem",
                            background: r.side==="for" ? "rgba(16,185,129,0.05)" : "rgba(244,63,94,0.05)",
                            border:`1px solid ${r.side==="for" ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)"}`,
                          }}>
                            <div style={{ display:"flex", gap:"0.35rem", alignItems:"center", marginBottom:"0.12rem" }}>
                              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.6rem", color:"var(--muted)" }}>R{r.roundNumber}</span>
                              <span style={{ fontWeight:700, color:"var(--text)", fontSize:"0.7rem" }}>{r.speakerUsername}</span>
                              <span className={`badge ${r.side==="for" ? "badge-for" : "badge-against"}`} style={{ fontSize:"0.54rem", marginLeft:"auto" }}>
                                {r.side==="for" ? "FOR" : "AGN"}
                              </span>
                            </div>
                            <p style={{ color:"var(--subtle)", fontSize:"0.7rem", margin:0, lineHeight:1.35 }}>
                              {r.argument ? clip(r.argument, 90) : "(no transcript)"}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  <button onClick={() => navigate("/")} className="btn-primary"
                    style={{ width:"100%", padding:"0.7rem", fontSize:"1rem", fontWeight:900, letterSpacing:"0.02em" }}>
                    ⚔️ Play Again
                  </button>
                </div>

              </div>

              {/* ── JUDGE SCORES PANEL ── */}
              {judgeScores.length > 0 && result && (
                <div className="glass fade-up" style={{ marginTop:"0.5rem", padding:"0.875rem 1rem", border:"1px solid rgba(167,139,250,0.3)", background:"rgba(167,139,250,0.04)" }}>
                  <div style={{ fontSize:"0.58rem", fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"#a78bfa", marginBottom:"0.75rem" }}>
                    ⚖️ Human Judge Scores
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(200px,1fr))", gap:"0.5rem" }}>
                    {result.scores.map((aiScore) => {
                      // Collect all judges' scores for this participant
                      const scoresForUser = judgeScores.map((js) => ({
                        judgeUsername: js.judgeUsername,
                        score: js.scores.find((s) => s.userId === aiScore.userId)?.score ?? null,
                      })).filter((s) => s.score !== null) as { judgeUsername: string; score: number }[];

                      const avgJudgeScore = scoresForUser.length > 0
                        ? Math.round(scoresForUser.reduce((sum, s) => sum + s.score, 0) / scoresForUser.length)
                        : null;

                      const blended = avgJudgeScore !== null
                        ? Math.round((aiScore.total + avgJudgeScore) / 2)
                        : null;

                      const reliability = avgJudgeScore !== null
                        ? Math.round((1 - Math.abs(aiScore.total - avgJudgeScore) / 100) * 100)
                        : null;

                      const isMe = aiScore.userId === user?.id;
                      return (
                        <div key={aiScore.userId} style={{
                          padding:"0.75rem 0.875rem", borderRadius:"0.625rem",
                          background: isMe ? "rgba(167,139,250,0.1)" : "rgba(249,247,255,0.5)",
                          border:`1px solid ${isMe ? "rgba(167,139,250,0.4)" : "var(--border)"}`,
                        }}>
                          <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginBottom:"0.5rem" }}>
                            <span style={{ fontWeight:800, fontSize:"0.85rem", color:"var(--text)" }}>{aiScore.username}{isMe ? " 👤" : ""}</span>
                            <span className={`badge ${aiScore.side === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize:"0.58rem" }}>{aiScore.side === "for" ? "FOR" : "AGN"}</span>
                          </div>
                          <div style={{ display:"flex", gap:"0.75rem", flexWrap:"wrap", marginBottom:"0.4rem" }}>
                            <div style={{ textAlign:"center" }}>
                              <div style={{ fontSize:"0.58rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>AI</div>
                              <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:"0.95rem", color:"var(--cyan)" }}>{aiScore.total}</div>
                            </div>
                            {avgJudgeScore !== null && (
                              <>
                                <div style={{ textAlign:"center" }}>
                                  <div style={{ fontSize:"0.58rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Judges</div>
                                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:"0.95rem", color:"#a78bfa" }}>{avgJudgeScore}</div>
                                </div>
                                <div style={{ textAlign:"center" }}>
                                  <div style={{ fontSize:"0.58rem", color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Blended</div>
                                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:900, fontSize:"0.95rem", background:scoreGradient(blended!), WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>{blended}</div>
                                </div>
                              </>
                            )}
                          </div>
                          {scoresForUser.length > 0 && (
                            <div style={{ fontSize:"0.65rem", color:"var(--muted)" }}>
                              {scoresForUser.map((s, i) => (
                                <span key={i}>{i > 0 ? " · " : ""}{s.judgeUsername}: <strong style={{ color:"#a78bfa" }}>{s.score}</strong></span>
                              ))}
                            </div>
                          )}
                          {reliability !== null && (
                            <div style={{ fontSize:"0.62rem", color: reliability >= 80 ? "var(--for)" : reliability >= 60 ? "var(--gold)" : "var(--against)", marginTop:"0.25rem", fontWeight:700 }}>
                              Reliability: {reliability}%
                            </div>
                          )}
                          {scoresForUser.length === 0 && (
                            <div style={{ fontSize:"0.65rem", color:"var(--muted)", fontStyle:"italic" }}>No judge scores yet</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ margin:"0.625rem 0 0", fontSize:"0.7rem", color:"var(--muted)" }}>
                    Blended = (AI + avg judge) ÷ 2 · Reliability = 1 − |AI − judge| / 100
                  </p>
                </div>
              )}
            </>
          )}

          {/* No score fallback */}
          {result && !myScore && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div className="glass" style={{ padding:"2rem", textAlign:"center", maxWidth:340 }}>
                <p style={{ color:"var(--muted)", marginBottom:"1rem" }}>Score not available — you may not have been in this debate.</p>
                <button onClick={() => navigate("/")} className="btn-primary">Back to Home</button>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}
