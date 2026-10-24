import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { useTheme } from "../contexts/ThemeContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { roomApi } from "../services/api";
import { AppShell } from "../components/AppShell";
import { Icon, type IconName } from "../components/Icon";
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
  /** Used in the −/+ aria-labels: "Fewer rounds" / "More rounds" */
  noun: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display?: (v: number) => string;
  onChange: (v: number) => void;
}

function Stepper({ label, noun, hint, value, min, max, step, display, onChange }: StepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;
  const btn: React.CSSProperties = {
    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
    border: "1px solid var(--ds-border2)", background: "var(--ds-raised)", color: "var(--ds-text)",
    font: "600 22px Outfit, sans-serif", display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", padding: 0,
  };
  return (
    <div role="group" aria-label={label} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ds-text)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" aria-label={`Fewer ${noun}`} onClick={() => onChange(Math.max(min, value - step))} disabled={atMin}
          style={{ ...btn, opacity: atMin ? 0.4 : 1, cursor: atMin ? "not-allowed" : "pointer" }}>
          −
        </button>
        <output aria-live="polite" style={{
          flex: 1, minWidth: 0, height: 48, boxSizing: "border-box", borderRadius: 12,
          background: "var(--ds-deep)", border: "1px solid var(--ds-border2)", color: "var(--ds-text)",
          display: "flex", alignItems: "center", justifyContent: "center",
          font: "600 20px 'JetBrains Mono', monospace",
        }}>
          {display ? display(value) : value}
        </output>
        <button type="button" aria-label={`More ${noun}`} onClick={() => onChange(Math.min(max, value + step))} disabled={atMax}
          style={{ ...btn, opacity: atMax ? 0.4 : 1, cursor: atMax ? "not-allowed" : "pointer" }}>
          +
        </button>
      </div>
      <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{hint}</span>
    </div>
  );
}

// ── Section card (numbered fieldset) ────────────────────────────────────────

function Section({ n, title, gap = 16, isMobile, children }: {
  n: string; title: string; gap?: number; isMobile: boolean; children: React.ReactNode;
}) {
  return (
    <fieldset className="ds-card" style={{
      margin: 0, minWidth: 0, padding: isMobile ? 20 : 28,
      display: "flex", flexDirection: "column", gap,
    }}>
      <legend style={{ float: "left", padding: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--ds-accent)" }}>
        {n} · {title}
      </legend>
      {children}
    </fieldset>
  );
}

// ── Pro chip (gold; Glacier keeps its blue accent) ──────────────────────────

function ProChip({ isGlacier }: { isGlacier: boolean }) {
  return (
    <span className={`ds-chip ${isGlacier ? "ds-chip-accent" : "ds-chip-gold"}`}
      style={{ height: 22, padding: "0 8px", borderRadius: 6, fontSize: 10, letterSpacing: "0.08em", gap: 4 }}>
      <Icon name="crown" size={12} />PRO
    </span>
  );
}

/** Switch shown to free users — looks off + locked, opens pricing. */
function LockedSwitch({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={false} aria-disabled="true" aria-label={`${label} (Pro only)`} onClick={onClick}
      style={{
        width: 56, height: 32, flexShrink: 0, borderRadius: 99, boxSizing: "border-box",
        border: "1px solid var(--ds-border2)", background: "var(--ds-raised)", padding: 3,
        display: "flex", alignItems: "center", justifyContent: "flex-start", color: "var(--ds-muted)", cursor: "pointer",
      }}>
      <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--ds-border2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="lock" size={13} />
      </span>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const MODES: { value: "alternate" | "buzzer"; icon: IconName; iconColor: string; label: string; desc: string; proOnly: boolean }[] = [
  { value: "alternate", icon: "users", iconColor: "var(--ds-accent)",   label: "Alternate", desc: "Ordered turns with a countdown. FOR then AGAINST, each round.", proOnly: false },
  { value: "buzzer",    icon: "bolt",  iconColor: "var(--ds-gold-mid)", label: "Buzzer",    desc: "Open floor. First to grab the mic holds it; a re-grab window opens on release.", proOnly: true },
];

export function CreateRoom() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { setRoom, setError } = useRoom();
  const { theme } = useTheme();
  const isMobile  = useIsMobile();
  // Stack the preview under the form until there's room for the 360px column
  const isNarrow  = useIsMobile(1100);
  const isPro      = (user as any)?.isPro ?? false;
  const isGlacier  = theme === "glacier";

  const [isLoading,   setIsLoading]   = useState(false);
  const [localError,  setLocalError]  = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateRoomInput & { maxJudges: number; maxSpectators: number }>({
    topic: "", description: "", debateMode: "alternate",
    maxParticipants: 10, maxJudges: 0, maxSpectators: 0,
    votingEnabled: false, votingTopics: [],
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

  const toggleVoting = () => {
    if (!isPro) { navigate("/pricing"); return; }
    const next = !formData.votingEnabled;
    setFormData(prev => ({
      ...prev,
      votingEnabled: next,
      // Clear leftover empty topic slots when voting is turned off.
      votingTopics: next ? prev.votingTopics : [],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.topic.trim() && !formData.votingEnabled) { setLocalError("Debate topic is required"); return; }
    if (formData.votingEnabled && !(formData.votingTopics || []).length) { setLocalError("Add at least one voting topic"); return; }
    try {
      setIsLoading(true); setLocalError(null); setError(null);
      // Strip blank voting-topic entries so the backend never sees empty strings.
      const payload = {
        ...formData,
        votingTopics: (formData.votingTopics || []).filter(t => t.trim().length > 0),
      };
      const newRoom = await roomApi.createRoom(payload);
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
  const votingTopics = formData.votingTopics || [];

  const twoCol = isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const rowDivider = "1px solid var(--ds-hair)";

  const preview: { k: string; v: React.ReactNode }[] = [
    { k: "Mode",   v: formData.debateMode === "buzzer" ? "Buzzer" : "Alternate" },
    { k: "Rounds", v: formData.totalRounds },
    { k: "Turn",   v: fmtTime(formData.turnDuration) },
    { k: "Prep",   v: fmtTime(formData.prepDuration) },
    { k: "Seats",  v: `Up to ${formData.maxParticipants}` },
    { k: "Voting", v: formData.votingEnabled ? "On" : "Off" },
    { k: "Turns",  v: totalTurns },
    { k: "Length", v: <>≈ <span>{fmtTime(totalTimeSec)}</span></> },
    ...(isPro ? [
      { k: "Judges",     v: formData.maxJudges },
      { k: "Spectators", v: formData.maxSpectators },
    ] : []),
  ];

  const filledOptions = votingTopics.filter(t => t.trim()).length;
  const motionPreview = formData.votingEnabled
    ? (filledOptions
        ? `Players vote between ${filledOptions} option${filledOptions !== 1 ? "s" : ""}`
        : "Players vote on the motion in the lobby")
    : formData.topic.trim();

  return (
    <AppShell active="create">
      <div className="ds-page" style={{ gap: isMobile ? 20 : 28 }}>

        {/* ── Header ── */}
        <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!isMobile && (
            <button type="button" onClick={() => navigate("/")} aria-label="Back to home"
              style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, padding: 0, border: 0, background: "none", cursor: "pointer", font: "600 14px Outfit, sans-serif", color: "var(--ds-muted)" }}>
              <Icon name="left" size={16} />Home
            </button>
          )}
          <h1 className="ds-h1" style={{ fontSize: isMobile ? 24 : 34 }}>Create a room</h1>
          <p className="ds-sub">You'll host. Sides are assigned at random when the debate starts.</p>
        </header>

        <form onSubmit={handleSubmit} aria-label="Create a room"
          style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(0, 1fr) 360px", gap: 24, alignItems: "start" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>

            {/* ── 01 · Motion ── */}
            <Section n="01" title="THE MOTION" isMobile={isMobile}>
              {!formData.votingEnabled ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label htmlFor="cr-topic" style={{ fontSize: 14, fontWeight: 600 }}>Motion</label>
                  <textarea
                    id="cr-topic" name="topic" rows={2} className="ds-input"
                    value={formData.topic}
                    onChange={e => set("topic", e.target.value)}
                    placeholder="e.g. Social media does more harm than good"
                    maxLength={500}
                    style={{ minHeight: 0, font: "500 18px/1.45 Outfit, sans-serif" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "var(--ds-muted)" }}>
                    <span>Phrase it so one side can argue FOR and the other AGAINST.</span>
                    <span className="ds-mono" style={{ flexShrink: 0 }}>{formData.topic.length}/500</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Topic options</span>
                  <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>Add 2–4 options for players to vote on:</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {votingTopics.map((topic, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="ds-mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--ds-accent)", width: 24, flexShrink: 0 }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <input type="text" value={topic} onChange={e => handleTopicChange(i, e.target.value)}
                          aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} maxLength={200} className="ds-input"
                          style={{ flex: 1, minWidth: 0, height: 48 }} />
                        <button type="button" onClick={() => handleRemoveTopic(i)} aria-label={`Remove option ${i + 1}`}
                          className="ds-btn ds-btn-danger" style={{ width: 48, height: 48, padding: 0, flexShrink: 0 }}>
                          <Icon name="x" size={18} />
                        </button>
                      </div>
                    ))}
                    {votingTopics.length < 4 && (
                      <button type="button" onClick={handleAddTopic} className="ds-btn ds-btn-ghost ds-btn-block"
                        style={{ borderStyle: "dashed" }}>
                        <Icon name="plus" size={16} />Add option {votingTopics.length + 1} / 4
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor="cr-desc" style={{ fontSize: 14, fontWeight: 600 }}>
                  Context <span style={{ fontWeight: 400, color: "var(--ds-muted)" }}>(optional)</span>
                </label>
                <textarea
                  id="cr-desc" name="description" rows={2} className="ds-input"
                  value={formData.description ?? ""}
                  onChange={e => set("description", e.target.value)}
                  placeholder="Background, definitions or ground rules for debaters"
                  maxLength={2000}
                  style={{ minHeight: 0, fontSize: 15 }}
                />
              </div>
            </Section>

            {/* ── 02 · Mode ── */}
            <Section n="02" title="MODE" isMobile={isMobile}>
              <div role="radiogroup" aria-label="Debate mode" style={{ display: "grid", gridTemplateColumns: twoCol, gap: 14 }}>
                {MODES.map(mode => {
                  const active = formData.debateMode === mode.value;
                  const locked = mode.proOnly && !isPro;
                  return (
                    <button
                      key={mode.value} type="button" role="radio" aria-checked={active}
                      aria-label={locked ? `${mode.label} (Pro only)` : mode.label}
                      onClick={() => locked ? navigate("/pricing") : set("debateMode", mode.value)}
                      style={{
                        padding: 20, borderRadius: 18, textAlign: "left", cursor: "pointer",
                        border: `2px solid ${active ? "var(--ds-accent-line)" : "var(--ds-border)"}`,
                        background: active ? "var(--ds-accent-soft)" : "var(--ds-raised)",
                        color: "var(--ds-text)", fontFamily: "inherit",
                        display: "flex", flexDirection: "column", gap: 10,
                        opacity: locked ? 0.85 : 1,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 18 }}>
                          <span style={{ color: mode.iconColor }}><Icon name={mode.icon} size={22} /></span>
                          {mode.label}
                          {locked && <ProChip isGlacier={isGlacier} />}
                        </span>
                        <span aria-hidden="true" style={{
                          width: 22, height: 22, boxSizing: "border-box", borderRadius: "50%", flexShrink: 0,
                          border: active ? "7px solid var(--ds-accent-mid)" : "2px solid var(--ds-border2)",
                          background: active ? "var(--ds-panel)" : "transparent",
                        }} />
                      </span>
                      <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ds-text3)" }}>{mode.desc}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* ── 03 · Timing & size ── */}
            <Section n="03" title="TIMING & SIZE" gap={18} isMobile={isMobile}>
              <div style={{ display: "grid", gridTemplateColumns: twoCol, gap: 18 }}>
                <Stepper label="Rounds" noun="rounds" hint="Turns per side"
                  value={formData.totalRounds} min={1} max={10} step={1}
                  onChange={v => set("totalRounds", v)} />
                <Stepper label="Max debaters" noun="debaters" hint="Speakers in the debate"
                  value={formData.maxParticipants} min={2} max={20} step={1}
                  onChange={v => set("maxParticipants", v)} />
                <Stepper label="Turn time" noun="seconds per turn" hint="Per speaker"
                  value={formData.turnDuration} min={15} max={600} step={15}
                  display={fmtTime}
                  onChange={v => set("turnDuration", v)} />
                <Stepper label="Prep time" noun="seconds of prep" hint="Before the debate starts"
                  value={formData.prepDuration} min={0} max={300} step={15}
                  display={fmtTime}
                  onChange={v => set("prepDuration", v)} />

                {/* Judges + spectators — Pro only, hidden for free users */}
                {isPro && (
                  <Stepper label="Max judges" noun="judges" hint="Human scorers allowed"
                    value={formData.maxJudges} min={0} max={20} step={1}
                    onChange={v => setFormData(prev => ({ ...prev, maxJudges: v }))} />
                )}
                {isPro && (
                  <Stepper label="Max spectators" noun="spectators" hint="Listen-only observers"
                    value={formData.maxSpectators} min={0} max={100} step={5}
                    onChange={v => setFormData(prev => ({ ...prev, maxSpectators: v }))} />
                )}
              </div>
            </Section>

            {/* ── 04 · Options ── */}
            <Section n="04" title="OPTIONS" gap={6} isMobile={isMobile}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: isPro ? undefined : rowDivider }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
                    Topic voting {!isPro && <ProChip isGlacier={isGlacier} />}
                  </span>
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ds-muted)" }}>
                    Let players vote on the motion in the lobby before it's locked in.
                  </span>
                </div>
                {isPro ? (
                  <button type="button" role="switch" className="ds-toggle" aria-checked={!!formData.votingEnabled}
                    aria-label="Topic voting" onClick={toggleVoting} />
                ) : (
                  <LockedSwitch label="Topic voting" onClick={toggleVoting} />
                )}
              </div>

              {!isPro && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: rowDivider }}>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
                        Human judges &amp; spectators <ProChip isGlacier={isGlacier} />
                      </span>
                      <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ds-muted)" }}>
                        Seat human judges alongside the AI, plus listen-only spectators.
                      </span>
                    </div>
                    <LockedSwitch label="Human judges" onClick={() => navigate("/pricing")} />
                  </div>

                  {/* Pro upsell — shown only for free users */}
                  <button type="button" onClick={() => navigate("/pricing")}
                    style={{
                      marginTop: 10, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14,
                      border: `1px solid ${isGlacier ? "var(--ds-accent-line)" : "var(--ds-gold-line)"}`,
                      background: isGlacier ? "var(--ds-accent-soft)" : "var(--ds-gold-bg)",
                      color: "var(--ds-text3)", textAlign: "left", cursor: "pointer", font: "500 13px/1.45 Outfit, sans-serif",
                    }}>
                    <span style={{ color: isGlacier ? "var(--ds-accent)" : "var(--ds-gold-text)", display: "inline-flex" }}><Icon name="crown" size={16} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ color: isGlacier ? "var(--ds-accent)" : "var(--ds-gold-text)" }}>Pro</strong> unlocks human judges, spectators, Buzzer mode &amp; topic voting
                    </span>
                    <span style={{ flexShrink: 0, fontWeight: 700, color: isGlacier ? "var(--ds-accent)" : "var(--ds-gold-text)" }}>See plans →</span>
                  </button>
                </>
              )}
            </Section>
          </div>

          {/* ── Room preview + submit ── */}
          <aside className="ds-card" aria-label="Room preview" style={{
            padding: isMobile ? 20 : 28, display: "flex", flexDirection: "column", gap: 18, minWidth: 0,
            ...(isNarrow ? {} : { position: "sticky", top: 24 }),
          }}>
            <span className="ds-eyebrow">ROOM PREVIEW</span>
            <p style={{
              margin: 0, fontWeight: 800, fontSize: 20, lineHeight: 1.3, letterSpacing: "-0.01em", overflowWrap: "anywhere",
              color: motionPreview ? "var(--ds-text)" : "var(--ds-faint)",
            }}>
              {motionPreview || "Your motion will appear here"}
            </p>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              {preview.map(({ k, v }) => (
                <div key={k} style={{ padding: 12, borderRadius: 14, background: "var(--ds-raised)", minWidth: 0 }}>
                  <dt style={{ fontSize: 12, color: "var(--ds-muted)", fontWeight: 600 }}>{k}</dt>
                  <dd style={{ margin: "4px 0 0", fontWeight: 700 }}>{v}</dd>
                </div>
              ))}
            </dl>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--ds-muted)" }}>
              A 6-character room code is generated when you create the room. Share it to invite people.
            </p>

            {localError && (
              <div role="alert" style={{
                padding: "12px 14px", borderRadius: 14, fontSize: 14, fontWeight: 600,
                background: "var(--ds-against-bg)", border: "1px solid var(--ds-against-line)", color: "var(--ds-against-text)",
              }}>
                {localError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button type="submit" className="ds-btn ds-btn-primary ds-btn-block" disabled={isLoading}
                style={{ height: 56, borderRadius: 16, fontSize: 16 }}>
                {isLoading ? "Creating…" : <>Create room<Icon name="right" size={18} /></>}
              </button>
              <button type="button" onClick={() => navigate("/")} className="ds-btn ds-btn-ghost ds-btn-block">
                Cancel
              </button>
            </div>
          </aside>
        </form>
      </div>
    </AppShell>
  );
}
