import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme, THEMES } from "../contexts/ThemeContext";
import { getLevelInfo } from "@argumint/shared";
import { useIsMobile } from "../hooks/useIsMobile";
import { NavLogo } from "../components/NavLogo";
import { ProWelcomeModal } from "../components/ProWelcomeModal";
import { platformApi } from "../services/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  id: string;
  username: string;
  xp: number;
  debatesWon: number;
  totalDebates: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function winRate(won: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((won / total) * 100)}%`;
}

const AVATAR_PALETTES = [
  { bg: "#ede9fe", color: "#4f46e5", border: "#c4b5fd" },
  { bg: "#d1fae5", color: "#047857", border: "#6ee7b7" },
  { bg: "#e0f2fe", color: "#0369a1", border: "#7dd3fc" },
  { bg: "#fce7f3", color: "#be185d", border: "#f9a8d4" },
  { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
  { bg: "#fee2e2", color: "#b91c1c", border: "#fca5a5" },
];
function avatarPalette(username: string) {
  return AVATAR_PALETTES[username.charCodeAt(0) % AVATAR_PALETTES.length];
}

// ─── Stat box ─────────────────────────────────────────────────────────────────
function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1.2rem", fontWeight: 900, color: color ?? "var(--text)", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "0.2rem" }}>
        {label}
      </div>
    </div>
  );
}


// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{
      flex: 1,
      background: "var(--surface)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1px solid var(--border)",
      borderRadius: "0.875rem",
      padding: "1rem 1.125rem",
      display: "flex", flexDirection: "column", gap: "0.4rem",
      boxShadow: "0 2px 12px rgba(79,70,229,0.06)",
      transition: "transform 0.22s ease, box-shadow 0.22s ease",
    }}
    onMouseEnter={e => {
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 28px rgba(79,70,229,0.12)";
    }}
    onMouseLeave={e => {
      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(79,70,229,0.06)";
    }}
    >
      <div style={{ fontSize: "1.35rem" }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: "0.82rem", color: "var(--text)" }}>{title}</div>
      <div style={{ fontSize: "0.72rem", color: "var(--muted)", lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

// ─── Module-level cache (survives tab switches / route navigations) ───────────
let _statsCache: { activeRooms: number; liveDebates: number; totalDebates: number } | null = null;
let _leaderboardCache: LeaderboardEntry[] | null = null;

// ─── Main ────────────────────────────────────────────────────────────────────

export function Home() {
  const navigate  = useNavigate();
  const { user, logout, isLoading } = useAuth();
  const { theme, setTheme, meta: themeMeta } = useTheme();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "leaderboard" | "profile">("home");
  const isMobile  = useIsMobile();
  const isPro          = (user as any)?.isPro ?? false;
  const isDev          = user?.email === "bkumar28899@gmail.com";
  const subStatus      = (user as any)?.subscriptionStatus ?? null;
  const isCancelled    = subStatus === "cancelled";

  // Seed from cache so there's no empty-state flash on remount
  const [stats,       setStats]       = useState<{ activeRooms: number; liveDebates: number; totalDebates: number } | null>(_statsCache);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(_leaderboardCache ?? []);

  // Pro welcome modal — shown once per user after first upgrade
  const userId = (user as any)?.id ?? (user as any)?._id ?? "";
  const [showProWelcome, setShowProWelcome] = useState(() => {
    if (!isPro || !userId) return false;
    return !localStorage.getItem(`proWelcome_${userId}`);
  });

  const xp        = (user as any)?.xp ?? 0;
  const lvlInfo   = getLevelInfo(xp);
  const userStats = (user as any)?.stats ?? { debatesWon: 0, debatesLost: 0, totalDebates: 0 };

  useEffect(() => {
    // Fetch once on first visit; skip on subsequent mounts (cache is warm).
    // Data refreshes naturally on full page reload — no polling needed.
    if (_statsCache && _leaderboardCache) return;
    let alive = true;
    Promise.all([platformApi.getStats(), platformApi.getLeaderboard()]).then(([s, lb]) => {
      if (!alive) return;
      _statsCache = s;
      _leaderboardCache = lb;
      setStats(s);
      setLeaderboard(lb);
    });
    return () => { alive = false; };
  }, []);

  const handleLogout = async () => { try { await logout(); navigate("/login"); } catch {} };

  // ─── Player card ─────────────────────────────────────────────────────────
  const isDark    = theme === "dark";
  const isGlacier = theme === "glacier";

  // ── Accent palette: glacier uses pure blue, everything else uses gold ──
  const ac = {
    color:   isGlacier ? "#0284c7"                                    : "#f59e0b",
    dark:    isGlacier ? "#0369a1"                                    : "#d97706",
    bright:  isGlacier ? "#38bdf8"                                    : "#fbbf24",
    grad:    isGlacier ? "linear-gradient(90deg,#0284c7,#38bdf8)"     : "linear-gradient(90deg,#f59e0b,#fbbf24)",
    grad135: isGlacier ? "linear-gradient(135deg,#0369a1,#0284c7,#38bdf8)" : "linear-gradient(135deg,#f59e0b,#fbbf24,#f97316)",
    bg:      isGlacier ? "rgba(2,132,199,0.12)"                       : (isDark ? "rgba(245,158,11,0.18)" : "rgba(245,158,11,0.12)"),
    bgCard:  isGlacier
               ? "linear-gradient(160deg,rgba(2,132,199,0.1) 0%,rgba(14,165,233,0.05) 60%)"
               : isDark
                 ? "linear-gradient(160deg,rgba(245,158,11,0.08) 0%,rgba(15,15,26,0.9) 60%)"
                 : "linear-gradient(160deg,rgba(245,158,11,0.04) 0%,rgba(255,255,255,0.72) 60%)",
    border:  isGlacier ? "rgba(2,132,199,0.4)"                        : "rgba(245,158,11,0.4)",
    border2: isGlacier ? "rgba(2,132,199,0.25)"                       : "rgba(245,158,11,0.25)",
    shadow:  isGlacier ? "rgba(2,132,199,0.12)"                       : "rgba(245,158,11,0.12)",
    glow:    isGlacier
               ? "0 0 28px rgba(2,132,199,0.14), 0 2px 16px rgba(0,0,0,0.15)"
               : isDark
                 ? "0 0 28px rgba(245,158,11,0.12), 0 2px 16px rgba(0,0,0,0.4)"
                 : "0 0 24px rgba(245,158,11,0.08), 0 2px 12px rgba(0,0,0,0.06)",
  };
  const PlayerCard = (
    <div
      className="glass glass-interactive fade-up"
      onClick={() => navigate("/level-rewards")}
      style={{
        padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem",
        cursor: "pointer",
        ...(isPro ? {
          border: `1.5px solid ${ac.border.replace("0.4","0.45")}`,
          boxShadow: ac.glow,
          background: ac.bgCard,
        } : {}),
      }}
    >
      {/* Pro crown banner */}
      {isPro && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "-0.25rem" }}>
          <span style={{ fontSize: "0.75rem" }}>👑</span>
          <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", backgroundImage: ac.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Pro Member
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
          background: isPro
            ? (isGlacier ? "linear-gradient(135deg,#0284c7,#0369a1)" : "linear-gradient(135deg,#f59e0b,#d97706)")
            : "linear-gradient(135deg, #4f46e5, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.3rem", fontWeight: 900, color: "#fff",
          boxShadow: isPro
            ? (isGlacier ? "0 4px 16px rgba(2,132,199,0.5)" : "0 4px 16px rgba(245,158,11,0.5)")
            : "0 4px 16px rgba(79,70,229,0.4)",
        }}>
          {user?.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.username}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.15rem" }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 900,
              padding: "0.1rem 0.45rem", borderRadius: "9999px",
              background: isPro
                ? ac.bg
                : (isDark ? "rgba(99,102,241,0.18)" : "rgba(79,70,229,0.1)"),
              border: isPro ? `1px solid ${ac.border}` : "1px solid rgba(79,70,229,0.35)",
              color: isPro ? ac.dark : "var(--blue)",
            }}>
              Lv.{lvlInfo.current.level}
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--subtle)", fontWeight: 600 }}>
              {lvlInfo.current.title}
            </span>
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
          <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {lvlInfo.next ? `Progress to Lv.${lvlInfo.next.level}` : "Max Level"}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "var(--muted)" }}>
            {lvlInfo.progressXP}{lvlInfo.next ? `/${lvlInfo.neededXP} XP` : " XP"}
          </span>
        </div>
        <div style={{ height: 7, borderRadius: "9999px", background: isDark ? "rgba(255,255,255,0.12)" : "var(--border2)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%", borderRadius: "9999px", width: `${lvlInfo.progressPct}%`,
              transition: "width 1.1s cubic-bezier(.4,0,.2,1)",
            }}
            className="xp-bar-fill"
          />
        </div>
        <div style={{ fontSize: "0.58rem", color: "var(--muted)", marginTop: "0.2rem", textAlign: "right" }}>{xp} total XP</div>
      </div>

      <div style={{
        display: "flex", gap: "0.5rem", padding: "0.75rem 0.5rem", borderRadius: "0.625rem",
        background: isPro
          ? (isGlacier ? "rgba(2,132,199,0.07)" : isDark ? "rgba(245,158,11,0.08)" : "rgba(245,158,11,0.04)")
          : isDark ? "rgba(99,102,241,0.08)" : "rgba(79,70,229,0.03)",
        border: `1px solid ${isPro ? ac.border2 : isDark ? "rgba(99,102,241,0.2)" : "var(--border)"}`,
      }}>
        <StatBox label="Won"   value={userStats.debatesWon}   color="var(--for)" />
        <div style={{ width: 1, background: "var(--border)" }} />
        <StatBox label="Lost"  value={userStats.debatesLost}  color="var(--against)" />
        <div style={{ width: 1, background: "var(--border)" }} />
        <StatBox label="Total" value={userStats.totalDebates} />
        <div style={{ width: 1, background: "var(--border)" }} />
        <StatBox label="Win %" value={winRate(userStats.debatesWon, userStats.totalDebates)} color="var(--cyan)" />
      </div>
    </div>
  );

  // ─── Leaderboard ──────────────────────────────────────────────────────────
  const LeaderboardPanel = (
    <div className="glass glass-interactive fade-up" style={{ padding: "1.125rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.875rem" }}>
        <span>🏆</span>
        <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--blue)" }}>Top Debaters</span>
      </div>
      {leaderboard.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)", textAlign: "center", padding: "0.75rem 0" }}>No data yet — be the first!</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {leaderboard.slice(0, 3).map((entry, i) => {
            const isMe    = entry.id === (user as any)?.id;
            const isFirst = i === 0;
            const lvl     = getLevelInfo(entry.xp);
            const pal     = avatarPalette(entry.username);
            return (
              <div key={entry.id} style={{
                display: "flex", alignItems: "center", gap: "0.55rem",
                padding: isFirst ? "0.55rem 0.75rem" : "0.4rem 0.625rem",
                borderRadius: "0.625rem",
                background: isFirst
                  ? (isGlacier ? "linear-gradient(135deg,rgba(2,132,199,0.12),rgba(14,165,233,0.06))" : "linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.06))")
                  : isMe ? "rgba(79,70,229,0.07)" : "var(--surface)",
                border: `1px solid ${isFirst ? (isGlacier ? "rgba(2,132,199,0.38)" : "rgba(245,158,11,0.38)") : isMe ? "rgba(79,70,229,0.28)" : "var(--border)"}`,
                boxShadow: isFirst ? (isGlacier ? "0 2px 12px rgba(2,132,199,0.14)" : "0 2px 12px rgba(245,158,11,0.14)") : "none",
                transition: "background 0.2s",
              }}>
                <div style={{
                  width: isFirst ? 28 : 24, height: isFirst ? 28 : 24, borderRadius: "50%", flexShrink: 0,
                  background: pal.bg, border: `1.5px solid ${pal.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: isFirst ? "0.72rem" : "0.62rem", fontWeight: 900, color: pal.color,
                }}>
                  {entry.username[0].toUpperCase()}
                </div>
                <span style={{ flex: 1, fontWeight: isFirst || isMe ? 800 : 600, fontSize: "0.82rem", color: isFirst ? (isGlacier ? "#0369a1" : "#92400e") : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isFirst && "👑 "}{entry.username}{isMe && !isFirst ? " 👤" : ""}
                </span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.05rem", flexShrink: 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 800, color: isFirst ? (isGlacier ? "#0284c7" : "#d97706") : "var(--blue)" }}>
                    {entry.xp} <span style={{ fontWeight: 600, color: "var(--muted)", fontSize: "0.58rem" }}>XP</span>
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", color: "var(--muted)" }}>Lv.{lvl.current.level}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── Social proof strip ───────────────────────────────────────────────────
  const topDebater = leaderboard[0] ?? null;
  const SocialStrip = (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
      <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <span style={{ fontSize: "0.76rem", fontWeight: 900, color: "var(--blue)", fontFamily: "'JetBrains Mono', monospace" }}>{(stats?.totalDebates ?? 0).toLocaleString()}</span>
        <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>debates hosted</span>
      </div>
      {(stats?.activeRooms ?? 0) > 0 && (
        <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <div className="pulse-dot pulse-dot-green" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "0.76rem", fontWeight: 900, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{stats?.activeRooms}</span>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>rooms open</span>
        </div>
      )}
      {(stats?.liveDebates ?? 0) > 0 && (
        <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <div className="pulse-dot pulse-dot-red" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "0.76rem", fontWeight: 900, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{stats?.liveDebates}</span>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>live now</span>
        </div>
      )}
      {topDebater && (
        <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.74rem" }}>🥇</span>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>Top debater:</span>
          <span style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--blue)" }}>{topDebater.username}</span>
          <span style={{ fontSize: "0.65rem", color: "var(--muted)", fontFamily: "'JetBrains Mono', monospace" }}>{topDebater.xp} XP</span>
        </div>
      )}
    </div>
  );

  // ── Theme picker panel (shared between mobile + desktop) ─────────────────
  const ThemePickerPanel = showThemePicker ? (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowThemePicker(false)} />
      <div style={{
        position: "fixed", top: 52, right: 12, zIndex: 200,
        background: "rgba(255,255,255,0.97)", border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: "0.875rem", padding: "0.4rem",
        boxShadow: "0 12px 40px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", gap: "0.2rem", minWidth: 175,
      }}>
        <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", padding: "0.2rem 0.5rem 0.3rem" }}>Theme</div>
        {THEMES.map(t => {
          const active     = theme === t.id;
          const levelGated = t.id === "glacier" && lvlInfo.current.level < 5;
          return (
            <button key={t.id}
              onClick={() => { if (levelGated) { setShowThemePicker(false); return; } setTheme(t.id); setShowThemePicker(false); }}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.55rem", borderRadius: "0.55rem", border: "none", cursor: levelGated ? "default" : "pointer", textAlign: "left", width: "100%", background: active ? "rgba(2,132,199,0.08)" : "transparent", opacity: levelGated ? 0.65 : 1, fontFamily: "inherit", color: "#1e293b" }}
              onMouseEnter={e => { if (!active && !levelGated) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { if (!active && !levelGated) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span style={{ fontSize: "0.95rem", lineHeight: 1, flexShrink: 0 }}>{t.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.75rem", fontWeight: active ? 800 : 600, color: active ? "#0284c7" : "#1e293b", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  {t.label}
                  {levelGated && <span style={{ fontSize: "0.52rem", fontWeight: 800, padding: "0.08rem 0.3rem", borderRadius: "9999px", background: "rgba(14,165,233,0.12)", color: "#0284c7" }}>Lv.5</span>}
                </div>
                <div style={{ fontSize: "0.6rem", color: "#64748b", marginTop: "0.04rem" }}>{t.desc}</div>
              </div>
              {active ? <span style={{ fontSize: "0.68rem", color: "#0284c7", flexShrink: 0 }}>✓</span> : levelGated ? <span style={{ fontSize: "0.62rem", color: "#94a3b8", flexShrink: 0 }}>🔒</span> : null}
            </button>
          );
        })}
      </div>
    </>
  ) : null;

  // ══════════════════════════════════════════════════════════════════════════
  // ── MOBILE LAYOUT (no scroll, bottom nav) ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    const totalDebates = stats?.totalDebates ?? 0;

    // Compact player summary used in Profile tab
    const MobilePlayerCard = (
      <div className="glass" onClick={() => navigate("/level-rewards")} style={{
        padding: "1rem 1.125rem", cursor: "pointer",
        ...(isPro ? { border: `1.5px solid ${ac.border}`, boxShadow: ac.glow, background: ac.bgCard } : {}),
      }}>
        {isPro && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.7rem" }}>👑</span>
            <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", backgroundImage: ac.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Pro Member</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: isPro ? (isGlacier ? "linear-gradient(135deg,#0284c7,#0369a1)" : "linear-gradient(135deg,#f59e0b,#d97706)") : "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 900, color: "#fff", boxShadow: isPro ? (isGlacier ? "0 3px 12px rgba(2,132,199,0.45)" : "0 3px 12px rgba(245,158,11,0.45)") : "0 3px 12px rgba(79,70,229,0.4)" }}>
            {user?.username?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.username}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.12rem" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", fontWeight: 900, padding: "0.08rem 0.4rem", borderRadius: "9999px", background: isPro ? ac.bg : "rgba(79,70,229,0.1)", border: isPro ? `1px solid ${ac.border}` : "1px solid rgba(79,70,229,0.3)", color: isPro ? ac.dark : "var(--blue)" }}>Lv.{lvlInfo.current.level}</span>
              <span style={{ fontSize: "0.68rem", color: "var(--muted)", fontWeight: 600 }}>{lvlInfo.current.title}</span>
            </div>
          </div>
        </div>
        {/* XP bar */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.56rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{lvlInfo.next ? `To Lv.${lvlInfo.next.level}` : "Max Level"}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem", color: "var(--muted)" }}>{lvlInfo.progressXP}{lvlInfo.next ? `/${lvlInfo.neededXP} XP` : " XP"}</span>
          </div>
          <div style={{ height: 6, borderRadius: "9999px", background: isDark ? "rgba(255,255,255,0.1)" : "var(--border2)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: "9999px", width: `${lvlInfo.progressPct}%`, transition: "width 1.1s cubic-bezier(.4,0,.2,1)" }} className="xp-bar-fill" />
          </div>
          <div style={{ fontSize: "0.54rem", color: "var(--muted)", marginTop: "0.15rem", textAlign: "right" }}>{xp} total XP</div>
        </div>
        {/* Stats */}
        <div style={{ display: "flex", gap: "0.4rem", padding: "0.625rem 0.4rem", borderRadius: "0.5rem", background: isPro ? (isGlacier ? "rgba(2,132,199,0.06)" : isDark ? "rgba(245,158,11,0.07)" : "rgba(245,158,11,0.03)") : isDark ? "rgba(99,102,241,0.07)" : "rgba(79,70,229,0.03)", border: `1px solid ${isPro ? ac.border2 : isDark ? "rgba(99,102,241,0.18)" : "var(--border)"}` }}>
          <StatBox label="Won"   value={userStats.debatesWon}   color="var(--for)" />
          <div style={{ width: 1, background: "var(--border)" }} />
          <StatBox label="Lost"  value={userStats.debatesLost}  color="var(--against)" />
          <div style={{ width: 1, background: "var(--border)" }} />
          <StatBox label="Total" value={userStats.totalDebates} />
          <div style={{ width: 1, background: "var(--border)" }} />
          <StatBox label="Win %" value={winRate(userStats.debatesWon, userStats.totalDebates)} color="var(--cyan)" />
        </div>
      </div>
    );

    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", position: "relative" }}>
        {/* Background layers */}
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: isPro ? "radial-gradient(ellipse 70% 60% at 15% 0%,rgba(245,158,11,0.07) 0%,transparent 60%)" : "radial-gradient(ellipse 70% 60% at 15% 0%,rgba(124,58,237,0.07) 0%,transparent 60%)" }} />
        <div className="bg-grid" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

        {/* ── TOP NAV ── */}
        <nav style={{ position: "relative", zIndex: 10, flexShrink: 0, height: 56, padding: "0 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
          <NavLogo isPro={isPro} isGlacier={isGlacier} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {isPro && (
              <div style={{ padding: "0.15rem 0.5rem", borderRadius: "9999px", background: ac.bg, border: `1px solid ${ac.border}`, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <span style={{ fontSize: "0.6rem" }}>👑</span>
                <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.06em", backgroundImage: ac.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>PRO</span>
              </div>
            )}
            {!isPro && (
              <button onClick={() => navigate("/pricing")} className="btn-primary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.68rem", fontWeight: 800 }}>⚡ Upgrade</button>
            )}
            <button onClick={() => setShowThemePicker(p => !p)} className="btn-ghost" title="Theme" style={{ padding: "0.28rem 0.45rem", fontSize: "0.82rem", lineHeight: 1 }}>
              {themeMeta.icon}
            </button>
          </div>
        </nav>

        {/* ── CONTENT AREA ── */}
        <div style={{ flex: 1, minHeight: 0, position: "relative", zIndex: 1, paddingBottom: "calc(58px + env(safe-area-inset-bottom, 0px))" }}>

          {/* ─── HOME TAB ─── */}
          {activeTab === "home" && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "1rem 1rem", gap: "0.7rem", overflow: "hidden", justifyContent: "center" }}>

              {/* ── HERO BLOCK ── badge + heading + description together */}
              <div>
                {isPro ? (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.55rem", padding: "0.18rem 0.625rem", borderRadius: "9999px", background: isGlacier ? "linear-gradient(135deg,rgba(2,132,199,0.14),rgba(14,165,233,0.07))" : "linear-gradient(135deg,rgba(245,158,11,0.14),rgba(251,191,36,0.07))", border: `1px solid ${ac.border}` }}>
                    <span style={{ fontSize: "0.68rem" }}>👑</span>
                    <span style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", backgroundImage: ac.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Pro — Live Debate Platform</span>
                  </div>
                ) : (
                  <div className="badge badge-cyan" style={{ marginBottom: "0.55rem", fontSize: "0.6rem" }}>⚡ Live Debate Platform</div>
                )}
                <h1 style={{ fontSize: "2.4rem", fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.03em", margin: "0 0 0.5rem", color: "var(--text)" }}>
                  {isGlacier ? (
                    <><span style={{ backgroundImage: "linear-gradient(135deg,#0369a1,#0284c7,#38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Argue smarter.</span><br /><span style={{ backgroundImage: "linear-gradient(135deg,#0369a1,#0284c7,#38bdf8,#bae6fd)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Win the room.</span></>
                  ) : isPro ? (
                    <><span style={{ backgroundImage: ac.grad135, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Argue smarter.</span><br /><span style={{ backgroundImage: "linear-gradient(135deg,#22d3ee,#4f46e5,#7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Win the room.</span></>
                  ) : (
                    <>Argue smarter.<br /><span style={{ backgroundImage: "linear-gradient(135deg,#22d3ee,#4f46e5,#7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Win the room.</span></>
                  )}
                </h1>
                <p style={{ margin: 0, color: "var(--subtle)", fontSize: "0.82rem", lineHeight: 1.6 }}>
                  Real-time structured debates. AI judging. Live transcription.<br />
                  Compete against others or sharpen your rhetoric.
                </p>
              </div>

              {/* Live stats pills */}
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <div className="glass" style={{ padding: "0.28rem 0.55rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.28rem" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 900, color: "var(--blue)" }}>{totalDebates.toLocaleString()}</span>
                  <span style={{ fontSize: "0.62rem", color: "var(--muted)", fontWeight: 600 }}>debates</span>
                </div>
                <div className="glass" style={{ padding: "0.28rem 0.55rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.28rem" }}>
                  <div className="pulse-dot pulse-dot-green" style={{ flexShrink: 0 }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 900, color: "var(--text)" }}>{stats?.activeRooms ?? 0}</span>
                  <span style={{ fontSize: "0.62rem", color: "var(--muted)", fontWeight: 600 }}>rooms open</span>
                </div>
                {(stats?.liveDebates ?? 0) > 0 && (
                  <div className="glass" style={{ padding: "0.28rem 0.55rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.28rem" }}>
                    <div className="pulse-dot pulse-dot-red" style={{ flexShrink: 0 }} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 900, color: "var(--against)" }}>{stats?.liveDebates} live</span>
                  </div>
                )}
              </div>

              {/* CTA buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                <button onClick={() => navigate("/create-room")} className="btn-primary" style={{ padding: "0.825rem", fontSize: "0.95rem", fontWeight: 800, width: "100%" }}>
                  ⚔️ Create Room
                </button>
                <button onClick={() => navigate("/join-room")} className="btn-for" style={{ padding: "0.825rem", fontSize: "0.95rem", fontWeight: 800, width: "100%" }}>
                  🎯 Join Room
                </button>
              </div>

              {/* Upgrade teaser (non-Pro) */}
              {!isPro && (
                <div onClick={() => navigate("/pricing")} style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.55rem 0.875rem", borderRadius: "0.75rem", cursor: "pointer", background: isGlacier ? "linear-gradient(135deg,rgba(2,132,199,0.07),rgba(14,165,233,0.03))" : "linear-gradient(135deg,rgba(245,158,11,0.07),rgba(251,191,36,0.03))", border: `1px solid ${ac.border.replace("0.4","0.28")}` }}>
                  <span style={{ fontSize: "0.95rem", flexShrink: 0 }}>⚡</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 800, backgroundImage: ac.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Argumint Pro</div>
                    <div style={{ fontSize: "0.58rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Judges · Spectators · Buzzer · Voting — ₹50/mo</div>
                  </div>
                  <span style={{ fontSize: "0.65rem", fontWeight: 700, color: ac.dark, flexShrink: 0 }}>→</span>
                </div>
              )}

              {/* Feature cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {([
                  { icon: "🤖", title: "AI Judging",         desc: "GPT-4 scores every argument on rhetoric, clarity and evidence in real time." },
                  { icon: "🎤", title: "Live Transcription", desc: "Whisper-powered voice-to-text so you can speak your arguments, hands-free." },
                  { icon: "🏆", title: "Ranked Play",        desc: "Climb the leaderboard, earn XP and unlock titles with every debate you win." },
                ] as { icon: string; title: string; desc: string }[]).map(({ icon, title, desc }) => (
                  <div key={title} className="glass" style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.5rem 0.75rem", borderRadius: "0.75rem" }}>
                    <span style={{ fontSize: "1.1rem", flexShrink: 0, lineHeight: 1 }}>{icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text)", marginBottom: "0.08rem" }}>{title}</div>
                      <div style={{ fontSize: "0.6rem", color: "var(--muted)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── PROFILE TAB ─── */}
          {activeTab === "profile" && (
            <div style={{ height: "100%", overflowY: "auto", padding: "0.875rem 1rem" }}>
              {MobilePlayerCard}
              <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {/* Dev tools */}
                {isDev && (
                  <div className="glass" style={{ padding: "0.625rem 0.875rem", borderRadius: "0.75rem" }}>
                    <div style={{ fontSize: "0.55rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.4rem" }}>Dev Previews</div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {([["🧪", "/room/PREVIEW/result/preview", "Result"], ["🎙", "/room/PREVIEW/debate/preview", "Alternate"], ["🔔", "/room/PREVIEW/debate/preview-buzzer", "Buzzer"]] as [string, string, string][]).map(([icon, path, label]) => (
                        <button key={path} onClick={() => navigate(path)} className="btn-ghost" style={{ flex: 1, padding: "0.4rem 0.25rem", fontSize: "0.7rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.1rem" }}>
                          <span>{icon}</span>
                          <span style={{ fontSize: "0.52rem" }}>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Logout */}
                <button onClick={handleLogout} disabled={isLoading} className="btn-danger" style={{ width: "100%", padding: "0.75rem", fontSize: "0.88rem", fontWeight: 700 }}>
                  {isLoading ? "…" : "Sign out"}
                </button>
              </div>
            </div>
          )}

          {/* ─── LEADERBOARD TAB ─── */}
          {activeTab === "leaderboard" && (
            <div style={{ height: "100%", overflowY: "auto", padding: "0.875rem 1rem" }}>
              <div className="glass" style={{ padding: "1rem 1.125rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.875rem" }}>
                  <span>🏆</span>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--blue)" }}>Top Debaters</span>
                </div>
                {leaderboard.length === 0 ? (
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", textAlign: "center", padding: "0.75rem 0" }}>No data yet — be the first!</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {leaderboard.map((entry, i) => {
                      const isMe = entry.id === (user as any)?.id;
                      const isFirst = i === 0;
                      const lvl = getLevelInfo(entry.xp);
                      const pal = avatarPalette(entry.username);
                      return (
                        <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: isFirst ? "0.5rem 0.7rem" : "0.375rem 0.6rem", borderRadius: "0.6rem", background: isFirst ? (isGlacier ? "linear-gradient(135deg,rgba(2,132,199,0.12),rgba(14,165,233,0.06))" : "linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.06))") : isMe ? "rgba(79,70,229,0.07)" : "var(--surface)", border: `1px solid ${isFirst ? (isGlacier ? "rgba(2,132,199,0.35)" : "rgba(245,158,11,0.35)") : isMe ? "rgba(79,70,229,0.25)" : "var(--border)"}` }}>
                          <div style={{ width: isFirst ? 28 : 24, height: isFirst ? 28 : 24, borderRadius: "50%", flexShrink: 0, background: pal.bg, border: `1.5px solid ${pal.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isFirst ? "0.7rem" : "0.6rem", fontWeight: 900, color: pal.color }}>
                            {entry.username[0].toUpperCase()}
                          </div>
                          <span style={{ flex: 1, fontWeight: isFirst || isMe ? 800 : 600, fontSize: "0.82rem", color: isFirst ? (isGlacier ? "#0369a1" : "#92400e") : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {isFirst && "👑 "}{entry.username}{isMe && !isFirst ? " 👤" : ""}
                          </span>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 800, color: isFirst ? (isGlacier ? "#0284c7" : "#d97706") : "var(--blue)" }}>{entry.xp} <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: "0.55rem" }}>XP</span></span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", color: "var(--muted)" }}>Lv.{lvl.current.level}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── BOTTOM NAV ── */}
        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, height: "calc(58px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid var(--border)", background: "var(--bg)", display: "flex", alignItems: "stretch", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {([
            { id: "home",        icon: "🏠", label: "Home" },
            { id: "leaderboard", icon: "🏆", label: "Rank" },
            { id: "profile",     icon: "👤", label: "Me"   },
          ] as { id: string; icon: string; label: string }[]).map(({ id, icon, label }) => {
            const isActive = activeTab === id;
            const accentColor = isGlacier ? "#0284c7" : "var(--blue)";
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id as "home" | "leaderboard" | "profile")}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.12rem",
                  background: "transparent", border: "none", cursor: "pointer", padding: "0.2rem 0", position: "relative",
                }}
              >
                {isActive && (
                  <div style={{ position: "absolute", top: 0, left: "22%", right: "22%", height: 2, borderRadius: "0 0 3px 3px", background: accentColor }} />
                )}
                <span style={{ fontSize: isActive ? "1.15rem" : "1.05rem", lineHeight: 1, transition: "font-size 0.15s" }}>{icon}</span>
                <span style={{ fontSize: "0.5rem", fontWeight: isActive ? 800 : 600, color: isActive ? accentColor : "var(--muted)", letterSpacing: "0.04em", transition: "color 0.15s" }}>
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Theme picker dropdown */}
        {ThemePickerPanel}

        {/* Pro welcome modal */}
        {showProWelcome && userId && <ProWelcomeModal userId={userId} onClose={() => setShowProWelcome(false)} />}
      </div>
    );
  }
  // ── END MOBILE ─────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", position: "relative" }}>
      {/* Clean gradient bg — golden tint for Pro */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: isPro
          ? "radial-gradient(ellipse 70% 60% at 15% 0%, rgba(245,158,11,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 90% 100%, rgba(251,191,36,0.05) 0%, transparent 55%)"
          : "radial-gradient(ellipse 70% 60% at 15% 0%, rgba(124,58,237,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 90% 100%, rgba(14,165,233,0.06) 0%, transparent 55%)",
      }} />
      {/* Soft grid */}
      <div className="bg-grid" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      {/* ── NAV ── */}
      <nav className="game-nav" style={{ position: "relative" }}>
        <NavLogo isPro={isPro} isGlacier={isGlacier} />
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {!isMobile && (stats?.liveDebates ?? 0) > 0 && (
            <div className="nav-chip" style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.22rem 0.6rem", borderRadius: "9999px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)" }}>
              <div className="pulse-dot pulse-dot-red" />
              <span style={{ fontSize: "0.67rem", fontWeight: 700, color: "var(--against)" }}>{stats?.liveDebates} LIVE</span>
            </div>
          )}
          <div className="nav-chip" style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.28rem 0.65rem", borderRadius: "9999px", background: "rgba(79,70,229,0.07)", border: "1px solid rgba(79,70,229,0.2)" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.68rem", fontWeight: 900, color: "var(--blue)" }}>Lv.{lvlInfo.current.level}</span>
            {!isMobile && <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--subtle)" }}>{lvlInfo.current.title}</span>}
          </div>
          {!isMobile && <span style={{ color: "var(--muted)", fontSize: "0.82rem", fontWeight: 600 }}>{user?.username}</span>}
          {isPro && isCancelled ? (
            <div
              onClick={() => navigate("/pricing")}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.28rem 0.65rem", borderRadius: "9999px", background: ac.bg, border: `1px solid ${ac.border}` }}
            >
              <span style={{ fontSize: "0.7rem" }}>⏳</span>
              <span style={{ fontSize: "0.68rem", fontWeight: 800, color: ac.color, letterSpacing: "0.04em" }}>PRO (ending)</span>
            </div>
          ) : isPro ? (
            <div
              onClick={() => navigate("/pricing")}
              style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.28rem 0.7rem", borderRadius: "9999px", background: isGlacier ? "linear-gradient(135deg,rgba(2,132,199,0.18),rgba(14,165,233,0.1))" : "linear-gradient(135deg,rgba(245,158,11,0.18),rgba(251,191,36,0.1))", border: `1px solid ${ac.border.replace("0.4","0.5")}`, boxShadow: `0 0 10px ${ac.shadow}` }}
            >
              <span style={{ fontSize: "0.72rem" }}>👑</span>
              <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.06em", backgroundImage: ac.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>PRO</span>
            </div>
          ) : (
            <button onClick={() => navigate("/pricing")} className="btn-primary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem", fontWeight: 800 }}>
              ⚡ Upgrade
            </button>
          )}
          {/* Theme picker */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowThemePicker(p => !p)}
              className="btn-ghost"
              title="Change theme"
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.88rem", lineHeight: 1, display: "flex", alignItems: "center", gap: "0.25rem" }}
            >
              <span>{themeMeta.icon}</span>
              {!isMobile && <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--muted)", letterSpacing: "0.04em" }}>{themeMeta.label}</span>}
            </button>
            {showThemePicker && (
              <>
                {/* Backdrop to close */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 99 }}
                  onClick={() => setShowThemePicker(false)}
                />
                <div style={{
                  position: "absolute", top: "calc(100% + 0.5rem)", right: 0, zIndex: 200,
                  /* Always solid — never transparent regardless of theme */
                  background: "rgba(255,255,255,0.97)",
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: "0.875rem", padding: "0.4rem",
                  boxShadow: "0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
                  display: "flex", flexDirection: "column", gap: "0.2rem", minWidth: 180,
                }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", padding: "0.2rem 0.5rem 0.35rem" }}>
                    Theme
                  </div>
                  {THEMES.map(t => {
                    const active      = theme === t.id;
                    const levelGated  = t.id === "glacier" && lvlInfo.current.level < 5;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          if (levelGated) { setShowThemePicker(false); return; }
                          setTheme(t.id); setShowThemePicker(false);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.55rem",
                          padding: "0.45rem 0.6rem", borderRadius: "0.6rem",
                          border: "none", cursor: levelGated ? "default" : "pointer", textAlign: "left", width: "100%",
                          background: active ? "rgba(2,132,199,0.08)" : "transparent",
                          opacity: levelGated ? 0.65 : 1,
                          transition: "background 0.15s",
                          fontFamily: "inherit",
                          color: "#1e293b",
                        }}
                        onMouseEnter={e => { if (!active && !levelGated) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)"; }}
                        onMouseLeave={e => { if (!active && !levelGated) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                      >
                        <span style={{ fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}>{t.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "0.78rem", fontWeight: active ? 800 : 600, color: active ? "#0284c7" : "#1e293b", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            {t.label}
                            {levelGated && (
                              <span style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.06em", padding: "0.1rem 0.35rem", borderRadius: "9999px", background: "rgba(14,165,233,0.12)", color: "#0284c7" }}>
                                Lv.5
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.62rem", color: "#64748b", marginTop: "0.05rem" }}>{t.desc}</div>
                        </div>
                        {active
                          ? <span style={{ fontSize: "0.7rem", color: "#0284c7", flexShrink: 0 }}>✓</span>
                          : levelGated
                            ? <span style={{ fontSize: "0.65rem", color: "#94a3b8", flexShrink: 0 }}>🔒</span>
                            : null
                        }
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {isDev && (
            <>
              <button
                onClick={() => navigate("/room/PREVIEW/result/preview")}
                className="btn-ghost"
                title="Preview result page"
                style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem" }}
              >
                🧪
              </button>
              <button
                onClick={() => navigate("/room/PREVIEW/debate/preview")}
                className="btn-ghost"
                title="Preview debate arena (alternate mode)"
                style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem" }}
              >
                🎙
              </button>
              <button
                onClick={() => navigate("/room/PREVIEW/debate/preview-buzzer")}
                className="btn-ghost"
                title="Preview debate arena (buzzer mode)"
                style={{ padding: "0.35rem 0.6rem", fontSize: "0.75rem" }}
              >
                🔔
              </button>
            </>
          )}
          <button onClick={handleLogout} disabled={isLoading} className="btn-danger" style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}>
            {isLoading ? "…" : "Logout"}
          </button>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main style={{
        position: "relative", zIndex: 1, flex: 1,
        display: "flex", flexDirection: "column",
        padding: isMobile ? "1.25rem 1rem 2rem" : "1.5rem 2rem",
      }}>
        {isMobile && <div style={{ marginBottom: "1.25rem" }}>{PlayerCard}</div>}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: "1.5rem", alignItems: "start" }}>

          {/* ── LEFT ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Hero */}
            <div className="fade-up">
              {isPro ? (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.875rem", padding: "0.25rem 0.75rem", borderRadius: "9999px", background: isGlacier ? "linear-gradient(135deg,rgba(2,132,199,0.15),rgba(14,165,233,0.08))" : "linear-gradient(135deg,rgba(245,158,11,0.15),rgba(251,191,36,0.08))", border: `1px solid ${ac.border}` }}>
                  <span style={{ fontSize: "0.72rem" }}>👑</span>
                  <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", backgroundImage: ac.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Pro — Live Debate Platform</span>
                </div>
              ) : (
                <div className="badge badge-cyan" style={{ marginBottom: "0.875rem", fontSize: "0.68rem" }}>⚡ Live Debate Platform</div>
              )}
              <h1 style={{
                fontSize: isMobile ? "2.25rem" : "clamp(2.25rem,5vw,3.75rem)",
                fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.03em",
                margin: "0 0 0.75rem", color: "var(--text)",
              }}>
                {isGlacier ? (
                  <span style={{ backgroundImage: "linear-gradient(135deg,#0369a1,#0284c7,#38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                    Argue smarter.
                  </span>
                ) : isPro ? (
                  <span style={{ backgroundImage: ac.grad135, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                    Argue smarter.
                  </span>
                ) : (
                  <>Argue smarter.</>
                )}<br />
                <span style={{ backgroundImage: isGlacier
                  ? "linear-gradient(135deg,#0369a1,#0284c7,#38bdf8,#bae6fd)"
                  : "linear-gradient(135deg,#22d3ee,#4f46e5,#7c3aed)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  Win the room.
                </span>
              </h1>
              <p style={{ color: "var(--subtle)", fontSize: isMobile ? "0.9rem" : "1rem", lineHeight: 1.65, maxWidth: 480, margin: 0 }}>
                Real-time structured debates. AI judging. Live transcription.<br />Compete against others or sharpen your rhetoric.
              </p>
            </div>

            {/* CTAs */}
            <div className="fade-up" style={{ display: "flex", gap: "0.875rem", flexDirection: isMobile ? "column" : "row", animationDelay: "0.08s" }}>
              <button onClick={() => navigate("/create-room")} className="btn-primary" style={{ fontSize: "1rem", padding: "0.875rem 2rem", fontWeight: 800 }}>
                ⚔️ Create Room
              </button>
              <button onClick={() => navigate("/join-room")} className="btn-for" style={{ fontSize: "1rem", padding: "0.875rem 2rem", fontWeight: 800 }}>
                🎯 Join Room
              </button>
              {!isPro && (
                <div
                  className="fade-up"
                  onClick={() => navigate("/pricing")}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    padding: "0.75rem 1.25rem", borderRadius: "0.875rem", cursor: "pointer",
                    background: isGlacier ? "linear-gradient(135deg,rgba(2,132,199,0.1),rgba(14,165,233,0.06))" : "linear-gradient(135deg,rgba(245,158,11,0.1),rgba(251,191,36,0.06))",
                    border: `1.5px solid ${ac.border.replace("0.4","0.35")}`, transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = isGlacier ? "rgba(2,132,199,0.7)" : "rgba(245,158,11,0.7)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = isGlacier ? "0 4px 16px rgba(2,132,199,0.12)" : "0 4px 16px rgba(245,158,11,0.12)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = isGlacier ? "rgba(2,132,199,0.35)" : "rgba(245,158,11,0.35)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  }}
                >
                  <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>⚡</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 800, backgroundImage: ac.grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: "0.1rem" }}>
                      Argumint Pro
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--muted)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Judges · Spectators · Buzzer · Voting — ₹50/mo
                    </div>
                  </div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: ac.dark, flexShrink: 0 }}>Upgrade →</span>
                </div>
              )}
            </div>

            {/* Social proof */}
            <div className="fade-up" style={{ animationDelay: "0.14s" }}>
              {SocialStrip}
            </div>

            {/* Feature cards — desktop only */}
            {!isMobile && (
              <div className="fade-up" style={{ display: "flex", gap: "0.75rem", animationDelay: "0.2s" }}>
                <FeatureCard icon="🤖" title="AI Judging" desc="GPT-4 scores every argument on rhetoric, clarity and evidence in real time." />
                <FeatureCard icon="🎤" title="Live Transcription" desc="Whisper-powered voice-to-text so you can speak your arguments, hands-free." />
                <FeatureCard icon="🏆" title="Ranked Play" desc="Climb the leaderboard, earn XP and unlock titles with every debate you win." />
              </div>
            )}

            {isMobile && <div style={{ marginTop: "0.25rem" }}>{LeaderboardPanel}</div>}
          </div>

          {/* ── RIGHT (desktop) ── */}
          {!isMobile && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {PlayerCard}
              {LeaderboardPanel}
            </div>
          )}
        </div>
      </main>

      {/* Pro welcome modal — shown once after first upgrade */}
      {showProWelcome && userId && (
        <ProWelcomeModal
          userId={userId}
          onClose={() => setShowProWelcome(false)}
        />
      )}
    </div>
  );
}
