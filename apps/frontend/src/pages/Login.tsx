import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../services/api";
import { useIsMobile } from "../hooks/useIsMobile";
import { BrandLogo } from "../components/BrandLogo";
import { Icon } from "../components/Icon";
import type { LoginInput } from "@argumint/shared";

// Eye-with-slash glyph for the "password visible" state (no Icon equivalent)
const EyeOff = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);

const fieldErrorStyle: React.CSSProperties = { margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ds-against-text)" };

// Decorative FOR / AGAINST exchange shown in the desktop hero
function SpeechCard({ side, speaker, text }: { side: "for" | "against"; speaker: string; text: string }) {
  const isFor = side === "for";
  return (
    <div style={{
      alignSelf: isFor ? "flex-start" : "flex-end", maxWidth: 380, padding: "18px 20px",
      borderRadius: isFor ? "18px 18px 18px 6px" : "18px 18px 6px 18px",
      background: "var(--ds-panel)", border: `1px solid var(--ds-${side}-line)`, boxShadow: "var(--ds-shadow)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: `var(--ds-${side}-text)` }}>
        {isFor ? "FOR" : "AGAINST"} · {speaker}
      </span>
      <span style={{ fontSize: 16, lineHeight: 1.45, color: "var(--ds-text)" }}>{text}</span>
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const { login, checkAuth, isLoading } = useAuth();
  const [formData, setFormData] = useState<LoginInput>({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const reason  = searchParams.get("reason");
  const evicted = reason === "evicted" || reason === "session_expired";
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeSessionConflict, setActiveSessionConflict] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    if (activeSessionConflict) setActiveSessionConflict(false);
  };

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!formData.email) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = "Invalid email";
    if (!formData.password) errs.password = "Password is required";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setActiveSessionConflict(false);
    if (!validateForm()) return;
    try {
      await login(formData);
      navigate("/");
    } catch (err: any) {
      if (err?.response?.status === 409 && err?.response?.data?.error === "active_session") {
        setActiveSessionConflict(true);
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    }
  };

  const handleForceLogin = async () => {
    setForceLoading(true);
    setError(null);
    try {
      await authApi.login({ ...formData, force: true });
      await checkAuth();
      navigate("/");
    } catch (err: any) {
      setActiveSessionConflict(false);
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setForceLoading(false);
    }
  };

  const invalidBorder = (name: string) => (fieldErrors[name] ? { borderColor: "var(--ds-against-mid)" } : {});

  return (
    <div style={{
      minHeight: "100vh", boxSizing: "border-box", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: "stretch",
      backgroundColor: "var(--ds-bg)", backgroundImage: "radial-gradient(var(--ds-dots) 1px, transparent 1px)", backgroundSize: "24px 24px",
      color: "var(--ds-text)", fontFamily: "Outfit, 'Segoe UI', system-ui, sans-serif",
    }}>
      {/* ── Hero ── */}
      <section style={{
        flex: isMobile ? "0 0 auto" : "1.15 1 0", minWidth: 0, boxSizing: "border-box",
        padding: isMobile ? "28px 20px 12px" : "56px clamp(32px, 5vw, 72px)",
        display: "flex", flexDirection: "column", gap: isMobile ? 24 : 48, justifyContent: "space-between",
      }}>
        <BrandLogo height={32} />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 36 : "clamp(44px, 4.7vw, 68px)", lineHeight: 1.04, letterSpacing: "-0.03em", maxWidth: 620, textWrap: "balance" } as React.CSSProperties}>
            Make your case. <span style={{ color: "var(--ds-accent)" }}>Live.</span>
          </h1>
          <p style={{ margin: 0, fontSize: isMobile ? 16 : 18, lineHeight: 1.55, color: "var(--ds-muted)", maxWidth: 480 }}>
            Join a room, take a side, and argue it out loud. An AI judge scores every turn on clarity, evidence, rebuttal and organization.
          </p>
        </div>
        {!isMobile && (
          <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}>
            <SpeechCard side="for" speaker="MAYA" text="Group chats are where shy teens finally find their people." />
            <div style={{ alignSelf: "center", width: 52, height: 52, borderRadius: "50%", background: "var(--ds-primary-fill)", color: "var(--ds-on-primary)", boxShadow: "var(--ds-primary-shadow)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15 }}>VS</div>
            <SpeechCard side="against" speaker="ROHAN" text="Feeds built to never end aren't a community. They're a slot machine." />
          </div>
        )}
      </section>

      {/* ── Form card ── */}
      <section style={{
        flex: isMobile ? "1 1 auto" : "1 1 0", minWidth: 0, boxSizing: "border-box",
        padding: isMobile ? "12px 20px 32px" : "56px clamp(24px, 4vw, 56px)",
        display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center",
      }}>
        <form onSubmit={handleSubmit} className="ds-card fade-up" style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", padding: isMobile ? "24px 20px" : 36, display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em" }}>Welcome back</h2>
            <p className="ds-sub">Sign in to your arena account.</p>
          </div>

          {evicted && (
            <div role="status" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, background: "var(--ds-gold-bg)", border: "1px solid var(--ds-gold-line)", color: "var(--ds-gold-text)", fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
              <Icon name="info" size={18} style={{ marginTop: 1 }} />
              <span>
                {reason === "session_expired"
                  ? "Your session expired. Please sign in again to continue."
                  : "You were signed out because your account logged in on another device."}
              </span>
            </div>
          )}

          {activeSessionConflict && (
            <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px", borderRadius: 12, background: "var(--ds-gold-bg)", border: "1px solid var(--ds-gold-line)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: "var(--ds-gold-text)", display: "inline-flex", marginTop: 1 }}><Icon name="shield" size={18} /></span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <p style={{ margin: 0, color: "var(--ds-gold-text)", fontSize: 14, fontWeight: 700 }}>You're already signed in on another device.</p>
                  <p style={{ margin: 0, color: "var(--ds-text3)", fontSize: 13, lineHeight: 1.5 }}>Signing in here will end that other session immediately.</p>
                </div>
              </div>
              <button type="button" onClick={handleForceLogin} disabled={forceLoading} className="ds-btn ds-btn-primary ds-btn-sm ds-btn-block">
                {forceLoading ? "Signing in…" : <>Sign in here <Icon name="right" size={16} /></>}
              </button>
            </div>
          )}

          {error && (
            <div role="alert" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--ds-against-bg)", border: "1px solid var(--ds-against-line)", color: "var(--ds-against-text)", fontSize: 14, fontWeight: 600 }}>{error}</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="login-email" className="ds-label">Email</label>
            <input
              id="login-email" name="email" type="email" autoComplete="email" className="ds-input" placeholder="you@example.com"
              value={formData.email} onChange={handleChange} style={invalidBorder("email")}
              aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            />
            {fieldErrors.email && <p id="login-email-error" style={fieldErrorStyle}>{fieldErrors.email}</p>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="login-password" className="ds-label">Password</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="ds-input" placeholder="Your password"
                value={formData.password} onChange={handleChange} style={{ ...invalidBorder("password"), paddingRight: 52 }}
                aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              />
              <button
                type="button" tabIndex={-1} onClick={() => setShowPassword(p => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                style={{ position: "absolute", right: 4, width: 44, height: 44, border: 0, borderRadius: 10, background: "transparent", color: "var(--ds-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
              >
                {showPassword ? EyeOff : <Icon name="eye" size={18} />}
              </button>
            </div>
            {fieldErrors.password && <p id="login-password-error" style={fieldErrorStyle}>{fieldErrors.password}</p>}
          </div>

          <button type="submit" className="ds-btn ds-btn-primary ds-btn-block" disabled={isLoading} style={{ height: 54, fontSize: 16 }}>
            {isLoading ? "Signing in…" : <>Enter the arena <Icon name="right" size={18} /></>}
          </button>

          {/* Backend allows one session per account (409 active_session → force sign-in above) */}
          {!activeSessionConflict && (
            <div className="ds-raised" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12, color: "var(--ds-text3)", fontSize: 13, lineHeight: 1.5 }}>
              <span style={{ color: "var(--ds-accent)", display: "inline-flex", flexShrink: 0 }}><Icon name="shield" size={18} /></span>
              <span>One active session per account. If you're signed in elsewhere, we'll ask before signing that device out.</span>
            </div>
          )}

          <p style={{ margin: 0, textAlign: "center", fontSize: 14, color: "var(--ds-muted)" }}>
            No account? <Link to="/register" className="ds-link">Create one</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
