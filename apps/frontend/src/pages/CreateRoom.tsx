import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { roomApi } from "../services/api";
import type { CreateRoomInput } from "@argumint/shared";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(sec: number): string {
  if (sec === 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// ── Stepper ───────────────────────────────────────────────────────────────────

interface StepperProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: (v: number) => string;
  onChange: (v: number) => void;
}

function Stepper({ label, hint, value, min, max, step, display, onChange }: StepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;
  const btnBase: React.CSSProperties = {
    width: 30, height: 30, borderRadius: "0.5rem",
    border: "1.5px solid var(--border)", background: "var(--surface2)",
    color: "var(--blue)", fontWeight: 900, fontSize: "1.05rem",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all 0.15s", cursor: "pointer",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--blue)" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "#fff", border: "1.5px solid var(--border)", borderRadius: "0.75rem", padding: "0.3rem 0.5rem" }}>
        <button type="button" onClick={() => onChange(Math.max(min, value - step))} disabled={atMin}
          style={{ ...btnBase, opacity: atMin ? 0.35 : 1, cursor: atMin ? "not-allowed" : "pointer" }}>
          −
        </button>
        <span style={{ flex: 1, textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: "0.88rem", color: "var(--text)" }}>
          {display ? display(value) : value}
        </span>
        <button type="button" onClick={() => onChange(Math.min(max, value + step))} disabled={atMax}
          style={{ ...btnBase, opacity: atMax ? 0.35 : 1, cursor: atMax ? "not-allowed" : "pointer" }}>
          +
        </button>
      </div>
      <span style={{ fontSize: "0.6rem", color: "var(--muted)", fontWeight: 600 }}>{hint}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function CreateRoom() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { setRoom, setError } = useRoom();
  const isMobile  = useIsMobile();
  const [isLoading,   setIsLoading]   = useState(false);
  const [localError,  setLocalError]  = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateRoomInput>({
    topic: "", description: "", debateMode: "alternate",
    maxParticipants: 10, votingEnabled: false, votingTopics: [],
    votingDuration: 30, prepDuration: 30, turnDuration: 60,
    totalRounds: 2, transcriptionMode: "whisper" as const,
  });

  const set = <K extends keyof CreateRoomInput>(key: K, val: CreateRoomInput[K]) =>
    setFormData(prev => ({ ...prev, [key]: val }));

  const handleAddTopic = () => {
    if ((formData.votingTopics || []).length < 4)
      set("votingTopics", [...(formData.votingTopics || []), ""]);
  };
  const handleRemoveTopic = (i: number) =>
    set("votingTopics", (formData.votingTopics || []).filter((_, idx) => idx !== i));
  const handleTopicChange = (i: number, v: string) =>
    set("votingTopics", (formData.votingTopics || []).map((t, idx) => idx === i ? v : t));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.topic.trim() && !formData.votingEnabled) { setLocalError("Debate topic is required"); return; }
    if (formData.votingEnabled && !(formData.votingTopics || []).length) { setLocalError("Add at least one voting topic"); return; }
    try {
      setIsLoading(true); setLocalError(null); setError(null);
      const newRoom = await roomApi.createRoom(formData);
      setRoom(newRoom);
      navigate(`/room/${newRoom.code}/lobby`);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setIsLoading(false);
    }
  };

  const totalTurns   = formData.totalRounds * 2;
  const totalTimeSec = totalTurns * formData.turnDuration + formData.prepDuration;

  return (
    <div className="bg-grid" style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)" }}>


      {/* ── MAIN ── */}
      <main style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", justifyContent: "center", padding: isMobile ? "1rem 0.75rem 2rem" : "1.5rem 1.25rem 2.5rem" }}>
        <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: "0.875rem" }}>

          {/* ── PAGE HEADER ── */}
          <div className="fade-up" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button type="button" onClick={() => navigate("/")} className="btn-ghost"
                style={{ padding: "0.4rem 0.7rem", fontSize: "0.82rem" }}>←</button>
              <div>
                <h1 style={{ fontSize: isMobile ? "1.2rem" : "1.4rem", fontWeight: 900, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}>
                  ⚔️ Host a Debate
                </h1>
                <p style={{ margin: "0.1rem 0 0", fontSize: "0.72rem", color: localError ? "var(--against)" : "var(--muted)", fontWeight: localError ? 700 : 400 }}>
                  {localError ? `⚠ ${localError}` : "Set up your arena and invite players"}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" onClick={() => navigate("/")} className="btn-ghost"
                style={{ padding: "0.45rem 1rem", fontSize: "0.82rem" }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isLoading}
                style={{ padding: "0.45rem 1.25rem", fontSize: "0.82rem" }}>
                {isLoading ? "Creating…" : "Create →"}
              </button>
            </div>
          </div>

          {/* ── MOTION CARD ── */}
          <div className="glass fade-up" style={{ padding: isMobile ? "1rem" : "1.25rem 1.5rem" }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "0.75rem" }}>
              📋 Motion
            </div>

            {/* Voting toggle */}
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.5rem 0.875rem",
                background: formData.votingEnabled ? "rgba(14,165,233,0.07)" : "rgba(245,243,255,0.6)",
                border: `1px solid ${formData.votingEnabled ? "rgba(14,165,233,0.3)" : "var(--border)"}`,
                borderRadius: "0.625rem", cursor: "pointer", marginBottom: "0.75rem",
                transition: "all 0.2s",
              }}
              onClick={() => set("votingEnabled", !formData.votingEnabled)}
            >
              <div>
                <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--text)" }}>Let players vote on the topic</span>
                {!isMobile && <span style={{ color: "var(--muted)", fontSize: "0.72rem", marginLeft: "0.5rem" }}>— players choose in the lobby</span>}
              </div>
              <div style={{ width: 38, height: 20, borderRadius: 9999, background: formData.votingEnabled ? "var(--cyan)" : "var(--border2)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: formData.votingEnabled ? 19 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
              </div>
            </div>

            {!formData.votingEnabled ? (
              <div>
                <input
                  name="topic" type="text" className="input-dark"
                  value={formData.topic}
                  onChange={e => set("topic", e.target.value)}
                  placeholder="e.g. Social media does more harm than good"
                  maxLength={500}
                />
                <div style={{ fontSize: "0.62rem", color: "var(--muted)", marginTop: "0.3rem", textAlign: "right" }}>
                  {formData.topic.length}/500
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Add 2–4 options for players to vote on:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {(formData.votingTopics || []).map((topic, i) => (
                    <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 800, color: "var(--blue)", width: 20, flexShrink: 0 }}>
                        #{i + 1}
                      </span>
                      <input type="text" value={topic} onChange={e => handleTopicChange(i, e.target.value)}
                        placeholder={`Option ${i + 1}`} maxLength={200} className="input-dark"
                        style={{ flex: 1, padding: "0.55rem 0.875rem" }} />
                      <button type="button" onClick={() => handleRemoveTopic(i)} className="btn-danger"
                        style={{ padding: "0.5rem 0.65rem", fontSize: "0.78rem", flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                  {(formData.votingTopics || []).length < 4 && (
                    <button type="button" onClick={handleAddTopic} className="btn-ghost"
                      style={{ padding: "0.5rem", fontSize: "0.78rem", border: "1.5px dashed var(--border2)" }}>
                      + Add option {(formData.votingTopics || []).length + 1} / 4
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── MODE CARD ── */}
          <div className="glass fade-up" style={{ padding: isMobile ? "1rem" : "1.25rem 1.5rem" }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "0.75rem" }}>
              🎮 Debate Mode
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
              {[
                { value: "alternate", icon: "🔄", label: "Alternate", desc: "Structured turns — FOR then AGAINST, each round." },
                { value: "buzzer",    icon: "🔔", label: "Buzzer",    desc: "Open floor — first to buzz grabs the mic." },
              ].map((mode) => {
                const active = formData.debateMode === mode.value;
                return (
                  <div
                    key={mode.value}
                    onClick={() => set("debateMode", mode.value as "alternate" | "buzzer")}
                    style={{
                      padding: isMobile ? "0.75rem" : "0.875rem 1rem",
                      borderRadius: "0.875rem",
                      border: `2px solid ${active ? "var(--blue)" : "var(--border)"}`,
                      background: active ? "rgba(79,70,229,0.07)" : "rgba(255,255,255,0.55)",
                      cursor: "pointer", transition: "all 0.2s",
                      boxShadow: active ? "0 4px 16px rgba(79,70,229,0.14)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.3rem" }}>
                      <span style={{ fontSize: "1rem" }}>{mode.icon}</span>
                      <span style={{ fontWeight: 800, fontSize: "0.85rem", color: active ? "var(--blue)" : "var(--text)" }}>
                        {mode.label}
                      </span>
                      {active && (
                        <span style={{ marginLeft: "auto", fontSize: "0.58rem", fontWeight: 800, color: "var(--blue)", background: "rgba(79,70,229,0.12)", padding: "0.1rem 0.45rem", borderRadius: "9999px" }}>
                          SELECTED
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--muted)", lineHeight: 1.45 }}>{mode.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── SETTINGS CARD ── */}
          <div className="glass fade-up" style={{ padding: isMobile ? "1rem" : "1.25rem 1.5rem" }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "0.875rem" }}>
              ⚙️ Settings
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <Stepper label="Rounds" hint="turns per side"
                value={formData.totalRounds} min={1} max={10} step={1}
                onChange={v => set("totalRounds", v)} />
              <Stepper label="Max players" hint="in the room"
                value={formData.maxParticipants} min={2} max={20} step={1}
                onChange={v => set("maxParticipants", v)} />
              <Stepper label="Prep time" hint="before debate starts"
                value={formData.prepDuration} min={0} max={300} step={15}
                display={fmtTime}
                onChange={v => set("prepDuration", v)} />
              <Stepper label="Turn time" hint="per speaker"
                value={formData.turnDuration} min={15} max={600} step={15}
                display={fmtTime}
                onChange={v => set("turnDuration", v)} />
            </div>

            {/* Summary strip */}
            <div style={{ marginTop: "1rem", padding: "0.55rem 0.875rem", borderRadius: "0.625rem", background: "rgba(79,70,229,0.05)", border: "1px solid rgba(79,70,229,0.11)", display: "flex", flexWrap: "wrap", gap: "0.5rem 1.25rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                <span style={{ fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{totalTurns}</span>
                {" "}total turns
              </span>
              <span style={{ color: "var(--border2)", fontSize: "0.6rem" }}>|</span>
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                ≈ <span style={{ fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{fmtTime(totalTimeSec)}</span>
                {" "}debate time
              </span>
              <span style={{ color: "var(--border2)", fontSize: "0.6rem" }}>|</span>
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                up to <span style={{ fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{formData.maxParticipants}</span>
                {" "}players
              </span>
            </div>
          </div>

        </form>
      </main>
    </div>
  );
}
