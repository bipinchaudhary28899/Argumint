import { useEffect, useState } from "react";
import { useRoom } from "../contexts/RoomContext";
import type { VotingTopic } from "@argumint/shared";
import type { Socket } from "socket.io-client";

interface VotingPanelProps {
  votingTopics: VotingTopic[];
  votingDuration: number;
  isHost: boolean;
  roomId: string;
  socket: Socket | null;
  onVotingStatusChange?: (status: boolean) => void;
}

export function VotingPanel({ votingTopics, votingDuration, isHost, roomId, socket, onVotingStatusChange }: VotingPanelProps) {
  const { userVote, setUserVote, setVotingInProgress, selectedTopic, setSelectedTopic } = useRoom();
  const [votingTimer, setVotingTimer] = useState(votingDuration);
  const [isVotingStarted, setIsVotingStarted] = useState(false);
  const [votingEnded, setVotingEnded] = useState(false);
  const [currentTopics, setCurrentTopics] = useState(votingTopics);

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit("room:get-state", { roomId }, (response: any) => {
      if (!response?.success || !response.room) return;
      const room = response.room;
      if (room.votingInProgress) {
        setIsVotingStarted(true); setVotingEnded(false);
        setVotingTimer(room.votingDuration ?? votingDuration);
        setCurrentTopics(room.votingTopics ?? votingTopics);
        setVotingInProgress(true);
      }
    });
    socket.on("room:voting-started", (data: any) => {
      setIsVotingStarted(true); setVotingEnded(false);
      setVotingTimer(data.votingDuration ?? votingDuration);
      setCurrentTopics(data.votingTopics); setVotingInProgress(true);
      setUserVote(null); onVotingStatusChange?.(true);
    });
    socket.on("room:voting-update", (data: any) => { if (data.votingTopics) setCurrentTopics(data.votingTopics); });
    socket.on("room:voting-ended", (data: any) => {
      setVotingEnded(true); setIsVotingStarted(false); setVotingInProgress(false);
      setCurrentTopics(data.votingTopics); setSelectedTopic(data.selectedTopic);
      onVotingStatusChange?.(false);
    });
    return () => { socket.off("room:voting-started"); socket.off("room:voting-update"); socket.off("room:voting-ended"); };
  }, [socket, roomId]);

  useEffect(() => {
    if (!isVotingStarted && !votingEnded) setCurrentTopics(votingTopics);
  }, [votingTopics, isVotingStarted, votingEnded]);

  useEffect(() => {
    if (!isVotingStarted || votingEnded) return;
    if (votingTimer <= 0) {
      if (isHost) socket?.emit("room:end-voting", { roomId }, (res: any) => { if (res.success) { setVotingEnded(true); setIsVotingStarted(false); setVotingInProgress(false); } });
      return;
    }
    const t = setTimeout(() => setVotingTimer(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [votingTimer, isVotingStarted, isHost, roomId, socket, votingEnded]);

  const handleVote = (topicId: string) => {
    if (!isVotingStarted || votingEnded) return;
    socket?.emit("room:vote-topic", { roomId, topicId }, (res: any) => { if (res.success) setUserVote(topicId); });
  };

  const handleStartVoting = () => {
    if (!isHost) return;
    setIsVotingStarted(true); setVotingEnded(false); setVotingTimer(votingDuration);
    setCurrentTopics(votingTopics); setVotingInProgress(true); setUserVote(null); onVotingStatusChange?.(true);
    socket?.emit("room:start-voting", { roomId }, (res: any) => {
      if (!res?.success) { setIsVotingStarted(false); setVotingEnded(false); setVotingInProgress(false); }
    });
  };

  if (!votingTopics || votingTopics.length === 0) return null;

  const totalVotes = currentTopics.reduce((s, t) => s + t.votes, 0);

  return (
    <div className="glass" style={{ padding: "1.75rem", marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)", marginBottom: "0.25rem" }}>Topic Vote</div>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>Choose the motion</h2>
        </div>
        {isVotingStarted && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "2rem", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", color: votingTimer <= 10 ? "var(--against)" : "var(--gold)", lineHeight: 1, textShadow: votingTimer <= 10 ? "0 0 16px rgba(244,63,94,0.6)" : "0 0 16px rgba(245,158,11,0.5)" }}>{votingTimer}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>seconds</div>
          </div>
        )}
      </div>

      {votingEnded && selectedTopic && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "0.625rem", marginBottom: "1.25rem" }}>
          <span style={{ color: "var(--for)", fontWeight: 700, fontSize: "0.875rem" }}>✓ Motion selected: </span>
          <span style={{ color: "var(--text)", fontSize: "0.875rem" }}>{currentTopics.find(t => t.id === selectedTopic)?.text}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginBottom: "1.25rem" }}>
        {currentTopics.map((topic) => {
          const pct = totalVotes > 0 ? Math.round((topic.votes / totalVotes) * 100) : 0;
          const isMyVote = userVote === topic.id;
          const isWinner = votingEnded && selectedTopic === topic.id;
          return (
            <button key={topic.id} onClick={() => handleVote(topic.id)} disabled={!isVotingStarted || votingEnded}
              style={{ position: "relative", padding: "0.875rem 1rem", border: `1px solid ${isMyVote ? "rgba(34,211,238,0.5)" : isWinner ? "rgba(16,185,129,0.5)" : "var(--border)"}`, borderRadius: "0.75rem", background: isMyVote ? "rgba(34,211,238,0.08)" : isWinner ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.02)", cursor: isVotingStarted && !votingEnded ? "pointer" : "default", transition: "all 0.2s", textAlign: "left", overflow: "hidden" }}>
              {/* progress bar behind */}
              {(isVotingStarted || votingEnded) && (
                <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: isMyVote ? "rgba(34,211,238,0.06)" : "rgba(255,255,255,0.03)", transition: "width 0.5s ease", borderRadius: "0.75rem" }} />
              )}
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  {isMyVote && <span style={{ color: "var(--cyan)", fontWeight: 800, fontSize: "0.875rem" }}>✓</span>}
                  {isWinner && <span style={{ color: "var(--for)", fontWeight: 800, fontSize: "0.875rem" }}>🏆</span>}
                  <span style={{ fontSize: "0.875rem", fontWeight: isMyVote ? 700 : 500, color: "var(--text)" }}>{topic.text}</span>
                </div>
                {(isVotingStarted || votingEnded) && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontFamily: "'JetBrains Mono', monospace" }}>{topic.votes}</span>
                    <span style={{ fontSize: "0.75rem", color: isMyVote ? "var(--cyan)" : "var(--muted)", fontWeight: 700 }}>{pct}%</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {isHost && !isVotingStarted && !votingEnded && (
        <button onClick={handleStartVoting} className="btn-primary" style={{ width: "100%" }}>⚡ Start Voting</button>
      )}
      {isHost && votingEnded && (
        <button onClick={() => { setVotingEnded(false); setIsVotingStarted(false); setVotingTimer(votingDuration); setUserVote(null); setCurrentTopics(votingTopics); }} className="btn-ghost" style={{ width: "100%" }}>
          Run another vote
        </button>
      )}
      {!isHost && !isVotingStarted && !votingEnded && (
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.8rem", padding: "0.5rem" }}>Waiting for host to start voting…</div>
      )}
    </div>
  );
}
