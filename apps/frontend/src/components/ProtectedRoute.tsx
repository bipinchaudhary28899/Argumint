import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If true, redirect authenticated users away (used on login/register pages) */
  guestOnly?: boolean;
}

export function ProtectedRoute({ children, guestOnly = false }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  // Only block rendering on the very first load (no user in state yet).
  // If we already have a user (seeded from localStorage cache), keep showing
  // the page while auth re-validates in the background — avoids a full-screen
  // spinner flash on every tab-focus or 60s poll.
  if (isLoading && !user) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <img
          src="/logo/logo.png"
          alt="Loading…"
          className="logo-heartbeat"
          style={{ width: 72, height: 72 }}
        />
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
