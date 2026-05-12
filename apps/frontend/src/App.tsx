import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { RoomProvider } from "./contexts/RoomContext";
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

function App() {
  return (
    <AuthProvider>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RoomProvider>
    </AuthProvider>
  );
}

export default App;
