import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

let mockUser: any = null;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

let mockIsMobile = false;
vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("../../components/AppShell", () => ({
  AppShell: ({ active, children }: { active: string; children: React.ReactNode }) => (
    <div data-testid="app-shell" data-active={active}>{children}</div>
  ),
}));

import { JudgeCredibilityPage } from "../JudgeCredibilityPage";

const withStats = (judgeStats: any) => ({ id: "u1", username: "alice", judgeStats });

describe("JudgeCredibilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile = false;
    mockUser = withStats({ totalSessions: 11, credibilityScore: 0.82, credibilityBand: "strong", lastJudgedAt: "2026-10-20T10:00:00.000Z" });
  });

  it("renders inside AppShell with the judging nav item active", () => {
    render(<JudgeCredibilityPage />);
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-active", "judging");
    expect(screen.getByRole("heading", { name: "Judge credibility" })).toBeInTheDocument();
  });

  it("shows score, band, sessions and last judged date", () => {
    render(<JudgeCredibilityPage />);
    expect(screen.getByText("0.82")).toBeInTheDocument();
    expect(screen.getByText(/11 debates judged/)).toBeInTheDocument();
    expect(screen.getByText(/last judged/)).toHaveTextContent("2026");
    const meter = screen.getByRole("meter", { name: "Credibility score" });
    expect(meter).toHaveAttribute("aria-valuenow", "0.82");
    expect(meter).toHaveAttribute("aria-valuetext", "0.82, Strong");
  });

  it("highlights the user's band in the explainer", () => {
    mockUser = withStats({ totalSessions: 4, credibilityScore: 0.3, credibilityBand: "flagged", lastJudgedAt: null });
    render(<JudgeCredibilityPage />);
    expect(screen.getByText("Flagged · you").closest("li")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "0.30, Flagged");
    expect(screen.getByText(/4 debates judged/)).not.toHaveTextContent("last judged");
  });

  it("uses singular copy for one session", () => {
    mockUser = withStats({ totalSessions: 1, credibilityScore: 0.5, credibilityBand: "moderate", lastJudgedAt: null });
    render(<JudgeCredibilityPage />);
    expect(screen.getByText(/1 debate judged/)).toBeInTheDocument();
    expect(screen.getByText("Moderate · you")).toBeInTheDocument();
  });

  it("shows an empty state with no sessions and links to join a room", () => {
    mockUser = withStats({ totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null });
    render(<JudgeCredibilityPage />);
    expect(screen.getByText("No judging sessions yet")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByText(/· you$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join a room" }));
    expect(mockNavigate).toHaveBeenCalledWith("/join-room");
  });

  it("falls back to the empty state when judgeStats is missing", () => {
    mockUser = { id: "u1", username: "alice" };
    render(<JudgeCredibilityPage />);
    expect(screen.getByText("No judging sessions yet")).toBeInTheDocument();
  });

  it("always explains the bands and pillars", () => {
    render(<JudgeCredibilityPage />);
    expect(screen.getByText("0.75 – 1.00")).toBeInTheDocument();
    expect(screen.getByText("0.45 – 0.74")).toBeInTheDocument();
    expect(screen.getByText("0.00 – 0.44")).toBeInTheDocument();
    expect(screen.getByText("P1 · Rank agreement")).toBeInTheDocument();
    expect(screen.getByText("P6 · Integrity")).toBeInTheDocument();
  });

  it("renders on mobile", () => {
    mockIsMobile = true;
    render(<JudgeCredibilityPage />);
    expect(screen.getByText("0.82")).toBeInTheDocument();
  });
});
