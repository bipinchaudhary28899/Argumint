/**
 * ProWelcomeModal.tsx
 *
 * Interactive feature-tour popup shown once when a user first arrives on the
 * Home page after upgrading to Pro.
 *
 * Shown when:  isPro === true  AND  localStorage "proWelcome_<userId>" not set
 * Dismissed:   X button or "Done" on last slide → sets the localStorage flag
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Slide data ───────────────────────────────────────────────────────────────

interface Slide {
  icon:    string;
  title:   string;
  tag:     string;
  desc:    string;
  tip:     string;                    // "where to find it" hint
  color:   string;                    // accent colour
  preview: React.ReactNode;           // mini mockup
}

// Mini mockup components — purely visual, no logic
function JudgePreview() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.4rem" }}>
      {[
        { name:"judge_rahul", score:88, color:"#10b981" },
        { name:"judge_priya", score:74, color:"#4f8ef7" },
      ].map(j => (
        <div key={j.name} style={{
          display:"flex", alignItems:"center", gap:"0.6rem",
          padding:"0.45rem 0.75rem", borderRadius:"0.5rem",
          background:"rgba(167,139,250,0.1)", border:"1px solid rgba(167,139,250,0.25)",
        }}>
          <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(167,139,250,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.65rem", fontWeight:800, color:"#a78bfa", flexShrink:0 }}>
            {j.name[0].toUpperCase()}
          </div>
          <span style={{ flex:1, fontSize:"0.72rem", fontWeight:700, color:"#e2e8f0" }}>{j.name}</span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.85rem", fontWeight:900, color:j.color }}>{j.score}</span>
          <span style={{ fontSize:"0.58rem", color:"rgba(255,255,255,0.35)" }}>/ 100</span>
        </div>
      ))}
      <div style={{ textAlign:"center", fontSize:"0.62rem", color:"rgba(167,139,250,0.7)", marginTop:"0.2rem", fontWeight:600 }}>
        ⚖️ Blended AI + Human score
      </div>
    </div>
  );
}

function WhisperPreview() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.4rem" }}>
      <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", padding:"0.5rem 0.75rem", borderRadius:"0.5rem", background:"rgba(34,211,238,0.08)", border:"1px solid rgba(34,211,238,0.25)" }}>
        <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:20 }}>
          {[8,14,10,18,12,16,9,13,7,15].map((h,i) => (
            <div key={i} style={{ width:3, height:h, borderRadius:2, background:"#22d3ee", opacity:0.7 + (i%3)*0.1 }} />
          ))}
        </div>
        <span style={{ fontSize:"0.72rem", color:"#22d3ee", fontWeight:700 }}>Whisper AI</span>
        <div style={{ marginLeft:"auto", fontSize:"0.6rem", color:"rgba(34,211,238,0.6)", fontWeight:600 }}>LIVE</div>
      </div>
      <div style={{ padding:"0.5rem 0.75rem", borderRadius:"0.5rem", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)" }}>
        <span style={{ fontSize:"0.72rem", color:"rgba(255,255,255,0.7)", fontStyle:"italic", lineHeight:1.5 }}>
          "…the exponential growth of AI systems fundamentally changes how we define creativity…"
        </span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.6rem", color:"rgba(255,255,255,0.3)", padding:"0 0.1rem" }}>
        <span>Accuracy: <strong style={{ color:"#10b981" }}>98.4%</strong></span>
        <span>Latency: <strong style={{ color:"#22d3ee" }}>~1.2s</strong></span>
      </div>
    </div>
  );
}

function BuzzerPreview() {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem", alignItems:"center" }}>
      <div style={{ display:"flex", gap:"0.75rem" }}>
        {["FOR","AGN"].map((side, i) => (
          <div key={side} style={{
            flex:1, padding:"0.6rem 1rem", borderRadius:"0.625rem", textAlign:"center",
            background: i === 0 ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
            border:`1.5px solid ${i === 0 ? "rgba(16,185,129,0.4)" : "rgba(244,63,94,0.4)"}`,
          }}>
            <div style={{ fontSize:"0.6rem", fontWeight:800, color: i === 0 ? "#10b981" : "#f43f5e", letterSpacing:"0.1em", marginBottom:"0.25rem" }}>{side}</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"1.2rem", fontWeight:900, color: i === 0 ? "#10b981" : "#f43f5e" }}>
              {i === 0 ? "3" : "2"}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", padding:"0.4rem 0.875rem", borderRadius:"9999px", background:"rgba(245,158,11,0.12)", border:"1px solid rgba(245,158,11,0.35)" }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:"#f59e0b", animation:"pulse 1s ease-in-out infinite" }} />
        <span style={{ fontSize:"0.7rem", fontWeight:800, color:"#f59e0b" }}>BUZZER ACTIVE</span>
      </div>
      <div style={{ fontSize:"0.62rem", color:"rgba(255,255,255,0.35)", textAlign:"center" }}>Hit first → win the turn</div>
    </div>
  );
}

function VotingPreview() {
  const opts = [
    { label:"AI will replace jobs",           pct:62, color:"#4f8ef7" },
    { label:"AI will create new jobs",         pct:28, color:"#22d3ee" },
    { label:"No net change in employment",     pct:10, color:"#a78bfa" },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>
      <div style={{ fontSize:"0.68rem", fontWeight:700, color:"rgba(255,255,255,0.5)", marginBottom:"0.1rem" }}>
        🗳️ What should we debate?
      </div>
      {opts.map(o => (
        <div key={o.label}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"0.15rem" }}>
            <span style={{ fontSize:"0.7rem", color:"rgba(255,255,255,0.75)", fontWeight:600 }}>{o.label}</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:"0.68rem", fontWeight:800, color:o.color }}>{o.pct}%</span>
          </div>
          <div style={{ height:6, borderRadius:9999, background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${o.pct}%`, borderRadius:9999, background:o.color, opacity:0.85 }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize:"0.6rem", color:"rgba(255,255,255,0.3)", textAlign:"center", marginTop:"0.1rem" }}>32 participants voted · 2 min left</div>
    </div>
  );
}

function BadgePreview() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.75rem" }}>
      <div style={{
        padding:"1rem 1.5rem", borderRadius:"1rem",
        background:"linear-gradient(160deg,rgba(245,158,11,0.12),rgba(12,12,22,0.95))",
        border:"1.5px solid rgba(245,158,11,0.5)",
        boxShadow:"0 0 32px rgba(245,158,11,0.2)",
        display:"flex", alignItems:"center", gap:"0.75rem",
      }}>
        <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#f59e0b,#d97706)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1rem", fontWeight:900, color:"#fff", boxShadow:"0 4px 14px rgba(245,158,11,0.5)" }}>
          B
        </div>
        <div>
          <div style={{ fontWeight:800, color:"#fff", fontSize:"0.9rem" }}>BipinC</div>
          <div style={{ display:"flex", alignItems:"center", gap:"0.35rem", marginTop:"0.15rem" }}>
            <span style={{ fontSize:"0.6rem", fontWeight:800, letterSpacing:"0.1em", padding:"0.1rem 0.4rem", borderRadius:"9999px", background:"rgba(245,158,11,0.2)", border:"1px solid rgba(245,158,11,0.45)", color:"#f59e0b" }}>Lv.4</span>
            <span style={{ fontSize:"0.65rem", color:"rgba(255,255,255,0.5)" }}>Rhetorician</span>
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:"0.3rem", padding:"0.2rem 0.6rem", borderRadius:"9999px", background:"linear-gradient(135deg,rgba(245,158,11,0.2),rgba(251,191,36,0.1))", border:"1px solid rgba(245,158,11,0.5)" }}>
          <span style={{ fontSize:"0.65rem" }}>👑</span>
          <span style={{ fontSize:"0.62rem", fontWeight:800, backgroundImage:"linear-gradient(90deg,#f59e0b,#fbbf24)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>PRO</span>
        </div>
      </div>
      <div style={{ fontSize:"0.65rem", color:"rgba(255,255,255,0.35)", textAlign:"center" }}>Your card now glows gold in every room</div>
    </div>
  );
}

// ─── Slide definitions ────────────────────────────────────────────────────────

const SLIDES: Slide[] = [
  {
    icon:    "⚖️",
    title:   "Human Judges",
    tag:     "NEW",
    color:   "#a78bfa",
    desc:    "Add up to unlimited real judges to your room. They score each debater independently — their scores are blended with AI scores for a fairer result.",
    tip:     "Enable when creating a room → set Max Judges > 0",
    preview: <JudgePreview />,
  },
  {
    icon:    "🎙️",
    title:   "Whisper AI Transcription",
    tag:     "UPGRADE",
    color:   "#22d3ee",
    desc:    "Browser speech recognition replaced with OpenAI Whisper — significantly higher accuracy, works on all browsers, and handles accents and technical vocabulary.",
    tip:     "Activates automatically in your rooms when you speak",
    preview: <WhisperPreview />,
  },
  {
    icon:    "🔔",
    title:   "Buzzer Mode",
    tag:     "NEW",
    color:   "#f59e0b",
    desc:    "Fast-paced debate format where the first debater to buzz in wins the turn. Perfect for quick-fire rounds and competitive practice.",
    tip:     "Select 'Buzzer' as Debate Mode when creating a room",
    preview: <BuzzerPreview />,
  },
  {
    icon:    "🗳️",
    title:   "Topic Voting",
    tag:     "NEW",
    color:   "#4f8ef7",
    desc:    "Before the debate starts, let all participants vote on the topic from your shortlist. The highest-voted topic becomes the debate motion.",
    tip:     "Enable 'Vote on Topic' in room settings when creating",
    preview: <VotingPreview />,
  },
  {
    icon:    "👑",
    title:   "Golden Pro Profile",
    tag:     "STYLE",
    color:   "#d97706",
    desc:    "Your player card, avatar, XP bar, and nav badge all glow gold. You appear with a crown in every room and leaderboard — so everyone knows.",
    tip:     "Visible right now — check your player card on the right →",
    preview: <BadgePreview />,
  },
];

// ─── Modal ────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  onClose: () => void;
}

export function ProWelcomeModal({ userId, onClose }: Props) {
  const navigate        = useNavigate();
  const [step, setStep] = useState(0);
  const slide           = SLIDES[step];
  const isLast          = step === SLIDES.length - 1;

  const dismiss = () => {
    localStorage.setItem(`proWelcome_${userId}`, "1");
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position:"fixed", inset:0, zIndex:50,
          background:"rgba(0,0,0,0.65)",
          backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)",
          animation:"fadeIn 0.2s ease",
        }}
      />

      {/* Modal */}
      <div style={{
        position:"fixed", inset:0, zIndex:51,
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:"1rem",
        pointerEvents:"none",
      }}>
        <div style={{
          pointerEvents:"all",
          width:"min(520px,96vw)",
          borderRadius:"1.375rem",
          background:"linear-gradient(160deg,rgba(245,158,11,0.09) 0%,rgba(10,10,18,0.98) 45%,rgba(251,191,36,0.05) 100%)",
          border:"1.5px solid rgba(245,158,11,0.45)",
          boxShadow:"0 0 60px rgba(245,158,11,0.18), 0 24px 64px rgba(0,0,0,0.6)",
          backdropFilter:"blur(28px)", WebkitBackdropFilter:"blur(28px)",
          overflow:"hidden",
          animation:"slideUp 0.3s cubic-bezier(.34,1.56,.64,1)",
        }}>

          {/* Header bar */}
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"1rem 1.25rem 0.75rem",
            borderBottom:"1px solid rgba(245,158,11,0.15)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
              <span style={{ fontSize:"0.7rem" }}>👑</span>
              <span style={{
                fontSize:"0.62rem", fontWeight:800, letterSpacing:"0.16em",
                textTransform:"uppercase",
                backgroundImage:"linear-gradient(90deg,#f59e0b,#fbbf24)",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              }}>
                Pro Features Tour
              </span>
              <span style={{
                fontSize:"0.55rem", fontWeight:800, padding:"0.1rem 0.45rem",
                borderRadius:"9999px", background:"rgba(245,158,11,0.18)",
                border:"1px solid rgba(245,158,11,0.4)", color:"#f59e0b",
              }}>
                {step + 1} / {SLIDES.length}
              </span>
            </div>
            <button
              onClick={dismiss}
              style={{
                width:28, height:28, borderRadius:"50%", border:"1px solid rgba(255,255,255,0.12)",
                background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.5)",
                fontSize:"0.8rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all 0.15s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)";
                (e.currentTarget as HTMLButtonElement).style.color = "#fff";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.5)";
              }}
            >
              ✕
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ height:2, background:"rgba(255,255,255,0.06)" }}>
            <div style={{
              height:"100%",
              width:`${((step + 1) / SLIDES.length) * 100}%`,
              background:"linear-gradient(90deg,#f59e0b,#fbbf24)",
              transition:"width 0.35s cubic-bezier(.4,0,.2,1)",
            }} />
          </div>

          {/* Slide content */}
          <div style={{ padding:"1.25rem 1.5rem" }}>

            {/* Feature heading */}
            <div style={{ display:"flex", alignItems:"center", gap:"0.65rem", marginBottom:"0.875rem" }}>
              <div style={{
                width:44, height:44, borderRadius:"0.75rem", flexShrink:0,
                background:`${slide.color}18`,
                border:`1.5px solid ${slide.color}44`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:"1.35rem",
                boxShadow:`0 0 18px ${slide.color}22`,
              }}>
                {slide.icon}
              </div>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:"0.4rem" }}>
                  <h2 style={{ margin:0, fontSize:"1.05rem", fontWeight:900, color:"#fff", letterSpacing:"-0.01em" }}>
                    {slide.title}
                  </h2>
                  <span style={{
                    fontSize:"0.52rem", fontWeight:800, letterSpacing:"0.1em",
                    padding:"0.1rem 0.4rem", borderRadius:"9999px",
                    background:`${slide.color}22`, border:`1px solid ${slide.color}55`,
                    color:slide.color,
                  }}>
                    {slide.tag}
                  </span>
                </div>
                <p style={{ margin:"0.2rem 0 0", fontSize:"0.78rem", color:"rgba(255,255,255,0.45)", lineHeight:1.5 }}>
                  {slide.desc}
                </p>
              </div>
            </div>

            {/* Preview mockup */}
            <div style={{
              padding:"1rem", borderRadius:"0.875rem",
              background:"rgba(255,255,255,0.03)",
              border:`1px solid ${slide.color}25`,
              marginBottom:"0.875rem",
              minHeight:110,
            }}>
              {slide.preview}
            </div>

            {/* How to access tip */}
            <div style={{
              display:"flex", alignItems:"flex-start", gap:"0.5rem",
              padding:"0.55rem 0.75rem", borderRadius:"0.625rem",
              background:"rgba(255,255,255,0.04)",
              border:"1px solid rgba(255,255,255,0.08)",
              marginBottom:"1.125rem",
            }}>
              <span style={{ fontSize:"0.75rem", flexShrink:0, marginTop:"0.05rem" }}>💡</span>
              <span style={{ fontSize:"0.73rem", color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>
                <strong style={{ color:"rgba(255,255,255,0.75)", fontWeight:700 }}>How to use: </strong>
                {slide.tip}
              </span>
            </div>

            {/* Dot indicators */}
            <div style={{ display:"flex", justifyContent:"center", gap:"0.4rem", marginBottom:"1rem" }}>
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  style={{
                    width: i === step ? 20 : 7,
                    height:7, borderRadius:9999, border:"none", cursor:"pointer",
                    background: i === step
                      ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                      : "rgba(255,255,255,0.18)",
                    padding:0,
                    transition:"width 0.25s ease, background 0.2s",
                  }}
                />
              ))}
            </div>

            {/* Navigation buttons */}
            <div style={{ display:"flex", gap:"0.625rem" }}>
              {step > 0 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="btn-ghost"
                  style={{ padding:"0.6rem 1rem", fontSize:"0.82rem", flex:"0 0 auto" }}
                >
                  ← Back
                </button>
              )}
              {!isLast ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  style={{
                    flex:1, padding:"0.7rem", borderRadius:"0.75rem",
                    background:"linear-gradient(135deg,#f59e0b,#d97706)",
                    color:"#fff", fontWeight:800, fontSize:"0.88rem",
                    border:"none", cursor:"pointer",
                    boxShadow:"0 4px 18px rgba(245,158,11,0.35)",
                    transition:"opacity 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  Next feature →
                </button>
              ) : (
                <button
                  onClick={() => { dismiss(); navigate("/create-room"); }}
                  style={{
                    flex:1, padding:"0.7rem", borderRadius:"0.75rem",
                    background:"linear-gradient(135deg,#f59e0b,#d97706)",
                    color:"#fff", fontWeight:800, fontSize:"0.88rem",
                    border:"none", cursor:"pointer",
                    boxShadow:"0 4px 18px rgba(245,158,11,0.35)",
                    transition:"opacity 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  ⚔️ Create my first Pro room
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp {
          from { opacity:0; transform:translateY(24px) scale(0.97); }
          to   { opacity:1; transform:translateY(0)    scale(1); }
        }
      `}</style>
    </>
  );
}
