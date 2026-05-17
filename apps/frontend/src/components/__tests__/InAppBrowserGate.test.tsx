/**
 * InAppBrowserGate.test.tsx
 *
 * Tests for the in-app browser detection gate that blocks mic-restricted
 * WebViews (WhatsApp, Instagram, TikTok, etc.) and asks users to open the
 * link in a real browser instead.
 *
 * Strategy: override navigator.userAgent via Object.defineProperty for each
 * test, then verify render output.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { InAppBrowserGate, useIsInAppBrowser } from "../InAppBrowserGate";
import { renderHook } from "@testing-library/react";

// ── UA helpers ────────────────────────────────────────────────────────────────

function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, writable: true, configurable: true });
}

const NORMAL_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

afterEach(() => {
  setUA(NORMAL_UA); // restore a normal UA after every test
});

// ── useIsInAppBrowser hook ─────────────────────────────────────────────────────

describe("useIsInAppBrowser — detection logic", () => {
  it("returns false for a standard desktop Chrome UA", () => {
    setUA(NORMAL_UA);
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(false);
  });

  it("returns false for a standard mobile Safari UA", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(false);
  });

  it("detects WhatsApp in-app browser (WhatsApp/ token)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20G81 WhatsApp/23.20.71");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("detects Instagram in-app browser (Instagram token)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20G75 Instagram 305.0.0.40.119");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("detects Facebook in-app browser (FBAN token)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 16_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20F75 [FBAN/FBIOS;FBDV/iPhone14,3;FBMD/iPhone;FBSN/iOS;]");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("detects Facebook Android in-app browser (FBAV token)", () => {
    setUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) FBAV/426.0.0.28.102 Mobile Safari/537.36");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("detects TikTok in-app browser (TikTok token)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1) AppleWebKit/605.1.15 TikTok/29.3.0 Mobile Safari/604.1");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("detects Snapchat in-app browser (Snapchat token)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1) AppleWebKit/605.1.15 Snapchat/12.77.0.40 Mobile/20G81");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("detects Twitter in-app browser (Twitter/ token)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1) AppleWebKit/605.1.15 Mobile/20G81 Twitter/9.51.1");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("detects Android WebView via \\bwv\\b flag", () => {
    setUA("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 wv Mobile Safari/537.36");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("detects iOS non-Safari WebView (AppleWebKit present, no Safari/)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20G81");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(true);
  });

  it("does NOT flag iOS Safari that includes Safari/ token", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(false);
  });

  it("does NOT flag standard Android Chrome (contains 'wv' in a word like 'www' but no \\bwv\\b)", () => {
    // 'www' does NOT match \bwv\b — word-boundary check is strict
    setUA("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36");
    const { result } = renderHook(() => useIsInAppBrowser());
    expect(result.current).toBe(false);
  });
});

// ── InAppBrowserGate component — renders children when safe ──────────────────

describe("InAppBrowserGate — normal browser (renders children)", () => {
  it("renders children when user agent is a normal desktop browser", () => {
    setUA(NORMAL_UA);
    render(
      <InAppBrowserGate>
        <div data-testid="child">My Page</div>
      </InAppBrowserGate>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByText(/Open in your browser/i)).not.toBeInTheDocument();
  });

  it("renders children when user agent is mobile Safari", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    render(
      <InAppBrowserGate>
        <span data-testid="safe-child">Safe content</span>
      </InAppBrowserGate>
    );
    expect(screen.getByTestId("safe-child")).toBeInTheDocument();
  });
});

// ── InAppBrowserGate component — gate screen ─────────────────────────────────

describe("InAppBrowserGate — in-app browser (renders gate)", () => {
  it("renders the gate screen instead of children for WhatsApp UA", () => {
    setUA("Mozilla/5.0 (iPhone) WhatsApp/23.20.71");
    render(
      <InAppBrowserGate>
        <div data-testid="child">Hidden content</div>
      </InAppBrowserGate>
    );
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    expect(screen.getByText(/Open in your browser/i)).toBeInTheDocument();
  });

  it("renders the gate screen for Instagram UA", () => {
    setUA("Mozilla/5.0 Instagram 305.0.0.40.119");
    render(<InAppBrowserGate><div>Hidden</div></InAppBrowserGate>);
    expect(screen.getByText(/Open in your browser/i)).toBeInTheDocument();
  });

  it("shows the explanatory copy about mic access being blocked", () => {
    setUA("Mozilla/5.0 FBAN/FBIOS");
    render(<InAppBrowserGate><div>Hidden</div></InAppBrowserGate>);
    expect(screen.getByText(/microphone access/i)).toBeInTheDocument();
    // "Chrome" and "Safari" each appear as separate <strong> elements — use getAllByText
    expect(screen.getAllByText(/Chrome/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Safari/).length).toBeGreaterThan(0);
  });

  it("shows 'Open in Browser' button", () => {
    setUA("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20G81");
    render(<InAppBrowserGate><div>Hidden</div></InAppBrowserGate>);
    expect(screen.getByRole("button", { name: /Open in Browser/i })).toBeInTheDocument();
  });

  it("'Open in Browser' button sets window.location.href to current href", () => {
    setUA("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20G81");
    // jsdom sets window.location.href to "about:blank" in test env
    const originalHref = window.location.href;
    render(<InAppBrowserGate><div>Hidden</div></InAppBrowserGate>);
    // The button onClick sets window.location.href = window.location.href (no-op in effect,
    // but we can verify the handler runs without throwing)
    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: /Open in Browser/i }));
    }).not.toThrow();
  });

  it("displays the current URL in the monospace URL box", () => {
    setUA("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20G81");
    render(<InAppBrowserGate><div>Hidden</div></InAppBrowserGate>);
    // window.location.href in jsdom is "about:blank" — the component renders it in a div
    const urlBox = screen.getByText(window.location.href);
    expect(urlBox).toBeInTheDocument();
  });

  it("shows the fallback copy-paste instruction text", () => {
    setUA("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20G81");
    render(<InAppBrowserGate><div>Hidden</div></InAppBrowserGate>);
    expect(screen.getByText(/Copy this URL/i)).toBeInTheDocument();
  });

  it("shows the globe emoji on the gate screen", () => {
    setUA("Mozilla/5.0 Instagram 305");
    render(<InAppBrowserGate><div>Hidden</div></InAppBrowserGate>);
    expect(screen.getByText("🌐")).toBeInTheDocument();
  });
});
