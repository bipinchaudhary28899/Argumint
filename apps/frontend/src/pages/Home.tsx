import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getLevelInfo } from "@argumint/shared";
import { useIsMobile } from "../hooks/useIsMobile";
import { NavLogo } from "../components/NavLogo";
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
      background: "rgba(255,255,255,0.72)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1px solid rgba(196,181,253,0.35)",
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

// ─── Main ────────────────────────────────────────────────────────────────────

const TOTAL_BASE = 2847;
const MOCK_ONLINE   = 47;
const MOCK_DEBATER  = "lex_argues";
const MOCK_ARGUMENT = "\"Sentience is binary — there is no partial consciousness.\"";

export function Home() {
  const navigate  = useNavigate();
  const { user, logout, isLoading } = useAuth();
  const isMobile  = useIsMobile();

  const [stats,       setStats]       = useState<{ activeRooms: number; liveDebates: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const xp        = (user as any)?.xp ?? 0;
  const lvlInfo   = getLevelInfo(xp);
  const userStats = (user as any)?.stats ?? { debatesWon: 0, debatesLost: 0, totalDebates: 0 };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [s, lb] = await Promise.all([platformApi.getStats(), platformApi.getLeaderboard()]);
      if (!alive) return;
      setStats(s);
      setLeaderboard(lb);
    };
    void load();
    const interval = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  const handleLogout = async () => { try { await logout(); navigate("/login"); } catch {} };

  // ─── Player card ─────────────────────────────────────────────────────────
  const PlayerCard = (
    <div className="glass glass-interactive fade-up" style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.3rem", fontWeight: 900, color: "#fff",
          boxShadow: "0 4px 16px rgba(79,70,229,0.4)",
        }}>
          {user?.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.username}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.15rem" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 900, padding: "0.1rem 0.45rem", borderRadius: "9999px", background: "rgba(79,70,229,0.1)", border: "1px solid rgba(79,70,229,0.25)", color: "var(--blue)" }}>
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
        <div style={{ height: 7, borderRadius: "9999px", background: "var(--border2)", overflow: "hidden" }}>
          <div
            className="xp-bar-fill"
            style={{ height: "100%", borderRadius: "9999px", width: `${lvlInfo.progressPct}%`, transition: "width 1.1s cubic-bezier(.4,0,.2,1)" }}
          />
        </div>
        <div style={{ fontSize: "0.58rem", color: "var(--muted)", marginTop: "0.2rem", textAlign: "right" }}>{xp} total XP</div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", padding: "0.75rem 0.5rem", borderRadius: "0.625rem", background: "rgba(79,70,229,0.03)", border: "1px solid var(--border)" }}>
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
          {leaderboard.map((entry, i) => {
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
                  ? "linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.06))"
                  : isMe ? "rgba(79,70,229,0.07)" : "rgba(255,255,255,0.55)",
                border: `1px solid ${isFirst ? "rgba(245,158,11,0.38)" : isMe ? "rgba(79,70,229,0.28)" : "var(--border)"}`,
                boxShadow: isFirst ? "0 2px 12px rgba(245,158,11,0.14)" : "none",
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
                <span style={{ flex: 1, fontWeight: isFirst || isMe ? 800 : 600, fontSize: "0.82rem", color: isFirst ? "#92400e" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {isFirst && "👑 "}{entry.username}{isMe && !isFirst ? " 👤" : ""}
                </span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.05rem", flexShrink: 0 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.72rem", fontWeight: 800, color: isFirst ? "#d97706" : "var(--blue)" }}>
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
  const totalDebates = TOTAL_BASE + (stats?.liveDebates ?? 0);
  const SocialStrip = (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
      <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <span style={{ fontSize: "0.76rem", fontWeight: 900, color: "var(--blue)", fontFamily: "'JetBrains Mono', monospace" }}>{totalDebates.toLocaleString()}</span>
        <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>debates hosted</span>
      </div>
      <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <div className="pulse-dot pulse-dot-green" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: "0.76rem", fontWeight: 900, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{MOCK_ONLINE + (stats?.activeRooms ?? 0)}</span>
        <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>online now</span>
      </div>
      {(stats?.liveDebates ?? 0) > 0 && (
        <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <div className="pulse-dot pulse-dot-red" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: "0.76rem", fontWeight: 900, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{stats?.liveDebates}</span>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>live now</span>
        </div>
      )}
      <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <span style={{ fontSize: "0.74rem" }}>🔥</span>
        <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>Trending:</span>
        <span style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--text)" }}>AI vs Humans</span>
      </div>
      <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <span style={{ fontSize: "0.74rem" }}>⭐</span>
        <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>Featured:</span>
        <span style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--blue)" }}>{MOCK_DEBATER}</span>
      </div>
      {!isMobile && (
        <div className="glass" style={{ padding: "0.38rem 0.72rem", borderRadius: "9999px", display: "flex", alignItems: "center", gap: "0.35rem", maxWidth: 280 }}>
          <span style={{ fontSize: "0.74rem" }}>💬</span>
          <span style={{ fontSize: "0.68rem", color: "var(--subtle)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>
            {MOCK_ARGUMENT}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", position: "relative" }}>
      {/* Clean gradient bg — no rings, no noise */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 70% 60% at 15% 0%, rgba(124,58,237,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 90% 100%, rgba(14,165,233,0.06) 0%, transparent 55%)",
      }} />
      {/* Soft grid */}
      <div className="bg-grid" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      {/* ── NAV ── */}
      <nav className="game-nav" style={{ position: "relative" }}>
        <NavLogo />
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
          <button onClick={handleLogout} disabled={isLoading} className="btn-danger" style={{ padding: "0.35rem 0.7rem", fontSize: "0.78rem" }}>
            {isLoading ? "…" : "Logout"}
          </button>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main style={{
        position: "relative", zIndex: 1, flex: 1,
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: isMobile ? "1.25rem 1rem 2rem" : "1.5rem 2rem",
      }}>
        {isMobile && <div style={{ marginBottom: "1.25rem" }}>{PlayerCard}</div>}

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: "1.5rem", alignItems: "start" }}>

          {/* ── LEFT ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Hero */}
            <div className="fade-up">
              <div className="badge badge-cyan" style={{ marginBottom: "0.875rem", fontSize: "0.68rem" }}>⚡ Live Debate Platform</div>
              <h1 style={{
                fontSize: isMobile ? "2.25rem" : "clamp(2.25rem,5vw,3.75rem)",
                fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.03em",
                margin: "0 0 0.75rem", color: "var(--text)",
              }}>
                Argue smarter.<br />
                <span style={{ background: "linear-gradient(135deg,#22d3ee,#4f46e5,#7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
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
    </div>
  );
}
