import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { RoomProvider } from "./contexts/RoomContext";
import { ThemeProvider } from "./contexts/ThemeContext";

/** Watches auth state and stamps data-tier="pro" on <html> for CSS cascade. */
function ProTierSync() {
  const { user } = useAuth();
  useEffect(() => {
    const isPro = (user as any)?.isPro ?? false;
    if (isPro) {
      document.documentElement.setAttribute("data-tier", "pro");
    } else {
      document.documentElement.removeAttribute("data-tier");
    }
  }, [user]);
  return null;
}
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Home } from "./pages/Home";
import { CreateRoom } from "./pages/CreateRoom";
import { JoinRoom } from "./pages/JoinRoom";
import { RoomLobby } from "./pages/RoomLobby";
import { PrepScreen } from "./pages/PrepScreen";
import { DebatePage } from "./pages/DebatePage";
import { ResultPage } from "./pages/ResultPage";
import { PricingPage } from "./pages/PricingPage";
import { SubscriptionSuccess } from "./pages/SubscriptionSuccess";
import { SubscriptionCancel } from "./pages/SubscriptionCancel";
import { LevelRewards } from "./pages/LevelRewards";

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <ProTierSync />
      <RoomProvider>
        <Routes>
          <Route path="/login" element={<ProtectedRoute guestOnly><Login /></ProtectedRoute>} />
          <Route path="/register" element={<ProtectedRoute guestOnly><Register /></ProtectedRoute>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create-room"
            element={
              <ProtectedRoute>
                <CreateRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join-room"
            element={
              <ProtectedRoute>
                <JoinRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/room/:code/lobby"
            element={
              <ProtectedRoute>
                <RoomLobby />
              </ProtectedRoute>
            }
          />
          <Route
            path="/room/:code/prep/:debateId"
            element={
              <ProtectedRoute>
                <PrepScreen />
              </ProtectedRoute>
            }
          />
          <Route
            path="/room/:code/debate/:debateId"
            element={
              <ProtectedRoute>
                <DebatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/room/:code/result/:debateId"
            element={
              <ProtectedRoute>
                <ResultPage />
              </ProtectedRoute>
            }
          />

          {/* ── Payments ── */}
          {/* Pricing is public — guests can view it and are redirected to login */}
          <Route path="/pricing" element={<PricingPage />} />
          {/* Razorpay return URLs — auth required */}
          <Route
            path="/subscription/success"
            element={
              <ProtectedRoute>
                <SubscriptionSuccess />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscription/cancel"
            element={
              <ProtectedRoute>
                <SubscriptionCancel />
              </ProtectedRoute>
            }
          />

          {/* ── Level rewards ── */}
          <Route
            path="/level-rewards"
            element={
              <ProtectedRoute>
                <LevelRewards />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RoomProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
