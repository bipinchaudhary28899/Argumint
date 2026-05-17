import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpeechRecognition } from "../useSpeechRecognition";

// ── Mock SpeechRecognition ────────────────────────────────────────────────────

let mockSR: any;

function makeSR() {
  return {
    continuous:     false,
    interimResults: false,
    lang:           "",
    onresult:       null as any,
    onerror:        null as any,
    onend:          null as any,
    onstart:        null as any,
    start:          vi.fn(),
    stop:           vi.fn(),
    abort:          vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockSR = makeSR();
  // Use a regular function so `new SpeechRecognition()` returns the mock instance.
  (window as any).SpeechRecognition = vi.fn(function () {
    return mockSR;
  });
  delete (window as any).webkitSpeechRecognition;
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as any).SpeechRecognition;
});

// ── supported flag ────────────────────────────────────────────────────────────
describe("supported", () => {
  it("is true when window.SpeechRecognition exists", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(true);
  });

  it("is true when only webkitSpeechRecognition exists", () => {
    delete (window as any).SpeechRecognition;
    (window as any).webkitSpeechRecognition = vi.fn(function () { return makeSR(); });
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(true);
  });

  it("is false when neither SR constructor is on window", () => {
    delete (window as any).SpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(false);
  });
});

// ── initial state ─────────────────────────────────────────────────────────────
describe("initial state", () => {
  it("isListening starts as false", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isListening).toBe(false);
  });

  it("transcript starts empty", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.transcript).toBe("");
  });

  it("interim starts empty", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.interim).toBe("");
  });

  it("error starts as null", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.error).toBeNull();
  });
});

// ── start ─────────────────────────────────────────────────────────────────────
describe("start", () => {
  it("calls recognizer.start()", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    expect(mockSR.start).toHaveBeenCalledTimes(1);
  });

  it("sets isListening to true", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    expect(result.current.isListening).toBe(true);
  });

  it("configures recognizer with continuous=true, interimResults=true", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    expect(mockSR.continuous).toBe(true);
    expect(mockSR.interimResults).toBe(true);
  });

  it("uses provided lang on the recognizer", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start("fr-FR"); });
    expect(mockSR.lang).toBe("fr-FR");
  });

  it("defaults to en-US when no lang provided", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    expect(mockSR.lang).toBe("en-US");
  });

  it("sets error=not-supported and stays not-listening when unsupported", () => {
    delete (window as any).SpeechRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    expect(result.current.error).toBe("not-supported");
    expect(result.current.isListening).toBe(false);
  });

  it("clears transcript and interim on start", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    // First session builds up some state via onresult
    act(() => { result.current.start(); });
    act(() => {
      mockSR.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "hello" }, length: 1 }],
      });
    });
    expect(result.current.transcript).toBe("hello");
    // Second start should clear it
    act(() => { result.current.start(); });
    expect(result.current.transcript).toBe("");
    expect(result.current.interim).toBe("");
  });
});

// ── onresult ──────────────────────────────────────────────────────────────────
describe("onresult", () => {
  function makeResult(text: string, isFinal: boolean) {
    return { isFinal, 0: { transcript: text }, length: 1 };
  }

  it("appends final results to transcript", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [makeResult("hello", true)] });
    });
    expect(result.current.transcript).toBe("hello");
  });

  it("accumulates multiple final results", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [makeResult("hello", true)] });
    });
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [makeResult("world", true)] });
    });
    expect(result.current.transcript).toBe("hello world");
  });

  it("sets interim for non-final results", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [makeResult("hel", false)] });
    });
    expect(result.current.interim).toBe("hel");
  });

  it("clears interim when final result received", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [makeResult("hel", false)] });
    });
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [makeResult("hello", true)] });
    });
    expect(result.current.interim).toBe("");
  });
});

// ── onerror ───────────────────────────────────────────────────────────────────
describe("onerror", () => {
  it("ignores no-speech errors", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { mockSR.onerror({ error: "no-speech" }); });
    expect(result.current.error).toBeNull();
  });

  it("ignores aborted errors", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { mockSR.onerror({ error: "aborted" }); });
    expect(result.current.error).toBeNull();
  });

  it("ignores network errors (recoverable on Android Chrome)", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { mockSR.onerror({ error: "network" }); });
    expect(result.current.error).toBeNull();
  });

  it("sets error state for unrecognised error codes", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { mockSR.onerror({ error: "not-allowed" }); });
    expect(result.current.error).toBe("not-allowed");
  });
});

// ── stop ──────────────────────────────────────────────────────────────────────
describe("stop", () => {
  it("calls recognizer.stop()", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { result.current.stop(); });
    expect(mockSR.stop).toHaveBeenCalled();
  });

  it("returns the accumulated transcript", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => {
      mockSR.onresult({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "my speech" }, length: 1 }],
      });
    });
    let returned = "";
    act(() => { returned = result.current.stop(); });
    expect(returned).toBe("my speech");
  });

  it("sets isListening to false", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { result.current.stop(); });
    expect(result.current.isListening).toBe(false);
  });

  it("rescues in-flight interim text on stop", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    // Accumulate interim that hasn't been finalised
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "partial" }, length: 1 }] });
    });
    let returned = "";
    act(() => { returned = result.current.stop(); });
    // Rescued interim should appear in the returned transcript
    expect(returned).toContain("partial");
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────
describe("reset", () => {
  it("clears transcript and interim", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "hi" }, length: 1 }] });
    });
    act(() => { result.current.reset(); });
    expect(result.current.transcript).toBe("");
    expect(result.current.interim).toBe("");
  });

  it("clears error", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { mockSR.onerror({ error: "not-allowed" }); });
    act(() => { result.current.reset(); });
    expect(result.current.error).toBeNull();
  });

  it("calls recognizer.abort()", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { result.current.reset(); });
    expect(mockSR.abort).toHaveBeenCalled();
  });

  it("sets isListening to false", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { result.current.reset(); });
    expect(result.current.isListening).toBe(false);
  });
});

// ── auto-restart via onend ────────────────────────────────────────────────────
describe("onend auto-restart", () => {
  it("does not restart when wantListening is false (after stop)", async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => { result.current.stop(); }); // sets wantListening=false
    const callsBefore = (window as any).SpeechRecognition.mock.calls.length;
    act(() => { mockSR.onend(); });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect((window as any).SpeechRecognition.mock.calls.length).toBe(callsBefore);
  });

  it("rescues interim text on onend before restarting", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    act(() => {
      mockSR.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "interim" }, length: 1 }] });
    });
    act(() => { result.current.stop(); });
    // After stop, wantListening=false; onend rescues interim
    act(() => { mockSR.onend(); });
    expect(result.current.transcript).toContain("interim");
  });
});

// ── cleanup on unmount ────────────────────────────────────────────────────────
describe("cleanup on unmount", () => {
  it("calls recognizer.abort() on unmount while listening", () => {
    const { result, unmount } = renderHook(() => useSpeechRecognition());
    act(() => { result.current.start(); });
    unmount();
    expect(mockSR.abort).toHaveBeenCalled();
  });
});
