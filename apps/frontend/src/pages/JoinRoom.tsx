import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { roomApi } from "../services/api";

type JoinRole = "participant" | "judge" | "spectator";

const ROLE_OPTIONS: { role: JoinRole; icon: string; label: string; desc: string }[] = [
  {
    role: "participant",
    icon: "🎤",
    label: "Participant",
    desc: "Debate live — your voice shapes the outcome",
  },
  {
    role: "judge",
    icon: "⚖️",
    label: "Judge",
    desc: "Listen, then score participants after the debate",
  },
  {
    role: "spectator",
    icon: "👁️",
    label: "Spectator",
    desc: "Watch and listen — no scoring or speaking",
  },
];

export function JoinRoom() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setRoom, error, setError } = useRoom();
  const [isLoading, setIsLoading] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [step, setStep] = useState<"code" | "role">("code");
  const [selectedRole, setSelectedRole] = useState<JoinRole>("participant");

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) { setError("Room code is required"); return; }
    try {
      setIsLoading(true);
      setError(null);
      const code = roomCode.toUpperCase().trim();
      // Validate the room exists
      await roomApi.getRoomByCode(code);
      setStep("role");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Room not found");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleConfirm = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const code = roomCode.toUpperCase().trim();
      const room = await roomApi.joinRoom({ code });
      setRoom(room);
      navigate(`/room/${room.code}/lobby?role=${selectedRole}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
      setStep("code");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 500, height: 300, background: "radial-gradient(ellipse, rgba(16,185,129,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

      <main style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
        <div className="fade-up w-full" style={{ maxWidth: 460 }}>
          <button
            onClick={() => step === "role" ? setStep("code") : navigate("/")}
            className="btn-ghost"
            style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem", marginBottom: "1rem" }}
          >
            ← {step === "role" ? "Back" : "Home"}
          </button>

          {/* ── Step 1: Enter room code ── */}
          {step === "code" && (
            <>
              <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎯</div>
                <h1 style={{ fontSize: "2rem", fontWeight: 900, margin: "0 0 0.4rem", color: "var(--text)" }}>Join a Debate</h1>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>Enter the 6-character room code to jump in</p>
              </div>

              <div className="glass" style={{ padding: "2.25rem" }}>
                {error && (
                  <div style={{ padding: "0.75rem 1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "0.625rem", color: "#f43f5e", fontSize: "0.875rem", marginBottom: "1.5rem", fontWeight: 500 }}>{error}</div>
                )}
                <form onSubmit={handleCodeSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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
                    {isLoading ? "Checking…" : "Continue →"}
                  </button>
                </form>
              </div>
            </>
          )}

          {/* ── Step 2: Choose role ── */}
          {step === "role" && (
            <>
              <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎭</div>
                <h1 style={{ fontSize: "1.9rem", fontWeight: 900, margin: "0 0 0.4rem", color: "var(--text)" }}>Choose Your Role</h1>
                <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>
                  Joining room <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--cyan)", fontWeight: 800 }}>{roomCode}</span>
                </p>
              </div>

              <div className="glass" style={{ padding: "1.75rem" }}>
                {error && (
                  <div style={{ padding: "0.75rem 1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "0.625rem", color: "#f43f5e", fontSize: "0.875rem", marginBottom: "1.5rem", fontWeight: 500 }}>{error}</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                  {ROLE_OPTIONS.map(({ role, icon, label, desc }) => {
                    const active = selectedRole === role;
                    return (
                      <button
                        key={role}
                        onClick={() => setSelectedRole(role)}
                        style={{
                          display: "flex", alignItems: "center", gap: "1rem",
                          padding: "1rem 1.25rem",
                          borderRadius: "0.75rem",
                          border: active
                            ? "2px solid var(--for)"
                            : "2px solid var(--border)",
                          background: active
                            ? "rgba(16,185,129,0.08)"
                            : "rgba(255,255,255,0.03)",
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                          transition: "all 0.18s",
                          boxShadow: active ? "0 0 0 3px rgba(16,185,129,0.15)" : "none",
                        }}
                      >
                        <span style={{ fontSize: "1.75rem", flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: "0.95rem", color: active ? "var(--for)" : "var(--text)", marginBottom: "0.2rem" }}>{label}</div>
                          <div style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.4 }}>{desc}</div>
                        </div>
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                          border: active ? "5px solid var(--for)" : "2px solid var(--border2)",
                          background: active ? "var(--for)" : "transparent",
                          transition: "all 0.18s",
                        }} />
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleRoleConfirm}
                  disabled={isLoading}
                  className="btn-for"
                  style={{ width: "100%", padding: "0.9rem", fontSize: "1rem" }}
                >
                  {isLoading ? "Joining…" : `Join as ${ROLE_OPTIONS.find(r => r.role === selectedRole)?.label} →`}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
