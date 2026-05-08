import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { NavLogo } from "../components/NavLogo";
import { useAuth } from "../contexts/AuthContext";
import { useRoom } from "../contexts/RoomContext";
import { useSocket } from "../hooks/useSocket";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
import { useIsMobile } from "../hooks/useIsMobile";
import { roomApi } from "../services/api";
import { VotingPanel } from "../components/VotingPanel";
import type { Room } from "@argumint/shared";

export function RoomLobby() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { room: contextRoom, setRoom, setError } = useRoom();
  const { socket, isConnected } = useSocket();

  const [room, setLocalRoom] = useState<Room | null>(contextRoom || null);
  const [isLoading, setIsLoading] = useState(!contextRoom);
  const [copied, setCopied] = useState(false);

  useLeaveRoomOnNavigate(code, room?._id, socket);

  useEffect(() => {
    if (!contextRoom && code) {
      const fetchRoom = async () => {
        try {
          const fetchedRoom = await roomApi.getRoomByCode(code);
          setLocalRoom(fetchedRoom);
          setRoom(fetchedRoom);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to fetch room");
        } finally {
          setIsLoading(false);
        }
      };
      fetchRoom();
    } else if (contextRoom) {
      setLocalRoom(contextRoom);
      setIsLoading(false);
    }
  }, [contextRoom, code]);

  useEffect(() => {
    if (!socket || !isConnected || !code) return;
    // NOTE: `room` is intentionally excluded from deps. Every time a participant
    // joins/leaves, the server broadcasts an update which sets room state — if
    // `room` were a dep, the effect would re-fire and re-emit room:join for every
    // state change. Multiple concurrent room:join events race the server's
    // deduplication check and push duplicate participant entries.
    socket.emit("room:join", { roomCode: code }, (response: any) => {
      if (response?.success && response.room) {
        setLocalRoom(response.room);
      } else if (!response?.success) {
        setError(response?.error || "Failed to join room");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isConnected, code]);

  useEffect(() => {
    if (!socket) return;

    const onParticipantJoined = (data: any) => {
      if (data.participants) setLocalRoom((prev) => prev ? { ...prev, participants: data.participants } : prev);
    };
    const onParticipantLeft = (data: any) => {
      setLocalRoom((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: data.participants ?? prev.participants,
          // Sync updated host after host-promotion on leave
          creatorId: data.creatorId ?? prev.creatorId,
          creatorUsername: data.creatorUsername ?? prev.creatorUsername,
        };
      });
    };
    const onParticipantStatusUpdated = (data: any) => {
      if (data.participants) setLocalRoom((prev) => prev ? { ...prev, participants: data.participants } : prev);
    };
    const onParticipantDisconnected = (data: any) => {
      if (data.participants) setLocalRoom((prev) => prev ? { ...prev, participants: data.participants } : prev);
    };
    const onVotingEnded = (data: any) => {
      setLocalRoom((prev) => prev ? { ...prev, topic: data.topic ?? prev.topic, status: data.status ?? prev.status, votingTopics: data.votingTopics ?? prev.votingTopics } : prev);
    };
    const onVotingStarted = (data: any) => {
      setLocalRoom((prev) => prev ? { ...prev, status: data.status ?? prev.status, votingTopics: data.votingTopics ?? prev.votingTopics } : prev);
    };
    const onDebateStarted = (data: any) => {
      try {
        if (data?.debateId) sessionStorage.setItem("activeDebateId", data.debateId);
        // Store host status so DebatePage can show the "End Debate" button.
        const isCurrentUserHost =
          room?.creatorId === user?.id ||
          room?.participants.find((p) => p.userId === user?.id)?.role === "moderator";
        sessionStorage.setItem("isHost", isCurrentUserHost ? "true" : "false");
      } catch {}
      if (data?.roomCode) navigate(`/room/${data.roomCode}/prep`);
    };

    socket.on("room:participant-joined", onParticipantJoined);
    socket.on("room:participant-left", onParticipantLeft);
    socket.on("room:participant-status-updated", onParticipantStatusUpdated);
    socket.on("room:participant-disconnected", onParticipantDisconnected);
    socket.on("room:voting-ended", onVotingEnded);
    socket.on("room:voting-started", onVotingStarted);
    socket.on("debate:started", onDebateStarted);

    return () => {
      socket.off("room:participant-joined", onParticipantJoined);
      socket.off("room:participant-left", onParticipantLeft);
      socket.off("room:participant-status-updated", onParticipantStatusUpdated);
      socket.off("room:participant-disconnected", onParticipantDisconnected);
      socket.off("room:voting-ended", onVotingEnded);
      socket.off("room:voting-started", onVotingStarted);
      socket.off("debate:started", onDebateStarted);
    };
  }, [socket, navigate]);

  const handleReady = () => {
    if (!room || !socket) return;
    socket.emit("room:update-status", { roomId: room._id, status: "ready" });
  };
  const handleUnready = () => {
    if (!room || !socket) return;
    socket.emit("room:update-status", { roomId: room._id, status: "joined" });
  };
  const handleStartDebate = () => {
    if (!room || !socket || !isHost || !allReady || participants.length < 2) return;
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

  // Detect in-app browsers (WhatsApp, Instagram, etc.) — block before anything
  // else so the user sees the "open in browser" gate immediately on arrival.
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isInAppBrowser =
    /FBAN|FBAV|Instagram|WhatsApp\/|TikTok|Snapchat|Twitter\//.test(ua) ||
    /\bwv\b/.test(ua) ||
    (/iPhone|iPod|iPad/.test(ua) && !/Safari\//.test(ua) && /AppleWebKit/.test(ua));

  if (isInAppBrowser) {
    return (
      <div className="bg-grid" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", background: "var(--bg)", textAlign: "center" }}>
        <div className="glass fade-up" style={{ maxWidth: 360, padding: "2.5rem 2rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1.25rem" }}>🌐</div>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 900, color: "var(--text)", margin: "0 0 0.875rem", letterSpacing: "-0.02em" }}>
            Open in your browser
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.65, margin: "0 0 1.75rem" }}>
            Argumint needs microphone access to work. WhatsApp and other in-app browsers block mic permissions — please open this link in <strong style={{ color: "var(--text)" }}>Chrome</strong> or <strong style={{ color: "var(--text)" }}>Safari</strong>.
          </p>
          <button
            className="btn-primary"
            style={{ width: "100%", fontSize: "1rem", padding: "0.875rem" }}
            onClick={() => { window.location.href = window.location.href; }}
          >
            Open in Browser
          </button>
          <p style={{ marginTop: "1rem", color: "var(--muted)", fontSize: "0.75rem" }}>
            Copy this URL and paste it into Chrome or Safari if the button doesn't work.
          </p>
          <div style={{ marginTop: "0.5rem", padding: "0.5rem 0.75rem", background: "var(--bg2)", borderRadius: "0.5rem", fontSize: "0.72rem", color: "var(--subtle)", wordBreak: "break-all", fontFamily: "'JetBrains Mono', monospace" }}>
            {window.location.href}
          </div>
        </div>
      </div>
    );
  }

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

  // Deduplicate participants by userId — safety net against stale DB duplicates.
  // Keep the last occurrence so that the most recently updated entry wins.
  const participants = Array.from(
    room.participants.reduce((map, p) => {
      map.set(p.userId, p);
      return map;
    }, new Map<string, typeof room.participants[number]>()).values()
  );

  const isCreator = room.creatorId === user?.id;
  const currentUser = participants.find((p) => p.userId === user?.id);
  const isHost = isCreator || currentUser?.role === "moderator";
  const userReady = currentUser?.status === "ready";
  const allReady = participants.every((p) => p.status === "ready");
  const readyCount = participants.filter((p) => p.status === "ready").length;

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", overflowX: "hidden" }}>
      <nav className="game-nav">
        <NavLogo onClick={() => navigate("/")} />
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div className={isConnected ? "pulse-dot pulse-dot-green" : "pulse-dot pulse-dot-red"} />
            <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{isConnected ? "Live" : "Offline"}</span>
          </div>
          {!isMobile && <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{user?.username}</span>}
        </div>
      </nav>

      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", padding: isMobile ? "0.75rem" : "0.875rem 1rem 0" }}>
        <div style={{ maxWidth: 1100, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", flex: 1, gap: "0.875rem" }}>

        {/* Room code hero */}
        <div className="glass fade-up" style={{ flexShrink: 0, padding: isMobile ? "0.75rem 1rem" : "0.875rem 1.5rem" }}>
          {/* Code + copy row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.625rem" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.15rem" }}>Room Code</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: isMobile ? "1.6rem" : "2.2rem", fontWeight: 800, letterSpacing: isMobile ? "0.12em" : "0.18em", color: "var(--cyan)" }}>{room.code}</div>
            </div>
            <button onClick={handleCopy} className="btn-ghost" style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem", flexShrink: 0 }}>
              {copied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
          {/* Stats row */}
          <div style={{ display: "flex", gap: isMobile ? "1rem" : "1.5rem" }}>
            {[
              { label: "Ready", value: `${readyCount}/${participants.length}` },
              { label: "Mode", value: room.debateMode },
              { label: "Turn", value: `${room.turnDuration}s` },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
                <div style={{ fontWeight: 800, color: "var(--text)", fontSize: "0.88rem", textTransform: "capitalize" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: "0.875rem", paddingBottom: "0.875rem" }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>

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
            <div className="glass fade-up" style={{ padding: "1rem 1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.875rem" }}>
                <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)" }}>
                  Players — {participants.length}/{room.maxParticipants}
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {participants.map((p) => {
                  const isYou = p.userId === user?.id;
                  const ready = p.status === "ready";
                  const offline = p.status === "disconnected";
                  const host = p.role === "moderator" || room.creatorId === p.userId;
                  return (
                    <div key={p.userId}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.875rem",
                        padding: "0.75rem 1rem", borderRadius: "0.625rem",
                        background: isYou ? "rgba(224,242,254,0.6)" : "rgba(249,247,255,0.4)",
                        border: `1px solid ${ready ? "rgba(16,185,129,0.5)" : isYou ? "rgba(34,211,238,0.2)" : "var(--border)"}`,
                        boxShadow: ready ? "0 2px 8px rgba(16,185,129,0.12)" : "none",
                        opacity: offline ? 0.45 : 1,
                        transition: "all 0.2s",
                      }}>
                      <div className={`avatar ${ready ? "avatar-for" : "avatar-neutral"}`}
                        style={{ background: ready ? "rgba(16,185,129,0.2)" : "rgba(79,142,247,0.15)", color: ready ? "#10b981" : "#4f8ef7", border: `1px solid ${ready ? "rgba(16,185,129,0.4)" : "rgba(79,142,247,0.3)"}` }}>
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.9rem" }}>{p.username}</span>
                          {isYou && <span className="badge badge-cyan" style={{ fontSize: "0.6rem" }}>YOU</span>}
                          {host && <span className="badge badge-gold" style={{ fontSize: "0.6rem" }}>HOST</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        {offline ? (
                          <span className="badge badge-muted">Offline</span>
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

              {/* Non-host ready buttons */}
              {!isHost && (
                <div style={{ marginBottom: "1rem" }}>
                  {!userReady ? (
                    <button onClick={handleReady} className="btn-for" style={{ width: "100%", marginBottom: "0.75rem" }}>
                      ✓ Ready Up
                    </button>
                  ) : (
                    <button onClick={handleUnready} className="btn-danger" style={{ width: "100%", marginBottom: "0.75rem" }}>
                      ✕ Not Ready
                    </button>
                  )}
                  <div style={{ padding: "0.75rem 1rem", background: "rgba(224,242,254,0.55)", border: "1px solid rgba(14,165,233,0.2)", borderRadius: "0.625rem" }}>
                    <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: 0, textAlign: "center" }}>
                      {allReady && participants.length >= 2
                        ? "All ready — waiting for host…"
                        : "Ready up to start the debate"}
                    </p>
                  </div>
                </div>
              )}

              {/* Host start button */}
              {isHost && (
                <div style={{ marginBottom: "1rem" }}>
                  <button
                    onClick={handleStartDebate}
                    disabled={!allReady || participants.length < 2}
                    className="btn-primary"
                    style={{ width: "100%", padding: "0.875rem", fontSize: "1rem", fontWeight: 800, marginBottom: "0.75rem" }}>
                    {!isConnected ? "Connecting…" : "Start Debate →"}
                  </button>
                  {(!allReady || participants.length < 2) && (
                    <div style={{ padding: "0.75rem 1rem", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "0.625rem" }}>
                      <p style={{ color: "var(--gold)", fontSize: "0.8rem", margin: 0, textAlign: "center" }}>
                        {participants.length < 2
                          ? "Need at least 2 players"
                          : `${participants.length - readyCount} player(s) not ready`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Ready progress */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Ready</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>{readyCount}/{participants.length}</span>
                </div>
                <div className="score-bar-track">
                  <div className="score-bar-fill score-bar-fill-for"
                    style={{ width: participants.length ? `${(readyCount / participants.length) * 100}%` : "0%" }} />
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
  );
}
