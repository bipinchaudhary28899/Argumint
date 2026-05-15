/**
 * SubscriptionSuccess.tsx
 *
 * Shows the Pro unlock card, then navigates straight to the golden home page.
 * No sweep, no particles — just the card reveal + redirect.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const PRO_PERKS = [
  { icon: "⚖️", label: "Human Judges" },
  { icon: "🎙️", label: "Whisper AI"   },
  { icon: "🔔", label: "Buzzer Mode"  },
  { icon: "🗳️", label: "Topic Voting" },
  { icon: "👑", label: "Pro Badge"    },
];

export function SubscriptionSuccess() {
  const navigate      = useNavigate();
  const { checkAuth } = useAuth();
  const navFired      = useRef(false);

  const [showCrown, setShowCrown] = useState(false);
  const [showText,  setShowText]  = useState(false);
  const [showPerks, setShowPerks] = useState(false);
  const [showHome,  setShowHome]  = useState(false);

  useEffect(() => {
    const t = [
      setTimeout(() => setShowCrown(true),  150),
      setTimeout(() => setShowText(true),   400),
      setTimeout(() => setShowPerks(true),  700),
      setTimeout(() => setShowHome(true),   2200),
      setTimeout(async () => {
        if (navFired.current) return;
        navFired.current = true;
        await checkAuth();
        navigate("/", { replace: true });
      }, 3000),
    ];
    return () => t.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#08080f",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <style>{`
        @keyframes crownDrop {
          0%   { opacity:0; transform: translateY(-50px) scale(0.6); }
          60%  { transform: translateY(6px) scale(1.08); }
          80%  { transform: translateY(-3px) scale(0.97); }
          100% { opacity:1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform: translateY(10px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes perkPop {
          0%   { opacity:0; transform: scale(0.7) translateY(8px); }
          65%  { transform: scale(1.07) translateY(-1px); }
          100% { opacity:1; transform: scale(1) translateY(0); }
        }
        @keyframes goldHalo {
          0%,100% { box-shadow: 0 0 30px 0   rgba(245,158,11,0.2); }
          50%     { box-shadow: 0 0 60px 12px rgba(245,158,11,0.45); }
        }
      `}</style>

      {/* Card */}
      <div style={{
        width: "min(460px, 90vw)",
        padding: "2.75rem 3rem",
        borderRadius: "1.5rem",
        textAlign: "center",
        background: "linear-gradient(160deg, rgba(245,158,11,0.1) 0%, rgba(12,12,22,0.98) 50%, rgba(251,191,36,0.06) 100%)",
        border: "1.5px solid rgba(245,158,11,0.55)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        animation: "goldHalo 2.4s ease-in-out infinite",
      }}>

        {/* Crown */}
        <div style={{
          fontSize: "4.5rem", lineHeight: 1, marginBottom: "0.5rem",
          display: "inline-block",
          filter: "drop-shadow(0 0 20px rgba(245,158,11,0.7))",
          opacity: showCrown ? 1 : 0,
          animation: showCrown ? "crownDrop 0.6s cubic-bezier(.34,1.56,.64,1) forwards" : "none",
        }}>
          👑
        </div>

        {/* Label */}
        <div style={{
          fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.22em",
          textTransform: "uppercase", color: "#d97706",
          marginBottom: "0.3rem",
          opacity: showText ? 1 : 0,
          animation: showText ? "fadeUp 0.4s ease forwards" : "none",
        }}>
          Argumint
        </div>

        {/* PRO UNLOCKED */}
        <h1 style={{
          margin: "0 0 0.25rem",
          fontSize: "clamp(2.2rem, 6vw, 3rem)",
          fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.02em",
          background: "linear-gradient(135deg,#f59e0b 0%,#fcd34d 45%,#f97316 75%,#fbbf24 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          opacity: showText ? 1 : 0,
          animation: showText ? "fadeUp 0.45s ease 0.05s forwards" : "none",
        }}>
          PRO UNLOCKED
        </h1>

        {/* Subtitle */}
        <p style={{
          color: "rgba(255,255,255,0.4)", fontSize: "0.88rem", lineHeight: 1.6,
          margin: "0.6rem 0 1.4rem",
          opacity: showText ? 1 : 0,
          animation: showText ? "fadeUp 0.45s ease 0.15s forwards" : "none",
        }}>
          All Pro features are now active on your account.
        </p>

        {/* Divider */}
        <div style={{
          height: 1, marginBottom: "1.25rem",
          background: "linear-gradient(90deg,transparent,rgba(245,158,11,0.5),rgba(251,191,36,0.75),rgba(245,158,11,0.5),transparent)",
          opacity: showText ? 1 : 0,
          transition: "opacity 0.5s ease 0.2s",
        }} />

        {/* Feature pills */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:"0.5rem", justifyContent:"center", marginBottom:"1.75rem" }}>
          {PRO_PERKS.map((perk, i) => (
            <div key={perk.label} style={{
              display:"flex", alignItems:"center", gap:"0.35rem",
              padding:"0.38rem 0.85rem", borderRadius:"9999px",
              background:"linear-gradient(135deg,rgba(245,158,11,0.18),rgba(251,191,36,0.08))",
              border:"1px solid rgba(245,158,11,0.4)",
              fontSize:"0.76rem", fontWeight:700, color:"#fbbf24",
              opacity: showPerks ? 1 : 0,
              animation: showPerks
                ? `perkPop 0.4s cubic-bezier(.34,1.56,.64,1) ${i * 80}ms forwards`
                : "none",
            }}>
              <span>{perk.icon}</span>
              <span>{perk.label}</span>
            </div>
          ))}
        </div>

        {/* Redirect line */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"center", gap:"0.5rem",
          fontSize:"0.84rem", fontWeight:600, minHeight:"1.4rem",
          opacity: showHome ? 1 : 0,
          animation: showHome ? "fadeUp 0.4s ease forwards" : "none",
          color: "#f59e0b",
        }}>
          {showHome && (
            <>
              <span style={{
                width:7, height:7, borderRadius:"50%", background:"#f59e0b",
                display:"inline-block", flexShrink:0,
                animation:"goldHalo 0.9s ease-in-out infinite",
              }} />
              Taking you to your dashboard…
            </>
          )}
        </div>
      </div>
    </div>
  );
}
