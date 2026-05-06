import OpenAI from "openai";
import {
  Debate,
  IDebate,
  IDebateResult,
  IScoreBreakdown,
} from "../models/Debate.model.js";

/**
 * The chat-completions client we use for *judging* (a different concern
 * from transcription). Same API key, separate lazy client to keep the
 * surface area clear.
 */
let chatClient: OpenAI | null = null;
function getChatClient(): OpenAI {
  if (chatClient) return chatClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. The AI judge needs this to run.",
    );
  }
  chatClient = new OpenAI({ apiKey });
  return chatClient;
}

/**
 * Default to the cheapest capable model. Override via OPENAI_JUDGE_MODEL
 * if you ever want to A/B compare gpt-4o on quality.
 */
const JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL || "gpt-4o-mini";

/**
 * Build the user-facing prompt the LLM sees. Includes:
 *   - The motion
 *   - Each speaker's userId, username, and assigned side
 *   - The full transcript in chronological order
 *   - The exact JSON schema we expect back
 *
 * We use userId as the primary key in the JSON response so score mapping
 * back to participants is exact — no case-insensitive username lookup needed,
 * and duplicate/similar usernames can never cause a collision.
 */
function buildPrompt(debate: IDebate): string {
  const speakerLines = debate.turnOrder
    .map((p) => `- userId: ${p.userId} | name: ${p.username} | side: ${p.side}`)
    .join("\n");

  const transcriptLines: string[] = [];
  // Group rounds by roundNumber for readability.
  const byRound = new Map<number, typeof debate.rounds>();
  for (const r of debate.rounds) {
    const list = byRound.get(r.roundNumber) ?? [];
    list.push(r);
    byRound.set(r.roundNumber, list);
  }
  const roundNumbers = Array.from(byRound.keys()).sort((a, b) => a - b);
  for (const rn of roundNumbers) {
    transcriptLines.push(`\n[Round ${rn}]`);
    for (const r of byRound.get(rn) ?? []) {
      const argText = r.argument?.trim()
        ? r.argument.trim()
        : "(no transcript — speaker did not contribute)";
      transcriptLines.push(`[${r.speakerId}] ${r.speakerUsername} (${r.side}): ${argText}`);
    }
  }

  // For speakers with no rounds at all (e.g. silent throughout), surface that.
  const spokeIds = new Set(debate.rounds.map((r) => r.speakerId));
  const silent = debate.turnOrder.filter((p) => !spokeIds.has(p.userId));
  if (silent.length) {
    transcriptLines.push(
      `\n(silent speakers: ${silent.map((s) => `${s.username} [${s.userId}]`).join(", ")})`,
    );
  }

  return `Topic: ${debate.topic}

Speakers (with their assigned sides):
${speakerLines}

Transcript:${transcriptLines.join("\n")}

Your task:
1. Decide which side (FOR or AGAINST) made the more persuasive case overall.
2. List 3–5 specific points that won it for them. Each point must reference actual content from the transcript (paraphrasing is fine, but ground it in what speakers actually said).
3. Score every speaker individually using this rubric (each sub-dimension 0–25):
   - clarity: was the argument easy to follow?
   - evidence: did they back claims with reasoning, examples, or facts?
   - rebuttal: did they engage with the opposing side's points?
   - organization: was the argument structured logically?
   The "total" field MUST equal clarity + evidence + rebuttal + organization.
4. Give every speaker:
   - A 1–2 sentence "feedback" summary note.
   - 2–3 "strengths": specific things they did well (reference actual content).
   - 2–3 "improvements": specific, actionable things they could do better next time.
   For speakers who contributed nothing, strengths should be empty and improvements should explain what they should have done.

Important:
- Be impartial. Don't favor a side based on which position it argues — only on argument quality.
- Speakers who didn't contribute should receive low scores AND feedback explaining why (no audible argument to judge).
- Use the exact userId values listed above in your response.

Respond ONLY with valid JSON in this exact shape:
{
  "winnerSide": "for" | "against",
  "winningPoints": ["...", "..."],
  "summary": "1-2 sentence overall summary",
  "scores": [
    {
      "userId": "...",
      "side": "for" | "against",
      "clarity": 0,
      "evidence": 0,
      "rebuttal": 0,
      "organization": 0,
      "total": 0,
      "feedback": "...",
      "strengths": ["...", "..."],
      "improvements": ["...", "..."]
    }
  ]
}`;
}

interface RawScore {
  userId?: string;
  side?: "for" | "against";
  clarity?: number;
  evidence?: number;
  rebuttal?: number;
  organization?: number;
  total?: number;
  feedback?: string;
  strengths?: string[];
  improvements?: string[];
}

interface RawResult {
  winnerSide?: "for" | "against";
  winningPoints?: string[];
  summary?: string;
  scores?: RawScore[];
}

/**
 * Clamp a sub-dimension into [0, 25] and treat NaN/missing as 0. We're
 * intentionally lenient — the LLM occasionally returns floats or strings.
 */
function clamp25(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!isFinite(num)) return 0;
  return Math.max(0, Math.min(25, Math.round(num)));
}

/**
 * Map LLM output to our IDebateResult, repairing what we can:
 *   - Match scores back to participants directly via userId (exact match).
 *   - Backfill missing rows with zeros so every participant appears.
 *   - Recompute `total` as the sum of the four parts (LLM sometimes
 *     gets this arithmetic wrong).
 */
function normalizeResult(
  raw: RawResult,
  debate: IDebate,
): IDebateResult {
  const winnerSide: "for" | "against" =
    raw.winnerSide === "against" ? "against" : "for";

  const winningPoints = Array.isArray(raw.winningPoints)
    ? raw.winningPoints
        .filter((s) => typeof s === "string" && s.trim())
        .map((s) => s.trim())
        .slice(0, 8)
    : [];

  const summary = (raw.summary ?? "").trim();

  // Index LLM scores by userId — exact match, no username collision risk.
  const rawById = new Map<string, RawScore>();
  for (const s of raw.scores ?? []) {
    if (s.userId) rawById.set(s.userId, s);
  }

  const scores: IScoreBreakdown[] = debate.turnOrder.map((p) => {
    const r = rawById.get(p.userId) ?? {};
    const clarity = clamp25(r.clarity);
    const evidence = clamp25(r.evidence);
    const rebuttal = clamp25(r.rebuttal);
    const organization = clamp25(r.organization);
    const total = clarity + evidence + rebuttal + organization; // authoritative
    const feedback =
      typeof r.feedback === "string" && r.feedback.trim()
        ? r.feedback.trim()
        : "No feedback generated.";
    const strengths = Array.isArray(r.strengths)
      ? r.strengths.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()).slice(0, 4)
      : [];
    const improvements = Array.isArray(r.improvements)
      ? r.improvements.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()).slice(0, 4)
      : [];
    return {
      userId: p.userId,
      username: p.username,
      side: p.side,
      clarity,
      evidence,
      rebuttal,
      organization,
      total,
      feedback,
      strengths,
      improvements,
    };
  });

  return {
    winnerSide,
    winningPoints,
    summary,
    scores,
    judgedAt: new Date(),
    judgeModel: JUDGE_MODEL,
  };
}

export class JudgeService {
  /**
   * Run the AI judge for a finished debate. Persists the result onto
   * the Debate document and returns it. Idempotent — if a result
   * already exists it just returns it without re-charging the API.
   *
   * Throws on hard failure (API down, no API key, malformed JSON we
   * can't repair). Caller should catch and broadcast a "judging failed"
   * state rather than crash the socket loop.
   */
  static async judge(debateId: string): Promise<IDebateResult> {
    const debate = await Debate.findById(debateId);
    if (!debate) throw new Error("Debate not found");
    if (debate.status !== "ended") {
      throw new Error(`Cannot judge debate in status "${debate.status}"`);
    }

    // Skip if we've already produced a result.
    if (debate.result) return debate.result;

    const client = getChatClient();
    const prompt = buildPrompt(debate);

    const completion = await client.chat.completions.create({
      model: JUDGE_MODEL,
      // Forces the response into a JSON object — far fewer parse failures
      // than free-form text where the model adds prose around the JSON.
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an impartial judge of a structured debate. Score each speaker fairly using only the rubric provided. Output strict JSON.",
        },
        { role: "user", content: prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? "";
    let raw: RawResult;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      console.error(
        "[Judge] Could not parse LLM output. First 400 chars:",
        text.slice(0, 400),
      );
      throw new Error("Judge returned unparseable output");
    }

    const result = normalizeResult(raw, debate);
    debate.result = result;
    await debate.save();
    return result;
  }
}
