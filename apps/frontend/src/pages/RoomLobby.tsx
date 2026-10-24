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
import { RoomHeader, type RoomStatusTone } from "../components/RoomHeader";
import { Icon } from "../components/Icon";
import { initials } from "../components/AppShell";

type ParticipantRole = "moderator" | "participant" | "judge" | "spectator";

// Role tag colours. Judge keeps its existing purple; the rest map to theme tokens.
const ROLE_BADGE: Record<ParticipantRole, { label: string; color: string; bg: string }> = {
  moderator:   { label: "HOST",      color: "var(--ds-gold-text)",    bg: "var(--ds-gold-bg)"    },
  participant: { label: "DEBATER",   color: "var(--ds-accent)",       bg: "var(--ds-accent-soft)" },
  judge:       { label: "JUDGE",     color: "var(--ds-judge)",        bg: "rgba(var(--ds-judge-rgb),0.15)" },
  spectator:   { label: "SPECTATOR", color: "var(--ds-neutral-text)", bg: "var(--ds-neutral-bg)" },
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
  const [roleMenuFor, setRoleMenuFor] = useState<string | null>(null); // userId whose role menu is open
  const [transferOpen, setTransferOpen] = useState(false);               // host's "Transfer host" picker

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
    setTransferOpen(false);
    socket.emit("room:transfer-host", { roomId: room._id, targetUserId }, (res: any) => {
      if (!res?.success) setError(res?.error || "Failed to transfer host");
    });
  };


  // Full-screen centred shell for the loading / not-found states
  const centred = {
    minHeight: "100vh", boxSizing: "border-box", padding: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--ds-bg)", color: "var(--ds-text)",
  } as const;

  if (isLoading) {
    return (
      <div style={centred}>
        <img src="/logo/brand/argumint-app-icon-dark.svg" alt="Loading…" className="logo-heartbeat" style={{ width: 72, height: 72 }} />
      </div>
    );
  }

  if (!room) {
    return (
      <div style={centred}>
        <div className="ds-card" style={{ padding: 32, maxWidth: 400, width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
          <p className="ds-sub">Room not found</p>
          <button type="button" onClick={() => navigate("/")} className="ds-btn ds-btn-primary">Back to Home</button>
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
  type LobbyParticipant = typeof participants[number];

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
  const observerParticipants = [...judgeParticipants, ...spectatorParticipants];
  const debatingReady        = debatingParticipants.every((p) => p.status === "ready");
  const readyCount           = debatingParticipants.filter((p) => p.status === "ready").length;
  const allReady             = debatingReady && debatingParticipants.length >= 2;

  // "Open seat" placeholders up to the debater cap; collapse the tail into one tile for big rooms.
  const openSeats    = Math.max(0, room.maxParticipants - debatingParticipants.length);
  const seatTiles    = Math.min(openSeats, 6);
  const seatOverflow = openSeats - seatTiles;

  const transferTargets = participants.filter((p) => p.userId !== user?.id);

  const headerStatus: { label: string; tone: RoomStatusTone } =
    room.status === "voting" ? { label: "Topic vote",        tone: "accent"  }
    : allReady               ? { label: "Lobby · all ready", tone: "for"     }
    :                          { label: "Lobby · waiting",   tone: "neutral" };

  const settings = [
    { label: "Mode", value: room.debateMode },
    ...(room.debateMode === "alternate" ? [{ label: "Rounds", value: String(room.totalRounds ?? "—") }] : []),
    { label: "Turn", value: `${room.turnDuration}s` },
    { label: "Prep", value: `${room.prepDuration}s` },
    ...(room.votingEnabled ? [{ label: "Vote", value: `${room.votingDuration}s` }] : []),
  ];

  const pad = isMobile ? 14 : 20;
  const panel: React.CSSProperties = {
    padding: pad, borderRadius: 20, background: "var(--ds-panel)", border: "1px solid var(--ds-border)",
    boxShadow: "var(--ds-shadow)", display: "flex", flexDirection: "column", gap: 14, boxSizing: "border-box",
  };
  const sectionTitle: React.CSSProperties = {
    margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ds-muted)",
  };
  const hint: React.CSSProperties = { margin: 0, fontSize: 13, textAlign: "center", color: "var(--ds-muted)", lineHeight: 1.5 };
  const menuItem: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    width: "100%", minHeight: 40, textAlign: "left", padding: "8px 12px", fontSize: 14,
    background: "transparent", color: "var(--ds-text)", border: "none", cursor: "pointer", fontFamily: "inherit",
  };

  const statusChip = (p: LobbyParticipant) => {
    if (p.status === "disconnected") return <span className="ds-chip ds-chip-neutral">Offline</span>;
    const ready = p.status === "ready";
    return (
      <span className={`ds-chip ${ready ? "ds-chip-for" : "ds-chip-neutral"}`} style={{ flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ready ? "var(--ds-for-mid)" : "currentColor" }} />
        <span>{ready ? "Ready" : "Waiting"}</span>
      </span>
    );
  };

  // Host-only manage button + role menu (role change + transfer host), lobby phase only.
  const renderManage = (p: LobbyParticipant) => {
    if (!isHost || p.userId === user?.id || room.status !== "lobby") return null;
    const pRole    = (p.role ?? "participant") as ParticipantRole;
    const menuOpen = roleMenuFor === p.userId;

    return (
      <div style={{ position: "relative", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setRoleMenuFor(menuOpen ? null : p.userId)}
          title="Manage"
          aria-label={`Manage ${p.username}`}
          aria-expanded={menuOpen}
          style={{ width: 44, height: 44, borderRadius: 10, border: 0, background: "transparent", color: "var(--ds-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <Icon name="sliders" size={18} />
        </button>

        {menuOpen && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50, minWidth: 220,
            background: "var(--ds-panel)", border: "1px solid var(--ds-border)", borderRadius: 14,
            boxShadow: "var(--ds-shadow)", overflow: "hidden", padding: "4px 0",
          }}>
            <div style={{ ...sectionTitle, fontSize: 11, padding: "8px 12px", borderBottom: "1px solid var(--ds-hair)" }}>
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
                  type="button"
                  onClick={() => avail.available && handleChangeRole(p.userId, r)}
                  disabled={!avail.available && !isCurrent}
                  title={avail.reason ?? undefined}
                  style={{
                    ...menuItem,
                    background: isCurrent ? "var(--ds-for-bg)" : "transparent",
                    color: isCurrent ? "var(--ds-for-text)" : (!avail.available ? "var(--ds-muted)" : "var(--ds-text)"),
                    cursor: avail.available ? "pointer" : "default",
                    fontWeight: isCurrent ? 700 : 500,
                    opacity: !avail.available && !isCurrent ? 0.5 : 1,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 16, display: "inline-flex" }}>{isCurrent && <Icon name="check" size={16} />}</span>
                    {label}
                  </span>
                  {/* Show remaining slot count on available non-current options */}
                  {!isCurrent && avail.available && r !== "participant" && (
                    <span style={{ fontSize: 12, color: avail.slotsLeft <= 1 ? "var(--ds-gold-text)" : "var(--ds-muted)" }}>
                      {avail.slotsLeft} left
                    </span>
                  )}
                  {!isCurrent && !avail.available && r !== "participant" && (
                    <span style={{ fontSize: 11, color: "var(--ds-against-text)", fontWeight: 700 }}>
                      {avail.reason}
                    </span>
                  )}
                </button>
              );
            })}
            <div style={{ height: 1, background: "var(--ds-hair)", margin: "4px 0" }} />
            <button type="button" onClick={() => handleTransferHost(p.userId)} style={{ ...menuItem, justifyContent: "flex-start", color: "var(--ds-gold-text)", fontWeight: 600 }}>
              <Icon name="crown" size={16} />
              Make Host
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <InAppBrowserGate>
      <ConnectionStatusBanner isConnected={isConnected} isReconnecting={isReconnecting} />
      <div
        className="ds-room-page"
        onClick={() => { if (roleMenuFor) setRoleMenuFor(null); if (transferOpen) setTransferOpen(false); }}
      >
        <RoomHeader
          onLeave={handleLeave}
          motion={room.topic || "Voting in progress — motion not locked yet"}
          status={headerStatus}
          code={room.code}
        />

        <main className="ds-room-main">
          <div style={{
            maxWidth: 1280, margin: "0 auto", display: "grid", gap: 24, alignItems: "start",
            gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) clamp(280px, 30vw, 380px)",
          }}>

            {/* ── Left: voting, debaters, observers ───────────────────── */}
            <section style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>

              {room.votingEnabled && (
                <VotingPanel
                  votingTopics={room.votingTopics}
                  votingDuration={room.votingDuration}
                  isHost={isHost}
                  roomId={room._id!}
                  socket={socket}
                />
              )}

              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 22 : 28, letterSpacing: "-0.02em" }}>
                    Debaters <span style={{ color: "var(--ds-faint)" }}>{debatingParticipants.length}/{room.maxParticipants}</span>
                  </h1>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--ds-muted)" }}>
                    {readyCount} of {debatingParticipants.length} ready. Sides are assigned when the debate starts.
                  </p>
                </div>
                <div
                  role="img"
                  aria-label={`${readyCount} of ${debatingParticipants.length} debaters ready`}
                  style={{ height: 10, width: 180, maxWidth: "100%", borderRadius: 99, background: "var(--ds-track)", overflow: "hidden" }}
                >
                  <div style={{ height: 10, background: "var(--ds-for-mid)", transition: "width .3s", width: debatingParticipants.length ? `${(readyCount / debatingParticipants.length) * 100}%` : "0%" }} />
                </div>
              </div>

              <div style={{ display: "grid", gap: 14, gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(220px, 1fr))" }}>
                {debatingParticipants.map((p) => {
                  const isYou    = p.userId === user?.id;
                  const offline  = p.status === "disconnected";
                  const pIsHost  = p.role === "moderator" || p.userId === room.creatorId;
                  const controls = <>{statusChip(p)}{renderManage(p)}</>;

                  return (
                    <article
                      key={p.userId}
                      style={{
                        position: "relative", padding: isMobile ? 14 : 20, borderRadius: 20, boxSizing: "border-box",
                        background: "var(--ds-panel)", border: `1px solid ${isYou ? "var(--ds-accent-line)" : "var(--ds-border)"}`,
                        boxShadow: "var(--ds-shadow)", opacity: offline ? 0.55 : 1, transition: "opacity .2s, border-color .2s",
                        display: "flex", flexDirection: isMobile ? "row" : "column", alignItems: isMobile ? "center" : "stretch", gap: isMobile ? 10 : 14,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "1 1 auto", minWidth: 0 }}>
                        <span aria-hidden="true" style={{
                          width: 48, height: 48, flexShrink: 0, borderRadius: 16, fontWeight: 700, fontSize: 16,
                          background: isYou ? "var(--ds-avatar-bg)" : "var(--ds-raised)", color: isYou ? "var(--ds-avatar-fg)" : "var(--ds-text)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {initials(p.username)}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 15, minWidth: 0 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.username}</span>
                            {pIsHost && (
                              <span role="img" aria-label="Host" style={{ color: "var(--ds-gold-mid)", display: "inline-flex" }}>
                                <Icon name="crown" size={15} />
                              </span>
                            )}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{isYou ? "You · " : ""}{pIsHost ? "Host" : "Debater"}</span>
                        </div>
                      </div>

                      {isMobile ? controls : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 }}>{controls}</div>
                      )}
                    </article>
                  );
                })}

                {Array.from({ length: seatTiles }, (_, i) => {
                  const isTail = seatOverflow > 0 && i === seatTiles - 1;
                  return (
                    <div key={`seat-${i}`} style={{
                      minHeight: isMobile ? 64 : 150, borderRadius: 20, border: "2px dashed var(--ds-border2)", boxSizing: "border-box",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      color: "var(--ds-faint)", fontSize: 14, fontWeight: 600,
                    }}>
                      <Icon name="plus" size={16} />
                      {isTail ? `+${seatOverflow + 1} open seats` : "Open seat"}
                    </div>
                  );
                })}
              </div>

              {participants.length === 0 && (
                <p style={{ ...hint, fontSize: 14 }}>No players yet — share the code!</p>
              )}

              {/* Judges & spectators */}
              <div style={{ ...panel, boxShadow: "none", gap: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <h2 style={sectionTitle}>Judges &amp; spectators</h2>
                  <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>
                    {judgeParticipants.length} judging · {spectatorParticipants.length} watching
                  </span>
                </div>
                {observerParticipants.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--ds-muted)" }}>No judges or spectators yet.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {observerParticipants.map((p) => {
                      const isYou   = p.userId === user?.id;
                      const offline = p.status === "disconnected";
                      const isJudge = p.role === "judge";
                      const manage  = renderManage(p);
                      return (
                        <div key={p.userId} style={{
                          position: "relative", display: "inline-flex", alignItems: "center", gap: 10, minHeight: 48, maxWidth: "100%",
                          padding: manage ? "2px 2px 2px 6px" : "2px 14px 2px 6px", borderRadius: 14, boxSizing: "border-box",
                          background: "var(--ds-raised)", opacity: offline ? 0.6 : 1,
                        }}>
                          <span aria-hidden="true" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 12, background: "var(--ds-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>
                            {initials(p.username)}
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.username}</span>
                            <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>
                              {isYou ? "You · " : ""}{isJudge ? "Judge" : "Spectator"}{offline ? " · offline" : ""}
                            </span>
                          </span>
                          <span style={{ color: isJudge ? ROLE_BADGE.judge.color : "var(--ds-muted)", display: "inline-flex" }}>
                            <Icon name={isJudge ? "scale" : "eye"} size={16} />
                          </span>
                          {manage}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* ── Right: settings + host controls / your status ───────── */}
            <aside style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <div style={panel}>
                <h2 style={sectionTitle}>Room settings</h2>
                <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  {settings.map(({ label, value }) => (
                    <div key={label} style={{ padding: 12, borderRadius: 12, background: "var(--ds-raised)" }}>
                      <dt style={{ fontSize: 12, color: "var(--ds-muted)", fontWeight: 600 }}>{label}</dt>
                      <dd style={{ margin: "4px 0 0", fontWeight: 700, textTransform: "capitalize" }}>{value}</dd>
                    </div>
                  ))}
                </dl>
                {room.description && (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--ds-muted)", lineHeight: 1.5 }}>{room.description}</p>
                )}
              </div>

              <div style={{ ...panel, gap: 12, border: `1px solid ${isHost ? "var(--ds-accent-line)" : "var(--ds-border)"}` }}>
                <h2 style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 8, color: isHost ? "var(--ds-accent)" : "var(--ds-muted)" }}>
                  {isHost && <span style={{ color: "var(--ds-gold-mid)", display: "inline-flex" }}><Icon name="crown" size={15} /></span>}
                  {isHost ? "Host Controls" : "Your Status"}
                </h2>

                {/* My role tag */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderRadius: 12, background: "var(--ds-raised)" }}>
                  <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>Your role</span>
                  <span className="ds-chip" style={{ background: ROLE_BADGE[myRole].bg, color: ROLE_BADGE[myRole].color, letterSpacing: "0.06em" }}>
                    {ROLE_BADGE[myRole].label}
                  </span>
                </div>

                {/* Non-host, debating participant: ready/unready */}
                {!isHost && isDebater && (
                  <>
                    {!userReady ? (
                      <button type="button" onClick={handleReady} className="ds-btn ds-btn-for ds-btn-block" style={{ height: 52 }}>
                        <Icon name="check" size={18} />Ready up
                      </button>
                    ) : (
                      <button type="button" onClick={handleUnready} className="ds-btn ds-btn-danger ds-btn-block" style={{ height: 52 }}>
                        <Icon name="x" size={18} />Not ready
                      </button>
                    )}
                    <p style={hint}>
                      {debatingReady && debatingParticipants.length >= 2 ? "All ready — waiting for host…" : "Ready up to start the debate"}
                    </p>
                  </>
                )}

                {/* Observer status message */}
                {!isHost && !isDebater && (
                  <p style={hint}>
                    {myRole === "judge"
                      ? "You'll score the debaters after the debate ends."
                      : "You'll be able to listen to the debate live."}
                  </p>
                )}

                {isHost && (
                  <>
                    <button
                      type="button"
                      onClick={handleStartDebate}
                      disabled={!debatingReady || debatingParticipants.length < 2}
                      className="ds-btn ds-btn-primary ds-btn-block"
                      style={{
                        height: 56, fontSize: 16,
                        ...(!debatingReady || debatingParticipants.length < 2
                          ? { background: "var(--ds-neutral-bg)", color: "var(--ds-neutral-text)", boxShadow: "none", opacity: 1 }
                          : {}),
                      }}
                    >
                      {!isConnected ? "Connecting…" : <>Start debate<Icon name="right" size={18} /></>}
                    </button>
                    {(!debatingReady || debatingParticipants.length < 2) && (
                      <p style={hint}>
                        {debatingParticipants.length < 2
                          ? "Need at least 2 debaters"
                          : `${debatingParticipants.length - readyCount} debater(s) not ready`}
                      </p>
                    )}

                    {room.status === "lobby" && transferTargets.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          aria-expanded={transferOpen}
                          onClick={() => setTransferOpen((o) => !o)}
                          style={{ minHeight: 44, border: 0, background: "transparent", color: "var(--ds-muted)", font: "600 13px Outfit, sans-serif", textDecoration: "underline", cursor: "pointer" }}
                        >
                          Transfer host
                        </button>
                        {transferOpen && transferTargets.map((p) => (
                          <button
                            key={p.userId}
                            type="button"
                            onClick={() => handleTransferHost(p.userId)}
                            aria-label={`Make ${p.username} the host`}
                            style={{ ...menuItem, borderRadius: 12, background: "var(--ds-raised)", justifyContent: "flex-start", gap: 10 }}
                          >
                            <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 9, background: "var(--ds-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                              {initials(p.username)}
                            </span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{p.username}</span>
                            <span style={{ color: "var(--ds-gold-mid)", display: "inline-flex" }}><Icon name="crown" size={16} /></span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>
    </InAppBrowserGate>
  );
}
