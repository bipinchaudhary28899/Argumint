import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If true, redirect authenticated users away (used on login/register pages) */
  guestOnly?: boolean;
}

export function ProtectedRoute({ children, guestOnly = false }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spin" style={{ width: 40, height: 40, border: "3px solid var(--border2)", borderTopColor: "var(--cyan)", borderRadius: "50%", margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Loading…</p>
        </div>
      </div>
    );
  }

  // Guest-only pages (login, register): kick logged-in users to home
  if (guestOnly && user) {
    return <Navigate to="/" replace />;
  }

  // Protected pages: kick unauthenticated users to login
  if (!guestOnly && !user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
