import { useEffect, useState } from "react";
import type { VotingTopic } from "@argumint/shared";
import type { Socket } from "socket.io-client";
import { Icon } from "./Icon";
import { useIsMobile } from "../hooks/useIsMobile";

interface VotingPanelProps {
  votingTopics: VotingTopic[];
  votingDuration: number;
  isHost: boolean;
  roomId: string;
  socket: Socket | null;
  onVotingStatusChange?: (status: boolean) => void;
}

export function VotingPanel({
  votingTopics,
  votingDuration,
  isHost,
  roomId,
  socket,
  onVotingStatusChange,
}: VotingPanelProps) {
  const isMobile = useIsMobile();
  // All voting state is local — nothing outside VotingPanel needs it.
  const [userVote, setUserVote]           = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [votingTimer, setVotingTimer]     = useState(votingDuration);
  const [isVotingStarted, setIsVotingStarted] = useState(false);
  const [votingEnded, setVotingEnded]     = useState(false);
  const [currentTopics, setCurrentTopics] = useState(votingTopics);

  useEffect(() => {
    if (!socket || !roomId) return;

    // Sync state if voting is already in progress when we mount.
    socket.emit("room:get-state", { roomId }, (response: any) => {
      if (!response?.success || !response.room) return;
      const room = response.room;
      if (room.votingInProgress) {
        setIsVotingStarted(true);
        setVotingEnded(false);
        setVotingTimer(room.votingDuration ?? votingDuration);
        setCurrentTopics(room.votingTopics ?? votingTopics);
      }
    });

    const onVotingStarted = (data: any) => {
      setIsVotingStarted(true);
      setVotingEnded(false);
      setVotingTimer(data.votingDuration ?? votingDuration);
      setCurrentTopics(data.votingTopics);
      setUserVote(null);
      onVotingStatusChange?.(true);
    };
    const onVotingUpdate = (data: any) => {
      if (data.votingTopics) setCurrentTopics(data.votingTopics);
    };
    const onVotingEnded = (data: any) => {
      setVotingEnded(true);
      setIsVotingStarted(false);
      setCurrentTopics(data.votingTopics);
      setSelectedTopic(data.selectedTopic);
      onVotingStatusChange?.(false);
    };

    socket.on("room:voting-started", onVotingStarted);
    socket.on("room:voting-update", onVotingUpdate);
    socket.on("room:voting-ended", onVotingEnded);

    return () => {
      socket.off("room:voting-started", onVotingStarted);
      socket.off("room:voting-update", onVotingUpdate);
      socket.off("room:voting-ended", onVotingEnded);
    };
  }, [socket, roomId]);

  // Keep topic list in sync with props when voting isn't active.
  useEffect(() => {
    if (!isVotingStarted && !votingEnded) setCurrentTopics(votingTopics);
  }, [votingTopics, isVotingStarted, votingEnded]);

  // Countdown timer — host auto-ends voting when it hits zero.
  useEffect(() => {
    if (!isVotingStarted || votingEnded) return;
    if (votingTimer <= 0) {
      if (isHost) {
        socket?.emit("room:end-voting", { roomId }, (res: any) => {
          if (res.success) {
            setVotingEnded(true);
            setIsVotingStarted(false);
          }
        });
      }
      return;
    }
    const t = setTimeout(() => setVotingTimer((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [votingTimer, isVotingStarted, isHost, roomId, socket, votingEnded]);

  const handleVote = (topicId: string) => {
    if (!isVotingStarted || votingEnded) return;
    socket?.emit("room:vote-topic", { roomId, topicId }, (res: any) => {
      if (res.success) setUserVote(topicId);
    });
  };

  // Host closes the vote early — same event the countdown fires at zero.
  const handleEndVoting = () => {
    if (!isHost || !isVotingStarted || votingEnded) return;
    socket?.emit("room:end-voting", { roomId }, (res: any) => {
      if (res.success) {
        setVotingEnded(true);
        setIsVotingStarted(false);
      }
    });
  };

  const handleStartVoting = () => {
    if (!isHost) return;
    setIsVotingStarted(true);
    setVotingEnded(false);
    setVotingTimer(votingDuration);
    setCurrentTopics(votingTopics);
    setUserVote(null);
    onVotingStatusChange?.(true);
    socket?.emit("room:start-voting", { roomId }, (res: any) => {
      if (!res?.success) {
        setIsVotingStarted(false);
        setVotingEnded(false);
      }
    });
  };

  if (!votingTopics || votingTopics.length === 0) return null;

  const totalVotes = currentTopics.reduce((s, t) => s + t.votes, 0);
  const showResults = isVotingStarted || votingEnded;
  const isUrgent = votingTimer <= 10;

  // Countdown ring geometry (r=44 in a 100×100 viewBox)
  const circumference = 2 * Math.PI * 44;
  const ringPct = votingDuration > 0 ? Math.max(0, Math.min(1, votingTimer / votingDuration)) : 0;
  const clock = `${Math.floor(Math.max(0, votingTimer) / 60)}:${String(Math.max(0, votingTimer) % 60).padStart(2, "0")}`;
  const ringSize = isMobile ? 84 : 112;

  return (
    <section style={{
      padding: isMobile ? 16 : 24, borderRadius: isMobile ? 20 : 24, boxSizing: "border-box",
      background: "var(--ds-panel)", border: `1px solid ${isVotingStarted ? "var(--ds-accent-line)" : "var(--ds-border)"}`,
      boxShadow: "var(--ds-shadow)", display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20,
    }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ds-accent)" }}>
            {isVotingStarted ? "Voting open" : votingEnded ? "Voting closed" : "Topic vote"}
          </span>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 22 : 28, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--ds-text)" }}>
            What should we debate?
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ds-muted)" }}>Most votes wins. Ties go to the option listed first.</p>
        </div>
        {isVotingStarted && (
          <div role="timer" aria-label={`${votingTimer} seconds left`} style={{ position: "relative", width: ringSize, height: ringSize, flexShrink: 0 }}>
            <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--ds-track)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="44" fill="none"
                stroke={isUrgent ? "var(--ds-against-mid)" : "var(--ds-accent-mid)"}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ringPct)}
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }}
              />
            </svg>
            <span style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: isMobile ? 20 : 26,
              color: isUrgent ? "var(--ds-against-text)" : "var(--ds-text)",
            }}>
              {clock}
            </span>
          </div>
        )}
      </header>

      {votingEnded && selectedTopic && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", borderRadius: 14, background: "var(--ds-for-bg)", border: "1px solid var(--ds-for-line)", fontSize: 14, lineHeight: 1.45 }}>
          <span style={{ color: "var(--ds-for-text)", display: "inline-flex", marginTop: 1 }}><Icon name="check" size={18} /></span>
          <span>
            <span style={{ color: "var(--ds-for-text)", fontWeight: 700 }}>Motion selected: </span>
            <span style={{ color: "var(--ds-text)" }}>{currentTopics.find((t) => t.id === selectedTopic)?.text}</span>
          </span>
        </div>
      )}

      <div role="group" aria-label="Motion options" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {currentTopics.map((topic) => {
          const pct = totalVotes > 0 ? Math.round((topic.votes / totalVotes) * 100) : 0;
          const isMyVote = userVote === topic.id;
          const isWinner = votingEnded && selectedTopic === topic.id;
          const canVote  = isVotingStarted && !votingEnded;
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => handleVote(topic.id)}
              disabled={!isVotingStarted || votingEnded}
              aria-pressed={isMyVote}
              style={{
                width: "100%", boxSizing: "border-box", textAlign: "left", font: "inherit", color: "var(--ds-text)",
                padding: isMobile ? 16 : "18px 22px", borderRadius: 20,
                border: `2px solid ${isMyVote ? "var(--ds-accent-line)" : isWinner ? "var(--ds-for-line)" : "var(--ds-border)"}`,
                background: isMyVote ? "var(--ds-accent-soft)" : isWinner ? "var(--ds-for-bg)" : "var(--ds-deep)",
                display: "flex", flexDirection: "column", gap: 14,
                cursor: canVote ? "pointer" : "default", transition: "border-color .2s, background .2s",
              }}
            >
              <span style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                {/* Radio-style marker */}
                <span aria-hidden="true" style={{
                  width: 22, height: 22, marginTop: 1, flexShrink: 0, borderRadius: "50%", boxSizing: "border-box",
                  border: `2px solid ${isMyVote ? "var(--ds-accent-mid)" : "var(--ds-border2)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", opacity: canVote || isMyVote ? 1 : 0.6,
                }}>
                  {isMyVote && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--ds-accent-mid)" }} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: isMobile ? 15 : 17, fontWeight: 600, lineHeight: 1.4, overflowWrap: "anywhere" }}>{topic.text}</span>
                {showResults && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 18, flexShrink: 0 }}>{pct}%</span>
                )}
              </span>
              {showResults && (
                <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, paddingLeft: 36 }}>
                  <span style={{ flex: "1 1 120px", height: 8, borderRadius: 99, background: "var(--ds-track)", overflow: "hidden" }}>
                    <span style={{
                      display: "block", height: 8, width: `${pct}%`, borderRadius: 99, transition: "width 0.5s ease",
                      background: isMyVote ? "var(--ds-accent-mid)" : isWinner ? "var(--ds-for-mid)" : "var(--ds-neutral-text)",
                    }} />
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ds-muted)", whiteSpace: "nowrap" }}>
                    {topic.votes === 0 ? "No votes" : `${topic.votes} vote${topic.votes === 1 ? "" : "s"}`}
                  </span>
                  {isMyVote && (
                    <span style={{ height: 24, padding: "0 8px", borderRadius: 6, background: "var(--ds-primary-fill)", color: "var(--ds-on-primary)", display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                      Your vote
                    </span>
                  )}
                  {isWinner && (
                    <span className="ds-chip ds-chip-for" style={{ height: 24 }}>
                      <Icon name="trophy" size={14} />Winner
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showResults && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, padding: isMobile ? "14px 16px" : "14px 18px", borderRadius: 16, background: "var(--ds-raised)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--ds-text3)" }}>
            <span style={{ color: "var(--ds-muted)", display: "inline-flex" }}><Icon name="users" size={18} /></span>
            <span><strong style={{ color: "var(--ds-text)" }}>{totalVotes}</strong> vote{totalVotes === 1 ? "" : "s"} cast</span>
          </span>
          {isHost && isVotingStarted && !votingEnded && (
            <button type="button" onClick={handleEndVoting} className="ds-btn ds-btn-secondary ds-btn-sm" style={{ height: 44 }}>
              <span style={{ color: "var(--ds-gold-mid)", display: "inline-flex" }}><Icon name="crown" size={16} /></span>
              End voting now
            </button>
          )}
        </div>
      )}

      {isHost && !isVotingStarted && !votingEnded && (
        <button type="button" onClick={handleStartVoting} className="ds-btn ds-btn-primary ds-btn-block" style={{ height: 52 }}>
          <Icon name="vote" size={18} />Start voting
        </button>
      )}
      {isHost && votingEnded && (
        <button
          type="button"
          onClick={() => { setVotingEnded(false); setIsVotingStarted(false); setVotingTimer(votingDuration); setUserVote(null); setCurrentTopics(votingTopics); }}
          className="ds-btn ds-btn-ghost ds-btn-block"
        >
          <Icon name="refresh" size={18} />Run another vote
        </button>
      )}
      {!isHost && !isVotingStarted && !votingEnded && (
        <p style={{ margin: 0, textAlign: "center", color: "var(--ds-muted)", fontSize: 13 }}>
          Waiting for host to start voting…
        </p>
      )}
    </section>
  );
}
