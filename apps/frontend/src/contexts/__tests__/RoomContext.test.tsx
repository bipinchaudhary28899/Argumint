import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { RoomProvider, useRoom } from "../RoomContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RoomProvider>{children}</RoomProvider>
);

describe("RoomContext", () => {
  // ── useRoom outside provider ───────────────────────────────────────────────
  it("throws when useRoom is called outside a RoomProvider", () => {
    expect(() => {
      renderHook(() => useRoom());
    }).toThrow("useRoom must be used within a RoomProvider");
  });

  // ── Initial state ──────────────────────────────────────────────────────────
  it("starts with room = null", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    expect(result.current.room).toBeNull();
  });

  it("starts with isLoading = false", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    expect(result.current.isLoading).toBe(false);
  });

  it("starts with error = null", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    expect(result.current.error).toBeNull();
  });

  // ── setRoom ────────────────────────────────────────────────────────────────
  it("setRoom updates the room value", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    const fakeRoom = { _id: "room-1", code: "ABCD1" } as any;

    act(() => { result.current.setRoom(fakeRoom); });
    expect(result.current.room).toEqual(fakeRoom);
  });

  it("setRoom can set room back to null", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    act(() => { result.current.setRoom({ _id: "room-1" } as any); });
    act(() => { result.current.setRoom(null); });
    expect(result.current.room).toBeNull();
  });

  // ── setIsLoading ───────────────────────────────────────────────────────────
  it("setIsLoading updates isLoading to true", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    act(() => { result.current.setIsLoading(true); });
    expect(result.current.isLoading).toBe(true);
  });

  it("setIsLoading updates isLoading back to false", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    act(() => { result.current.setIsLoading(true); });
    act(() => { result.current.setIsLoading(false); });
    expect(result.current.isLoading).toBe(false);
  });

  // ── setError ───────────────────────────────────────────────────────────────
  it("setError updates error message", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    act(() => { result.current.setError("Something went wrong"); });
    expect(result.current.error).toBe("Something went wrong");
  });

  it("setError can clear error back to null", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    act(() => { result.current.setError("Error"); });
    act(() => { result.current.setError(null); });
    expect(result.current.error).toBeNull();
  });

  // ── All three together ─────────────────────────────────────────────────────
  it("exposes all required context values", () => {
    const { result } = renderHook(() => useRoom(), { wrapper });
    expect(typeof result.current.setRoom).toBe("function");
    expect(typeof result.current.setIsLoading).toBe("function");
    expect(typeof result.current.setError).toBe("function");
  });
});
