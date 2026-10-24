import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { useIsMobile } from "../hooks/useIsMobile";
import { AppShell } from "../components/AppShell";
import { Icon } from "../components/Icon";
import type { Debate, ScoreBreakdown } from "@argumint/shared";

// ─── Helpers ────────────────────────────────────────────────────────────────

const BAR_LABELS: Record<string, string> = {
  clarity:      "Clarity",
  evidence:     "Evidence",
  rebuttal:     "Rebuttal",
  organization: "Organization",
};
const BAR_ORDER = ["clarity", "evidence", "rebuttal", "organization"] as const;

// Data colours: bar fill by sub-score band, total by score band
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
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtDuration(sec?: number) {
  if (!sec || sec < 0) return null;
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(d: unknown) {
  if (!d) return null;
  const date = new Date(d as string);
  return isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One rubric axis: label, value /25, bar, and the top scorer's mark */
function ScoreBar({ k, val, mark }: { k: string; val: number; mark: number | null }) {
  const pct = Math.max(0, Math.min(100, (val / 25) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
        <span style={{ fontWeight: 700 }}>{BAR_LABELS[k]}</span>
        <span className="ds-mono" style={{ fontWeight: 600 }}><span>{val}</span> / 25</span>
      </span>
      <span style={{ position: "relative", height: 10, borderRadius: 99, background: "var(--ds-track)", display: "block" }}>
        <span style={{ position: "absolute", left: 0, top: 0, height: 10, width: `${pct}%`, borderRadius: 99, background: barColor(val), transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
        {mark !== null && (
          <span title="Top scorer" style={{ position: "absolute", top: -4, left: `calc(${Math.max(0, Math.min(100, (mark / 25) * 100))}% - 1px)`, width: 3, height: 18, borderRadius: 2, background: "var(--ds-text)" }} />
        )}
      </span>
    </div>
  );
}

const sectionTitle: React.CSSProperties = { margin: 0 };

// ─── Main ────────────────────────────────────────────────────────────────────

export function DebateAnalysisPage() {
  const { code, debateId } = useParams<{ code: string; debateId: string }>();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { user }   = useAuth();
  const { socket, isConnected } = useSocket();
  const isMobile   = useIsMobile();
  const isPro      = (user as any)?.isPro ?? false;

  // Debate state — seeded from router state if navigating from ResultPage,
  // otherwise fetched from socket (direct URL access / refresh).
  const [debate,  setDebate]  = useState<Debate | null>((location.state as any)?.debate ?? null);
  const [error,   setError]   = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);   // debater shown in the panel
  const [onlyTheirTurns, setOnlyTheirTurns] = useState(false);          // transcript filter
  const [judgeScores] = useState<Array<{
    judgeId: string; judgeUsername: string;
    scores: Array<{ userId: string; score: number }>;
    submittedAt: Date;
  }>>(((location.state as any)?.judgeScores) ?? []);

  useEffect(() => {
    if (debate || !socket || !isConnected || !debateId) return;
    socket.emit("debate:get-state", { debateId }, (res: any) => {
      if (!res?.success) { setError(res?.error || "Failed to load debate"); return; }
      setDebate(res.debate as Debate);
    });
  }, [socket, isConnected, debateId, debate]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const result    = debate?.result ?? null;
  const rankedAll = useMemo<ScoreBreakdown[]>(() => {
    if (!result) return [];
    return result.scores.slice().sort((a, b) => b.total - a.total);
  }, [result]);

  const myScore = useMemo<ScoreBreakdown | null>(() => {
    if (!result || !user) return null;
    return result.scores.find((s) => s.userId === user.id) ?? null;
  }, [result, user]);

  // ── Loading / error ───────────────────────────────────────────────────────
  if (error) return (
    <AppShell active="history">
      <div className="ds-page" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="ds-card" style={{ padding: 32, textAlign: "center", maxWidth: 380, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <p style={{ margin: 0, color: "var(--ds-against-text)", display: "flex", alignItems: "center", gap: 8 }}><Icon name="info" size={18} />{error}</p>
          <button onClick={() => navigate(-1)} className="ds-btn ds-btn-secondary"><Icon name="left" size={18} />Go Back</button>
        </div>
      </div>
    </AppShell>
  );

  if (!debate || !result) return (
    <AppShell active="history">
      <div className="ds-page" style={{ alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <img src="/logo/brand/argumint-app-icon-dark.svg" alt="Loading…" className="logo-heartbeat" style={{ width: 64, height: 64 }} />
      </div>
    </AppShell>
  );

  const backHref = `/room/${code}/result/${debateId}`;
  const winSide  = result.winnerSide;
  const winText  = winSide === "for" ? "FOR" : "AGAINST";
  const dateText = fmtDate(result.judgedAt);
  const cardPad  = isMobile ? 18 : 24;

  // Debater tabs: you first, then everyone else by rank
  const tabOrder = myScore ? [myScore, ...rankedAll.filter((s) => s.userId !== myScore.userId)] : rankedAll;
  const selected = tabOrder.find((s) => s.userId === selectedId) ?? tabOrder[0] ?? null;

  // ── Pro gate ──────────────────────────────────────────────────────────────
  const ProGate = (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
      <div onClick={() => navigate("/pricing")} className="ds-card" style={{
        cursor: "pointer", padding: isMobile ? "28px 20px" : "40px 32px", textAlign: "center",
        maxWidth: 420, width: "100%", boxSizing: "border-box", borderColor: "var(--ds-gold-line)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--ds-gold-bg)", color: "var(--ds-gold-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="lock" size={26} />
        </span>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--ds-text)" }}>Full Analysis is Pro</h2>
        <p className="ds-sub" style={{ lineHeight: 1.6 }}>
          Unlock full transcripts, AI breakdowns, per-player strengths & weaknesses, and more.
        </p>
        {/* No own handler: the click bubbles to the card */}
        <button type="button" className="ds-btn ds-btn-primary" style={{ marginTop: 8 }}>
          <Icon name="crown" size={18} />Upgrade to Pro — ₹50/mo
        </button>
      </div>
    </div>
  );

  // ── Selected debater panel ────────────────────────────────────────────────
  const Panel = selected && (() => {
    const isMe   = selected.userId === user?.id;
    const won    = selected.side === winSide;
    const rank   = rankedAll.findIndex((s) => s.userId === selected.userId) + 1;
    const top    = rankedAll[0];
    const showMk = !!top && top.userId !== selected.userId;
    const judgeRows = judgeScores.map(js => ({
      judgeUsername: js.judgeUsername,
      score: js.scores.find(x => x.userId === selected.userId)?.score ?? null,
    })).filter(x => x.score !== null) as { judgeUsername: string; score: number }[];
    const judgeAvg = judgeRows.length > 0 ? Math.round(judgeRows.reduce((a, x) => a + x.score, 0) / judgeRows.length) : null;
    const blended  = judgeAvg !== null ? Math.round((selected.total + judgeAvg) / 2) : null;
    const strengths    = selected.strengths ?? [];
    const improvements = selected.improvements ?? [];
    const feedback     = selected.feedback;

    return (
      <div role="tabpanel" aria-label={isMe ? "Your analysis" : `${selected.username}'s analysis`}
        style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 20, alignItems: "start" }}>

        {/* Score card */}
        <section className="ds-card" style={{ padding: cardPad, display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="ds-eyebrow">{isMe ? "Your score" : `${selected.username}'s score`}</span>
                {won && <span className="ds-chip ds-chip-for" style={{ height: 22, fontSize: 11 }}>WINNER</span>}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{
                  fontWeight: 800, fontSize: 64, lineHeight: 1, letterSpacing: "-0.03em",
                  background: scoreGradient(selected.total), WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{selected.total}</span>
                <span style={{ fontSize: 15, color: "var(--ds-muted)" }}>/100</span>
              </span>
            </div>
            <span style={{ fontSize: 13, color: "var(--ds-muted)", textAlign: "right", flexShrink: 0 }}>
              {ordinal(rank)} of {rankedAll.length}<br />
              <span style={{ color: selected.side === "for" ? "var(--ds-for-text)" : "var(--ds-against-text)", fontWeight: 700 }}>
                {selected.side === "for" ? "FOR" : "AGAINST"}
              </span>
              {showMk && <> · Top scored {top.total}</>}
            </span>
          </div>

          {BAR_ORDER.map((k) => (
            <ScoreBar key={k} k={k} val={selected[k]} mark={showMk ? top[k] : null} />
          ))}

          {showMk && (
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ds-muted)" }}>
              <span style={{ width: 3, height: 14, borderRadius: 2, background: "var(--ds-text)" }} />Top scorer on each axis
            </span>
          )}

          {/* Human judge score row (if any) */}
          {judgeAvg !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "rgba(var(--ds-judge-rgb),0.07)", border: "1px solid rgba(var(--ds-judge-rgb),0.2)" }}>
              <span style={{ color: "var(--ds-judge)", display: "inline-flex" }}><Icon name="scale" size={16} /></span>
              <span style={{ fontSize: 13, color: "var(--ds-muted)", flex: 1 }}>Human judges avg</span>
              <span className="ds-mono" style={{ fontSize: 14, fontWeight: 800, color: "var(--ds-judge)" }}>{judgeAvg}</span>
              <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>→ blended</span>
              <span className="ds-mono" style={{ fontSize: 14, fontWeight: 800, color: "var(--ds-text)" }}>{blended}</span>
            </div>
          )}
        </section>

        {/* Feedback, strengths, improvements */}
        <section style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <div className="ds-card" style={{ padding: cardPad, display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="ds-eyebrow" style={sectionTitle}>AI feedback</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: feedback ? "var(--ds-text2)" : "var(--ds-muted)" }}>
              {feedback || "No written feedback for this debater."}
            </p>
          </div>

          {strengths.length > 0 && (
            <div style={{ padding: cardPad, borderRadius: 24, background: "var(--ds-for-bg)", border: "1px solid var(--ds-for-line)", display: "flex", flexDirection: "column", gap: 12 }}>
              <h3 className="ds-eyebrow" style={{ ...sectionTitle, color: "var(--ds-for-text)" }}>Strengths</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {strengths.map((str, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5, color: "var(--ds-text)" }}>
                    <span style={{ color: "var(--ds-for-text)", flexShrink: 0, display: "inline-flex", paddingTop: 2 }}><Icon name="check" size={16} /></span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {improvements.length > 0 && (
            <div className="ds-card" style={{ padding: cardPad, display: "flex", flexDirection: "column", gap: 12 }}>
              <h3 className="ds-eyebrow" style={sectionTitle}>To improve</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {improvements.map((imp, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5, color: "var(--ds-text)" }}>
                    <span style={{ color: "var(--ds-gold-mid)", flexShrink: 0, display: "inline-flex", paddingTop: 2 }}><Icon name="right" size={16} /></span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    );
  })();

  // ── Match summary + why the winner won ────────────────────────────────────
  const Verdict = (result.summary || result.winningPoints.length > 0) && (
    <section className="ds-card" style={{
      padding: cardPad, display: "grid", gap: 20,
      gridTemplateColumns: !isMobile && result.summary && result.winningPoints.length > 0 ? "repeat(2, minmax(0, 1fr))" : "1fr",
    }}>
      {result.summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <h2 className="ds-eyebrow" style={sectionTitle}>Match Summary</h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--ds-text2)" }}>{result.summary}</p>
        </div>
      )}
      {result.winningPoints.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <h2 className="ds-eyebrow" style={{ ...sectionTitle, color: `var(--ds-${winSide}-text)` }}>Why {winText} Won</h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {result.winningPoints.map((pt, i) => (
              <li key={i} style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.5, color: "var(--ds-text2)" }}>
                <span style={{ color: `var(--ds-${winSide}-text)`, flexShrink: 0, display: "inline-flex", paddingTop: 2 }}><Icon name="check" size={16} /></span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );

  // ── Transcript ────────────────────────────────────────────────────────────
  const filterName = selected ? (selected.userId === user?.id ? "my" : `${selected.username}'s`) : null;
  const rounds = onlyTheirTurns && selected ? debate.rounds.filter((r) => r.speakerId === selected.userId) : debate.rounds;

  const Transcript = (
    <section className="ds-card" style={{ padding: cardPad, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 className="ds-eyebrow" style={sectionTitle}>Transcript</h2>
        {debate.rounds.length > 0 && filterName && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 14, fontWeight: 600, color: "var(--ds-text3)", cursor: "pointer" }}>
            <input type="checkbox" checked={onlyTheirTurns} onChange={(e) => setOnlyTheirTurns(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--ds-accent-mid)", margin: 0 }} />
            Only {filterName} turns
          </label>
        )}
      </div>
      {debate.rounds.length === 0 ? (
        <p className="ds-sub" style={{ padding: 16, borderRadius: 16, background: "var(--ds-raised)", textAlign: "center" }}>
          No arguments were captured for this debate.
        </p>
      ) : rounds.length === 0 ? (
        <p className="ds-sub" style={{ padding: 16, borderRadius: 16, background: "var(--ds-raised)", textAlign: "center" }}>
          No turns from this debater in the transcript.
        </p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
          {rounds.map((r, i) => {
            const dur = fmtDuration(r.durationSeconds);
            return (
              <li key={i} style={{
                display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px minmax(0, 1fr)", gap: isMobile ? 10 : 14,
                padding: 16, borderRadius: 16, background: "var(--ds-raised)",
                borderLeft: `3px solid ${r.side === "for" ? "var(--ds-for-mid)" : "var(--ds-against-mid)"}`,
              }}>
                <span style={{ display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", gap: 6, fontSize: 12, color: "var(--ds-muted)", minWidth: 0 }}>
                  <span style={{ display: "flex", gap: 6 }}>
                    <span className="ds-mono" style={{ fontWeight: 600, color: "var(--ds-text)" }}>R{r.roundNumber}</span>
                    {dur && <span className="ds-mono">{dur}</span>}
                  </span>
                  <span style={{ display: "flex", gap: 6, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: "var(--ds-text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.speakerUsername}</span>
                    <span style={{ fontWeight: 700, letterSpacing: "0.08em", color: r.side === "for" ? "var(--ds-for-text)" : "var(--ds-against-text)" }}>
                      {r.side === "for" ? "FOR" : "AGAINST"}
                    </span>
                  </span>
                </span>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--ds-text2)" }}>
                  {r.argument || <span style={{ fontStyle: "italic", color: "var(--ds-muted)" }}>(no transcript captured)</span>}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell active="history">
      <style>{`
        .analysis-back { align-self: flex-start; min-height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0;
          border: 0; background: none; cursor: pointer; font: 600 14px Outfit, system-ui, sans-serif; color: var(--ds-muted); }
        .analysis-back:hover { color: var(--ds-text); }
        .analysis-tab { flex-shrink: 0; min-height: 44px; padding: 0 16px; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px;
          font: 700 14px Outfit, system-ui, sans-serif; cursor: pointer; border: 1px solid var(--ds-border); background: var(--ds-panel); color: var(--ds-text3); }
        .analysis-tab[aria-selected="true"] { border-color: transparent; background: var(--ds-primary-fill); color: var(--ds-on-primary); }
      `}</style>
      <div className="ds-page" style={{ gap: 22 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button type="button" className="analysis-back" onClick={() => navigate(backHref)}>
            <Icon name="left" size={16} />Results
          </button>
          <span className="ds-eyebrow">Full Analysis</span>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 22 : 32, lineHeight: 1.2, letterSpacing: "-0.02em", maxWidth: 860, textWrap: "balance" } as React.CSSProperties}>
            {debate.topic}
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span className={`ds-chip ds-chip-${winSide}`} style={{ fontSize: 13 }}>{winText} won</span>
            <span className="ds-chip" style={{ fontSize: 13, fontWeight: 600, background: "var(--ds-raised)", color: "var(--ds-text3)" }}>
              {debate.mode === "buzzer" ? "Buzzer" : "Alternate"} · {debate.totalRounds} {debate.totalRounds === 1 ? "round" : "rounds"}
            </span>
            {dateText && (
              <span className="ds-chip" style={{ fontSize: 13, fontWeight: 600, background: "var(--ds-raised)", color: "var(--ds-text3)" }}>{dateText}</span>
            )}
          </div>
        </header>

        {!isPro ? ProGate : (
          <>
            {tabOrder.length > 0 && (
              <div role="tablist" aria-label="Debater" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
                {tabOrder.map((s) => {
                  const on = s.userId === selected?.userId;
                  return (
                    <button
                      key={s.userId}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className="analysis-tab"
                      onClick={() => setSelectedId(s.userId)}
                    >
                      <span>{s.userId === user?.id ? "You" : s.username}</span>
                      <span className="ds-mono" style={{ fontWeight: 600, opacity: 0.85 }}>{s.total}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {Panel}
            {Verdict}
            {Transcript}
          </>
        )}
      </div>
    </AppShell>
  );
}
