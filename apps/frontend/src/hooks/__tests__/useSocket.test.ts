import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockSocketInstance, mockIo } = vi.hoisted(() => {
  // A minimal socket.io-client-like object
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  const mockSocketInstance = {
    on:         vi.fn((event: string, fn: (...args: any[]) => void) => { (listeners[event] = listeners[event] ?? []).push(fn); }),
    off:        vi.fn(),
    emit:       vi.fn(),
    disconnect: vi.fn(),
    _emit:      (event: string, ...args: any[]) => { (listeners[event] ?? []).forEach(fn => fn(...args)); },
    _clearListeners: () => { Object.keys(listeners).forEach(k => delete listeners[k]); },
  };
  return {
    mockSocketInstance,
    mockIo: vi.fn(() => mockSocketInstance),
  };
});

vi.mock("socket.io-client", () => ({ io: mockIo }));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { useSocket } from "../useSocket";

describe("useSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocketInstance._clearListeners();
    // Ensure token exists so the hook connects
    localStorage.setItem("token", "test-token");
    mockIo.mockReturnValue(mockSocketInstance);
  });

  afterEach(() => {
    localStorage.removeItem("token");
  });

  it("does not call io() when no token in localStorage", () => {
    localStorage.removeItem("token");
    renderHook(() => useSocket());
    expect(mockIo).not.toHaveBeenCalled();
  });

  it("calls io() with auth token when token exists", () => {
    renderHook(() => useSocket());
    expect(mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ auth: { token: "test-token" } })
    );
  });

  it("initial isConnected is false before connect event", () => {
    const { result } = renderHook(() => useSocket());
    // connect event hasn't fired yet
    expect(result.current.isConnected).toBe(false);
  });

  it("isConnected becomes true on 'connect' event", () => {
    const { result } = renderHook(() => useSocket());
    act(() => { mockSocketInstance._emit("connect"); });
    expect(result.current.isConnected).toBe(true);
  });

  it("isConnected becomes false on 'disconnect' event", () => {
    const { result } = renderHook(() => useSocket());
    act(() => { mockSocketInstance._emit("connect"); });
    act(() => { mockSocketInstance._emit("disconnect"); });
    expect(result.current.isConnected).toBe(false);
  });

  it("isReconnecting becomes true on 'reconnect_attempt' event", () => {
    const { result } = renderHook(() => useSocket());
    act(() => { mockSocketInstance._emit("reconnect_attempt", 1); });
    expect(result.current.isReconnecting).toBe(true);
  });

  it("isReconnecting becomes false and isConnected true on 'reconnect' event", () => {
    const { result } = renderHook(() => useSocket());
    act(() => { mockSocketInstance._emit("reconnect_attempt", 1); });
    act(() => { mockSocketInstance._emit("reconnect", 1); });
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.isConnected).toBe(true);
  });

  it("isReconnecting becomes false on 'reconnect_failed'", () => {
    const { result } = renderHook(() => useSocket());
    act(() => { mockSocketInstance._emit("reconnect_attempt", 1); });
    act(() => { mockSocketInstance._emit("reconnect_failed"); });
    expect(result.current.isReconnecting).toBe(false);
  });

  it("returns the socket instance after mount", () => {
    const { result } = renderHook(() => useSocket());
    expect(result.current.socket).toBe(mockSocketInstance);
  });

  it("calls socket.disconnect() on unmount", () => {
    const { unmount } = renderHook(() => useSocket());
    unmount();
    expect(mockSocketInstance.disconnect).toHaveBeenCalled();
  });

  it("onReconnect registers a listener that fires on socket reconnect", () => {
    const { result } = renderHook(() => useSocket());
    const reconnectSpy = vi.fn();

    act(() => {
      result.current.onReconnect(reconnectSpy);
    });

    act(() => { mockSocketInstance._emit("reconnect", 1); });

    expect(reconnectSpy).toHaveBeenCalledTimes(1);
  });

  it("onReconnect returns an unsubscribe function that deregisters the listener", () => {
    const { result } = renderHook(() => useSocket());
    const reconnectSpy = vi.fn();

    let unsub: () => void;
    act(() => {
      unsub = result.current.onReconnect(reconnectSpy);
    });

    act(() => { unsub(); });
    act(() => { mockSocketInstance._emit("reconnect", 1); });

    expect(reconnectSpy).not.toHaveBeenCalled();
  });

  it("fires multiple onReconnect listeners when socket reconnects", () => {
    const { result } = renderHook(() => useSocket());
    const spy1 = vi.fn();
    const spy2 = vi.fn();

    act(() => {
      result.current.onReconnect(spy1);
      result.current.onReconnect(spy2);
    });

    act(() => { mockSocketInstance._emit("reconnect", 1); });

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  it("clears token and redirects to /login?reason=evicted on session:evicted", () => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("argumint_user", JSON.stringify({ username: "alice" }));

    const hrefSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, set href(val: string) { hrefSpy(val); } },
      writable: true,
      configurable: true,
    });

    renderHook(() => useSocket());
    act(() => { mockSocketInstance._emit("session:evicted"); });

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("argumint_user")).toBeNull();
    expect(hrefSpy).toHaveBeenCalledWith("/login?reason=evicted");
  });
});
