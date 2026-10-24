import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSubscription } from "../payments/useSubscription";
import { AppShell } from "../components/AppShell";
import { BrandLogo, BrandSymbol } from "../components/BrandLogo";
import { Icon } from "../components/Icon";
import { useIsMobile } from "../hooks/useIsMobile";

const FREE_FEATURES = [
  "Ranked debates & XP leaderboard",
  "Create & join rooms — alternate mode",
  "Live transcription on desktop",
  "AI scoring after every debate",
  "Light, dark, and Glacier theme options",
  "Level-up surprises as you earn XP",
];

const PRO_FEATURES = [
  "Exclusive gold UI & profile badge",
  "Buzzer mode for fast-paced debates",
  "Judges & spectators in your room",
  "Detailed AI analysis of your performance",
  "Everything in Free",
];

// Only answers that hold for the product today (Pro is checked on the host when a room is created)
const FAQ = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from this page and Pro stays on until the end of the period you've paid for.",
  },
  {
    q: "Do my judges need Pro?",
    a: "No. Pro is tied to the host — judges and spectators join your room with a free account.",
  },
];

const card: React.CSSProperties = {
  borderRadius: 28,
  background: "var(--ds-panel)",
  boxShadow: "var(--ds-shadow)",
  display: "flex",
  flexDirection: "column",
  gap: 22,
  minWidth: 0,
};

const featureItem: React.CSSProperties = { display: "flex", gap: 10, fontSize: 15, lineHeight: 1.45 };

// Free-tier action styled as the board's outlined "Your current plan" block
const outlineAction: React.CSSProperties = {
  marginTop: "auto",
  height: 52,
  width: "100%",
  borderRadius: 14,
  border: "1px solid var(--ds-border2)",
  background: "transparent",
  color: "var(--ds-muted)",
  fontWeight: 700,
  fontSize: 15,
};

const goldAction: React.CSSProperties = {
  height: 56,
  width: "100%",
  borderRadius: 16,
  background: "linear-gradient(135deg, var(--gold-light), var(--gold))",
  color: "var(--charcoal)",
  boxShadow: "0 10px 24px rgba(var(--gold-rgb),0.3)",
  fontWeight: 800,
  fontSize: 16,
};

export function PricingPage() {
  const navigate    = useNavigate();
  const { user }    = useAuth();
  const isMobile    = useIsMobile();
  const { isPro, status, currentPeriodEnd, isLoading, error, openCheckout, cancelSubscription } = useSubscription();

  const isCancelled = status === "cancelled";

  const handleProClick = async () => {
    if (!user) { navigate("/login"); return; }
    await openCheckout();
  };

  const cardPad = isMobile ? "24px 20px" : 32;

  const content = (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: isMobile ? 24 : 36 }}>

      {/* Header */}
      <header style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <BrandSymbol size={isMobile ? 56 : 72} title="" />
        <span className="ds-chip ds-chip-gold" style={{ height: 30, padding: "0 12px", borderRadius: 999, border: "1px solid var(--ds-gold-line)", fontSize: 11, letterSpacing: "0.12em" }}>
          ARGUMINT PRO
        </span>
        <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 28 : 48, lineHeight: 1.05, letterSpacing: "-0.03em", textWrap: "balance", color: "var(--ds-text)" } as React.CSSProperties}>
          Put a real panel behind the verdict.
        </h1>
        <p style={{ margin: 0, maxWidth: 560, fontSize: isMobile ? 16 : 18, lineHeight: 1.55, color: "var(--ds-muted)" }}>
          Start free. Upgrade to seat human judges and spectators next to the AI.
        </p>
      </header>

      {/* Error banner */}
      {error && (
        <div role="alert" style={{ padding: "14px 18px", borderRadius: 16, background: "var(--ds-against-bg)", border: "1px solid var(--ds-against-line)", color: "var(--ds-against-text)", fontSize: 14, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {/* Tier cards */}
      <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 20, alignItems: "stretch" }}>

        {/* ── Free ── */}
        <article style={{ ...card, padding: cardPad, border: "1px solid var(--ds-border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 22, color: "var(--ds-text)" }}>Free</h2>
            <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 40, color: "var(--ds-text)" }}>₹0</span>
              <span style={{ fontSize: 14, color: "var(--ds-muted)" }}>forever</span>
            </span>
          </div>

          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {FREE_FEATURES.map((f) => (
              <li key={f} style={{ ...featureItem, color: "var(--ds-text2)" }}>
                <span style={{ color: "var(--ds-muted)", flexShrink: 0, paddingTop: 2 }}><Icon name="check" size={16} /></span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={() => { if (!isPro) navigate(user ? "/" : "/register"); }}
            disabled={isPro}
            className="ds-btn"
            style={{ ...outlineAction, ...(!user ? { color: "var(--ds-text)" } : {}), ...(isPro ? { opacity: 1 } : {}) }}
          >
            {!user ? "Get started free" : isPro ? "Included in Pro" : "Current plan"}
          </button>
        </article>

        {/* ── Pro ── */}
        <article style={{ ...card, padding: cardPad, border: "2px solid var(--ds-gold-line)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, fontWeight: 800, fontSize: 22, color: "var(--ds-gold-text)" }}>
                <Icon name="crown" size={24} />Pro
              </h2>
              {/* Popular marker — becomes the plan marker for Pro users */}
              <span className="ds-chip ds-chip-gold" style={{ letterSpacing: "0.1em", fontSize: 11 }}>
                {isPro ? "YOUR PLAN" : "POPULAR"}
              </span>
            </div>
            <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: isMobile ? 28 : 40, color: "var(--ds-text)" }}>₹50</span>
              <span style={{ fontSize: 14, color: "var(--ds-muted)" }}>/ month</span>
            </span>
          </div>

          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {PRO_FEATURES.map((f) => (
              <li key={f} style={{ ...featureItem, color: "var(--ds-text)" }}>
                <span style={{ color: "var(--ds-gold-mid)", flexShrink: 0, paddingTop: 2 }}><Icon name="check" size={16} /></span>
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {/* ── Free user ── */}
            {!isPro && (
              <>
                <button onClick={handleProClick} disabled={isLoading} className="ds-btn" style={goldAction}>
                  {isLoading ? "Opening checkout…" : <>Upgrade to Pro<Icon name="right" size={18} /></>}
                </button>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: "var(--ds-muted)", textAlign: "center" }}>
                  <Icon name="lock" size={13} />Secure checkout with Razorpay · renews monthly
                </span>
              </>
            )}

            {/* ── Active Pro ── */}
            {isPro && !isCancelled && (
              <>
                <p style={{ margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ds-for-text)", fontSize: 15, fontWeight: 700 }}>
                  <Icon name="check" size={16} />You're on Pro
                </p>
                <button
                  onClick={() => cancelSubscription()}
                  disabled={isLoading}
                  className="ds-btn ds-btn-ghost ds-btn-block"
                  style={{ height: 52, color: "var(--ds-muted)" }}
                >
                  {isLoading ? "Cancelling…" : "Cancel subscription"}
                </button>
                <p style={{ margin: 0, textAlign: "center", color: "var(--ds-muted)", fontSize: 12, lineHeight: 1.5 }}>
                  Access continues until the end of your current billing period.
                </p>
              </>
            )}

            {/* ── Cancelled but still within paid period ── */}
            {isPro && isCancelled && (
              <>
                <p style={{ margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ds-gold-text)", fontSize: 15, fontWeight: 700 }}>
                  <Icon name="timer" size={16} />Cancellation scheduled
                </p>
                <p style={{ margin: 0, textAlign: "center", color: "var(--ds-muted)", fontSize: 13, lineHeight: 1.6 }}>
                  You still have Pro access
                  {currentPeriodEnd
                    ? ` until ${currentPeriodEnd.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`
                    : " until the end of your billing period."}
                </p>
                <button onClick={handleProClick} disabled={isLoading} className="ds-btn" style={goldAction}>
                  {isLoading ? "Opening checkout…" : <>Re-subscribe<Icon name="right" size={18} /></>}
                </button>
              </>
            )}
          </div>
        </article>
      </section>

      {/* FAQ */}
      <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        {FAQ.map(({ q, a }) => (
          <div key={q} style={{ padding: 20, borderRadius: 20, background: "var(--ds-panel)", border: "1px solid var(--ds-border)", display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ds-text)" }}>{q}</h3>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--ds-muted)" }}>{a}</p>
          </div>
        ))}
      </section>

      {/* Fine print */}
      <p style={{ margin: "0 auto", color: "var(--ds-faint)", fontSize: 12, textAlign: "center", maxWidth: 500, lineHeight: 1.6 }}>
        Payments are processed securely by Razorpay. Cancel any time — your Pro access continues until the end of the current billing period.
      </p>
    </div>
  );

  // Signed-in users get the app shell; guests can't use its user card / logout
  if (user) return <AppShell active="pro">{content}</AppShell>;

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
        display: "flex", flexDirection: "column", gap: isMobile ? 24 : 40,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <BrandLogo height={isMobile ? 26 : 30} />
        <button onClick={() => navigate(-1)} className="ds-btn ds-btn-ghost ds-btn-sm">
          <Icon name="left" size={16} />Back
        </button>
      </div>
      {content}
    </div>
  );
}
