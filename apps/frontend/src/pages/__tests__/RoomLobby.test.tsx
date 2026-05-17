import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { RoomLobby } from "../RoomLobby";

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
const mockSetRoom = vi.fn();
const mockSetError = vi.fn();
let mockRoom: any = null;
let mockUser: any = { id: "user-1", username: "Alice", email: "alice@test.com" };
let mockParams = { code: "ABCD" };

const mockRoomApiGetRoomByCode = vi.hoisted(() => vi.fn());

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock("../../contexts/RoomContext", () => ({
  useRoom: () => ({ room: mockRoom, setRoom: mockSetRoom, setError: mockSetError }),
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

vi.mock("../../services/api", () => ({
  roomApi: { getRoomByCode: mockRoomApiGetRoomByCode },
}));

vi.mock("../../components/InAppBrowserGate", () => ({
  InAppBrowserGate: ({ children }: any) => <>{children}</>,
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

vi.mock("../../components/VotingPanel", () => ({
  VotingPanel: () => <div data-testid="voting-panel" />,
}));

// ─── Room builder ─────────────────────────────────────────────────────────────
function makeRoom(overrides: any = {}) {
  return {
    _id: "room-1",
    code: "ABCD",
    topic: "AI is good for humanity",
    description: "",
    creatorId: "user-1",
    creatorUsername: "Alice",
    debateMode: "alternate",
    turnDuration: 120,
    prepDuration: 60,
    maxParticipants: 4,
    votingEnabled: false,
    votingTopics: [],
    votingDuration: 30,
    status: "lobby",
    participants: [
      { userId: "user-1", username: "Alice", role: "moderator", status: "joined" },
      { userId: "user-2", username: "Bob",   role: "participant", status: "joined" },
    ],
    ...overrides,
  };
}

// ─── Render helper ────────────────────────────────────────────────────────────
async function renderPage() {
  await act(async () => {
    render(<RoomLobby />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RoomLobby", () => {
  beforeEach(() => {
    mockSocket = createMockSocket();
    mockIsConnected = true;
    mockIsReconnecting = false;
    mockOnReconnect = vi.fn();
    mockNavigate.mockReset();
    mockSetRoom.mockReset();
    mockSetError.mockReset();
    mockRoom = null;
    mockUser = { id: "user-1", username: "Alice", email: "alice@test.com" };
    mockParams = { code: "ABCD" };
    mockRoomApiGetRoomByCode.mockReset().mockResolvedValue(makeRoom());

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  });

  // ── Loading state ─────────────────────────────────────────────────────────

  describe("loading state", () => {
    it("shows loading spinner when room is not in context and API is pending", async () => {
      mockRoomApiGetRoomByCode.mockImplementation(() => new Promise(() => {}));
      await act(async () => {
        render(<RoomLobby />);
        await Promise.resolve();
      });
      expect(screen.getByAltText("Loading…")).toBeInTheDocument();
    });
  });

  // ── Room not found ────────────────────────────────────────────────────────

  describe("room not found state", () => {
    it("shows Room not found after API failure", async () => {
      mockRoomApiGetRoomByCode.mockRejectedValue(new Error("Not found"));
      await act(async () => {
        render(<RoomLobby />);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText("Room not found")).toBeInTheDocument();
    });

    it("Back to Home navigates to /", async () => {
      mockRoomApiGetRoomByCode.mockRejectedValue(new Error("Not found"));
      await act(async () => {
        render(<RoomLobby />);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole("button", { name: /Back to Home/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  // ── Room loaded from context ──────────────────────────────────────────────

  describe("room loaded from context", () => {
    beforeEach(() => { mockRoom = makeRoom(); });

    it("displays the room code prominently", async () => {
      await renderPage();
      expect(screen.getAllByText("ABCD").length).toBeGreaterThan(0);
    });

    it("displays the room topic", async () => {
      await renderPage();
      expect(screen.getByText("AI is good for humanity")).toBeInTheDocument();
    });

    it("lists both participant usernames", async () => {
      await renderPage();
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("shows player count in the Players heading", async () => {
      await renderPage();
      expect(screen.getByText(/Players — 2/)).toBeInTheDocument();
    });

    it("shows Copy button", async () => {
      await renderPage();
      expect(screen.getByRole("button", { name: /Copy/i })).toBeInTheDocument();
    });

    it("shows Leave Room button", async () => {
      await renderPage();
      expect(screen.getByRole("button", { name: /Leave Room/i })).toBeInTheDocument();
    });

    it("renders ConnectionStatusBanner", async () => {
      await renderPage();
      expect(screen.getByTestId("connection-banner")).toBeInTheDocument();
    });

    it("shows debate mode in stats row", async () => {
      await renderPage();
      expect(screen.getByText("alternate")).toBeInTheDocument();
    });

    it("shows turn duration in stats row", async () => {
      await renderPage();
      expect(screen.getByText("120s")).toBeInTheDocument();
    });

    it("does NOT show VotingPanel when votingEnabled is false", async () => {
      await renderPage();
      expect(screen.queryByTestId("voting-panel")).not.toBeInTheDocument();
    });

    it("shows VotingPanel when votingEnabled is true", async () => {
      mockRoom = makeRoom({ votingEnabled: true });
      await renderPage();
      expect(screen.getByTestId("voting-panel")).toBeInTheDocument();
    });

    it("shows voting-in-progress placeholder when topic is empty", async () => {
      mockRoom = makeRoom({ topic: "" });
      await renderPage();
      expect(screen.getByText(/Voting in progress/i)).toBeInTheDocument();
    });

    it("shows description when present", async () => {
      mockRoom = makeRoom({ description: "No swearing please" });
      await renderPage();
      expect(screen.getByText("No swearing please")).toBeInTheDocument();
    });
  });

  // ── Host controls ─────────────────────────────────────────────────────────

  describe("host controls", () => {
    beforeEach(() => { mockRoom = makeRoom(); });

    it("shows 'Host Controls' heading for the room creator", async () => {
      await renderPage();
      expect(screen.getByText("Host Controls")).toBeInTheDocument();
    });

    it("shows Start Debate button", async () => {
      await renderPage();
      expect(screen.getByRole("button", { name: /Start Debate/i })).toBeInTheDocument();
    });

    it("Start Debate is disabled when debaters are not all ready", async () => {
      // Both participants have status "joined"
      await renderPage();
      expect(screen.getByRole("button", { name: /Start Debate/i })).toBeDisabled();
    });

    it("Start Debate is disabled with fewer than 2 debaters", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator", status: "ready" },
        ],
      });
      await renderPage();
      expect(screen.getByRole("button", { name: /Start Debate/i })).toBeDisabled();
    });

    it("Start Debate is enabled when all 2+ debaters are ready", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator",   status: "ready" },
          { userId: "user-2", username: "Bob",   role: "participant", status: "ready" },
        ],
      });
      await renderPage();
      expect(screen.getByRole("button", { name: /Start Debate/i })).not.toBeDisabled();
    });

    it("Start Debate emits room:start-debate when clicked", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator",   status: "ready" },
          { userId: "user-2", username: "Bob",   role: "participant", status: "ready" },
        ],
      });
      mockSocket.emit.mockImplementation(
        (_ev: string, _payload: any, cb?: Function) => { if (cb) cb({ success: true }); }
      );
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Start Debate/i }));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "room:start-debate",
        { roomId: "room-1" },
        expect.any(Function)
      );
    });

    it("shows 'Need at least 2 debaters' when fewer than 2 debaters", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator", status: "joined" },
        ],
      });
      await renderPage();
      expect(screen.getByText(/Need at least 2 debaters/i)).toBeInTheDocument();
    });

    it("shows ⋯ Manage button for other participants", async () => {
      await renderPage();
      expect(screen.getAllByTitle("Manage").length).toBeGreaterThan(0);
    });

    it("clicking ⋯ opens the role-change menu", async () => {
      await renderPage();
      fireEvent.click(screen.getAllByTitle("Manage")[0]);
      expect(screen.getByText("Change Role")).toBeInTheDocument();
    });

    it("role menu includes Make Host option", async () => {
      await renderPage();
      fireEvent.click(screen.getAllByTitle("Manage")[0]);
      expect(screen.getByText(/Make Host/i)).toBeInTheDocument();
    });

    it("Make Host emits room:transfer-host", async () => {
      mockSocket.emit.mockImplementation(
        (_ev: string, _payload: any, cb?: Function) => { if (cb) cb({ success: true }); }
      );
      await renderPage();
      fireEvent.click(screen.getAllByTitle("Manage")[0]);
      fireEvent.click(screen.getByText(/Make Host/i));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "room:transfer-host",
        { roomId: "room-1", targetUserId: "user-2" },
        expect.any(Function)
      );
    });

    it("clicking outside menu closes it", async () => {
      await renderPage();
      fireEvent.click(screen.getAllByTitle("Manage")[0]);
      expect(screen.getByText("Change Role")).toBeInTheDocument();
      // Click on the outer bg-grid container
      fireEvent.click(screen.getByText("AI is good for humanity"));
      expect(screen.queryByText("Change Role")).not.toBeInTheDocument();
    });

    it("does not show ⋯ button for yourself", async () => {
      // Only Bob (user-2) should have the manage button, not Alice (user-1 = self)
      await renderPage();
      // There should be exactly 1 manage button (for Bob, not Alice)
      expect(screen.getAllByTitle("Manage").length).toBe(1);
    });
  });

  // ── Non-host debater controls ─────────────────────────────────────────────

  describe("non-host debater controls", () => {
    beforeEach(() => {
      mockUser = { id: "user-2", username: "Bob", email: "bob@test.com" };
      mockRoom = makeRoom();
    });

    it("shows 'Your Status' heading for non-host", async () => {
      await renderPage();
      expect(screen.getByText("Your Status")).toBeInTheDocument();
    });

    it("shows Ready Up button when not ready", async () => {
      await renderPage();
      expect(screen.getByRole("button", { name: /Ready Up/i })).toBeInTheDocument();
    });

    it("Ready Up emits room:update-status with status ready", async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Ready Up/i }));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "room:update-status",
        { roomId: "room-1", status: "ready" }
      );
    });

    it("shows Not Ready button when already ready", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator",   status: "joined" },
          { userId: "user-2", username: "Bob",   role: "participant", status: "ready"  },
        ],
      });
      await renderPage();
      expect(screen.getByRole("button", { name: /Not Ready/i })).toBeInTheDocument();
    });

    it("Not Ready emits room:update-status with status joined", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator",   status: "joined" },
          { userId: "user-2", username: "Bob",   role: "participant", status: "ready"  },
        ],
      });
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Not Ready/i }));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "room:update-status",
        { roomId: "room-1", status: "joined" }
      );
    });

    it("shows 'All ready — waiting for host' when all debaters are ready", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator",   status: "ready" },
          { userId: "user-2", username: "Bob",   role: "participant", status: "ready" },
        ],
      });
      await renderPage();
      expect(screen.getByText(/All ready — waiting for host/i)).toBeInTheDocument();
    });

    it("shows judge observer message for judge role", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator", status: "joined" },
          { userId: "user-2", username: "Bob",   role: "judge",     status: "joined" },
        ],
      });
      await renderPage();
      expect(screen.getByText(/score the debaters/i)).toBeInTheDocument();
    });

    it("shows spectator observer message for spectator role", async () => {
      mockRoom = makeRoom({
        participants: [
          { userId: "user-1", username: "Alice", role: "moderator",  status: "joined" },
          { userId: "user-2", username: "Bob",   role: "spectator", status: "joined" },
        ],
      });
      await renderPage();
      expect(screen.getByText(/listen to the debate live/i)).toBeInTheDocument();
    });
  });

  // ── Leave Room ────────────────────────────────────────────────────────────

  describe("Leave Room", () => {
    beforeEach(() => { mockRoom = makeRoom(); });

    it("emits room:leave on click", async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Leave Room/i }));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "room:leave",
        { roomId: "room-1" }
      );
    });

    it("navigates to / after leaving", async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Leave Room/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  // ── Copy button ───────────────────────────────────────────────────────────

  describe("Copy button", () => {
    beforeEach(() => { mockRoom = makeRoom(); });

    it("calls navigator.clipboard.writeText with the room code", async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Copy/i }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABCD");
    });

    it("shows ✓ Copied! feedback after clicking", async () => {
      await renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Copy/i }));
      expect(screen.getByText(/Copied!/i)).toBeInTheDocument();
    });
  });

  // ── Socket events ─────────────────────────────────────────────────────────

  describe("socket events", () => {
    beforeEach(() => { mockRoom = makeRoom(); });

    it("room:participant-joined calls setRoom with updated participants", async () => {
      await renderPage();
      await act(async () => {
        mockSocket._emit("room:participant-joined", {
          participants: [
            { userId: "user-1", username: "Alice", role: "moderator",   status: "joined" },
            { userId: "user-2", username: "Bob",   role: "participant", status: "joined" },
            { userId: "user-3", username: "Carol", role: "participant", status: "joined" },
          ],
        });
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalled();
    });

    it("room:participant-left calls setRoom", async () => {
      await renderPage();
      await act(async () => {
        mockSocket._emit("room:participant-left", {
          participants: [
            { userId: "user-1", username: "Alice", role: "moderator", status: "joined" },
          ],
        });
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalled();
    });

    it("room:participant-status-updated calls setRoom", async () => {
      await renderPage();
      await act(async () => {
        mockSocket._emit("room:participant-status-updated", {
          participants: [
            { userId: "user-1", username: "Alice", role: "moderator",   status: "ready" },
            { userId: "user-2", username: "Bob",   role: "participant", status: "ready" },
          ],
        });
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalled();
    });

    it("debate:started navigates to prep screen", async () => {
      await renderPage();
      await act(async () => {
        mockSocket._emit("debate:started", { roomCode: "ABCD", debateId: "debate-123" });
        await Promise.resolve();
      });
      expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD/prep/debate-123");
    });

    it("room:voting-started calls setRoom", async () => {
      await renderPage();
      await act(async () => {
        mockSocket._emit("room:voting-started", { status: "voting", votingTopics: [] });
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalled();
    });

    it("room:voting-ended calls setRoom with new topic", async () => {
      await renderPage();
      await act(async () => {
        mockSocket._emit("room:voting-ended", { topic: "AI is dangerous", status: "lobby" });
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalled();
    });

    it("room:role-changed calls setRoom", async () => {
      await renderPage();
      await act(async () => {
        mockSocket._emit("room:role-changed", {
          participants: [
            { userId: "user-1", username: "Alice", role: "moderator", status: "joined" },
            { userId: "user-2", username: "Bob",   role: "judge",     status: "joined" },
          ],
        });
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalled();
    });

    it("room:host-transferred calls setRoom with new host data", async () => {
      await renderPage();
      await act(async () => {
        mockSocket._emit("room:host-transferred", {
          newHostId: "user-2",
          newHostUsername: "Bob",
          participants: [],
        });
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalled();
    });

    it("cleans up all socket listeners on unmount", async () => {
      const { unmount } = await act(async () => {
        const result = render(<RoomLobby />);
        await Promise.resolve();
        await Promise.resolve();
        return result;
      });

      unmount();

      const offEvents = mockSocket.off.mock.calls.map((c: any[]) => c[0]);
      expect(offEvents).toContain("debate:started");
      expect(offEvents).toContain("room:participant-joined");
      expect(offEvents).toContain("room:participant-left");
      expect(offEvents).toContain("room:role-changed");
      expect(offEvents).toContain("room:host-transferred");
    });
  });

  // ── Socket room:join effect ───────────────────────────────────────────────

  describe("socket room:join effect", () => {
    it("emits room:join when socket connects", async () => {
      mockRoom = makeRoom();
      mockSocket.emit.mockImplementation(
        (event: string, _payload: any, cb?: Function) => {
          if (cb) cb({ success: true, room: makeRoom() });
        }
      );
      await renderPage();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        "room:join",
        { roomCode: "ABCD", role: "participant" },
        expect.any(Function)
      );
    });

    it("calls setError when room:join fails", async () => {
      mockRoom = makeRoom();
      mockSocket.emit.mockImplementation(
        (event: string, _payload: any, cb?: Function) => {
          if (event === "room:join" && cb) cb({ success: false, error: "Room is locked" });
        }
      );
      await renderPage();
      expect(mockSetError).toHaveBeenCalledWith("Room is locked");
    });
  });

  // ── ConnectionStatusBanner ────────────────────────────────────────────────

  describe("ConnectionStatusBanner", () => {
    beforeEach(() => { mockRoom = makeRoom(); });

    it("passes isConnected=true to banner", async () => {
      mockIsConnected = true;
      await renderPage();
      expect(screen.getByTestId("connection-banner").dataset.connected).toBe("true");
    });

    it("passes isReconnecting=true to banner when reconnecting", async () => {
      mockIsReconnecting = true;
      await renderPage();
      expect(screen.getByTestId("connection-banner").dataset.reconnecting).toBe("true");
    });

    it("shows Connecting… text on Start Debate button when disconnected", async () => {
      mockIsConnected = false;
      await renderPage();
      expect(screen.getByText("Connecting…")).toBeInTheDocument();
    });
  });
});
