import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockNavigate, mockGetHistory } = vi.hoisted(() => ({
  mockNavigate:   vi.fn(),
  mockGetHistory: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

let mockIsMobile = false;
vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("../../services/api", () => ({
  historyApi: { getHistory: (...args: any[]) => mockGetHistory(...args) },
}));

vi.mock("../../components/AppShell", () => ({
  AppShell: ({ active, children }: { active: string; children: React.ReactNode }) => (
    <div data-testid="app-shell" data-active={active}>{children}</div>
  ),
}));

import { MatchHistoryPage, _resetCacheForTests } from "../MatchHistoryPage";

const HISTORY = [
  { id: "d1", roomCode: "ABC123", topic: "Social media does more harm than good", mode: "alternate", endedAt: "2026-10-20T10:00:00.000Z",
    totalDebaters: 2, totalJudges: 1, rank: 1, totalParticipants: 2, points: 80, isWinner: true,  side: "for" },
  { id: "d2", roomCode: "XYZ789", topic: "Remote work should be the default", mode: "buzzer", endedAt: "2026-10-18T10:00:00.000Z",
    totalDebaters: 4, totalJudges: 0, rank: 3, totalParticipants: 4, points: 60, isWinner: false, side: "against" },
  { id: "d3", roomCode: "QQQ111", topic: "Zoos do more good than harm", mode: "alternate", endedAt: "2026-10-10T10:00:00.000Z",
    totalDebaters: 2, totalJudges: 0, rank: null, totalParticipants: 2, points: null, isWinner: null, side: null },
];

describe("MatchHistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTests();
    mockIsMobile = false;
    mockGetHistory.mockResolvedValue(HISTORY);
  });

  it("renders inside AppShell with the history nav item active", () => {
    render(<MatchHistoryPage />);
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-active", "history");
    expect(screen.getByRole("heading", { name: "Match history" })).toBeInTheDocument();
  });

  it("shows a loading state, then the list", async () => {
    render(<MatchHistoryPage />);
    expect(screen.getByText("Loading history…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Social media does more harm than good")).toBeInTheDocument());
    expect(mockGetHistory).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state with create / join actions", async () => {
    mockGetHistory.mockResolvedValue([]);
    render(<MatchHistoryPage />);
    await screen.findByText("No debates yet");
    fireEvent.click(screen.getByRole("button", { name: "Create room" }));
    expect(mockNavigate).toHaveBeenCalledWith("/create-room");
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));
    expect(mockNavigate).toHaveBeenCalledWith("/join-room");
  });

  it("derives the summary from the list", async () => {
    render(<MatchHistoryPage />);
    const summary = await screen.findByRole("region", { name: "Summary" });
    expect(within(summary).getByText("3")).toBeInTheDocument();     // debates
    expect(within(summary).getByText("70")).toBeInTheDocument();    // avg of 80 & 60
    expect(within(summary).getByText("1st")).toBeInTheDocument();   // best finish
    expect(within(summary).getByText("Record").nextSibling).toHaveTextContent("1–1");
  });

  it("opens the analysis route for a row", async () => {
    render(<MatchHistoryPage />);
    fireEvent.click(await screen.findByText("Remote work should be the default"));
    expect(mockNavigate).toHaveBeenCalledWith("/room/XYZ789/analysis/d2");
  });

  it("links to judge credibility", async () => {
    render(<MatchHistoryPage />);
    fireEvent.click(screen.getByRole("button", { name: /Debates I judged/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/judge-credibility");
  });

  it("filters by result", async () => {
    render(<MatchHistoryPage />);
    await screen.findByText("Zoos do more good than harm");
    fireEvent.click(screen.getByRole("radio", { name: "Won" }));
    expect(screen.getByText("Social media does more harm than good")).toBeInTheDocument();
    expect(screen.queryByText("Remote work should be the default")).not.toBeInTheDocument();
    expect(screen.queryByText("Zoos do more good than harm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Lost" }));
    expect(screen.getByText("Remote work should be the default")).toBeInTheDocument();
    expect(screen.queryByText("Social media does more harm than good")).not.toBeInTheDocument();
  });

  it("filters by mode and shows a no-match message", async () => {
    render(<MatchHistoryPage />);
    await screen.findByText("Zoos do more good than harm");
    fireEvent.change(screen.getByLabelText("Mode"), { target: { value: "buzzer" } });
    expect(screen.getByText("Remote work should be the default")).toBeInTheDocument();
    expect(screen.queryByText("Zoos do more good than harm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Won" }));
    expect(screen.getByText("No debates match these filters.")).toBeInTheDocument();
  });

  it("shows side, result, score and rank per row", async () => {
    render(<MatchHistoryPage />);
    const row = (await screen.findByText("Remote work should be the default")).closest("button")!;
    expect(within(row).getByText("AGAINST")).toBeInTheDocument();
    expect(within(row).getByText("Lost")).toBeInTheDocument();
    expect(within(row).getByText("60")).toBeInTheDocument();
    expect(within(row).getByText("3rd/4")).toBeInTheDocument();
  });

  it("renders card rows on mobile without the column header", async () => {
    mockIsMobile = true;
    render(<MatchHistoryPage />);
    await screen.findByText("Social media does more harm than good");
    expect(screen.queryByText("MOTION")).not.toBeInTheDocument();
    expect(screen.getAllByText(/^Alternate · /).length).toBe(2);
  });

  it("reuses the module cache on remount", async () => {
    const { unmount } = render(<MatchHistoryPage />);
    await screen.findByText("Social media does more harm than good");
    unmount();
    render(<MatchHistoryPage />);
    expect(screen.queryByText("Loading history…")).not.toBeInTheDocument();
    expect(mockGetHistory).toHaveBeenCalledTimes(1);
  });
});
