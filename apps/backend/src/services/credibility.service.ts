/**
 * credibility.service.ts
 *
 * Implements the 6-Pillar Judge Credibility System.
 *
 * Pillar weights (sum = 1.0):
 *   P1  Rank Agreement         0.30
 *   P2  Gap Preservation       0.20
 *   P3  Consensus Similarity   0.15
 *   P4  Outlier Coherence      0.10
 *   P5  Bias Detection         0.15  (+ hard cap on total credibility)
 *   P6  Integrity Score        0.10
 *
 * Rolling update uses adaptive λ decay:
 *   λ = 2 / (min(N, WINDOW) + 1)   where WINDOW = 20
 *
 * Credibility bands:
 *   ≥ 0.75 → "strong"
 *   ≥ 0.45 → "moderate"
 *   <  0.45 → "flagged"
 */

import { Types } from "mongoose";
import { User }         from "../models/User.model.js";
import { JudgeSession } from "../models/JudgeSession.model.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const PILLAR_WEIGHTS = {
  p1: 0.30,
  p2: 0.20,
  p3: 0.15,
  p4: 0.10,
  p5: 0.15,
  p6: 0.10,
};

const EMA_WINDOW = 20;        // sessions used for λ decay
const NEW_JUDGE_START = 0; // credibility for first-time judges — climbs from 0

// Bias multiplier thresholds (P5 cap)
const BIAS_CAPS = [
  { threshold: 0.30, multiplier: 0.50 },  // severe bias → 50 % cap
  { threshold: 0.60, multiplier: 0.75 },  // moderate bias → 75 % cap
  { threshold: 1.01, multiplier: 1.00 },  // clean → no cap
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParticipantScore {
  participantId: Types.ObjectId;
  score: number;           // raw 0–100
}

export interface PillarBreakdown {
  p1_rankAgreement:       number | null;
  p2_gapPreservation:     number | null;
  p3_consensusSimilarity: number | null;
  p4_outlierCoherence:    number | null;
  p5_biasDetection:       number | null;
  p6_integrityScore:      number | null;
}

export interface CredibilityResult {
  sessionScore:    number;
  pillar:          PillarBreakdown;
  credibilityAfter: number;
  band:            "strong" | "moderate" | "flagged";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pearson correlation between two equal-length arrays */
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const meanA = a.reduce((s, x) => s + x, 0) / n;
  const meanB = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const dA = a[i] - meanA;
    const dB = b[i] - meanB;
    num += dA * dB;
    da  += dA * dA;
    db  += dB * dB;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** Convert raw scores to dense rank (1 = highest) */
function toRanks(scores: number[]): number[] {
  const sorted = [...scores].sort((a, b) => b - a);
  return scores.map(s => sorted.indexOf(s) + 1);
}

/** Spearman rank correlation (0–1 normalised) */
function spearman(a: number[], b: number[]): number {
  const ra = toRanks(a);
  const rb = toRanks(b);
  return (pearson(ra, rb) + 1) / 2; // normalise −1…+1 → 0…1
}

/** Credibility band from numeric score */
function toBand(score: number): "strong" | "moderate" | "flagged" {
  if (score >= 0.75) return "strong";
  if (score >= 0.45) return "moderate";
  return "flagged";
}

/** EMA lambda for N total sessions */
function lambda(n: number): number {
  return 2 / (Math.min(n, EMA_WINDOW) + 1);
}

// ── Pillar computations ───────────────────────────────────────────────────────

/**
 * P1 — Rank Agreement (0–1)
 * How well does the judge's ranking of participants match the AI/consensus ranking?
 * `judgeScores` and `referenceScores` are parallel arrays (same participants, same order).
 */
function computeP1(judgeScores: number[], referenceScores: number[]): number {
  return spearman(judgeScores, referenceScores);
}

/**
 * P2 — Gap Preservation (0–1)
 * Do the score *gaps* between participants match the reference gaps?
 * Computes correlation of gap vectors.
 */
function computeP2(judgeScores: number[], referenceScores: number[]): number {
  if (judgeScores.length < 2) return 1; // trivially true with 1 participant
  const judgeGaps = judgeScores.slice(1).map((s, i) => Math.abs(s - judgeScores[i]));
  const refGaps   = referenceScores.slice(1).map((s, i) => Math.abs(s - referenceScores[i]));
  return (pearson(judgeGaps, refGaps) + 1) / 2;
}

/**
 * P3 — Consensus Similarity (0–1)
 * Agreement with the median score of all human judges in this debate.
 */
function computeP3(judgeScores: number[], allJudgeScoreSets: number[][]): number {
  if (allJudgeScoreSets.length === 0) return 1;
  const n = judgeScores.length;
  const median = judgeScores.map((_, i) => {
    const vals = allJudgeScoreSets.map(s => s[i]).sort((a, b) => a - b);
    const mid  = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  });
  return (pearson(judgeScores, median) + 1) / 2;
}

/**
 * P4 — Outlier Coherence (0–1)
 * Requires historical data — if this judge is consistently an outlier it's penalised.
 * For new judges (< 3 sessions) returns null (neutral, excluded from weighted sum).
 */
async function computeP4(judgeId: Types.ObjectId): Promise<number | null> {
  const history = await JudgeSession.find({ judgeId })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("pillar.p3_consensusSimilarity");

  if (history.length < 3) return null;

  const p3Values = history
    .map(h => h.pillar.p3_consensusSimilarity)
    .filter((v): v is number => v !== null);

  if (p3Values.length < 3) return null;

  // High average P3 similarity → high outlier coherence (low outlier-ness)
  return p3Values.reduce((s, v) => s + v, 0) / p3Values.length;
}

/**
 * P5 — Bias Detection (0–1 where 1 = no bias detected)
 * Checks whether the judge systematically favours certain participant IDs.
 * Returns bias score (lower = more biased) and a multiplier cap.
 */
async function computeP5(
  judgeId: Types.ObjectId,
  currentScores: ParticipantScore[]
): Promise<{ score: number | null; biasMultiplier: number }> {
  const history = await JudgeSession.find({ judgeId })
    .sort({ createdAt: -1 })
    .limit(15)
    .select("scores");

  if (history.length < 5) return { score: null, biasMultiplier: 1.0 };

  // Build per-participant average score from historical sessions
  const participantTotals: Record<string, { sum: number; count: number }> = {};
  for (const session of history) {
    for (const s of session.scores) {
      const key = s.participantId.toString();
      if (!participantTotals[key]) participantTotals[key] = { sum: 0, count: 0 };
      participantTotals[key].sum   += s.score;
      participantTotals[key].count += 1;
    }
  }
  const avgs = Object.values(participantTotals).map(v => v.sum / v.count);
  if (avgs.length < 2) return { score: null, biasMultiplier: 1.0 };

  // Coefficient of variation: high CV = high bias tendency
  const mean = avgs.reduce((s, v) => s + v, 0) / avgs.length;
  const sd   = Math.sqrt(avgs.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / avgs.length);
  const cv   = mean > 0 ? sd / mean : 0;

  // cv → bias score: we normalise to 0–1 where cv=0 → 1.0, cv≥0.5 → 0.0
  const biasScore = Math.max(0, 1 - cv * 2);

  // Choose multiplier cap
  const { multiplier } = BIAS_CAPS.find(c => biasScore < c.threshold) ??
                         { multiplier: 1.0 };

  return { score: biasScore, biasMultiplier: multiplier };
}

/**
 * P6 — Integrity Score (0–1)
 * Penalises judges who submit identical scores for all participants (lazy scoring)
 * or who finish abnormally fast (timestamp check outside this function).
 */
function computeP6(judgeScores: number[]): number {
  if (judgeScores.length < 2) return 1;
  const unique = new Set(judgeScores).size;
  // All identical → 0, all unique → 1
  return (unique - 1) / (judgeScores.length - 1);
}

// ── Rolling credibility update ────────────────────────────────────────────────

function updateCredibility(
  prev: number,
  sessionScore: number,
  totalSessions: number,
  biasMultiplier: number
): number {
  const λ  = lambda(totalSessions);
  const raw = λ * sessionScore + (1 - λ) * prev;
  return Math.min(1, Math.max(0, raw * biasMultiplier));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute credibility for a judge after a debate ends.
 *
 * @param judgeId          - ObjectId of the user who acted as judge
 * @param debateId         - ObjectId of the debate
 * @param judgeScores      - Array of { participantId, score } submitted by this judge
 * @param referenceScores  - Ordered parallel array of AI reference scores (same participants, same order)
 * @param allJudgeScoreSets - All human judge score arrays for this debate (for P3 consensus)
 */
export async function computeAndSaveCredibility(
  judgeId: Types.ObjectId,
  debateId: Types.ObjectId,
  judgeScores: ParticipantScore[],
  referenceScores: number[],
  allJudgeScoreSets: number[][]
): Promise<CredibilityResult> {
  const rawScores = judgeScores.map(s => s.score);

  // ── Pillar scores ───────────────────────────────────────────────────────────
  const p1 = computeP1(rawScores, referenceScores);
  const p2 = computeP2(rawScores, referenceScores);
  const p3 = computeP3(rawScores, allJudgeScoreSets);
  const p4 = await computeP4(judgeId);
  const { score: p5, biasMultiplier } = await computeP5(judgeId, judgeScores);
  const p6 = computeP6(rawScores);

  // ── Weighted session score (exclude null pillars) ──────────────────────────
  const pillarsWithWeights: [number | null, number][] = [
    [p1, PILLAR_WEIGHTS.p1],
    [p2, PILLAR_WEIGHTS.p2],
    [p3, PILLAR_WEIGHTS.p3],
    [p4, PILLAR_WEIGHTS.p4],
    [p5, PILLAR_WEIGHTS.p5],
    [p6, PILLAR_WEIGHTS.p6],
  ];

  let weightedSum  = 0;
  let totalWeight  = 0;
  for (const [score, weight] of pillarsWithWeights) {
    if (score !== null) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }
  const sessionScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

  // ── Fetch current user state and update ────────────────────────────────────
  const user = await User.findById(judgeId);
  if (!user) throw new Error(`Judge user not found: ${judgeId}`);

  const prevCredibility  = user.judgeStats?.credibilityScore ?? NEW_JUDGE_START;
  const prevSessions     = user.judgeStats?.totalSessions ?? 0;
  const newSessions      = prevSessions + 1;

  const newCredibility = updateCredibility(
    prevCredibility,
    sessionScore,
    newSessions,
    biasMultiplier
  );
  const newBand = toBand(newCredibility);

  // ── Persist JudgeSession ───────────────────────────────────────────────────
  await JudgeSession.findOneAndUpdate(
    { judgeId, debateId },
    {
      $set: {
        scores: judgeScores,
        pillar: {
          p1_rankAgreement:       p1,
          p2_gapPreservation:     p2,
          p3_consensusSimilarity: p3,
          p4_outlierCoherence:    p4,
          p5_biasDetection:       p5,
          p6_integrityScore:      p6,
        },
        sessionScore,
        credibilityAfter: newCredibility,
      },
    },
    { upsert: true, new: true }
  );

  // ── Update User.judgeStats ─────────────────────────────────────────────────
  await User.findByIdAndUpdate(judgeId, {
    $set: {
      "judgeStats.totalSessions":    newSessions,
      "judgeStats.credibilityScore": newCredibility,
      "judgeStats.credibilityBand":  newBand,
      "judgeStats.lastJudgedAt":     new Date(),
    },
  });

  return {
    sessionScore,
    pillar: {
      p1_rankAgreement:       p1,
      p2_gapPreservation:     p2,
      p3_consensusSimilarity: p3,
      p4_outlierCoherence:    p4,
      p5_biasDetection:       p5,
      p6_integrityScore:      p6,
    },
    credibilityAfter: newCredibility,
    band: newBand,
  };
}

/**
 * Get the full judging history for a user (newest first).
 */
export async function getJudgeHistory(
  judgeId: Types.ObjectId,
  limit = 20,
  offset = 0
) {
  return JudgeSession.find({ judgeId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .populate("debateId", "topic createdAt")
    .lean();
}
