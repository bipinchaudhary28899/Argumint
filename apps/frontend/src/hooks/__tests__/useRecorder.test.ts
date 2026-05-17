import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecorder } from "../useRecorder";

// ── MediaRecorder / getUserMedia mocks ────────────────────────────────────────

let mockMediaRecorder: any;
let mockStream: any;

function makeMockTrack() {
  return { stop: vi.fn() };
}

function makeMockStream() {
  const tracks = [makeMockTrack()];
  return {
    getTracks:       () => tracks,
    getAudioTracks:  () => tracks,
  };
}

beforeEach(() => {
  vi.useFakeTimers();

  mockStream = makeMockStream();

  mockMediaRecorder = {
    state:            "inactive",
    mimeType:         "audio/webm",
    ondataavailable:  null as any,
    onstop:           null as any,
    start:            vi.fn(function (this: any) { this.state = "recording"; }),
    stop:             vi.fn(function (this: any) { this.state = "inactive"; }),
  };

  // getUserMedia resolves with the mock stream
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
    writable:     true,
    configurable: true,
  });

  // MediaRecorder constructor and isTypeSupported
  (global as any).MediaRecorder = vi.fn(function () {
    return mockMediaRecorder;
  });
  (global as any).MediaRecorder.isTypeSupported = vi.fn(() => false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Helper: start recording and optionally fire onstop to simulate MediaRecorder finishing
async function startAndSettle(result: any) {
  await act(async () => { await result.current.start(); });
}

function fireOnstop() {
  // Simulate the browser firing onstop after stop() is called
  if (mockMediaRecorder.onstop) mockMediaRecorder.onstop();
}

// ─────────────────────────────────────────────────────────────────────────────
describe("initial state", () => {
  it("isRecording is false initially", () => {
    const { result } = renderHook(() => useRecorder(false));
    expect(result.current.isRecording).toBe(false);
  });

  it("elapsed is 0 initially", () => {
    const { result } = renderHook(() => useRecorder(false));
    expect(result.current.elapsed).toBe(0);
  });

  it("micError is null initially", () => {
    const { result } = renderHook(() => useRecorder(false));
    expect(result.current.micError).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("start()", () => {
  it("calls getUserMedia with audio constraints", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.anything() }),
    );
  });

  it("sets isRecording to true after start", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    expect(result.current.isRecording).toBe(true);
  });

  it("calls MediaRecorder.start()", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    expect(mockMediaRecorder.start).toHaveBeenCalled();
  });

  it("clears micError on successful start", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    expect(result.current.micError).toBeNull();
  });

  it("sets micError when getUserMedia is rejected", async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(new Error("Permission denied"));
    const { result } = renderHook(() => useRecorder(false));
    await act(async () => { await result.current.start(); });
    expect(result.current.micError).toContain("microphone");
  });

  it("increments elapsed every second via interval", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.elapsed).toBe(3);
  });

  it("getStream() returns the live stream after start", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    expect(result.current.getStream()).toBe(mockStream);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("stop()", () => {
  it("resolves with a Blob when onstop fires", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);

    // Push some data into the recorder chunks
    act(() => {
      mockMediaRecorder.ondataavailable({ data: new Blob(["audio"]) });
    });

    let resolved: any;
    const stopPromise = result.current.stop().then((r) => { resolved = r; });

    // Simulate browser firing onstop (which the real MediaRecorder would do)
    act(() => { fireOnstop(); });
    await stopPromise;

    expect(resolved.blob).toBeInstanceOf(Blob);
  });

  it("returns durationSec > 0 after recording for some time", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    act(() => { vi.advanceTimersByTime(2000); });

    let resolved: any;
    const stopPromise = result.current.stop().then((r) => { resolved = r; });
    act(() => { fireOnstop(); });
    await stopPromise;

    expect(resolved.durationSec).toBeGreaterThan(0);
  });

  it("resolves immediately (with null blob) when recorder is already inactive", async () => {
    const { result } = renderHook(() => useRecorder(false));
    // Don't start — recorder is inactive
    let resolved: any;
    await act(async () => {
      resolved = await result.current.stop();
    });
    expect(resolved.blob).toBeNull();
  });

  it("sets isRecording to false after onstop", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    const stopPromise = result.current.stop();
    act(() => { fireOnstop(); });
    await stopPromise;
    expect(result.current.isRecording).toBe(false);
  });

  it("stops the elapsed interval", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.elapsed).toBe(2);
    const stopPromise = result.current.stop();
    act(() => { fireOnstop(); });
    await stopPromise;
    act(() => { vi.advanceTimersByTime(5000); }); // advance after stop
    expect(result.current.elapsed).toBe(2); // should not increase
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("cancel()", () => {
  it("sets isRecording to false", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    act(() => { result.current.cancel(); });
    expect(result.current.isRecording).toBe(false);
  });

  it("stops all mic tracks", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    act(() => { result.current.cancel(); });
    const [track] = mockStream.getTracks();
    expect(track.stop).toHaveBeenCalled();
  });

  it("stops the MediaRecorder when it is active", async () => {
    const { result } = renderHook(() => useRecorder(false));
    await startAndSettle(result);
    act(() => { result.current.cancel(); });
    expect(mockMediaRecorder.stop).toHaveBeenCalled();
  });
});
