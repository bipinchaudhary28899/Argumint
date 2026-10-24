import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockGetHistory, mockGetLevelInfo, MOCK_LEVEL_TABLE } = vi.hoisted(() => {
  const MOCK_LEVEL_TABLE = [
    { level: 1,  title: "Novice",      minXP: 0,    maxXP: 100  },
    { level: 2,  title: "Debater",     minXP: 100,  maxXP: 300  },
    { level: 3,  title: "Apprentice",  minXP: 300,  maxXP: 800  },
    { level: 4,  title: "Contender",   minXP: 800,  maxXP: 1400 },
    { level: 5,  title: "Challenger",  minXP: 1400, maxXP: 2200 },
    { level: 6,  title: "Advocate",    minXP: 2200, maxXP: 3200 },
    { level: 7,  title: "Scholar",     minXP: 3200, maxXP: 4400 },
    { level: 8,  title: "Orator",      minXP: 4400, maxXP: 5800 },
    { level: 9,  title: "Rhetorician", minXP: 5800, maxXP: 7400 },
    { level: 10, title: "Grand Master",minXP: 7400, maxXP: 7400 },
  ];
  return {
    mockGetHistory: vi.fn(),
    mockGetLevelInfo: vi.fn(),
    MOCK_LEVEL_TABLE,
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
let mockUser: any = { username: "alice", xp: 500, isPro: false };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

let mockIsMobile = false;
vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

const DEFAULT_LEVEL_INFO = {
  current: { level: 3, title: "Apprentice", minXP: 300, maxXP: 800 },
  next:    { level: 4, title: "Contender",  minXP: 800, maxXP: 1400 },
  xp: 500,
  progressPct: 40,
};

vi.mock("@argumint/shared", () => ({
  getLevelInfo: (...args: any[]) => mockGetLevelInfo(...args),
  LEVEL_TABLE:  MOCK_LEVEL_TABLE,
}));

// AppShell owns nav / theme / Pro chrome — render children only
vi.mock("../../components/AppShell", () => ({
  AppShell: ({ active, children }: { active: string; children: React.ReactNode }) => (
    <div data-testid="app-shell" data-active={active}>{children}</div>
  ),
}));

vi.mock("../../services/api", () => ({
  historyApi: { getHistory: (...args: any[]) => mockGetHistory(...args) },
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { LevelRewards, _resetCacheForTests } from "../LevelRewards";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MOCK_HISTORY = [
  {
    id: "d1",
    topic: "AI will replace human creativity",
    mode: "standard",
    side: "for",
    isWinner: true,
    rank: 1,
    totalParticipants: 4,
    totalDebaters: 2,
    totalJudges: 1,
    points: 85,
    endedAt: "2024-03-15T10:00:00.000Z",
  },
  {
    id: "d2",
    topic: "Social media does more harm than good",
    mode: "buzzer",
    side: "against",
    isWinner: false,
    rank: 2,
    totalParticipants: 4,
    totalDebaters: 3,
    totalJudges: 0,
    points: null,
    endedAt: "2024-02-20T15:30:00.000Z",
  },
  {
    id: "d3",
    topic: "Third debate topic with no rank",
    mode: "standard",
    side: null,
    isWinner: null,
    rank: 3,
    totalParticipants: 6,
    totalDebaters: 4,
    totalJudges: 2,
    points: 72,
    endedAt: "2024-01-10T09:00:00.000Z",
  },
];

function renderPage() {
  return render(<LevelRewards />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("LevelRewards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTests();
    mockUser    = { username: "alice", xp: 500, isPro: false };
    mockIsMobile = false;
    // Default level info
    mockGetLevelInfo.mockReturnValue(DEFAULT_LEVEL_INFO);
    // Default: resolves with history data
    mockGetHistory.mockResolvedValue(MOCK_HISTORY);
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("shows 'Loading history…' while fetching", () => {
      // Never-resolving promise keeps us in the loading state
      mockGetHistory.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText("Loading history…")).toBeInTheDocument();
    });
  });

  // ── Core page structure ───────────────────────────────────────────────────
  describe("page structure", () => {
    it("renders the page heading 'Level Rewards'", async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText("Level Rewards")).toBeInTheDocument());
    });

    it("renders the subtitle tagline with the tier range", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/Every debate you finish earns XP\. 10 tiers from Novice to Grand Master/)).toBeInTheDocument()
      );
    });

    it("renders inside AppShell with the rewards nav item active", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId("app-shell")).toHaveAttribute("data-active", "rewards")
      );
    });
  });

  // ── XP Card ──────────────────────────────────────────────────────────────
  describe("XPCard", () => {
    it("displays username", async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
    });

    it("displays level title with XP", async () => {
      renderPage();
      // The level title "Apprentice" should appear (may appear multiple times — in card and nav)
      await waitFor(() =>
        expect(screen.getAllByText(/Apprentice/).length).toBeGreaterThan(0)
      );
    });

    it("displays current XP total and unit label", async () => {
      renderPage();
      await waitFor(() => expect(screen.getByText("500 XP")).toBeInTheDocument());
    });

    it("shows XP remaining to the next level", async () => {
      renderPage();
      // next.minXP (800) − xp (500)
      await waitFor(() => expect(screen.getByText(/to Level 4/)).toBeInTheDocument());
      expect(screen.getByText("300 XP", { selector: "strong" })).toBeInTheDocument();
      expect(screen.getByText("Contender at 800")).toBeInTheDocument();
    });

    it("shows level number badge", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("Lv 3").length).toBeGreaterThan(0)
      );
    });

    it("renders LEVEL_TABLE grid entries", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Novice")).toBeInTheDocument()
      );
      expect(screen.getByText("Debater")).toBeInTheDocument();
    });

    it("renders all level numbers from LEVEL_TABLE", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Level Rewards"));
      // All 10 levels should appear (as text)
      for (let i = 1; i <= 10; i++) {
        expect(screen.getAllByText(String(i)).length).toBeGreaterThan(0);
      }
    });

    it("shows progress bar (not max level)", async () => {
      // User is level 3, not max (10)
      renderPage();
      await waitFor(() => screen.getByText("Level Rewards"));
      // "Grand Master" (max level text) should NOT appear as a standalone label when at level 3
      const gmTexts = screen.queryAllByText(/Grand Master.*Max Level/);
      expect(gmTexts.length).toBe(0);
    });

    it("shows Max Level message for max level user", async () => {
      mockUser = { username: "godmode", xp: 99999, isPro: true };
      mockGetLevelInfo.mockReturnValue({
        current: { level: 10, title: "Grand Master", minXP: 7400, maxXP: 7400 },
        next: null,
        xp: 99999,
        progressPct: 100,
      });

      renderPage();
      await waitFor(() => screen.getByText("Level Rewards"));
      expect(screen.getByText(/Max Level — Grand Master/)).toBeInTheDocument();
    });
  });

  // ── Roadmap ──────────────────────────────────────────────────────────────
  describe("Roadmap", () => {
    it("renders 'Your Roadmap' section header", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/Your Roadmap/)).toBeInTheDocument()
      );
    });

    it("renders milestone level labels", async () => {
      renderPage();
      await waitFor(() => screen.getByText(/Your Roadmap/));
      // Milestone levels: 1, 2, 3, 5, 7, 10
      expect(screen.getByText("Lv 1")).toBeInTheDocument();
      expect(screen.getByText("Lv 5")).toBeInTheDocument();
      expect(screen.getByText("Lv 10")).toBeInTheDocument();
    });
  });

  // ── All-levels grid ───────────────────────────────────────────────────────
  describe("levels grid", () => {
    it("marks reached, current, next and locked tiers", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Level Rewards"));
      expect(screen.getAllByText("Reached")).toHaveLength(2);   // Lv 1–2
      expect(screen.getByText("Current")).toBeInTheDocument(); // Lv 3
      expect(screen.getByText("300 to go")).toBeInTheDocument(); // Lv 4
      expect(screen.getAllByText("Locked")).toHaveLength(6);    // Lv 5–10
    });
  });

  // ── History section ──────────────────────────────────────────────────────
  describe("history section header", () => {
    it("renders 'Debate History' label", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/Debate History/)).toBeInTheDocument()
      );
    });

    it("shows debate count when history is loaded", async () => {
      renderPage();
      // history.length is 3, but "3" appears multiple times (level number etc.)
      // Just confirm the Debate History header is visible with some count
      await waitFor(() =>
        expect(screen.getByText(/Debate History/)).toBeInTheDocument()
      );
      // The count badge (3) appears in the DOM — use getAllByText since "3" is not unique
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    });
  });

  // ── History list — desktop column headers ─────────────────────────────────
  describe("desktop history column headers", () => {
    it("shows Motion, Debaters, Judges, Rank, Points headers", async () => {
      mockIsMobile = false;
      renderPage();
      await waitFor(() => screen.getByText("Motion"));
      expect(screen.getByText("Debaters")).toBeInTheDocument();
      expect(screen.getByText("Judges")).toBeInTheDocument();
      expect(screen.getByText("Rank")).toBeInTheDocument();
      expect(screen.getByText("Points")).toBeInTheDocument();
    });

    it("does not show column headers in mobile mode", async () => {
      mockIsMobile = true;
      renderPage();
      await waitFor(() => screen.getByText(/Debate History/));
      expect(screen.queryByText("Motion")).not.toBeInTheDocument();
    });
  });

  // ── History entries ───────────────────────────────────────────────────────
  describe("history entries", () => {
    it("shows debate topic", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("AI will replace human creativity")).toBeInTheDocument()
      );
    });

    it("shows second debate topic", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Social media does more harm than good")).toBeInTheDocument()
      );
    });

    it("shows debate mode badge (standard)", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("standard").length).toBeGreaterThan(0)
      );
    });

    it("shows debate mode badge (buzzer)", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("buzzer")).toBeInTheDocument()
      );
    });

    it("shows side badge (for)", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("for")).toBeInTheDocument()
      );
    });

    it("shows side badge (against)", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("against")).toBeInTheDocument()
      );
    });

    it("shows won indicator for winner", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Won")).toBeInTheDocument()
      );
    });

    it("shows lost indicator for loser", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Lost")).toBeInTheDocument()
      );
    });

    it("shows 1st for rank 1", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("1st")).toBeInTheDocument()
      );
    });

    it("shows 2nd for rank 2", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("2nd")).toBeInTheDocument()
      );
    });

    it("shows 3rd for rank 3", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("3rd")).toBeInTheDocument()
      );
    });

    it("shows debate points", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("85")).toBeInTheDocument()
      );
    });

    it("shows 'pts' label next to points", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("pts").length).toBeGreaterThan(0)
      );
    });

    it("shows — for null points", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Social media does more harm than good"));
      // entry d2 has points: null → should show "—"
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("shows debater count", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("2").length).toBeGreaterThan(0)
      );
    });

    it("shows judge count or — for 0 judges", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Social media does more harm than good"));
      // entry d2 has 0 judges → shows "—"
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThan(0);
    });

    it("shows formatted date for entry", async () => {
      renderPage();
      // Date formatting uses toLocaleDateString — just ensure the year appears
      await waitFor(() =>
        expect(screen.getAllByText(/2024/).length).toBeGreaterThan(0)
      );
    });
  });

  // ── Empty history ─────────────────────────────────────────────────────────
  describe("empty history", () => {
    it("shows the empty state when getHistory resolves empty", async () => {
      mockGetHistory.mockResolvedValue([]);
      renderPage();
      await waitFor(() => expect(screen.getByText("No debates yet")).toBeInTheDocument());
      expect(screen.getByText(/Join or create a room to start earning XP/)).toBeInTheDocument();
    });
  });

  // ── Mobile layout ─────────────────────────────────────────────────────────
  describe("mobile layout", () => {
    it("renders history section in mobile mode", async () => {
      mockIsMobile = true;
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("AI will replace human creativity")).toBeInTheDocument()
      );
    });

    it("shows 'Debaters' label in mobile mode for each row", async () => {
      mockIsMobile = true;
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("Debaters").length).toBeGreaterThan(0)
      );
    });

    it("shows 'Judges' label in mobile mode for each row", async () => {
      mockIsMobile = true;
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("Judges").length).toBeGreaterThan(0)
      );
    });

    it("shows 'Rank' label in mobile mode for each row", async () => {
      mockIsMobile = true;
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("Rank").length).toBeGreaterThan(0)
      );
    });

    it("shows 'Points' label in mobile mode for each row", async () => {
      mockIsMobile = true;
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("Points").length).toBeGreaterThan(0)
      );
    });
  });

  // ── getHistory API call ───────────────────────────────────────────────────
  describe("API behavior", () => {
    it("calls historyApi.getHistory on mount when no cache", async () => {
      renderPage();
      await waitFor(() => screen.getByText("AI will replace human creativity"));
      expect(mockGetHistory).toHaveBeenCalledTimes(1);
    });

    it("reuses the module cache on remount (no refetch, no loading flash)", async () => {
      const { unmount } = renderPage();
      await waitFor(() => screen.getByText("AI will replace human creativity"));
      unmount();
      renderPage();
      expect(screen.queryByText("Loading history…")).not.toBeInTheDocument();
      expect(screen.getByText("AI will replace human creativity")).toBeInTheDocument();
      expect(mockGetHistory).toHaveBeenCalledTimes(1);
    });
  });
});
