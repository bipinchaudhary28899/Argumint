import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const token = localStorage.getItem("token");
    
    console.log("[v0] Initializing socket with token:", token ? "present" : "missing");

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      auth: {
        token: token,
      },
    });

    socket.on("connect", () => {
      console.log("[v0] Socket connected:", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("[v0] Socket disconnected");
      setIsConnected(false);
    });

    socket.on("error", (error) => {
      console.error("[v0] Socket error:", error);
    });

    socket.on("connect_error", (error) => {
      console.error("[v0] Socket connection error:", error);
    });

    socketRef.current = socket;

    return () => {
      console.log("[v0] Disconnecting socket");
      socket.disconnect();
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
  };
}
