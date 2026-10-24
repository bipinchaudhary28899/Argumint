import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

const { mockNavigate, mockGetHistory } = vi.hoisted(() => ({
  mockNavigate:   vi.fn(),
  mockGetHistory: vi.fn(),
}));

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

vi.mock("../../services/api", () => ({
  judgeApi: { getHistory: (...args: any[]) => mockGetHistory(...args) },
}));

vi.mock("../../components/AppShell", () => ({
  AppShell: ({ active, children }: { active: string; children: React.ReactNode }) => (
    <div data-testid="app-shell" data-active={active}>{children}</div>
  ),
}));

import { JudgeCredibilityPage, _resetCacheForTests } from "../JudgeCredibilityPage";

const withStats = (judgeStats: any) => ({ id: "u1", username: "alice", judgeStats });

const pillar = (p1: number, p4: number | null = 0.7, p5: number | null = 0.9) => ({
  p1_rankAgreement: p1, p2_gapPreservation: 0.66, p3_consensusSimilarity: 0.55,
  p4_outlierCoherence: p4, p5_biasDetection: p5, p6_integrityScore: 1,
});

// Newest first, as GET /auth/judge-history returns it
const SESSIONS = [
  { id: "s3", debateId: "d3", topic: "Zoos do more good than harm",          debateCreatedAt: null, sessionScore: 0.91, credibilityAfter: 0.78, pillar: pillar(0.88, null, null), createdAt: "2026-10-21T10:00:00.000Z" },
  { id: "s2", debateId: "d2", topic: null,                                   debateCreatedAt: null, sessionScore: 0.64, credibilityAfter: 0.71, pillar: pillar(0.5),            createdAt: "2026-10-14T10:00:00.000Z" },
  { id: "s1", debateId: "d1", topic: "Voting should be compulsory",          debateCreatedAt: null, sessionScore: 0.6,  credibilityAfter: 0.6,  pillar: pillar(0.4),            createdAt: "2026-10-10T10:00:00.000Z" },
];

const makeSessions = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `s${i}`, debateId: `d${i}`, topic: `Motion ${i + 1}`, debateCreatedAt: null,
  sessionScore: 0.5, credibilityAfter: 0.5, pillar: pillar(0.5), createdAt: "2026-10-01T10:00:00.000Z",
}));

describe("JudgeCredibilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTests();
    mockIsMobile = false;
    mockGetHistory.mockResolvedValue([]);
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

describe("JudgeCredibilityPage — judge history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTests();
    mockIsMobile = false;
    mockUser = withStats({ totalSessions: 11, credibilityScore: 0.82, credibilityBand: "strong", lastJudgedAt: "2026-10-21T10:00:00.000Z" });
    mockGetHistory.mockResolvedValue(SESSIONS);
  });

  it("shows a loading state in the trend and list while history loads", () => {
    mockGetHistory.mockReturnValue(new Promise(() => {}));
    render(<JudgeCredibilityPage />);
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Credibility trend" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("region", { name: "Debates you judged" })).toHaveAttribute("aria-busy", "true");
    // Score card still renders from judgeStats
    expect(screen.getByText("0.82")).toBeInTheDocument();
  });

  it("doesn't fetch history when there are no sessions and keeps the empty state", () => {
    mockUser = withStats({ totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null });
    render(<JudgeCredibilityPage />);
    expect(mockGetHistory).not.toHaveBeenCalled();
    expect(screen.getByText("No judging sessions yet")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Credibility trend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Debates you judged" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Credibility bands" })).toBeInTheDocument();
  });

  it("charts credibilityAfter oldest to newest", async () => {
    render(<JudgeCredibilityPage />);
    const chart = await screen.findByRole("img", { name: /Credibility rose from 0.60 to 0.78 over 3 sessions, now in the Strong band/ });
    expect(chart.tagName.toLowerCase()).toBe("svg");
    const points = screen.getByTestId("trend-line").getAttribute("points")!.split(" ");
    expect(points).toHaveLength(3);
    // y grows downward: oldest (0.60) sits lower than newest (0.78)
    const ys = points.map(p => Number(p.split(",")[1]));
    expect(ys[0]).toBeGreaterThan(ys[2]);
    expect(screen.getByText("Last 3 sessions")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Credibility trend" })).not.toHaveAttribute("aria-busy");
  });

  it("describes a falling or single-session trend", async () => {
    mockGetHistory.mockResolvedValue([{ ...SESSIONS[2], id: "a", credibilityAfter: 0.3 }, { ...SESSIONS[2], id: "b", credibilityAfter: 0.5 }]);
    const { unmount } = render(<JudgeCredibilityPage />);
    expect(await screen.findByRole("img", { name: /fell from 0.50 to 0.30 over 2 sessions, now in the Flagged band/ })).toBeInTheDocument();
    unmount();

    _resetCacheForTests();
    mockGetHistory.mockResolvedValue([SESSIONS[0]]);
    render(<JudgeCredibilityPage />);
    expect(await screen.findByRole("img", { name: "Credibility 0.78 after 1 session, in the Strong band" })).toBeInTheDocument();
    expect(screen.getByText("First session")).toBeInTheDocument();
    expect(screen.queryByTestId("trend-line")).not.toBeInTheDocument();
  });

  it("shows the latest session's pillar scores next to the weights", async () => {
    render(<JudgeCredibilityPage />);
    expect(await screen.findByText("The six pillars · latest session")).toBeInTheDocument();
    const pillars = screen.getByRole("region", { name: "Scoring pillars" });
    expect(within(pillars).getByLabelText("Rank agreement score 0.88")).toBeInTheDocument();
    expect(within(pillars).getByLabelText("Integrity score 1.00")).toBeInTheDocument();
    // Pillars not active yet in that session show a dash
    expect(within(pillars).getByLabelText("Outlier coherence not active yet")).toHaveTextContent("—");
    expect(within(pillars).getByLabelText("Bias detection not active yet")).toBeInTheDocument();
    expect(within(pillars).getByText("30%")).toBeInTheDocument();
  });

  it("lists the debates you judged with session score and credibility after", async () => {
    render(<JudgeCredibilityPage />);
    const list = await screen.findByRole("region", { name: "Debates you judged" });
    const rows = await within(list).findAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Zoos do more good than harm");
    expect(within(rows[0]).getByLabelText("Session score 0.91")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("Credibility after 0.78")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("Oct");
    expect(rows[1]).toHaveTextContent("Untitled debate");
    expect(within(list).getByText("SESSION")).toBeInTheDocument();
    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
    // Bands explainer is still on the page, beside the list
    expect(screen.getByText("Strong · you")).toBeInTheDocument();
  });

  it("shows five judged debates and expands to all", async () => {
    mockGetHistory.mockResolvedValue(makeSessions(7));
    render(<JudgeCredibilityPage />);
    const list = await screen.findByRole("region", { name: "Debates you judged" });
    expect(await within(list).findAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(within(list).getByRole("button", { name: "Show all 7" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    fireEvent.click(within(list).getByRole("button", { name: "Show fewer" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
  });

  it("falls back to the static layout when history fails to load", async () => {
    mockGetHistory.mockResolvedValue([]);  // judgeApi.getHistory resolves [] on error
    render(<JudgeCredibilityPage />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Credibility trend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Debates you judged" })).not.toBeInTheDocument();
    expect(screen.getByText("The six pillars")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Credibility bands" })).toBeInTheDocument();
    expect(screen.getByText("0.82")).toBeInTheDocument();
  });

  it("caches history across remounts and refetches when the session count changes", async () => {
    const { unmount } = render(<JudgeCredibilityPage />);
    await screen.findByRole("img", { name: /Credibility rose/ });
    unmount();

    render(<JudgeCredibilityPage />);
    expect(screen.getByRole("img", { name: /Credibility rose/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mockGetHistory).toHaveBeenCalledTimes(1);

    mockUser = withStats({ totalSessions: 12, credibilityScore: 0.83, credibilityBand: "strong", lastJudgedAt: null });
    render(<JudgeCredibilityPage />);
    await waitFor(() => expect(mockGetHistory).toHaveBeenCalledTimes(2));
  });

  it("renders history on mobile without the list header", async () => {
    mockIsMobile = true;
    render(<JudgeCredibilityPage />);
    const list = await screen.findByRole("region", { name: "Debates you judged" });
    const rows = await within(list).findAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(list).queryByText("SESSION")).not.toBeInTheDocument();
    // Each row captions its own scores instead
    expect(within(rows[0]).getByText("Session")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("Session score 0.91")).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText("Credibility after 0.78")).toBeInTheDocument();
  });
});
