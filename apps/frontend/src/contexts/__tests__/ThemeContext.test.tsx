import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme, THEMES } from "../ThemeContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset data-theme attribute
    document.documentElement.removeAttribute("data-theme");
  });

  // ── Initial state ──────────────────────────────────────────────────────────
  it("defaults to 'light' theme when no localStorage value", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
  });

  it("reads saved theme from localStorage on init", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });

  it("falls back to 'light' for unknown theme values in localStorage", () => {
    localStorage.setItem("theme", "unknown_theme");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
  });

  it("exposes meta matching the current theme", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.meta.id).toBe("light");
    expect(result.current.meta.label).toBe("Light");
  });

  // ── setTheme ───────────────────────────────────────────────────────────────
  it("setTheme updates the theme", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme("dark"); });
    expect(result.current.theme).toBe("dark");
  });

  it("setTheme persists to localStorage", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme("glacier"); });
    expect(localStorage.getItem("theme")).toBe("glacier");
  });

  it("setTheme updates data-theme on <html>", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme("dark"); });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("meta updates when theme changes", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.setTheme("glacier"); });
    expect(result.current.meta.id).toBe("glacier");
    expect(result.current.meta.label).toBe("Glacier");
  });

  // ── cycle ──────────────────────────────────────────────────────────────────
  it("cycle advances to the next theme in order", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    // light → dark
    act(() => { result.current.cycle(); });
    expect(result.current.theme).toBe("dark");
  });

  it("cycle wraps around from last theme to first", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    // Advance to last theme (glacier)
    act(() => { result.current.setTheme("glacier"); });
    // Cycle should wrap back to light
    act(() => { result.current.cycle(); });
    expect(result.current.theme).toBe(THEMES[0].id);
  });

  it("cycle goes through all themes in order", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    const themeIds = THEMES.map(t => t.id);
    for (let i = 1; i < themeIds.length; i++) {
      act(() => { result.current.cycle(); });
      expect(result.current.theme).toBe(themeIds[i]);
    }
  });

  // ── toggle ─────────────────────────────────────────────────────────────────
  it("toggle switches from light to dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.toggle(); });
    expect(result.current.theme).toBe("dark");
  });

  it("toggle switches from dark to light", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => { result.current.toggle(); });
    expect(result.current.theme).toBe("light");
  });

  // ── useEffect on mount ─────────────────────────────────────────────────────
  it("applies data-theme on mount via useEffect", () => {
    localStorage.setItem("theme", "dark");
    renderHook(() => useTheme(), { wrapper });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  // ── THEMES export ─────────────────────────────────────────────────────────
  it("THEMES array includes light, dark, and glacier", () => {
    const ids = THEMES.map(t => t.id);
    expect(ids).toContain("light");
    expect(ids).toContain("dark");
    expect(ids).toContain("glacier");
  });

  it("each theme has id, label, icon, and desc", () => {
    THEMES.forEach(t => {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(t.desc).toBeTruthy();
    });
  });
});
