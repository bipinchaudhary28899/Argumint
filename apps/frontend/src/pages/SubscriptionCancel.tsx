import { useNavigate } from "react-router-dom";

/**
 * Shown after the user cancels their Pro subscription from the Pricing page.
 * Cancellation takes effect at the end of the current billing cycle, so the
 * user keeps Pro access until their paid period expires.
 */
export function SubscriptionCancel() {
  const navigate = useNavigate();

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div className="glass fade-up" style={{ padding: "3rem 2.5rem", textAlign: "center", maxWidth: 440, borderRadius: "1.25rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>😕</div>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 900, color: "var(--text)", margin: "0 0 0.75rem" }}>
          Subscription cancelled
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "2rem" }}>
          Your Pro access continues until the end of your current billing period. You can re-subscribe any time from the Pricing page.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button onClick={() => navigate("/pricing")} className="btn-primary" style={{ padding: "0.75rem 1.5rem" }}>
            View pricing
          </button>
          <button onClick={() => navigate("/")} className="btn-ghost" style={{ padding: "0.75rem 1.5rem" }}>
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
