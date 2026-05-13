import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { roomApi } from "../services/api";
import type { Room } from "@argumint/shared";

type JoinRole = "participant" | "judge" | "spectator";

interface RoleOption {
  role: JoinRole;
  icon: string;
  label: string;
  desc: string;
}

const ROLE_OPTIONS: RoleOption[] = [
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

/**
 * Returns capacity info for a role given the fetched room.
 *  - max   : the configured cap (-1 = unlimited, 0 = disabled)
 *  - used  : how many active participants currently hold this role
 *  - full  : true when no more slots available (disabled OR at capacity)
 *  - label : human-readable availability string ("3 / 5 slots" etc.)
 */
function getRoleCapacity(role: JoinRole, room: Room): {
  max: number;
  used: number;
  full: boolean;
  slotsLeft: number;
  label: string;
} {
  const active = room.participants.filter((p) => p.status !== "disconnected");

  if (role === "participant") {
    // Participants fill the overall maxParticipants pool
    const used  = active.filter((p) => p.role === "participant" || p.role === "moderator").length;
    const max   = room.maxParticipants ?? 10;
    const slotsLeft = Math.max(0, max - used);
    return { max, used, full: slotsLeft === 0, slotsLeft, label: `${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} left` };
  }

  if (role === "judge") {
    const max   = (room as any).maxJudges ?? 3;
    const used  = active.filter((p) => p.role === "judge").length;
    const slotsLeft = Math.max(0, max - used);
    const full  = max === 0 || slotsLeft === 0;
    const label = max === 0 ? "Disabled for this room" : slotsLeft === 0 ? "Full" : `${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} left`;
    return { max, used, full, slotsLeft, label };
  }

  if (role === "spectator") {
    const max   = (room as any).maxSpectators ?? 50;
    const used  = active.filter((p) => p.role === "spectator").length;
    const slotsLeft = Math.max(0, max - used);
    const full  = max === 0 || slotsLeft === 0;
    const label = max === 0 ? "Disabled for this room" : slotsLeft === 0 ? "Full" : `${slotsLeft} slot${slotsLeft !== 1 ? "s" : ""} left`;
    return { max, used, full, slotsLeft, label };
  }

  return { max: -1, used: 0, full: false, slotsLeft: 99, label: "Open" };
}

export function JoinRoom() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setRoom, error, setError } = useRoom();
  const [isLoading, setIsLoading]   = useState(false);
  const [roomCode, setRoomCode]     = useState("");
  const [step, setStep]             = useState<"code" | "role">("code");
  const [selectedRole, setSelectedRole] = useState<JoinRole>("participant");
  // Store the fetched room so step 2 can read capacity data
  const [fetchedRoom, setFetchedRoom]   = useState<Room | null>(null);

  // Suppress unused-variable lint for `user` — it's read by the auth context
  void user;

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) { setError("Room code is required"); return; }
    try {
      setIsLoading(true);
      setError(null);
      const code = roomCode.toUpperCase().trim();
      // Fetch room for existence check AND capacity data
      const room = await roomApi.getRoomByCode(code);
      setFetchedRoom(room as any);
      // Auto-fallback: if judge is disabled, default role to participant
      const judgeInfo = getRoleCapacity("judge", room as any);
      if (selectedRole === "judge" && judgeInfo.full) setSelectedRole("participant");
      const spectatorInfo = getRoleCapacity("spectator", room as any);
      if (selectedRole === "spectator" && spectatorInfo.full) setSelectedRole("participant");
      setStep("role");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Room not found");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleConfirm = async () => {
    // Guard: never allow joining a full/disabled role
    if (fetchedRoom) {
      const cap = getRoleCapacity(selectedRole, fetchedRoom);
      if (cap.full) {
        setError(`${ROLE_OPTIONS.find(r => r.role === selectedRole)?.label} slots are unavailable for this room`);
        return;
      }
    }
    try {
      setIsLoading(true);
      setError(null);
      const code = roomCode.toUpperCase().trim();
      // Pass the selected role to the HTTP join endpoint so the user lands in
      // the room with the correct role before the socket room:join fires.
      const room = await roomApi.joinRoom({ code, role: selectedRole } as any);
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
                    const cap     = fetchedRoom ? getRoleCapacity(role, fetchedRoom) : null;
                    const disabled = cap?.full ?? false;
                    const active   = selectedRole === role && !disabled;

                    return (
                      <button
                        key={role}
                        onClick={() => !disabled && setSelectedRole(role)}
                        disabled={disabled}
                        style={{
                          display: "flex", alignItems: "center", gap: "1rem",
                          padding: "1rem 1.25rem",
                          borderRadius: "0.75rem",
                          border: active
                            ? "2px solid var(--for)"
                            : disabled
                            ? "2px solid var(--border)"
                            : "2px solid var(--border)",
                          background: active
                            ? "rgba(16,185,129,0.08)"
                            : disabled
                            ? "rgba(0,0,0,0.04)"
                            : "rgba(255,255,255,0.03)",
                          cursor: disabled ? "not-allowed" : "pointer",
                          textAlign: "left",
                          width: "100%",
                          transition: "all 0.18s",
                          boxShadow: active ? "0 0 0 3px rgba(16,185,129,0.15)" : "none",
                          opacity: disabled ? 0.55 : 1,
                        }}
                      >
                        <span style={{ fontSize: "1.75rem", flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                            <span style={{ fontWeight: 800, fontSize: "0.95rem", color: active ? "var(--for)" : disabled ? "var(--muted)" : "var(--text)" }}>{label}</span>
                            {disabled && (
                              <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "0.1rem 0.45rem", borderRadius: 9999, background: "rgba(244,63,94,0.12)", color: "var(--against)", letterSpacing: "0.05em" }}>
                                {cap?.max === 0 ? "DISABLED" : "FULL"}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.4 }}>{desc}</div>
                          {/* Slot availability indicator */}
                          {cap && !disabled && role !== "participant" && (
                            <div style={{ marginTop: "0.3rem", fontSize: "0.7rem", color: cap.slotsLeft <= 1 ? "var(--gold)" : "var(--for)", fontWeight: 600 }}>
                              {cap.label}
                            </div>
                          )}
                          {cap && disabled && role !== "participant" && (
                            <div style={{ marginTop: "0.3rem", fontSize: "0.7rem", color: "var(--against)", fontWeight: 600 }}>
                              {cap.label}
                            </div>
                          )}
                        </div>
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                          border: active ? "5px solid var(--for)" : disabled ? "2px solid var(--border)" : "2px solid var(--border2)",
                          background: active ? "var(--for)" : "transparent",
                          transition: "all 0.18s",
                        }} />
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleRoleConfirm}
                  disabled={isLoading || (fetchedRoom ? getRoleCapacity(selectedRole, fetchedRoom).full : false)}
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
