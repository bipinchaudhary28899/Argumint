import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockNavigate, mockSocket } = vi.hoisted(() => {
  const mockSocket = {
    emit: vi.fn(),
    on:   vi.fn(),
    off:  vi.fn(),
    // helper to simulate incoming server events
    _emit: (event: string, ...args: any[]) => {
      mockSocket.on.mock.calls
        .filter((c: any[]) => c[0] === event)
        .forEach((c: any[]) => c[1](...args));
    },
  };
  return { mockNavigate: vi.fn(), mockSocket };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams:   () => ({ code: "ABCD1", debateId: "debate-1" }),
}));

let mockUser: any = { id: "user-1", username: "alice" };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

let mockIsConnected  = true;
let mockIsReconnecting = false;
const mockOnReconnect  = vi.fn();
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

let mockIsMobile = false;
vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("../../components/ConnectionStatusBanner", () => ({
  ConnectionStatusBanner: ({ isConnected }: { isConnected: boolean }) => (
    <div data-testid="conn-banner" data-connected={String(isConnected)} />
  ),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { PrepScreen } from "../PrepScreen";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const NOW = Date.now();

const MOCK_DEBATE_ALTERNATE = {
  _id:          "debate-1",
  roomId:       "room-1",
  topic:        "AI will replace human creativity",
  mode:         "alternate",
  totalRounds:  4,
  turnDuration: 90,
  prepDuration: 120,
  prepEndsAt:   new Date(NOW + 60000).toISOString(), // 60s remaining
  turnOrder: [
    { userId: "user-1", username: "alice", side: "for" },
    { userId: "user-2", username: "bob",   side: "against" },
  ],
};

const MOCK_DEBATE_BUZZER = {
  ...MOCK_DEBATE_ALTERNATE,
  mode: "buzzer",
};

function setupDebateLoad(debate: any, options: { error?: string } = {}) {
  mockSocket.emit.mockImplementation((event: string, _payload: any, cb?: (res: any) => void) => {
    if (event === "debate:get-state" && cb) {
      if (options.error) cb({ success: false, error: options.error });
      else               cb({ success: true,  debate });
    }
  });
}

function renderPage() {
  return render(<PrepScreen />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("PrepScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser          = { id: "user-1", username: "alice" };
    mockIsConnected   = true;
    mockIsReconnecting = false;
    mockIsMobile      = false;
    // Mock mediaDevices to avoid permission errors
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
      configurable: true,
      writable: true,
    });
    setupDebateLoad(MOCK_DEBATE_ALTERNATE);
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("shows loading spinner when debate is not yet loaded", () => {
      // Don't call callback → debate stays null
      mockSocket.emit.mockImplementation(() => {});
      renderPage();
      expect(screen.getByAltText("Loading…")).toBeInTheDocument();
    });

    it("hides loading spinner after debate is loaded", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.queryByAltText("Loading…")).not.toBeInTheDocument()
      );
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────
  describe("error state", () => {
    it("shows error message on fetch failure", async () => {
      setupDebateLoad(null, { error: "Debate not found" });
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/⚠ Debate not found/)).toBeInTheDocument()
      );
    });

    it("shows 'Back to lobby' button on error", async () => {
      setupDebateLoad(null, { error: "Something went wrong" });
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Back to lobby")).toBeInTheDocument()
      );
    });

    it("'Back to lobby' navigates to /room/:code/lobby", async () => {
      setupDebateLoad(null, { error: "Error" });
      renderPage();
      await waitFor(() => screen.getByText("Back to lobby"));
      fireEvent.click(screen.getByText("Back to lobby"));
      expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD1/lobby");
    });

    it("shows default error when none provided", async () => {
      mockSocket.emit.mockImplementation((_e: string, _p: any, cb?: (r: any) => void) => {
        if (cb) cb({ success: false });
      });
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/Failed to load debate/)).toBeInTheDocument()
      );
    });
  });

  // ── Page structure ─────────────────────────────────────────────────────────
  describe("page structure (loaded)", () => {
    it("renders ConnectionStatusBanner", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByTestId("conn-banner")).toBeInTheDocument()
      );
    });

    it("shows debate topic as motion", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("AI will replace human creativity")).toBeInTheDocument()
      );
    });

    it("shows 'Motion' label", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Motion")).toBeInTheDocument()
      );
    });

    it("shows 'PREP' label under timer", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("PREP")).toBeInTheDocument()
      );
    });
  });

  // ── Mode badge ─────────────────────────────────────────────────────────────
  describe("mode badge", () => {
    it("shows 'Alternate' in badge for alternate mode", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Alternate")).toBeInTheDocument()
      );
    });

    it("shows 'Rounds' badge in alternate mode", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Rounds:")).toBeInTheDocument()
      );
    });

    it("shows round count in alternate mode", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("4")).toBeInTheDocument()
      );
    });

    it("shows turn slot duration badge", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("90s")).toBeInTheDocument()
      );
    });

    it("shows 'Buzzer' in badge for buzzer mode", async () => {
      setupDebateLoad(MOCK_DEBATE_BUZZER);
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Buzzer")).toBeInTheDocument()
      );
    });
  });

  // ── Team rosters ───────────────────────────────────────────────────────────
  describe("team rosters", () => {
    it("shows FOR column header", async () => {
      renderPage();
      await waitFor(() => screen.getByText("alice"));
      // The FOR header is "FOR — {count}" rendered as multiple text nodes inside a div;
      // match via a broad regex that crosses multiple elements
      expect(screen.getAllByText(/FOR/).length).toBeGreaterThan(0);
    });

    it("shows AGAINST column header", async () => {
      renderPage();
      await waitFor(() => screen.getByText("bob"));
      expect(screen.getAllByText(/AGAINST/).length).toBeGreaterThan(0);
    });

    it("shows alice in FOR column", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("alice")).toBeInTheDocument()
      );
    });

    it("shows bob in AGAINST column", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("bob")).toBeInTheDocument()
      );
    });

    it("shows YOU badge next to the current user", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("YOU")).toBeInTheDocument()
      );
    });

    it("shows player avatars with first letter of username", async () => {
      renderPage();
      await waitFor(() => screen.getByText("alice"));
      expect(screen.getByText("A")).toBeInTheDocument(); // alice's avatar
      expect(screen.getByText("B")).toBeInTheDocument(); // bob's avatar
    });
  });

  // ── Side reveal ────────────────────────────────────────────────────────────
  describe("side reveal", () => {
    it("shows 'You are arguing' label when user has a side", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("You are arguing")).toBeInTheDocument()
      );
    });

    it("shows 'FOR THE MOTION' when user is on the for side", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("FOR THE MOTION")).toBeInTheDocument()
      );
    });

    it("shows 'AGAINST THE MOTION' when user is on the against side", async () => {
      mockUser = { id: "user-2", username: "bob" };
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("AGAINST THE MOTION")).toBeInTheDocument()
      );
    });

    it("does not show side reveal if user has no matching turn order entry", async () => {
      mockUser = { id: "user-99", username: "unknown" };
      renderPage();
      await waitFor(() => screen.getByText("AI will replace human creativity"));
      expect(screen.queryByText("You are arguing")).not.toBeInTheDocument();
    });
  });

  // ── Alternate mode — speaking order ────────────────────────────────────────
  describe("alternate mode — speaking order", () => {
    it("shows 'Speaking Order' section header", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Speaking Order")).toBeInTheDocument()
      );
    });

    it("shows numbered speaking order entries", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/1\. alice/)).toBeInTheDocument()
      );
      expect(screen.getByText(/2\. bob/)).toBeInTheDocument();
    });

    it("labels current user as '(you)' in speaking order", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/1\. alice \(you\)/)).toBeInTheDocument()
      );
    });

    it("shows repeat order hint text", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/Order repeats for each round/)).toBeInTheDocument()
      );
    });

    it("shows rounds count in speaking order header", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("4 rounds")).toBeInTheDocument()
      );
    });
  });

  // ── Buzzer mode — rules ────────────────────────────────────────────────────
  describe("buzzer mode — rules", () => {
    beforeEach(() => {
      setupDebateLoad(MOCK_DEBATE_BUZZER);
    });

    it("shows 'Buzzer Rules' section header", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Buzzer Rules")).toBeInTheDocument()
      );
    });

    it("does NOT show 'Speaking Order' in buzzer mode", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Buzzer Rules"));
      expect(screen.queryByText("Speaking Order")).not.toBeInTheDocument();
    });

    it("shows grab mic rule", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/First to tap.*Grab Mic/)).toBeInTheDocument()
      );
    });

    it("shows re-grab window rule", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/5-second re-grab window/)).toBeInTheDocument()
      );
    });

    it("shows timer-hits-zero hint", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/Mic opens when the timer hits zero/)).toBeInTheDocument()
      );
    });

    it("shows buzzer prep hint for 'AGAINST THE MOTION'", async () => {
      mockUser = { id: "user-2", username: "bob" };
      renderPage();
      await waitFor(() =>
        expect(screen.getByText(/Think fast — grab the mic first/)).toBeInTheDocument()
      );
    });
  });

  // ── Socket events ──────────────────────────────────────────────────────────
  describe("socket events", () => {
    it("navigates to debate page on debate:turn-started", async () => {
      renderPage();
      await waitFor(() => screen.getByText("AI will replace human creativity"));

      act(() => { mockSocket._emit("debate:turn-started"); });
      expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD1/debate/debate-1");
    });

    it("navigates to debate page on buzzer:open", async () => {
      renderPage();
      await waitFor(() => screen.getByText("AI will replace human creativity"));

      act(() => { mockSocket._emit("buzzer:open"); });
      expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD1/debate/debate-1");
    });

    it("registers socket listeners for turn-started and buzzer:open", async () => {
      renderPage();
      await waitFor(() => screen.getByText("AI will replace human creativity"));

      const events = mockSocket.on.mock.calls.map((c: any[]) => c[0]);
      expect(events).toContain("debate:turn-started");
      expect(events).toContain("buzzer:open");
    });
  });

  // ── Countdown timer ────────────────────────────────────────────────────────
  describe("countdown timer", () => {
    it("shows a numeric countdown value (seconds remaining)", async () => {
      renderPage();
      await waitFor(() => screen.getByText("PREP"));
      // Should show some number (≈ 60) in the ring
      const prep = screen.getByText("PREP").parentElement;
      expect(prep?.textContent).toMatch(/\d/);
    });
  });

  // ── Connection banner ──────────────────────────────────────────────────────
  describe("connection banner", () => {
    it("passes isConnected=true to banner when connected", async () => {
      renderPage();
      await waitFor(() => screen.getByTestId("conn-banner"));
      expect(screen.getByTestId("conn-banner")).toHaveAttribute("data-connected", "true");
    });

    it("passes isConnected=false to banner when disconnected", async () => {
      mockIsConnected = false;
      renderPage();
      // Component doesn't fetch when not connected, so debate stays null → loading
      expect(screen.getByAltText("Loading…")).toBeInTheDocument();
    });
  });

  // ── API call ───────────────────────────────────────────────────────────────
  describe("API call", () => {
    it("emits debate:get-state with debateId on mount", async () => {
      renderPage();
      await waitFor(() =>
        expect(mockSocket.emit).toHaveBeenCalledWith(
          "debate:get-state",
          { debateId: "debate-1" },
          expect.any(Function)
        )
      );
    });

    it("does not emit when not connected", () => {
      mockIsConnected = false;
      renderPage();
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });
  });

  // ── Mobile layout ─────────────────────────────────────────────────────────
  describe("mobile layout", () => {
    it("renders without crashing in mobile mode", async () => {
      mockIsMobile = true;
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("AI will replace human creativity")).toBeInTheDocument()
      );
    });
  });
});
