/**
 * useWebRTCMesh smoke tests
 *
 * The hook orchestrates RTCPeerConnection, getUserMedia, and socket signalling
 * — all heavyweight browser APIs. These tests mock the browser primitives and
 * verify the hook's observable surface (return values, side-effects on the
 * socket, mic acquisition) without trying to exercise the full WebRTC
 * negotiation flow.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWebRTCMesh } from "../useWebRTCMesh";

// ── Mock RTCPeerConnection ────────────────────────────────────────────────────

function makePeerConnection() {
  return {
    ontrack:                null as any,
    onicecandidate:         null as any,
    onconnectionstatechange: null as any,
    connectionState:        "new",
    createOffer:            vi.fn().mockResolvedValue({ type: "offer",  sdp: "sdp-offer"  }),
    createAnswer:           vi.fn().mockResolvedValue({ type: "answer", sdp: "sdp-answer" }),
    setLocalDescription:    vi.fn().mockResolvedValue(undefined),
    setRemoteDescription:   vi.fn().mockResolvedValue(undefined),
    addIceCandidate:        vi.fn().mockResolvedValue(undefined),
    addTrack:               vi.fn().mockReturnValue({ track: {} }),
    removeTrack:            vi.fn(),
    close:                  vi.fn(),
  };
}

// ── Mock Socket ───────────────────────────────────────────────────────────────

function makeSocket() {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  return {
    on:   vi.fn((event: string, fn: (...args: any[]) => void) => {
      (listeners[event] ??= []).push(fn);
    }),
    off:  vi.fn(),
    emit: vi.fn(),
    _emit: (event: string, ...args: any[]) => {
      (listeners[event] ?? []).forEach(fn => fn(...args));
    },
  };
}

// ── Mock getUserMedia ─────────────────────────────────────────────────────────

function makeMockTrack() { return { stop: vi.fn(), kind: "audio" }; }

function makeMockStream(trackCount = 1) {
  const tracks = Array.from({ length: trackCount }, makeMockTrack);
  return {
    getAudioTracks: () => tracks,
    getTracks:      () => tracks,
  };
}

beforeEach(() => {
  (global as any).RTCPeerConnection      = vi.fn(function () { return makePeerConnection(); });
  (global as any).RTCSessionDescription  = vi.fn(function (init: any) { return init; });
  (global as any).RTCIceCandidate        = vi.fn(function (init: any) { return init; });

  // jsdom doesn't implement HTMLAudioElement.play — provide a stub
  Object.defineProperty(HTMLAudioElement.prototype, "play", {
    value:        vi.fn().mockResolvedValue(undefined),
    configurable: true,
    writable:     true,
  });

  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(makeMockStream()),
    },
    writable:     true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("initial return values", () => {
  it("micError is null on mount", () => {
    const { result } = renderHook(() =>
      useWebRTCMesh({ socket: null, roomId: null, selfUserId: null, isSpeaker: false, activeSpeakerUserId: null }),
    );
    expect(result.current.micError).toBeNull();
  });

  it("audioBlocked is false on mount", () => {
    const { result } = renderHook(() =>
      useWebRTCMesh({ socket: null, roomId: null, selfUserId: null, isSpeaker: false, activeSpeakerUserId: null }),
    );
    expect(result.current.audioBlocked).toBe(false);
  });

  it("activeRemoteUserId is null on mount", () => {
    const { result } = renderHook(() =>
      useWebRTCMesh({ socket: null, roomId: null, selfUserId: null, isSpeaker: false, activeSpeakerUserId: null }),
    );
    expect(result.current.activeRemoteUserId).toBeNull();
  });

  it("exposes a resumeAudio function", () => {
    const { result } = renderHook(() =>
      useWebRTCMesh({ socket: null, roomId: null, selfUserId: null, isSpeaker: false, activeSpeakerUserId: null }),
    );
    expect(typeof result.current.resumeAudio).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("peer discovery", () => {
  it("does NOT emit webrtc:get-peers when socket is null", () => {
    const socket = makeSocket();
    renderHook(() =>
      useWebRTCMesh({ socket: null, roomId: "room-1", selfUserId: "user-a", isSpeaker: false, activeSpeakerUserId: null }),
    );
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("does NOT emit webrtc:get-peers when roomId is null", () => {
    const socket = makeSocket();
    renderHook(() =>
      useWebRTCMesh({ socket: socket as any, roomId: null, selfUserId: "user-a", isSpeaker: false, activeSpeakerUserId: null }),
    );
    expect(socket.emit).not.toHaveBeenCalledWith("webrtc:get-peers", expect.anything(), expect.anything());
  });

  it("emits webrtc:get-peers when socket, roomId, and selfUserId are all provided", async () => {
    const socket = makeSocket();
    socket.emit.mockImplementation((event: string, _payload: any, cb?: (res: any) => void) => {
      if (event === "webrtc:get-peers" && cb) cb({ success: true, peers: [] });
    });

    renderHook(() =>
      useWebRTCMesh({ socket: socket as any, roomId: "room-1", selfUserId: "user-a", isSpeaker: false, activeSpeakerUserId: null }),
    );

    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith("webrtc:get-peers", { roomId: "room-1" }, expect.any(Function)),
    );
  });

  it("creates an RTCPeerConnection for each discovered peer", async () => {
    const socket = makeSocket();
    const peers = [
      { socketId: "sock-b", userId: "user-b", username: "bob" },
    ];
    socket.emit.mockImplementation((event: string, _payload: any, cb?: (res: any) => void) => {
      if (event === "webrtc:get-peers" && cb) cb({ success: true, peers });
    });

    renderHook(() =>
      useWebRTCMesh({ socket: socket as any, roomId: "r1", selfUserId: "user-a", isSpeaker: false, activeSpeakerUserId: null }),
    );

    await waitFor(() => expect((global as any).RTCPeerConnection).toHaveBeenCalledTimes(1));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("activeSpeakerUserId", () => {
  it("reflects the activeSpeakerUserId prop", () => {
    const { result } = renderHook(
      ({ id }: { id: string | null }) =>
        useWebRTCMesh({ socket: null, roomId: null, selfUserId: null, isSpeaker: false, activeSpeakerUserId: id }),
      { initialProps: { id: "user-x" } },
    );
    expect(result.current.activeRemoteUserId).toBe("user-x");
  });

  it("updates when activeSpeakerUserId prop changes", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useWebRTCMesh({ socket: null, roomId: null, selfUserId: null, isSpeaker: false, activeSpeakerUserId: id }),
      { initialProps: { id: "user-x" } },
    );
    rerender({ id: "user-y" });
    expect(result.current.activeRemoteUserId).toBe("user-y");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("mic acquisition when isSpeaker=true", () => {
  it("calls getUserMedia when isSpeaker becomes true", async () => {
    const socket = makeSocket();
    socket.emit.mockImplementation((event: string, _payload: any, cb?: (res: any) => void) => {
      if (event === "webrtc:get-peers" && cb) cb({ success: true, peers: [] });
    });

    renderHook(() =>
      useWebRTCMesh({ socket: socket as any, roomId: "r1", selfUserId: "user-a", isSpeaker: true, activeSpeakerUserId: null }),
    );

    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
  });

  it("sets micError when getUserMedia is denied", async () => {
    const socket = makeSocket();
    socket.emit.mockImplementation((event: string, _payload: any, cb?: (res: any) => void) => {
      if (event === "webrtc:get-peers" && cb) cb({ success: true, peers: [] });
    });
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(
      Object.assign(new Error("Permission denied"), { message: "Permission denied" }),
    );

    const { result } = renderHook(() =>
      useWebRTCMesh({ socket: socket as any, roomId: "r1", selfUserId: "user-a", isSpeaker: true, activeSpeakerUserId: null }),
    );

    await waitFor(() => expect(result.current.micError).toBeTruthy());
    expect(result.current.micError).toContain("Permission denied");
  });

  it("does NOT call getUserMedia when isSpeaker is false", async () => {
    const socket = makeSocket();
    socket.emit.mockImplementation((event: string, _payload: any, cb?: (res: any) => void) => {
      if (event === "webrtc:get-peers" && cb) cb({ success: true, peers: [] });
    });

    renderHook(() =>
      useWebRTCMesh({ socket: socket as any, roomId: "r1", selfUserId: "user-a", isSpeaker: false, activeSpeakerUserId: null }),
    );

    // Give effects time to settle
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("signalling event listeners", () => {
  it("registers webrtc:offer and webrtc:answer listeners on the socket", () => {
    const socket = makeSocket();
    socket.emit.mockImplementation((_e: string, _p: any, cb?: (r: any) => void) => {
      if (cb) cb({ success: true, peers: [] });
    });

    renderHook(() =>
      useWebRTCMesh({ socket: socket as any, roomId: "r1", selfUserId: "user-a", isSpeaker: false, activeSpeakerUserId: null }),
    );

    const registeredEvents = socket.on.mock.calls.map(([e]: [string]) => e);
    expect(registeredEvents).toContain("webrtc:offer");
    expect(registeredEvents).toContain("webrtc:answer");
    expect(registeredEvents).toContain("webrtc:ice-candidate");
  });

  it("deregisters socket listeners on unmount", () => {
    const socket = makeSocket();
    socket.emit.mockImplementation((_e: string, _p: any, cb?: (r: any) => void) => {
      if (cb) cb({ success: true, peers: [] });
    });

    const { unmount } = renderHook(() =>
      useWebRTCMesh({ socket: socket as any, roomId: "r1", selfUserId: "user-a", isSpeaker: false, activeSpeakerUserId: null }),
    );

    unmount();

    const offEvents = socket.off.mock.calls.map(([e]: [string]) => e);
    expect(offEvents).toContain("webrtc:offer");
    expect(offEvents).toContain("webrtc:answer");
    expect(offEvents).toContain("webrtc:ice-candidate");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("resumeAudio", () => {
  it("can be called without throwing when there are no peers", () => {
    const { result } = renderHook(() =>
      useWebRTCMesh({ socket: null, roomId: null, selfUserId: null, isSpeaker: false, activeSpeakerUserId: null }),
    );
    expect(() => act(() => { result.current.resumeAudio(); })).not.toThrow();
  });
});
