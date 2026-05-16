import mongoose, { Schema, Document, Types } from "mongoose";

/**
 * JudgeSession
 * One record per (judge × debate) pair.
 * Stores the raw pillar scores so credibility can be recomputed
 * or audited without re-running the scoring logic.
 */

export interface IJudgeSession extends Document {
  judgeId:   Types.ObjectId;   // ref: User
  debateId:  Types.ObjectId;   // ref: Debate
  createdAt: Date;

  // ── Raw scores submitted by this judge ───────────────────────────────────
  scores: {
    participantId: Types.ObjectId;
    score: number;          // 0–100 raw score the judge gave
  }[];

  // ── Pillar breakdown (computed post-debate once all judges have scored) ──
  pillar: {
    p1_rankAgreement:      number | null;  // 0–1
    p2_gapPreservation:    number | null;  // 0–1
    p3_consensusSimilarity: number | null; // 0–1
    p4_outlierCoherence:   number | null;  // 0–1  (needs history, may be null)
    p5_biasDetection:      number | null;  // 0–1  (needs history, may be null)
    p6_integrityScore:     number | null;  // 0–1  (needs history, may be null)
  };

  /** Weighted composite for this session (P1–P6), null until computed */
  sessionScore: number | null;

  /** credibilityScore of the judge AFTER this session was factored in */
  credibilityAfter: number | null;
}

const JudgeSessionSchema = new Schema<IJudgeSession>(
  {
    judgeId:  { type: Schema.Types.ObjectId, ref: "User",   required: true, index: true },
    debateId: { type: Schema.Types.ObjectId, ref: "Debate", required: true, index: true },

    scores: [
      {
        participantId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        score:         { type: Number, required: true, min: 0, max: 100 },
      },
    ],

    pillar: {
      p1_rankAgreement:       { type: Number, default: null },
      p2_gapPreservation:     { type: Number, default: null },
      p3_consensusSimilarity: { type: Number, default: null },
      p4_outlierCoherence:    { type: Number, default: null },
      p5_biasDetection:       { type: Number, default: null },
      p6_integrityScore:      { type: Number, default: null },
    },

    sessionScore:      { type: Number, default: null },
    credibilityAfter:  { type: Number, default: null },
  },
  { timestamps: true }
);

// Compound index so we can quickly look up a judge's full history
JudgeSessionSchema.index({ judgeId: 1, createdAt: -1 });
// Ensure a judge can only submit once per debate
JudgeSessionSchema.index({ judgeId: 1, debateId: 1 }, { unique: true });

export const JudgeSession = mongoose.model<IJudgeSession>(
  "JudgeSession",
  JudgeSessionSchema
);
