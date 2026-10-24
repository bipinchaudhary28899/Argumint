/**
 * MatchHistoryPage.tsx — view over GET /auth/history (the user's ended debates).
 *
 * Layout:
 *   SUMMARY — debates · record · avg score · best finish (derived from the list)
 *   FILTERS — result (all / won / lost) + mode, applied client-side
 *   LIST    — one row per debate; opens /room/:code/analysis/:debateId
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Icon } from "../components/Icon";
import { useIsMobile } from "../hooks/useIsMobile";
import { historyApi, type DebateHistoryEntry } from "../services/api";

// Module-level cache — survives tab switches (unmount/remount) within the session.
let _historyCache: DebateHistoryEntry[] | null = null;

export function _resetCacheForTests() {
  _historyCache = null;
}

type ResultFilter = "all" | "won" | "lost";
type ModeFilter   = "all" | DebateHistoryEntry["mode"];

const MONO = "'JetBrains Mono', monospace";

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  } catch {
    return "";
  }
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

const modeLabel = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

function SideChip({ side, height }: { side: DebateHistoryEntry["side"]; height: number }) {
  if (!side) return <span style={{ color: "var(--ds-faint)" }}>—</span>;
  const isFor = side === "for";
  return (
    <span style={{
      justifySelf: "start", height, padding: "0 8px", borderRadius: 6, display: "inline-flex", alignItems: "center",
      fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
      background: isFor ? "var(--ds-for-bg)" : "var(--ds-against-bg)",
      color: isFor ? "var(--ds-for-text)" : "var(--ds-against-text)",
    }}>
      {side.toUpperCase()}
    </span>
  );
}

function ResultText({ isWinner }: { isWinner: boolean | null }) {
  if (isWinner === null) return <span style={{ fontWeight: 700, color: "var(--ds-faint)" }}>—</span>;
  return (
    <span style={{ fontWeight: 700, color: isWinner ? "var(--ds-for-text)" : "var(--ds-muted)" }}>
      {isWinner ? "Won" : "Lost"}
    </span>
  );
}

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 16, borderRadius: 18, background: "var(--ds-panel)", border: "1px solid var(--ds-border)",
      display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ds-muted)" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 26 }}>{children}</span>
    </div>
  );
}

export function MatchHistoryPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [history, setHistory] = useState<DebateHistoryEntry[]>(_historyCache ?? []);
  const [loading, setLoading] = useState(_historyCache === null);
  const [result, setResult]   = useState<ResultFilter>("all");
  const [mode, setMode]       = useState<ModeFilter>("all");

  useEffect(() => {
    // Warm cache → no refetch on remount
    if (_historyCache !== null) return;
    historyApi.getHistory().then(data => {
      _historyCache = data;
      setHistory(data);
      setLoading(false);
    });
  }, []);

  // ── Summary (derived from the list) ────────────────────────────────────────
  const summary = useMemo(() => {
    const wins   = history.filter(h => h.isWinner === true).length;
    const losses = history.filter(h => h.isWinner === false).length;
    const scored = history.filter(h => h.points !== null);
    const avg    = scored.length ? Math.round(scored.reduce((s, h) => s + (h.points ?? 0), 0) / scored.length) : null;
    const ranks  = history.map(h => h.rank).filter((r): r is number => r !== null);
    const best   = ranks.length ? Math.min(...ranks) : null;
    return { wins, losses, avg, best };
  }, [history]);

  const visible = history.filter(h =>
    (result === "all" || (result === "won" ? h.isWinner === true : h.isWinner === false)) &&
    (mode === "all" || h.mode === mode)
  );

  const openAnalysis = (h: DebateHistoryEntry) => navigate(`/room/${h.roomCode}/analysis/${h.id}`);

  const cols = "72px minmax(0,1fr) 96px 72px 64px 80px";

  return (
    <AppShell active="history">
      <div className="ds-page" style={{ gap: 20 }}>
        <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 className="ds-h1" style={isMobile ? { fontSize: 24 } : undefined}>Match history</h1>
            <p className="ds-sub">Every debate you've argued. Open one for the full breakdown.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/judge-credibility")}
            style={{
              minHeight: 44, padding: "0 14px", borderRadius: 12, border: "1px solid var(--ds-border2)",
              background: "var(--ds-raised)", color: "var(--ds-text)", display: "inline-flex", alignItems: "center", gap: 8,
              font: "700 14px Outfit, system-ui, sans-serif", cursor: "pointer",
            }}
          >
            <span style={{ color: "var(--ds-accent)", display: "inline-flex" }}><Icon name="scale" size={16} /></span>
            Debates I judged
          </button>
        </header>

        {loading ? (
          <div className="ds-card" style={{ padding: 32, textAlign: "center", color: "var(--ds-muted)", fontSize: 15 }}>
            Loading history…
          </div>
        ) : history.length === 0 ? (
          <div className="ds-card" style={{ padding: isMobile ? 24 : 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
            <span style={{ color: "var(--ds-accent)", display: "inline-flex" }}><Icon name="mic" size={28} /></span>
            <span style={{ fontWeight: 700, fontSize: 18 }}>No debates yet</span>
            <span style={{ fontSize: 14, color: "var(--ds-muted)" }}>Join or create a room to start earning XP.</span>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 6 }}>
              <button type="button" className="ds-btn ds-btn-primary" onClick={() => navigate("/create-room")}>Create room</button>
              <button type="button" className="ds-btn ds-btn-secondary" onClick={() => navigate("/join-room")}>Join room</button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Summary ── */}
            <section aria-label="Summary" style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0, 1fr))`, gap: 12 }}>
              <StatTile label="Debates">{history.length}</StatTile>
              <StatTile label="Record">
                <span style={{ color: "var(--ds-for-text)" }}>{summary.wins}</span>–{summary.losses}
              </StatTile>
              <StatTile label="Avg score">{summary.avg ?? "—"}</StatTile>
              <StatTile label="Best finish">
                <span style={{ color: "var(--ds-accent)" }}>{summary.best !== null ? ordinal(summary.best) : "—"}</span>
              </StatTile>
            </section>

            {/* ── Filters ── */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <div role="radiogroup" aria-label="Result filter" style={{
                display: "flex", gap: 6, padding: 5, borderRadius: 14, background: "var(--ds-panel)", border: "1px solid var(--ds-border)",
              }}>
                {(["all", "won", "lost"] as const).map(r => {
                  const on = result === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setResult(r)}
                      style={{
                        minHeight: 40, padding: "0 14px", borderRadius: 10, border: 0, cursor: "pointer",
                        background: on ? "var(--ds-primary-fill)" : "transparent",
                        color: on ? "var(--ds-on-primary)" : "var(--ds-text3)",
                        font: "700 13px Outfit, system-ui, sans-serif",
                      }}
                    >
                      {r === "all" ? "All" : r === "won" ? "Won" : "Lost"}
                    </button>
                  );
                })}
              </div>
              <label style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Mode</span>
                <select
                  value={mode}
                  onChange={e => setMode(e.target.value as ModeFilter)}
                  style={{
                    minHeight: 50, padding: "0 40px 0 14px", borderRadius: 14, border: "1px solid var(--ds-border)",
                    background: "var(--ds-panel)", color: "var(--ds-text)", font: "600 14px Outfit, system-ui, sans-serif",
                    appearance: "none", cursor: "pointer",
                  }}
                >
                  <option value="all">All modes</option>
                  <option value="alternate">Alternate</option>
                  <option value="buzzer">Buzzer</option>
                </select>
                <span style={{ position: "absolute", right: 12, pointerEvents: "none", color: "var(--ds-muted)", display: "inline-flex" }}>
                  <Icon name="down" size={16} />
                </span>
              </label>
            </div>

            {/* ── List ── */}
            <section aria-label="Debates" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {!isMobile && (
                <div aria-hidden="true" style={{
                  display: "grid", gridTemplateColumns: cols, gap: 14, padding: "0 18px",
                  fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--ds-faint)",
                }}>
                  <span>DATE</span><span>MOTION</span><span>SIDE</span><span>RESULT</span>
                  <span style={{ textAlign: "right" }}>SCORE</span>
                  <span style={{ textAlign: "right" }}>RANK</span>
                </div>
              )}

              {visible.length === 0 ? (
                <div style={{ padding: 24, borderRadius: 16, background: "var(--ds-panel)", border: "1px solid var(--ds-border)", textAlign: "center", fontSize: 14, color: "var(--ds-muted)" }}>
                  No debates match these filters.
                </div>
              ) : visible.map(h => {
                const rank = h.rank !== null ? `${ordinal(h.rank)}/${h.totalParticipants}` : "—";
                const rowBase: React.CSSProperties = {
                  width: "100%", textAlign: "left", cursor: "pointer", font: "inherit",
                  borderRadius: 16, background: "var(--ds-panel)", border: "1px solid var(--ds-border)", color: "var(--ds-text)",
                };
                return isMobile ? (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => openAnalysis(h)}
                    style={{ ...rowBase, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{h.topic}</span>
                    <span style={{ width: "100%", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ds-muted)" }}>
                      <SideChip side={h.side} height={22} />
                      <span>{modeLabel(h.mode)} · {formatDate(h.endedAt)}</span>
                      <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                        <ResultText isWinner={h.isWinner} />
                        <span style={{ fontFamily: MONO, fontWeight: 600, color: "var(--ds-text)" }}>{h.points ?? "—"}</span>
                        <span style={{ fontFamily: MONO, color: "var(--ds-accent)" }}>{rank}</span>
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => openAnalysis(h)}
                    style={{ ...rowBase, padding: "14px 18px", display: "grid", gridTemplateColumns: cols, gap: 14, alignItems: "center" }}
                  >
                    <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>{formatDate(h.endedAt)}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.topic}</span>
                      <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{modeLabel(h.mode)}</span>
                    </span>
                    <SideChip side={h.side} height={24} />
                    <span style={{ fontSize: 14 }}><ResultText isWinner={h.isWinner} /></span>
                    <span style={{ textAlign: "right", fontFamily: MONO, fontWeight: 600 }}>{h.points ?? "—"}</span>
                    <span style={{ textAlign: "right", fontFamily: MONO, color: "var(--ds-accent)" }}>{rank}</span>
                  </button>
                );
              })}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
