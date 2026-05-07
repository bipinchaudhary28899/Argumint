import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
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
  const { code }   = useParams<{ code: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const { socket, isConnected } = useSocket();
  const isMobile   = useIsMobile();

  const [debate,        setDebate]        = useState<Debate | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [judgingError,  setJudgingError]  = useState<string | null>(null);
  const [showTx,        setShowTx]        = useState(false);
  const [xpAnimDone,    setXpAnimDone]    = useState(false);
  const [myXPAward, setMyXPAward] = useState<{ xpGained: number; newXP: number; leveledUp: boolean; newLevel: number; newLevelTitle: string } | null>(null);
  const xpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debateId = typeof window !== "undefined" ? sessionStorage.getItem("activeDebateId") : null;
  useLeaveRoomOnNavigate(code, debate?.roomId, socket);

  useEffect(() => {
    if (!socket || !isConnected || !debateId) return;
    socket.emit("debate:get-state", { debateId }, (res: any) => {
      if (!res?.success) { setError(res?.error || "Failed to load debate"); return; }
      setDebate(res.debate as Debate);
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
    };
    const onFailed = (d: any) => setJudgingError(d?.error || "Judge unavailable");
    socket.on("debate:result-ready",  onReady);
    socket.on("debate:result-failed", onFailed);
    return () => {
      socket.off("debate:result-ready",  onReady);
      socket.off("debate:result-failed", onFailed);
    };
  }, [socket]);

  // Kick off XP float animation 600ms after result lands
  useEffect(() => {
    if (debate?.result) {
      xpTimerRef.current = setTimeout(() => setXpAnimDone(true), 2200);
    }
    return () => { if (xpTimerRef.current) clearTimeout(xpTimerRef.current); };
  }, [debate?.result]);

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
      <div style={{ textAlign:"center" }}>
        <div className="spin" style={{ width:48, height:48, border:"3px solid var(--border2)", borderTopColor:"var(--cyan)", borderRadius:"50%", margin:"0 auto 1rem" }} />
        <p style={{ color:"var(--muted)" }}>Loading results…</p>
      </div>
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

  return (
    <>
      {/* XP float animation keyframes */}
      <style>{`
        @keyframes xpFloat {
          0%   { transform:translateY(0)     opacity:1; }
          80%  { transform:translateY(-28px) opacity:1; }
          100% { transform:translateY(-36px) opacity:0; }
        }
        @keyframes mvpPulse {
          0%,100% { box-shadow:0 0 0 0 rgba(16,185,129,0.0); }
          50%      { box-shadow:0 0 18px 4px rgba(16,185,129,0.35); }
        }
        .mvp-glow { animation: mvpPulse 2s ease-in-out infinite; }
        .xp-float { animation: xpFloat 1.6s ease-out forwards; }
      `}</style>

      <div className="bg-grid" style={{ minHeight:"100vh", display:"flex", flexDirection:"column", background:"var(--bg)" }}>

        {/* ── NAV ── */}
        <nav className="game-nav">
          <button className="nav-logo" onClick={() => navigate("/")}>ARGUMINT</button>
          <div style={{ display:"flex", alignItems:"center", gap:"0.875rem" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.4rem" }}>
              <div className={isConnected ? "pulse-dot pulse-dot-green" : "pulse-dot pulse-dot-red"} />
              {!isMobile && <span style={{ color:"var(--muted)", fontSize:"0.8rem" }}>{isConnected ? "Live" : "Offline"}</span>}
            </div>
            {!isMobile && <span style={{ color:"var(--muted)", fontSize:"0.85rem" }}>{user?.username}</span>}
          </div>
        </nav>

        {/* ── MAIN ── */}
        <main style={{ flex:1, overflow:"auto", display:"flex", flexDirection:"column", padding: isMobile ? "0.75rem 0.75rem 2rem" : "0.5rem 0.875rem 1.5rem" }}>

          {/* Motion strip */}
          <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", marginBottom:"0.5rem" }}>
            <span style={{ fontSize:"0.6rem", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--muted)", flexShrink:0 }}>Motion</span>
            <span style={{ fontSize:"0.82rem", fontWeight:800, color:"var(--text)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace: isMobile ? "normal" : "nowrap" }}>{debate.topic}</span>
          </div>

          {/* ── JUDGING ── */}
          {isJudging && (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div className="glass fade-up glow-cyan" style={{ padding:"2.5rem 3rem", textAlign:"center", border:"1px solid rgba(34,211,238,0.2)", maxWidth:380 }}>
                <div className="spin" style={{ width:52, height:52, border:"4px solid var(--border2)", borderTopColor:"var(--cyan)", borderRadius:"50%", margin:"0 auto 1.25rem" }} />
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
                  {/* +XP badge */}
                  <div style={{ textAlign:"center", position:"relative", flexShrink:0 }}>
                    <div style={{ fontSize:"1.1rem", fontWeight:900, background:scoreGradient(xpGained), WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", lineHeight:1 }}>
                      +{xpGained}
                    </div>
                    <div style={{ fontSize:"0.58rem", fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.1em" }}>XP</div>
                    {!xpAnimDone && (
                      <div className="xp-float" style={{ position:"absolute", top:-2, left:0, right:0, textAlign:"center", fontSize:"0.85rem", fontWeight:900, color:"var(--for)", pointerEvents:"none" }}>
                        +{xpGained}
                      </div>
                    )}
                  </div>

                  {/* Level badge + progress bar */}
                  <div style={{ display:"flex", flexDirection:"column", gap:"0.2rem", minWidth: isMobile ? 100 : 120 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", flexWrap:"wrap" }}>
                      <span style={{
                        fontFamily:"'JetBrains Mono',monospace", fontSize:"0.7rem", fontWeight:900,
                        padding:"0.1rem 0.4rem", borderRadius:"0.3rem",
                        background: leveledUp ? "rgba(16,185,129,0.15)" : "rgba(79,142,247,0.12)",
                        border:`1px solid ${leveledUp ? "rgba(16,185,129,0.4)" : "rgba(79,142,247,0.3)"}`,
                        color: leveledUp ? "var(--for)" : "var(--cyan)",
                      }}>
                        Lv.{levelInfo.current.level}
                      </span>
                      <span style={{ fontSize:"0.72rem", fontWeight:700, color:"var(--text)" }}>{levelInfo.current.title}</span>
                      {leveledUp && <span style={{ fontSize:"0.62rem", fontWeight:900, color:"var(--for)", animation:"xpFloat 1s ease-out forwards" }}>▲ UP!</span>}
                    </div>
                    {levelInfo.next && (
                      <div>
                        <div className="score-bar-track" style={{ height:5 }}>
                          <div style={{ height:"100%", borderRadius:"9999px", background:"linear-gradient(90deg,#4f8ef7,#22d3ee)", width:`${levelInfo.progressPct}%`, transition:"width 1.5s cubic-bezier(.4,0,.2,1)" }} />
                        </div>
                        <div style={{ fontSize:"0.56rem", color:"var(--muted)", marginTop:"0.15rem" }}>
                          {levelInfo.progressXP}/{levelInfo.neededXP} XP
                        </div>
                      </div>
                    )}
                    {!levelInfo.next && (
                      <div style={{ fontSize:"0.6rem", color:"var(--for)", fontWeight:700 }}>MAX LEVEL</div>
                    )}
                  </div>
                </div>
              </div>

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
