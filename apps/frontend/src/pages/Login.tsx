import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authApi } from "../services/api";
import type { LoginInput } from "@argumint/shared";

export function Login() {
  const navigate = useNavigate();
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

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "2rem 1rem", background: "var(--bg)" }}>
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 300, background: "radial-gradient(ellipse, rgba(79,142,247,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
<div className="fade-up w-full" style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <img src="/logo/logo.png" alt="Argumint" style={{ width: 96, height: 96, borderRadius: "1.25rem", objectFit: "contain", display: "block", margin: "0 auto" }} />
          <div style={{ marginTop: "0.75rem", color: "var(--muted)", fontSize: "0.8rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>Debate Arena</div>
        </div>
        <div className="glass" style={{ padding: "2.25rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", margin: "0 0 0.35rem" }}>Welcome back</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", margin: "0 0 1.75rem" }}>Sign in to your arena account</p>
          {evicted && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.3)", borderRadius: "0.625rem", color: "var(--gold)", fontSize: "0.875rem", marginBottom: "1.25rem", fontWeight: 500 }}>
              {reason === "session_expired"
                ? "⚠ Your session expired. Please sign in again to continue."
                : "⚠ You were signed out because your account logged in on another device."}
            </div>
          )}
          {activeSessionConflict && (
            <div style={{ padding: "0.875rem 1rem", background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.4)", borderRadius: "0.625rem", marginBottom: "1.25rem" }}>
              <p style={{ color: "var(--gold)", fontSize: "0.875rem", fontWeight: 600, margin: "0 0 0.625rem" }}>
                ⚠ You're already signed in on another device.
              </p>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
                Signing in here will end that other session immediately.
              </p>
              <button
                type="button"
                onClick={handleForceLogin}
                disabled={forceLoading}
                className="btn-primary"
                style={{ width: "100%", padding: "0.625rem", fontSize: "0.875rem" }}
              >
                {forceLoading ? "Signing in…" : "Sign in here →"}
              </button>
            </div>
          )}
          {error && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "0.625rem", color: "#f43f5e", fontSize: "0.875rem", marginBottom: "1.25rem", fontWeight: 500 }}>{error}</div>
          )}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label className="label">Email</label>
              <input name="email" type="email" autoComplete="email" className="input-dark" placeholder="you@example.com" value={formData.email} onChange={handleChange} style={fieldErrors.email ? { borderColor: "var(--against)" } : {}} />
              {fieldErrors.email && <p style={{ color: "var(--against)", fontSize: "0.75rem", marginTop: "0.3rem" }}>{fieldErrors.email}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <div style={{ position: "relative" }}>
                <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="input-dark" placeholder="••••••••" value={formData.password} onChange={handleChange} style={{ ...(fieldErrors.password ? { borderColor: "var(--against)" } : {}), paddingRight: "2.5rem" }} />
                <button type="button" onClick={() => setShowPassword(p => !p)} tabIndex={-1} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--muted)", display: "flex", alignItems: "center" }}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && <p style={{ color: "var(--against)", fontSize: "0.75rem", marginTop: "0.3rem" }}>{fieldErrors.password}</p>}
            </div>
            <button type="submit" className="btn-primary" disabled={isLoading} style={{ width: "100%", marginTop: "0.5rem", padding: "0.875rem", fontSize: "1rem" }}>
              {isLoading ? "Signing in…" : "Enter the Arena →"}
            </button>
          </form>
          <div className="divider" />
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
            No account?{" "}
            <Link to="/register" style={{ color: "var(--cyan)", fontWeight: 700, textDecoration: "none" }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
