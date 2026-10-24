/**
 * JudgeCredibilityPage.tsx — view over the signed-in user's judgeStats
 * (totalSessions, credibilityScore 0–1, credibilityBand, lastJudgedAt)
 * plus GET /auth/judge-history (per-session pillars, sessionScore, credibilityAfter).
 *
 * Layout (with history):
 *   SCORE   — current score, band chip, band bar with marker   | credibility trend
 *   HOW     — the six pillars: latest scores + weights         | bias cap · rolling update
 *   LIST    — debates you judged                               | what each band means
 * Without history (or if it fails to load) the trend/list drop out, the bands take the
 * trend's place and the pillars show weights only. With no sessions yet the score card
 * becomes an empty state; the explainer stays.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Icon } from "../components/Icon";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";
import { judgeApi, type JudgeHistorySession, type JudgePillarScores } from "../services/api";

// Module-level cache — survives tab switches (unmount/remount) within the session.
// Keyed by user + session count so a newly judged debate (or another account) refetches.
let _historyCache: { key: string; sessions: JudgeHistorySession[] } | null = null;

export function _resetCacheForTests() {
  _historyCache = null;
}

type Band = "strong" | "moderate" | "flagged";

interface JudgeStats {
  totalSessions:    number;
  credibilityScore: number;
  credibilityBand:  Band;
  lastJudgedAt:     string | Date | null;
}

// Mirrors the backend bands (credibility.service toBand)
const BANDS: { id: Band; label: string; range: string; copy: string }[] = [
  { id: "strong",   label: "Strong",   range: "0.75 – 1.00", copy: "Your scores track the AI reference and the other judges closely." },
  { id: "moderate", label: "Moderate", range: "0.45 – 0.74", copy: "Broadly in line, with some rankings or score gaps that drift." },
  { id: "flagged",  label: "Flagged",  range: "0.00 – 0.44", copy: "Your scoring often disagrees with the reference or shows a pattern of bias." },
];

const BAND_STYLE: Record<Band, { bg: string; line: string; text: string; chipBg: string; chipFg: string }> = {
  strong:   { bg: "var(--ds-for-bg)",     line: "var(--ds-for-line)",     text: "var(--ds-for-text)",     chipBg: "var(--ds-for-mid)",     chipFg: "#fff" },
  moderate: { bg: "var(--ds-neutral-bg)", line: "var(--ds-neutral-line)", text: "var(--ds-neutral-text)", chipBg: "var(--ds-border2)",     chipFg: "var(--ds-text)" },
  flagged:  { bg: "var(--ds-against-bg)", line: "var(--ds-against-line)", text: "var(--ds-against-text)", chipBg: "var(--ds-against-mid)", chipFg: "#fff" },
};

// Pillar weights from credibility.service (sum = 1.0)
const PILLARS: { key: keyof JudgePillarScores; name: string; desc: string; weight: number }[] = [
  { key: "p1_rankAgreement",       name: "Rank agreement",    desc: "Your ranking vs the AI's",              weight: 30 },
  { key: "p2_gapPreservation",     name: "Gap preservation",  desc: "Score gaps vs the AI's gaps",           weight: 20 },
  { key: "p3_consensusSimilarity", name: "Consensus",         desc: "Agreement with the other human judges", weight: 15 },
  { key: "p4_outlierCoherence",    name: "Outlier coherence", desc: "Consistency over time (from session 3)", weight: 10 },
  { key: "p5_biasDetection",       name: "Bias detection",    desc: "No systematic favouritism (from session 5)", weight: 15 },
  { key: "p6_integrityScore",      name: "Integrity",         desc: "No lazy or identical scoring",          weight: 10 },
];

const LIST_PREVIEW = 5;

const MONO = "'JetBrains Mono', monospace";

const bandFromScore = (s: number): Band => s >= 0.75 ? "strong" : s >= 0.45 ? "moderate" : "flagged";

const formatDate = (d: string | Date) => {
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
};

const formatShortDate = (d: string) => {
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fmt2  = (v: number | null | undefined) => isNum(v) ? v.toFixed(2) : "—";

// ── Trend chart ─────────────────────────────────────────────────────────────
// Inline SVG in a 600×200 box stretched to the card width; strokes stay crisp via
// non-scaling-stroke and the latest-point dot is HTML so it doesn't stretch.
const CHART_W = 600, CHART_H = 200, CHART_PAD_X = 20;

function TrendChart({ values }: { values: number[] }) {
  // Show 0.40–1.00 like the design, widening downward when scores dip below it.
  const lo = Math.min(0.4, Math.max(0, Math.floor(Math.min(...values) * 10) / 10 - 0.1));
  const y  = (v: number) => ((1 - Math.min(1, Math.max(lo, v))) / (1 - lo)) * CHART_H;
  const x  = (i: number) => values.length === 1
    ? CHART_W / 2
    : CHART_PAD_X + (i * (CHART_W - 2 * CHART_PAD_X)) / (values.length - 1);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const first = values[0], last = values[values.length - 1];
  const n = values.length;
  const lastBand = BANDS.find(b => b.id === bandFromScore(last))!.label;
  const label = n === 1
    ? `Credibility ${last.toFixed(2)} after 1 session, in the ${lastBand} band`
    : `Credibility ${last > first ? "rose" : last < first ? "fell" : "held"} ${last === first ? `at ${last.toFixed(2)}` : `from ${first.toFixed(2)} to ${last.toFixed(2)}`} over ${n} sessions, now in the ${lastBand} band`;

  const yStrong = y(0.75), yFlagged = y(0.45);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div style={{ position: "relative", height: CHART_H }}>
      <svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ display: "block" }}>
        <rect x="0" y="0" width={CHART_W} height={yStrong} style={{ fill: "var(--ds-for-bg)" }} />
        <line x1="0" y1={yStrong} x2={CHART_W} y2={yStrong} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--ds-for-mid)" }} />
        <line x1="0" y1={yFlagged} x2={CHART_W} y2={yFlagged} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--ds-against-mid)" }} />
        {n > 1 && (
          <polyline data-testid="trend-line" points={points} fill="none" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--ds-accent-mid)" }} />
        )}
      </svg>
      <span aria-hidden="true" style={{
        position: "absolute", left: pct(x(n - 1), CHART_W), top: pct(y(last), CHART_H), width: 10, height: 10, marginLeft: -5, marginTop: -5,
        borderRadius: "50%", background: "var(--ds-accent-mid)", boxShadow: "0 0 0 3px var(--ds-panel)",
      }} />
      <span aria-hidden="true" style={{ position: "absolute", right: 0, top: `calc(${pct(yStrong, CHART_H)} - 19px)`, fontSize: 11, fontWeight: 700, color: "var(--ds-for-text)" }}>0.75 Strong</span>
      <span aria-hidden="true" style={{ position: "absolute", right: 0, top: `calc(${pct(yFlagged, CHART_H)} - 19px)`, fontSize: 11, fontWeight: 700, color: "var(--ds-against-text)" }}>0.45 Flagged</span>
    </div>
  );
}

const cardStyle: React.CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0 };
const eyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ds-muted)" };

export function JudgeCredibilityPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const authUser = user as { id?: string; judgeStats?: JudgeStats } | null;
  const stats: JudgeStats = authUser?.judgeStats ?? { totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null };
  const hasSessions = (stats.totalSessions ?? 0) > 0;

  // ── Judge history (only fetched once there's something to show) ──────────
  const cacheKey = `${authUser?.id ?? ""}:${stats.totalSessions ?? 0}`;
  const [fetched, setFetched] = useState<{ key: string; sessions: JudgeHistorySession[] } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const loaded  = fetched?.key === cacheKey ? fetched : _historyCache?.key === cacheKey ? _historyCache : null;
  const history = loaded?.sessions ?? [];
  const loading = hasSessions && loaded === null;

  useEffect(() => {
    // Warm cache → no refetch on remount
    if (!hasSessions || _historyCache?.key === cacheKey) return;
    let cancelled = false;
    judgeApi.getHistory().then(sessions => {
      _historyCache = { key: cacheKey, sessions };
      if (!cancelled) setFetched(_historyCache);
    });
    return () => { cancelled = true; };
  }, [hasSessions, cacheKey]);

  const showHistory = hasSessions && (loading || history.length > 0);
  const trend       = [...history].reverse().map(s => s.credibilityAfter).filter(isNum);  // oldest → newest
  const latest      = history[0]?.pillar ?? null;                                        // history is newest first
  const listed      = showAll ? history : history.slice(0, LIST_PREVIEW);
  const score  = Math.min(1, Math.max(0, stats.credibilityScore ?? 0));
  const band   = (BAND_STYLE[stats.credibilityBand] ? stats.credibilityBand : bandFromScore(score)) as Band;
  const bs     = BAND_STYLE[band];
  const bandMeta = BANDS.find(b => b.id === band)!;

  const pad  = isMobile ? 18 : 24;
  const grid = (cols: string): React.CSSProperties => ({
    display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : cols, gap: 20, alignItems: "start",
  });

  // ── Score card / empty state ──────────────────────────────────────────────
  const ScoreCard = hasSessions ? (
    <section aria-label="Current score" style={{ ...cardStyle, padding: pad, gap: 16, borderRadius: 24, background: bs.bg, border: `1px solid ${bs.line}` }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ ...eyebrow, color: bs.text }}>Current score</span>
        <span style={{ height: 28, padding: "0 10px", borderRadius: 8, background: bs.chipBg, color: bs.chipFg, display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 700 }}>
          {bandMeta.label}
        </span>
      </span>
      <span style={{ fontWeight: 800, fontSize: isMobile ? 72 : 88, lineHeight: 1, letterSpacing: "-.04em", color: "var(--ds-text)" }}>
        {score.toFixed(2)}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          role="meter"
          aria-label="Credibility score"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={Number(score.toFixed(2))}
          aria-valuetext={`${score.toFixed(2)}, ${bandMeta.label}`}
          style={{ position: "relative", display: "grid", gridTemplateColumns: "45fr 30fr 25fr", gap: 3, height: 12 }}
        >
          <span style={{ borderRadius: "99px 0 0 99px", background: "var(--ds-against-mid)" }} />
          <span style={{ background: "var(--ds-border2)" }} />
          <span style={{ borderRadius: "0 99px 99px 0", background: "var(--ds-for-mid)" }} />
          <span style={{
            position: "absolute", left: `calc(${score * 100}% - 2px)`, top: -5, width: 4, height: 22, borderRadius: 2,
            background: "var(--ds-text)", transition: "left 1s cubic-bezier(.4,0,.2,1)",
          }} />
        </div>
        <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "45fr 30fr 25fr", gap: 3, fontSize: 11, fontWeight: 700, color: "var(--ds-text3)" }}>
          <span>Flagged</span><span>Moderate</span><span>Strong</span>
        </div>
      </div>
      <span style={{ fontSize: 14, color: "var(--ds-text3)" }}>
        {stats.totalSessions} {stats.totalSessions === 1 ? "debate" : "debates"} judged
        {stats.lastJudgedAt && <> · last judged {formatDate(stats.lastJudgedAt)}</>}
      </span>
    </section>
  ) : (
    <section className="ds-card" aria-label="No sessions yet" style={{ ...cardStyle, padding: pad, gap: 12, alignItems: "flex-start" }}>
      <span style={{ width: 44, height: 44, borderRadius: 14, background: "var(--ds-accent-soft)", color: "var(--ds-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="scale" size={22} />
      </span>
      <span style={{ fontWeight: 700, fontSize: 18 }}>No judging sessions yet</span>
      <span style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ds-muted)" }}>
        Join a room as a judge to start building your credibility score. It appears here after your first judged debate.
      </span>
      <button type="button" className="ds-btn ds-btn-primary" style={{ marginTop: 4 }} onClick={() => navigate("/join-room")}>
        Join a room
      </button>
    </section>
  );

  // ── Band explainer ────────────────────────────────────────────────────────
  const BandsCard = (
    <section className="ds-card" aria-label="Credibility bands" style={{ ...cardStyle, padding: pad, gap: 12 }}>
      <span style={eyebrow}>What the bands mean</span>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {BANDS.map(b => {
          const s  = BAND_STYLE[b.id];
          const on = hasSessions && b.id === band;
          return (
            <li key={b.id} aria-current={on ? "true" : undefined} style={{
              display: "flex", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: 14,
              background: on ? s.bg : "var(--ds-raised)", border: `1px solid ${on ? s.line : "transparent"}`,
            }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, marginTop: 5, borderRadius: "50%", flexShrink: 0, background: s.chipBg }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{b.label}{on && " · you"}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: "var(--ds-muted)" }}>{b.range}</span>
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.45, color: "var(--ds-muted)" }}>{b.copy}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {!showHistory && (  // the trend card carries this line when it's shown
        <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ds-muted)" }}>
          Each session moves your score by a rolling average, so one odd debate can't sink you.
        </span>
      )}
    </section>
  );

  // ── Pillars ───────────────────────────────────────────────────────────────
  const PillarsCard = latest ? (
    <section className="ds-card" aria-label="Scoring pillars" style={{ ...cardStyle, padding: pad, gap: 14 }}>
      <span style={eyebrow}>The six pillars · latest session</span>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
        {PILLARS.map((p, i) => {
          const v = latest[p.key];
          return (
            <li key={p.name} style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1.1fr)", gap: isMobile ? 8 : 12, alignItems: "center" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>P{i + 1} · {p.name}</span>
                <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{p.desc}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="ds-track" aria-hidden="true" style={{ flex: 1, height: 8 }}>
                  <div style={{ width: `${isNum(v) ? Math.min(1, Math.max(0, v)) * 100 : 0}%`, background: "var(--ds-accent-mid)" }} />
                </span>
                <span
                  aria-label={isNum(v) ? `${p.name} score ${v.toFixed(2)}` : `${p.name} not active yet`}
                  style={{ width: 36, textAlign: "right", fontFamily: MONO, fontWeight: 600, fontSize: 14, color: isNum(v) ? undefined : "var(--ds-faint)" }}
                >
                  {fmt2(v)}
                </span>
                <span style={{ width: 40, textAlign: "right", fontSize: 12, color: "var(--ds-muted)" }}>{p.weight}%</span>
              </span>
            </li>
          );
        })}
      </ol>
      <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ds-muted)" }}>
        Scores are from your most recent judged debate; percentages are each pillar's weight. A dash means that pillar hadn't switched on yet and was left out.
      </span>
    </section>
  ) : (
    <section className="ds-card" aria-label="Scoring pillars" style={{ ...cardStyle, padding: pad, gap: 14 }}>
      <span style={eyebrow}>The six pillars</span>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
        {PILLARS.map((p, i) => (
          <li key={p.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>P{i + 1} · {p.name}</span>
              <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>{p.desc}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10, width: isMobile ? 110 : 180, flexShrink: 0 }}>
              <span className="ds-track" aria-hidden="true" style={{ flex: 1, height: 8 }}>
                <div style={{ width: `${(p.weight / 30) * 100}%`, background: "var(--ds-accent-mid)" }} />
              </span>
              <span style={{ width: 40, textAlign: "right", fontFamily: MONO, fontWeight: 600, fontSize: 14 }}>{p.weight}%</span>
            </span>
          </li>
        ))}
      </ol>
      <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ds-muted)" }}>
        Weights show how much each pillar counts toward a session's score. Pillars that haven't switched on yet are left out.
      </span>
    </section>
  );

  // ── Trend ─────────────────────────────────────────────────────────────────
  const LoadingNote = (
    <span role="status" style={{ fontSize: 14, color: "var(--ds-muted)" }}>Loading your judging history…</span>
  );

  const TrendCard = (
    <section className="ds-card" aria-label="Credibility trend" aria-busy={loading || undefined} style={{ ...cardStyle, padding: pad, gap: 12 }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={eyebrow}>Trend</span>
        {!loading && trend.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--ds-muted)" }}>
            {trend.length === 1 ? "First session" : `Last ${trend.length} sessions`}
          </span>
        )}
      </span>
      {loading ? (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>{LoadingNote}</div>
      ) : trend.length > 0 ? (
        <TrendChart values={trend} />
      ) : (
        <span style={{ fontSize: 14, color: "var(--ds-muted)" }}>No scored sessions to chart yet.</span>
      )}
      <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ds-muted)" }}>
        Each session moves your score by a rolling average, so one odd debate can't sink you.
      </span>
    </section>
  );

  // ── Debates you judged ────────────────────────────────────────────────────
  const listCols = isMobile ? "minmax(0,1fr) auto" : "72px minmax(0,1fr) 72px 72px";
  const JudgedCard = (
    <section className="ds-card" aria-label="Debates you judged" aria-busy={loading || undefined} style={{ ...cardStyle, padding: pad, gap: 10 }}>
      <span style={eyebrow}>Debates you judged</span>
      {loading ? LoadingNote : (
        <>
          {!isMobile && (
            <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: listCols, gap: 12, padding: "0 14px", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--ds-faint)" }}>
              <span>DATE</span><span>MOTION</span><span style={{ textAlign: "right" }}>SESSION</span><span style={{ textAlign: "right" }}>AFTER</span>
            </div>
          )}
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
            {listed.map(s => {
              const date   = <span style={{ fontSize: 13, color: "var(--ds-muted)" }}>{formatShortDate(s.createdAt)}</span>;
              const motion = <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{s.topic || "Untitled debate"}</span>;
              const scoreV = <span aria-label={`Session score ${fmt2(s.sessionScore)}`} style={{ textAlign: "right", fontFamily: MONO, fontWeight: 600 }}>{fmt2(s.sessionScore)}</span>;
              const afterV = <span aria-label={`Credibility after ${fmt2(s.credibilityAfter)}`} style={{ textAlign: "right", fontFamily: MONO, color: "var(--ds-accent)" }}>{fmt2(s.credibilityAfter)}</span>;
              const row: React.CSSProperties = { display: "grid", gridTemplateColumns: listCols, gap: 12, alignItems: "center", padding: 14, borderRadius: 14, background: "var(--ds-raised)" };
              // Mobile: no column header, so the motion and date stack and each score carries a caption
              return isMobile ? (
                <li key={s.id} style={row}>
                  <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>{motion}{date}</span>
                  <span style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 8, rowGap: 2, alignItems: "baseline", fontSize: 13 }}>
                    <span aria-hidden="true" style={{ fontSize: 11, color: "var(--ds-faint)" }}>Session</span>{scoreV}
                    <span aria-hidden="true" style={{ fontSize: 11, color: "var(--ds-faint)" }}>After</span>{afterV}
                  </span>
                </li>
              ) : (
                <li key={s.id} style={row}>{date}{motion}{scoreV}{afterV}</li>
              );
            })}
          </ul>
          {history.length > LIST_PREVIEW && (
            <button type="button" className="ds-btn ds-btn-secondary" aria-expanded={showAll} style={{ alignSelf: "flex-start", height: 40, fontSize: 14 }} onClick={() => setShowAll(v => !v)}>
              {showAll ? "Show fewer" : `Show all ${history.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );

  const SideCards = (
    <section style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
      <div className="ds-card" style={{ ...cardStyle, padding: pad, gap: 12 }}>
        <span style={eyebrow}>Bias check</span>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 14, background: "var(--ds-for-bg)", color: "var(--ds-for-text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="shield" size={22} />
          </span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Fair scoring keeps you uncapped</span>
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ds-muted)" }}>
          If you consistently favour one player, your whole score is capped at ×0.75 or ×0.50 until the pattern clears.
        </span>
      </div>
      <div className="ds-raised" style={{ ...cardStyle, padding: pad, gap: 10, borderRadius: 24 }}>
        <span style={eyebrow}>How it updates</span>
        <code style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.7, color: "var(--ds-text2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {"λ = 2 / (min(N, 20) + 1)\nnew = λ × session + (1 − λ) × previous"}
        </code>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ds-muted)" }}>
          N is your number of judged sessions, so early sessions move the score most. Consistency and bias pillars switch on after 3 and 5 sessions.
        </span>
      </div>
    </section>
  );

  return (
    <AppShell active="judging">
      <div className="ds-page" style={{ gap: 20 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 className="ds-h1" style={isMobile ? { fontSize: 24 } : undefined}>Judge credibility</h1>
          <p className="ds-sub" style={{ lineHeight: 1.5, maxWidth: 640 }}>
            How reliable your scoring is, measured against the AI judge and other human judges. Separate from your debater XP.
          </p>
        </header>

        <div style={grid("minmax(0,1fr) minmax(0,1.4fr)")}>
          {ScoreCard}
          {showHistory ? TrendCard : BandsCard}
        </div>

        <div style={grid("minmax(0,1.4fr) minmax(0,1fr)")}>
          {PillarsCard}
          {SideCards}
        </div>

        {showHistory && (
          <div style={grid("minmax(0,1.4fr) minmax(0,1fr)")}>
            {JudgedCard}
            {BandsCard}
          </div>
        )}
      </div>
    </AppShell>
  );
}
