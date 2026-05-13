/**
 * ConnectionStatusBanner
 *
 * A non-intrusive overlay banner that appears whenever the Socket.IO
 * connection is lost and disappears once it's restored.  It handles
 * three visual states:
 *
 *   • Reconnecting — animated pulse dots, orange background
 *   • Reconnect failed — red background, offers a manual reload
 *   • Connected (default) — renders nothing
 *
 * Usage: mount it at the top of any room page that receives `isConnected`
 * and `isReconnecting` from `useSocket()`.
 */
import { useEffect, useState } from "react";

interface Props {
  isConnected: boolean;
  isReconnecting: boolean;
}

export function ConnectionStatusBanner({ isConnected, isReconnecting }: Props) {
  // Track whether we've *ever* been connected so we don't flash the banner
  // during the initial cold-connect (which is not a "reconnect" event).
  const [wasConnected, setWasConnected] = useState(false);
  const [showFailed, setShowFailed] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setWasConnected(true);
      setShowFailed(false);
    }
  }, [isConnected]);

  // Show failed state if we were previously connected, are not reconnecting,
  // and are still disconnected (Socket.IO gave up after max attempts).
  useEffect(() => {
    if (wasConnected && !isConnected && !isReconnecting) {
      const t = setTimeout(() => setShowFailed(true), 1500);
      return () => clearTimeout(t);
    }
  }, [wasConnected, isConnected, isReconnecting]);

  // Nothing to show while connected
  if (isConnected && !isReconnecting) return null;
  // Don't flash during the very first connect
  if (!wasConnected && !isReconnecting) return null;

  if (showFailed) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#dc2626",
          color: "#fff",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          fontSize: "14px",
          fontWeight: 500,
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <span>⚠️ Connection lost</span>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "rgba(255,255,255,0.2)",
            border: "1px solid rgba(255,255,255,0.4)",
            color: "#fff",
            borderRadius: "4px",
            padding: "4px 12px",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Reload page
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#d97706",
        color: "#fff",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        fontSize: "14px",
        fontWeight: 500,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <PulseDots />
      <span>Reconnecting…</span>
    </div>
  );
}

/** Three animated pulsing dots */
function PulseDots() {
  return (
    <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.9)",
            display: "inline-block",
            animation: `argumint-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes argumint-pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1.2); }
        }
      `}</style>
    </span>
  );
}
