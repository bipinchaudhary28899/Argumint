import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ResultPage } from "../ResultPage";

// ─── Socket factory ───────────────────────────────────────────────────────────
type Listener = (...args: any[]) => void;

function createMockSocket() {
  const listeners: Record<string, Listener[]> = {};
  return {
    emit: vi.fn(),
    on: vi.fn((event: string, fn: Listener) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
    }),
    off: vi.fn((event: string, fn: Listener) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    }),
    _emit(event: string, data?: any) {
      (listeners[event] ?? []).forEach((fn) => fn(data));
    },
  };
}

// ─── Mutable test state ───────────────────────────────────────────────────────
let mockSocket: ReturnType<typeof createMockSocket>;
let mockIsConnected = true;
let mockIsReconnecting = false;
let mockOnReconnect = vi.fn();
const mockNavigate = vi.fn();
const mockCheckAuth = vi.fn().mockResolvedValue(undefined);
let mockUser: any = {
  id: "user-1",
  username: "Alice",
  email: "alice@test.com",
  xp: 200,
  isPro: false,
};
let mockParams = { code: "TEST1", debateId: "debate-id-1" };

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser, checkAuth: mockCheckAuth }),
}));

vi.mock("../../hooks/useSocket", () => ({
  useSocket: () => ({
    socket: mockSocket,
    isConnected: mockIsConnected,
    isReconnecting: mockIsReconnecting,
    onReconnect: mockOnReconnect,
  }),
}));

vi.mock("../../hooks/useLeaveRoomOnNavigate", () => ({
  useLeaveRoomOnNavigate: vi.fn(),
}));

vi.mock("../../hooks/useReconnectHandler", () => ({
  useReconnectHandler: vi.fn(),
}));

vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("../../components/ConnectionStatusBanner", () => ({
  ConnectionStatusBanner: ({ isConnected, isReconnecting }: any) => (
    <div
      data-testid="connection-banner"
      data-connected={String(isConnected)}
      data-reconnecting={String(isReconnecting)}
    />
  ),
}));

vi.mock("@argumint/shared", () => ({
  getLevelInfo: vi.fn().mockReturnValue({
    current: { level: 5, title: "Debater" },
    next: { level: 6, title: "Senior Debater", xpRequired: 500 },
    progressPct: 60,
    progressXP: 120,
    neededXP: 200,
  }),
}));

// ─── Debate data builders ─────────────────────────────────────────────────────
function makeResult(overrides: any = {}) {
  return {
    winnerSide: "for" as const,
    winningPoints: ["Point A", "Point B"],
    summary: "FOR side won.",
    scores: [
      {
        userId: "user-1", username: "Alice", side: "for",
        clarity: 22, evidence: 20, rebuttal: 18, organization: 21, total: 81,
        feedback: "Great!", strengths: ["Clear"], improvements: ["Faster"],
      },
      {
        userId: "user-2", username: "Bob", side: "against",
        clarity: 15, evidence: 14, rebuttal: 13, organization: 16, total: 58,
        feedback: "OK", strengths: ["Engaging"], improvements: ["Evidence"],
      },
    ],
    judgedAt: new Date(),
    judgeModel: "gpt-4o",
    ...overrides,
  };
}

function makeDebate(overrides: any = {}) {
  return {
    _id: "debate-id-1",
    roomId: "room-1",
    roomCode: "TEST1",
    creatorId: "user-1",
    topic: "AI will do more good than harm",
    mode: "alternate",
    totalRounds: 3,
    turnDuration: 120,
    prepDuration: 60,
    turnOrder: [
      { userId: "user-1", username: "Alice", side: "for" },
      { userId: "user-2", username: "Bob", side: "against" },
    ],
    rounds: [],
    currentTurn: null,
    status: "ended",
    result: null,
    ...overrides,
  };
}

// ─── Per-test socket setup helper ─────────────────────────────────────────────
function setupDebateLoad(debate: any, options: { error?: string } = {}) {
  mockSocket.emit.mockImplementation(
    (event: string, _payload: any, cb?: Function) => {
      if (event === "debate:get-state" && cb) {
        if (options.error) {
          cb({ success: false, error: options.error });
        } else {
          cb({ success: true, debate });
        }
      }
    }
  );
}

// ─── Flush helper ─────────────────────────────────────────────────────────────
async function renderPage() {
  await act(async () => {
    render(<ResultPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ResultPage", () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
    mockIsConnected = true;
    mockIsReconnecting = false;
    mockOnReconnect = vi.fn();
    mockNavigate.mockReset();
    mockCheckAuth.mockReset().mockResolvedValue(undefined);
    mockUser = {
      id: "user-1", username: "Alice", email: "alice@test.com", xp: 200, isPro: false,
    };
    mockParams = { code: "TEST1", debateId: "debate-id-1" };
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  describe("loading state", () => {
    it("shows loading spinner before debate data arrives", async () => {
      // emit mock left as vi.fn() — callback never called → debate stays null
      await act(async () => {
        render(<ResultPage />);
        await Promise.resolve();
      });
      expect(screen.getByAltText("Loading…")).toBeInTheDocument();
    });

    it("does not render ConnectionStatusBanner in loading early-return", async () => {
      await act(async () => {
        render(<ResultPage />);
        await Promise.resolve();
      });
      expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  describe("error state", () => {
    it("displays the server error message", async () => {
      setupDebateLoad(null, { error: "Room not found" });
      await renderPage();
      expect(screen.getByText(/Room not found/)).toBeInTheDocument();
    });

    it("shows a Back to Home button", async () => {
      setupDebateLoad(null, { error: "Something went wrong" });
      await renderPage();
      expect(
        screen.getByRole("button", { name: /Back to Home/i })
      ).toBeInTheDocument();
    });

    it("Back to Home button navigates to /", async () => {
      setupDebateLoad(null, { error: "Oops" });
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Back to Home/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("does not render ConnectionStatusBanner in error early-return", async () => {
      setupDebateLoad(null, { error: "Some error" });
      await renderPage();
      expect(screen.queryByTestId("connection-banner")).not.toBeInTheDocument();
    });
  });

  // ── Judging state (debate loaded, no result yet) ───────────────────────────

  describe("judging state", () => {
    it("shows judging spinner and label", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();
      expect(screen.getByAltText("Judging…")).toBeInTheDocument();
      expect(screen.getByText(/AI Judge reviewing…/)).toBeInTheDocument();
    });

    it("renders ConnectionStatusBanner once debate is loaded", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();
      expect(screen.getByTestId("connection-banner")).toBeInTheDocument();
    });

    it("calls checkAuth when debate loads with ended status", async () => {
      setupDebateLoad(makeDebate({ status: "ended", result: null }));
      await renderPage();
      expect(mockCheckAuth).toHaveBeenCalled();
    });

    it("does not call checkAuth when status is not ended", async () => {
      setupDebateLoad(makeDebate({ status: "judging", result: null }));
      await renderPage();
      expect(mockCheckAuth).not.toHaveBeenCalled();
    });
  });

  // ── Judge failed state ────────────────────────────────────────────────────

  describe("judge failed state", () => {
    it("shows Judge unavailable heading after debate:result-failed", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();
      await act(async () => {
        mockSocket._emit("debate:result-failed", { error: "LLM timeout" });
        await Promise.resolve();
      });
      expect(screen.getByText("Judge unavailable")).toBeInTheDocument();
    });

    it("shows the error detail from the event payload", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();
      await act(async () => {
        mockSocket._emit("debate:result-failed", { error: "Service unavailable" });
        await Promise.resolve();
      });
      expect(screen.getByText(/Service unavailable/)).toBeInTheDocument();
    });

    it("shows generic message when payload has no error field", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();
      await act(async () => {
        mockSocket._emit("debate:result-failed", {});
        await Promise.resolve();
      });
      // Default: both the heading and detail paragraph render "Judge unavailable"
      expect(screen.getAllByText("Judge unavailable").length).toBeGreaterThan(0);
    });
  });

  // ── No score fallback ─────────────────────────────────────────────────────

  describe("no score fallback", () => {
    it("shows Score not available when user is not in results", async () => {
      mockUser = { id: "user-99", username: "Ghost", email: "g@test.com", xp: 0, isPro: false };
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByText(/Score not available/)).toBeInTheDocument();
    });

    it("shows Back to Home button in no-score fallback", async () => {
      mockUser = { id: "user-99", username: "Ghost", email: "g@test.com", xp: 0, isPro: false };
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(
        screen.getByRole("button", { name: /Back to Home/i })
      ).toBeInTheDocument();
    });
  });

  // ── Main result layout ────────────────────────────────────────────────────

  describe("main result layout", () => {
    it("shows MVP when user is rank-1 winner", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByText("MVP")).toBeInTheDocument();
    });

    it("shows user's numeric score", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      // "81" appears in both the hero score circle and the standings leaderboard
      expect(screen.getAllByText("81").length).toBeGreaterThan(0);
    });

    it("shows FOR WINS when winner side is for", async () => {
      setupDebateLoad(makeDebate({ result: makeResult({ winnerSide: "for" }) }));
      await renderPage();
      expect(screen.getByText("FOR WINS")).toBeInTheDocument();
    });

    it("shows AGAINST WINS when winner side is against", async () => {
      const result = makeResult({
        winnerSide: "against",
        scores: [
          { userId: "user-1", username: "Alice", side: "against", clarity: 22, evidence: 20, rebuttal: 18, organization: 21, total: 81, feedback: "", strengths: [], improvements: [] },
          { userId: "user-2", username: "Bob", side: "for", clarity: 15, evidence: 14, rebuttal: 13, organization: 16, total: 58, feedback: "", strengths: [], improvements: [] },
        ],
      });
      setupDebateLoad(makeDebate({ result }));
      await renderPage();
      expect(screen.getByText("AGAINST WINS")).toBeInTheDocument();
    });

    it("shows WINNER (not MVP) when user won but is rank 2+", async () => {
      const result = makeResult({
        winnerSide: "for",
        scores: [
          { userId: "user-2", username: "Bob", side: "for", clarity: 24, evidence: 24, rebuttal: 24, organization: 23, total: 95, feedback: "", strengths: [], improvements: [] },
          { userId: "user-1", username: "Alice", side: "for", clarity: 22, evidence: 20, rebuttal: 18, organization: 21, total: 81, feedback: "", strengths: [], improvements: [] },
          { userId: "user-3", username: "Charlie", side: "against", clarity: 15, evidence: 14, rebuttal: 13, organization: 16, total: 58, feedback: "", strengths: [], improvements: [] },
        ],
      });
      setupDebateLoad(makeDebate({ result }));
      await renderPage();
      expect(screen.getByText("WINNER")).toBeInTheDocument();
    });

    it("shows RUNNER-UP when user is rank 2 and lost", async () => {
      const result = makeResult({
        winnerSide: "against",
        scores: [
          { userId: "user-2", username: "Bob", side: "against", clarity: 24, evidence: 24, rebuttal: 24, organization: 23, total: 95, feedback: "", strengths: [], improvements: [] },
          { userId: "user-1", username: "Alice", side: "for", clarity: 22, evidence: 20, rebuttal: 18, organization: 21, total: 81, feedback: "", strengths: [], improvements: [] },
        ],
      });
      setupDebateLoad(makeDebate({ result }));
      await renderPage();
      expect(screen.getByText("RUNNER-UP")).toBeInTheDocument();
    });

    it("shows 3rd PLACE label when user is rank 3", async () => {
      const result = makeResult({
        winnerSide: "against",
        scores: [
          { userId: "user-2", username: "Bob", side: "against", clarity: 24, evidence: 24, rebuttal: 24, organization: 23, total: 95, feedback: "", strengths: [], improvements: [] },
          { userId: "user-3", username: "Carol", side: "against", clarity: 22, evidence: 20, rebuttal: 18, organization: 21, total: 81, feedback: "", strengths: [], improvements: [] },
          { userId: "user-1", username: "Alice", side: "for", clarity: 15, evidence: 14, rebuttal: 13, organization: 16, total: 58, feedback: "", strengths: [], improvements: [] },
        ],
      });
      setupDebateLoad(makeDebate({ result }));
      await renderPage();
      expect(screen.getByText("3rd PLACE")).toBeInTheDocument();
    });

    it("shows score breakdown category labels", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByText("Clarity")).toBeInTheDocument();
      expect(screen.getByText("Evidence")).toBeInTheDocument();
      expect(screen.getByText("Rebuttal")).toBeInTheDocument();
      expect(screen.getByText("Organization")).toBeInTheDocument();
    });

    it("shows Standings leaderboard section", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByText(/Standings/i)).toBeInTheDocument();
    });

    it("shows the debate topic in the top bar", async () => {
      setupDebateLoad(
        makeDebate({ result: makeResult(), topic: "AI will do more good than harm" })
      );
      await renderPage();
      expect(screen.getByText("AI will do more good than harm")).toBeInTheDocument();
    });

    it("shows XP gained amount in the top bar", async () => {
      // xpGained = myScore.total = 81 (no myXPAward set yet)
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByText("+81")).toBeInTheDocument();
    });

    it("shows both participants in the standings leaderboard", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Bob/).length).toBeGreaterThan(0);
    });
  });

  // ── Navigation buttons ────────────────────────────────────────────────────

  describe("navigation buttons", () => {
    it("Play Again button navigates to /", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      fireEvent.click(screen.getByText(/Play Again/));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("← Home button navigates to /", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      fireEvent.click(screen.getByText(/← Home/));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  // ── Pro / Free feature gating ─────────────────────────────────────────────

  describe("Pro / Free feature gating", () => {
    it("shows View Full Analysis button for Pro users", async () => {
      mockUser = { ...mockUser, isPro: true };
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByText(/View Full Analysis/)).toBeInTheDocument();
    });

    it("View Full Analysis navigates to analysis route", async () => {
      mockUser = { ...mockUser, isPro: true };
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      fireEvent.click(screen.getByText(/View Full Analysis/));
      expect(mockNavigate).toHaveBeenCalledWith(
        "/room/TEST1/analysis/debate-id-1",
        expect.any(Object)
      );
    });

    it("shows ProUpgradeBanner lock icon for free users", async () => {
      // mockUser.isPro = false (default)
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByText("🔒")).toBeInTheDocument();
    });

    it("hides View Full Analysis for free users", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.queryByText(/View Full Analysis/)).not.toBeInTheDocument();
    });

    it("ProUpgradeBanner click navigates to /pricing", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      // Click the lock emoji — event bubbles to the parent div's onClick
      fireEvent.click(screen.getByText("🔒"));
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });
  });

  // ── Socket event handling ─────────────────────────────────────────────────

  describe("socket events", () => {
    it("debate:result-ready transitions judging → result layout", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();
      expect(screen.getByAltText("Judging…")).toBeInTheDocument();

      await act(async () => {
        mockSocket._emit("debate:result-ready", {
          result: makeResult(),
          xpAwards: [
            { userId: "user-1", xpGained: 81, newXP: 281, leveledUp: false, newLevel: 5, newLevelTitle: "Debater" },
          ],
          judgeScores: [],
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.queryByAltText("Judging…")).not.toBeInTheDocument();
      expect(screen.getByText("MVP")).toBeInTheDocument();
    });

    it("debate:result-ready calls checkAuth", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();
      mockCheckAuth.mockClear();

      await act(async () => {
        mockSocket._emit("debate:result-ready", {
          result: makeResult(),
          xpAwards: [],
          judgeScores: [],
        });
        await Promise.resolve();
      });

      expect(mockCheckAuth).toHaveBeenCalled();
    });

    it("debate:result-ready sets XP award from payload", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();

      await act(async () => {
        mockSocket._emit("debate:result-ready", {
          result: makeResult(),
          xpAwards: [
            { userId: "user-1", xpGained: 95, newXP: 295, leveledUp: false, newLevel: 5, newLevelTitle: "Debater" },
          ],
          judgeScores: [],
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      // xpGained from award = 95, shown as +95
      expect(screen.getByText("+95")).toBeInTheDocument();
    });

    it("debate:result-failed shows Judge unavailable label", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();

      await act(async () => {
        mockSocket._emit("debate:result-failed", { error: "Request timed out" });
        await Promise.resolve();
      });

      expect(screen.getByText("Judge unavailable")).toBeInTheDocument();
      expect(screen.getByText(/Request timed out/)).toBeInTheDocument();
    });

    it("debate:judge-scores-updated keeps judging UI stable", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();

      await act(async () => {
        mockSocket._emit("debate:judge-scores-updated", {
          judgeScores: [
            {
              judgeId: "j1", judgeUsername: "Judge1",
              scores: [{ userId: "user-1", score: 80 }],
              submittedAt: new Date(),
            },
          ],
        });
        await Promise.resolve();
      });

      // Component still shows judging state — scores update is internal state only
      expect(screen.getByAltText("Judging…")).toBeInTheDocument();
    });

    it("socket listeners are cleaned up on unmount", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      const { unmount } = await act(async () => {
        const result = render(<ResultPage />);
        await Promise.resolve();
        await Promise.resolve();
        return result;
      });

      unmount();
      expect(mockSocket.off).toHaveBeenCalledWith(
        "debate:result-ready",
        expect.any(Function)
      );
      expect(mockSocket.off).toHaveBeenCalledWith(
        "debate:result-failed",
        expect.any(Function)
      );
    });
  });

  // ── Preview mode ──────────────────────────────────────────────────────────

  describe("preview mode", () => {
    it("shows full result layout for preview debateId", async () => {
      mockParams = { code: "PREVIEW", debateId: "preview" };
      await act(async () => {
        render(<ResultPage />);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText("MVP")).toBeInTheDocument();
    });

    it("does not emit debate:get-state in preview mode", async () => {
      mockParams = { code: "PREVIEW", debateId: "preview" };
      await act(async () => {
        render(<ResultPage />);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        "debate:get-state",
        expect.anything(),
        expect.anything()
      );
    });

    it("shows FOR WINS in preview result", async () => {
      mockParams = { code: "PREVIEW", debateId: "preview" };
      await act(async () => {
        render(<ResultPage />);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText("FOR WINS")).toBeInTheDocument();
    });
  });

  // ── ConnectionStatusBanner ────────────────────────────────────────────────

  describe("ConnectionStatusBanner", () => {
    it("renders banner in result layout", async () => {
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByTestId("connection-banner")).toBeInTheDocument();
    });

    it("passes isConnected=true to banner", async () => {
      mockIsConnected = true;
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByTestId("connection-banner").dataset.connected).toBe("true");
    });

    it("passes isReconnecting=false to banner", async () => {
      mockIsReconnecting = false;
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByTestId("connection-banner").dataset.reconnecting).toBe("false");
    });

    it("passes isReconnecting=true when reconnecting", async () => {
      mockIsReconnecting = true;
      setupDebateLoad(makeDebate({ result: makeResult() }));
      await renderPage();
      expect(screen.getByTestId("connection-banner").dataset.reconnecting).toBe("true");
    });
  });

  // ── checkAuth calls ───────────────────────────────────────────────────────

  describe("checkAuth", () => {
    it("is called when debate with ended status is fetched via socket", async () => {
      setupDebateLoad(makeDebate({ status: "ended", result: makeResult() }));
      await renderPage();
      expect(mockCheckAuth).toHaveBeenCalled();
    });

    it("is called after debate:result-ready event", async () => {
      setupDebateLoad(makeDebate({ result: null }));
      await renderPage();
      mockCheckAuth.mockClear();

      await act(async () => {
        mockSocket._emit("debate:result-ready", {
          result: makeResult(),
          xpAwards: [],
          judgeScores: [],
        });
        await Promise.resolve();
      });

      expect(mockCheckAuth).toHaveBeenCalled();
    });
  });
});
