import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { BrandLogo } from "../components/BrandLogo";
import { Icon, type IconName } from "../components/Icon";
import type { RegisterInput } from "@argumint/shared";

// Eye-with-slash glyph for the "password visible" state (no Icon equivalent)
const EyeOff = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);

// Product facts shown in the desktop hero (modes, judge rubric, level ladder)
const FEATURES: { icon: IconName; title: string; copy: string }[] = [
  { icon: "users", title: "Two modes",    copy: "Ordered turns, or grab-the-mic Buzzer." },
  { icon: "scale", title: "Fair scoring", copy: "AI judge on four axes, 0–100 per speaker." },
  { icon: "star",  title: "Climb tiers",  copy: "Novice to Grand Master, plus a judge score." },
];

export function Register() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { register, isLoading } = useAuth();
  const [formData, setFormData] = useState<RegisterInput>({ username: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPwd, setShowPwd] = useState<Record<string, boolean>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.username) errors.username = "Username is required";
    else if (formData.username.length < 3 || formData.username.length > 30) errors.username = "3–30 characters";
    if (!formData.email) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = "Invalid email";
    if (!formData.password) errors.password = "Password is required";
    else if (formData.password.length < 8) errors.password = "At least 8 characters";
    else if (!/[A-Z]/.test(formData.password)) errors.password = "Needs an uppercase letter";
    else if (!/[0-9]/.test(formData.password)) errors.password = "Needs a number";
    if (formData.password !== formData.confirmPassword) errors.confirmPassword = "Passwords don't match";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!validateForm()) return;
    try {
      const { confirmPassword, ...data } = formData;
      await register(data);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  const fields = [
    { name: "username", label: "Username", type: "text", placeholder: "Pick a callsign", autoComplete: "username" },
    { name: "email", label: "Email", type: "email", placeholder: "you@example.com", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", placeholder: "Create a password", autoComplete: "new-password",
      hint: "At least 8 characters, with an uppercase letter and a number." },
    { name: "confirmPassword", label: "Confirm Password", type: "password", placeholder: "Repeat password", autoComplete: "new-password" },
  ] as const;

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <BrandLogo height={32} />
          <button type="button" onClick={() => navigate("/")} className="ds-btn ds-btn-ghost ds-btn-sm">
            <Icon name="left" size={16} /> Back
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 32 : "clamp(40px, 4.2vw, 60px)", lineHeight: 1.04, letterSpacing: "-0.03em", maxWidth: 620, textWrap: "balance" } as React.CSSProperties}>
            Start as a Novice. Leave a <span style={{ color: "var(--ds-accent)" }}>Grand Master.</span>
          </h1>
          <p style={{ margin: 0, fontSize: isMobile ? 16 : 18, lineHeight: 1.55, color: "var(--ds-muted)", maxWidth: 480 }}>
            Every debate earns XP. Ten tiers stand between your first argument and the top of the ladder.
          </p>
        </div>
        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, maxWidth: 640 }}>
            {FEATURES.map(f => (
              <div key={f.title} className="ds-card" style={{ padding: 18, borderRadius: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ color: "var(--ds-accent)", display: "inline-flex" }}><Icon name={f.icon} size={22} /></span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{f.title}</span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ds-muted)" }}>{f.copy}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Form card ── */}
      <section style={{
        flex: isMobile ? "1 1 auto" : "1 1 0", minWidth: 0, boxSizing: "border-box",
        padding: isMobile ? "12px 20px 32px" : "56px clamp(24px, 4vw, 56px)",
        display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center",
      }}>
        <form onSubmit={handleSubmit} className="ds-card fade-up" style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", padding: isMobile ? "24px 20px" : 36, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 style={{ margin: 0, fontWeight: 800, fontSize: 26, letterSpacing: "-0.02em" }}>Create your account</h2>
            <p className="ds-sub">Pick a name other debaters will see.</p>
          </div>

          {error && (
            <div role="alert" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--ds-against-bg)", border: "1px solid var(--ds-against-line)", color: "var(--ds-against-text)", fontSize: 14, fontWeight: 600 }}>{error}</div>
          )}

          {fields.map((field) => {
            const { name, label, type, placeholder, autoComplete } = field;
            const hint       = "hint" in field ? field.hint : undefined;
            const isPassword = type === "password";
            const visible    = showPwd[name] ?? false;
            const fieldError = fieldErrors[name];
            const id         = `reg-${name}`;
            const describedBy = fieldError ? `${id}-error` : hint ? `${id}-hint` : undefined;
            return (
              <div key={name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor={id} className="ds-label">{label}</label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <input
                    id={id} name={name} type={isPassword ? (visible ? "text" : "password") : type}
                    autoComplete={autoComplete} className="ds-input" placeholder={placeholder}
                    value={formData[name] ?? ""} onChange={handleChange}
                    aria-invalid={!!fieldError} aria-describedby={describedBy}
                    style={{ ...(fieldError ? { borderColor: "var(--ds-against-mid)" } : {}), ...(isPassword ? { paddingRight: 52 } : {}) }}
                  />
                  {isPassword && (
                    <button
                      type="button" tabIndex={-1}
                      onClick={() => setShowPwd(p => ({ ...p, [name]: !p[name] }))}
                      aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible}
                      style={{ position: "absolute", right: 4, width: 44, height: 44, border: 0, borderRadius: 10, background: "transparent", color: "var(--ds-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                    >
                      {visible ? EyeOff : <Icon name="eye" size={18} />}
                    </button>
                  )}
                </div>
                {fieldError
                  ? <p id={`${id}-error`} style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--ds-against-text)" }}>{fieldError}</p>
                  : hint && <span id={`${id}-hint`} style={{ fontSize: 12, color: "var(--ds-muted)" }}>{hint}</span>}
              </div>
            );
          })}

          <button type="submit" className="ds-btn ds-btn-primary ds-btn-block" disabled={isLoading} style={{ height: 54, fontSize: 16 }}>
            {isLoading ? "Creating account…" : <>Create account <Icon name="right" size={18} /></>}
          </button>

          <p style={{ margin: 0, textAlign: "center", fontSize: 14, color: "var(--ds-muted)" }}>
            Already debating? <Link to="/login" className="ds-link">Log in</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
