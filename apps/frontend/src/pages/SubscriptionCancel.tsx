import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { BrandLogo, BrandSymbol } from "../components/BrandLogo";
import { Icon } from "../components/Icon";
import { useIsMobile } from "../hooks/useIsMobile";

/**
 * Cancelled screen. Two cases share it:
 *  • a Pro user who cancelled their subscription — cancellation takes effect
 *    at the end of the billing cycle, so Pro access continues until then;
 *  • a free user who closed checkout — nothing was charged.
 */
export function SubscriptionCancel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const stillPro = (user as any)?.isPro ?? false;

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
      <div style={{ alignSelf: "flex-start" }}>
        <BrandLogo height={isMobile ? 26 : 30} />
      </div>

      <main className="fade-up" style={{ flex: 1, width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", justifyContent: isMobile ? "flex-start" : "center", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
          <span style={{ width: isMobile ? 80 : 96, height: isMobile ? 80 : 96, borderRadius: "50%", background: "var(--ds-raised)", border: "1px solid var(--ds-border2)", color: "var(--ds-text3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={isMobile ? 32 : 40} />
          </span>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 28 : 40, letterSpacing: "-0.03em", color: "var(--ds-text)" }}>
            {stillPro ? "Subscription cancelled" : "Checkout cancelled"}
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "var(--ds-muted)" }}>
            {stillPro
              ? "Your Pro access continues until the end of your current billing period."
              : "No payment was taken. You're still on the Free plan, and everything you had is still here."}
          </p>
        </div>

        <div className="ds-card" style={{ display: "flex", gap: 12, padding: "16px 18px", borderRadius: 18, fontSize: 14, lineHeight: 1.5, color: "var(--ds-text3)" }}>
          <span style={{ flexShrink: 0, paddingTop: 1 }}><BrandSymbol size={20} title="" /></span>
          <span>
            {stillPro
              ? "You can re-subscribe any time from the Pricing page."
              : "Pro adds human judges, spectators, buzzer mode and topic voting to the rooms you host. You can upgrade whenever you're ready."}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => navigate("/pricing")} className="ds-btn ds-btn-primary ds-btn-block" style={{ height: 56, borderRadius: 16, fontSize: 16 }}>
            {stillPro ? <>View pricing<Icon name="right" size={18} /></> : <><Icon name="refresh" size={18} />Try again</>}
          </button>
          <button onClick={() => navigate("/")} className="ds-btn ds-btn-ghost ds-btn-block" style={{ height: 52, borderRadius: 16, color: "var(--ds-text)" }}>
            Back to home
          </button>
        </div>
      </main>
    </div>
  );
}
