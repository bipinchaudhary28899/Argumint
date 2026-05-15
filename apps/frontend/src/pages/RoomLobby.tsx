import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { InAppBrowserGate } from "../components/InAppBrowserGate";
import { ConnectionStatusBanner } from "../components/ConnectionStatusBanner";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { useSocket } from "../hooks/useSocket";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
import { useReconnectHandler } from "../hooks/useReconnectHandler";
import { useIsMobile } from "../hooks/useIsMobile";
import { roomApi } from "../services/api";
import { VotingPanel } from "../components/VotingPanel";

type ParticipantRole = "moderator" | "participant" | "judge" | "spectator";

const ROLE_BADGE: Record<ParticipantRole, { label: string; color: string; bg: string }> = {
  moderator:   { label: "HOST",      color: "#f59e0b", bg: "rgba(245,158,11,0.15)"  },
  participant: { label: "DEBATER",   color: "#4f8ef7", bg: "rgba(79,142,247,0.12)"  },
  judge:       { label: "JUDGE",     color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
  spectator:   { label: "SPECTATOR", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

const ROLE_OPTIONS: { role: ParticipantRole; label: string }[] = [
  { role: "participant", label: "Debater"   },
  { role: "judge",       label: "Judge"     },
  { role: "spectator",   label: "Spectator" },
];

/**
 * Compute how many slots remain for a role, excluding a specific participant
 * (the one whose role we're about to change) so we don't double-count them.
 *
 * Returns { available: boolean; slotsLeft: number; reason: string | null }
 *   available  – false = option should be hidden / disabled
 *   slotsLeft  – how many seats can still be filled
 *   reason     – short string explaining why it's unavailable (for tooltip/label)
 */
function roleAvailability(
  role: ParticipantRole,
  participants: { userId: string; role?: string; status: string }[],
  excludeUserId: string,
  maxJudges: number,
  maxSpectators: number,
  maxParticipants: number,
): { available: boolean; slotsLeft: number; reason: string | null } {
  const active = participants.filter(
    (p) => p.status !== "disconnected" && p.userId !== excludeUserId,
  );

  if (role === "participant") {
    const used = active.filter((p) => p.role === "participant" || p.role === "moderator").length;
    const slotsLeft = Math.max(0, maxParticipants - used);
    return slotsLeft > 0
      ? { available: true, slotsLeft, reason: null }
      : { available: false, slotsLeft: 0, reason: "Debater slots full" };
  }

  if (role === "judge") {
    if (maxJudges === 0) return { available: false, slotsLeft: 0, reason: "Judges disabled" };
    const used = active.filter((p) => p.role === "judge").length;
    const slotsLeft = Math.max(0, maxJudges - used);
    return slotsLeft > 0
      ? { available: true, slotsLeft, reason: null }
      : { available: false, slotsLeft: 0, reason: `Judge slots full (max ${maxJudges})` };
  }

  if (role === "spectator") {
    if (maxSpectators === 0) return { available: false, slotsLeft: 0, reason: "Spectators disabled" };
    const used = active.filter((p) => p.role === "spectator").length;
    const slotsLeft = Math.max(0, maxSpectators - used);
    return slotsLeft > 0
      ? { available: true, slotsLeft, reason: null }
      : { available: false, slotsLeft: 0, reason: `Spectator slots full (max ${maxSpectators})` };
  }

  return { available: false, slotsLeft: 0, reason: "Unknown role" };
}

export function RoomLobby() {
  const { code }             = useParams<{ code: string }>();
  const [searchParams]       = useSearchParams();
  const navigate             = useNavigate();
  const isMobile             = useIsMobile();
  const { user }             = useAuth();
  const { room, setRoom, setError } = useRoom();
  const { socket, isConnected, isReconnecting, onReconnect } = useSocket();
  const [isLoading, setIsLoading]  = useState(!room);
  const [copied, setCopied]        = useState(false);
  const [roleMenuFor, setRoleMenuFor] = useState<string | null>(null); // userId whose role menu is open

  useLeaveRoomOnNavigate(code, room?._id, socket);

  // Keep a stable ref to the latest join params so the reconnect closure
  // always uses the current values without re-registering the handler.
  const reconnectParamsRef = useRef({ socket, isConnected, code, user });
  useEffect(() => {
    reconnectParamsRef.current = { socket, isConnected, code, user };
  });

  useReconnectHandler({
    onReconnect,
    enabled: !!code,
    reconnectFn: () => {
      const { socket: s, code: c, user: u } = reconnectParamsRef.current;
      if (!s || !c) return;
      const role = sessionStorage.getItem("argumint_room_role") || searchParams.get("role") || "participant";
      s.emit("room:join", { roomCode: c, role }, (response: any) => {
        if (response?.success && response.room) {
          const mySlot = response.room.participants?.find((p: any) => p.userId === u?.id);
          if (mySlot?.role) sessionStorage.setItem("argumint_room_role", mySlot.role);
          setRoom(response.room);
        }
      });
    },
  });

  // ── Fetch room on first mount if context is empty (direct link / refresh) ─
  useEffect(() => {
    if (room) { setIsLoading(false); return; }
    if (!code) return;
    const fetchRoom = async () => {
      try {
        const fetched = await roomApi.getRoomByCode(code);
        setRoom(fetched);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch room");
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoom();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ── Subscribe this socket to the room channel ─────────────────────────────
  useEffect(() => {
    if (!socket || !isConnected || !code) return;
    // Pass desired role from URL query param (set by JoinRoom step 2)
    const desiredRole = searchParams.get("role") || "participant";
    socket.emit("room:join", { roomCode: code, role: desiredRole }, (response: any) => {
      if (response?.success && response.room) {
        // Persist the user's confirmed role so DebatePage can read it
        const mySlot = response.room.participants?.find((p: any) => p.userId === user?.id);
        if (mySlot?.role) sessionStorage.setItem("argumint_room_role", mySlot.role);
        setRoom(response.room);
      } else if (!response?.success) {
        setError(response?.error || "Failed to join room");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isConnected, code]);

  // ── Real-time socket events ───────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onParticipantJoined = (data: any) => {
      if (data.participants) setRoom((prev) => prev ? { ...prev, participants: data.participants } : prev);
    };
    const onParticipantLeft = (data: any) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants:    data.participants   ?? prev.participants,
          creatorId:       data.creatorId      ?? prev.creatorId,
          creatorUsername: data.creatorUsername ?? prev.creatorUsername,
        };
      });
    };
    const onParticipantStatusUpdated = (data: any) => {
      if (data.participants) setRoom((prev) => prev ? { ...prev, participants: data.participants } : prev);
    };
    const onParticipantDisconnected = (data: any) => {
      if (data.participants) setRoom((prev) => prev ? { ...prev, participants: data.participants } : prev);
    };
    const onVotingStarted = (data: any) => {
      setRoom((prev) => prev ? { ...prev, status: data.status ?? prev.status, votingTopics: data.votingTopics ?? prev.votingTopics } : prev);
    };
    const onVotingEnded = (data: any) => {
      setRoom((prev) => prev ? { ...prev, topic: data.topic ?? prev.topic, status: data.status ?? prev.status, votingTopics: data.votingTopics ?? prev.votingTopics } : prev);
    };
    const onDebateStarted = (data: any) => {
      if (data?.roomCode && data?.debateId) {
        navigate(`/room/${data.roomCode}/prep/${data.debateId}`);
      }
    };
    const onRoleChanged = (data: any) => {
      if (data.participants) {
        setRoom((prev) => prev ? { ...prev, participants: data.participants } : prev);
        // If the host changed OUR role, persist it to sessionStorage so
        // DebatePage picks up the correct role after the debate starts.
        const myUpdated = data.participants?.find((p: any) => p.userId === user?.id);
        if (myUpdated?.role) sessionStorage.setItem("argumint_room_role", myUpdated.role);
      }
    };
    const onHostTransferred = (data: any) => {
      setRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          creatorId:       data.newHostId       ?? prev.creatorId,
          creatorUsername: data.newHostUsername  ?? prev.creatorUsername,
          participants:    data.participants     ?? prev.participants,
        };
      });
    };

    socket.on("room:participant-joined",          onParticipantJoined);
    socket.on("room:participant-left",            onParticipantLeft);
    socket.on("room:participant-status-updated",  onParticipantStatusUpdated);
    socket.on("room:participant-disconnected",    onParticipantDisconnected);
    socket.on("room:voting-started",              onVotingStarted);
    socket.on("room:voting-ended",                onVotingEnded);
    socket.on("debate:started",                   onDebateStarted);
    socket.on("room:role-changed",                onRoleChanged);
    socket.on("room:host-transferred",            onHostTransferred);

    return () => {
      socket.off("room:participant-joined",         onParticipantJoined);
      socket.off("room:participant-left",           onParticipantLeft);
      socket.off("room:participant-status-updated", onParticipantStatusUpdated);
      socket.off("room:participant-disconnected",   onParticipantDisconnected);
      socket.off("room:voting-started",             onVotingStarted);
      socket.off("room:voting-ended",               onVotingEnded);
      socket.off("debate:started",                  onDebateStarted);
      socket.off("room:role-changed",               onRoleChanged);
      socket.off("room:host-transferred",           onHostTransferred);
    };
  }, [socket, navigate, setRoom]);

  const handleReady = () => {
    if (!room || !socket) return;
    socket.emit("room:update-status", { roomId: room._id, status: "ready" });
  };
  const handleUnready = () => {
    if (!room || !socket) return;
    socket.emit("room:update-status", { roomId: room._id, status: "joined" });
  };
  const handleStartDebate = () => {
    // Count only debating participants (participant + moderator roles)
    const debatingCount = participants.filter(
      (p) => p.role === "participant" || p.role === "moderator"
    ).length;
    if (!room || !socket || !isHost || !debatingReady || debatingCount < 2) return;
    socket.emit("room:start-debate", { roomId: room._id }, (response: any) => {
      if (!response?.success) setError(response?.error || "Failed to start debate");
    });
  };
  const handleLeave = () => {
    if (room && socket) socket.emit("room:leave", { roomId: room._id });
    navigate("/");
  };
  const handleCopy = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  const handleChangeRole = (targetUserId: string, newRole: ParticipantRole) => {
    if (!room || !socket) return;
    setRoleMenuFor(null);
    socket.emit("room:change-role", { roomId: room._id, targetUserId, newRole }, (res: any) => {
      if (!res?.success) setError(res?.error || "Failed to change role");
    });
  };
  const handleTransferHost = (targetUserId: string) => {
    if (!room || !socket) return;
    setRoleMenuFor(null);
    socket.emit("room:transfer-host", { roomId: room._id, targetUserId }, (res: any) => {
      if (!res?.success) setError(res?.error || "Failed to transfer host");
    });
  };

  if (isLoading) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <img src="/logo/logo.png" alt="Loading…" className="logo-heartbeat" style={{ width: 72, height: 72 }} />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div className="glass" style={{ padding: "2.5rem", textAlign: "center", maxWidth: 400 }}>
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>Room not found</p>
          <button onClick={() => navigate("/")} className="btn-primary">Back to Home</button>
        </div>
      </div>
    );
  }

  // Deduplicate by userId
  const participants = Array.from(
    room.participants.reduce((map, p) => {
      map.set(p.userId, p);
      return map;
    }, new Map<string, typeof room.participants[number]>()).values(),
  );

  const isCreator    = room.creatorId === user?.id;
  const currentUser  = participants.find((p) => p.userId === user?.id);
  const isHost       = isCreator || currentUser?.role === "moderator";
  const userReady    = currentUser?.status === "ready";
  const myRole       = (currentUser?.role ?? "participant") as ParticipantRole;
  const isDebater    = myRole === "participant" || myRole === "moderator";

  // Ready checks only consider debating participants
  const debatingParticipants = participants.filter((p) => p.role === "participant" || p.role === "moderator");
  const judgeParticipants    = participants.filter((p) => p.role === "judge");
  const spectatorParticipants = participants.filter((p) => p.role === "spectator");
  const debatingReady        = debatingParticipants.every((p) => p.status === "ready");
  const readyCount           = debatingParticipants.filter((p) => p.status === "ready").length;

  return (
    <InAppBrowserGate>
      <ConnectionStatusBanner isConnected={isConnected} isReconnecting={isReconnecting} />
      <div
        className="bg-grid"
        style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", overflow: "hidden" }}
        onClick={() => roleMenuFor && setRoleMenuFor(null)}
      >
        <main style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", padding: isMobile ? "0.75rem" : "0.875rem 1rem 0" }}>
          <div style={{ maxWidth: 1100, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1, minHeight: 0, gap: "0.875rem" }}>

            {/* Room code hero */}
            <div className="glass fade-up" style={{ flexShrink: 0, padding: isMobile ? "0.75rem 1rem" : "0.875rem 1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.625rem" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.15rem" }}>Room Code</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: isMobile ? "1.6rem" : "2.2rem", fontWeight: 800, letterSpacing: isMobile ? "0.12em" : "0.18em", color: "var(--cyan)" }}>{room.code}</div>
                </div>
                <button onClick={handleCopy} className="btn-ghost" style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem", flexShrink: 0 }}>
                  {copied ? "✓ Copied!" : "Copy"}
                </button>
              </div>
              <div style={{ display: "flex", gap: isMobile ? "1rem" : "1.5rem", flexWrap: "wrap" }}>
                {[
                  { label: "Debaters", value: `${readyCount}/${debatingParticipants.length} ready` },
                  { label: "Judges",   value: judgeParticipants.length.toString()    },
                  { label: "Watching", value: spectatorParticipants.length.toString() },
                  { label: "Mode",     value: room.debateMode     },
                  { label: "Turn",     value: `${room.turnDuration}s` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
                    <div style={{ fontWeight: 800, color: "var(--text)", fontSize: "0.88rem", textTransform: "capitalize" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: "0.875rem", paddingBottom: "0.875rem", flex: 1, minHeight: 0 }}>
              {/* Left column */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", minHeight: 0 }}>

                {/* Topic */}
                <div className="glass fade-up" style={{ padding: "1rem 1.5rem" }}>
                  <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "0.5rem" }}>Motion</div>
                  <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text)", margin: 0, lineHeight: 1.35 }}>
                    {room.topic || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Voting in progress…</span>}
                  </h1>
                  {room.description && (
                    <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.6rem", marginBottom: 0 }}>{room.description}</p>
                  )}
                </div>

                {/* Voting panel */}
                {room.votingEnabled && (
                  <div className="fade-up">
                    <VotingPanel
                      votingTopics={room.votingTopics}
                      votingDuration={room.votingDuration}
                      isHost={isHost}
                      roomId={room._id!}
                      socket={socket}
                    />
                  </div>
                )}

                {/* Players */}
                <div className="glass fade-up" style={{ padding: "1rem 1.5rem", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.875rem", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)" }}>
                      Players — {participants.length}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1, minHeight: 0, overflowY: "auto" }}>
                    {participants.map((p) => {
                      const isYou   = p.userId === user?.id;
                      const ready   = p.status === "ready";
                      const offline = p.status === "disconnected";
                      const pRole   = (p.role ?? "participant") as ParticipantRole;
                      const badge   = ROLE_BADGE[pRole];
                      const isDebating = pRole === "participant" || pRole === "moderator";
                      const menuOpen   = roleMenuFor === p.userId;

                      return (
                        <div
                          key={p.userId}
                          style={{
                            position: "relative",
                            display: "flex", alignItems: "center", gap: "0.875rem",
                            padding: "0.75rem 1rem", borderRadius: "0.625rem",
                            background: isYou ? "rgba(14,165,233,0.07)" : "var(--surface2)",
                            border: `1px solid ${ready && isDebating ? "rgba(16,185,129,0.5)" : isYou ? "rgba(34,211,238,0.2)" : "var(--border)"}`,
                            boxShadow: ready && isDebating ? "0 2px 8px rgba(16,185,129,0.12)" : "none",
                            opacity: offline ? 0.45 : 1,
                            transition: "all 0.2s",
                          }}
                        >
                          <div
                            className="avatar"
                            style={{
                              background: ready && isDebating ? "rgba(16,185,129,0.2)" : badge.bg,
                              color: ready && isDebating ? "#10b981" : badge.color,
                              border: `1px solid ${ready && isDebating ? "rgba(16,185,129,0.4)" : badge.color}30`,
                            }}
                          >
                            {p.username.charAt(0).toUpperCase()}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.9rem" }}>{p.username}</span>
                              {isYou && <span className="badge badge-cyan" style={{ fontSize: "0.6rem" }}>YOU</span>}
                              {/* Role badge */}
                              <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", padding: "0.15rem 0.45rem", borderRadius: 9999, background: badge.bg, color: badge.color, textTransform: "uppercase" }}>
                                {badge.label}
                              </span>
                            </div>
                          </div>

                          {/* Status indicator */}
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                            {offline ? (
                              <span className="badge badge-muted">Offline</span>
                            ) : !isDebating ? (
                              <span className="badge badge-muted" style={{ background: badge.bg, color: badge.color }}>Observing</span>
                            ) : ready ? (
                              <>
                                <div className="pulse-dot pulse-dot-green" />
                                <span className="badge badge-for">Ready</span>
                              </>
                            ) : (
                              <>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--border2)" }} />
                                <span className="badge badge-muted">Waiting</span>
                              </>
                            )}

                            {/* Host controls: role change + transfer */}
                            {isHost && !isYou && room.status === "lobby" && (
                              <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => setRoleMenuFor(menuOpen ? null : p.userId)}
                                  className="btn-ghost"
                                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", lineHeight: 1 }}
                                  title="Manage"
                                >
                                  ⋯
                                </button>

                                {menuOpen && (
                                  <div style={{
                                    position: "absolute", right: 0, top: "calc(100% + 4px)",
                                    background: "var(--surface)", border: "1px solid var(--border)",
                                    borderRadius: "0.625rem", zIndex: 50, minWidth: 200,
                                    boxShadow: "0 8px 32px rgba(0,0,0,0.35)", overflow: "hidden",
                                  }}>
                                    <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.65rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid var(--border)" }}>
                                      Change Role
                                    </div>
                                    {ROLE_OPTIONS.map(({ role: r, label }) => {
                                      // Check capacity before rendering each option
                                      const avail = roleAvailability(
                                        r,
                                        participants,
                                        p.userId,
                                        (room as any).maxJudges ?? 3,
                                        (room as any).maxSpectators ?? 50,
                                        room.maxParticipants,
                                      );
                                      const isCurrent = pRole === r;
                                      // Always show current role (to unblock manual re-assignment)
                                      // and always show "participant" (debater) as escape hatch.
                                      // Hide other options that are disabled/full.
                                      if (!avail.available && !isCurrent && r !== "participant") return null;

                                      return (
                                        <button
                                          key={r}
                                          onClick={() => avail.available && handleChangeRole(p.userId, r)}
                                          disabled={!avail.available && !isCurrent}
                                          title={avail.reason ?? undefined}
                                          style={{
                                            display: "flex", alignItems: "center", justifyContent: "space-between",
                                            width: "100%", textAlign: "left",
                                            padding: "0.55rem 0.75rem", fontSize: "0.83rem",
                                            background: isCurrent ? "rgba(16,185,129,0.1)" : "transparent",
                                            color: isCurrent ? "var(--for)" : (!avail.available ? "var(--muted)" : "var(--text)"),
                                            border: "none", cursor: avail.available ? "pointer" : "default",
                                            fontWeight: isCurrent ? 700 : 400,
                                            opacity: !avail.available && !isCurrent ? 0.5 : 1,
                                          }}
                                        >
                                          <span>{isCurrent ? "✓ " : "  "}{label}</span>
                                          {/* Show remaining slot count on available non-current options */}
                                          {!isCurrent && avail.available && r !== "participant" && (
                                            <span style={{ fontSize: "0.65rem", color: avail.slotsLeft <= 1 ? "var(--gold)" : "var(--muted)", marginLeft: "0.5rem" }}>
                                              {avail.slotsLeft} left
                                            </span>
                                          )}
                                          {!isCurrent && !avail.available && r !== "participant" && (
                                            <span style={{ fontSize: "0.6rem", color: "var(--against)", marginLeft: "0.5rem", fontWeight: 700 }}>
                                              {avail.reason}
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                    <div style={{ height: 1, background: "var(--border)", margin: "0.25rem 0" }} />
                                    <button
                                      onClick={() => handleTransferHost(p.userId)}
                                      style={{
                                        display: "block", width: "100%", textAlign: "left",
                                        padding: "0.55rem 0.75rem", fontSize: "0.83rem",
                                        background: "transparent", color: "#f59e0b",
                                        border: "none", cursor: "pointer",
                                      }}
                                    >
                                      👑 Make Host
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {participants.length === 0 && (
                      <p style={{ color: "var(--muted)", textAlign: "center", fontSize: "0.875rem", padding: "1rem" }}>
                        No players yet — share the code!
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right sidebar */}
              <div>
                <div className="glass fade-up" style={{ padding: "1.25rem" }}>
                  <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "1.25rem" }}>
                    {isHost ? "Host Controls" : "Your Status"}
                  </div>

                  {/* My role tag */}
                  <div style={{ marginBottom: "1rem", padding: "0.6rem 0.875rem", borderRadius: "0.625rem", background: ROLE_BADGE[myRole].bg, border: `1px solid ${ROLE_BADGE[myRole].color}30`, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Your role:</span>
                    <span style={{ fontWeight: 800, fontSize: "0.8rem", color: ROLE_BADGE[myRole].color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{ROLE_BADGE[myRole].label}</span>
                  </div>

                  {/* Non-host, debating participant: ready/unready */}
                  {!isHost && isDebater && (
                    <div style={{ marginBottom: "1rem" }}>
                      {!userReady ? (
                        <button onClick={handleReady} className="btn-for" style={{ width: "100%", marginBottom: "0.75rem" }}>✓ Ready Up</button>
                      ) : (
                        <button onClick={handleUnready} className="btn-danger" style={{ width: "100%", marginBottom: "0.75rem" }}>✕ Not Ready</button>
                      )}
                      <div style={{ padding: "0.75rem 1rem", background: "rgba(14,165,233,0.07)", border: "1px solid rgba(14,165,233,0.2)", borderRadius: "0.625rem" }}>
                        <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: 0, textAlign: "center" }}>
                          {debatingReady && debatingParticipants.length >= 2 ? "All ready — waiting for host…" : "Ready up to start the debate"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Observer status message */}
                  {!isHost && !isDebater && (
                    <div style={{ marginBottom: "1rem", padding: "0.875rem 1rem", background: ROLE_BADGE[myRole].bg, border: `1px solid ${ROLE_BADGE[myRole].color}30`, borderRadius: "0.625rem" }}>
                      <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: 0, textAlign: "center", lineHeight: 1.5 }}>
                        {myRole === "judge"
                          ? "You'll score the debaters after the debate ends."
                          : "You'll be able to listen to the debate live."}
                      </p>
                    </div>
                  )}

                  {isHost && (
                    <div style={{ marginBottom: "1rem" }}>
                      <button
                        onClick={handleStartDebate}
                        disabled={!debatingReady || debatingParticipants.length < 2}
                        className="btn-primary"
                        style={{ width: "100%", padding: "0.875rem", fontSize: "1rem", fontWeight: 800, marginBottom: "0.75rem" }}
                      >
                        {!isConnected ? "Connecting…" : "Start Debate →"}
                      </button>
                      {(!debatingReady || debatingParticipants.length < 2) && (
                        <div style={{ padding: "0.75rem 1rem", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "0.625rem" }}>
                          <p style={{ color: "var(--gold)", fontSize: "0.8rem", margin: 0, textAlign: "center" }}>
                            {debatingParticipants.length < 2
                              ? "Need at least 2 debaters"
                              : `${debatingParticipants.length - readyCount} debater(s) not ready`}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ marginBottom: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Debaters Ready</span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>{readyCount}/{debatingParticipants.length}</span>
                    </div>
                    <div className="score-bar-track">
                      <div className="score-bar-fill score-bar-fill-for"
                        style={{ width: debatingParticipants.length ? `${(readyCount / debatingParticipants.length) * 100}%` : "0%" }} />
                    </div>
                  </div>

                  <div className="divider" />

                  <button onClick={handleLeave} className="btn-ghost"
                    style={{ width: "100%", color: "var(--against)", borderColor: "rgba(244,63,94,0.3)" }}>
                    Leave Room
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </InAppBrowserGate>
  );
}
