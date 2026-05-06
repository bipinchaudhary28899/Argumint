import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { LoginInput } from "@argumint/shared";

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isLoading } = useAuth();
  const [formData, setFormData] = useState<LoginInput>({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const evicted = searchParams.get("reason") === "evicted";
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: "" }));
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
    if (!validateForm()) return;
    try {
      await login(formData);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "var(--bg)" }}>
      <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", width: 600, height: 300, background: "radial-gradient(ellipse, rgba(79,142,247,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div className="fade-up w-full" style={{ maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <div style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #22d3ee, #4f8ef7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1 }}>ARGUMINT</div>
          <div style={{ marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.8rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>Debate Arena</div>
        </div>
        <div className="glass" style={{ padding: "2.25rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", margin: "0 0 0.35rem" }}>Welcome back</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", margin: "0 0 1.75rem" }}>Sign in to your arena account</p>
          {evicted && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.3)", borderRadius: "0.625rem", color: "var(--gold)", fontSize: "0.875rem", marginBottom: "1.25rem", fontWeight: 500 }}>
              ⚠ You were signed out because your account logged in on another device.
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
              <input name="password" type="password" autoComplete="current-password" className="input-dark" placeholder="••••••••" value={formData.password} onChange={handleChange} style={fieldErrors.password ? { borderColor: "var(--against)" } : {}} />
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
