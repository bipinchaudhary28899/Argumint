import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import React from "react";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockNavigate, mockCheckAuth } = vi.hoisted(() => ({
  mockNavigate:  vi.fn(),
  mockCheckAuth: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
let mockUser: any = null;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, checkAuth: mockCheckAuth }),
}));

import { SubscriptionSuccess } from "../SubscriptionSuccess";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockUser = null;
  mockCheckAuth.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("SubscriptionSuccess", () => {
  it("renders without crashing", () => {
    render(<SubscriptionSuccess />);
  });

  it("shows the You're Pro heading (visible after 400 ms)", async () => {
    render(<SubscriptionSuccess />);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're Pro");
  });

  it("shows the renewal date when the user has one", () => {
    mockUser = { currentPeriodEnd: "2024-12-31T00:00:00.000Z" };
    render(<SubscriptionSuccess />);
    expect(screen.getByText(/renews on 31 December 2024/)).toBeInTheDocument();
  });

  it("falls back to a generic confirmation without a renewal date", () => {
    render(<SubscriptionSuccess />);
    expect(screen.getByText(/All Pro features are now active/)).toBeInTheDocument();
  });

  it("renders all 5 Pro perk labels", async () => {
    render(<SubscriptionSuccess />);
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(screen.getByText("Human Judges")).toBeInTheDocument();
    expect(screen.getByText("Whisper AI")).toBeInTheDocument();
    expect(screen.getByText("Buzzer Mode")).toBeInTheDocument();
    expect(screen.getByText("Topic Voting")).toBeInTheDocument();
    expect(screen.getByText("Pro Badge")).toBeInTheDocument();
  });

  it("shows the redirect message after 2200 ms", async () => {
    render(<SubscriptionSuccess />);
    await act(async () => { vi.advanceTimersByTime(2300); });
    expect(screen.getByText(/Taking you to your dashboard/)).toBeInTheDocument();
  });

  it("calls checkAuth then navigates to / after 3000 ms", async () => {
    render(<SubscriptionSuccess />);
    await act(async () => { vi.advanceTimersByTime(3100); });
    expect(mockCheckAuth).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("does not navigate before 3000 ms", async () => {
    render(<SubscriptionSuccess />);
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("clears timers on unmount — no navigation after unmount", async () => {
    const { unmount } = render(<SubscriptionSuccess />);
    await act(async () => { vi.advanceTimersByTime(1000); });
    unmount();
    // Advance past the 3000 ms mark after unmount — should NOT fire
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not call checkAuth or navigate twice (navFired guard)", async () => {
    render(<SubscriptionSuccess />);
    await act(async () => { vi.advanceTimersByTime(3100); });
    // Advance more time — guard should prevent a second call
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(mockCheckAuth).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it("'Create a room' refreshes the user then goes to /create-room — once", async () => {
    render(<SubscriptionSuccess />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Create a room" })); });
    expect(mockCheckAuth).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/create-room", { replace: true });
    // The auto-redirect must not fire afterwards
    await act(async () => { vi.advanceTimersByTime(3100); });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it("'Back to home' refreshes the user then goes to /", async () => {
    render(<SubscriptionSuccess />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Back to home" })); });
    expect(mockCheckAuth).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });
});
