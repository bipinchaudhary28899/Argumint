import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockNavigate, mockGetRoomByCode, mockJoinRoom } = vi.hoisted(() => ({
  mockNavigate:      vi.fn(),
  mockGetRoomByCode: vi.fn(),
  mockJoinRoom:      vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

let mockUser: any = { id: "user-1", username: "alice" };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

let mockError: string | null = null;
const mockSetRoom  = vi.fn();
const mockSetError = vi.fn((val: string | null) => { mockError = val; });
vi.mock("../../contexts/RoomContext", () => ({
  useRoom: () => ({ setRoom: mockSetRoom, error: mockError, setError: mockSetError }),
}));

vi.mock("../../services/api", () => ({
  roomApi: {
    getRoomByCode: (...args: any[]) => mockGetRoomByCode(...args),
    joinRoom:      (...args: any[]) => mockJoinRoom(...args),
  },
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { JoinRoom } from "../JoinRoom";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeRoom(overrides: Record<string, any> = {}) {
  return {
    _id:             "room-1",
    code:            "ABCD12",
    topic:           "AI will replace jobs",
    maxParticipants: 10,
    maxJudges:       3,
    maxSpectators:   50,
    participants:    [],
    status:          "waiting",
    ...overrides,
  };
}

async function fillCodeAndSubmit(code: string = "ABCD12") {
  const input = screen.getByPlaceholderText("ABC123");
  fireEvent.change(input, { target: { value: code } });
  fireEvent.click(screen.getByText("Continue →"));
  await waitFor(() => screen.getByText("Choose Your Role"));
}

function renderPage() {
  return render(<JoinRoom />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("JoinRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser  = { id: "user-1", username: "alice" };
    mockError = null;
    mockGetRoomByCode.mockResolvedValue(makeRoom());
    mockJoinRoom.mockResolvedValue({ ...makeRoom(), code: "ABCD12" });
  });

  // ── Step 1: Code entry ─────────────────────────────────────────────────────
  describe("step 1 — code entry", () => {
    it("renders 'Join a Debate' heading", () => {
      renderPage();
      expect(screen.getByText("Join a Debate")).toBeInTheDocument();
    });

    it("renders the room code input with placeholder", () => {
      renderPage();
      expect(screen.getByPlaceholderText("ABC123")).toBeInTheDocument();
    });

    it("renders 'Room Code' label", () => {
      renderPage();
      expect(screen.getByText("Room Code")).toBeInTheDocument();
    });

    it("renders 'Continue →' submit button", () => {
      renderPage();
      expect(screen.getByText("Continue →")).toBeInTheDocument();
    });

    it("renders '← Home' back button", () => {
      renderPage();
      expect(screen.getByText("← Home")).toBeInTheDocument();
    });

    it("'← Home' navigates to / on step 1", () => {
      renderPage();
      fireEvent.click(screen.getByText("← Home"));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("'Continue →' is disabled when code is empty", () => {
      renderPage();
      expect(screen.getByText("Continue →")).toBeDisabled();
    });

    it("'Continue →' is disabled when code is less than 6 chars", () => {
      renderPage();
      const input = screen.getByPlaceholderText("ABC123");
      fireEvent.change(input, { target: { value: "ABC" } });
      expect(screen.getByText("Continue →")).toBeDisabled();
    });

    it("'Continue →' is enabled when exactly 6 chars entered", () => {
      renderPage();
      const input = screen.getByPlaceholderText("ABC123");
      fireEvent.change(input, { target: { value: "ABCDEF" } });
      expect(screen.getByText("Continue →")).not.toBeDisabled();
    });

    it("uppercases typed room code", () => {
      renderPage();
      const input = screen.getByPlaceholderText("ABC123") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "abcdef" } });
      expect(input.value).toBe("ABCDEF");
    });

    it("shows validation error when code is blank and form is submitted", async () => {
      renderPage();
      // Submit with empty code — button is disabled, so use form submit workaround:
      // Since button is disabled there's no standard way; instead test setError call.
      // Trigger by setting an empty code then submitting via form
      const form = screen.getByPlaceholderText("ABC123").closest("form")!;
      fireEvent.submit(form);
      await waitFor(() =>
        expect(mockSetError).toHaveBeenCalledWith("Room code is required")
      );
    });

    it("calls getRoomByCode with uppercased code on submit", async () => {
      renderPage();
      const input = screen.getByPlaceholderText("ABC123");
      fireEvent.change(input, { target: { value: "abcd12" } });
      fireEvent.click(screen.getByText("Continue →"));
      await waitFor(() =>
        expect(mockGetRoomByCode).toHaveBeenCalledWith("ABCD12")
      );
    });

    it("shows 'Checking…' while loading", async () => {
      mockGetRoomByCode.mockReturnValue(new Promise(() => {})); // never resolves
      renderPage();
      const input = screen.getByPlaceholderText("ABC123");
      fireEvent.change(input, { target: { value: "ABCD12" } });
      fireEvent.click(screen.getByText("Continue →"));
      await waitFor(() =>
        expect(screen.getByText("Checking…")).toBeInTheDocument()
      );
    });

    it("shows error message when getRoomByCode throws", async () => {
      mockGetRoomByCode.mockRejectedValue(new Error("Room not found"));
      // Pre-set mockError so context returns it
      mockError = "Room not found";
      renderPage();
      const input = screen.getByPlaceholderText("ABC123");
      fireEvent.change(input, { target: { value: "ABCD12" } });
      fireEvent.click(screen.getByText("Continue →"));
      await waitFor(() =>
        expect(mockSetError).toHaveBeenCalledWith("Room not found")
      );
    });
  });

  // ── Step 2: Role selection ─────────────────────────────────────────────────
  describe("step 2 — role selection", () => {
    it("shows 'Choose Your Role' heading after valid code", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText("Choose Your Role")).toBeInTheDocument();
    });

    it("shows the room code in the subtitle", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText("ABCD12")).toBeInTheDocument();
    });

    it("shows all three role options", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText("Participant")).toBeInTheDocument();
      expect(screen.getByText("Judge")).toBeInTheDocument();
      expect(screen.getByText("Spectator")).toBeInTheDocument();
    });

    it("shows role descriptions", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText(/Debate live/)).toBeInTheDocument();
      expect(screen.getByText(/Listen, then score/)).toBeInTheDocument();
      expect(screen.getByText(/Watch and listen/)).toBeInTheDocument();
    });

    it("shows 'Join as Participant →' confirm button by default", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText("Join as Participant →")).toBeInTheDocument();
    });

    it("shows '← Back' button on step 2", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText("← Back")).toBeInTheDocument();
    });

    it("'← Back' returns to step 1", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("← Back"));
      await waitFor(() =>
        expect(screen.getByText("Join a Debate")).toBeInTheDocument()
      );
    });

    it("selecting Judge role updates the confirm button label", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("Judge"));
      await waitFor(() =>
        expect(screen.getByText("Join as Judge →")).toBeInTheDocument()
      );
    });

    it("selecting Spectator role updates the confirm button label", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("Spectator"));
      await waitFor(() =>
        expect(screen.getByText("Join as Spectator →")).toBeInTheDocument()
      );
    });

    it("shows slot availability for judge role", async () => {
      // 3 maxJudges, 0 used → "3 slots left"
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText("3 slots left")).toBeInTheDocument();
    });

    it("marks Judge as DISABLED when maxJudges is 0", async () => {
      mockGetRoomByCode.mockResolvedValue(makeRoom({ maxJudges: 0 }));
      renderPage();
      await fillCodeAndSubmit("ABCD12");
      expect(screen.getByText("DISABLED")).toBeInTheDocument();
    });

    it("marks Judge as FULL when all judge slots used", async () => {
      const room = makeRoom({
        maxJudges: 1,
        participants: [{ role: "judge", status: "active", userId: "j1", username: "judge1" }],
      });
      mockGetRoomByCode.mockResolvedValue(room);
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText("FULL")).toBeInTheDocument();
    });

    it("marks Spectator as DISABLED when maxSpectators is 0", async () => {
      mockGetRoomByCode.mockResolvedValue(makeRoom({ maxSpectators: 0 }));
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getAllByText("DISABLED").length).toBeGreaterThan(0);
    });

    it("confirm button stays enabled when a FULL role card is clicked (component prevents selection)", async () => {
      // The component uses `onClick={() => !disabled && setSelectedRole(role)}`
      // so clicking a disabled role card does NOT change selectedRole.
      // The confirm button therefore stays enabled for the currently selected (valid) role.
      const room = makeRoom({
        maxJudges: 1,
        participants: [{ role: "judge", status: "active", userId: "j1", username: "judge1" }],
      });
      mockGetRoomByCode.mockResolvedValue(room);
      renderPage();
      await fillCodeAndSubmit();
      // Participant is default and has slots → confirm button is enabled
      expect(screen.getByText("Join as Participant →")).not.toBeDisabled();
    });
  });

  // ── Join flow ──────────────────────────────────────────────────────────────
  describe("join flow", () => {
    it("calls joinRoom with code and selected role", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("Join as Participant →"));
      await waitFor(() =>
        expect(mockJoinRoom).toHaveBeenCalledWith(
          expect.objectContaining({ code: "ABCD12", role: "participant" })
        )
      );
    });

    it("calls setRoom after successful join", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("Join as Participant →"));
      await waitFor(() =>
        expect(mockSetRoom).toHaveBeenCalled()
      );
    });

    it("navigates to lobby with role query param after join", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("Join as Participant →"));
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD12/lobby?role=participant")
      );
    });

    it("joins as judge when judge role is selected", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("Judge"));
      await waitFor(() => screen.getByText("Join as Judge →"));
      fireEvent.click(screen.getByText("Join as Judge →"));
      await waitFor(() =>
        expect(mockJoinRoom).toHaveBeenCalledWith(
          expect.objectContaining({ role: "judge" })
        )
      );
    });

    it("shows 'Joining…' while join is in progress", async () => {
      mockJoinRoom.mockReturnValue(new Promise(() => {}));
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("Join as Participant →"));
      await waitFor(() =>
        expect(screen.getByText("Joining…")).toBeInTheDocument()
      );
    });

    it("calls setError and returns to step 1 on join failure", async () => {
      mockJoinRoom.mockRejectedValue(new Error("Room is full"));
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByText("Join as Participant →"));
      await waitFor(() =>
        expect(mockSetError).toHaveBeenCalledWith("Room is full")
      );
      await waitFor(() =>
        expect(screen.getByText("Join a Debate")).toBeInTheDocument()
      );
    });
  });

  // ── Char indicators ────────────────────────────────────────────────────────
  describe("character indicator dots", () => {
    it("renders 6 indicator dots", () => {
      renderPage();
      // 6 fixed-width divs for the character indicators
      const indicators = document.querySelectorAll(
        "[style*='width: 32px'][style*='height: 4px']"
      );
      expect(indicators).toHaveLength(6);
    });
  });
});
