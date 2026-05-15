import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSubscription } from "../payments/useSubscription";

const FREE_FEATURES = [
  "Up to 10 debaters per room",
  "2 judges per room",
  "Buzzer & alternate debate modes",
  "Browser-based transcription",
  "Basic AI scoring after debate",
  "XP & leaderboard",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited debaters & judges",
  "Whisper AI transcription (higher accuracy)",
  "Whisper minute budget controls",
  "Premium room badge",
  "Priority support",
];

export function PricingPage() {
  const navigate    = useNavigate();
  const { user }    = useAuth();
  const { isPro, status, currentPeriodEnd, isLoading, error, openCheckout, cancelSubscription } = useSubscription();

  const isCancelled = status === "cancelled";

  const handleProClick = async () => {
    if (!user) { navigate("/login"); return; }
    await openCheckout();
  };

  return (
    <div
      className="bg-grid"
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}
    >
      {/* Ambient glow */}
      <div style={{ position: "fixed", top: "10%", left: "50%", transform: "translateX(-50%)", width: 600, height: 400, background: "radial-gradient(ellipse, rgba(79,142,247,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "2.5rem 1rem 4rem" }}>

        {/* Back */}
        <div style={{ width: "100%", maxWidth: 860, marginBottom: "1.5rem" }}>
          <button onClick={() => navigate(-1)} className="btn-ghost" style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem" }}>
            ← Back
          </button>
        </div>

        {/* Header */}
        <div className="fade-up" style={{ textAlign: "center", marginBottom: "3rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>⚡</div>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 900, margin: "0 0 0.6rem", color: "var(--text)", letterSpacing: "-0.02em" }}>
            Simple, honest pricing
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "1rem", margin: 0, maxWidth: 440 }}>
            Start free. Upgrade when you need more power.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ width: "100%", maxWidth: 860, marginBottom: "1.5rem", padding: "0.875rem 1.25rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "0.75rem", color: "#f43f5e", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        {/* Tier cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", width: "100%", maxWidth: 860 }}>

          {/* ── Free ── */}
          <div className="glass fade-up" style={{ padding: "2rem", borderRadius: "1.25rem", display: "flex", flexDirection: "column" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.5rem" }}>Free</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
                <span style={{ fontSize: "2.8rem", fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>₹0</span>
                <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>/ forever</span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.6rem", marginBottom: 0, lineHeight: 1.5 }}>
                Everything you need to host great debates.
              </p>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
              {FREE_FEATURES.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", fontSize: "0.875rem", color: "var(--subtle)" }}>
                  <span style={{ color: "var(--for)", flexShrink: 0, marginTop: "0.05rem" }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => navigate(user ? "/" : "/register")}
              className="btn-ghost"
              style={{ width: "100%", padding: "0.875rem" }}
            >
              {user ? "Current plan" : "Get started free"}
            </button>
          </div>

          {/* ── Pro ── */}
          <div
            className="glass fade-up"
            style={{
              padding: "2rem",
              borderRadius: "1.25rem",
              display: "flex",
              flexDirection: "column",
              border: "1.5px solid rgba(79,142,247,0.45)",
              background: "rgba(79,142,247,0.04)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Popular badge */}
            <div style={{ position: "absolute", top: 0, right: 0, background: "linear-gradient(135deg,#4f8ef7,#22d3ee)", color: "#fff", fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", padding: "0.3rem 0.875rem", borderBottomLeftRadius: "0.625rem" }}>
              POPULAR
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "0.5rem" }}>Pro</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
                <span style={{ fontSize: "2.8rem", fontWeight: 900, color: "var(--text)", lineHeight: 1 }}>₹50</span>
                <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>/ month</span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.6rem", marginBottom: 0, lineHeight: 1.5 }}>
                For serious debaters and communities.
              </p>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
              {PRO_FEATURES.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", fontSize: "0.875rem", color: "var(--subtle)" }}>
                  <span style={{ color: "var(--cyan)", flexShrink: 0, marginTop: "0.05rem" }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {/* ── Free user ── */}
            {!isPro && (
              <button
                onClick={handleProClick}
                disabled={isLoading}
                className="btn-primary"
                style={{ width: "100%", padding: "0.875rem", fontSize: "1rem", fontWeight: 800 }}
              >
                {isLoading ? "Opening checkout…" : "Upgrade to Pro →"}
              </button>
            )}

            {/* ── Active Pro ── */}
            {isPro && !isCancelled && (
              <>
                <p style={{ textAlign: "center", color: "var(--for)", fontSize: "0.875rem", marginBottom: "0.75rem", fontWeight: 700 }}>
                  ✓ You're on Pro
                </p>
                <button
                  onClick={() => cancelSubscription()}
                  disabled={isLoading}
                  className="btn-ghost"
                  style={{ width: "100%", padding: "0.75rem", fontSize: "0.85rem", color: "var(--muted)" }}
                >
                  {isLoading ? "Cancelling…" : "Cancel subscription"}
                </button>
                <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.72rem", marginTop: "0.5rem", marginBottom: 0, lineHeight: 1.5 }}>
                  Access continues until the end of your current billing period.
                </p>
              </>
            )}

            {/* ── Cancelled but still within paid period ── */}
            {isPro && isCancelled && (
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "#f59e0b", fontSize: "0.875rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                  ⏳ Cancellation scheduled
                </p>
                <p style={{ color: "var(--muted)", fontSize: "0.78rem", lineHeight: 1.6, marginBottom: "0.75rem" }}>
                  You still have Pro access
                  {currentPeriodEnd
                    ? ` until ${currentPeriodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`
                    : " until the end of your billing period."}
                </p>
                <button
                  onClick={handleProClick}
                  disabled={isLoading}
                  className="btn-ghost"
                  style={{ width: "100%", padding: "0.75rem", fontSize: "0.85rem" }}
                >
                  {isLoading ? "Opening checkout…" : "Re-subscribe →"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fine print */}
        <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "2.5rem", textAlign: "center", maxWidth: 500, lineHeight: 1.6 }}>
          Payments are processed securely by Razorpay. Cancel any time — your Pro access continues until the end of the current billing period.
        </p>
      </main>
    </div>
  );
}
