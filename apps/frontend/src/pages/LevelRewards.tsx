/**
 * LevelRewards.tsx
 *
 * Viewport-locked, no-scroll layout:
 *   TOP STRIP  — XP card (left) + horizontal milestone roadmap (right)
 *   GRID       — 2-column × 3-row milestone cards, flex-fills remaining height
 *
 * Mobile: single column, natural scroll (expected on small screens)
 */

import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { getLevelInfo, LEVEL_TABLE } from "@argumint/shared";
import { NavLogo } from "../components/NavLogo";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Milestone {
  level:   number;
  icon:    string;
  reward:  string;
  desc:    string;
  detail:  string;
  glacier?: boolean;
}

const MILESTONES: Milestone[] = [
  {
    level: 1, icon: "🎙️", reward: "Debates",
    desc:   "Start competing & earn XP",
    detail: "Every debate earns XP — win or lose.",
  },
  {
    level: 2, icon: "📊", reward: "Analytics",
    desc:   "Full debate history & stats",
    detail: "Win rate, argument scores, performance trends.",
  },
  {
    level: 3, icon: "🏷️", reward: "Unique Titles",
    desc:   "New debater title every level",
    detail: "From Novice to Grand Master — shown on your profile.",
  },
  {
    level: 5, icon: "🧊", reward: "Glacier Theme",
    desc:   "Icy glassmorphism UI",
    detail: "No paywall — switch on from the theme picker.",
    glacier: true,
  },
  {
    level: 7, icon: "⚡", reward: "Elite Badge",
    desc:   "Exclusive badge in every room",
    detail: "A permanent signal that you've earned it.",
  },
  {
    level: 10, icon: "👑", reward: "Grand Master",
    desc:   "Crown status & highest title",
    detail: "A gold crown on your profile and in every room.",
  },
];

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

  const trackGrad = isGlacier
    ? "linear-gradient(90deg,#0369a1,#0284c7,#38bdf8)"
    : "linear-gradient(90deg,var(--blue),var(--violet))";

  // ── Horizontal roadmap fill % (based on current level position) ──────────────
  const milestoneAt = (level: number) => ((level - 1) / 9) * 100;
  const nextMilestone = MILESTONES.find(m => m.level > curLevel);
  const curMilPos  = milestoneAt(curLevel);
  const nextMilPos = nextMilestone ? milestoneAt(nextMilestone.level) : 100;
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
  const Roadmap = (
    <div className="glass" style={{ flex: 1, padding: "0.875rem 1.5rem", display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.75rem" }}>
      <div style={{ fontSize: "0.56rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--blue)" }}>
        🛤️ Your Roadmap
      </div>
      {/* Track — dots are absolutely positioned at their real level % so the
           fill line always lines up with the circles correctly */}
      <div style={{ position: "relative", height: 52, margin: "0 15px" }}>
        {/* Background track */}
        <div style={{ position: "absolute", top: 14, left: 0, right: 0, height: 3, borderRadius: 9999, background: isDark ? "rgba(255,255,255,0.08)" : "var(--border)" }} />
        {/* Filled track */}
        <div style={{ position: "absolute", top: 14, left: 0, height: 3, borderRadius: 9999, width: `${fillPct}%`, background: trackGrad, boxShadow: isGlacier ? "0 0 8px rgba(56,189,248,0.4)" : "0 0 8px rgba(79,70,229,0.25)", transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
        {/* Milestone dots — each pinned at its true level position */}
        {MILESTONES.map((m) => {
          const reached = curLevel >= m.level;
          const active  = curLevel === m.level;
          const pct     = milestoneAt(m.level); // 0–100
          return (
            <div key={m.level} style={{
              position: "absolute",
              left: `${pct}%`,
              transform: "translateX(-50%)",
              top: 0,
              display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem",
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", zIndex: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.75rem", lineHeight: 1,
                background: reached
                  ? (m.glacier ? (isGlacier ? "rgba(56,189,248,0.2)" : "rgba(14,165,233,0.1)") : "rgba(var(--blue-rgb),0.12)")
                  : "var(--surface)",
                border: reached
                  ? `2px solid ${m.glacier ? (isGlacier ? "#38bdf8" : "#0ea5e9") : "var(--blue)"}`
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

  // ─── Milestone Cards (2×3 grid) ───────────────────────────────────────────────
  const MilestoneGrid = (
    <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3, 1fr)", gap: "0.625rem" }}>
      {MILESTONES.map((m) => {
        const reached      = curLevel >= m.level;
        const active       = curLevel === m.level;
        const isNext       = m.level === nextMilestone?.level;
        const levelsNeeded = m.level - curLevel;

        return (
          <div
            key={m.level}
            style={{
              display: "flex", alignItems: "flex-start", gap: "0.75rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.875rem",
              background: reached
                ? (m.glacier ? (isGlacier ? "rgba(56,189,248,0.07)" : "rgba(14,165,233,0.04)") : "var(--glass-bg)")
                : (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"),
              border: `1.5px solid ${
                active
                  ? (isGlacier ? "#38bdf8" : "var(--blue)")
                  : reached
                    ? (m.glacier ? (isGlacier ? "rgba(56,189,248,0.3)" : "rgba(14,165,233,0.2)") : "rgba(var(--blue-rgb),0.18)")
                    : (isDark ? "rgba(255,255,255,0.06)" : "var(--border)")
              }`,
              opacity: reached ? 1 : isNext ? 0.72 : 0.45,
              backdropFilter: reached ? "blur(20px)" : "none",
              WebkitBackdropFilter: reached ? "blur(20px)" : "none",
              boxShadow: active
                ? isGlacier ? "0 4px 24px rgba(56,189,248,0.14)" : "0 4px 24px rgba(79,70,229,0.1)"
                : "none",
              overflow: "hidden",
            }}
          >
            {/* Icon */}
            <div style={{
              width: 38, height: 38, borderRadius: "0.625rem", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem",
              background: reached
                ? (m.glacier ? (isGlacier ? "rgba(56,189,248,0.15)" : "rgba(14,165,233,0.1)") : "rgba(var(--blue-rgb),0.1)")
                : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
              border: `1px solid ${reached
                ? (m.glacier ? (isGlacier ? "rgba(56,189,248,0.3)" : "rgba(14,165,233,0.2)") : "rgba(var(--blue-rgb),0.18)")
                : (isDark ? "rgba(255,255,255,0.07)" : "var(--border)")}`,
            }}>
              {m.icon}
            </div>

            {/* Body */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: "0.85rem", color: reached ? "var(--text)" : "var(--muted)" }}>
                  {m.reward}
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", fontWeight: 800,
                  padding: "0.08rem 0.38rem", borderRadius: "9999px",
                  background: reached
                    ? (m.glacier ? (isGlacier ? "rgba(56,189,248,0.18)" : "rgba(14,165,233,0.1)") : "rgba(var(--blue-rgb),0.1)")
                    : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"),
                  color: reached ? (m.glacier && isGlacier ? "#38bdf8" : "var(--blue)") : "var(--muted)",
                }}>
                  Lv.{m.level}
                </span>
                <span style={{ marginLeft: "auto", fontSize: "0.56rem", fontWeight: reached ? 800 : 600, color: reached ? (isGlacier ? "#0284c7" : "var(--blue)") : "var(--muted)", flexShrink: 0 }}>
                  {reached ? "✓ Unlocked" : isNext ? `${levelsNeeded}lv away` : `Lv.${m.level} req.`}
                </span>
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--subtle)", fontWeight: 600, marginBottom: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.desc}
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--muted)", lineHeight: 1.5 }}>
                {m.detail}
              </div>
              {/* Glacier pill */}
              {m.glacier && reached && (
                <div style={{ marginTop: "0.35rem", display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.15rem 0.5rem", borderRadius: "9999px", background: isGlacier ? "rgba(56,189,248,0.14)" : "rgba(14,165,233,0.07)", border: `1px solid ${isGlacier ? "rgba(56,189,248,0.35)" : "rgba(14,165,233,0.2)"}` }}>
                  <span style={{ fontSize: "0.55rem" }}>🧊</span>
                  <span style={{ fontSize: "0.55rem", fontWeight: 700, color: isGlacier ? "#0284c7" : "#0369a1" }}>
                    {isGlacier ? "Active now" : "Enable in theme picker ↗"}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
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
          <button onClick={() => navigate("/")} className="btn-ghost" style={{ padding: "0.35rem 0.9rem", fontSize: "0.78rem" }}>
            ← Home
          </button>
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

        {/* Compact heading */}
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
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {MILESTONES.map((m) => {
                const reached      = curLevel >= m.level;
                const active       = curLevel === m.level;
                const isNext       = m.level === nextMilestone?.level;
                const levelsNeeded = m.level - curLevel;
                return (
                  <div key={m.level} style={{
                    display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.875rem 1rem", borderRadius: "0.875rem",
                    background: reached ? "var(--glass-bg)" : (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"),
                    border: `1.5px solid ${active ? "var(--blue)" : reached ? "rgba(var(--blue-rgb),0.18)" : (isDark ? "rgba(255,255,255,0.06)" : "var(--border)")}`,
                    opacity: reached ? 1 : isNext ? 0.72 : 0.45,
                  }}>
                    <div style={{ width: 38, height: 38, borderRadius: "0.625rem", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", background: reached ? "rgba(var(--blue-rgb),0.1)" : "transparent", border: `1px solid ${reached ? "rgba(var(--blue-rgb),0.2)" : "var(--border)"}` }}>
                      {m.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.88rem", color: reached ? "var(--text)" : "var(--muted)" }}>{m.reward}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 800, padding: "0.08rem 0.38rem", borderRadius: 9999, background: "rgba(var(--blue-rgb),0.08)", color: "var(--blue)" }}>Lv.{m.level}</span>
                        <span style={{ marginLeft: "auto", fontSize: "0.58rem", fontWeight: 700, color: reached ? "var(--blue)" : "var(--muted)" }}>{reached ? "✓" : isNext ? `${levelsNeeded}lv` : "🔒"}</span>
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--subtle)", fontWeight: 600 }}>{m.desc}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--muted)", lineHeight: 1.5, marginTop: "0.1rem" }}>{m.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Desktop: top strip + grid, all in fixed height ── */
          <>
            {/* Top strip: XP card + horizontal roadmap */}
            <div style={{ display: "flex", gap: "0.75rem", flexShrink: 0 }}>
              {XPCard}
              {Roadmap}
            </div>

            {/* 2×3 milestone grid — fills all remaining height */}
            {MilestoneGrid}
          </>
        )}
      </div>
    </div>
  );
}
