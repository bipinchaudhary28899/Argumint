import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DebateAnalysisPage } from "../DebateAnalysisPage";

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
    off: vi.fn(),
    _emit(event: string, data?: any) {
      (listeners[event] ?? []).forEach((fn) => fn(data));
    },
  };
}

// ─── Mutable test state ───────────────────────────────────────────────────────
let mockSocket: ReturnType<typeof createMockSocket>;
let mockIsConnected = true;
const mockNavigate = vi.fn();
let mockParams = { code: "TEST1", debateId: "debate-id-1" };
let mockLocation: any = { state: null };
let mockUser: any = { id: "user-1", username: "Alice", email: "alice@test.com", isPro: true };

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams:   () => mockParams,
  useLocation: () => mockLocation,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock("../../hooks/useSocket", () => ({
  useSocket: () => ({ socket: mockSocket, isConnected: mockIsConnected }),
}));

vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@argumint/shared", () => ({
  getLevelInfo: vi.fn().mockReturnValue({
    current: { level: 5, title: "Debater" },
    next: { level: 6, title: "Senior Debater", xpRequired: 500 },
    progressPct: 60, progressXP: 120, neededXP: 200,
  }),
}));

// ─── Data builders ────────────────────────────────────────────────────────────
function makeResult(overrides: any = {}) {
  return {
    winnerSide: "for" as const,
    winningPoints: ["Strong evidence cited", "Clear rebuttal structure"],
    summary: "FOR side dominated with data-backed claims.",
    scores: [
      {
        userId: "user-1", username: "Alice", side: "for",
        clarity: 22, evidence: 20, rebuttal: 18, organization: 21, total: 81,
        feedback: "Excellent clarity and strong evidence.",
        strengths: ["Clear opening argument", "Used data effectively"],
        improvements: ["Speed delivery in round 2"],
      },
      {
        userId: "user-2", username: "Bob", side: "against",
        clarity: 15, evidence: 14, rebuttal: 13, organization: 16, total: 58,
        feedback: "Raised valid concerns but lacked data.",
        strengths: ["Engaging tone"],
        improvements: ["Add more evidence"],
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
    result: makeResult(),
    ...overrides,
  };
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function renderWithState(debate: any, judgeScores: any[] = []) {
  mockLocation = { state: { debate, judgeScores } };
  render(<DebateAnalysisPage />);
}

async function renderPage(debate?: any, judgeScores: any[] = []) {
  if (debate !== undefined) {
    mockLocation = { state: { debate, judgeScores } };
  }
  await act(async () => {
    render(<DebateAnalysisPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DebateAnalysisPage", () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
    mockIsConnected = true;
    mockNavigate.mockReset();
    mockParams = { code: "TEST1", debateId: "debate-id-1" };
    mockLocation = { state: null };
    mockUser = { id: "user-1", username: "Alice", email: "alice@test.com", isPro: true };
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  describe("loading state", () => {
    it("shows loading spinner when no debate in location state and socket pending", async () => {
      // emit mock left as vi.fn() — callback never invoked
      await act(async () => {
        render(<DebateAnalysisPage />);
        await Promise.resolve();
      });
      expect(screen.getByAltText("Loading…")).toBeInTheDocument();
    });

    it("shows loading spinner when debate exists but has no result", () => {
      renderWithState(makeDebate({ result: null }));
      expect(screen.getByAltText("Loading…")).toBeInTheDocument();
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  describe("error state", () => {
    it("shows error message after socket failure", async () => {
      mockSocket.emit.mockImplementation(
        (_ev: string, _p: any, cb?: Function) => { if (cb) cb({ success: false, error: "Debate not found" }); }
      );
      await renderPage();
      expect(screen.getByText(/Debate not found/)).toBeInTheDocument();
    });

    it("shows ← Go Back button on error", async () => {
      mockSocket.emit.mockImplementation(
        (_ev: string, _p: any, cb?: Function) => { if (cb) cb({ success: false, error: "Gone" }); }
      );
      await renderPage();
      expect(screen.getByRole("button", { name: /Go Back/i })).toBeInTheDocument();
    });

    it("← Go Back calls navigate(-1)", async () => {
      mockSocket.emit.mockImplementation(
        (_ev: string, _p: any, cb?: Function) => { if (cb) cb({ success: false, error: "Gone" }); }
      );
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Go Back/i }));
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  // ── Socket fetch ───────────────────────────────────────────────────────────

  describe("socket fetch when no location state", () => {
    it("emits debate:get-state when socket connected and no cached debate", async () => {
      mockSocket.emit.mockImplementation(
        (_ev: string, _p: any, cb?: Function) => { if (cb) cb({ success: true, debate: makeDebate() }); }
      );
      await renderPage();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "debate:get-state",
        { debateId: "debate-id-1" },
        expect.any(Function)
      );
    });

    it("does NOT emit when debate is already in location state", async () => {
      mockLocation = { state: { debate: makeDebate(), judgeScores: [] } };
      await act(async () => {
        render(<DebateAnalysisPage />);
        await Promise.resolve();
      });
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        "debate:get-state",
        expect.anything(),
        expect.anything()
      );
    });
  });

  // ── Pro gate for free users ────────────────────────────────────────────────

  describe("Pro gate (free user)", () => {
    beforeEach(() => {
      mockUser = { ...mockUser, isPro: false };
      mockLocation = { state: { debate: makeDebate(), judgeScores: [] } };
    });

    it("shows lock icon and 'Full Analysis is Pro' heading", () => {
      render(<DebateAnalysisPage />);
      expect(screen.getByText("Full Analysis is Pro")).toBeInTheDocument();
      expect(screen.getByText("🔒")).toBeInTheDocument();
    });

    it("clicking the upgrade panel navigates to /pricing", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByText("Full Analysis is Pro").closest("div")!);
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });

    it("does NOT show tabs for free user", () => {
      render(<DebateAnalysisPage />);
      expect(screen.queryByRole("button", { name: /Transcript/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Scores/i })).not.toBeInTheDocument();
    });

    it("still shows the header with topic and ← Results", () => {
      render(<DebateAnalysisPage />);
      expect(screen.getByText("AI will do more good than harm")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /← Results/i })).toBeInTheDocument();
    });
  });

  // ── Header (Pro user, debate loaded) ──────────────────────────────────────

  describe("header", () => {
    beforeEach(() => {
      mockLocation = { state: { debate: makeDebate(), judgeScores: [] } };
    });

    it("shows the debate topic", () => {
      render(<DebateAnalysisPage />);
      expect(screen.getByText("AI will do more good than harm")).toBeInTheDocument();
    });

    it("shows 'Full Analysis' label", () => {
      render(<DebateAnalysisPage />);
      expect(screen.getByText("Full Analysis")).toBeInTheDocument();
    });

    it("shows FOR WINS badge when FOR side won", () => {
      render(<DebateAnalysisPage />);
      expect(screen.getByText("FOR WINS")).toBeInTheDocument();
    });

    it("shows AGAINST WINS badge when AGAINST side won", () => {
      mockLocation = {
        state: {
          debate: makeDebate({ result: makeResult({ winnerSide: "against" }) }),
          judgeScores: [],
        },
      };
      render(<DebateAnalysisPage />);
      expect(screen.getByText("AGAINST WINS")).toBeInTheDocument();
    });

    it("← Results navigates to results page", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /← Results/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/room/TEST1/result/debate-id-1");
    });
  });

  // ── Tabs ───────────────────────────────────────────────────────────────────

  describe("tabs (Pro user)", () => {
    beforeEach(() => {
      mockLocation = { state: { debate: makeDebate(), judgeScores: [] } };
    });

    it("renders all three tab buttons", () => {
      render(<DebateAnalysisPage />);
      expect(screen.getByRole("button", { name: /Transcript/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Scores/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /AI Review/i })).toBeInTheDocument();
    });

    it("Transcript tab is active by default", () => {
      render(<DebateAnalysisPage />);
      // Transcript content should be visible: "No arguments were captured"
      // (since rounds is empty in makeDebate)
      expect(screen.getByText(/No arguments were captured/i)).toBeInTheDocument();
    });

    it("clicking Scores tab shows score content", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /Scores/i }));
      // Bar labels appear once per participant — use getAllByText
      expect(screen.getAllByText("Clarity").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Proof").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Counter").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Structure").length).toBeGreaterThan(0);
    });

    it("clicking AI Review tab shows AI analysis content", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      // "🤖 Match Summary" — match via partial regex
      expect(screen.getByText(/Match Summary/)).toBeInTheDocument();
    });

    it("switching tabs hides previous tab content", () => {
      render(<DebateAnalysisPage />);
      // Transcript visible by default
      expect(screen.getByText(/No arguments were captured/i)).toBeInTheDocument();
      // Switch to Scores
      fireEvent.click(screen.getByRole("button", { name: /Scores/i }));
      expect(screen.queryByText(/No arguments were captured/i)).not.toBeInTheDocument();
    });
  });

  // ── Transcript tab ─────────────────────────────────────────────────────────

  describe("Transcript tab", () => {
    it("shows placeholder when no rounds captured", () => {
      mockLocation = { state: { debate: makeDebate({ rounds: [] }), judgeScores: [] } };
      render(<DebateAnalysisPage />);
      expect(screen.getByText(/No arguments were captured/i)).toBeInTheDocument();
    });

    it("renders each round with speaker and argument", () => {
      const rounds = [
        { roundNumber: 1, speakerUsername: "Alice", side: "for",     argument: "AI benefits humanity clearly." },
        { roundNumber: 2, speakerUsername: "Bob",   side: "against", argument: "AI could cause job losses." },
      ];
      mockLocation = { state: { debate: makeDebate({ rounds }), judgeScores: [] } };
      render(<DebateAnalysisPage />);
      expect(screen.getByText("AI benefits humanity clearly.")).toBeInTheDocument();
      expect(screen.getByText("AI could cause job losses.")).toBeInTheDocument();
    });

    it("shows round number labels R1, R2", () => {
      const rounds = [
        { roundNumber: 1, speakerUsername: "Alice", side: "for",     argument: "Point one." },
        { roundNumber: 2, speakerUsername: "Bob",   side: "against", argument: "Point two." },
      ];
      mockLocation = { state: { debate: makeDebate({ rounds }), judgeScores: [] } };
      render(<DebateAnalysisPage />);
      expect(screen.getByText("R1")).toBeInTheDocument();
      expect(screen.getByText("R2")).toBeInTheDocument();
    });

    it("shows speaker usernames in transcript", () => {
      const rounds = [
        { roundNumber: 1, speakerUsername: "Alice", side: "for", argument: "Some argument." },
      ];
      mockLocation = { state: { debate: makeDebate({ rounds }), judgeScores: [] } };
      render(<DebateAnalysisPage />);
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    it("shows '(no transcript captured)' when argument is empty", () => {
      const rounds = [
        { roundNumber: 1, speakerUsername: "Alice", side: "for", argument: "" },
      ];
      mockLocation = { state: { debate: makeDebate({ rounds }), judgeScores: [] } };
      render(<DebateAnalysisPage />);
      expect(screen.getByText("(no transcript captured)")).toBeInTheDocument();
    });
  });

  // ── Scores tab ─────────────────────────────────────────────────────────────

  describe("Scores tab", () => {
    beforeEach(() => {
      mockLocation = { state: { debate: makeDebate(), judgeScores: [] } };
    });

    it("shows all participant usernames", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /Scores/i }));
      expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Bob/).length).toBeGreaterThan(0);
    });

    it("shows total scores for participants", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /Scores/i }));
      expect(screen.getByText("81")).toBeInTheDocument(); // Alice's score
      expect(screen.getByText("58")).toBeInTheDocument(); // Bob's score
    });

    it("shows WINNER badge for winner side", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /Scores/i }));
      expect(screen.getByText("WINNER")).toBeInTheDocument();
    });

    it("shows human judge avg and blended score when judgeScores present", () => {
      const judgeScores = [
        {
          judgeId: "j1", judgeUsername: "Judge1",
          scores: [
            { userId: "user-1", score: 85 },
            { userId: "user-2", score: 60 },
          ],
          submittedAt: new Date(),
        },
      ];
      mockLocation = { state: { debate: makeDebate(), judgeScores } };
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /Scores/i }));
      // Appears once per scored participant
      expect(screen.getAllByText(/Human judges avg/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText("→ blended").length).toBeGreaterThan(0);
    });
  });

  // ── AI Review tab ──────────────────────────────────────────────────────────

  describe("AI Review tab", () => {
    beforeEach(() => {
      mockLocation = { state: { debate: makeDebate(), judgeScores: [] } };
    });

    it("shows Match Summary section", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      // Rendered as "🤖 Match Summary"
      expect(screen.getByText(/Match Summary/)).toBeInTheDocument();
    });

    it("shows the result summary text", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      expect(screen.getByText("FOR side dominated with data-backed claims.")).toBeInTheDocument();
    });

    it("shows winning points section", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      expect(screen.getByText("Strong evidence cited")).toBeInTheDocument();
      expect(screen.getByText("Clear rebuttal structure")).toBeInTheDocument();
    });

    it("shows 'Why FOR Won' label when FOR wins", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      expect(screen.getByText(/Why FOR Won/i)).toBeInTheDocument();
    });

    it("shows AI Feedback for participants", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      expect(screen.getByText("Excellent clarity and strong evidence.")).toBeInTheDocument();
    });

    it("shows Strengths section", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      // Both participants have strengths sections — appears multiple times
      expect(screen.getAllByText(/Strengths/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Clear opening argument")).toBeInTheDocument();
    });

    it("shows To Improve section", () => {
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      // Both participants have improvement sections — appears multiple times
      expect(screen.getAllByText(/To Improve/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Speed delivery in round 2")).toBeInTheDocument();
    });

    it("shows 'Why AGAINST Won' when AGAINST wins", () => {
      mockLocation = {
        state: {
          debate: makeDebate({ result: makeResult({ winnerSide: "against" }) }),
          judgeScores: [],
        },
      };
      render(<DebateAnalysisPage />);
      fireEvent.click(screen.getByRole("button", { name: /AI Review/i }));
      expect(screen.getByText(/Why AGAINST Won/i)).toBeInTheDocument();
    });
  });
});
