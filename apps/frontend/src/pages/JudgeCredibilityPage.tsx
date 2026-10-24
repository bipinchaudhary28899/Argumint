/**
 * JudgeCredibilityPage.tsx — view over the signed-in user's judgeStats
 * (totalSessions, credibilityScore 0–1, credibilityBand, lastJudgedAt).
 *
 * Layout:
 *   SCORE   — current score, band chip, band bar with marker   | what each band means
 *   HOW     — the six scoring pillars + weights                | bias cap · rolling update
 * With no sessions yet the score card becomes an empty state; the explainer stays.
 */

import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Icon } from "../components/Icon";
import { useAuth } from "../contexts/AuthContext";
import { useIsMobile } from "../hooks/useIsMobile";

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
const PILLARS = [
  { name: "Rank agreement",    desc: "Your ranking vs the AI's",              weight: 30 },
  { name: "Gap preservation",  desc: "Score gaps vs the AI's gaps",           weight: 20 },
  { name: "Consensus",         desc: "Agreement with the other human judges", weight: 15 },
  { name: "Outlier coherence", desc: "Consistency over time (from session 3)", weight: 10 },
  { name: "Bias detection",    desc: "No systematic favouritism (from session 5)", weight: 15 },
  { name: "Integrity",         desc: "No lazy or identical scoring",          weight: 10 },
];

const MONO = "'JetBrains Mono', monospace";

const bandFromScore = (s: number): Band => s >= 0.75 ? "strong" : s >= 0.45 ? "moderate" : "flagged";

const formatDate = (d: string | Date) => {
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
};

const cardStyle: React.CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0 };
const eyebrow: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ds-muted)" };

export function JudgeCredibilityPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const stats: JudgeStats = (user as any)?.judgeStats ?? { totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null };
  const hasSessions = (stats.totalSessions ?? 0) > 0;
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
      <span style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ds-muted)" }}>
        Each session moves your score by a rolling average, so one odd debate can't sink you.
      </span>
    </section>
  );

  // ── Pillars ───────────────────────────────────────────────────────────────
  const PillarsCard = (
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
          {BandsCard}
        </div>

        <div style={grid("minmax(0,1.4fr) minmax(0,1fr)")}>
          {PillarsCard}
          {SideCards}
        </div>
      </div>
    </AppShell>
  );
}
