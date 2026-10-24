import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getLevelInfo } from "@argumint/shared";
import { useIsMobile } from "../hooks/useIsMobile";
import { AppShell, initials } from "../components/AppShell";
import { Icon } from "../components/Icon";
import { ProWelcomeModal } from "../components/ProWelcomeModal";
import { platformApi, historyApi, type DebateHistoryEntry } from "../services/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  id: string;
  username: string;
  xp: number;
  debatesWon: number;
  totalDebates: number;
}

type PlatformStats = { activeRooms: number; liveDebates: number; totalDebates: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function winRate(won: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((won / total) * 100)}%`;
}

function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** "Orator" → "an Orator", "Debater" → "a Debater" */
function withArticle(title: string): string {
  return `${/^[aeiou]/i.test(title) ? "an" : "a"} ${title}`;
}

/** Today / Yesterday / "Oct 20" (adds the year when it isn't this year) */
function relativeDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const now = new Date();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

const BAND_CHIP: Record<string, string> = { strong: "ds-chip-for", moderate: "ds-chip-neutral", flagged: "ds-chip-against" };
const BAND_COPY: Record<string, string> = {
  strong:   "Your scores line up closely with the AI judge and other judges.",
  moderate: "Your scores mostly line up with the AI judge and other judges.",
  flagged:  "Your scores often differ from the AI judge and other judges.",
};

const cardPad = (isMobile: boolean) => (isMobile ? 20 : 28);

// ─── Module-level cache (survives tab switches / route navigations) ───────────
let _statsCache: PlatformStats | null = null;
let _leaderboardCache: LeaderboardEntry[] | null = null;
let _historyCache: DebateHistoryEntry[] | null = null;

/** Exported only for unit tests — do not call in production code. */
export function _resetCacheForTests() {
  _statsCache = null;
  _leaderboardCache = null;
  _historyCache = null;
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function SectionHead({ title, link, onLink }: { title: string; link: string; onLink: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2>
      <button type="button" className="ds-link" style={{ fontSize: 14 }} onClick={onLink}>{link}</button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="ds-raised" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: "var(--ds-muted)", fontWeight: 600 }}>{label}</span>
      <span className="ds-mono" style={{ fontSize: 24, fontWeight: 600, color: color ?? "var(--ds-text)" }}>{value}</span>
    </div>
  );
}

function PlatformChip({ dot, value, label }: { dot?: "green" | "red"; value: number; label: string }) {
  return (
    <span className="ds-chip ds-chip-neutral" style={{ height: 30, gap: 8 }}>
      {dot && <span className={`pulse-dot pulse-dot-${dot}`} style={{ width: 8, height: 8 }} aria-hidden="true" />}
      <span className="ds-mono" style={{ color: "var(--ds-text)" }}>{value.toLocaleString()}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
    </span>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function Home() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const isMobile  = useIsMobile();
  // Below the full-sidebar breakpoint the shell switches to an icon rail —
  // stack the 2-column board rows there so the cards keep a readable width.
  const isNarrow  = useIsMobile(1100);
  const isPro       = (user as any)?.isPro ?? false;
  const subStatus   = (user as any)?.subscriptionStatus ?? null;
  const isCancelled = subStatus === "cancelled";
  const myId        = (user as any)?.id ?? null;

  // Seed from cache so there's no empty-state flash on remount
  const [stats,       setStats]       = useState<PlatformStats | null>(_statsCache);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(_leaderboardCache ?? []);
  const [history,     setHistory]     = useState<DebateHistoryEntry[] | null>(_historyCache);
  const [code,        setCode]        = useState("");

  // Pro welcome modal — shown once per user after first upgrade
  const userId = (user as any)?.id ?? (user as any)?._id ?? "";
  const [showProWelcome, setShowProWelcome] = useState(() => {
    if (!isPro || !userId) return false;
    return !localStorage.getItem(`proWelcome_${userId}`);
  });

  const xp          = (user as any)?.xp ?? 0;
  const lvlInfo     = getLevelInfo(xp);
  const userStats   = (user as any)?.stats ?? { debatesWon: 0, debatesLost: 0, totalDebates: 0 };
  const judgeStats  = (user as any)?.judgeStats ?? { totalSessions: 0, credibilityScore: 0.75, credibilityBand: "moderate", lastJudgedAt: null };

  useEffect(() => {
    // Fetch once on first visit; skip on subsequent mounts (cache is warm).
    // Data refreshes naturally on full page reload — no polling needed.
    if (_statsCache && _leaderboardCache) return;
    let alive = true;
    Promise.all([platformApi.getStats(), platformApi.getLeaderboard()]).then(([s, lb]) => {
      if (!alive) return;
      _statsCache = s;
      _leaderboardCache = lb;
      setStats(s);
      setLeaderboard(lb);
    }).catch(() => { /* network errors are non-fatal — UI degrades gracefully */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    // Same once-per-session policy for the "Recent debates" card
    if (_historyCache) return;
    let alive = true;
    historyApi.getHistory().then(data => {
      _historyCache = data;
      if (alive) setHistory(data);
    }).catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, []);

  const pad = cardPad(isMobile);
  const twoCol = (cols: string) => (isNarrow ? "minmax(0,1fr)" : cols);

  // ─── Header ───────────────────────────────────────────────────────────────
  const nextMinXP = lvlInfo.next ? xp - lvlInfo.progressXP + lvlInfo.neededXP : null;
  const subLine = lvlInfo.next
    ? `${(lvlInfo.neededXP - lvlInfo.progressXP).toLocaleString()} XP until you're ${withArticle(lvlInfo.next.title)}.`
    : `Top level reached — you're ${withArticle(lvlInfo.current.title)}.`;

  const ProStatus = isPro ? (
    <button
      type="button"
      onClick={() => navigate("/pricing")}
      className="ds-chip ds-chip-gold"
      style={{ height: 36, padding: "0 12px", border: "1px solid var(--ds-gold-line)", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em" }}
      title="Manage subscription"
    >
      <Icon name="crown" size={16} />
      {isCancelled ? "PRO (ending)" : "PRO"}
    </button>
  ) : (
    <button type="button" onClick={() => navigate("/pricing")} className="ds-btn ds-btn-ghost" title="Judges · Spectators · Buzzer · Voting — ₹50/mo">
      <Icon name="bolt" size={18} />Upgrade
    </button>
  );

  const Header = (
    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <h1 className="ds-h1" style={isMobile ? { fontSize: 22 } : undefined}>
          {greeting()}{user?.username ? `, ${user.username}` : ""}
        </h1>
        <p className="ds-sub">{subLine}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {ProStatus}
        {!isMobile && (
          <button type="button" onClick={() => navigate("/create-room")} className="ds-btn ds-btn-primary">
            <Icon name="plus" size={18} />New room
          </button>
        )}
      </div>
    </header>
  );

  // ─── Platform stats strip ─────────────────────────────────────────────────
  const PlatformStrip = (
    <div aria-label="Platform activity" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: -8 }}>
      <PlatformChip value={stats?.totalDebates ?? 0} label="debates hosted" />
      {(stats?.activeRooms ?? 0) > 0 && <PlatformChip dot="green" value={stats!.activeRooms} label="rooms open" />}
      {(stats?.liveDebates ?? 0) > 0 && <PlatformChip dot="red" value={stats!.liveDebates} label="live now" />}
    </div>
  );

  // ─── Level card ───────────────────────────────────────────────────────────
  const LevelCard = (
    <div className="ds-card" style={{ padding: pad, display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          aria-hidden="true"
          style={{
            width: isMobile ? 60 : 72, height: isMobile ? 60 : 72, flexShrink: 0, borderRadius: 22,
            background: "var(--ds-avatar-bg)", color: "var(--ds-avatar-fg)",
            display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22,
          }}
        >
          {initials(user?.username)}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="ds-eyebrow">Level {lvlInfo.current.level}</span>
          <span style={{ fontWeight: 800, fontSize: isMobile ? 24 : 30, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lvlInfo.current.title}
          </span>
        </div>
        <button type="button" className="ds-link" onClick={() => navigate("/level-rewards")} style={{ marginLeft: "auto", fontSize: 14, whiteSpace: "nowrap" }}>
          All levels
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, color: "var(--ds-muted)" }}>
          <span className="ds-mono" style={{ color: "var(--ds-text)", fontWeight: 600 }}>{xp.toLocaleString()} XP</span>
          <span>{lvlInfo.next && nextMinXP !== null ? `${lvlInfo.next.title} at ${nextMinXP.toLocaleString()}` : "Max level"}</span>
        </div>
        <div
          className="ds-track"
          style={{ height: 12 }}
          role="progressbar"
          aria-label="Level progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={lvlInfo.progressPct}
        >
          <div style={{ width: `${lvlInfo.progressPct}%` }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0,1fr))`, gap: 12 }}>
        <Stat label="Debates"  value={userStats.totalDebates} />
        <Stat label="Wins"     value={userStats.debatesWon}  color="var(--ds-for-text)" />
        <Stat label="Losses"   value={userStats.debatesLost} />
        <Stat label="Win rate" value={winRate(userStats.debatesWon, userStats.totalDebates)} />
      </div>
    </div>
  );

  // ─── Judge credibility card ───────────────────────────────────────────────
  const hasJudged = (judgeStats.totalSessions ?? 0) > 0;
  const credScore = judgeStats.credibilityScore ?? 0.75;
  const credBand  = judgeStats.credibilityBand ?? "moderate";
  const markerPct = Math.max(0, Math.min(100, credScore * 100));

  const JudgeCard = (
    <button
      type="button"
      onClick={() => navigate("/judge-credibility")}
      className="ds-card"
      style={{
        padding: pad, display: "flex", flexDirection: "column", gap: 18, minWidth: 0,
        textAlign: "left", cursor: "pointer", color: "var(--ds-text)", font: "inherit",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 700, color: "var(--ds-text3)" }}>
          <span style={{ color: "var(--ds-accent)", display: "inline-flex" }}><Icon name="scale" size={20} /></span>
          Judge credibility
        </span>
        {hasJudged && (
          <span className={`ds-chip ${BAND_CHIP[credBand] ?? "ds-chip-neutral"}`} style={{ textTransform: "capitalize" }}>{credBand}</span>
        )}
      </span>

      <span style={{ fontWeight: 800, fontSize: 56, letterSpacing: "-0.03em", lineHeight: 1, color: hasJudged ? "var(--ds-text)" : "var(--ds-faint)" }}>
        {hasJudged ? credScore.toFixed(2) : "—"}
      </span>

      <span
        aria-hidden="true"
        style={{
          position: "relative", display: "block", width: "100%", height: 10, borderRadius: 99,
          background: "linear-gradient(90deg, var(--ds-against-mid) 0, var(--ds-against-mid) 45%, var(--ds-mid) 45%, var(--ds-mid) 75%, var(--ds-for-mid) 75%, var(--ds-for-mid) 100%)",
          opacity: hasJudged ? 1 : 0.45,
        }}
      >
        {hasJudged && (
          <span style={{ position: "absolute", left: `calc(${markerPct}% - 2px)`, top: -5, width: 4, height: 20, borderRadius: 2, background: "var(--ds-text)" }} />
        )}
      </span>

      <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ds-muted)" }}>
          {hasJudged
            ? `Based on ${judgeStats.totalSessions} judged debate${judgeStats.totalSessions === 1 ? "" : "s"}. ${BAND_COPY[credBand] ?? ""}`
            : "Join a room as a judge to start building your credibility score."}
        </span>
        {hasJudged && judgeStats.lastJudgedAt && (
          <span style={{ fontSize: 12, color: "var(--ds-faint)" }}>
            Last judged: {new Date(judgeStats.lastJudgedAt).toLocaleDateString()}
          </span>
        )}
      </span>

      <span style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: "var(--ds-link)" }}>
        {hasJudged ? "See pillar breakdown" : "How credibility works"}
        <Icon name="right" size={16} />
      </span>
    </button>
  );

  // ─── Create / join tiles ──────────────────────────────────────────────────
  const canJoin = code.length === 6;
  const CreateTile = (
    <button
      type="button"
      onClick={() => navigate("/create-room")}
      style={{
        minHeight: 180, boxSizing: "border-box", padding: pad, borderRadius: 24, border: 0, cursor: "pointer",
        background: "var(--ds-primary-fill)", color: "var(--ds-on-primary)", boxShadow: "var(--ds-primary-shadow)",
        display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "flex-start", gap: 20,
        textAlign: "left", font: "inherit",
      }}
    >
      <span style={{ width: 48, height: 48, borderRadius: 14, background: "color-mix(in srgb, var(--ds-on-primary) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="plus" size={24} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em" }}>Create a room</span>
        <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.9 }}>Set the motion, pick Alternate or Buzzer, invite with a code.</span>
      </span>
    </button>
  );

  const JoinTile = (
    <div className="ds-card" style={{ padding: pad, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 20, minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em" }}>Join with a code</span>
        <span style={{ fontSize: 15, color: "var(--ds-muted)" }}>Six characters, shared by the host.</span>
      </div>
      <form
        style={{ display: "flex", gap: 10 }}
        onSubmit={e => {
          e.preventDefault();
          if (canJoin) navigate("/join-room", { state: { code } });
        }}
      >
        <label htmlFor="home-code" className="sr-only">Room code</label>
        <input
          id="home-code"
          className="ds-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={6}
          placeholder="K7Q2XM"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          style={{ flex: 1, minWidth: 0, width: "auto", font: "600 20px 'JetBrains Mono', monospace", letterSpacing: "0.2em", textTransform: "uppercase" }}
        />
        <button
          type="submit"
          className="ds-btn"
          disabled={!canJoin}
          style={{ height: 52, background: "var(--ds-text)", color: "var(--ds-panel)", flexShrink: 0 }}
        >
          Join
        </button>
      </form>
    </div>
  );

  // ─── Recent debates ───────────────────────────────────────────────────────
  const recent = (history ?? []).slice(0, 4);
  const RecentCard = (
    <div className="ds-card" style={{ padding: pad, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <SectionHead title="Recent debates" link="View all" onLink={() => navigate("/history")} />
      {history === null ? (
        <p className="ds-sub" style={{ fontSize: 14 }}>Loading your debates…</p>
      ) : recent.length === 0 ? (
        <p className="ds-sub" style={{ fontSize: 14, lineHeight: 1.5 }}>
          No debates yet — create or join a room and your results will show up here.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recent.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => navigate(`/room/${d.roomCode}/analysis/${d.id}`)}
              className="ds-raised"
              style={{
                padding: "14px 16px", border: 0, cursor: "pointer", textAlign: "left", font: "inherit", color: "var(--ds-text)",
                display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 12,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{d.topic}</span>
                <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ds-muted)" }}>
                  {d.side && (
                    <span className={`ds-chip ${d.side === "for" ? "ds-chip-for" : "ds-chip-against"}`} style={{ height: 22, padding: "0 8px", borderRadius: 6, letterSpacing: "0.08em" }}>
                      {d.side === "for" ? "FOR" : "AGAINST"}
                    </span>
                  )}
                  <span>{d.mode === "buzzer" ? "Buzzer" : "Alternate"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{relativeDay(d.endedAt)}</span>
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                {d.isWinner !== null && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: d.isWinner ? "var(--ds-for-text)" : "var(--ds-muted)" }}>
                    {d.isWinner ? "Won" : "Lost"}
                  </span>
                )}
                {d.points !== null && (
                  <span className="ds-mono" style={{ fontWeight: 600, fontSize: 15 }} title="Your score">{d.points}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Top debaters ─────────────────────────────────────────────────────────
  const myIndex = myId ? leaderboard.findIndex(e => e.id === myId) : -1;
  const topRows = leaderboard.slice(0, 4).map((e, i) => ({ entry: e, rank: String(i + 1) }));
  if (user && leaderboard.length > 0 && (myIndex === -1 || myIndex >= 4)) {
    topRows.push(myIndex >= 4
      ? { entry: leaderboard[myIndex], rank: String(myIndex + 1) }
      // Not in the fetched top list — show the user's own row without a rank
      : { entry: { id: myId ?? "me", username: user.username, xp, debatesWon: userStats.debatesWon, totalDebates: userStats.totalDebates }, rank: "—" });
  }

  const TopCard = (
    <div className="ds-card" style={{ padding: pad, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <SectionHead title="Top debaters" link="Leaderboard" onLink={() => navigate("/leaderboard")} />
      {leaderboard.length === 0 ? (
        <p className="ds-sub" style={{ fontSize: 14 }}>No data yet — be the first!</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {topRows.map(({ entry, rank }) => {
            const isMe = (!!myId && entry.id === myId) || rank === "—";
            const lvl  = getLevelInfo(entry.xp);
            return (
              <li
                key={entry.id}
                aria-current={isMe ? "true" : undefined}
                style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "0 10px", borderRadius: 12, background: isMe ? "var(--ds-accent-soft)" : "transparent" }}
              >
                <span className="ds-mono" style={{ width: 22, fontWeight: 600, color: "var(--ds-muted)", flexShrink: 0 }}>{rank}</span>
                <span className="ds-avatar" style={{ width: 34, height: 34, fontSize: 12, background: "var(--ds-raised)", border: "1px solid var(--ds-border)", color: "var(--ds-text)" }}>
                  {initials(entry.username)}
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.username}{isMe ? " (you)" : ""}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>Lv {lvl.current.level} · {lvl.current.title}</span>
                </span>
                <span className="ds-mono" style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>{entry.xp.toLocaleString()}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  return (
    <AppShell active="home">
      <div className="ds-page" style={isMobile ? { gap: 20 } : undefined}>
        {Header}
        {PlatformStrip}

        <section style={{ display: "grid", gridTemplateColumns: twoCol("minmax(0,2fr) minmax(0,1fr)"), gap: 20 }}>
          {LevelCard}
          {JudgeCard}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))", gap: 20 }}>
          {CreateTile}
          {JoinTile}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: twoCol("minmax(0,1.6fr) minmax(0,1fr)"), gap: 20, alignItems: "start" }}>
          {RecentCard}
          {TopCard}
        </section>
      </div>

      {/* Pro welcome modal — shown once after first upgrade */}
      {showProWelcome && userId && (
        <ProWelcomeModal
          userId={userId}
          onClose={() => setShowProWelcome(false)}
        />
      )}
    </AppShell>
  );
}
