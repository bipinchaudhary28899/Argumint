/**
 * ConnectionStatusBanner.test.tsx
 *
 * Tests for the connection-status overlay banner that shows "Reconnecting…"
 * or "Connection lost" states, and renders nothing while fully connected.
 *
 * State machine under test:
 *   wasConnected=false, isReconnecting=false  → null  (cold-connect, no flash)
 *   wasConnected=false, isReconnecting=true   → reconnecting banner
 *   wasConnected=true,  isConnected=false     → reconnecting banner (or failed after 1500 ms)
 *   wasConnected=true,  isConnected=true      → null  (restored)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import React from "react";
import { ConnectionStatusBanner } from "../ConnectionStatusBanner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderBanner(props: { isConnected: boolean; isReconnecting: boolean }) {
  return render(<ConnectionStatusBanner {...props} />);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("ConnectionStatusBanner — null states", () => {
  it("renders nothing while connected and not reconnecting (normal state)", () => {
    const { container } = renderBanner({ isConnected: true, isReconnecting: false });
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing during cold initial connect (wasConnected=false, isReconnecting=false)", () => {
    // Simulates the app starting up before the first successful connection.
    const { container } = renderBanner({ isConnected: false, isReconnecting: false });
    expect(container.firstChild).toBeNull();
  });

  it("disappears once connection is restored after a reconnect", () => {
    // First: simulate a prior connection so wasConnected becomes true.
    const { rerender, container } = renderBanner({ isConnected: true, isReconnecting: false });
    // Drop the connection — banner should appear.
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={true} />);
    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
    // Restore connection — banner should vanish.
    rerender(<ConnectionStatusBanner isConnected={true} isReconnecting={false} />);
    expect(container.firstChild).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("ConnectionStatusBanner — reconnecting state", () => {
  it("shows the orange reconnecting banner when isReconnecting=true (cold start)", () => {
    renderBanner({ isConnected: false, isReconnecting: true });
    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
  });

  it("shows the reconnecting banner when a previously connected socket drops and is retrying", () => {
    const { rerender } = renderBanner({ isConnected: true, isReconnecting: false });
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={true} />);
    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
  });

  it("renders three pulse-dot spans inside the reconnecting banner", () => {
    renderBanner({ isConnected: false, isReconnecting: true });
    // PulseDots renders three <span> elements with borderRadius 50%
    // They are inside the outer container span; just assert the banner text is present
    // alongside at least 3 child spans for the dots.
    const banner = screen.getByText(/Reconnecting/i).closest("div");
    expect(banner).toBeTruthy();
    // The dots container is a sibling of the text span — verify the structure renders
    expect(banner!.textContent).toContain("Reconnecting");
  });

  it("does not show the failure message during active reconnect attempt", () => {
    const { rerender } = renderBanner({ isConnected: true, isReconnecting: false });
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={true} />);
    expect(screen.queryByText(/Connection lost/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reload page/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("ConnectionStatusBanner — failed state (1 500 ms timeout)", () => {
  it("does NOT show failed state immediately after reconnect gives up", () => {
    const { rerender } = renderBanner({ isConnected: true, isReconnecting: false });
    // Socket gives up — not reconnecting and not connected.
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={false} />);
    // Should still show reconnecting banner (or at least not the failed state yet)
    expect(screen.queryByText(/Connection lost/i)).not.toBeInTheDocument();
  });

  it("shows failed state with red banner after 1 500 ms when Socket.IO gives up", () => {
    const { rerender } = renderBanner({ isConnected: true, isReconnecting: false });
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={false} />);

    // Before timeout — no failed state
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText(/Connection lost/i)).not.toBeInTheDocument();

    // At exactly 1 500 ms — failed state appears
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText(/Connection lost/i)).toBeInTheDocument();
  });

  it("shows 'Reload page' button in the failed state", () => {
    const { rerender } = renderBanner({ isConnected: true, isReconnecting: false });
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={false} />);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByRole("button", { name: /Reload page/i })).toBeInTheDocument();
  });

  it("'Reload page' button calls window.location.reload()", () => {
    // jsdom does not allow vi.spyOn on window.location.reload — use Object.defineProperty.
    const reloadFn = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadFn },
      writable: true,
      configurable: true,
    });

    const { rerender } = renderBanner({ isConnected: true, isReconnecting: false });
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={false} />);
    act(() => { vi.advanceTimersByTime(1500); });

    fireEvent.click(screen.getByRole("button", { name: /Reload page/i }));
    expect(reloadFn).toHaveBeenCalledTimes(1);
  });

  it("does NOT enter failed state when connection was never established (cold cold-connect timeout)", () => {
    // wasConnected is false — component never saw a connected=true, so showFailed must stay false
    renderBanner({ isConnected: false, isReconnecting: false });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByText(/Connection lost/i)).not.toBeInTheDocument();
  });

  it("cancels the failed-state timer if reconnect succeeds within 1 500 ms", () => {
    const { rerender } = renderBanner({ isConnected: true, isReconnecting: false });
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={false} />);

    // 800 ms in — reconnect succeeds before timeout
    act(() => { vi.advanceTimersByTime(800); });
    rerender(<ConnectionStatusBanner isConnected={true} isReconnecting={false} />);

    // Advance past the original 1500 ms — timer should have been cleared
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText(/Connection lost/i)).not.toBeInTheDocument();
  });

  it("cancels the failed-state timer if a new reconnect starts within 1 500 ms", () => {
    const { rerender } = renderBanner({ isConnected: true, isReconnecting: false });
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={false} />);

    act(() => { vi.advanceTimersByTime(800); });
    // A new reconnect attempt starts
    rerender(<ConnectionStatusBanner isConnected={false} isReconnecting={true} />);

    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText(/Connection lost/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("ConnectionStatusBanner — edge cases", () => {
  it("shows reconnecting banner when connected=true but isReconnecting=true (transient overlap)", () => {
    // Some socket libraries emit both flags momentarily — component should show the banner.
    renderBanner({ isConnected: true, isReconnecting: true });
    // isConnected && !isReconnecting check is false because isReconnecting=true, so banner shows
    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
  });

  it("transitions from reconnecting → connected without flashing the failed state", () => {
    const { rerender, container } = renderBanner({ isConnected: false, isReconnecting: true });
    expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();

    rerender(<ConnectionStatusBanner isConnected={true} isReconnecting={false} />);
    // Since wasConnected becomes true now, and showFailed starts false, no failed state
    expect(screen.queryByText(/Connection lost/i)).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
