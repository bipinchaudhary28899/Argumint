import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSocket } from "../hooks/useSocket";
import { NavLogo } from "../components/NavLogo";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
import { useIsMobile } from "../hooks/useIsMobile";
import type { Debate, TurnOrderEntry } from "@argumint/shared";

export function PrepScreen() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const isMobile = useIsMobile();

  const [debate, setDebate] = useState<Debate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const debateId =
    typeof window !== "undefined" ? sessionStorage.getItem("activeDebateId") : null;

  useLeaveRoomOnNavigate(code, debate?.roomId, socket);

  useEffect(() => {
    if (!socket || !isConnected || !debateId) return;
    socket.emit("debate:get-state", { debateId }, (res: any) => {
      if (!res?.success) { setError(res?.error || "Failed to load debate"); return; }
      setDebate(res.debate as Debate);
    });
  }, [socket, isConnected, debateId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!socket || !code) return;
    const onTurnStarted = () => navigate(`/room/${code}/debate`);
    const onBuzzerOpen  = () => navigate(`/room/${code}/debate`);
    socket.on("debate:turn-started", onTurnStarted);
    socket.on("buzzer:open", onBuzzerOpen);
    return () => {
      socket.off("debate:turn-started", onTurnStarted);
      socket.off("buzzer:open", onBuzzerOpen);
    };
  }, [socket, code, navigate]);

  const mySide = useMemo<"for" | "against" | null>(() => {
    if (!debate || !user) return null;
    return debate.turnOrder.find((t) => t.userId === user.id)?.side ?? null;
  }, [debate, user]);

  const secondsRemaining = useMemo(() => {
    if (!debate?.prepEndsAt) return null;
    return Math.max(0, Math.ceil((new Date(debate.prepEndsAt).getTime() - now) / 1000));
  }, [debate, now]);

  const ringPct = useMemo(() => {
    if (secondsRemaining === null || !debate?.prepDuration) return 1;
    return secondsRemaining / debate.prepDuration;
  }, [secondsRemaining, debate]);

  const circumference = 2 * Math.PI * 40;
  const ringOffset = circumference * (1 - ringPct);
  const isUrgent = secondsRemaining !== null && secondsRemaining <= 10;

  if (error) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div className="glass" style={{ padding: "2.5rem", textAlign: "center", maxWidth: 400 }}>
          <p style={{ color: "var(--against)", marginBottom: "1.5rem" }}>⚠ {error}</p>
          <button onClick={() => navigate(`/room/${code}/lobby`)} className="btn-ghost">Back to lobby</button>
        </div>
      </div>
    );
  }

  if (!debate) {
    return (
      <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spin" style={{ width: 48, height: 48, border: "3px solid var(--border2)", borderTopColor: "var(--cyan)", borderRadius: "50%", margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--muted)" }}>Loading prep…</p>
        </div>
      </div>
    );
  }

  const isBuzzer = debate.mode === "buzzer";
  const sidesFor     = debate.turnOrder.filter((t: TurnOrderEntry) => t.side === "for");
  const sidesAgainst = debate.turnOrder.filter((t: TurnOrderEntry) => t.side === "against");

  return (
    <div className="bg-grid" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <nav className="game-nav">
        <NavLogo />
        <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <div className={isConnected ? "pulse-dot pulse-dot-green" : "pulse-dot pulse-dot-red"} />
            <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{isConnected ? "Live" : "Offline"}</span>
          </div>
          {!isMobile && <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{user?.username}</span>}
        </div>
      </nav>

      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", padding: isMobile ? "0.75rem" : "0.875rem 1rem" }}>
        <div style={{
          maxWidth: 1060, width: "100%", margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "340px 1fr",
          gap: "0.875rem",
          paddingBottom: "0.875rem",
        }}>

          {/* ── LEFT COLUMN ─────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

            {/* Countdown + motion */}
            <div className="glass fade-up" style={{ padding: "1.25rem 1.5rem", flexShrink: 0 }}>
              {/* Ring + timer row */}
              <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginBottom: "0.875rem" }}>
                <div style={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
                  <svg viewBox="0 0 88 88" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                    <circle cx="44" cy="44" r="40" fill="none" stroke="var(--border)" strokeWidth="5" />
                    <circle cx="44" cy="44" r="40" fill="none"
                      stroke={isUrgent ? "var(--against)" : "var(--cyan)"}
                      strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={ringOffset}
                      style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "1.6rem", fontWeight: 800, color: isUrgent ? "var(--against)" : "var(--cyan)",
                      lineHeight: 1,
                      textShadow: isUrgent ? "0 0 20px rgba(244,63,94,0.6)" : "0 0 20px rgba(34,211,238,0.5)",
                    }}>
                      {secondsRemaining ?? "–"}
                    </span>
                    <span style={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>PREP</span>
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.3rem" }}>Motion</div>
                  <div style={{ fontWeight: 800, color: "var(--text)", fontSize: "0.95rem", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
                    {debate.topic}
                  </div>
                </div>
              </div>

              {/* Badges row */}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <div className="badge badge-muted" style={{ fontSize: "0.68rem" }}>
                  <span style={{ color: "var(--muted)", marginRight: "0.25rem" }}>Mode:</span>
                  <span style={{ color: "var(--text)", textTransform: "capitalize" }}>{isBuzzer ? "Buzzer" : "Alternate"}</span>
                </div>
                {!isBuzzer && (
                  <div className="badge badge-muted" style={{ fontSize: "0.68rem" }}>
                    <span style={{ color: "var(--muted)", marginRight: "0.25rem" }}>Rounds:</span>
                    <span style={{ color: "var(--text)" }}>{debate.totalRounds}</span>
                  </div>
                )}
                <div className="badge badge-muted" style={{ fontSize: "0.68rem" }}>
                  <span style={{ color: "var(--muted)", marginRight: "0.25rem" }}>Slot:</span>
                  <span style={{ color: "var(--text)" }}>{debate.turnDuration}s</span>
                </div>
              </div>
            </div>

            {/* My side reveal */}
            {mySide && (
              <div className={`glass fade-up ${mySide === "for" ? "glow-for" : "glow-against"}`}
                style={{
                  padding: "1rem 1.25rem", borderRadius: "1rem", flexShrink: 0,
                  background: mySide === "for" ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)",
                  border: `1px solid ${mySide === "for" ? "rgba(16,185,129,0.35)" : "rgba(244,63,94,0.35)"}`,
                }}>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: mySide === "for" ? "var(--for)" : "var(--against)", marginBottom: "0.3rem" }}>
                  You are arguing
                </div>
                <div style={{ fontSize: "1.3rem", fontWeight: 900, color: mySide === "for" ? "var(--for)" : "var(--against)", letterSpacing: "-0.01em" }}
                  className={mySide === "for" ? "text-glow-for" : "text-glow-against"}>
                  {mySide === "for" ? "FOR THE MOTION" : "AGAINST THE MOTION"}
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0.4rem 0 0", lineHeight: 1.4 }}>
                  {isBuzzer
                    ? "Think fast — grab the mic first and make your case!"
                    : "Prepare your opening arguments — the clock is ticking!"}
                </p>
              </div>
            )}

          </div>

          {/* ── RIGHT COLUMN ────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

            {/* Team rosters */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", flexShrink: 0 }}>
              {([
                { side: "for" as const,     label: "FOR",     players: sidesFor,     color: "var(--for)",     borderColor: "rgba(16,185,129,0.3)", bgColor: "rgba(16,185,129,0.06)", avatarClass: "avatar-for" },
                { side: "against" as const, label: "AGAINST", players: sidesAgainst, color: "var(--against)", borderColor: "rgba(244,63,94,0.3)",  bgColor: "rgba(244,63,94,0.06)",  avatarClass: "avatar-against" },
              ] as const).map(({ side, label, players, color, borderColor, bgColor, avatarClass }) => (
                <div key={side} className="glass fade-up" style={{ padding: "0.875rem 1rem", border: `1px solid ${borderColor}`, background: bgColor }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", color, marginBottom: "0.5rem" }}>
                    {label} — {players.length}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {players.map((p: TurnOrderEntry) => {
                      const isYou = p.userId === user?.id;
                      return (
                        <div key={p.userId} style={{
                          display: "flex", alignItems: "center", gap: "0.625rem",
                          padding: "0.4rem 0.625rem", borderRadius: "0.5rem",
                          background: isYou ? (side === "for" ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)") : "rgba(249,247,255,0.4)",
                          border: isYou ? `1px solid ${borderColor}` : "1px solid transparent",
                        }}>
                          <div className={`avatar ${avatarClass}`} style={{ width: "1.6rem", height: "1.6rem", fontSize: "0.7rem", flexShrink: 0 }}>
                            {p.username.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.85rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.username}</span>
                          {isYou && (
                            <span className="badge" style={{ background: side === "for" ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)", color, fontSize: "0.58rem", flexShrink: 0 }}>YOU</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Speaking order — alternate mode only */}
            {!isBuzzer && (
              <div className="glass fade-up" style={{ padding: "0.875rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)" }}>Speaking Order</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{debate.totalRounds} round{debate.totalRounds !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                  {debate.turnOrder.map((p: TurnOrderEntry, i: number) => {
                    const isYou = p.userId === user?.id;
                    return (
                      <div key={p.userId}
                        className={p.side === "for" ? "badge badge-for" : "badge badge-against"}
                        style={{
                          padding: "4px 10px", fontSize: "0.72rem",
                          fontWeight: isYou ? 800 : 600,
                          boxShadow: isYou ? (p.side === "for" ? "0 0 10px rgba(16,185,129,0.4)" : "0 0 10px rgba(244,63,94,0.4)") : "none",
                          outline: isYou ? (p.side === "for" ? "2px solid rgba(16,185,129,0.5)" : "2px solid rgba(244,63,94,0.5)") : "none",
                        }}>
                        {i + 1}. {p.username}{isYou ? " (you)" : ""}
                      </div>
                    );
                  })}
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.72rem", marginTop: "0.5rem", marginBottom: 0 }}>
                  Order repeats for each round. Debate begins when the timer hits zero.
                </p>
              </div>
            )}

            {/* Buzzer rules — buzzer mode only */}
            {isBuzzer && (
              <div className="glass fade-up" style={{ padding: "0.875rem 1.25rem", border: "1px solid rgba(79,142,247,0.2)", background: "rgba(79,142,247,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--cyan)" }}>Buzzer Rules</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0.5rem" }}>
                  {[
                    { icon: "🎙", rule: `First to tap "Grab Mic" gets the floor` },
                    { icon: "⏱", rule: `Each slot is ${debate.turnDuration}s — release early or auto-submits` },
                    { icon: "🔁", rule: "5-second re-grab window opens after each speaker" },
                    { icon: "⚡", rule: "First grab earns +5 bonus XP" },
                    { icon: "❄️", rule: "Cooldown grows with each turn — share the mic" },
                    { icon: "🏁", rule: "Host ends the debate when discussion is done" },
                  ].map(({ icon, rule }) => (
                    <div key={rule} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", padding: "0.45rem 0.625rem", borderRadius: "0.5rem", background: "rgba(249,247,255,0.5)", border: "1px solid var(--border)" }}>
                      <span style={{ fontSize: "1rem", flexShrink: 0, lineHeight: 1.3 }}>{icon}</span>
                      <span style={{ fontSize: "0.74rem", color: "var(--subtle)", lineHeight: 1.4 }}>{rule}</span>
                    </div>
                  ))}
                </div>
                <p style={{ color: "var(--muted)", fontSize: "0.72rem", marginTop: "0.625rem", marginBottom: 0, textAlign: "center" }}>
                  Mic opens when the timer hits zero — get ready to grab!
                </p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
