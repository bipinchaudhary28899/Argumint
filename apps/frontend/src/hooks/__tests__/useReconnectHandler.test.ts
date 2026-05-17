import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useReconnectHandler } from "../useReconnectHandler";

describe("useReconnectHandler", () => {
  let mockUnsub: ReturnType<typeof vi.fn>;
  let mockOnReconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUnsub       = vi.fn();
    mockOnReconnect = vi.fn(() => mockUnsub);
  });

  it("registers a reconnect listener via onReconnect on mount", () => {
    renderHook(() =>
      useReconnectHandler({
        onReconnect: mockOnReconnect,
        reconnectFn: vi.fn(),
      })
    );
    expect(mockOnReconnect).toHaveBeenCalledWith(expect.any(Function));
  });

  it("calls reconnectFn when the registered callback is invoked", () => {
    const reconnectFn = vi.fn();
    renderHook(() =>
      useReconnectHandler({ onReconnect: mockOnReconnect, reconnectFn })
    );

    // Simulate a socket reconnect by invoking the callback that was registered
    const registeredCallback = mockOnReconnect.mock.calls[0][0];
    registeredCallback();

    expect(reconnectFn).toHaveBeenCalledTimes(1);
  });

  it("calls the unsubscribe function returned by onReconnect on unmount", () => {
    const { unmount } = renderHook(() =>
      useReconnectHandler({
        onReconnect: mockOnReconnect,
        reconnectFn: vi.fn(),
      })
    );

    unmount();
    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });

  it("does NOT register a listener when enabled=false", () => {
    renderHook(() =>
      useReconnectHandler({
        onReconnect: mockOnReconnect,
        reconnectFn: vi.fn(),
        enabled: false,
      })
    );
    expect(mockOnReconnect).not.toHaveBeenCalled();
  });

  it("does not call unsub when enabled=false (nothing was subscribed)", () => {
    const { unmount } = renderHook(() =>
      useReconnectHandler({
        onReconnect: mockOnReconnect,
        reconnectFn: vi.fn(),
        enabled: false,
      })
    );
    unmount();
    expect(mockUnsub).not.toHaveBeenCalled();
  });

  it("registers listener when enabled switches from false to true", () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useReconnectHandler({
          onReconnect: mockOnReconnect,
          reconnectFn: vi.fn(),
          enabled,
        }),
      { initialProps: { enabled: false } }
    );

    expect(mockOnReconnect).not.toHaveBeenCalled();

    rerender({ enabled: true });
    expect(mockOnReconnect).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes old listener and registers new one when onReconnect changes", () => {
    const mockUnsub2      = vi.fn();
    const mockOnReconnect2 = vi.fn(() => mockUnsub2);

    const { rerender } = renderHook(
      ({ onReconnect }: { onReconnect: any }) =>
        useReconnectHandler({ onReconnect, reconnectFn: vi.fn() }),
      { initialProps: { onReconnect: mockOnReconnect } }
    );

    expect(mockOnReconnect).toHaveBeenCalledTimes(1);

    rerender({ onReconnect: mockOnReconnect2 });

    // Old subscription cleaned up, new one registered
    expect(mockUnsub).toHaveBeenCalledTimes(1);
    expect(mockOnReconnect2).toHaveBeenCalledTimes(1);
  });

  it("enabled defaults to true when not provided", () => {
    renderHook(() =>
      useReconnectHandler({
        onReconnect: mockOnReconnect,
        reconnectFn: vi.fn(),
        // enabled not provided
      })
    );
    expect(mockOnReconnect).toHaveBeenCalled();
  });
});
