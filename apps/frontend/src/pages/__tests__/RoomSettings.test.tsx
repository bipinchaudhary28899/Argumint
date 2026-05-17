import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockNavigate, mockGetRoomByCode, mockUpdateRoomSettings } = vi.hoisted(() => ({
  mockNavigate:           vi.fn(),
  mockGetRoomByCode:      vi.fn(),
  mockUpdateRoomSettings: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams:   () => ({ code: "ABCD1" }),
}));

let mockUser: any = { username: "alice", email: "alice@example.com" };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

let mockRoom: any = null;
const mockSetRoom  = vi.fn();
const mockSetError = vi.fn();
vi.mock("../../contexts/RoomContext", () => ({
  useRoom: () => ({ room: mockRoom, setRoom: mockSetRoom, setError: mockSetError }),
}));

vi.mock("../../services/api", () => ({
  roomApi: {
    getRoomByCode:      (...args: any[]) => mockGetRoomByCode(...args),
    updateRoomSettings: (...args: any[]) => mockUpdateRoomSettings(...args),
  },
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { RoomSettings } from "../RoomSettings";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeRoom(overrides: Record<string, any> = {}) {
  return {
    _id:              "room-1",
    code:             "ABCD1",
    topic:            "AI is the future",
    description:      "A debate about artificial intelligence",
    debateMode:       "buzzer",
    maxParticipants:  10,
    votingDuration:   30,
    prepDuration:     120,
    turnDuration:     300,
    creatorId:        "alice",        // matches mockUser.username
    creatorUsername:  "alice",
    participants:     [{ username: "alice" }, { username: "bob" }],
    status:           "waiting",
    ...overrides,
  };
}

function renderPage() {
  return render(<RoomSettings />);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("RoomSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { username: "alice", email: "alice@example.com" };
    // Pre-populate mockRoom so the context returns data immediately.
    // The component also calls getRoomByCode on mount (to set isCreator + form data),
    // but the rendered UI depends on context.room. Both must be set.
    mockRoom = makeRoom();
    // Default: resolves with a room where alice is creator
    mockGetRoomByCode.mockResolvedValue(makeRoom());
    // Mock clipboard
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
    // Mock alert
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("shows loading spinner before data resolves when context room is null", async () => {
      mockRoom = null; // no cached room in context
      mockGetRoomByCode.mockReturnValue(new Promise(() => {})); // never resolves
      renderPage();
      // Loading state renders an img with alt "Loading…"
      expect(screen.getByAltText("Loading…")).toBeInTheDocument();
    });

    it("loading spinner disappears after fetch resolves", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.queryByAltText("Loading…")).not.toBeInTheDocument()
      );
    });
  });

  // ── Room not found ─────────────────────────────────────────────────────────
  describe("room not found", () => {
    beforeEach(() => {
      // Context has no room; fetch fails too
      mockRoom = null;
    });

    it("shows 'Room not found' when context is null and API throws", async () => {
      mockGetRoomByCode.mockRejectedValue(new Error("Not found"));
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Room not found")).toBeInTheDocument()
      );
    });

    it("shows 'Back to Home' button when room not found", async () => {
      mockGetRoomByCode.mockRejectedValue(new Error("Not found"));
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Back to Home")).toBeInTheDocument()
      );
    });

    it("'Back to Home' navigates to /", async () => {
      mockGetRoomByCode.mockRejectedValue(new Error("Not found"));
      renderPage();
      await waitFor(() => screen.getByText("Back to Home"));
      fireEvent.click(screen.getByText("Back to Home"));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("calls setError on API failure", async () => {
      mockGetRoomByCode.mockRejectedValue(new Error("Server error"));
      renderPage();
      await waitFor(() =>
        expect(mockSetError).toHaveBeenCalledWith("Server error")
      );
    });
  });

  // ── Page structure (loaded) ────────────────────────────────────────────────
  describe("page structure", () => {
    it("renders 'Room Settings' heading", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Room Settings")).toBeInTheDocument()
      );
    });

    it("renders 'Room Code' panel heading", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Room Code")).toBeInTheDocument()
      );
    });

    it("displays the room code in the card", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("ABCD1")).toBeInTheDocument()
      );
    });

    it("shows creator username in sidebar", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText("alice").length).toBeGreaterThan(0)
      );
    });

    it("shows participant count (current/max)", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("2/10")).toBeInTheDocument()
      );
    });

    it("shows room status", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("waiting")).toBeInTheDocument()
      );
    });

    it("renders 'Argumint' nav link", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Argumint")).toBeInTheDocument()
      );
    });

    it("shows user email in nav bar", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("alice@example.com")).toBeInTheDocument()
      );
    });
  });

  // ── Form fields ────────────────────────────────────────────────────────────
  describe("form fields", () => {
    it("populates topic input with room topic", async () => {
      renderPage();
      await waitFor(() => {
        const input = screen.getByLabelText("Debate Topic") as HTMLInputElement;
        expect(input.value).toBe("AI is the future");
      });
    });

    it("populates description textarea with room description", async () => {
      renderPage();
      await waitFor(() => {
        const ta = screen.getByLabelText("Description") as HTMLTextAreaElement;
        expect(ta.value).toBe("A debate about artificial intelligence");
      });
    });

    it("shows debate mode select", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByLabelText("Debate Mode")).toBeInTheDocument()
      );
    });

    it("shows 'Voting Duration (sec)' label", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Voting Duration (sec)")).toBeInTheDocument()
      );
    });

    it("shows 'Prep Duration (sec)' label", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Prep Duration (sec)")).toBeInTheDocument()
      );
    });

    it("shows 'Turn Duration (sec)' label", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Turn Duration (sec)")).toBeInTheDocument()
      );
    });

    it("updates topic input on change", async () => {
      renderPage();
      await waitFor(() => screen.getByLabelText("Debate Topic"));
      const input = screen.getByLabelText("Debate Topic") as HTMLInputElement;
      fireEvent.change(input, { target: { name: "topic", value: "New topic", type: "text" } });
      expect(input.value).toBe("New topic");
    });

    it("updates description textarea on change", async () => {
      renderPage();
      await waitFor(() => screen.getByLabelText("Description"));
      const ta = screen.getByLabelText("Description") as HTMLTextAreaElement;
      // Note: textarea has no writable 'type' property — only pass name + value
      fireEvent.change(ta, { target: { name: "description", value: "Updated desc" } });
      expect(ta.value).toBe("Updated desc");
    });
  });

  // ── Creator controls ──────────────────────────────────────────────────────
  describe("creator controls", () => {
    it("shows 'Save Settings' button for creator", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Save Settings")).toBeInTheDocument()
      );
    });

    it("shows 'Start Room' button for creator", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Start Room")).toBeInTheDocument()
      );
    });

    it("shows 'Cancel' button for creator", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Cancel")).toBeInTheDocument()
      );
    });

    it("shows 'Go to Lobby' sidebar button for creator with 2+ participants", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Go to Lobby")).toBeInTheDocument()
      );
    });

    it("'Go to Lobby' button is enabled when 2 participants", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Go to Lobby"));
      const btn = screen.getByText("Go to Lobby");
      expect(btn).not.toBeDisabled();
    });

    it("'Go to Lobby' button is disabled with fewer than 2 participants", async () => {
      const smallRoom = makeRoom({ participants: [{ username: "alice" }] });
      mockRoom = smallRoom; // context room drives the disabled prop
      mockGetRoomByCode.mockResolvedValue(smallRoom);
      renderPage();
      await waitFor(() => screen.getByText("Go to Lobby"));
      const btn = screen.getByText("Go to Lobby");
      expect(btn).toBeDisabled();
    });

    it("does NOT show 'Read-only mode' label for creator", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Room Settings"));
      expect(screen.queryByText("Read-only mode")).not.toBeInTheDocument();
    });
  });

  // ── Non-creator view ──────────────────────────────────────────────────────
  describe("non-creator view", () => {
    beforeEach(() => {
      mockUser = { username: "bob", email: "bob@example.com" };
      // room.creatorId = "alice" ≠ "bob" → non-creator
      const bobRoom = makeRoom();
      mockRoom = bobRoom;
      mockGetRoomByCode.mockResolvedValue(bobRoom);
    });

    it("shows 'Read-only mode' label for non-creator", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Read-only mode")).toBeInTheDocument()
      );
    });

    it("does NOT show 'Save Settings' button for non-creator", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Room Settings"));
      expect(screen.queryByText("Save Settings")).not.toBeInTheDocument();
    });

    it("does NOT show 'Go to Lobby' button for non-creator", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Room Settings"));
      expect(screen.queryByText("Go to Lobby")).not.toBeInTheDocument();
    });

    it("form inputs are disabled for non-creator", async () => {
      renderPage();
      await waitFor(() => screen.getByLabelText("Debate Topic"));
      const topicInput = screen.getByLabelText("Debate Topic") as HTMLInputElement;
      expect(topicInput).toBeDisabled();
    });
  });

  // ── Save settings ─────────────────────────────────────────────────────────
  describe("save settings", () => {
    it("calls updateRoomSettings on form submit", async () => {
      const updatedRoom = makeRoom({ topic: "Updated topic" });
      mockUpdateRoomSettings.mockResolvedValue(updatedRoom);
      renderPage();
      await waitFor(() => screen.getByText("Save Settings"));

      fireEvent.click(screen.getByText("Save Settings"));
      await waitFor(() =>
        expect(mockUpdateRoomSettings).toHaveBeenCalledWith("room-1", expect.any(Object))
      );
    });

    it("calls setRoom with updated room after save", async () => {
      const updatedRoom = makeRoom({ topic: "New topic" });
      mockUpdateRoomSettings.mockResolvedValue(updatedRoom);
      renderPage();
      await waitFor(() => screen.getByText("Save Settings"));

      fireEvent.click(screen.getByText("Save Settings"));
      await waitFor(() =>
        expect(mockSetRoom).toHaveBeenCalledWith(updatedRoom)
      );
    });

    it("shows 'Saving...' while save is in progress", async () => {
      mockUpdateRoomSettings.mockReturnValue(new Promise(() => {})); // never resolves
      renderPage();
      await waitFor(() => screen.getByText("Save Settings"));

      fireEvent.click(screen.getByText("Save Settings"));
      await waitFor(() =>
        expect(screen.getByText("Saving...")).toBeInTheDocument()
      );
    });

    it("shows alert on successful save", async () => {
      mockUpdateRoomSettings.mockResolvedValue(makeRoom());
      renderPage();
      await waitFor(() => screen.getByText("Save Settings"));

      fireEvent.click(screen.getByText("Save Settings"));
      await waitFor(() =>
        expect(window.alert).toHaveBeenCalledWith("Room settings updated successfully!")
      );
    });

    it("calls setError on save failure", async () => {
      mockUpdateRoomSettings.mockRejectedValue(new Error("Save failed"));
      renderPage();
      await waitFor(() => screen.getByText("Save Settings"));

      fireEvent.click(screen.getByText("Save Settings"));
      await waitFor(() =>
        expect(mockSetError).toHaveBeenCalledWith("Save failed")
      );
    });
  });

  // ── Copy code ─────────────────────────────────────────────────────────────
  describe("copy room code", () => {
    it("shows 'Copy Code' button initially", async () => {
      renderPage();
      await waitFor(() =>
        expect(screen.getByText("Copy Code")).toBeInTheDocument()
      );
    });

    it("copies room code to clipboard when clicked", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Copy Code"));
      fireEvent.click(screen.getByText("Copy Code"));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABCD1");
    });

    it("shows 'Copied!' feedback after click", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Copy Code"));
      fireEvent.click(screen.getByText("Copy Code"));
      await waitFor(() =>
        expect(screen.getByText("Copied!")).toBeInTheDocument()
      );
    });
  });

  // ── Navigation ────────────────────────────────────────────────────────────
  describe("navigation", () => {
    it("clicking 'Argumint' navigates to /", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Argumint"));
      fireEvent.click(screen.getByText("Argumint"));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("'Go to Lobby' navigates to /room/:code/lobby", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Go to Lobby"));
      fireEvent.click(screen.getByText("Go to Lobby"));
      expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD1/lobby");
    });

    it("'Start Room' navigates to /room/:code/lobby", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Start Room"));
      fireEvent.click(screen.getByText("Start Room"));
      expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD1/lobby");
    });

    it("'Cancel' navigates to /", async () => {
      renderPage();
      await waitFor(() => screen.getByText("Cancel"));
      fireEvent.click(screen.getByText("Cancel"));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  // ── API call on mount ──────────────────────────────────────────────────────
  describe("data fetching", () => {
    it("calls getRoomByCode with the room code on mount", async () => {
      renderPage();
      await waitFor(() =>
        expect(mockGetRoomByCode).toHaveBeenCalledWith("ABCD1")
      );
    });

    it("calls setRoom with fetched room data", async () => {
      const room = makeRoom();
      mockGetRoomByCode.mockResolvedValue(room);
      renderPage();
      await waitFor(() =>
        expect(mockSetRoom).toHaveBeenCalledWith(room)
      );
    });
  });
});
