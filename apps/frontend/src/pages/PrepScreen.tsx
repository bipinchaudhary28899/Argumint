import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { ConnectionStatusBanner } from "../components/ConnectionStatusBanner";
import { RoomHeader } from "../components/RoomHeader";
import { Icon, type IconName } from "../components/Icon";
import { initials } from "../components/AppShell";
import { useSocket } from "../hooks/useSocket";
import { useLeaveRoomOnNavigate } from "../hooks/useLeaveRoomOnNavigate";
import { useReconnectHandler } from "../hooks/useReconnectHandler";
import { useIsMobile } from "../hooks/useIsMobile";
import type { Debate, TurnOrderEntry } from "@argumint/shared";

// Judging rubric — mirrors the four 0–25 criteria the AI judge scores on.
const RUBRIC = [
  { label: "Clarity",      hint: "Is the argument easy to follow?" },
  { label: "Evidence",     hint: "Are claims backed with reasons, examples or facts?" },
  { label: "Rebuttal",     hint: "Do you engage the other side’s points?" },
  { label: "Organization", hint: "Is it structured logically?" },
];

function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export function PrepScreen() {
  const { code, debateId } = useParams<{ code: string; debateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, isConnected, isReconnecting, onReconnect } = useSocket();
  const isMobile = useIsMobile();

  const [debate, setDebate] = useState<Debate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useLeaveRoomOnNavigate(code, debate?.roomId, socket);

  // Stable ref for reconnect closure
  const reconnectParamsRef = useRef({ socket, debateId });
  useEffect(() => { reconnectParamsRef.current = { socket, debateId }; });

  const fetchDebateState = (s: typeof socket, id: typeof debateId) => {
    if (!s || !id) return;
    s.emit("debate:get-state", { debateId: id }, (res: any) => {
      if (!res?.success) { setError(res?.error || "Failed to load debate"); return; }
      setDebate(res.debate as Debate);
    });
  };

  useEffect(() => {
    if (!socket || !isConnected || !debateId) return;
    fetchDebateState(socket, debateId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, isConnected, debateId]);

  useReconnectHandler({
    onReconnect,
    enabled: !!debateId,
    reconnectFn: () => {
      const { socket: s, debateId: id } = reconnectParamsRef.current;
      fetchDebateState(s, id);
    },
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!socket || !code) return;
    const onTurnStarted = () => navigate(`/room/${code}/debate/${debateId}`);
    const onBuzzerOpen  = () => navigate(`/room/${code}/debate/${debateId}`);
    socket.on("debate:turn-started", onTurnStarted);
    socket.on("buzzer:open", onBuzzerOpen);
    return () => {
      socket.off("debate:turn-started", onTurnStarted);
      socket.off("buzzer:open", onBuzzerOpen);
    };
  }, [socket, code, navigate]);

  // ── Proactive mic permission warm-up ──────────────────────────────────
  // Fire during the prep countdown so the browser's permission dialog appears
  // well before Round 1 starts. We stop the tracks immediately — this purely
  // triggers the prompt. Doing this in DebatePage races with startRecording
  // for the first speaker and causes iOS to return a silent track.
  useEffect(() => {
    if (!debate) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isInApp =
      /FBAN|FBAV|Instagram|WhatsApp\/|TikTok|Snapchat|Twitter\//.test(ua) ||
      /\bwv\b/.test(ua) ||
      (/iPhone|iPod|iPad/.test(ua) && !/Safari\//.test(ua) && /AppleWebKit/.test(ua));
    if (isInApp) return;
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then((s) => s.getTracks().forEach((t) => t.stop()))
      .catch(() => { /* permission denied — will surface properly when turn starts */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!debate]);

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

  const circumference = 2 * Math.PI * 44;
  const ringOffset = circumference * (1 - ringPct);
  const isUrgent = secondsRemaining !== null && secondsRemaining <= 10;

  // Full-screen centred shell for the loading / error states
  const centred = {
    minHeight: "100vh", boxSizing: "border-box", padding: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--ds-bg)", color: "var(--ds-text)",
  } as const;

  if (error) {
    return (
      <div style={centred}>
        <div className="ds-card" style={{ padding: 32, maxWidth: 400, width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
          <p style={{ margin: 0, color: "var(--ds-against-text)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="info" size={18} />{error}
          </p>
          <button type="button" onClick={() => navigate(`/room/${code}/lobby`)} className="ds-btn ds-btn-ghost">Back to lobby</button>
        </div>
      </div>
    );
  }

  if (!debate) {
    return (
      <div style={centred}>
        <img src="/logo/brand/argumint-app-icon-dark.svg" alt="Loading…" className="logo-heartbeat" style={{ width: 72, height: 72 }} />
      </div>
    );
  }

  const isBuzzer = debate.mode === "buzzer";
  const sidesFor     = debate.turnOrder.filter((t: TurnOrderEntry) => t.side === "for");
  const sidesAgainst = debate.turnOrder.filter((t: TurnOrderEntry) => t.side === "against");
  const myTurnIndex  = debate.turnOrder.findIndex((t: TurnOrderEntry) => t.userId === user?.id);

  // Hero palette follows the side you were assigned; observers get the accent.
  const tone = mySide === "for"
    ? { bg: "var(--ds-for-bg)",     line: "var(--ds-for-line)",     mid: "var(--ds-for-mid)",     text: "var(--ds-for-text)" }
    : mySide === "against"
    ? { bg: "var(--ds-against-bg)", line: "var(--ds-against-line)", mid: "var(--ds-against-mid)", text: "var(--ds-against-text)" }
    : { bg: "var(--ds-accent-soft)", line: "var(--ds-accent-line)", mid: "var(--ds-accent-mid)", text: "var(--ds-accent)" };

  const clock = secondsRemaining === null
    ? "–"
    : `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`;
  const ringSize = isMobile ? 84 : 112;

  const speakLine = isBuzzer
    ? "First to grab the mic speaks"
    : myTurnIndex >= 0 ? `You speak ${ordinal(myTurnIndex + 1)}` : `${debate.turnOrder.length} debaters`;

  const card: React.CSSProperties = {
    padding: isMobile ? 18 : 24, borderRadius: 24, boxSizing: "border-box", minWidth: 0,
    background: "var(--ds-panel)", border: "1px solid var(--ds-border)", boxShadow: "var(--ds-shadow)",
    display: "flex", flexDirection: "column", gap: 16,
  };
  const cardTitle: React.CSSProperties = {
    margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ds-muted)",
  };
  const sideChip = (side: "for" | "against") => (
    <span className={`ds-chip ${side === "for" ? "ds-chip-for" : "ds-chip-against"}`} style={{ height: 26, fontSize: 11, letterSpacing: "0.1em" }}>
      {side === "for" ? "FOR" : "AGAINST"}
    </span>
  );
  const avatar = (name: string, size = 36) => (
    <span aria-hidden="true" style={{
      width: size, height: size, flexShrink: 0, borderRadius: 12, boxSizing: "border-box",
      background: "var(--ds-panel)", border: "1px solid var(--ds-border)",
      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12,
    }}>
      {initials(name)}
    </span>
  );

  const buzzerRules: { icon: IconName; rule: string }[] = [
    { icon: "mic",     rule: `First to tap "Grab Mic" gets the floor` },
    { icon: "timer",   rule: `Each slot is ${debate.turnDuration}s — release early or auto-submits` },
    { icon: "refresh", rule: "5-second re-grab window opens after each speaker" },
    { icon: "bolt",    rule: "First grab earns +5 bonus XP" },
    { icon: "users",   rule: "Cooldown grows with each turn — share the mic" },
    { icon: "flag",    rule: "Host ends the debate when discussion is done" },
  ];

  return (
    <div className="ds-room-page">
      <ConnectionStatusBanner isConnected={isConnected} isReconnecting={isReconnecting} />

      <RoomHeader
        onLeave={() => navigate("/")}
        motion={debate.topic}
        status={{ label: "Prep", tone: mySide ?? "accent" }}
        code={code}
      />

      <main className="ds-room-main">
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Side reveal + prep countdown ───────────────────────── */}
          <section style={{
            padding: isMobile ? "24px 20px" : "36px 40px", borderRadius: 28, boxSizing: "border-box",
            background: tone.bg, border: `1px solid ${tone.line}`,
            display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center",
            justifyContent: "space-between", gap: 24,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: tone.text }}>
                {mySide ? "Your side" : "Prep time"}
              </span>
              {mySide ? (
                <h1 style={{
                  margin: 0, fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.04em", color: tone.mid,
                  fontSize: isMobile ? (mySide === "for" ? 72 : 52) : "clamp(64px, 8vw, 120px)",
                }}>
                  {mySide === "for" ? "FOR" : "AGAINST"}
                </h1>
              ) : (
                <h1 style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? 28 : 40, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
                  Debate starts soon
                </h1>
              )}
              <p style={{ margin: 0, maxWidth: 640, fontSize: isMobile ? 16 : 20, fontWeight: 600, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                {debate.topic}
              </p>
              {mySide && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--ds-text3)", lineHeight: 1.45 }}>
                  {isBuzzer
                    ? "Think fast — grab the mic first and make your case!"
                    : "Prepare your opening arguments — the clock is ticking!"}
                </p>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
              <div role="timer" aria-label={`${secondsRemaining ?? 0} seconds of prep left`} style={{ position: "relative", width: ringSize, height: ringSize, flexShrink: 0 }}>
                <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="44" fill="none" stroke={tone.line} strokeWidth="7" />
                  <circle cx="50" cy="50" r="44" fill="none"
                    stroke={isUrgent ? "var(--ds-against-mid)" : tone.mid}
                    strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={ringOffset}
                    transform="rotate(-90 50 50)"
                    style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }} />
                </svg>
                <span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, lineHeight: 1,
                    fontSize: isMobile ? 20 : 26, color: isUrgent ? "var(--ds-against-text)" : "var(--ds-text)",
                  }}>
                    {clock}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--ds-muted)" }}>PREP</span>
                </span>
              </div>
              <span style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, color: "var(--ds-text3)" }}>
                <strong style={{ color: "var(--ds-text)", fontSize: 16 }}>{isBuzzer ? "Mic opens soon" : "Round 1 starts soon"}</strong>
                <span>{speakLine}</span>
                <span style={{ color: "var(--ds-muted)", fontSize: 13 }}>
                  {isBuzzer ? "Buzzer" : "Alternate"}
                  {!isBuzzer && ` · ${debate.totalRounds} round${debate.totalRounds !== 1 ? "s" : ""}`}
                  {` · ${debate.turnDuration}s turns`}
                </span>
              </span>
            </div>
          </section>

          <div style={{ display: "grid", gap: 20, alignItems: "start", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(auto-fit, minmax(280px, 1fr))" }}>

            {/* Turn order — alternate mode only */}
            {!isBuzzer && (
              <section style={card}>
                <h2 style={cardTitle}>Turn order</h2>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {debate.turnOrder.map((p: TurnOrderEntry, i: number) => {
                    const isYou = p.userId === user?.id;
                    return (
                      <li key={p.userId} style={{
                        display: "flex", alignItems: "center", gap: 12, minHeight: 56, padding: "0 12px", borderRadius: 14,
                        background: isYou ? "var(--ds-accent-soft)" : "var(--ds-raised)",
                        border: `1px solid ${isYou ? "var(--ds-accent-line)" : "transparent"}`,
                      }}>
                        <span style={{ width: 22, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "var(--ds-muted)" }}>{i + 1}</span>
                        {avatar(p.username)}
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.username}{isYou ? " (you)" : ""}
                        </span>
                        {sideChip(p.side)}
                      </li>
                    );
                  })}
                </ol>
                <span style={{ fontSize: 13, color: "var(--ds-muted)", lineHeight: 1.5 }}>
                  Order repeats for {debate.totalRounds} round{debate.totalRounds !== 1 ? "s" : ""} · {debate.turnDuration}s per turn. Debate begins when the timer hits zero.
                </span>
              </section>
            )}

            {/* Buzzer rules — buzzer mode only */}
            {isBuzzer && (
              <section style={card}>
                <h2 style={cardTitle}>Buzzer rules</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {buzzerRules.map(({ icon, rule }) => (
                    <div key={rule} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, borderRadius: 14, background: "var(--ds-raised)" }}>
                      <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: "var(--ds-accent-soft)", color: "var(--ds-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name={icon} size={16} />
                      </span>
                      <span style={{ fontSize: 14, color: "var(--ds-text2)", lineHeight: 1.45, alignSelf: "center" }}>{rule}</span>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>Mic opens when the timer hits zero — get ready to grab!</span>
              </section>
            )}

            {/* Team rosters */}
            <section style={card}>
              <h2 style={cardTitle}>Teams</h2>
              {([
                { side: "for" as const,     players: sidesFor     },
                { side: "against" as const, players: sidesAgainst },
              ]).map(({ side, players }) => (
                <div key={side} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {sideChip(side)}
                    <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>{players.length} debater{players.length !== 1 ? "s" : ""}</span>
                  </div>
                  {players.map((p: TurnOrderEntry) => {
                    const isYou = p.userId === user?.id;
                    return (
                      <div key={p.userId} style={{
                        display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "0 10px", borderRadius: 12,
                        background: "var(--ds-raised)",
                        border: `1px solid ${isYou ? (side === "for" ? "var(--ds-for-line)" : "var(--ds-against-line)") : "transparent"}`,
                      }}>
                        {avatar(p.username, 32)}
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.username}</span>
                        {isYou && <span className={`ds-chip ${side === "for" ? "ds-chip-for" : "ds-chip-against"}`} style={{ height: 22, fontSize: 10 }}>YOU</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>

            {/* Scoring rubric */}
            <section style={{ ...card, gap: 14 }}>
              <h2 style={cardTitle}>How you’re scored</h2>
              {RUBRIC.map(({ label, hint }) => (
                <div key={label} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 12, borderRadius: 14, background: "var(--ds-raised)" }}>
                  <span className="ds-mono" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: "var(--ds-accent-soft)", color: "var(--ds-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 12 }}>
                    25
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--ds-muted)" }}>{hint}</span>
                  </span>
                </div>
              ))}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
