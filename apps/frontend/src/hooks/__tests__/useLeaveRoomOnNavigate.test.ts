import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLeaveRoomOnNavigate } from "../useLeaveRoomOnNavigate";

function makeSocket() {
  return { emit: vi.fn() } as any;
}

describe("useLeaveRoomOnNavigate", () => {
  beforeEach(() => {
    // Default: pathname is NOT inside the room, so leave should be emitted
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/" },
      writable: true,
      configurable: true,
    });
  });

  it("does not emit on mount", () => {
    const socket = makeSocket();
    renderHook(() => useLeaveRoomOnNavigate("ABCD1", "room-1", socket));
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("emits 'room:leave' with roomId when unmounting and navigating away from room", () => {
    const socket = makeSocket();
    // Simulate navigating away from the room (pathname does not start with /room/ABCD1)
    Object.defineProperty(window, "location", {
      value: { pathname: "/home" },
      writable: true,
      configurable: true,
    });

    const { unmount } = renderHook(() =>
      useLeaveRoomOnNavigate("ABCD1", "room-1", socket)
    );
    unmount();

    expect(socket.emit).toHaveBeenCalledWith("room:leave", { roomId: "room-1" });
  });

  it("does NOT emit when unmounting and still inside the room path", () => {
    const socket = makeSocket();
    // Simulate staying inside the room (lobby → prep)
    Object.defineProperty(window, "location", {
      value: { pathname: "/room/ABCD1/prep/debate-99" },
      writable: true,
      configurable: true,
    });

    const { unmount } = renderHook(() =>
      useLeaveRoomOnNavigate("ABCD1", "room-1", socket)
    );
    unmount();

    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("does NOT emit when socket is null", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/home" },
      writable: true,
      configurable: true,
    });
    const { unmount } = renderHook(() =>
      useLeaveRoomOnNavigate("ABCD1", "room-1", null)
    );
    unmount();
    // No socket → no emit (and no crash)
  });

  it("does NOT emit when code is undefined", () => {
    const socket = makeSocket();
    Object.defineProperty(window, "location", {
      value: { pathname: "/home" },
      writable: true,
      configurable: true,
    });
    const { unmount } = renderHook(() =>
      useLeaveRoomOnNavigate(undefined, "room-1", socket)
    );
    unmount();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("does NOT emit when roomId is undefined", () => {
    const socket = makeSocket();
    Object.defineProperty(window, "location", {
      value: { pathname: "/home" },
      writable: true,
      configurable: true,
    });
    const { unmount } = renderHook(() =>
      useLeaveRoomOnNavigate("ABCD1", undefined, socket)
    );
    unmount();
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it("uses latest code/roomId/socket values at unmount time (ref tracking)", () => {
    const socket1 = makeSocket();
    const socket2 = makeSocket();

    Object.defineProperty(window, "location", {
      value: { pathname: "/home" },
      writable: true,
      configurable: true,
    });

    const { rerender, unmount } = renderHook(
      ({ code, roomId, socket }: any) => useLeaveRoomOnNavigate(code, roomId, socket),
      { initialProps: { code: "ABCD1", roomId: "room-1", socket: socket1 } }
    );

    // Update to new socket and roomId
    rerender({ code: "ABCD1", roomId: "room-2", socket: socket2 });

    unmount();

    // Should use the LATEST values (socket2, room-2) — not the initial ones
    expect(socket2.emit).toHaveBeenCalledWith("room:leave", { roomId: "room-2" });
    expect(socket1.emit).not.toHaveBeenCalled();
  });
});
