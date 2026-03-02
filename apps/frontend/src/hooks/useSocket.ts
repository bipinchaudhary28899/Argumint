import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Get token from localStorage
    const token = localStorage.getItem("token");
    
    console.log("[v0] Token check:", token ? "Token found" : "Token missing");

    // Only initialize socket if token exists
    if (!token) {
      console.log("[v0] No token available, waiting for authentication...");
      return;
    }

    console.log("[v0] Initializing socket connection with valid token");

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      auth: {
        token: token,
      },
    });

    socket.on("connect", () => {
      console.log("[v0] Socket connected successfully:", socket.id);
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
      console.error("[v0] Socket connect_error:", error);
    });

    socketRef.current = socket;

    return () => {
      console.log("[v0] Cleaning up socket connection");
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
  };
}
