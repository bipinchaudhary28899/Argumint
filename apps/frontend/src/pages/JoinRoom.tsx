import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { roomApi } from "../services/api";
import { AppShell } from "../components/AppShell";
import { Icon, type IconName } from "../components/Icon";
import type { Room } from "@argumint/shared";

type JoinRole = "participant" | "judge" | "spectator";

interface RoleOption {
  role: JoinRole;
  icon: IconName;
  label: string;
  desc: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: "participant",
    icon: "mic",
    label: "Participant",
    desc: "Debate live — your voice shapes the outcome",
  },
  {
    role: "judge",
    icon: "scale",
    label: "Judge",
    desc: "Listen, then score participants after the debate",
  },
  {
    role: "spectator",
    icon: "eye",
    label: "Spectator",
    desc: "Watch and listen — no scoring or speaking",
  },
];

const CODE_LENGTH = 6;

const HELP_STEPS = [
  "Enter the lobby and check your mic.",
  "Ready up. The host starts when everyone is set.",
  "You're assigned FOR or AGAINST at random.",
];

/** Uppercase, drop spaces/dashes/etc. and cap at 6 — codes are [A-Z0-9]{6}. */
function sanitizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

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

// ── Shared bits ──────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" style={{
      padding: "12px 14px", borderRadius: 14, fontSize: 14, fontWeight: 600,
      background: "var(--ds-against-bg)", border: "1px solid var(--ds-against-line)", color: "var(--ds-against-text)",
    }}>
      {message}
    </div>
  );
}

function PageHead({ icon, title, isMobile, children }: { icon: IconName; title: string; isMobile: boolean; children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, textAlign: "center", alignItems: "center" }}>
      <span style={{ width: 64, height: 64, borderRadius: 20, background: "var(--ds-accent-soft)", color: "var(--ds-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={30} />
      </span>
      <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 28 : 40, letterSpacing: "-0.02em", color: "var(--ds-text)" }}>{title}</h1>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: "var(--ds-muted)" }}>{children}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function JoinRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { setRoom, error, setError } = useRoom();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading]   = useState(false);
  // Home's "Join with a code" tile hands the code over in router state
  const [roomCode, setRoomCode]     = useState(() => {
    const passed = (location.state as { code?: unknown } | null)?.code;
    return typeof passed === "string" ? sanitizeCode(passed) : "";
  });
  const [step, setStep]             = useState<"code" | "role">("code");
  const [selectedRole, setSelectedRole] = useState<JoinRole>("participant");
  // Store the fetched room so step 2 can read capacity data
  const [fetchedRoom, setFetchedRoom]   = useState<Room | null>(null);
  const [codeFocused, setCodeFocused]   = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

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

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const code = sanitizeCode(text);
      if (code) setRoomCode(code);
    } catch {
      // Clipboard blocked/unsupported — fall through so the user can paste manually
    }
    codeInputRef.current?.focus();
  };

  const backBtn = (
    <button
      type="button"
      onClick={() => step === "role" ? setStep("code") : navigate("/")}
      aria-label={step === "role" ? "Back to room code" : "Back to home"}
      style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, padding: 0, border: 0, background: "none", cursor: "pointer", font: "600 14px Outfit, sans-serif", color: "var(--ds-muted)" }}
    >
      <Icon name="left" size={16} />{step === "role" ? "Back" : "Home"}
    </button>
  );

  const cardStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: isMobile ? "22px 18px" : 32, borderRadius: 28,
    display: "flex", flexDirection: "column", gap: 22,
  };
  const activeBox = codeFocused ? Math.min(roomCode.length, CODE_LENGTH - 1) : -1;
  const selectedLabel = ROLE_OPTIONS.find(r => r.role === selectedRole)?.label;

  return (
    <AppShell active="join">
      <div style={{
        // Centre in the viewport on desktop (shell main has 40px + 56px vertical padding)
        minHeight: isMobile ? undefined : "calc(100vh - 96px)", display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: isMobile ? "flex-start" : "center", gap: isMobile ? 24 : 32,
        paddingTop: isMobile ? 8 : 16,
      }}>
        <div style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
          {backBtn}

          {/* ── Step 1: Enter room code ── */}
          {step === "code" && (
            <>
              <PageHead icon="join" title="Join a room" isMobile={isMobile}>
                Enter the 6-character code from your host.
              </PageHead>

              <form onSubmit={handleCodeSubmit} aria-label="Join a room" className="ds-card" style={cardStyle}>
                {error && <ErrorBanner message={error} />}

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <label htmlFor="join-code" className="ds-label" style={{ letterSpacing: "0.12em", paddingBottom: 12 }}>
                    Room code
                  </label>
                  {/* One real input (handles typing, paste, backspace, arrows) laid over six display boxes */}
                  <div style={{ position: "relative" }}>
                    <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: `repeat(${CODE_LENGTH}, minmax(0, 1fr))`, gap: isMobile ? 8 : 12 }}>
                      {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                        const ch = roomCode[i] ?? "";
                        const isActive = i === activeBox;
                        return (
                          <div key={i} data-code-box="" style={{
                            height: isMobile ? 58 : 76, boxSizing: "border-box", borderRadius: 14,
                            border: `2px solid ${isActive ? "var(--ds-accent-line)" : ch ? "var(--ds-border2)" : "var(--ds-border)"}`,
                            boxShadow: isActive ? "0 0 0 4px var(--ds-accent-soft)" : "none",
                            background: "var(--ds-deep)", color: "var(--ds-text)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            font: `600 ${isMobile ? 24 : 32}px 'JetBrains Mono', monospace`,
                            transition: "border-color .15s, box-shadow .15s",
                          }}>
                            {ch}
                          </div>
                        );
                      })}
                    </div>
                    <input
                      ref={codeInputRef}
                      id="join-code"
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(sanitizeCode(e.target.value))}
                      onFocus={() => setCodeFocused(true)}
                      onBlur={() => setCodeFocused(false)}
                      aria-describedby="join-code-hint"
                      autoComplete="off"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="text"
                      style={{
                        position: "absolute", inset: 0, width: "100%", height: "100%", boxSizing: "border-box",
                        opacity: 0, border: 0, padding: 0, margin: 0, cursor: "text",
                        fontSize: 16, // ≥16px stops iOS zooming on focus
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 13, color: "var(--ds-muted)" }}>
                    <span id="join-code-hint">Letters and numbers, not case-sensitive</span>
                    <button type="button" onClick={handlePaste} className="ds-btn ds-btn-secondary"
                      style={{ minHeight: 44, height: 44, padding: "0 12px", borderRadius: 10, fontSize: 13, fontWeight: 600, gap: 6, flexShrink: 0 }}>
                      <Icon name="copy" size={15} />Paste
                    </button>
                  </div>
                </div>

                <button type="submit" className="ds-btn ds-btn-primary ds-btn-block"
                  disabled={isLoading || roomCode.length !== CODE_LENGTH}
                  style={{ height: 56, borderRadius: 16, fontSize: 16 }}>
                  {isLoading ? "Checking…" : <>Join room<Icon name="right" size={18} /></>}
                </button>

                <p style={{ margin: 0, textAlign: "center", fontSize: 14, color: "var(--ds-muted)" }}>
                  No code?{" "}
                  <button type="button" className="ds-link" onClick={() => navigate("/create-room")}>Host your own room</button>
                </p>
              </form>
            </>
          )}

          {/* ── Step 2: Choose role ── */}
          {step === "role" && (
            <>
              <PageHead icon="users" title="Choose your role" isMobile={isMobile}>
                Joining room <span className="ds-mono" style={{ color: "var(--ds-accent)", fontWeight: 600, letterSpacing: "0.08em" }}>{roomCode}</span>
              </PageHead>

              <div className="ds-card" style={cardStyle}>
                {error && <ErrorBanner message={error} />}

                <div role="radiogroup" aria-label="Role" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {ROLE_OPTIONS.map(({ role, icon, label, desc }) => {
                    const cap     = fetchedRoom ? getRoleCapacity(role, fetchedRoom) : null;
                    const disabled = cap?.full ?? false;
                    const active   = selectedRole === role && !disabled;

                    return (
                      <button
                        key={role}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => !disabled && setSelectedRole(role)}
                        disabled={disabled}
                        style={{
                          display: "flex", alignItems: "center", gap: 16,
                          padding: isMobile ? 16 : "18px 20px", borderRadius: 18, width: "100%",
                          border: `2px solid ${active ? "var(--ds-accent-line)" : "var(--ds-border)"}`,
                          background: active ? "var(--ds-accent-soft)" : "var(--ds-raised)",
                          color: "var(--ds-text)", fontFamily: "inherit", textAlign: "left",
                          cursor: disabled ? "not-allowed" : "pointer",
                          opacity: disabled ? 0.55 : 1,
                          transition: "border-color .15s, background .15s",
                        }}
                      >
                        <span style={{
                          width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: active ? "var(--ds-panel)" : "var(--ds-deep)", color: active ? "var(--ds-accent)" : "var(--ds-muted)",
                        }}>
                          <Icon name={icon} size={22} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 800, fontSize: 16, color: disabled ? "var(--ds-muted)" : "var(--ds-text)" }}>{label}</span>
                            {disabled && (
                              <span className="ds-chip ds-chip-against" style={{ height: 22, fontSize: 10, letterSpacing: "0.08em" }}>
                                {cap?.max === 0 ? "DISABLED" : "FULL"}
                              </span>
                            )}
                          </span>
                          <span style={{ fontSize: 14, lineHeight: 1.45, color: "var(--ds-text3)" }}>{desc}</span>
                          {/* Slot availability indicator */}
                          {cap && role !== "participant" && (
                            <span style={{
                              fontSize: 12, fontWeight: 600,
                              color: disabled ? "var(--ds-against-text)" : cap.slotsLeft <= 1 ? "var(--ds-gold-text)" : "var(--ds-for-text)",
                            }}>
                              {cap.label}
                            </span>
                          )}
                        </span>
                        <span aria-hidden="true" style={{
                          width: 22, height: 22, boxSizing: "border-box", borderRadius: "50%", flexShrink: 0,
                          border: active ? "7px solid var(--ds-accent-mid)" : "2px solid var(--ds-border2)",
                          background: active ? "var(--ds-panel)" : "transparent",
                        }} />
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleRoleConfirm}
                  disabled={isLoading || (fetchedRoom ? getRoleCapacity(selectedRole, fetchedRoom).full : false)}
                  className="ds-btn ds-btn-primary ds-btn-block"
                  style={{ height: 56, borderRadius: 16, fontSize: 16 }}
                >
                  {isLoading ? "Joining…" : <>Join as {selectedLabel}<Icon name="right" size={18} /></>}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── What happens next ── */}
        <ol style={{
          width: "100%", maxWidth: 760, margin: 0, padding: 0, listStyle: "none",
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 14,
        }}>
          {HELP_STEPS.map((text, i) => (
            <li key={i} style={{ padding: 18, borderRadius: 18, background: "var(--ds-panel)", border: "1px solid var(--ds-border)", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span className="ds-mono" style={{ fontWeight: 600, color: "var(--ds-accent)" }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ds-text3)" }}>{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </AppShell>
  );
}
