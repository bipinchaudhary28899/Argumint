import OpenAI from "openai";
import { toFile } from "openai/uploads";

/**
 * Lazy singleton — only instantiate when we have a key, so the rest of
 * the app boots fine in dev without OPENAI_API_KEY set.
 */
let cached: OpenAI | null = null;
function getClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to apps/backend/.env to enable transcription.",
    );
  }
  cached = new OpenAI({ apiKey });
  return cached;
}

export interface TranscribeOptions {
  /**
   * Free-form context passed as the Whisper `prompt` parameter — it
   * biases the model toward the named entities and jargon present in
   * the prompt. We pass topic + recent transcripts so debate-specific
   * terms (laws, products, names) are recognized correctly.
   */
  prompt?: string;
  /**
   * BCP-47 language hint (e.g. "en"). Skipping language detection makes
   * the call marginally faster and removes a class of failure mode.
   */
  language?: string;
}

/**
 * Default to the cheaper, newer transcription model. Half the price of
 * whisper-1 ($0.003/min vs $0.006/min) and similar quality on clean speech.
 * Override via the OPENAI_TRANSCRIBE_MODEL env var if you ever need to A/B
 * compare without redeploying.
 */
const TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

export class WhisperService {
  /**
   * Transcribe an audio buffer.
   *
   * Sends the raw audio bytes plus the supplied prompt/language hints.
   * Returns the transcribed text only — we never log the audio, never
   * persist it server-side, and don't send any user identifiers to OpenAI.
   */
  static async transcribe(
    audio: Buffer,
    filename = "speech.webm",
    mimeType = "audio/webm",
    opts: TranscribeOptions = {},
  ): Promise<string> {
    const client = getClient();

    const file = await toFile(audio, filename, { type: mimeType });

    const result = await client.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
      // `text` keeps the response body tiny and predictable.
      response_format: "text",
      // Deterministic — easier to retry/cache and less drift across calls.
      temperature: 0,
      // Bias the recognizer toward the topic / recent context.
      ...(opts.prompt ? { prompt: opts.prompt.slice(0, 600) } : {}),
      // Skip language auto-detection when caller knows the language.
      ...(opts.language ? { language: opts.language } : {}),
    });

    // With response_format: "text" the SDK returns a plain string.
    // Cast safely to string in case the SDK shape changes.
    return typeof result === "string"
      ? result
      : ((result as any)?.text ?? "");
  }
}
