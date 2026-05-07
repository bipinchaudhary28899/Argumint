import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { NavLogo } from "../components/NavLogo";
import { useIsMobile } from "../hooks/useIsMobile";
import { roomApi } from "../services/api";
import type { CreateRoomInput } from "@argumint/shared";


// Numeric field names for CreateRoom
const NUMERIC_FIELDS = ["maxParticipants", "totalRounds", "prepDuration", "turnDuration", "votingDuration"] as const;

export function CreateRoom() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setRoom, setError } = useRoom();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateRoomInput>({
    topic: "", description: "", debateMode: "alternate",
    maxParticipants: 10, votingEnabled: false, votingTopics: [],
    votingDuration: 30, prepDuration: 120, turnDuration: 180,
    totalRounds: 2, transcriptionMode: "whisper" as const,
  });

  // Separate string state for numeric inputs to avoid "010" leading-zero bug
  const [numRaw, setNumRaw] = useState<Record<string, string>>({
    maxParticipants: "10", totalRounds: "2",
    prepDuration: "120", turnDuration: "180", votingDuration: "30",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    if ((NUMERIC_FIELDS as readonly string[]).includes(name)) {
      const digits = value.replace(/\D/g, "");
      setNumRaw((prev) => ({ ...prev, [name]: digits }));
      setFormData((prev) => ({ ...prev, [name]: digits === "" ? 0 : parseInt(digits, 10) }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleAddTopic = () => {
    if (formData.votingTopics.length < 4)
      setFormData((prev) => ({ ...prev, votingTopics: [...(prev.votingTopics || []), ""] }));
  };

  const handleRemoveTopic = (index: number) =>
    setFormData((prev) => ({ ...prev, votingTopics: (prev.votingTopics || []).filter((_, i) => i !== index) }));

  const handleTopicChange = (index: number, value: string) =>
    setFormData((prev) => ({ ...prev, votingTopics: (prev.votingTopics || []).map((t, i) => i === index ? value : t) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.topic.trim() && !formData.votingEnabled) { setLocalError("Debate topic is required"); return; }
    if (formData.votingEnabled && (!formData.votingTopics || formData.votingTopics.length === 0)) { setLocalError("Add at least one voting topic"); return; }
    try {
      setIsLoading(true);
      setLocalError(null);
      setError(null);
      const newRoom = await roomApi.createRoom(formData);
      setRoom(newRoom);
      navigate(`/room/${newRoom.code}/lobby`);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <nav className="game-nav">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button onClick={() => navigate("/")} className="btn-ghost" style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem" }}>← Back</button>
          <NavLogo onClick={() => navigate("/")} />
        </div>
        {!isMobile && <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{user?.username}</span>}
      </nav>

      <main style={{ flex: 1, overflow: "auto", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "0.75rem" : "1rem 1.25rem" }}>
        <form onSubmit={handleSubmit} className="fade-up glass" style={{ width: "100%", maxWidth: 860, padding: isMobile ? "1.25rem" : "1.75rem 2rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Title + submit row */}
          <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: isMobile ? "0.75rem" : 0 }}>
            <div>
              <h1 style={{ fontSize: "1.35rem", fontWeight: 900, color: "var(--text)", margin: 0, letterSpacing: "-0.02em" }}>Host a Debate</h1>
              {localError && <p style={{ color: "#f43f5e", fontSize: "0.78rem", margin: "0.15rem 0 0", fontWeight: 600 }}>⚠ {localError}</p>}
            </div>
            <div style={{ display: "flex", gap: "0.625rem", width: isMobile ? "100%" : "auto" }}>
              <button type="button" onClick={() => navigate("/")} className="btn-ghost" style={{ padding: "0.45rem 1.1rem", fontSize: "0.85rem", flex: isMobile ? 1 : "none" }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isLoading} style={{ padding: "0.45rem 1.4rem", fontSize: "0.85rem", flex: isMobile ? 2 : "none" }}>
                {isLoading ? "Creating…" : "Create Room →"}
              </button>
            </div>
          </div>

          <div className="divider" style={{ margin: 0 }} />

          {/* Voting toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 1rem", background: "rgba(224,242,254,0.55)", border: "1px solid rgba(14,165,233,0.2)", borderRadius: "0.625rem", cursor: "pointer" }}
            onClick={() => setFormData(prev => ({ ...prev, votingEnabled: !prev.votingEnabled }))}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "var(--text)" }}>Let players vote on the topic</span>
              {!isMobile && <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>— players pick from options you set in the lobby</span>}
            </div>
            <div style={{ width: 40, height: 22, borderRadius: 9999, background: formData.votingEnabled ? "var(--cyan)" : "var(--border2)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: 2, left: formData.votingEnabled ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </div>
          </div>

          {/* Topic row */}
          {!formData.votingEnabled ? (
            <div>
              <label className="label">Debate Topic *</label>
              <input name="topic" type="text" className="input-dark" value={formData.topic} onChange={handleChange}
                placeholder="e.g. Social media does more harm than good" maxLength={500} />
            </div>
          ) : (
            <div>
              <label className="label">Voting Topics (2–4) *</label>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.5rem" }}>
                {(formData.votingTopics || []).map((topic, i) => (
                  <div key={i} style={{ display: "flex", gap: "0.4rem" }}>
                    <input type="text" value={topic} onChange={(e) => handleTopicChange(i, e.target.value)}
                      placeholder={`Option ${i + 1}`} maxLength={200} className="input-dark" style={{ flex: 1 }} />
                    <button type="button" onClick={() => handleRemoveTopic(i)} className="btn-danger" style={{ padding: "0.4rem 0.6rem", fontSize: "0.8rem" }}>✕</button>
                  </div>
                ))}
                {(formData.votingTopics || []).length < 4 && (
                  <button type="button" onClick={handleAddTopic} className="btn-ghost" style={{ padding: "0.4rem 0.75rem", fontSize: "0.78rem" }}>+ Add option</button>
                )}
              </div>
            </div>
          )}

          {/* All settings */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1.6fr 1fr 1fr 1fr 1fr", gap: "0.75rem", alignItems: "end" }}>
            {/* Debate Mode spans full width on mobile so native picker has room */}
            <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}>
              <label className="label">Debate Mode</label>
              <select name="debateMode" className="input-dark" value={formData.debateMode} onChange={handleChange}>
                <option value="alternate">Alternate (For → Against)</option>
                <option value="buzzer">Buzzer (first to buzz)</option>
              </select>
            </div>
            <div>
              <label className="label">Max Players</label>
              <input name="maxParticipants" type="text" inputMode="numeric" pattern="[0-9]*" className="input-dark" value={numRaw.maxParticipants} onChange={handleChange} />
            </div>
            <div>
              <label className="label">Rounds</label>
              <input name="totalRounds" type="text" inputMode="numeric" pattern="[0-9]*" className="input-dark" value={numRaw.totalRounds} onChange={handleChange} />
            </div>
            <div>
              <label className="label">Prep (sec)</label>
              <input name="prepDuration" type="text" inputMode="numeric" pattern="[0-9]*" className="input-dark" value={numRaw.prepDuration} onChange={handleChange} />
            </div>
            <div>
              <label className="label">Turn (sec)</label>
              <input name="turnDuration" type="text" inputMode="numeric" pattern="[0-9]*" className="input-dark" value={numRaw.turnDuration} onChange={handleChange} />
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
