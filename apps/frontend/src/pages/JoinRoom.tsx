import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { NavLogo } from "../components/NavLogo";
import { roomApi } from "../services/api";

export function JoinRoom() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setRoom, error, setError } = useRoom();
  const [isLoading, setIsLoading] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) { setError("Room code is required"); return; }
    try {
      setIsLoading(true);
      setError(null);
      const code = roomCode.toUpperCase().trim();
      const room = await roomApi.joinRoom({ code });
      setRoom(room);
      navigate(`/room/${room.code}/lobby`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 500, height: 300, background: "radial-gradient(ellipse, rgba(16,185,129,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
      <nav className="game-nav">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button onClick={() => navigate("/")} className="btn-ghost" style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem" }}>← Back</button>
          <NavLogo onClick={() => navigate("/")} />
        </div>
        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{user?.username}</span>
      </nav>

      <main style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
        <div className="fade-up w-full" style={{ maxWidth: 420 }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎯</div>
            <h1 style={{ fontSize: "2rem", fontWeight: 900, margin: "0 0 0.4rem", color: "var(--text)" }}>Join a Debate</h1>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>Enter the 6-character room code to jump in</p>
          </div>

          <div className="glass" style={{ padding: "2.25rem" }}>
            {error && (
              <div style={{ padding: "0.75rem 1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "0.625rem", color: "#f43f5e", fontSize: "0.875rem", marginBottom: "1.5rem", fontWeight: 500 }}>{error}</div>
            )}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <label className="label" style={{ textAlign: "center", display: "block" }}>Room Code</label>
                <input
                  type="text"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="input-dark"
                  style={{ textAlign: "center", fontSize: "2rem", fontWeight: 800, letterSpacing: "0.3em", fontFamily: "'JetBrains Mono', monospace", padding: "1rem" }}
                />
              </div>

              {/* char indicators */}
              <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ width: 32, height: 4, borderRadius: 9999, background: i < roomCode.length ? "var(--for)" : "var(--border2)", transition: "background 0.2s", boxShadow: i < roomCode.length ? "0 0 8px rgba(16,185,129,0.5)" : "none" }} />
                ))}
              </div>

              <button type="submit" className="btn-for" disabled={isLoading || roomCode.length !== 6} style={{ width: "100%", padding: "0.9rem", fontSize: "1rem" }}>
                {isLoading ? "Joining…" : "Join Room →"}
              </button>

              <button type="button" onClick={() => navigate("/")} className="btn-ghost" style={{ width: "100%", padding: "0.75rem" }}>
                ← Back to Home
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
