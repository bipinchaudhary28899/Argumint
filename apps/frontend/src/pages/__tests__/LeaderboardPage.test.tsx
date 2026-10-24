import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockGetLeaderboard } = vi.hoisted(() => ({ mockGetLeaderboard: vi.fn() }));

let mockUser: any = { id: "u5", username: "eve", xp: 120, stats: { debatesWon: 1, debatesLost: 2, totalDebates: 3 } };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

let mockIsMobile = false;
vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("@argumint/shared", () => ({
  getLevelInfo: (xp: number) => ({ current: xp >= 1000 ? { level: 4, title: "Advocate" } : { level: 1, title: "Novice" } }),
}));

vi.mock("../../services/api", () => ({
  platformApi: { getLeaderboard: (...args: any[]) => mockGetLeaderboard(...args) },
}));

vi.mock("../../components/AppShell", () => ({
  AppShell: ({ active, children }: { active: string; children: React.ReactNode }) => (
    <div data-testid="app-shell" data-active={active}>{children}</div>
  ),
  initials: (n: string) => n.slice(0, 2).toUpperCase(),
}));

import { LeaderboardPage, _resetCacheForTests } from "../LeaderboardPage";

const BOARD = [
  { id: "u1", username: "priya", xp: 5410, debatesWon: 30, totalDebates: 40 },
  { id: "u2", username: "leo",   xp: 4120, debatesWon: 20, totalDebates: 40 },
  { id: "u3", username: "sana",  xp: 3050, debatesWon: 10, totalDebates: 20 },
  { id: "u4", username: "maya",  xp: 2240, debatesWon: 31, totalDebates: 45 },
  { id: "u5", username: "eve",   xp: 980,  debatesWon: 0,  totalDebates: 0  },
];

describe("LeaderboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTests();
    mockIsMobile = false;
    mockUser = { id: "u5", username: "eve", xp: 980, stats: { debatesWon: 0, debatesLost: 0, totalDebates: 0 } };
    mockGetLeaderboard.mockResolvedValue(BOARD);
  });

  it("renders inside AppShell with the leaderboard nav item active", () => {
    render(<LeaderboardPage />);
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-active", "leaderboard");
    expect(screen.getByRole("heading", { name: "Leaderboard" })).toBeInTheDocument();
  });

  it("shows a loading state, then the board", async () => {
    render(<LeaderboardPage />);
    expect(screen.getByText("Loading leaderboard…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("priya")).toBeInTheDocument());
    expect(mockGetLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when the board is empty", async () => {
    mockGetLeaderboard.mockResolvedValue([]);
    render(<LeaderboardPage />);
    await waitFor(() => expect(screen.getByText("No ranked debaters yet")).toBeInTheDocument());
  });

  it("puts the top three on the podium with level and XP", async () => {
    render(<LeaderboardPage />);
    const podium = await screen.findByRole("region", { name: "Top three" });
    expect(within(podium).getByText("priya")).toBeInTheDocument();
    expect(within(podium).getByText("leo")).toBeInTheDocument();
    expect(within(podium).getByText("sana")).toBeInTheDocument();
    expect(within(podium).getByText("5,410 XP")).toBeInTheDocument();
    expect(within(podium).getAllByText("Lv 4 · Advocate").length).toBe(3);
  });

  it("lists rank 4+ with W–L and win % derived from the entry", async () => {
    render(<LeaderboardPage />);
    await screen.findByText("maya");
    expect(screen.getByText("31–14")).toBeInTheDocument();
    expect(screen.getByText("69%")).toBeInTheDocument();
    expect(screen.getByText("2,240")).toBeInTheDocument();
  });

  it("highlights the current user's row", async () => {
    render(<LeaderboardPage />);
    const me = await screen.findByText("eve (you)");
    expect(me.closest("li")).toHaveAttribute("aria-current", "true");
    // Zero debates → no win % to show
    expect(within(me.closest("li")!).getByText("—")).toBeInTheDocument();
  });

  it("appends the current user's own row when they're not on the board", async () => {
    mockUser = { id: "zz", username: "newbie", xp: 40, stats: { debatesWon: 1, debatesLost: 1, totalDebates: 2 } };
    render(<LeaderboardPage />);
    const me = await screen.findByText("newbie (you)");
    const row = me.closest("li")!;
    expect(row).toHaveAttribute("aria-current", "true");
    expect(within(row).getByText("1–1")).toBeInTheDocument();
    expect(screen.getByText(/not in the top 5 yet/)).toBeInTheDocument();
  });

  it("hides the level / W–L / win % columns on mobile", async () => {
    mockIsMobile = true;
    render(<LeaderboardPage />);
    await screen.findByText("maya");
    expect(screen.queryByText("W–L")).not.toBeInTheDocument();
    expect(screen.queryByText("31–14")).not.toBeInTheDocument();
  });

  it("reuses the module cache on remount", async () => {
    const { unmount } = render(<LeaderboardPage />);
    await screen.findByText("priya");
    unmount();
    render(<LeaderboardPage />);
    expect(screen.queryByText("Loading leaderboard…")).not.toBeInTheDocument();
    expect(screen.getByText("priya")).toBeInTheDocument();
    expect(mockGetLeaderboard).toHaveBeenCalledTimes(1);
  });
});
