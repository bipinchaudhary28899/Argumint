import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Home } from "./pages/Home";
import { HomePage } from "./pages/HomePage";
import { CreateRoomPage } from "./pages/CreateRoomPage";
import { JoinRoomPage } from "./pages/JoinRoomPage";
import { MyRoomsPage } from "./pages/MyRoomsPage";
import { LobbyPage } from "./pages/LobbyPage";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-room"
          element={
            <ProtectedRoute>
              <CreateRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/join-room"
          element={
            <ProtectedRoute>
              <JoinRoomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-rooms"
          element={
            <ProtectedRoute>
              <MyRoomsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/lobby/:roomId"
          element={
            <ProtectedRoute>
              <LobbyPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
