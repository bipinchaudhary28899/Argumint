// useSocket.ts
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const newSocket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      auth: { token },
    });

    newSocket.on("connect", () => setIsConnected(true));
    newSocket.on("disconnect", () => setIsConnected(false));
    newSocket.on("connect_error", (error) => {
      console.error("[Socket] connect_error:", error);
    });

    // Server evicts this socket when the user logs in on another device.
    // Clear local auth state and redirect to login with an explanation.
    newSocket.on("session:evicted", () => {
      localStorage.removeItem("token");
      localStorage.removeItem("argumint_user");
      // Hard-navigate so all React state is reset cleanly
      window.location.href = "/login?reason=evicted";
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return { socket, isConnected };
}