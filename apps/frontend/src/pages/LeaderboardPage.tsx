/**
 * LeaderboardPage.tsx — view over GET /auth/leaderboard (top debaters by XP).
 *
 * Layout:
 *   PODIUM  — top three (2 · 1 · 3)
 *   TABLE   — remaining ranks; the signed-in user is highlighted, and appended
 *             with their own stats when they're outside the board.
 */

import { useEffect, useState } from "react";
import { getLevelInfo } from "@argumint/shared";
import { AppShell, initials } from "../components/AppShell";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { platformApi } from "../services/api";

interface LeaderboardEntry {
  id:           string;
  username:     string;
  xp:           number;
  debatesWon:   number;
  totalDebates: number;
}

// Module-level cache — survives tab switches (unmount/remount) within the session.
let _leaderboardCache: LeaderboardEntry[] | null = null;

export function _resetCacheForTests() {
  _leaderboardCache = null;
}

const fmt = (n: number) => n.toLocaleString();

function levelLine(xp: number) {
  const { current } = getLevelInfo(xp);
  return `Lv ${current.level} · ${current.title}`;
}

function record(e: Pick<LeaderboardEntry, "debatesWon" | "totalDebates">) {
  const lost = Math.max(0, e.totalDebates - e.debatesWon);
  const pct  = e.totalDebates > 0 ? `${Math.round((e.debatesWon / e.totalDebates) * 100)}%` : "—";
  return { wl: `${e.debatesWon}–${lost}`, pct };
}

// Podium accent per place: gold / silver / accent (as on the board)
const PLACE_COLOR: Record<number, string> = {
  1: "var(--ds-gold-mid)",
  2: "var(--ds-text3)",
  3: "var(--ds-accent)",
};

const MONO = "'JetBrains Mono', monospace";

export function LeaderboardPage() {
  const { user }  = useAuth();
  const isMobile  = useIsMobile();
  const myId      = user?.id;

  const [board, setBoard]     = useState<LeaderboardEntry[]>(_leaderboardCache ?? []);
  const [loading, setLoading] = useState(_leaderboardCache === null);

  useEffect(() => {
    // Warm cache → no refetch on remount
    if (_leaderboardCache !== null) return;
    platformApi.getLeaderboard().then(data => {
      _leaderboardCache = data;
      setBoard(data);
      setLoading(false);
    });
  }, []);

  const podium = board.slice(0, 3);
  const rest   = board.slice(3);
  const onBoard = !!myId && board.some(e => e.id === myId);

  // Signed-in user outside the board — show their own row from the auth profile.
  const meRow: LeaderboardEntry | null = !onBoard && user ? {
    id:           user.id,
    username:     user.username,
    xp:           user.xp ?? 0,
    debatesWon:   user.stats?.debatesWon ?? 0,
    totalDebates: user.stats?.totalDebates ?? 0,
  } : null;

  // Podium order on screen: 2nd, 1st, 3rd
  const podiumOrder = [podium[1], podium[0], podium[2]]
    .map((e, i) => e ? { entry: e, place: [2, 1, 3][i] } : null)
    .filter(Boolean) as { entry: LeaderboardEntry; place: number }[];

  const cols = isMobile
    ? "28px minmax(0,1fr) 64px"
    : "56px minmax(0,1.6fr) minmax(0,1fr) 80px 72px 80px";

  const renderRow = (e: LeaderboardEntry, rank: number | null) => {
    const me = e.id === myId;
    const { wl, pct } = record(e);
    return (
      <li
        key={e.id}
        aria-current={me ? "true" : undefined}
        style={{
          display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center",
          minHeight: 58, padding: "0 14px", borderRadius: 14,
          background: me ? "var(--ds-accent-soft)" : "var(--ds-raised)",
          border: `1px solid ${me ? "var(--ds-accent-line)" : "transparent"}`,
        }}
      >
        <span style={{ fontFamily: MONO, fontWeight: 600, color: "var(--ds-muted)" }}>{rank ?? "—"}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="ds-avatar" aria-hidden="true" style={{
            width: 34, height: 34, fontSize: 12,
            background: "var(--ds-panel)", color: "var(--ds-text)", border: "1px solid var(--ds-border2)",
          }}>
            {initials(e.username)}
          </span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {e.username}{me && " (you)"}
            </span>
            {isMobile && <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{levelLine(e.xp)}</span>}
          </span>
        </span>
        {!isMobile && (
          <>
            <span style={{ fontSize: 13, color: "var(--ds-text3)" }}>{levelLine(e.xp)}</span>
            <span style={{ textAlign: "right", fontFamily: MONO, color: "var(--ds-text3)" }}>{wl}</span>
            <span style={{ textAlign: "right", fontFamily: MONO, color: "var(--ds-text3)" }}>{pct}</span>
          </>
        )}
        <span style={{ textAlign: "right", fontFamily: MONO, fontWeight: 600 }}>{fmt(e.xp)}</span>
      </li>
    );
  };

  return (
    <AppShell active="leaderboard">
      <div className="ds-page" style={{ gap: 22 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 className="ds-h1" style={isMobile ? { fontSize: 24 } : undefined}>Leaderboard</h1>
          <p className="ds-sub">Top debaters, ranked by total XP across all debates.</p>
        </header>

        {loading ? (
          <div className="ds-card" style={{ padding: 32, textAlign: "center", color: "var(--ds-muted)", fontSize: 15 }}>
            Loading leaderboard…
          </div>
        ) : board.length === 0 ? (
          <div className="ds-card" style={{ padding: isMobile ? 24 : 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 18 }}>No ranked debaters yet</span>
            <span style={{ fontSize: 14, color: "var(--ds-muted)" }}>Finish a debate to earn XP and claim the first spot.</span>
          </div>
        ) : (
          <>
            {/* ── Podium ── */}
            <section aria-label="Top three" style={{
              display: "grid", gridTemplateColumns: `repeat(${podiumOrder.length}, minmax(0, 1fr))`,
              gap: isMobile ? 8 : 16, alignItems: "end",
            }}>
              {podiumOrder.map(({ entry, place }) => {
                const me    = entry.id === myId;
                const first = place === 1;
                const top   = isMobile ? { 1: 30, 2: 18, 3: 14 }[place] : { 1: 48, 2: 28, 3: 20 }[place];
                return (
                  <div key={entry.id} style={{
                    padding: isMobile ? `${top}px 8px 16px` : `${top}px 20px 24px`,
                    borderRadius: 22, boxShadow: "var(--ds-shadow)",
                    background: first ? "var(--ds-gold-bg)" : "var(--ds-panel)",
                    border: `1px solid ${me ? "var(--ds-accent-line)" : first ? "var(--ds-gold-line)" : "var(--ds-border)"}`,
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", minWidth: 0,
                  }}>
                    <span aria-label={`Rank ${place}`} style={{ fontWeight: 800, fontSize: isMobile ? 22 : 30, color: PLACE_COLOR[place] }}>{place}</span>
                    <span className="ds-avatar" aria-hidden="true" style={{
                      width: isMobile ? 48 : 64, height: isMobile ? 48 : 64, fontSize: 15,
                      background: "var(--ds-raised)", color: "var(--ds-text)", border: `2px solid ${PLACE_COLOR[place]}`,
                    }}>
                      {initials(entry.username)}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: isMobile ? 13 : 16, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.username}{me && " (you)"}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{levelLine(entry.xp)}</span>
                    <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: isMobile ? 12 : 15 }}>{fmt(entry.xp)} XP</span>
                  </div>
                );
              })}
            </section>

            {/* ── Remaining ranks ── */}
            {(rest.length > 0 || meRow) && (
              <section className="ds-card" style={{ padding: isMobile ? 10 : 18, display: "flex", flexDirection: "column", gap: 6 }}>
                {!isMobile && (
                  <div aria-hidden="true" style={{
                    display: "grid", gridTemplateColumns: cols, gap: 12, padding: "0 14px 6px",
                    fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--ds-faint)",
                  }}>
                    <span>RANK</span><span>DEBATER</span><span>LEVEL</span>
                    <span style={{ textAlign: "right" }}>W–L</span>
                    <span style={{ textAlign: "right" }}>WIN %</span>
                    <span style={{ textAlign: "right" }}>XP</span>
                  </div>
                )}
                <ol start={4} style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                  {rest.map((e, i) => renderRow(e, i + 4))}
                  {meRow && renderRow(meRow, null)}
                </ol>
                {meRow && (
                  <p style={{ margin: "4px 14px 0", fontSize: 12, color: "var(--ds-muted)" }}>
                    You're not in the top {board.length} yet — keep debating to climb.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
