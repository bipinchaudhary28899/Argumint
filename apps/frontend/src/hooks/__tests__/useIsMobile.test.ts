import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "../useIsMobile";

describe("useIsMobile", () => {
  const originalInnerWidth = window.innerWidth;

  function setWidth(width: number) {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: width,
    });
  }

  afterEach(() => {
    // Restore
    setWidth(originalInnerWidth);
  });

  it("returns false when window.innerWidth is >= 768 (default breakpoint)", () => {
    setWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when window.innerWidth is < 768 (default breakpoint)", () => {
    setWidth(480);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns true at exactly 767px (one below default breakpoint)", () => {
    setWidth(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false at exactly 768px (default breakpoint)", () => {
    setWidth(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("uses a custom breakpoint when provided", () => {
    setWidth(600);
    const { result } = renderHook(() => useIsMobile(640));
    expect(result.current).toBe(true);
  });

  it("returns false when width >= custom breakpoint", () => {
    setWidth(1200);
    const { result } = renderHook(() => useIsMobile(640));
    expect(result.current).toBe(false);
  });

  it("updates to true when window is resized below breakpoint", () => {
    setWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      setWidth(375);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(true);
  });

  it("updates to false when window is resized above breakpoint", () => {
    setWidth(375);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    act(() => {
      setWidth(1280);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(false);
  });

  it("removes resize listener on unmount", () => {
    setWidth(1024);
    const addSpy    = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useIsMobile());
    unmount();

    expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
