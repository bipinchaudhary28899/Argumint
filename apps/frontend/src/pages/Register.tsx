import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { RegisterInput } from "@argumint/shared";

export function Register() {
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const [formData, setFormData] = useState<RegisterInput>({ username: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    { name: "password", label: "Password", type: "password", placeholder: "Min 8 chars, 1 uppercase, 1 number", autoComplete: "new-password" },
    { name: "confirmPassword", label: "Confirm Password", type: "password", placeholder: "Repeat password", autoComplete: "new-password" },
  ] as const;

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", overflow: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "2rem 1rem", background: "var(--bg)" }}>
      <div style={{ position: "fixed", top: "15%", left: "50%", transform: "translateX(-50%)", width: 600, height: 300, background: "radial-gradient(ellipse, rgba(16,185,129,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div className="fade-up w-full" style={{ maxWidth: 440, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "2.8rem", fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #22d3ee, #4f8ef7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1 }}>ARGUMINT</div>
          <div style={{ marginTop: "0.5rem", color: "var(--muted)", fontSize: "0.8rem", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>Create your account</div>
        </div>
        <div className="glass" style={{ padding: "2.25rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text)", margin: "0 0 0.35rem" }}>Join the arena</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.875rem", margin: "0 0 1.75rem" }}>Pick a callsign and start debating</p>
          {error && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: "0.625rem", color: "#f43f5e", fontSize: "0.875rem", marginBottom: "1.25rem", fontWeight: 500 }}>{error}</div>
          )}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
            {fields.map(({ name, label, type, placeholder, autoComplete }) => (
              <div key={name}>
                <label className="label">{label}</label>
                <input name={name} type={type} autoComplete={autoComplete} className="input-dark" placeholder={placeholder}
                  value={(formData as any)[name]} onChange={handleChange}
                  style={(fieldErrors as any)[name] ? { borderColor: "var(--against)" } : {}} />
                {(fieldErrors as any)[name] && <p style={{ color: "var(--against)", fontSize: "0.75rem", marginTop: "0.3rem" }}>{(fieldErrors as any)[name]}</p>}
              </div>
            ))}
            <button type="submit" className="btn-primary" disabled={isLoading} style={{ width: "100%", marginTop: "0.5rem", padding: "0.875rem", fontSize: "1rem" }}>
              {isLoading ? "Creating account…" : "Create Account →"}
            </button>
          </form>
          <div className="divider" />
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "var(--cyan)", fontWeight: 700, textDecoration: "none" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
