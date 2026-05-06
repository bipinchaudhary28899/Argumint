import { spawn } from "node:child_process";
import { Readable } from "node:stream";
// ffmpeg-static resolves to a path string (the bundled binary). On a fresh
// install the binary is downloaded by the package's postinstall script —
// keep `npm install` in environments that can hit GitHub release assets.
// In CI/Docker without internet, set FFMPEG_PATH to a system-installed
// ffmpeg binary and the import below is bypassed.
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_PATH: string =
  process.env.FFMPEG_PATH ||
  (typeof ffmpegStatic === "string" ? ffmpegStatic : "") ||
  "ffmpeg";

export interface TrimResult {
  /** Audio bytes after silence-trim (or original buffer on failure). */
  buffer: Buffer;
  /** Approx. duration of the trimmed audio in seconds. */
  durationSec: number;
  /** True if ffmpeg actually ran successfully. */
  trimmed: boolean;
}

/**
 * Run an ffmpeg invocation that pipes a buffer through stdin and emits
 * the result on stdout. Returns the captured stdout as a Buffer plus
 * stderr as a string (we parse the duration from there).
 */
function runFfmpeg(
  args: string[],
  input: Buffer,
  timeoutMs = 20_000,
): Promise<{ stdout: Buffer; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, args, { stdio: ["pipe", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    let stderrText = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("ffmpeg timed out"));
      }
    }, timeoutMs);

    child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on("data", (c: Buffer) => {
      stderrText += c.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks),
        stderr: stderrText,
        code: code ?? -1,
      });
    });

    // Pipe the input buffer into ffmpeg's stdin.
    Readable.from(input).pipe(child.stdin).on("error", () => {
      // EPIPE if ffmpeg exits early; swallow — close handler reports the real cause.
    });
  });
}

/**
 * Parse the final duration from ffmpeg's stderr. ffmpeg prints lines like
 * "size=...time=00:00:12.34 bitrate=...". We grab the last `time=` value.
 */
function parseDurationSec(stderr: string): number {
  const matches = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (matches.length === 0) return 0;
  const last = matches[matches.length - 1];
  const h = parseInt(last[1], 10);
  const m = parseInt(last[2], 10);
  const s = parseFloat(last[3]);
  return h * 3600 + m * 60 + s;
}

export class AudioService {
  /**
   * Strip silence from a speech audio buffer.
   *
   * Filter behavior:
   *   - silenceremove (start): drop leading silence longer than 0.3s below -40dB.
   *   - silenceremove (stop, periods=-1): also drop interior silence runs
   *     longer than 0.5s. periods=-1 means "every silence run", and the
   *     output is concatenated without those gaps.
   *
   * We re-encode to webm/opus so the output is in a Whisper-friendly
   * format with predictable headers. If ffmpeg fails for any reason
   * (binary missing, corrupt input, sandbox without network during
   * postinstall, etc.) we return the original buffer untouched —
   * transcription still works, just without the silence savings.
   */
  static async trimSilence(input: Buffer): Promise<TrimResult> {
    if (input.length === 0) {
      return { buffer: input, durationSec: 0, trimmed: false };
    }

    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-stats",
      "-i",
      "pipe:0",
      "-af",
      [
        // Trim leading silence
        "silenceremove=start_periods=1:start_duration=0.3:start_threshold=-40dB:detection=peak",
        // Trim repeated interior + trailing silence runs
        "silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-40dB:detection=peak",
      ].join(","),
      "-ac",
      "1",                    // mono — speech doesn't benefit from stereo
      "-ar",
      "16000",                // Whisper's native sample rate; smaller file
      "-c:a",
      "libopus",
      "-b:a",
      "24k",                  // plenty for speech
      "-f",
      "webm",
      "pipe:1",
    ];

    try {
      const { stdout, stderr, code } = await runFfmpeg(args, input);
      if (code !== 0 || stdout.length === 0) {
        console.warn(
          "[AudioService] ffmpeg trim failed, falling back to original. stderr:",
          stderr.slice(0, 400),
        );
        return { buffer: input, durationSec: 0, trimmed: false };
      }
      const durationSec = parseDurationSec(stderr);
      return { buffer: stdout, durationSec, trimmed: true };
    } catch (err: any) {
      console.warn(
        "[AudioService] ffmpeg unavailable or errored — using original buffer.",
        err?.message,
      );
      return { buffer: input, durationSec: 0, trimmed: false };
    }
  }
}
