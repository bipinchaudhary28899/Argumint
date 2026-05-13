// useSocket.ts
import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

type ReconnectListener = () => void;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Listeners registered by room pages via onReconnect()
  const reconnectListenersRef = useRef<Set<ReconnectListener>>(new Set());

  /**
   * Register a callback that fires every time the socket successfully
   * reconnects. Returns an unsubscribe function so callers can clean up.
   */
  const onReconnect = useCallback((fn: ReconnectListener) => {
    reconnectListenersRef.current.add(fn);
    return () => reconnectListenersRef.current.delete(fn);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const newSocket = io(SOCKET_URL, {
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      auth: { token },
    });

    newSocket.on("connect", () => {
      setIsConnected(true);
      setIsReconnecting(false);
    });

    newSocket.on("disconnect", () => {
      setIsConnected(false);
    });

    // Fires on each individual retry attempt
    newSocket.on("reconnect_attempt", (attempt: number) => {
      console.info(`[Socket] reconnect attempt #${attempt}`);
      setIsReconnecting(true);
    });

    // Fires when the connection is fully restored after a drop
    newSocket.on("reconnect", (attempt: number) => {
      console.info(`[Socket] reconnected after ${attempt} attempt(s)`);
      setIsConnected(true);
      setIsReconnecting(false);
      // Notify all room-page listeners so they can re-join channels
      reconnectListenersRef.current.forEach((fn) => fn());
    });

    newSocket.on("reconnect_failed", () => {
      console.error("[Socket] reconnect_failed — giving up after max attempts");
      setIsReconnecting(false);
    });

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

  return { socket, isConnected, isReconnecting, onReconnect };
}