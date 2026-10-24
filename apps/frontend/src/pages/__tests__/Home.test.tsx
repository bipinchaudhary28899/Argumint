/**
 * Home.test.tsx
 *
 * Unit + integration tests for the Home board.
 * Covers: greeting + level sub-line, Pro status / upgrade CTA, level card,
 * win-rate edge cases, judge credibility card, create/join tiles (incl. the
 * join-with-code form), platform stats, recent debates, top debaters,
 * mobile layout, Pro welcome modal and the module-level caches.
 *
 * Navigation chrome (sidebar, tab bar, theme picker, logout) lives in
 * AppShell and is covered by components/__tests__/AppShell.test.tsx.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogout  = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseIsMobile = vi.fn(() => false);
vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

// AppShell is tested on its own — render children in a bare wrapper here
vi.mock("../../components/AppShell", async () => {
  const actual = await vi.importActual<typeof import("../../components/AppShell")>("../../components/AppShell");
  return {
    initials: actual.initials,
    AppShell: ({ active, children }: { active: string; children: React.ReactNode }) => (
      <div data-testid="app-shell" data-active={active}>{children}</div>
    ),
  };
});

vi.mock("../../components/ProWelcomeModal", () => ({
  ProWelcomeModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="pro-welcome-modal">
      <button onClick={onClose}>Close modal</button>
    </div>
  ),
}));

const mockGetStats       = vi.fn();
const mockGetLeaderboard = vi.fn();
const mockGetHistory     = vi.fn();
vi.mock("../../services/api", () => ({
  platformApi: {
    getStats:       (...args: any[]) => mockGetStats(...args),
    getLeaderboard: (...args: any[]) => mockGetLeaderboard(...args),
  },
  historyApi: {
    getHistory: (...args: any[]) => mockGetHistory(...args),
  },
}));

vi.mock("@argumint/shared", () => ({
  getLevelInfo: (xp: number) => {
    if (xp >= 7000) return { current: { level: 10, title: "Grand Master" }, next: null, progressXP: 0, neededXP: 0, progressPct: 100, totalXP: xp };
    if (xp >= 1200) return { current: { level: 5, title: "Orator" },   next: { level: 6, title: "Rhetorician" }, progressXP: xp - 1200, neededXP: 600, progressPct: Math.min(100, Math.round(((xp - 1200) / 600) * 100)), totalXP: xp };
    if (xp >= 750)  return { current: { level: 4, title: "Advocate" }, next: { level: 5, title: "Orator"      }, progressXP: xp - 750,  neededXP: 450, progressPct: Math.min(100, Math.round(((xp - 750)  / 450) * 100)), totalXP: xp };
    if (xp >= 400)  return { current: { level: 3, title: "Arguer" },   next: { level: 4, title: "Advocate"    }, progressXP: xp - 400,  neededXP: 350, progressPct: Math.min(100, Math.round(((xp - 400)  / 350) * 100)), totalXP: xp };
    if (xp >= 150)  return { current: { level: 2, title: "Debater" },  next: { level: 3, title: "Arguer"      }, progressXP: xp - 150,  neededXP: 250, progressPct: Math.min(100, Math.round(((xp - 150)  / 250) * 100)), totalXP: xp };
    return           { current: { level: 1, title: "Novice" },          next: { level: 2, title: "Debater"     }, progressXP: xp,         neededXP: 150, progressPct: Math.min(100, Math.round((xp           / 150) * 100)), totalXP: xp };
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "user-1",
    username: "Alice",
    email: "alice@example.com",
    xp: 0,
    isPro: false,
    subscriptionStatus: null,
    stats: { debatesWon: 0, debatesLost: 0, totalDebates: 0 },
    judgeStats: {
      totalSessions:    0,
      credibilityScore: 0,
      credibilityBand:  "moderate",
      lastJudgedAt:     null,
    },
    ...overrides,
  };
}

function asUser(overrides: Record<string, any> = {}) {
  mockUseAuth.mockReturnValue({ user: makeUser(overrides), logout: mockLogout, isLoading: false });
}

function makeDebate(overrides: Record<string, any> = {}) {
  return {
    id: "d1", roomCode: "ABC123", topic: "Cats are better than dogs", mode: "alternate",
    endedAt: new Date().toISOString(), totalDebaters: 2, totalJudges: 1,
    rank: 1, totalParticipants: 2, points: 78, isWinner: true, side: "for",
    ...overrides,
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// Import the real Home component once — cache reset is done via _resetCacheForTests
import { Home, _resetCacheForTests } from "../Home";

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

/** Let the stats / leaderboard / history promises resolve */
async function flush() {
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

const recentCard = () => screen.getByRole("heading", { name: "Recent debates" }).closest(".ds-card") as HTMLElement;
const topCard    = () => screen.getByRole("heading", { name: "Top debaters" }).closest(".ds-card") as HTMLElement;
const judgeCard  = () => screen.getByText("Judge credibility").closest("button") as HTMLElement;

// ── Setup / Teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level stats/leaderboard/history cache before every test
  _resetCacheForTests();
  mockUseIsMobile.mockReturnValue(false);
  mockGetStats.mockResolvedValue({ activeRooms: 3, liveDebates: 1, totalDebates: 42 });
  mockGetLeaderboard.mockResolvedValue([]);
  mockGetHistory.mockResolvedValue([]);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// SHELL + HEADER
// ─────────────────────────────────────────────────────────────────────────────
describe("Shell and header", () => {
  it("renders inside AppShell with the home nav item active", () => {
    asUser();
    renderHome();
    expect(screen.getByTestId("app-shell")).toHaveAttribute("data-active", "home");
  });

  it.each([
    [9,  "Good morning"],
    [14, "Good afternoon"],
    [20, "Good evening"],
  ])("greets by local time (%i:00 → %s) with the username", (hour, text) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24, hour, 0, 0));
    asUser({ username: "TestUser" });
    renderHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${text}, TestUser`);
  });

  it("shows XP needed for the next title (with 'a')", () => {
    asUser({ xp: 0 });
    renderHome();
    expect(screen.getByText("150 XP until you're a Debater.")).toBeInTheDocument();
  });

  it("uses 'an' before a vowel title", () => {
    asUser({ xp: 800 });
    renderHome();
    expect(screen.getByText("400 XP until you're an Orator.")).toBeInTheDocument();
  });

  it("shows a max-level line when there is no next level", () => {
    asUser({ xp: 9000 });
    renderHome();
    expect(screen.getByText(/Top level reached — you're a Grand Master/)).toBeInTheDocument();
  });

  it("navigates to /create-room from the New room button", () => {
    asUser();
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: /new room/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/create-room");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRO STATUS / UPGRADE
// ─────────────────────────────────────────────────────────────────────────────
describe("Pro status", () => {
  it("renders Upgrade for non-Pro users and navigates to /pricing", () => {
    asUser({ isPro: false });
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: /upgrade/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });

  it("shows a PRO badge for Pro users that navigates to /pricing", () => {
    asUser({ isPro: true });
    renderHome();
    expect(screen.queryByRole("button", { name: /upgrade/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PRO" }));
    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });

  it("shows 'PRO (ending)' for a cancelled Pro subscription", () => {
    asUser({ isPro: true, subscriptionStatus: "cancelled" });
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: /PRO \(ending\)/ }));
    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL CARD
// ─────────────────────────────────────────────────────────────────────────────
describe("Level card", () => {
  it("shows level 1 / Novice and initials for a new user", () => {
    asUser({ xp: 0, username: "Alice Brown" });
    renderHome();
    expect(screen.getByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText("Novice")).toBeInTheDocument();
    expect(screen.getAllByText("AB").length).toBeGreaterThan(0);
  });

  it("shows level 5 / Orator for 1200 XP", () => {
    asUser({ xp: 1200 });
    renderHome();
    expect(screen.getByText("Level 5")).toBeInTheDocument();
    expect(screen.getByText("Orator")).toBeInTheDocument();
  });

  it("shows total XP and the next-title threshold", () => {
    asUser({ xp: 850 });
    renderHome();
    expect(screen.getByText("850 XP")).toBeInTheDocument();
    expect(screen.getByText("Orator at 1,200")).toBeInTheDocument();
  });

  it("sets the progress bar to the level progress", () => {
    asUser({ xp: 75 });
    renderHome();
    expect(screen.getByRole("progressbar", { name: /level progress/i })).toHaveAttribute("aria-valuenow", "50");
  });

  it("shows 'Max level' at the top level", () => {
    asUser({ xp: 9000 });
    renderHome();
    expect(screen.getByText("Max level")).toBeInTheDocument();
  });

  it("navigates to /level-rewards from 'All levels'", () => {
    asUser();
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "All levels" }));
    expect(mockNavigate).toHaveBeenCalledWith("/level-rewards");
  });

  it("shows debates / wins / losses from user.stats", () => {
    asUser({ stats: { debatesWon: 14, debatesLost: 9, totalDebates: 23 } });
    renderHome();
    const stat = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    expect(within(stat("Debates")).getByText("23")).toBeInTheDocument();
    expect(within(stat("Wins")).getByText("14")).toBeInTheDocument();
    expect(within(stat("Losses")).getByText("9")).toBeInTheDocument();
    expect(within(stat("Win rate")).getByText("61%")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WIN RATE
// ─────────────────────────────────────────────────────────────────────────────
describe("Win rate display", () => {
  const winRateText = () => within(screen.getByText("Win rate").parentElement as HTMLElement);

  it("shows '—' when user has played 0 debates", () => {
    asUser({ stats: { debatesWon: 0, debatesLost: 0, totalDebates: 0 } });
    renderHome();
    expect(winRateText().getByText("—")).toBeInTheDocument();
  });

  it("shows 100% win rate when user has won all debates", () => {
    asUser({ stats: { debatesWon: 5, debatesLost: 0, totalDebates: 5 } });
    renderHome();
    expect(winRateText().getByText("100%")).toBeInTheDocument();
  });

  it("shows 50% win rate correctly", () => {
    asUser({ stats: { debatesWon: 3, debatesLost: 3, totalDebates: 6 } });
    renderHome();
    expect(winRateText().getByText("50%")).toBeInTheDocument();
  });

  it("shows 0% when user has lost all debates", () => {
    asUser({ stats: { debatesWon: 0, debatesLost: 4, totalDebates: 4 } });
    renderHome();
    expect(winRateText().getByText("0%")).toBeInTheDocument();
  });

  it("rounds fractional win rate (1/3 → 33%)", () => {
    asUser({ stats: { debatesWon: 1, debatesLost: 2, totalDebates: 3 } });
    renderHome();
    expect(winRateText().getByText("33%")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JUDGE CREDIBILITY CARD
// ─────────────────────────────────────────────────────────────────────────────
describe("Judge credibility card", () => {
  const judge = (js: Record<string, any>) => asUser({ judgeStats: { lastJudgedAt: null, ...js } });

  it("shows the empty state when user has 0 judge sessions", () => {
    judge({ totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate" });
    renderHome();
    expect(screen.getByText(/start building your credibility score/i)).toBeInTheDocument();
    expect(within(judgeCard()).getByText("—")).toBeInTheDocument();
    expect(within(judgeCard()).queryByText(/moderate/i)).not.toBeInTheDocument();
  });

  it("falls back to the empty state when judgeStats is missing", () => {
    asUser({ judgeStats: undefined });
    renderHome();
    expect(screen.getByText(/start building your credibility score/i)).toBeInTheDocument();
  });

  it("shows the score as 0.xx and the session count", () => {
    judge({ totalSessions: 11, credibilityScore: 0.82, credibilityBand: "strong" });
    renderHome();
    expect(within(judgeCard()).getByText("0.82")).toBeInTheDocument();
    expect(within(judgeCard()).getByText(/Based on 11 judged debates\./)).toBeInTheDocument();
  });

  it("uses singular copy for one judged debate", () => {
    judge({ totalSessions: 1, credibilityScore: 0.7, credibilityBand: "moderate" });
    renderHome();
    expect(within(judgeCard()).getByText(/Based on 1 judged debate\./)).toBeInTheDocument();
  });

  it.each([
    ["strong",   0.90, "ds-chip-for"],
    ["moderate", 0.60, "ds-chip-neutral"],
    ["flagged",  0.30, "ds-chip-against"],
  ])("shows the %s band chip", (band, score, cls) => {
    judge({ totalSessions: 4, credibilityScore: score, credibilityBand: band });
    renderHome();
    expect(within(judgeCard()).getByText(band)).toHaveClass(cls);
  });

  it("shows 0.00 on a first session with a 0 score", () => {
    judge({ totalSessions: 1, credibilityScore: 0, credibilityBand: "flagged" });
    renderHome();
    expect(within(judgeCard()).getByText("0.00")).toBeInTheDocument();
  });

  it("shows 'last judged' date when lastJudgedAt is set", () => {
    judge({ totalSessions: 2, credibilityScore: 0.65, credibilityBand: "moderate", lastJudgedAt: "2026-04-10T00:00:00.000Z" });
    renderHome();
    expect(screen.getByText(/last judged/i)).toBeInTheDocument();
  });

  it("does not show 'last judged' when lastJudgedAt is null", () => {
    judge({ totalSessions: 1, credibilityScore: 0.70, credibilityBand: "moderate" });
    renderHome();
    expect(screen.queryByText(/last judged/i)).not.toBeInTheDocument();
  });

  it("navigates to /judge-credibility when clicked", () => {
    judge({ totalSessions: 3, credibilityScore: 0.8, credibilityBand: "strong" });
    renderHome();
    fireEvent.click(judgeCard());
    expect(mockNavigate).toHaveBeenCalledWith("/judge-credibility");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / JOIN TILES
// ─────────────────────────────────────────────────────────────────────────────
describe("Create and join tiles", () => {
  it("navigates to /create-room from the Create a room tile", () => {
    asUser();
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: /create a room/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/create-room");
  });

  it("keeps Join disabled until 6 characters are entered", () => {
    asUser();
    renderHome();
    const join = screen.getByRole("button", { name: "Join" });
    expect(join).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "ab12" } });
    expect(join).toBeDisabled();
    fireEvent.click(join);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("uppercases the code and navigates to /join-room with it in state", () => {
    asUser();
    renderHome();
    const input = screen.getByLabelText("Room code");
    fireEvent.change(input, { target: { value: "k7q2xm" } });
    expect(input).toHaveValue("K7Q2XM");
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(mockNavigate).toHaveBeenCalledWith("/join-room", { state: { code: "K7Q2XM" } });
  });

  it("strips non-alphanumeric characters and submits on Enter", () => {
    asUser();
    renderHome();
    const input = screen.getByLabelText("Room code");
    fireEvent.change(input, { target: { value: "ab-12 cd" } });
    expect(input).toHaveValue("AB12CD");
    fireEvent.submit(input.closest("form")!);
    expect(mockNavigate).toHaveBeenCalledWith("/join-room", { state: { code: "AB12CD" } });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM STATS
// ─────────────────────────────────────────────────────────────────────────────
describe("Platform stats", () => {
  const strip = () => within(screen.getByLabelText("Platform activity"));

  it("shows total debate count after loading", async () => {
    mockGetStats.mockResolvedValue({ activeRooms: 2, liveDebates: 0, totalDebates: 123 });
    asUser();
    renderHome();
    await waitFor(() => expect(strip().getByText("123")).toBeInTheDocument());
    expect(strip().getByText("debates hosted")).toBeInTheDocument();
  });

  it("shows live debates when liveDebates > 0", async () => {
    mockGetStats.mockResolvedValue({ activeRooms: 1, liveDebates: 3, totalDebates: 50 });
    asUser();
    renderHome();
    await waitFor(() => expect(strip().getByText("live now")).toBeInTheDocument());
    expect(strip().getByText("3")).toBeInTheDocument();
  });

  it("does not show the live indicator when liveDebates is 0", async () => {
    mockGetStats.mockResolvedValue({ activeRooms: 0, liveDebates: 0, totalDebates: 10 });
    asUser();
    renderHome();
    await waitFor(() => expect(strip().getByText("10")).toBeInTheDocument());
    expect(screen.queryByText(/live now/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rooms open/i)).not.toBeInTheDocument();
  });

  it("shows active rooms count", async () => {
    mockGetStats.mockResolvedValue({ activeRooms: 7, liveDebates: 0, totalDebates: 20 });
    asUser();
    renderHome();
    await waitFor(() => expect(strip().getByText("rooms open")).toBeInTheDocument());
    expect(strip().getByText("7")).toBeInTheDocument();
  });

  it("handles API failure gracefully — no crash", async () => {
    mockGetStats.mockRejectedValue(new Error("Network error"));
    mockGetLeaderboard.mockRejectedValue(new Error("Network error"));
    mockGetHistory.mockRejectedValue(new Error("Network error"));
    asUser();
    expect(() => renderHome()).not.toThrow();
    // Drain microtasks so the .catch() inside the component fires before the test exits
    await flush();
    expect(screen.getByText(/no debates yet/i)).toBeInTheDocument();
  });

  it("serves stats + leaderboard from the module cache on remount", async () => {
    asUser();
    const { unmount } = renderHome();
    await flush();
    expect(mockGetStats).toHaveBeenCalledTimes(1);
    expect(mockGetLeaderboard).toHaveBeenCalledTimes(1);
    unmount();
    renderHome();
    await flush();
    expect(mockGetStats).toHaveBeenCalledTimes(1);
    expect(mockGetLeaderboard).toHaveBeenCalledTimes(1);
    // Cached values render immediately
    expect(within(screen.getByLabelText("Platform activity")).getByText("42")).toBeInTheDocument();
  });

  it("refetches after _resetCacheForTests()", async () => {
    asUser();
    const { unmount } = renderHome();
    await flush();
    unmount();
    _resetCacheForTests();
    renderHome();
    await flush();
    expect(mockGetStats).toHaveBeenCalledTimes(2);
    expect(mockGetHistory).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RECENT DEBATES
// ─────────────────────────────────────────────────────────────────────────────
describe("Recent debates", () => {
  it("shows a loading line until history resolves, then the empty state", async () => {
    let resolve!: (v: any[]) => void;
    mockGetHistory.mockReturnValue(new Promise(r => { resolve = r; }));
    asUser();
    renderHome();
    expect(within(recentCard()).getByText(/loading your debates/i)).toBeInTheDocument();
    await act(async () => { resolve([]); });
    expect(within(recentCard()).getByText(/no debates yet/i)).toBeInTheDocument();
  });

  it("renders the first 4 debates with result, score, side, mode and date", async () => {
    mockGetHistory.mockResolvedValue([
      makeDebate({ id: "d1", topic: "Topic one",   isWinner: true,  points: 78, side: "for",     mode: "alternate", endedAt: daysAgo(0) }),
      makeDebate({ id: "d2", topic: "Topic two",   isWinner: false, points: 64, side: "against", mode: "buzzer",    endedAt: daysAgo(1) }),
      makeDebate({ id: "d3", topic: "Topic three", endedAt: "2026-01-05T12:00:00.000Z" }),
      makeDebate({ id: "d4", topic: "Topic four" }),
      makeDebate({ id: "d5", topic: "Topic five" }),
    ]);
    asUser();
    renderHome();
    await waitFor(() => expect(screen.getByText("Topic one")).toBeInTheDocument());
    expect(screen.getByText("Topic four")).toBeInTheDocument();
    expect(screen.queryByText("Topic five")).not.toBeInTheDocument();

    const row1 = within(screen.getByText("Topic one").closest("button")!);
    expect(row1.getByText("Won")).toBeInTheDocument();
    expect(row1.getByText("78")).toBeInTheDocument();
    expect(row1.getByText("FOR")).toBeInTheDocument();
    expect(row1.getByText("Alternate")).toBeInTheDocument();
    expect(row1.getByText("Today")).toBeInTheDocument();

    const row2 = within(screen.getByText("Topic two").closest("button")!);
    expect(row2.getByText("Lost")).toBeInTheDocument();
    expect(row2.getByText("AGAINST")).toBeInTheDocument();
    expect(row2.getByText("Buzzer")).toBeInTheDocument();
    expect(row2.getByText("Yesterday")).toBeInTheDocument();

    expect(within(screen.getByText("Topic three").closest("button")!).getByText(/Jan 5/)).toBeInTheDocument();
  });

  it("omits the result label and side chip when they are unknown", async () => {
    mockGetHistory.mockResolvedValue([makeDebate({ topic: "No result", isWinner: null, side: null, points: null })]);
    asUser();
    renderHome();
    await waitFor(() => expect(screen.getByText("No result")).toBeInTheDocument());
    const row = within(screen.getByText("No result").closest("button")!);
    expect(row.queryByText(/^(Won|Lost)$/)).not.toBeInTheDocument();
    expect(row.queryByText(/^(FOR|AGAINST)$/)).not.toBeInTheDocument();
  });

  it("opens the debate analysis when a row is clicked", async () => {
    mockGetHistory.mockResolvedValue([makeDebate({ id: "deb-9", roomCode: "QWE123", topic: "Clickable" })]);
    asUser();
    renderHome();
    await waitFor(() => expect(screen.getByText("Clickable")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Clickable"));
    expect(mockNavigate).toHaveBeenCalledWith("/room/QWE123/analysis/deb-9");
  });

  it("navigates to /history from 'View all'", () => {
    asUser();
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "View all" }));
    expect(mockNavigate).toHaveBeenCalledWith("/history");
  });

  it("caches history across remounts", async () => {
    mockGetHistory.mockResolvedValue([makeDebate({ topic: "Cached topic" })]);
    asUser();
    const { unmount } = renderHome();
    await waitFor(() => expect(screen.getByText("Cached topic")).toBeInTheDocument());
    unmount();
    renderHome();
    expect(screen.getByText("Cached topic")).toBeInTheDocument();
    expect(mockGetHistory).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TOP DEBATERS
// ─────────────────────────────────────────────────────────────────────────────
describe("Top debaters", () => {
  const board = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `u${i + 1}`, username: `Player${i + 1}`, xp: 9000 - i * 1000, debatesWon: 10 - i, totalDebates: 12,
  }));

  it("shows empty state when leaderboard has no entries", async () => {
    asUser();
    renderHome();
    await flush();
    expect(within(topCard()).getByText(/be the first/i)).toBeInTheDocument();
  });

  it("renders top debater entries with rank, level and XP", async () => {
    mockGetLeaderboard.mockResolvedValue([
      { id: "u1", username: "Bob",   xp: 5000, debatesWon: 20, totalDebates: 30 },
      { id: "u2", username: "Carol", xp: 1300, debatesWon: 10, totalDebates: 15 },
    ]);
    asUser({ id: "user-1" });
    renderHome();
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
    const bob = within(screen.getByText("Bob").closest("li")!);
    expect(bob.getByText("1")).toBeInTheDocument();
    expect(bob.getByText("5,000")).toBeInTheDocument();
    expect(within(screen.getByText("Carol").closest("li")!).getByText("Lv 5 · Orator")).toBeInTheDocument();
  });

  it("shows only the top 4 plus the current user's row with their rank", async () => {
    mockGetLeaderboard.mockResolvedValue(board(8));
    asUser({ id: "u6", username: "Player6" });
    renderHome();
    await waitFor(() => expect(screen.getByText("Player1")).toBeInTheDocument());
    const items = within(topCard()).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(screen.queryByText("Player5")).not.toBeInTheDocument();
    const me = items[4];
    expect(me).toHaveAttribute("aria-current", "true");
    expect(within(me).getByText("Player6 (you)")).toBeInTheDocument();
    expect(within(me).getByText("6")).toBeInTheDocument();
  });

  it("highlights the current user in place when they are in the top 4", async () => {
    mockGetLeaderboard.mockResolvedValue(board(6));
    asUser({ id: "u2", username: "Player2" });
    renderHome();
    await waitFor(() => expect(screen.getByText("Player2 (you)")).toBeInTheDocument());
    expect(within(topCard()).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Player2 (you)").closest("li")).toHaveAttribute("aria-current", "true");
  });

  it("adds an unranked row for a user outside the fetched leaderboard", async () => {
    mockGetLeaderboard.mockResolvedValue(board(3));
    asUser({ id: "user-1", username: "Alice", xp: 850 });
    renderHome();
    await waitFor(() => expect(screen.getByText("Alice (you)")).toBeInTheDocument());
    const me = within(screen.getByText("Alice (you)").closest("li")!);
    expect(me.getByText("—")).toBeInTheDocument();
    expect(me.getByText("850")).toBeInTheDocument();
  });

  it("navigates to /leaderboard from the Leaderboard link", () => {
    asUser();
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    expect(mockNavigate).toHaveBeenCalledWith("/leaderboard");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
describe("Mobile layout", () => {
  beforeEach(() => { mockUseIsMobile.mockReturnValue(true); });

  it("renders the single-column board without the old Home/Rank/Me tabs", () => {
    asUser();
    renderHome();
    expect(screen.queryByText("Rank")).not.toBeInTheDocument();
    expect(screen.queryByText("Me")).not.toBeInTheDocument();
    expect(screen.getByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText("Judge credibility")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent debates" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top debaters" })).toBeInTheDocument();
  });

  it("drops the header New room button (the Create tile covers it)", () => {
    asUser();
    renderHome();
    expect(screen.queryByRole("button", { name: /new room/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /create a room/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/create-room");
  });

  it("shows the leaderboard inline on mobile", async () => {
    mockGetLeaderboard.mockResolvedValue([{ id: "u1", username: "Rank1", xp: 5000, debatesWon: 10, totalDebates: 12 }]);
    asUser();
    renderHome();
    await waitFor(() => expect(screen.getByText("Rank1")).toBeInTheDocument());
  });

  it("does not render a logout control in the page itself", () => {
    asUser();
    renderHome();
    expect(screen.queryByText(/logout|sign out/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRO WELCOME MODAL
// ─────────────────────────────────────────────────────────────────────────────
describe("Pro welcome modal", () => {
  it("shows Pro welcome modal for a brand new Pro user", () => {
    localStorage.removeItem("proWelcome_pro-user-1");
    asUser({ isPro: true, id: "pro-user-1" });
    renderHome();
    expect(screen.getByTestId("pro-welcome-modal")).toBeInTheDocument();
  });

  it("does not show Pro welcome modal when already dismissed", () => {
    localStorage.setItem("proWelcome_pro-user-2", "1");
    asUser({ isPro: true, id: "pro-user-2" });
    renderHome();
    expect(screen.queryByTestId("pro-welcome-modal")).not.toBeInTheDocument();
  });

  it("does not show Pro welcome modal for non-Pro users", () => {
    asUser({ isPro: false });
    renderHome();
    expect(screen.queryByTestId("pro-welcome-modal")).not.toBeInTheDocument();
  });

  it("closes Pro welcome modal when onClose is triggered", async () => {
    localStorage.removeItem("proWelcome_pro-user-3");
    asUser({ isPro: true, id: "pro-user-3" });
    renderHome();
    expect(screen.getByTestId("pro-welcome-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close modal"));
    await waitFor(() => expect(screen.queryByTestId("pro-welcome-modal")).not.toBeInTheDocument());
  });
});
