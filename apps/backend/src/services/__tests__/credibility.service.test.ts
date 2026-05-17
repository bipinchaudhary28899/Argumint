/**
 * credibility.service.test.ts
 *
 * Unit tests for the 6-Pillar Judge Credibility System.
 * All tests run against pure functions — no database required.
 *
 * Run:  npm test  (from apps/backend)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock mongoose models before importing the service ─────────────────────────
vi.mock("../../models/User.model.js", () => ({
  User: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock("../../models/JudgeSession.model.js", () => ({
  JudgeSession: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import {
  pearson,
  toRanks,
  spearman,
  toBand,
  lambda,
  computeP1,
  computeP2,
  computeP3,
  computeP6,
  computeAndSaveCredibility,
} from "../credibility.service.js";

import { User }         from "../../models/User.model.js";
import { JudgeSession } from "../../models/JudgeSession.model.js";
import { Types }        from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// pearson()
// ─────────────────────────────────────────────────────────────────────────────
describe("pearson()", () => {
  it("returns 1 for perfectly correlated arrays", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
  });

  it("returns -1 for perfectly anti-correlated arrays", () => {
    expect(pearson([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });

  it("returns 0 for identical values (zero variance)", () => {
    expect(pearson([5, 5, 5], [1, 2, 3])).toBe(0);
  });

  it("returns 0 for arrays shorter than 2", () => {
    expect(pearson([10], [10])).toBe(0);
  });

  it("returns ~0 for uncorrelated arrays", () => {
    const r = pearson([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toRanks()
// ─────────────────────────────────────────────────────────────────────────────
describe("toRanks()", () => {
  it("assigns rank 1 to the highest score", () => {
    expect(toRanks([90, 70, 80])).toEqual([1, 3, 2]);
  });

  it("handles already-sorted descending input", () => {
    expect(toRanks([100, 80, 60, 40])).toEqual([1, 2, 3, 4]);
  });

  it("handles already-sorted ascending input", () => {
    expect(toRanks([10, 20, 30])).toEqual([3, 2, 1]);
  });

  it("handles a single element", () => {
    expect(toRanks([42])).toEqual([1]);
  });

  it("handles duplicate scores (first occurrence wins)", () => {
    const ranks = toRanks([80, 80, 60]);
    // Both 80s should get rank 1; 60 gets rank 3
    expect(ranks[0]).toBe(1);
    expect(ranks[1]).toBe(1);
    expect(ranks[2]).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// spearman()
// ─────────────────────────────────────────────────────────────────────────────
describe("spearman()", () => {
  it("returns 1 when rank orders are identical", () => {
    expect(spearman([90, 80, 70], [90, 80, 70])).toBeCloseTo(1);
  });

  it("returns 0 when rank orders are perfectly reversed", () => {
    // pearson of [1,2,3] vs [3,2,1] = -1  →  normalised = 0
    expect(spearman([90, 80, 70], [70, 80, 90])).toBeCloseTo(0);
  });

  it("always returns a value in [0, 1]", () => {
    const v = spearman([10, 40, 20, 50, 30], [50, 10, 30, 20, 40]);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// toBand()
// ─────────────────────────────────────────────────────────────────────────────
describe("toBand()", () => {
  it("returns 'strong' for scores >= 0.75", () => {
    expect(toBand(0.75)).toBe("strong");
    expect(toBand(1.0)).toBe("strong");
    expect(toBand(0.99)).toBe("strong");
  });

  it("returns 'moderate' for scores in [0.45, 0.75)", () => {
    expect(toBand(0.45)).toBe("moderate");
    expect(toBand(0.6)).toBe("moderate");
    expect(toBand(0.7499)).toBe("moderate");
  });

  it("returns 'flagged' for scores below 0.45", () => {
    expect(toBand(0.44)).toBe("flagged");
    expect(toBand(0)).toBe("flagged");
    expect(toBand(0.1)).toBe("flagged");
  });

  it("handles boundary values exactly", () => {
    expect(toBand(0.75)).toBe("strong");
    expect(toBand(0.45)).toBe("moderate");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lambda()
// ─────────────────────────────────────────────────────────────────────────────
describe("lambda()", () => {
  it("returns 2/(n+1) for n <= 20", () => {
    expect(lambda(1)).toBeCloseTo(2 / 2);
    expect(lambda(5)).toBeCloseTo(2 / 6);
    expect(lambda(20)).toBeCloseTo(2 / 21);
  });

  it("caps at window size 20", () => {
    // For n=21 and n=100, lambda should be the same as n=20
    expect(lambda(21)).toBeCloseTo(lambda(20));
    expect(lambda(100)).toBeCloseTo(lambda(20));
  });

  it("returns 1 for n=1 (first session has full weight)", () => {
    expect(lambda(1)).toBeCloseTo(1);
  });

  it("lambda decreases as session count grows", () => {
    expect(lambda(1)).toBeGreaterThan(lambda(5));
    expect(lambda(5)).toBeGreaterThan(lambda(10));
    expect(lambda(10)).toBeGreaterThan(lambda(20));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeP1() — Rank Agreement
// ─────────────────────────────────────────────────────────────────────────────
describe("computeP1()", () => {
  it("returns 1 when judge ranking exactly matches AI ranking", () => {
    expect(computeP1([90, 80, 70], [90, 80, 70])).toBeCloseTo(1);
  });

  it("returns 0 when judge ranking is perfectly reversed", () => {
    expect(computeP1([70, 80, 90], [90, 80, 70])).toBeCloseTo(0);
  });

  it("returns a value between 0 and 1 for partial agreement", () => {
    const v = computeP1([90, 70, 80], [90, 80, 70]);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeP2() — Gap Preservation
// ─────────────────────────────────────────────────────────────────────────────
describe("computeP2()", () => {
  it("returns 1 for a single participant (trivially true)", () => {
    expect(computeP2([80], [80])).toBe(1);
  });

  it("returns 1 when judge gaps perfectly match AI gaps", () => {
    // Judge: 90,60,50 → gaps [30,10]; AI: 80,50,40 → gaps [30,10]
    // Non-constant gap arrays → pearson = 1 → P2 = 1
    expect(computeP2([90, 60, 50], [80, 50, 40])).toBeCloseTo(1);
  });

  it("returns 0.5 when gaps are uncorrelated", () => {
    // pearson of uncorrelated → ~0  → normalised ~0.5
    const v = computeP2([90, 50, 80], [80, 79, 10]);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it("always stays in [0, 1]", () => {
    const v = computeP2([100, 40, 70, 55], [80, 75, 30, 60]);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeP3() — Consensus Similarity
// ─────────────────────────────────────────────────────────────────────────────
describe("computeP3()", () => {
  it("returns 1 when there are no other judges (only judge in debate)", () => {
    expect(computeP3([80, 70, 60], [])).toBe(1);
  });

  it("returns 1 when judge scores equal the median", () => {
    // Median of [[80,70,60],[80,70,60],[80,70,60]] = [80,70,60]
    const allSets = [[80, 70, 60], [80, 70, 60], [80, 70, 60]];
    expect(computeP3([80, 70, 60], allSets)).toBeCloseTo(1);
  });

  it("returns high value when judge is close to consensus", () => {
    const allSets = [[90, 80, 70], [88, 82, 68], [92, 78, 72]];
    const v = computeP3([89, 80, 69], allSets);
    expect(v).toBeGreaterThan(0.7);
  });

  it("returns low value when judge diverges from consensus", () => {
    const allSets = [[90, 80, 70], [88, 82, 68], [92, 78, 72]];
    // Judge completely reverses the ordering
    const v = computeP3([70, 80, 90], allSets);
    expect(v).toBeLessThan(0.5);
  });

  it("always stays in [0, 1]", () => {
    const allSets = [[100, 50], [60, 80]];
    const v = computeP3([20, 90], allSets);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeP6() — Integrity Score
// ─────────────────────────────────────────────────────────────────────────────
describe("computeP6()", () => {
  it("returns 1 when all scores are unique (full integrity)", () => {
    expect(computeP6([90, 80, 70, 60])).toBeCloseTo(1);
  });

  it("returns 0 when all scores are identical (lazy judging)", () => {
    expect(computeP6([75, 75, 75, 75])).toBe(0);
  });

  it("returns 1 for a single participant (trivially unique)", () => {
    expect(computeP6([80])).toBe(1);
  });

  it("returns partial score when some scores are duplicated", () => {
    // [80, 80, 70, 60] → 3 unique out of 4 → (3-1)/(4-1) = 2/3
    expect(computeP6([80, 80, 70, 60])).toBeCloseTo(2 / 3);
  });

  it("returns 0.5 for two participants where both are the same", () => {
    // [75, 75] → 1 unique out of 2 → (1-1)/(2-1) = 0
    expect(computeP6([75, 75])).toBe(0);
  });

  it("returns 1 for two participants with different scores", () => {
    expect(computeP6([80, 60])).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAndSaveCredibility() — integration of all pillars
// ─────────────────────────────────────────────────────────────────────────────
describe("computeAndSaveCredibility()", () => {
  const judgeId  = new Types.ObjectId();
  const debateId = new Types.ObjectId();

  const judgeScores = [
    { participantId: new Types.ObjectId(), score: 90 },
    { participantId: new Types.ObjectId(), score: 75 },
    { participantId: new Types.ObjectId(), score: 60 },
  ];
  const referenceScores  = [90, 75, 60];
  const allJudgeScoreSets = [[90, 75, 60], [88, 76, 62]];

  beforeEach(() => {
    vi.clearAllMocks();

    // User.findById — judge has no prior history
    (User.findById as any).mockResolvedValue({
      _id: judgeId,
      judgeStats: { totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null },
    });

    // User.findByIdAndUpdate — no-op
    (User.findByIdAndUpdate as any).mockResolvedValue({});

    // JudgeSession.find — no history (new judge)
    (JudgeSession.find as any).mockReturnValue({
      sort:   () => ({ limit: () => ({ select: () => Promise.resolve([]) }) }),
    });

    // JudgeSession.findOneAndUpdate — no-op
    (JudgeSession.findOneAndUpdate as any).mockResolvedValue({});
  });

  it("returns a session score between 0 and 1", async () => {
    const result = await computeAndSaveCredibility(
      judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets
    );
    expect(result.sessionScore).toBeGreaterThanOrEqual(0);
    expect(result.sessionScore).toBeLessThanOrEqual(1);
  });

  it("returns a credibilityAfter between 0 and 1", async () => {
    const result = await computeAndSaveCredibility(
      judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets
    );
    expect(result.credibilityAfter).toBeGreaterThanOrEqual(0);
    expect(result.credibilityAfter).toBeLessThanOrEqual(1);
  });

  it("returns a valid band", async () => {
    const result = await computeAndSaveCredibility(
      judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets
    );
    expect(["strong", "moderate", "flagged"]).toContain(result.band);
  });

  it("returns P1 close to 1 when judge agrees perfectly with AI", async () => {
    const result = await computeAndSaveCredibility(
      judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets
    );
    expect(result.pillar.p1_rankAgreement).toBeCloseTo(1);
  });

  it("calls User.findByIdAndUpdate to persist new stats", async () => {
    await computeAndSaveCredibility(
      judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets
    );
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      judgeId,
      expect.objectContaining({
        $set: expect.objectContaining({
          "judgeStats.totalSessions": 1,
        }),
      })
    );
  });

  it("calls JudgeSession.findOneAndUpdate to persist the session", async () => {
    await computeAndSaveCredibility(
      judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets
    );
    expect(JudgeSession.findOneAndUpdate).toHaveBeenCalledWith(
      { judgeId, debateId },
      expect.objectContaining({ $set: expect.any(Object) }),
      expect.objectContaining({ upsert: true })
    );
  });

  it("throws when the judge user is not found in the database", async () => {
    (User.findById as any).mockResolvedValue(null);
    await expect(
      computeAndSaveCredibility(judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets)
    ).rejects.toThrow(/not found/i);
  });

  it("produces a higher session score when judge perfectly matches AI vs reversed", async () => {
    const reversedScores = [
      { participantId: judgeScores[0].participantId, score: 60 },
      { participantId: judgeScores[1].participantId, score: 75 },
      { participantId: judgeScores[2].participantId, score: 90 },
    ];

    const goodResult = await computeAndSaveCredibility(
      judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets
    );

    vi.clearAllMocks();
    (User.findById as any).mockResolvedValue({
      _id: judgeId,
      judgeStats: { totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null },
    });
    (User.findByIdAndUpdate as any).mockResolvedValue({});
    (JudgeSession.find as any).mockReturnValue({
      sort: () => ({ limit: () => ({ select: () => Promise.resolve([]) }) }),
    });
    (JudgeSession.findOneAndUpdate as any).mockResolvedValue({});

    const badResult = await computeAndSaveCredibility(
      judgeId, debateId, reversedScores, referenceScores, allJudgeScoreSets
    );

    expect(goodResult.sessionScore).toBeGreaterThan(badResult.sessionScore);
  });

  it("applies P6 penalty when judge gives all identical scores", async () => {
    const lazyScores = judgeScores.map(s => ({ ...s, score: 75 }));

    const goodResult = await computeAndSaveCredibility(
      judgeId, debateId, judgeScores, referenceScores, allJudgeScoreSets
    );

    vi.clearAllMocks();
    (User.findById as any).mockResolvedValue({
      _id: judgeId,
      judgeStats: { totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null },
    });
    (User.findByIdAndUpdate as any).mockResolvedValue({});
    (JudgeSession.find as any).mockReturnValue({
      sort: () => ({ limit: () => ({ select: () => Promise.resolve([]) }) }),
    });
    (JudgeSession.findOneAndUpdate as any).mockResolvedValue({});

    const lazyResult = await computeAndSaveCredibility(
      judgeId, debateId, lazyScores, referenceScores, allJudgeScoreSets
    );

    // P6 should be 0 for lazy judge, dragging session score down
    expect(lazyResult.pillar.p6_integrityScore).toBe(0);
    expect(lazyResult.sessionScore).toBeLessThan(goodResult.sessionScore);
  });
});
