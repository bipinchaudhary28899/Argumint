/**
 * LevelRewards.tsx
 *
 * Layout:
 *   TOP STRIP  — XP card (left) + horizontal milestone roadmap (right)
 *   HISTORY    — scrollable list of past debates: motion, debaters, judges, rank, points
 */

import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { getLevelInfo, LEVEL_TABLE } from "@argumint/shared";
import { NavLogo } from "../components/NavLogo";
import { historyApi, type DebateHistoryEntry } from "../services/api";

// Module-level cache — survives tab switches (component unmount/remount) within
// the same browser session. Cleared on full page reload automatically.
let _historyCache: DebateHistoryEntry[] | null = null;

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LevelRewards() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { theme, meta: themeMeta } = useTheme();
  const isMobile  = useIsMobile();
  const isPro     = (user as any)?.isPro ?? false;
  const isGlacier = theme === "glacier";
  const isDark    = theme === "dark";

  const xp        = (user as any)?.xp ?? 0;
  const lvlInfo   = getLevelInfo(xp);
  const curLevel  = lvlInfo.current.level;

  const [history, setHistory]   = useState<DebateHistoryEntry[]>(_historyCache ?? []);
  const [loading, setLoading]   = useState(_historyCache === null);

  useEffect(() => {
    // If we already have cached data, skip the fetch entirely
    if (_historyCache !== null) return;

    historyApi.getHistory().then(data => {
      _historyCache = data;
      setHistory(data);
      setLoading(false);
    });
  }, []);

  const trackGrad = isGlacier
    ? "linear-gradient(90deg,#0369a1,#0284c7,#38bdf8)"
    : "linear-gradient(90deg,var(--blue),var(--violet))";

  // ── Roadmap fill % ──────────────────────────────────────────────────────────
  const MILESTONE_LEVELS = [1, 2, 3, 5, 7, 10];
  const milestoneAt = (level: number) => ((level - 1) / 9) * 100;
  const nextMilestoneLevel = MILESTONE_LEVELS.find(l => l > curLevel);
  const curMilPos  = milestoneAt(curLevel);
  const nextMilPos = nextMilestoneLevel ? milestoneAt(nextMilestoneLevel) : 100;
  const fillPct    = curMilPos + (nextMilPos - curMilPos) * (lvlInfo.progressPct / 100);

  // ─── XP Card ─────────────────────────────────────────────────────────────────
  const XPCard = (
    <div className="glass" style={{ padding: "0.875rem 1.125rem", display: "flex", flexDirection: "column", gap: "0.6rem", flex: "0 0 260px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
          background: isGlacier ? "linear-gradient(135deg,#0284c7,#0369a1)" : "linear-gradient(135deg,#4f46e5,#7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1rem", fontWeight: 900, color: "#fff",
          boxShadow: isGlacier ? "0 3px 12px rgba(2,132,199,0.4)" : "0 3px 12px rgba(79,70,229,0.4)",
        }}>
          {user?.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.username}
          </div>
          <div style={{ fontSize: "0.62rem", color: "var(--muted)" }}>
            {lvlInfo.current.title} · {xp} XP
          </div>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.5rem", fontWeight: 900, color: "var(--blue)", flexShrink: 0 }}>
          {curLevel}
        </div>
      </div>

      {lvlInfo.next ? (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.58rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              To {lvlInfo.next.title}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "var(--muted)" }}>
              {lvlInfo.progressXP}/{lvlInfo.neededXP} XP
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 9999, background: isDark ? "rgba(255,255,255,0.1)" : "var(--border)", overflow: "hidden" }}>
            <div className="xp-bar-fill" style={{ height: "100%", borderRadius: 9999, width: `${lvlInfo.progressPct}%`, transition: "width 1.1s cubic-bezier(.4,0,.2,1)" }} />
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 800, color: "var(--blue)" }}>
          👑 Max Level — Grand Master
        </div>
      )}

      {/* All level titles — compact 2-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.2rem 0.5rem" }}>
        {LEVEL_TABLE.map(entry => {
          const reached = curLevel >= entry.level;
          const active  = curLevel === entry.level;
          return (
            <div key={entry.level} style={{
              display: "flex", alignItems: "center", gap: "0.3rem",
              padding: "0.18rem 0.35rem", borderRadius: "0.35rem",
              background: active ? "rgba(var(--blue-rgb),0.08)" : "transparent",
              opacity: reached ? 1 : 0.35,
            }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.52rem", fontWeight: 900, color: "var(--blue)", flexShrink: 0, width: 20 }}>
                {entry.level}
              </span>
              <span style={{ fontSize: "0.62rem", fontWeight: active ? 800 : 500, color: active ? "var(--text)" : "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── Horizontal Roadmap ───────────────────────────────────────────────────────
  const ROADMAP_MILESTONES = [
    { level: 1,  icon: "🎙️" },
    { level: 2,  icon: "📊" },
    { level: 3,  icon: "🏷️" },
    { level: 5,  icon: "🧊" },
    { level: 7,  icon: "⚡" },
    { level: 10, icon: "👑" },
  ];

  const Roadmap = (
    <div className="glass" style={{ flex: 1, padding: "0.875rem 1.5rem", display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.75rem" }}>
      <div style={{ fontSize: "0.56rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--blue)" }}>
        🛤️ Your Roadmap
      </div>
      <div style={{ position: "relative", height: 52, margin: "0 15px" }}>
        <div style={{ position: "absolute", top: 14, left: 0, right: 0, height: 3, borderRadius: 9999, background: isDark ? "rgba(255,255,255,0.08)" : "var(--border)" }} />
        <div style={{ position: "absolute", top: 14, left: 0, height: 3, borderRadius: 9999, width: `${fillPct}%`, background: trackGrad, boxShadow: isGlacier ? "0 0 8px rgba(56,189,248,0.4)" : "0 0 8px rgba(79,70,229,0.25)", transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
        {ROADMAP_MILESTONES.map((m) => {
          const reached = curLevel >= m.level;
          const active  = curLevel === m.level;
          const pct     = milestoneAt(m.level);
          return (
            <div key={m.level} style={{
              position: "absolute", left: `${pct}%`, transform: "translateX(-50%)",
              top: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem",
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", zIndex: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.75rem", lineHeight: 1,
                background: reached ? "rgba(var(--blue-rgb),0.12)" : "var(--surface)",
                border: reached
                  ? `2px solid var(--blue)`
                  : `2px solid ${isDark ? "rgba(255,255,255,0.15)" : "var(--border)"}`,
                boxShadow: active ? "0 0 0 3px rgba(var(--blue-rgb),0.2)" : "none",
                opacity: reached ? 1 : 0.38,
              }}>
                {m.icon}
              </div>
              <span style={{ fontSize: "0.5rem", fontWeight: active ? 800 : 600, color: reached ? "var(--blue)" : "var(--muted)", opacity: reached ? 1 : 0.5, whiteSpace: "nowrap" }}>
                Lv.{m.level}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── History helpers ──────────────────────────────────────────────────────────
  const rankLabel = (rank: number | null, total: number) => {
    if (rank === null) return "—";
    if (rank === 1) return "🥇 1st";
    if (rank === 2) return "🥈 2nd";
    if (rank === 3) return "🥉 3rd";
    return `${rank}/${total}`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  // ─── History List ─────────────────────────────────────────────────────────────
  const HistoryList = (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "0.5rem", overflowY: "auto", paddingBottom: "1rem", paddingRight: "0.25rem" }}>
      {/* Header row */}
      {!isMobile && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 60px 80px 80px",
          gap: "0.5rem",
          padding: "0 1rem",
          marginBottom: "0.1rem",
        }}>
          {["Motion", "Debaters", "Judges", "Rank", "Points"].map(h => (
            <div key={h} style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}>{h}</div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Loading history…</div>
        </div>
      ) : history.length === 0 ? (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: "0.5rem", padding: "3rem 1rem",
        }}>
          <div style={{ fontSize: "2.5rem" }}>🎙️</div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)" }}>No debates yet</div>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Join or create a room to start earning XP</div>
          <button onClick={() => navigate("/")} className="btn-primary" style={{ marginTop: "0.5rem", padding: "0.5rem 1.25rem", fontSize: "0.82rem" }}>
            Enter the Arena →
          </button>
        </div>
      ) : (
        history.map((entry) => (
          <div
            key={entry.id}
            className="glass"
            style={{
              flexShrink: 0,
              padding: isMobile ? "0.875rem 1rem" : "0.75rem 1rem",
              borderRadius: "0.875rem",
              display: isMobile ? "flex" : "grid",
              gridTemplateColumns: "1fr 80px 60px 80px 80px",
              flexDirection: isMobile ? "column" : undefined,
              gap: isMobile ? "0.4rem" : "0.5rem",
              alignItems: isMobile ? undefined : "center",
              cursor: "default",
            }}
          >
            {/* Motion */}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontWeight: 700, fontSize: "0.83rem", color: "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                lineHeight: 1.4,
              }}>
                {entry.topic}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.2rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>{formatDate(entry.endedAt)}</span>
                <span style={{
                  fontSize: "0.58rem", fontWeight: 700, padding: "0.08rem 0.4rem", borderRadius: 9999,
                  background: entry.mode === "buzzer" ? "rgba(245,158,11,0.1)" : "rgba(79,142,247,0.1)",
                  color: entry.mode === "buzzer" ? "var(--gold)" : "var(--blue)",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  {entry.mode}
                </span>
                {entry.side && (
                  <span style={{
                    fontSize: "0.58rem", fontWeight: 700, padding: "0.08rem 0.4rem", borderRadius: 9999,
                    background: entry.side === "for" ? "rgba(34,197,94,0.1)" : "rgba(244,63,94,0.1)",
                    color: entry.side === "for" ? "var(--for)" : "var(--against)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    {entry.side}
                  </span>
                )}
                {entry.isWinner !== null && (
                  <span style={{
                    fontSize: "0.58rem", fontWeight: 800,
                    color: entry.isWinner ? "var(--for)" : "var(--muted)",
                  }}>
                    {entry.isWinner ? "✓ Won" : "✗ Lost"}
                  </span>
                )}
              </div>
            </div>

            {/* Debaters */}
            <div style={{ display: "flex", alignItems: isMobile ? "center" : "center", gap: "0.35rem" }}>
              {isMobile && <span style={{ fontSize: "0.6rem", color: "var(--muted)", width: 56, flexShrink: 0 }}>Debaters</span>}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.88rem", fontWeight: 700, color: "var(--text)" }}>
                {entry.totalDebaters}
              </span>
              <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>🎙️</span>
            </div>

            {/* Judges */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              {isMobile && <span style={{ fontSize: "0.6rem", color: "var(--muted)", width: 56, flexShrink: 0 }}>Judges</span>}
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.88rem", fontWeight: 700, color: entry.totalJudges > 0 ? "var(--text)" : "var(--muted)" }}>
                {entry.totalJudges > 0 ? entry.totalJudges : "—"}
              </span>
              {entry.totalJudges > 0 && <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>⚖️</span>}
            </div>

            {/* Rank */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              {isMobile && <span style={{ fontSize: "0.6rem", color: "var(--muted)", width: 56, flexShrink: 0 }}>Rank</span>}
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82rem", fontWeight: 800,
                color: entry.rank === 1 ? "#f59e0b" : entry.rank === 2 ? "#94a3b8" : entry.rank === 3 ? "#cd7f32" : "var(--text)",
              }}>
                {rankLabel(entry.rank, entry.totalParticipants)}
              </span>
            </div>

            {/* Points */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              {isMobile && <span style={{ fontSize: "0.6rem", color: "var(--muted)", width: 56, flexShrink: 0 }}>Points</span>}
              {entry.points !== null ? (
                <>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.88rem", fontWeight: 800, color: "var(--blue)" }}>
                    {entry.points}
                  </span>
                  <span style={{ fontSize: "0.6rem", color: "var(--muted)" }}>pts</span>
                </>
              ) : (
                <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>—</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", overflow: "hidden", position: "relative" }}>
      <div className="bg-grid" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      {/* ── NAV ── */}
      <nav className="game-nav" style={{ position: "relative", flexShrink: 0 }}>
        <NavLogo isPro={isPro} isGlacier={isGlacier} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {!isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.28rem 0.65rem", borderRadius: "9999px", background: "rgba(79,70,229,0.07)", border: "1px solid rgba(79,70,229,0.2)" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", fontWeight: 900, color: "var(--blue)" }}>Lv.{curLevel}</span>
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--subtle)" }}>{lvlInfo.current.title}</span>
            </div>
          )}
          <span style={{ fontSize: "0.88rem" }}>{themeMeta.icon}</span>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div style={{
        position: "relative", zIndex: 1, flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column",
        padding: isMobile ? "1rem" : "1rem 2rem 1rem",
        maxWidth: 1100, margin: "0 auto", width: "100%",
        gap: "0.75rem",
      }}>

        {/* ← Home */}
        <div style={{ flexShrink: 0 }}>
          <button onClick={() => navigate("/")} className="btn-ghost" style={{ padding: "0.28rem 0.7rem", fontSize: "0.78rem" }}>
            ← Home
          </button>
        </div>

        {/* Heading */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div className="badge badge-cyan" style={{ marginBottom: "0.2rem", fontSize: "0.62rem", display: "inline-block" }}>🗺️ Your Journey</div>
            <h1 style={{ fontSize: isMobile ? "1.3rem" : "1.5rem", fontWeight: 900, letterSpacing: "-0.03em", color: "var(--text)", margin: 0 }}>
              Level Rewards
            </h1>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.75rem", lineHeight: 1.4, margin: 0, maxWidth: 340, textAlign: "right", display: isMobile ? "none" : "block" }}>
            Debate, earn XP, unlock rewards. No paywall — just put in the reps.
          </p>
        </div>

        {isMobile ? (
          /* ── Mobile: single scroll column ── */
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem", paddingBottom: "1rem" }}>
            {XPCard}
            {Roadmap}
            {/* History section heading */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingTop: "0.25rem" }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}>
                📜 Debate History
              </span>
              {history.length > 0 && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "var(--blue)", fontWeight: 700 }}>
                  {history.length}
                </span>
              )}
            </div>
            {HistoryList}
          </div>
        ) : (
          /* ── Desktop: top strip + history ── */
          <>
            {/* Top strip: XP card + horizontal roadmap */}
            <div style={{ display: "flex", gap: "0.75rem", flexShrink: 0 }}>
              {XPCard}
              {Roadmap}
            </div>

            {/* History section heading */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)" }}>
                📜 Debate History
              </span>
              {history.length > 0 && (
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "var(--blue)", fontWeight: 700 }}>
                  {history.length}
                </span>
              )}
            </div>

            {/* Scrollable history list */}
            {HistoryList}
          </>
        )}
      </div>
    </div>
  );
}
