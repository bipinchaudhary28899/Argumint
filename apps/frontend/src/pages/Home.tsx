import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getLevelInfo } from "@argumint/shared";

export function Home() {
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuth();

  const handleLogout = async () => {
    try { await logout(); navigate("/login"); } catch {}
  };

  const xp       = (user as any)?.xp ?? 0;
  const lvlInfo  = getLevelInfo(xp);

  return (
    <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* ambient orbs */}
      <div style={{ position: "fixed", top: "10%",  left: "15%",  width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(79,142,247,0.07) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "fixed", bottom: "10%", right: "15%", width: 350, height: 350, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <nav className="game-nav">
        <span className="nav-logo">ARGUMINT</span>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Level + XP chip */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "0.35rem",
              padding: "0.25rem 0.6rem", borderRadius: "9999px",
              background: "rgba(79,142,247,0.1)", border: "1px solid rgba(79,142,247,0.25)",
            }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 900, color: "var(--cyan)" }}>
                Lv.{lvlInfo.current.level}
              </span>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--subtle)" }}>
                {lvlInfo.current.title}
              </span>
            </div>
            {/* XP bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 72 }}>
              <div style={{ height: 5, borderRadius: "9999px", background: "var(--border2)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: "9999px",
                  background: "linear-gradient(90deg, #4f8ef7, #22d3ee)",
                  width: `${lvlInfo.progressPct}%`,
                  transition: "width 0.8s cubic-bezier(.4,0,.2,1)",
                }} />
              </div>
              <span style={{ fontSize: "0.55rem", color: "var(--muted)", fontFamily: "'JetBrains Mono', monospace", textAlign: "right" }}>
                {lvlInfo.progressXP}{lvlInfo.next ? `/${lvlInfo.neededXP}` : " MAX"}
              </span>
            </div>
          </div>

          <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{user?.username}</span>
          <button onClick={handleLogout} disabled={isLoading} className="btn-danger" style={{ padding: "0.4rem 1rem", fontSize: "0.8rem" }}>
            {isLoading ? "…" : "Logout"}
          </button>
        </div>
      </nav>

      <main style={{ position: "relative", zIndex: 1, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem 1rem" }}>
        {/* Hero */}
        <div className="fade-up" style={{ textAlign: "center", maxWidth: 640, marginBottom: "2.5rem" }}>
          <div className="badge badge-cyan" style={{ marginBottom: "1.25rem", fontSize: "0.7rem" }}>
            ⚡ Live Debate Platform
          </div>
          <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.03em", margin: "0 0 1.25rem", color: "var(--text)" }}>
            Argue smarter.<br />
            <span style={{ background: "linear-gradient(135deg, #22d3ee, #4f8ef7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Win the room.
            </span>
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "1.1rem", lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
            Real-time structured debates. AI judging. Live transcription. Compete against others or sharpen your rhetoric.
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => navigate("/create-room")} className="btn-primary" style={{ fontSize: "1.1rem", padding: "0.875rem 2.5rem" }}>
            ⚔️ Create Room
          </button>
          <button onClick={() => navigate("/join-room")} className="btn-for" style={{ fontSize: "1.1rem", padding: "0.875rem 2.5rem" }}>
            🎯 Join Room
          </button>
        </div>
      </main>
    </div>
  );
}
