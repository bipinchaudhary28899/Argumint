import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ConnectionStatusBanner } from "../components/ConnectionStatusBanner";
import { useSocket } from "../hooks/useSocket";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
import { useReconnectHandler } from "../hooks/useReconnectHandler";
import { useIsMobile } from "../hooks/useIsMobile";
import { RoomHeader, type RoomStatusTone } from "../components/RoomHeader";
import { initials } from "../components/AppShell";
import { Icon, type IconName } from "../components/Icon";
import { getLevelInfo } from "@argumint/shared";
import type { Debate, ScoreBreakdown } from "@argumint/shared"; // ScoreBreakdown used in rankedAll/myScore types

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// Outcome chip shown in the "Your result" card
function getOutcome(rank: number, won: boolean): { label: string; chip: string; icon: IconName } {
  if (won && rank === 1) return { label:"MVP",                  chip:"ds-chip-gold",    icon:"crown"  };
  if (won)              return { label:"WINNER",               chip:"ds-chip-for",     icon:"trophy" };
  if (rank === 2)       return { label:"RUNNER-UP",            chip:"ds-chip-accent",  icon:"star"   };
  return                       { label:`${ordinal(rank)} PLACE`, chip:"ds-chip-neutral", icon:"flag"   };
}

type Cat = "clarity" | "evidence" | "rebuttal" | "organization";
const CATS: Cat[] = ["clarity", "evidence", "rebuttal", "organization"];
const CAT_LABELS: Record<Cat, string> = { clarity:"Clarity", evidence:"Evidence", rebuttal:"Rebuttal", organization:"Organization" };
const CAT_SHORT:  Record<Cat, string> = { clarity:"CLAR", evidence:"EVID", rebuttal:"REBUT", organization:"ORG" };
// Category data colours (kept from the original score breakdown)
const CAT_COLORS: Record<Cat, string> = { clarity:"#22d3ee", evidence:"#10b981", rebuttal:"#f43f5e", organization:"#a78bfa" };

/** Inline style for a gradient-filled number (score/XP data colour) */
function gradText(bg: string): React.CSSProperties {
  return { background: bg, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" };
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
  const timersRef       = useRef<ReturnType<typeof setTimeout>[]>([]);
  const animFiredRef    = useRef(false);

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
    if (animFiredRef.current) return;   // only ever play once
    animFiredRef.current = true;
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
    <div className="ds-room-page" style={{ alignItems:"center", justifyContent:"center", padding:16 }}>
      <div className="ds-card" style={{ padding:32, textAlign:"center", maxWidth:400, display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
        <p style={{ margin:0, color:"var(--ds-against-text)", display:"flex", alignItems:"center", gap:8 }}><Icon name="info" size={18} />{error}</p>
        <button onClick={() => navigate("/")} className="ds-btn ds-btn-secondary">Back to Home</button>
      </div>
    </div>
  );

  if (!debate) return (
    <div className="ds-room-page" style={{ alignItems:"center", justifyContent:"center" }}>
      <img src="/logo/brand/argumint-app-icon-dark.svg" alt="Loading…" className="logo-heartbeat" style={{ width: 72, height: 72 }} />
    </div>
  );

  const result    = debate.result;
  const isJudging = !result && !judgingError;
  const myWon     = !!(result && myScore && myScore.side === result.winnerSide);
  const outcome   = myScore ? getOutcome(myRank, myWon) : null;

  // XP / Level derived data
  const xpGained    = myXPAward?.xpGained ?? myScore?.total ?? 0;
  const newXP       = myXPAward?.newXP ?? ((user as any)?.xp ?? 0) + xpGained;
  const levelInfo   = getLevelInfo(newXP);
  const leveledUp   = myXPAward?.leveledUp ?? false;
  const newLevelTitle = myXPAward?.newLevelTitle ?? levelInfo.current.title;

  // Room header status pill
  const status: { label: string; tone: RoomStatusTone } =
    result       ? { label:"Results",        tone: result.winnerSide } :
    judgingError ? { label:"Judging failed", tone:"gold" } :
                   { label:"Judging",        tone:"accent" };

  const goHome = () => navigate("/");

  const card: React.CSSProperties = {
    padding: isMobile ? 18 : 24, display:"flex", flexDirection:"column", gap:14, minWidth:0,
  };

  // ── Compact Pro upgrade banner (free users, replaces the analysis button) ─
  const ProUpgradeBanner = (
    <button type="button" className="res-pro" onClick={() => navigate("/pricing")}>
      <span style={{ width:40, height:40, borderRadius:12, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:"var(--ds-gold-bg)", color:"var(--ds-gold-text)" }}>
        <Icon name="lock" size={18} />
      </span>
      <span style={{ flex:"1 1 160px", minWidth:0, display:"flex", flexDirection:"column", gap:2 }}>
        <span style={{ fontWeight:800, fontSize:14, color:"var(--ds-gold-text)" }}>Full debate review</span>
        <span style={{ fontSize:13, lineHeight:1.45, color:"var(--ds-muted)" }}>Performance breakdown · AI analysis · Strengths · Weaknesses · Key moments</span>
      </span>
      <span className="ds-chip ds-chip-gold" style={{ border:"1px solid var(--ds-gold-line)" }}><Icon name="bolt" size={14} />Go Pro — ₹50/mo</span>
    </button>
  );

  return (
    <>
      <style>{`
        @keyframes levelUpPop {
          0%   { transform:scale(0.7) translateY(12px); opacity:0; }
          60%  { transform:scale(1.06) translateY(-2px); opacity:1; }
          100% { transform:scale(1) translateY(0); opacity:1; }
        }
        @keyframes levelBadgePop {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.3); }
          60%  { transform: scale(0.94); }
          100% { transform: scale(1); }
        }
        @keyframes cardFadeUp {
          0%   { opacity:0; transform:translateY(10px); }
          100% { opacity:1; transform:translateY(0); }
        }
        @keyframes rhetorBadgePop {
          0%   { opacity:0; transform:scale(0.6) translateY(8px); }
          65%  { opacity:1; transform:scale(1.1) translateY(-2px); }
          100% { opacity:1; transform:scale(1) translateY(0); }
        }
        @keyframes rankDeltaFloat {
          0%   { opacity:0; transform:translateY(10px); }
          30%  { opacity:1; transform:translateY(-3px); }
          100% { opacity:1; transform:translateY(0); }
        }
        @keyframes barFillIn {
          from { transform:scaleX(0); transform-origin:left; }
          to   { transform:scaleX(1); transform-origin:left; }
        }
        .level-up-pop    { animation: levelUpPop 0.5s cubic-bezier(.34,1.56,.64,1) forwards; }
        .level-badge-pop { display:inline-block; animation: levelBadgePop 0.55s cubic-bezier(.34,1.56,.64,1) forwards; }
        .res-col > * { animation: cardFadeUp 0.38s cubic-bezier(.4,0,.2,1) both; }
        .res-col > *:nth-child(2) { animation-delay:0.08s; }
        .res-col > *:nth-child(3) { animation-delay:0.16s; }
        .rhetor-badge    { animation:rhetorBadgePop 0.45s cubic-bezier(.34,1.56,.64,1) both; }
        .rank-delta-chip { animation:rankDeltaFloat 0.5s ease-out 0.35s both; }
        .bar-fill-in     { animation:barFillIn 0.9s cubic-bezier(.4,0,.2,1) both; }
        .res-page button:focus-visible { outline: 2px solid var(--ds-accent-line); outline-offset: 2px; }
        .res-pro { width:100%; box-sizing:border-box; padding:14px 16px; border-radius:16px; cursor:pointer; text-align:left;
          display:flex; flex-wrap:wrap; align-items:center; gap:12px; font:inherit; color:var(--ds-text);
          background:var(--ds-gold-bg); border:1px solid var(--ds-gold-line); transition:transform .15s, box-shadow .15s; }
        .res-pro:hover { transform:translateY(-1px); box-shadow:var(--ds-shadow); }
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
          <div className="ds-card" style={{
            textAlign:"center",
            padding: isMobile ? "28px 40px" : "40px 64px",
            borderColor:"var(--ds-gold-line)",
          }}>
            <div className="ds-eyebrow" style={{ color:"var(--ds-gold-text)", marginBottom:8 }}>Points earned</div>
            <div className="ds-mono" style={{
              fontSize: isMobile ? 72 : 96, fontWeight:800, lineHeight:1, letterSpacing:"-0.03em",
              color:"var(--ds-gold-text)",
            }}>
              +{popupCount}
            </div>
            <div className="ds-mono" style={{ fontSize:16, fontWeight:700, color:"var(--ds-gold-text)", letterSpacing:"0.15em", marginTop:4 }}>
              XP
            </div>
          </div>
        </div>
      )}

      <ConnectionStatusBanner isConnected={isConnected} isReconnecting={isReconnecting} />
      <div className="ds-room-page res-page">
        <RoomHeader
          onLeave={goHome}
          leaveLabel="Leave"
          motion={debate.topic}
          status={status}
          code={debate.roomCode || code}
        />

        <main className="ds-room-main" style={isMobile ? undefined : { paddingTop:28 }}>

          {/* ── JUDGING ── */}
          {isJudging && (
            <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div className="ds-card fade-up" style={{ padding: isMobile ? "28px 20px" : "40px 48px", textAlign:"center", maxWidth:380, display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                <img src="/logo/brand/argumint-app-icon-dark.svg" alt="Judging…" className="logo-heartbeat" style={{ width:64, height:64, marginBottom:12 }} />
                <h2 style={{ fontSize:20, fontWeight:800, color:"var(--ds-text)", margin:0 }}>AI Judge reviewing…</h2>
                <p className="ds-sub" style={{ fontSize:14 }}>Scoring all speakers — 5–15 sec</p>
              </div>
            </div>
          )}

          {/* ── JUDGE FAILED ── */}
          {judgingError && !result && (
            <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ padding:"24px 32px", background:"var(--ds-gold-bg)", border:"1px solid var(--ds-gold-line)", borderRadius:20, textAlign:"center", maxWidth:380 }}>
                <p style={{ fontWeight:700, color:"var(--ds-gold-text)", margin:"0 0 4px" }}>Judge unavailable</p>
                <p style={{ color:"var(--ds-muted)", fontSize:14, margin:0 }}>{judgingError}</p>
              </div>
            </div>
          )}

          {/* ── NO SCORE FALLBACK ── */}
          {result && !myScore && (
            <div style={{ minHeight:"60vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div className="ds-card" style={{ padding:32, textAlign:"center", maxWidth:360, display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
                <p className="ds-sub">Score not available — you may not have been in this debate.</p>
                <button onClick={goHome} className="ds-btn ds-btn-primary">Back to Home</button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              MAIN RESULT LAYOUT
              ══════════════════════════════════════════ */}
          {result && myScore && outcome && (() => {
            const winSide   = result.winnerSide;
            const winText   = winSide === "for" ? "FOR" : "AGAINST";
            const sideAvg   = (side: "for" | "against") => {
              const xs = rankedAll.filter((s) => s.side === side);
              return xs.length ? Math.round(xs.reduce((a, s) => a + s.total, 0) / xs.length) : null;
            };
            const forAvg     = sideAvg("for");
            const againstAvg = sideAvg("against");

            // Rhetoric trait (strongest category) + achievement badges
            const topCat   = CATS.reduce((a, b) => (myScore[a] > myScore[b] ? a : b));
            const traitMap: Record<Cat, { label: string; icon: IconName }> = {
              clarity:      { label:"Crystal Communicator", icon:"message" },
              evidence:     { label:"Evidence Expert",      icon:"chart"   },
              rebuttal:     { label:"Sharp Rebutter",       icon:"shield"  },
              organization: { label:"Logical Thinker",      icon:"sliders" },
            };
            const trait    = traitMap[topCat];
            const avgScore = rankedAll.length > 1 ? Math.round(rankedAll.reduce((s, x) => s + x.total, 0) / rankedAll.length) : null;
            const aboveAvg = avgScore !== null ? myScore.total - avgScore : null;
            const achiev: { label: string; icon: IconName; chip: string }[] = [];
            if (myRank === 1 && rankedAll.length > 1) achiev.push({ label:"Top Scorer",       icon:"crown", chip:"ds-chip-gold"    });
            if (myScore.total >= 85)                  achiev.push({ label:"Elite Debater",    icon:"bolt",  chip:"ds-chip-against" });
            else if (myScore.total >= 70)             achiev.push({ label:"Strong Performer", icon:"star",  chip:"ds-chip-accent"  });

            // Level badge — shows the OLD level until the level-up animation flips it
            const shownLevel   = displayedLevel ?? levelInfo.current.level;
            const shownTitle   = displayedTitle ?? levelInfo.current.title;
            const shownHasNext = displayedBarNext;
            const badgeIsNew   = leveledUp && shownLevel === levelInfo.current.level;

            // Human judges: which side they favoured + how closely their ranking matched the AI's
            const judgeRows = judgeScores.map((js) => {
              const scored  = rankedAll.filter((s) => js.scores.some((x) => x.userId === s.userId));
              const scoreOf = (id: string) => js.scores.find((x) => x.userId === id)?.score ?? 0;
              const byJudge = scored.slice().sort((a, b) => scoreOf(b.userId) - scoreOf(a.userId));
              const matched = byJudge.filter((s, i) => scored[i]?.userId === s.userId).length;
              const avgFor  = scored.filter((s) => s.side === "for");
              const avgAg   = scored.filter((s) => s.side === "against");
              const mean    = (xs: ScoreBreakdown[]) => xs.length ? xs.reduce((a, s) => a + scoreOf(s.userId), 0) / xs.length : -1;
              const pick    = avgFor.length && avgAg.length ? (mean(avgFor) >= mean(avgAg) ? "for" : "against") : null;
              return { id: js.judgeId, name: js.judgeUsername, matched, of: scored.length, pick };
            });

            return (
              <div style={{ maxWidth:1240, margin:"0 auto", display:"flex", flexDirection:"column", gap:20 }}>

                {/* ── LEVEL-UP BANNER ── */}
                {showLevelUp && (
                  <div className="level-up-pop" role="status" style={{
                    padding:"14px 20px", borderRadius:20,
                    background:"var(--ds-for-bg)", border:"1px solid var(--ds-for-line)",
                    display:"flex", alignItems:"center", gap:14,
                  }}>
                    <span style={{ color:"var(--ds-for-text)", display:"inline-flex" }}><Icon name="bolt" size={24} /></span>
                    <div>
                      <div style={{ fontSize:15, fontWeight:900, letterSpacing:"0.06em", color:"var(--ds-for-text)" }}>LEVEL UP!</div>
                      <div style={{ fontSize:14, color:"var(--ds-text)", fontWeight:600 }}>
                        You are now <span style={{ color:"var(--ds-for-text)", fontWeight:800 }}>Level {levelInfo.current.level}</span> — {newLevelTitle}
                      </div>
                    </div>
                  </div>
                )}

                <section className="res-col" style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.4fr) minmax(0,1fr)", gap:20 }}>

                  {/* ── VERDICT ── */}
                  <div style={{
                    padding: isMobile ? "22px 20px" : 32, borderRadius:28,
                    background:`var(--ds-${winSide}-bg)`, border:`1px solid var(--ds-${winSide}-line)`,
                    display:"flex", flexDirection:"column", gap:20, minWidth:0,
                  }}>
                    <span className="ds-eyebrow" style={{ letterSpacing:"0.14em", color:`var(--ds-${winSide}-text)` }}>AI Judge verdict</span>
                    <h1 style={{ margin:0, fontWeight:900, fontSize: isMobile ? 52 : 88, lineHeight:0.95, letterSpacing:"-0.04em", color:"var(--ds-text)" }}>
                      <span style={{ color:`var(--ds-${winSide}-mid)` }}>{winText}</span> wins
                    </h1>
                    {forAvg !== null && againstAvg !== null && (
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", gap:12, fontSize:13, fontWeight:700 }}>
                          <span style={{ color:"var(--ds-for-text)" }}>FOR · avg {forAvg}</span>
                          <span style={{ color:"var(--ds-against-text)" }}>AGAINST · avg {againstAvg}</span>
                        </div>
                        <div role="img" aria-label={`FOR averaged ${forAvg}, AGAINST averaged ${againstAvg}`} style={{ display:"flex", height:12, borderRadius:99, overflow:"hidden", gap:3 }}>
                          <span style={{ flex:`${Math.max(forAvg, 1)} 1 0%`, background:"var(--ds-for-mid)" }} />
                          <span style={{ flex:`${Math.max(againstAvg, 1)} 1 0%`, background:"var(--ds-against-mid)" }} />
                        </div>
                      </div>
                    )}
                    {result.winningPoints.length > 0 && (
                      <ul style={{ margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:10 }}>
                        {result.winningPoints.map((pt, i) => (
                          <li key={i} style={{ display:"flex", gap:10, fontSize:15, lineHeight:1.5, color:"var(--ds-text2)" }}>
                            <span style={{ color:`var(--ds-${winSide}-text)`, flexShrink:0, paddingTop:2, display:"inline-flex" }}><Icon name="check" size={16} /></span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* ── YOUR RESULT ── */}
                  <div className="ds-card" style={{ padding: isMobile ? "22px 20px" : 32, borderRadius:28, display:"flex", flexDirection:"column", gap:18, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                      <span className="ds-eyebrow" style={{ letterSpacing:"0.14em" }}>Your result</span>
                      <span className={`ds-chip ${outcome.chip}`}><Icon name={outcome.icon} size={14} /><span>{outcome.label}</span></span>
                    </div>
                    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:16 }}>
                      <span style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                        <span style={{ fontWeight:800, fontSize:72, lineHeight:1, letterSpacing:"-0.03em", ...gradText(scoreGradient(myScore.total)) }}>{myScore.total}</span>
                        <span style={{ fontSize:16, color:"var(--ds-muted)" }}>/100</span>
                      </span>
                      <span style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, textAlign:"right" }}>
                        <span style={{ fontWeight:700 }}>{ordinal(myRank)} of {rankedAll.length}</span>
                        <span style={{ fontSize:13, color:"var(--ds-muted)" }}>{myWon ? "Won" : "Lost"} with {myScore.side === "for" ? "FOR" : "AGAINST"}</span>
                      </span>
                    </div>

                    {/* Rhetoric trait + achievement badges */}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      <span className="ds-chip rhetor-badge" style={{ background:`${CAT_COLORS[topCat]}1f`, color:"var(--ds-text)", border:`1px solid ${CAT_COLORS[topCat]}59` }}>
                        <span style={{ color:CAT_COLORS[topCat], display:"inline-flex" }}><Icon name={trait.icon} size={14} /></span>{trait.label}
                      </span>
                      {achiev.map((b, i) => (
                        <span key={b.label} className={`ds-chip ${b.chip} rhetor-badge`} style={{ animationDelay:`${0.10 + i * 0.09}s` }}>
                          <Icon name={b.icon} size={14} />{b.label}
                        </span>
                      ))}
                      {aboveAvg !== null && aboveAvg > 0 && (
                        <span className="ds-chip ds-chip-for rank-delta-chip"><Icon name="chart" size={14} />+{aboveAvg} above avg</span>
                      )}
                    </div>

                    {/* XP + level progress */}
                    <div style={{ padding:16, borderRadius:18, background:"var(--ds-raised)", display:"flex", flexDirection:"column", gap:10 }}>
                      <span style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                        <span className="ds-mono" style={{ fontWeight:600, fontSize:22, color:"var(--ds-accent)" }}><span>+{xpGained}</span> XP</span>
                        <span className={levelBadgePop ? "level-badge-pop" : ""} style={{
                          fontSize:13, fontWeight: badgeIsNew ? 700 : 500,
                          color: badgeIsNew ? "var(--ds-for-text)" : "var(--ds-muted)",
                          transition:"color 0.3s",
                        }}>Lv {shownLevel} · {shownTitle}</span>
                      </span>
                      {shownHasNext ? (
                        <>
                          <div className="ds-track" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(barPct)}>
                            <div style={{ width:`${barPct}%`, transition: barTransition ? "width 0.85s cubic-bezier(.4,0,.2,1)" : "none" }} />
                          </div>
                          <span style={{ fontSize:13, color:"var(--ds-muted)" }}>
                            {levelInfo.progressXP} / {levelInfo.neededXP}
                            {levelInfo.next ? ` · ${Math.max(0, levelInfo.neededXP - levelInfo.progressXP)} XP to ${levelInfo.next.title}` : ""}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize:13, fontWeight:700, color:"var(--ds-for-text)" }}>MAX LEVEL</span>
                      )}
                    </div>

                    {/* Full analysis (Pro) / upgrade banner (Free) + actions */}
                    <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:"auto" }}>
                      {!isPro && ProUpgradeBanner}
                      <div style={{ display:"flex", flexDirection: isMobile ? "column" : "row", gap:10 }}>
                        {isPro && (
                          <button
                            type="button"
                            className="ds-btn ds-btn-primary"
                            style={{ flex:1, height:52 }}
                            onClick={() => navigate(`/room/${code}/analysis/${debateId}`, { state: { debate, judgeScores } })}
                          >
                            <Icon name="chart" size={18} />Full analysis
                          </button>
                        )}
                        <button type="button" className={`ds-btn ${isPro ? "ds-btn-secondary" : "ds-btn-primary"}`} style={{ flex:1, height:52 }} onClick={goHome}>
                          <Icon name="refresh" size={18} />Play again
                        </button>
                        <button
                          type="button"
                          className="ds-btn ds-btn-secondary"
                          style={{ height:52, flex: isMobile ? undefined : "0 0 auto" }}
                          aria-label="Share result"
                          onClick={() => {
                            const txt = `I just debated "${debate.topic}" on Argumint${myWon ? " and WON" : ""}! Score: ${myScore.total}/100`;
                            if (navigator.share) navigator.share({ title:"Argumint Result", text:txt, url:window.location.href });
                            else navigator.clipboard?.writeText(txt);
                          }}
                        >
                          <Icon name="message" size={18} />Share
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="res-col" style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.6fr) minmax(0,1fr)", gap:20, alignItems:"start" }}>

                  {/* ── STANDINGS ── */}
                  <section className="ds-card" style={{ ...card, gap:10 }}>
                    <h2 className="ds-eyebrow" style={{ margin:"0 0 6px" }}>Standings</h2>
                    {(() => {
                      const cols = isMobile ? "24px minmax(0,1fr) 48px" : "28px minmax(0,1fr) 52px 52px 52px 52px 60px";
                      return (
                        <>
                          {!isMobile && (
                            <div aria-hidden="true" style={{ display:"grid", gridTemplateColumns:cols, gap:8, padding:"0 12px", fontSize:11, fontWeight:700, letterSpacing:"0.08em", color:"var(--ds-faint)" }}>
                              <span>#</span><span>DEBATER</span>
                              {CATS.map((c) => <span key={c} style={{ textAlign:"right" }}>{CAT_SHORT[c]}</span>)}
                              <span style={{ textAlign:"right" }}>TOTAL</span>
                            </div>
                          )}
                          {rankedAll.map((s, idx) => {
                            const isMe = s.userId === user?.id;
                            return (
                              <div key={s.userId} style={{
                                display:"grid", gridTemplateColumns:cols, gap:8, alignItems:"center",
                                minHeight:60, padding:"0 12px", borderRadius:14,
                                background: isMe ? "var(--ds-accent-soft)" : "var(--ds-raised)",
                                border:`1px solid ${isMe ? "var(--ds-accent-line)" : "transparent"}`,
                              }}>
                                <span className="ds-mono" style={{ fontWeight:600, color:"var(--ds-muted)" }}>{idx + 1}</span>
                                <span style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
                                  <span style={{ width:34, height:34, flexShrink:0, borderRadius:11, background:"var(--ds-panel)", border:"1px solid var(--ds-border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700 }}>
                                    {initials(s.username)}
                                  </span>
                                  <span style={{ display:"flex", flexDirection:"column", minWidth:0 }}>
                                    <span style={{ fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.username}{isMe ? " (you)" : ""}</span>
                                    <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.08em", color: s.side === "for" ? "var(--ds-for-text)" : "var(--ds-against-text)" }}>
                                      {s.side === "for" ? "FOR" : "AGAINST"}
                                    </span>
                                  </span>
                                </span>
                                {!isMobile && CATS.map((c) => (
                                  <span key={c} className="ds-mono" style={{ textAlign:"right", color:"var(--ds-text3)" }}>{s[c]}</span>
                                ))}
                                <span style={{ textAlign:"right", fontWeight:800, fontSize:18, ...gradText(scoreGradient(s.total)) }}>{s.total}</span>
                              </div>
                            );
                          })}
                        </>
                      );
                    })()}
                  </section>

                  <div style={{ display:"flex", flexDirection:"column", gap:20, minWidth:0 }}>
                    {/* ── YOUR PERFORMANCE (category breakdown) ── */}
                    <section className="ds-card" style={card}>
                      <h2 className="ds-eyebrow" style={{ margin:0 }}>Your performance</h2>
                      {CATS.map((cat, ci) => {
                        const val = myScore[cat];
                        const pct = Math.round((val / 25) * 100);
                        return (
                          <div key={cat} style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            <span style={{ display:"flex", justifyContent:"space-between", fontSize:14 }}>
                              <span style={{ fontWeight:700 }}>{CAT_LABELS[cat]}</span>
                              <span className="ds-mono" style={{ fontWeight:600 }}>{val} / 25</span>
                            </span>
                            <span className="ds-track" style={{ display:"block", height:8 }}>
                              <span className="bar-fill-in" style={{ display:"block", height:"100%", borderRadius:99, background:CAT_COLORS[cat], width:`${pct}%`, animationDelay:`${0.45 + ci * 0.08}s` }} />
                            </span>
                          </div>
                        );
                      })}
                    </section>

                    {/* ── JUDGES ── */}
                    <section className="ds-card" style={card}>
                      <h2 className="ds-eyebrow" style={{ margin:0 }}>Judges</h2>
                      <div style={{ display:"flex", alignItems:"center", gap:12, padding:14, borderRadius:16, background:"var(--ds-raised)" }}>
                        <span style={{ width:40, height:40, flexShrink:0, borderRadius:12, background:"var(--ds-accent-soft)", color:"var(--ds-accent)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Icon name="scale" size={20} />
                        </span>
                        <span style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column" }}>
                          <span style={{ fontWeight:700 }}>AI judge</span>
                          <span style={{ fontSize:13, color:"var(--ds-muted)" }}>Scored all {rankedAll.length} debaters</span>
                        </span>
                        <span style={{ fontSize:12, fontWeight:700, color:`var(--ds-${winSide}-text)` }}>{winText}</span>
                      </div>
                      {judgeRows.map((j) => (
                        <div key={j.id} style={{ display:"flex", alignItems:"center", gap:12, padding:14, borderRadius:16, background:"var(--ds-raised)" }}>
                          <span style={{ width:40, height:40, flexShrink:0, borderRadius:12, background:"var(--ds-panel)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13 }}>
                            {initials(j.name)}
                          </span>
                          <span style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column" }}>
                            <span style={{ fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.name}</span>
                            <span style={{ fontSize:13, color:"var(--ds-muted)" }}>Ranking matched the AI on {j.matched} of {j.of} places</span>
                          </span>
                          {j.pick && (
                            <span style={{ fontSize:12, fontWeight:700, color:`var(--ds-${j.pick}-text)` }}>{j.pick === "for" ? "FOR" : "AGAINST"}</span>
                          )}
                        </div>
                      ))}
                      {judgeRows.length > 0 && (
                        <p style={{ margin:0, fontSize:13, lineHeight:1.5, color:"var(--ds-muted)" }}>
                          Human judge scores are shown for transparency. The AI judge decides the result.
                        </p>
                      )}
                      <button type="button" className="ds-link" onClick={goHome} style={{ alignSelf:"flex-start", minHeight:44, display:"inline-flex", alignItems:"center", gap:6, fontSize:14 }}>
                        <Icon name="home" size={16} />Back to home
                      </button>
                    </section>
                  </div>
                </div>
              </div>
            );
          })()}
        </main>
      </div>
    </>
  );
}
