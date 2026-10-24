import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockNavigate, mockGetRoomByCode, mockJoinRoom } = vi.hoisted(() => ({
  mockNavigate:      vi.fn(),
  mockGetRoomByCode: vi.fn(),
  mockJoinRoom:      vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
let mockLocationState: any = null;
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/join-room", search: "", hash: "", state: mockLocationState, key: "k" }),
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

function codeInput() {
  return screen.getByLabelText("Room code") as HTMLInputElement;
}

/** The code form's submit button (the shell's sidebar also has a "Join room" nav button). */
function joinBtn() {
  return within(screen.getByRole("form", { name: /Join a room/i })).getByRole("button", { name: /Join room|Checking…/ });
}

function roleRadio(name: string) {
  return screen.getByRole("radio", { name: new RegExp(`^${name}`) });
}

async function fillCodeAndSubmit(code: string = "ABCD12") {
  fireEvent.change(codeInput(), { target: { value: code } });
  fireEvent.click(joinBtn());
  await waitFor(() => screen.getByRole("heading", { name: "Choose your role" }));
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
    mockLocationState = null;
    mockGetRoomByCode.mockResolvedValue(makeRoom());
    mockJoinRoom.mockResolvedValue({ ...makeRoom(), code: "ABCD12" });
  });

  // ── Step 1: Code entry ─────────────────────────────────────────────────────
  describe("step 1 — code entry", () => {
    it("renders 'Join a room' heading", () => {
      renderPage();
      expect(screen.getByRole("heading", { name: "Join a room" })).toBeInTheDocument();
    });

    it("renders the labelled room code input", () => {
      renderPage();
      expect(codeInput()).toBeInTheDocument();
      expect(codeInput()).toHaveAccessibleDescription(/Letters and numbers/);
    });

    it("renders 6 code boxes", () => {
      const { container } = renderPage();
      expect(container.querySelectorAll("[data-code-box]")).toHaveLength(6);
    });

    it("shows typed characters in the boxes", () => {
      const { container } = renderPage();
      fireEvent.change(codeInput(), { target: { value: "k7q" } });
      const boxes = Array.from(container.querySelectorAll("[data-code-box]")).map(b => b.textContent);
      expect(boxes).toEqual(["K", "7", "Q", "", "", ""]);
    });

    it("renders 'Join room' submit button", () => {
      renderPage();
      expect(joinBtn()).toHaveAttribute("type", "submit");
    });

    it("renders back-to-home button", () => {
      renderPage();
      expect(screen.getByRole("button", { name: "Back to home" })).toBeInTheDocument();
    });

    it("back button navigates to / on step 1", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Back to home" }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("'Host your own room' navigates to /create-room", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Host your own room" }));
      expect(mockNavigate).toHaveBeenCalledWith("/create-room");
    });

    it("renders the three help tiles", () => {
      renderPage();
      expect(screen.getByText(/check your mic/)).toBeInTheDocument();
      expect(screen.getByText(/Ready up/)).toBeInTheDocument();
      expect(screen.getByText(/FOR or AGAINST at random/)).toBeInTheDocument();
    });

    it("Join button is disabled when code is empty", () => {
      renderPage();
      expect(joinBtn()).toBeDisabled();
    });

    it("Join button is disabled when code is less than 6 chars", () => {
      renderPage();
      fireEvent.change(codeInput(), { target: { value: "ABC" } });
      expect(joinBtn()).toBeDisabled();
    });

    it("Join button is enabled when exactly 6 chars entered", () => {
      renderPage();
      fireEvent.change(codeInput(), { target: { value: "ABCDEF" } });
      expect(joinBtn()).not.toBeDisabled();
    });

    it("uppercases typed room code", () => {
      renderPage();
      fireEvent.change(codeInput(), { target: { value: "abcdef" } });
      expect(codeInput().value).toBe("ABCDEF");
    });

    it("cleans a pasted code (spaces/dashes stripped, capped at 6)", () => {
      renderPage();
      fireEvent.change(codeInput(), { target: { value: " abc-123xyz " } });
      expect(codeInput().value).toBe("ABC123");
    });

    it("Paste button reads the clipboard into the code", async () => {
      const readText = vi.fn().mockResolvedValue("  xy9-z12 ");
      Object.defineProperty(navigator, "clipboard", { value: { readText }, configurable: true });
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Paste" }));
      await waitFor(() => expect(codeInput().value).toBe("XY9Z12"));
      expect(joinBtn()).not.toBeDisabled();
    });

    it("prefills the code from router state", () => {
      mockLocationState = { code: "qw12er" };
      renderPage();
      expect(codeInput().value).toBe("QW12ER");
      expect(joinBtn()).not.toBeDisabled();
    });

    it("shows validation error when code is blank and form is submitted", async () => {
      renderPage();
      fireEvent.submit(screen.getByRole("form", { name: /Join a room/i }));
      await waitFor(() =>
        expect(mockSetError).toHaveBeenCalledWith("Room code is required")
      );
    });

    it("calls getRoomByCode with uppercased code on submit", async () => {
      renderPage();
      fireEvent.change(codeInput(), { target: { value: "abcd12" } });
      fireEvent.click(joinBtn());
      await waitFor(() =>
        expect(mockGetRoomByCode).toHaveBeenCalledWith("ABCD12")
      );
    });

    it("shows 'Checking…' while loading", async () => {
      mockGetRoomByCode.mockReturnValue(new Promise(() => {})); // never resolves
      renderPage();
      fireEvent.change(codeInput(), { target: { value: "ABCD12" } });
      fireEvent.click(joinBtn());
      await waitFor(() =>
        expect(screen.getByText("Checking…")).toBeInTheDocument()
      );
    });

    it("shows error message when getRoomByCode throws", async () => {
      mockGetRoomByCode.mockRejectedValue(new Error("Room not found"));
      // Pre-set mockError so context returns it
      mockError = "Room not found";
      renderPage();
      expect(screen.getByRole("alert")).toHaveTextContent("Room not found");
      fireEvent.change(codeInput(), { target: { value: "ABCD12" } });
      fireEvent.click(joinBtn());
      await waitFor(() =>
        expect(mockSetError).toHaveBeenCalledWith("Room not found")
      );
    });
  });

  // ── Step 2: Role selection ─────────────────────────────────────────────────
  describe("step 2 — role selection", () => {
    it("shows 'Choose your role' heading after valid code", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByRole("heading", { name: "Choose your role" })).toBeInTheDocument();
    });

    it("shows the room code in the subtitle", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText("ABCD12")).toBeInTheDocument();
    });

    it("shows all three role options", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(roleRadio("Participant")).toBeInTheDocument();
      expect(roleRadio("Judge")).toBeInTheDocument();
      expect(roleRadio("Spectator")).toBeInTheDocument();
    });

    it("shows role descriptions", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByText(/Debate live/)).toBeInTheDocument();
      expect(screen.getByText(/Listen, then score/)).toBeInTheDocument();
      expect(screen.getByText(/Watch and listen/)).toBeInTheDocument();
    });

    it("Participant is selected and the confirm button reads 'Join as Participant' by default", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(roleRadio("Participant")).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("button", { name: "Join as Participant" })).toBeInTheDocument();
    });

    it("shows a Back button on step 2", async () => {
      renderPage();
      await fillCodeAndSubmit();
      expect(screen.getByRole("button", { name: "Back to room code" })).toBeInTheDocument();
    });

    it("Back returns to step 1 with the code kept", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByRole("button", { name: "Back to room code" }));
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: "Join a room" })).toBeInTheDocument()
      );
      expect(codeInput().value).toBe("ABCD12");
    });

    it("selecting Judge role updates the confirm button label", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(roleRadio("Judge"));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Join as Judge" })).toBeInTheDocument()
      );
      expect(roleRadio("Judge")).toHaveAttribute("aria-checked", "true");
    });

    it("selecting Spectator role updates the confirm button label", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(roleRadio("Spectator"));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Join as Spectator" })).toBeInTheDocument()
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
      expect(roleRadio("Judge")).toBeDisabled();
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
      fireEvent.click(roleRadio("Judge"));
      // Participant is default and has slots → confirm button is enabled
      expect(screen.getByRole("button", { name: "Join as Participant" })).not.toBeDisabled();
    });
  });

  // ── Join flow ──────────────────────────────────────────────────────────────
  describe("join flow", () => {
    it("calls joinRoom with code and selected role", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByRole("button", { name: "Join as Participant" }));
      await waitFor(() =>
        expect(mockJoinRoom).toHaveBeenCalledWith(
          expect.objectContaining({ code: "ABCD12", role: "participant" })
        )
      );
    });

    it("calls setRoom after successful join", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByRole("button", { name: "Join as Participant" }));
      await waitFor(() =>
        expect(mockSetRoom).toHaveBeenCalled()
      );
    });

    it("navigates to lobby with role query param after join", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByRole("button", { name: "Join as Participant" }));
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD12/lobby?role=participant")
      );
    });

    it("joins as judge when judge role is selected", async () => {
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(roleRadio("Judge"));
      await waitFor(() => screen.getByRole("button", { name: "Join as Judge" }));
      fireEvent.click(screen.getByRole("button", { name: "Join as Judge" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Join as Participant" }));
      await waitFor(() =>
        expect(screen.getByText("Joining…")).toBeInTheDocument()
      );
    });

    it("calls setError and returns to step 1 on join failure", async () => {
      mockJoinRoom.mockRejectedValue(new Error("Room is full"));
      renderPage();
      await fillCodeAndSubmit();
      fireEvent.click(screen.getByRole("button", { name: "Join as Participant" }));
      await waitFor(() =>
        expect(mockSetError).toHaveBeenCalledWith("Room is full")
      );
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: "Join a room" })).toBeInTheDocument()
      );
    });
  });
});
