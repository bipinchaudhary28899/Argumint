/**
 * SubscriptionSuccess.tsx
 *
 * "You're Pro" confirmation: staged card reveal, then refreshes the user and
 * navigates straight to the golden home page. The buttons take the same exit
 * early (guarded so the auto-redirect never fires twice).
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { BrandLogo, BrandSymbol } from "../components/BrandLogo";
import { Icon, type IconName } from "../components/Icon";
import { useIsMobile } from "../hooks/useIsMobile";

const PRO_PERKS: { icon: IconName; label: string }[] = [
  { icon: "users", label: "Human Judges" },
  { icon: "mic",   label: "Whisper AI"   },
  { icon: "bolt",  label: "Buzzer Mode"  },
  { icon: "vote",  label: "Topic Voting" },
  { icon: "crown", label: "Pro Badge"    },
];

export function SubscriptionSuccess() {
  const navigate            = useNavigate();
  const { user, checkAuth } = useAuth();
  const isMobile            = useIsMobile();
  const navFired            = useRef(false);

  const [showCrown, setShowCrown] = useState(false);
  const [showText,  setShowText]  = useState(false);
  const [showPerks, setShowPerks] = useState(false);
  const [showHome,  setShowHome]  = useState(false);

  // Refresh the user (so isPro is current) and leave — once only
  const leave = async (to: string) => {
    if (navFired.current) return;
    navFired.current = true;
    await checkAuth();
    navigate(to, { replace: true });
  };

  useEffect(() => {
    const t = [
      setTimeout(() => setShowCrown(true),  150),
      setTimeout(() => setShowText(true),   400),
      setTimeout(() => setShowPerks(true),  700),
      setTimeout(() => setShowHome(true),   2200),
      setTimeout(() => { void leave("/"); }, 3000),
    ];
    return () => t.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodEnd = (user as any)?.currentPeriodEnd as string | null | undefined;
  const renewsOn  = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const reveal = (on: boolean, delay = 0): React.CSSProperties => ({
    opacity: on ? 1 : 0,
    animation: on ? `proFadeUp 0.45s ease ${delay}s both` : "none",
  });

  return (
    <div
      // html/body/#root are overflow:hidden app-wide, so this page owns its scroll
      style={{
        height: "100vh", overflowY: "auto", boxSizing: "border-box",
        padding: isMobile ? "20px 16px 32px" : "32px 48px 56px",
        backgroundColor: "var(--ds-bg)",
        backgroundImage: "radial-gradient(var(--ds-dots) 1px, transparent 1.2px)",
        backgroundSize: "22px 22px",
        color: "var(--ds-text)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 40,
      }}
    >
      <style>{`
        @keyframes proEmblemDrop {
          0%   { opacity:0; transform: translateY(-40px) scale(0.6); }
          60%  { transform: translateY(6px) scale(1.08); }
          80%  { transform: translateY(-3px) scale(0.97); }
          100% { opacity:1; transform: translateY(0) scale(1); }
        }
        @keyframes proFadeUp {
          from { opacity:0; transform: translateY(10px); }
          to   { opacity:1; transform: translateY(0); }
        }
        @keyframes proHalo {
          0%,100% { box-shadow: 0 0 24px 0    rgba(var(--gold-rgb),0.18); }
          50%     { box-shadow: 0 0 48px 10px rgba(var(--gold-rgb),0.35); }
        }
      `}</style>

      <div style={{ alignSelf: "flex-start" }}>
        <BrandLogo height={isMobile ? 26 : 30} />
      </div>

      <main style={{ flex: 1, width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", justifyContent: isMobile ? "flex-start" : "center", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
          {/* Emblem */}
          <span
            style={{
              width: isMobile ? 96 : 120, height: isMobile ? 96 : 120, borderRadius: "50%",
              background: "var(--ds-gold-bg)", border: "2px solid var(--ds-gold-line)",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: showCrown ? 1 : 0,
              animation: showCrown ? "proEmblemDrop 0.6s cubic-bezier(.34,1.56,.64,1) forwards, proHalo 2.4s ease-in-out 0.6s infinite" : "none",
            }}
          >
            <BrandSymbol size={isMobile ? 56 : 72} title="" />
          </span>

          <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 34 : 48, letterSpacing: "-0.03em", color: "var(--ds-text)", ...reveal(showText) }}>
            You're <span style={{ color: "var(--ds-gold-text)" }}>Pro</span>
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "var(--ds-muted)", ...reveal(showText, 0.1) }}>
            {renewsOn
              ? `Payment confirmed. Your subscription renews on ${renewsOn}.`
              : "Payment confirmed. All Pro features are now active on your account."}
          </p>
        </div>

        {/* Unlocked perks */}
        <section
          className="ds-card"
          style={{ padding: isMobile ? 20 : 24, display: "flex", flexDirection: "column", gap: 14, ...reveal(showPerks) }}
        >
          <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--ds-muted)" }}>NOW UNLOCKED</h2>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            {PRO_PERKS.map((perk) => (
              <div key={perk.label} style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, background: "var(--ds-gold-bg)", color: "var(--ds-gold-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={perk.icon} size={20} />
                </span>
                <span style={{ fontWeight: 700 }}>{perk.label}</span>
              </div>
            ))}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, ...reveal(showPerks, 0.1) }}>
          <button onClick={() => leave("/create-room")} className="ds-btn ds-btn-primary ds-btn-block" style={{ height: 56, borderRadius: 16, fontSize: 16 }}>
            Create a room<Icon name="right" size={18} />
          </button>
          <button onClick={() => leave("/")} className="ds-btn ds-btn-ghost ds-btn-block" style={{ height: 52, borderRadius: 16, color: "var(--ds-text)" }}>
            Back to home
          </button>
        </div>

        {/* Redirect line */}
        <div
          role="status"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontSize: 14, fontWeight: 600, minHeight: 22, color: "var(--ds-gold-text)",
            ...reveal(showHome),
          }}
        >
          {showHome && (
            <>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ds-gold-mid)", flexShrink: 0, animation: "proHalo 0.9s ease-in-out infinite" }} />
              Taking you to your dashboard…
            </>
          )}
        </div>
      </main>
    </div>
  );
}
