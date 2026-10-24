/**
 * LevelRewards.tsx
 *
 * Layout:
 *   HERO     — level tile + title + XP progress to the next level
 *   ROADMAP  — horizontal milestone track (Lv 1 → 10)
 *   LEVELS   — every tier from LEVEL_TABLE: reached / current / next / locked
 *   HISTORY  — past debates: motion, debaters, judges, rank, points
 *
 * Theme / Pro colouring comes from the --ds-* tokens (Glacier and the Pro tier
 * override them in index.css).
 */

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { getLevelInfo, LEVEL_TABLE } from "@argumint/shared";
import { AppShell } from "../components/AppShell";
import { Icon, type IconName } from "../components/Icon";
import { historyApi, type DebateHistoryEntry } from "../services/api";

// Module-level cache — survives tab switches (component unmount/remount) within
// the same browser session. Cleared on full page reload automatically.
let _historyCache: DebateHistoryEntry[] | null = null;

export function _resetCacheForTests() {
  _historyCache = null;
}

const MONO = "'JetBrains Mono', monospace";
const fmt  = (n: number) => n.toLocaleString();

const ROADMAP_MILESTONES: { level: number; icon: IconName }[] = [
  { level: 1,  icon: "mic"    },
  { level: 2,  icon: "chart"  },
  { level: 3,  icon: "flag"   },
  { level: 5,  icon: "shield" },
  { level: 7,  icon: "bolt"   },
  { level: 10, icon: "crown"  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LevelRewards() {
  const { user }  = useAuth();
  const isMobile  = useIsMobile();

  const xp        = (user as any)?.xp ?? 0;
  const lvlInfo   = getLevelInfo(xp);
  const curLevel  = lvlInfo.current.level;
  const next      = lvlInfo.next;
  const toNext    = next ? Math.max(0, next.minXP - xp) : 0;

  const [history, setHistory]   = useState<DebateHistoryEntry[]>(_historyCache ?? []);
  const [loading, setLoading]   = useState(_historyCache === null);

  useEffect(() => {
    // If we already have cached data, skip the fetch entirely
    if (_historyCache !== null) return;

    historyApi.getHistory().then(data => {
      _historyCache = data;
      setHistory(data);
      setLoading(false);
    });
  }, []);

  // ── Roadmap fill % ──────────────────────────────────────────────────────────
  const MILESTONE_LEVELS = ROADMAP_MILESTONES.map(m => m.level);
  const milestoneAt = (level: number) => ((level - 1) / 9) * 100;
  const nextMilestoneLevel = MILESTONE_LEVELS.find(l => l > curLevel);
  const curMilPos  = milestoneAt(curLevel);
  const nextMilPos = nextMilestoneLevel ? milestoneAt(nextMilestoneLevel) : 100;
  const fillPct    = curMilPos + (nextMilPos - curMilPos) * (lvlInfo.progressPct / 100);

  const firstTier = LEVEL_TABLE[0];
  const lastTier  = LEVEL_TABLE[LEVEL_TABLE.length - 1];

  // ─── Hero ────────────────────────────────────────────────────────────────────
  const Hero = (
    <section className="ds-card" aria-label="Your level" style={{
      padding: isMobile ? "22px 20px" : 32, borderRadius: 28,
      display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center", gap: 28,
    }}>
      <div style={{
        width: isMobile ? 104 : 136, height: isMobile ? 104 : 136, flexShrink: 0, borderRadius: 32,
        background: "var(--ds-primary-fill)", color: "var(--ds-on-primary)", boxShadow: "var(--ds-primary-shadow)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".14em", opacity: .85 }}>LEVEL</span>
        <span style={{ fontWeight: 800, fontSize: isMobile ? 44 : 60, lineHeight: 1 }}>{curLevel}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ds-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.username}
          </span>
          <span style={{ fontWeight: 800, fontSize: isMobile ? 28 : 36, letterSpacing: "-.02em" }}>{lvlInfo.current.title}</span>
        </div>

        {next ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span style={{ fontFamily: MONO, fontWeight: 600 }}>{fmt(xp)} XP</span>
              <span style={{ color: "var(--ds-muted)", textAlign: "right" }}>{next.title} at {fmt(next.minXP)}</span>
            </span>
            <div
              className="ds-track"
              role="progressbar"
              aria-label={`Progress to ${next.title}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={lvlInfo.progressPct}
              style={{ height: 14 }}
            >
              <div style={{ width: `${lvlInfo.progressPct}%` }} />
            </div>
            <span style={{ fontSize: 14, color: "var(--ds-text3)" }}>
              <strong style={{ color: "var(--ds-accent)" }}>{fmt(toNext)} XP</strong> to Level {next.level}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 14 }}>{fmt(xp)} XP</span>
            <span className="ds-chip ds-chip-gold" style={{ alignSelf: "flex-start" }}>
              <Icon name="crown" size={14} />Max Level — {lvlInfo.current.title}
            </span>
          </div>
        )}
      </div>
    </section>
  );

  // ─── Horizontal Roadmap ───────────────────────────────────────────────────────
  const node = isMobile ? 28 : 36;  // milestone circle size
  const Roadmap = (
    <section className="ds-card" aria-label="Your roadmap" style={{ padding: isMobile ? "18px 16px" : "22px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
      <span className="ds-eyebrow">Your Roadmap</span>
      <div style={{ position: "relative", height: node + 26, margin: `0 ${node / 2}px` }}>
        <div style={{ position: "absolute", top: node / 2 - 2, left: 0, right: 0, height: 4, borderRadius: 99, background: "var(--ds-track)" }} />
        <div style={{ position: "absolute", top: node / 2 - 2, left: 0, height: 4, borderRadius: 99, width: `${fillPct}%`, background: "var(--ds-xp-fill)", transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
        {ROADMAP_MILESTONES.map((m) => {
          const reached = curLevel >= m.level;
          const active  = curLevel === m.level;
          return (
            <div key={m.level} style={{
              position: "absolute", left: `${milestoneAt(m.level)}%`, transform: "translateX(-50%)",
              top: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <div aria-hidden="true" style={{
                width: node, height: node, borderRadius: "50%", zIndex: 1,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: reached ? "var(--ds-accent-soft)" : "var(--ds-raised)",
                color: reached ? "var(--ds-accent)" : "var(--ds-faint)",
                border: `2px solid ${reached ? "var(--ds-accent-line)" : "var(--ds-border)"}`,
                boxShadow: active ? "0 0 0 4px var(--ds-accent-soft)" : "none",
              }}>
                <Icon name={m.icon} size={isMobile ? 13 : 16} />
              </div>
              <span style={{ fontSize: isMobile ? 11 : 12, fontWeight: active ? 800 : 600, color: reached ? "var(--ds-accent)" : "var(--ds-faint)", whiteSpace: "nowrap" }}>
                Lv {m.level}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );

  // ─── All levels ──────────────────────────────────────────────────────────────
  const Levels = (
    <section aria-label="All levels">
      <ol style={{
        margin: 0, padding: 0, listStyle: "none", display: "grid",
        gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(5, minmax(0, 1fr))", gap: 12,
      }}>
        {LEVEL_TABLE.map(entry => {
          const reached = curLevel > entry.level;
          const current = curLevel === entry.level;
          const isNext  = !!next && entry.level === next.level;
          const status: { icon: IconName; label: string; color: string } =
              reached ? { icon: "check", label: "Reached",              color: "var(--ds-for-text)" }
            : current ? { icon: "star",  label: "Current",              color: "var(--ds-accent)" }
            : isNext  ? { icon: "right", label: `${fmt(toNext)} to go`, color: "var(--ds-text)" }
            :           { icon: "lock",  label: "Locked",               color: "var(--ds-faint)" };
          return (
            <li key={entry.level} aria-current={current ? "step" : undefined} style={{
              padding: isMobile ? "14px 16px" : 18, borderRadius: 20,
              background: current ? "var(--ds-accent-soft)" : "var(--ds-panel)",
              border: `1px solid ${current ? "var(--ds-accent-line)" : isNext ? "var(--ds-border2)" : "var(--ds-border)"}`,
              display: "flex", flexDirection: isMobile ? "row" : "column", alignItems: isMobile ? "center" : "flex-start",
              gap: 12, minHeight: isMobile ? 0 : 170,
            }}>
              <span style={{
                width: 44, height: 44, flexShrink: 0, borderRadius: 14,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16,
                background: current ? "var(--ds-primary-fill)" : reached ? "var(--ds-for-bg)" : "var(--ds-raised)",
                color: current ? "var(--ds-on-primary)" : reached ? "var(--ds-for-text)" : "var(--ds-muted)",
              }}>
                {entry.level}
              </span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: reached || current || isNext ? "var(--ds-text)" : "var(--ds-muted)" }}>{entry.title}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--ds-muted)" }}>{fmt(entry.minXP)} XP</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: status.color, whiteSpace: "nowrap" }}>
                <Icon name={status.icon} size={14} />{status.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );

  // ─── History helpers ──────────────────────────────────────────────────────────
  const rankLabel = (rank: number | null, total: number) => {
    if (rank === null) return "—";
    if (rank === 1) return "1st";
    if (rank === 2) return "2nd";
    if (rank === 3) return "3rd";
    return `${rank}/${total}`;
  };
  const rankColor = (rank: number | null) =>
    rank === 1 ? "var(--ds-gold-text)" : rank !== null && rank <= 3 ? "var(--ds-accent)" : "var(--ds-text)";

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  const cols = "minmax(0,1fr) 80px 64px 80px 80px";
  const mobileLabel = (l: string) => <span style={{ fontSize: 12, color: "var(--ds-muted)", width: 64, flexShrink: 0 }}>{l}</span>;

  // ─── History List ─────────────────────────────────────────────────────────────
  const HistoryList = (
    <section aria-label="Debate history" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="ds-eyebrow">Debate History</span>
        {history.length > 0 && <span className="ds-chip ds-chip-accent ds-mono" style={{ height: 22 }}>{history.length}</span>}
      </div>

      {/* Header row */}
      {!isMobile && (
        <div style={{
          display: "grid", gridTemplateColumns: cols, gap: 14, padding: "0 18px",
          fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ds-faint)",
        }}>
          {["Motion", "Debaters", "Judges", "Rank", "Points"].map((h, i) => (
            <div key={h} style={{ textAlign: i > 2 ? "right" : undefined }}>{h}</div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="ds-card" style={{ padding: 28, textAlign: "center", fontSize: 14, color: "var(--ds-muted)" }}>Loading history…</div>
      ) : history.length === 0 ? (
        <div className="ds-card" style={{ padding: isMobile ? 24 : 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
          <span style={{ color: "var(--ds-accent)", display: "inline-flex" }}><Icon name="mic" size={28} /></span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>No debates yet</span>
          <span style={{ fontSize: 14, color: "var(--ds-muted)" }}>Join or create a room to start earning XP</span>
        </div>
      ) : (
        history.map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: isMobile ? 16 : "14px 18px", borderRadius: 16,
              background: "var(--ds-panel)", border: "1px solid var(--ds-border)",
              display: isMobile ? "flex" : "grid",
              gridTemplateColumns: cols,
              flexDirection: isMobile ? "column" : undefined,
              gap: isMobile ? 8 : 14,
              alignItems: isMobile ? undefined : "center",
            }}
          >
            {/* Motion */}
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{
                fontWeight: 600, fontSize: 15, lineHeight: 1.4,
                overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {entry.topic}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--ds-muted)" }}>
                <span>{formatDate(entry.endedAt)}</span>
                <span className={`ds-chip ${entry.mode === "buzzer" ? "ds-chip-gold" : "ds-chip-neutral"}`} style={{ height: 22, textTransform: "uppercase", letterSpacing: ".06em", fontSize: 11 }}>
                  {entry.mode}
                </span>
                {entry.side && (
                  <span className={`ds-chip ${entry.side === "for" ? "ds-chip-for" : "ds-chip-against"}`} style={{ height: 22, textTransform: "uppercase", letterSpacing: ".06em", fontSize: 11 }}>
                    {entry.side}
                  </span>
                )}
                {entry.isWinner !== null && (
                  <span style={{ fontWeight: 700, color: entry.isWinner ? "var(--ds-for-text)" : "var(--ds-muted)" }}>
                    {entry.isWinner ? "Won" : "Lost"}
                  </span>
                )}
              </div>
            </div>

            {/* Debaters */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isMobile && mobileLabel("Debaters")}
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{entry.totalDebaters}</span>
              <span aria-hidden="true" style={{ color: "var(--ds-faint)", display: "inline-flex" }}><Icon name="mic" size={14} /></span>
            </div>

            {/* Judges */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {isMobile && mobileLabel("Judges")}
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: entry.totalJudges > 0 ? "var(--ds-text)" : "var(--ds-faint)" }}>
                {entry.totalJudges > 0 ? entry.totalJudges : "—"}
              </span>
              {entry.totalJudges > 0 && <span aria-hidden="true" style={{ color: "var(--ds-faint)", display: "inline-flex" }}><Icon name="scale" size={14} /></span>}
            </div>

            {/* Rank */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: isMobile ? undefined : "flex-end" }}>
              {isMobile && mobileLabel("Rank")}
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: rankColor(entry.rank) }}>
                {rankLabel(entry.rank, entry.totalParticipants)}
              </span>
            </div>

            {/* Points */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: isMobile ? undefined : "flex-end" }}>
              {isMobile && mobileLabel("Points")}
              {entry.points !== null ? (
                <>
                  <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: "var(--ds-accent)" }}>{entry.points}</span>
                  <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>pts</span>
                </>
              ) : (
                <span style={{ fontSize: 14, color: "var(--ds-faint)" }}>—</span>
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );

  return (
    <AppShell active="rewards">
      <div className="ds-page" style={{ gap: 22 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 className="ds-h1" style={isMobile ? { fontSize: 24 } : undefined}>Level Rewards</h1>
          <p className="ds-sub">
            Every debate you finish earns XP. {LEVEL_TABLE.length} tiers from {firstTier.title} to {lastTier.title} — no paywall, just put in the reps.
          </p>
        </header>

        {Hero}
        {Roadmap}
        {Levels}
        {HistoryList}
      </div>
    </AppShell>
  );
}
