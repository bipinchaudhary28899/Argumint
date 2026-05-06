import express, { Request, Response } from "express";
import multer from "multer";
import { createAuthMiddleware } from "../middleware/auth.middleware.js";
import Redis from "ioredis";
import { Debate } from "../models/Debate.model.js";
import { DebateService } from "../services/debate.service.js";
import { WhisperService } from "../services/whisper.service.js";
import { AudioService } from "../services/audio.service.js";

// 25MB cap — Whisper's API limit. Audio is short (one turn ≈ a few minutes
// of opus-encoded webm runs well under this), so this is generous.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export function createDebateRoutes(redisClient: Redis | null) {
  const router = express.Router();
  const authMiddleware = createAuthMiddleware(redisClient);

  /**
   * GET /debates/:id — fetch full debate state (used by clients to
   * rebuild state on page reload / late join).
   */
  router.get(
    "/:id",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const debate = await DebateService.getById(req.params.id);
        if (!debate) {
          return res.status(404).json({ error: "Debate not found" });
        }
        res.json(debate);
      } catch (err) {
        console.error("[DebateRoutes] Get debate error:", err);
        res.status(500).json({ error: "Failed to get debate" });
      }
    },
  );

  /**
   * POST /debates/:id/transcribe — accepts an audio blob (multipart
   * field name "audio"), runs Whisper, returns { text }.
   *
   * Called only as a fallback when browser-side SpeechRecognition
   * couldn't produce a usable transcript (or isn't available, e.g. on
   * Firefox). We bias the recognizer with the debate topic + the last
   * few rounds' transcripts via the Whisper `prompt` parameter — this
   * is free and meaningfully improves accuracy on debate-specific
   * jargon and proper names.
   */
  router.post(
    "/:id/transcribe",
    authMiddleware,
    upload.single("audio"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: "No audio file uploaded" });
        }

        const debate = await DebateService.getById(req.params.id);
        if (!debate) {
          return res.status(404).json({ error: "Debate not found" });
        }

        // Speaker auth: who is allowed to submit audio depends on mode.
        if (debate.mode === "buzzer") {
          // In buzzer mode the current mic holder may transcribe.
          if (!debate.buzzerState || debate.buzzerState.currentHolder !== req.userId) {
            return res.status(403).json({ error: "You are not the current mic holder" });
          }
        } else {
          // In alternate mode, only the speaker whose turn it is may transcribe.
          if (!debate.currentTurn || debate.currentTurn.speakerId !== req.userId) {
            return res.status(403).json({ error: "It is not your turn" });
          }
        }

        // Budget gate: refuse if we've already burned through the cap.
        if (
          debate.whisperBudgetMinutes != null &&
          debate.whisperMinutesUsed >= debate.whisperBudgetMinutes
        ) {
          return res.status(429).json({
            error: "Whisper minute budget exhausted for this debate",
            code: "whisper-budget-exhausted",
            usedMinutes: debate.whisperMinutesUsed,
            budgetMinutes: debate.whisperBudgetMinutes,
          });
        }

        // Strip leading/interior/trailing silence. ffmpeg failures fall
        // back to the original buffer so transcription still works —
        // we just lose the cost savings.
        const trim = await AudioService.trimSilence(req.file.buffer);
        const trimmedDurationMin = trim.durationSec / 60;

        // Build the prompt: topic first, then up to the last 2 transcripts.
        const recentTail = debate.rounds
          .slice(-2)
          .map((r) => `${r.speakerUsername}: ${r.argument}`.slice(0, 200))
          .join("\n");
        const prompt = [`Topic: ${debate.topic}`, recentTail]
          .filter(Boolean)
          .join("\n");

        const filename = trim.trimmed ? "speech.trim.webm" : (req.file.originalname || "speech.webm");
        const mimeType = trim.trimmed ? "audio/webm" : (req.file.mimetype || "audio/webm");

        const text = await WhisperService.transcribe(
          trim.buffer,
          filename,
          mimeType,
          { prompt, language: "en" },
        );

        // Atomically increment the running tally — `$inc` avoids races if
        // two transcribe calls overlap (rare, but possible on retries).
        // We only count minutes when ffmpeg gave us a measurable duration.
        if (trimmedDurationMin > 0) {
          await Debate.updateOne(
            { _id: debate._id },
            { $inc: { whisperMinutesUsed: trimmedDurationMin } },
          );
        }

        res.json({
          text,
          minutesBilled: trimmedDurationMin,
          minutesUsedTotal:
            (debate.whisperMinutesUsed || 0) + trimmedDurationMin,
          budgetMinutes: debate.whisperBudgetMinutes,
        });
      } catch (err: any) {
        console.error("[DebateRoutes] Transcribe error:", err);
        res
          .status(500)
          .json({ error: err?.message || "Failed to transcribe audio" });
      }
    },
  );

  return router;
}
