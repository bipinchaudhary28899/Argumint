import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { useIsMobile } from "../hooks/useIsMobile";
import { getLevelInfo } from "@argumint/shared";
import type { Debate, ScoreBreakdown } from "@argumint/shared";

// ─── Helpers ────────────────────────────────────────────────────────────────

const BAR_LABELS: Record<string, string> = {
  clarity:      "Clarity",
  evidence:     "Proof",
  rebuttal:     "Counter",
  organization: "Structure",
};
const BAR_ORDER = ["clarity", "evidence", "rebuttal", "organization"] as Array<keyof ScoreBreakdown>;

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

function ScoreBar({ k, val }: { k: string; val: number }) {
  const pct   = Math.max(0, Math.min(100, (val / 25) * 100));
  const color = barColor(val);
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.18rem" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--subtle)", textTransform: "uppercase", letterSpacing: "0.04em", width: 66, flexShrink: 0 }}>
          {BAR_LABELS[k]}
        </span>
        <div className="score-bar-track" style={{ flex: 1 }}>
          <div style={{ height: "100%", borderRadius: "9999px", background: color, width: `${pct}%`, transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
        </div>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: "0.78rem", color: "var(--text)", width: 26, textAlign: "right", flexShrink: 0 }}>
          {val}
        </span>
      </div>
    </div>
  );
}

// ─── Tab types ───────────────────────────────────────────────────────────────

type Tab = "transcript" | "scores" | "ai";

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
  const [tab,     setTab]     = useState<Tab>("transcript");
  const [judgeScores, setJudgeScores] = useState<Array<{
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
    <div className="bg-grid" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div className="glass" style={{ padding: "2rem", textAlign: "center", maxWidth: 380 }}>
        <p style={{ color: "var(--against)", marginBottom: "1rem" }}>⚠ {error}</p>
        <button onClick={() => navigate(-1)} className="btn-ghost">← Go Back</button>
      </div>
    </div>
  );

  if (!debate || !result) return (
    <div className="bg-grid" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <img src="/logo/logo.png" alt="Loading…" className="logo-heartbeat" style={{ width: 64, height: 64 }} />
    </div>
  );

  const backHref = `/room/${code}/result/${debateId}`;

  // ── Tab content ───────────────────────────────────────────────────────────

  const TranscriptTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {debate.rounds.length === 0 ? (
        <div className="glass" style={{ padding: "2rem", textAlign: "center", borderRadius: "1rem" }}>
          <p style={{ color: "var(--muted)", margin: 0 }}>No arguments were captured for this debate.</p>
        </div>
      ) : (
        debate.rounds.map((r, i) => (
          <div key={i} className="glass" style={{
            padding: "0.875rem 1rem", borderRadius: "1rem",
            borderLeft: `3px solid ${r.side === "for" ? "var(--for)" : "var(--against)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.45rem" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.62rem", fontWeight: 700, color: "var(--muted)", background: "var(--surface2)", padding: "0.08rem 0.4rem", borderRadius: "0.3rem" }}>
                R{r.roundNumber}
              </span>
              <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--text)", flex: 1 }}>{r.speakerUsername}</span>
              <span className={`badge ${r.side === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize: "0.58rem" }}>
                {r.side === "for" ? "FOR" : "AGAINST"}
              </span>
            </div>
            <p style={{ margin: 0, color: "var(--subtle)", fontSize: "0.85rem", lineHeight: 1.65 }}>
              {r.argument || <span style={{ fontStyle: "italic", color: "var(--muted)" }}>(no transcript captured)</span>}
            </p>
          </div>
        ))
      )}
    </div>
  );

  const ScoresTab = (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {rankedAll.map((s, idx) => {
        const isMe = s.userId === user?.id;
        const won  = s.side === result.winnerSide;
        const lvl  = getLevelInfo((s as any).xp ?? 0);
        const judgeRows = judgeScores.map(js => ({
          judgeUsername: js.judgeUsername,
          score: js.scores.find(x => x.userId === s.userId)?.score ?? null,
        })).filter(x => x.score !== null) as { judgeUsername: string; score: number }[];
        const judgeAvg = judgeRows.length > 0 ? Math.round(judgeRows.reduce((a, x) => a + x.score, 0) / judgeRows.length) : null;
        const blended  = judgeAvg !== null ? Math.round((s.total + judgeAvg) / 2) : null;

        return (
          <div key={s.userId} className="glass" style={{
            padding: "1rem 1.125rem", borderRadius: "1rem",
            border: isMe ? `1.5px solid ${won ? "rgba(16,185,129,0.4)" : "rgba(79,142,247,0.35)"}` : "1px solid var(--border)",
            background: isMe ? (won ? "rgba(16,185,129,0.04)" : "rgba(79,142,247,0.04)") : undefined,
          }}>
            {/* Player header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.875rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.08rem", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 900, fontSize: "0.95rem", color: isMe ? (won ? "var(--for)" : "var(--cyan)") : "var(--text)" }}>
                    {idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : ""}{s.username}{isMe ? " 👤" : ""}
                  </span>
                  <span className={`badge ${s.side === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize: "0.58rem" }}>
                    {s.side === "for" ? "FOR" : "AGAINST"}
                  </span>
                  {won && <span style={{ fontSize: "0.62rem", fontWeight: 800, color: "var(--for)", background: "rgba(16,185,129,0.1)", padding: "0.06rem 0.4rem", borderRadius: "9999px" }}>WINNER</span>}
                </div>
              </div>
              {/* Total score */}
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{
                  fontFamily: "'JetBrains Mono',monospace", fontSize: "2rem", fontWeight: 900, lineHeight: 1,
                  background: scoreGradient(s.total), WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{s.total}</div>
                <div style={{ fontSize: "0.52rem", color: "var(--muted)", fontWeight: 600 }}>/ 100</div>
              </div>
            </div>

            {/* Score bars */}
            <div style={{ marginBottom: "0.75rem" }}>
              {BAR_ORDER.map((k) => <ScoreBar key={k as string} k={k as string} val={s[k] as number} />)}
            </div>

            {/* Judge score row (if any) */}
            {judgeAvg !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", padding: "0.4rem 0.625rem", borderRadius: "0.5rem", background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)" }}>
                <span style={{ fontSize: "0.65rem", color: "var(--muted)", flex: 1 }}>⚖️ Human judges avg</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.82rem", fontWeight: 800, color: "#a78bfa" }}>{judgeAvg}</span>
                <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>→ blended</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.82rem", fontWeight: 800, color: "#c4b5fd" }}>{blended}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const AITab = (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

      {/* Overall summary */}
      {result.summary && (
        <div className="glass" style={{ padding: "1rem 1.125rem", borderRadius: "1rem", borderLeft: "3px solid var(--violet)" }}>
          <div style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#a78bfa", marginBottom: "0.5rem" }}>🤖 Match Summary</div>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--subtle)", lineHeight: 1.65 }}>{result.summary}</p>
        </div>
      )}

      {/* Why they won */}
      {result.winningPoints.length > 0 && (
        <div className="glass" style={{ padding: "1rem 1.125rem", borderRadius: "1rem", borderLeft: "3px solid var(--for)" }}>
          <div style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--for)", marginBottom: "0.5rem" }}>
            🔥 Why {result.winnerSide === "for" ? "FOR" : "AGAINST"} Won
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {result.winningPoints.map((pt, i) => (
              <li key={i} style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start" }}>
                <span style={{ color: "var(--for)", fontSize: "0.68rem", flexShrink: 0, marginTop: "0.14rem" }}>✦</span>
                <span style={{ color: "var(--text)", fontSize: "0.85rem", lineHeight: 1.5 }}>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-player AI analysis */}
      {rankedAll.map((s, idx) => {
        const isMe = s.userId === user?.id;
        const strengths    = ((s as any).strengths    as string[] | undefined) ?? [];
        const improvements = ((s as any).improvements as string[] | undefined) ?? [];
        const feedback     = (s as any).feedback as string | undefined;

        return (
          <div key={s.userId} className="glass" style={{
            padding: "1rem 1.125rem", borderRadius: "1rem",
            border: isMe ? "1.5px solid rgba(79,142,247,0.35)" : "1px solid var(--border)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
              <span style={{ fontWeight: 900, fontSize: "0.9rem", color: isMe ? "var(--cyan)" : "var(--text)", flex: 1 }}>
                {idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : ""}{s.username}{isMe ? " 👤" : ""}
              </span>
              <span className={`badge ${s.side === "for" ? "badge-for" : "badge-against"}`} style={{ fontSize: "0.6rem" }}>
                {s.side === "for" ? "FOR" : "AGAINST"}
              </span>
            </div>

            {/* AI Feedback */}
            {feedback && (
              <div style={{ marginBottom: strengths.length > 0 || improvements.length > 0 ? "0.875rem" : 0 }}>
                <div style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#a78bfa", marginBottom: "0.35rem" }}>AI Feedback</div>
                <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--subtle)", lineHeight: 1.65 }}>{feedback}</p>
              </div>
            )}

            {/* Strengths + Improvements side by side on desktop */}
            {(strengths.length > 0 || improvements.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.75rem" }}>
                {strengths.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--for)", marginBottom: "0.35rem" }}>✅ Strengths</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.28rem" }}>
                      {strengths.map((str, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.35rem", padding: "0.3rem 0.5rem", borderRadius: "0.4rem", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
                          <span style={{ color: "var(--for)", flexShrink: 0, marginTop: "0.1rem", fontSize: "0.62rem" }}>•</span>
                          <span style={{ color: "var(--subtle)", fontSize: "0.78rem", lineHeight: 1.45 }}>{str}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {improvements.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--against)", marginBottom: "0.35rem" }}>❌ To Improve</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.28rem" }}>
                      {improvements.map((imp, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.35rem", padding: "0.3rem 0.5rem", borderRadius: "0.4rem", background: "rgba(244,63,94,0.05)", border: "1px solid rgba(244,63,94,0.13)" }}>
                          <span style={{ color: "var(--against)", flexShrink: 0, marginTop: "0.1rem", fontSize: "0.62rem" }}>•</span>
                          <span style={{ color: "var(--subtle)", fontSize: "0.78rem", lineHeight: 1.45 }}>{imp}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "transcript", label: "Transcript", icon: "🎤" },
    { id: "scores",     label: "Scores",     icon: "📊" },
    { id: "ai",         label: "AI Review",  icon: "🤖" },
  ];

  return (
    <>
      <style>{`
        @keyframes cardFadeUp {
          0%   { opacity:0; transform:translateY(8px); }
          100% { opacity:1; transform:translateY(0); }
        }
        .analysis-card { animation: cardFadeUp 0.3s ease both; }
        .tab-btn { transition: background 0.15s, color 0.15s, border-color 0.15s; }
        .tab-btn:hover { background: var(--surface2) !important; }
      `}</style>

      <div className="bg-grid" style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", overflow: "hidden" }}>
        {/* Ambient */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 60% 50% at 20% 10%,rgba(124,58,237,0.07) 0%,transparent 60%)" }} />

        {/* ── HEADER ── */}
        <div style={{
          flexShrink: 0, position: "relative", zIndex: 1,
          padding: isMobile ? "0.625rem 0.875rem" : "0.75rem 1.25rem",
          display: "flex", alignItems: "center", gap: "0.75rem",
          borderBottom: "1px solid var(--border)",
          background: "rgba(var(--bg-rgb),0.7)", backdropFilter: "blur(12px)",
        }}>
          <button onClick={() => navigate(backHref)} className="btn-ghost" style={{ fontSize: "0.78rem", padding: "0.25rem 0.6rem", flexShrink: 0 }}>
            ← Results
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.52rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.1rem" }}>Full Analysis</div>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{debate.topic}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
            <span style={{
              fontSize: "0.68rem", fontWeight: 900, padding: "0.2rem 0.65rem", borderRadius: "9999px",
              background: result.winnerSide === "for" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
              border: `1px solid ${result.winnerSide === "for" ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)"}`,
              color: result.winnerSide === "for" ? "var(--for)" : "var(--against)",
            }}>
              {result.winnerSide === "for" ? "FOR" : "AGAINST"} WINS
            </span>
          </div>
        </div>

        {/* ── PRO GATE ── */}
        {!isPro ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", position: "relative", zIndex: 1 }}>
            <div onClick={() => navigate("/pricing")} style={{
              cursor: "pointer", borderRadius: "1.25rem", padding: "2.5rem 2rem", textAlign: "center",
              background: "linear-gradient(135deg,rgba(245,158,11,0.08),rgba(124,58,237,0.06))",
              border: "1.5px solid rgba(245,158,11,0.3)", maxWidth: 400, width: "100%",
            }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔒</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 900, color: "#fbbf24", marginBottom: "0.5rem" }}>Full Analysis is Pro</div>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                Unlock full transcripts, AI breakdowns, per-player strengths & weaknesses, and more.
              </p>
              <div style={{
                display: "inline-block", fontSize: "0.82rem", fontWeight: 800, padding: "0.5rem 1.5rem",
                borderRadius: "9999px", background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#000",
              }}>⚡ Upgrade to Pro — ₹50/mo</div>
            </div>
          </div>
        ) : (
          <>
            {/* ── TABS ── */}
            <div style={{
              flexShrink: 0, position: "relative", zIndex: 1,
              padding: isMobile ? "0.5rem 0.875rem 0" : "0.5rem 1.25rem 0",
              display: "flex", gap: "0.25rem",
              borderBottom: "1px solid var(--border)",
            }}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  className="tab-btn"
                  onClick={() => setTab(t.id)}
                  style={{
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                    fontSize: "0.78rem", fontWeight: tab === t.id ? 800 : 600,
                    padding: "0.5rem 0.875rem",
                    color: tab === t.id ? "var(--text)" : "var(--muted)",
                    background: "transparent",
                    borderBottom: `2px solid ${tab === t.id ? "var(--blue)" : "transparent"}`,
                    borderRadius: "0.375rem 0.375rem 0 0",
                    display: "flex", alignItems: "center", gap: "0.35rem",
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div style={{
              flex: 1, minHeight: 0, overflowY: "auto",
              padding: isMobile ? "0.875rem 0.875rem 2rem" : "1rem 1.25rem 2.5rem",
              position: "relative", zIndex: 1,
            }}>
              <div style={{ maxWidth: 720, margin: "0 auto" }} className="analysis-card">
                {tab === "transcript" && TranscriptTab}
                {tab === "scores"     && ScoresTab}
                {tab === "ai"         && AITab}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
