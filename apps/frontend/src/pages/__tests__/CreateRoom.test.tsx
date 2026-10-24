import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { CreateRoom } from "../CreateRoom";

// ─── Hoisted API mock ─────────────────────────────────────────────────────────
const mockRoomApiCreateRoom = vi.hoisted(() => vi.fn());

// ─── Mutable test state ───────────────────────────────────────────────────────
const mockNavigate = vi.fn();
const mockSetRoom  = vi.fn();
const mockSetError = vi.fn();
let mockUser: any = { id: "user-1", username: "Alice", email: "alice@test.com", isPro: false };

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock("../../contexts/RoomContext", () => ({
  useRoom: () => ({ setRoom: mockSetRoom, setError: mockSetError }),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "dark", meta: { id: "dark", label: "Dark", icon: "🌙", desc: "" } }),
  THEMES: [],
}));

vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("../../services/api", () => ({
  roomApi: { createRoom: mockRoomApiCreateRoom },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderForm() {
  render(<CreateRoom />);
}

function topicInput() {
  return screen.getByPlaceholderText(/Social media does more harm/i);
}

/** The create form (the shell's sidebar also has a "Create room" nav button). */
function form() {
  return screen.getByRole("form", { name: /Create a room/i });
}
function createBtn() {
  return within(form()).getByRole("button", { name: /Create room|Creating…/i });
}
function preview() {
  return screen.getByRole("complementary", { name: /Room preview/i });
}
function votingSwitch() {
  return screen.getByRole("switch", { name: /Topic voting/i });
}

/** −/+ buttons of a Stepper, found by their aria-labels ("Fewer rounds" / "More rounds"). */
function stepperPlus(noun: string) {
  return screen.getByRole("button", { name: `More ${noun}` });
}
function stepperMinus(noun: string) {
  return screen.getByRole("button", { name: `Fewer ${noun}` });
}
function stepperValue(label: string) {
  return within(screen.getByRole("group", { name: label })).getByRole("status");
}


// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CreateRoom", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSetRoom.mockReset();
    mockSetError.mockReset();
    mockUser = { id: "user-1", username: "Alice", email: "alice@test.com", isPro: false };
    mockRoomApiCreateRoom.mockReset().mockResolvedValue({
      _id: "room-1", code: "ABCD",
    });
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  describe("initial render", () => {
    it("renders the page heading", () => {
      renderForm();
      expect(screen.getByRole("heading", { name: /Create a room/i })).toBeInTheDocument();
    });

    it("renders the topic input", () => {
      renderForm();
      expect(topicInput()).toBeInTheDocument();
    });

    it("labels the motion field", () => {
      renderForm();
      expect(screen.getByLabelText("Motion")).toBe(topicInput());
    });

    it("renders the numbered sections", () => {
      renderForm();
      expect(screen.getByText(/01 · THE MOTION/)).toBeInTheDocument();
      expect(screen.getByText(/02 · MODE/)).toBeInTheDocument();
      expect(screen.getByText(/03 · TIMING & SIZE/)).toBeInTheDocument();
      expect(screen.getByText(/04 · OPTIONS/)).toBeInTheDocument();
    });

    it("renders Cancel button", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    });

    it("renders Create button", () => {
      renderForm();
      expect(createBtn()).toHaveAttribute("type", "submit");
    });

    it("renders back button", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Back to home/i })).toBeInTheDocument();
    });

    it("shows Alternate mode card as selected by default", () => {
      renderForm();
      expect(screen.getByRole("radio", { name: /Alternate/i })).toHaveAttribute("aria-checked", "true");
    });

    it("shows default turn count in the preview", () => {
      // totalRounds=2 → 4 turns
      renderForm();
      expect(within(preview()).getByText("4")).toBeInTheDocument();
    });

    it("shows default total time in the preview", () => {
      // 4×60s + 30s = 270s = 4m 30s
      renderForm();
      expect(within(preview()).getByText("4m 30s")).toBeInTheDocument();
    });

    it("shows Timing section with Rounds stepper", () => {
      renderForm();
      expect(screen.getByRole("group", { name: "Rounds" })).toBeInTheDocument();
    });

    it("shows Turn time stepper", () => {
      renderForm();
      expect(screen.getByRole("group", { name: "Turn time" })).toBeInTheDocument();
    });

    it("shows Max debaters stepper", () => {
      renderForm();
      expect(screen.getByRole("group", { name: "Max debaters" })).toBeInTheDocument();
    });

    it("renders inside the app shell with Create room active", () => {
      renderForm();
      const current = screen.getAllByRole("button", { current: "page" });
      expect(current.length).toBeGreaterThan(0);
      current.forEach(el => expect(el).toHaveTextContent(/Create/));
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  describe("navigation", () => {
    it("Cancel button navigates to /", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("back button navigates to /", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Back to home/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  // ── Form validation ────────────────────────────────────────────────────────

  describe("form validation", () => {
    it("shows error when submitting without a topic", async () => {
      renderForm();
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
      });
      expect(screen.getByRole("alert")).toHaveTextContent(/Debate topic is required/i);
    });

    it("does not call API when topic is missing", async () => {
      renderForm();
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
      });
      expect(mockRoomApiCreateRoom).not.toHaveBeenCalled();
    });

    it("shows error when votingEnabled but no topics added", async () => {
      // Must be Pro to enable voting
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      // Toggle voting on
      fireEvent.click(votingSwitch());
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
      });
      expect(screen.getByText(/Add at least one voting topic/i)).toBeInTheDocument();
    });

    it("clears error when a topic is typed after validation failure", async () => {
      renderForm();
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
      });
      expect(screen.getByText(/Debate topic is required/i)).toBeInTheDocument();

      fireEvent.change(topicInput(), { target: { value: "My topic" } });
      // Re-submitting with a topic clears the error
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.queryByText(/Debate topic is required/i)).not.toBeInTheDocument();
    });
  });

  // ── Successful submission ──────────────────────────────────────────────────

  describe("successful room creation", () => {
    it("calls roomApi.createRoom with the topic", async () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "AI is good" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockRoomApiCreateRoom).toHaveBeenCalledWith(
        expect.objectContaining({ topic: "AI is good" })
      );
    });

    it("sends the existing defaults in the payload", async () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "AI is good" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockRoomApiCreateRoom).toHaveBeenCalledWith(expect.objectContaining({
        debateMode: "alternate", maxParticipants: 10, maxJudges: 0, maxSpectators: 0,
        votingEnabled: false, votingTopics: [], votingDuration: 30, prepDuration: 30,
        turnDuration: 60, totalRounds: 2, transcriptionMode: "whisper",
      }));
    });

    it("sends the optional context as description", async () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "AI is good" } });
      fireEvent.change(screen.getByLabelText(/Context/), { target: { value: "Define AI broadly" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockRoomApiCreateRoom).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Define AI broadly" })
      );
    });

    it("calls setRoom with the returned room", async () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Test topic" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalledWith({ _id: "room-1", code: "ABCD" });
    });

    it("navigates to the room lobby after creation", async () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Test topic" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockNavigate).toHaveBeenCalledWith("/room/ABCD/lobby");
    });

    it("shows Creating… during submission", async () => {
      let resolve!: (v: any) => void;
      mockRoomApiCreateRoom.mockReturnValue(new Promise(r => { resolve = r; }));
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Topic" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
      });
      expect(within(form()).getByRole("button", { name: /Creating…/i })).toBeInTheDocument();
      resolve({ _id: "r1", code: "ABCD" });
    });

    it("Create button is disabled during submission", async () => {
      let resolve!: (v: any) => void;
      mockRoomApiCreateRoom.mockReturnValue(new Promise(r => { resolve = r; }));
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Topic" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
      });
      expect(within(form()).getByRole("button", { name: /Creating…/i })).toBeDisabled();
      resolve({ _id: "r1", code: "ABCD" });
    });
  });

  // ── API failure ────────────────────────────────────────────────────────────

  describe("API failure", () => {
    it("shows error message when API throws", async () => {
      mockRoomApiCreateRoom.mockRejectedValue(new Error("Server error"));
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Topic" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText(/Server error/)).toBeInTheDocument();
    });

    it("re-enables Create button after API failure", async () => {
      mockRoomApiCreateRoom.mockRejectedValue(new Error("Network error"));
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Topic" } });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(createBtn()).not.toBeDisabled();
    });
  });

  // ── Debate mode selection ──────────────────────────────────────────────────

  describe("debate mode selection", () => {
    it("Alternate is selected by default", () => {
      renderForm();
      expect(screen.getByRole("radio", { name: /Alternate/i })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByRole("radio", { name: /Buzzer/i })).toHaveAttribute("aria-checked", "false");
    });

    it("clicking Buzzer as free user navigates to /pricing", () => {
      renderForm();
      fireEvent.click(screen.getByRole("radio", { name: /Buzzer/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
      expect(screen.getByRole("radio", { name: /Alternate/i })).toHaveAttribute("aria-checked", "true");
    });

    it("clicking Buzzer as Pro user selects it", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      fireEvent.click(screen.getByRole("radio", { name: /Buzzer/i }));
      expect(mockNavigate).not.toHaveBeenCalledWith("/pricing");
      expect(screen.getByRole("radio", { name: /Buzzer/i })).toHaveAttribute("aria-checked", "true");
      expect(within(preview()).getByText("Buzzer")).toBeInTheDocument();
    });

    it("shows PRO badge on Buzzer mode for free users", () => {
      renderForm();
      const buzzerCard = screen.getByRole("radio", { name: /Buzzer/i });
      expect(within(buzzerCard).getByText("PRO")).toBeInTheDocument();
    });

    it("no PRO badge on Buzzer for Pro users", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      expect(within(screen.getByRole("radio", { name: /Buzzer/i })).queryByText("PRO")).not.toBeInTheDocument();
    });
  });

  // ── Voting toggle ──────────────────────────────────────────────────────────

  describe("voting toggle", () => {
    it("clicking toggle as free user navigates to /pricing", () => {
      renderForm();
      fireEvent.click(votingSwitch());
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
      expect(votingSwitch()).toHaveAttribute("aria-checked", "false");
    });

    it("clicking toggle as Pro user enables voting mode", async () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      fireEvent.click(votingSwitch());
      expect(votingSwitch()).toHaveAttribute("aria-checked", "true");
      // Topic input disappears, voting topics UI appears
      expect(screen.getByText(/Add 2–4 options/i)).toBeInTheDocument();
    });

    it("toggling voting off hides the topic inputs and restores text input", async () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      // Toggle on
      fireEvent.click(votingSwitch());
      expect(screen.getByText(/Add 2–4 options/i)).toBeInTheDocument();
      // Toggle off
      fireEvent.click(votingSwitch());
      expect(screen.queryByText(/Add 2–4 options/i)).not.toBeInTheDocument();
      expect(topicInput()).toBeInTheDocument();
    });
  });

  // ── Voting topics ──────────────────────────────────────────────────────────

  describe("voting topics (Pro)", () => {
    beforeEach(() => {
      mockUser = { ...mockUser, isPro: true };
    });

    it("Add option button adds a topic input", async () => {
      renderForm();
      fireEvent.click(votingSwitch());
      fireEvent.click(screen.getByRole("button", { name: /Add option/i }));
      expect(screen.getByPlaceholderText("Option 1")).toBeInTheDocument();
    });

    it("can add up to 4 topics", async () => {
      renderForm();
      fireEvent.click(votingSwitch());
      for (let i = 0; i < 4; i++) {
        fireEvent.click(screen.getByRole("button", { name: /Add option/i }));
      }
      expect(screen.getAllByPlaceholderText(/Option \d/).length).toBe(4);
    });

    it("hides Add option button when 4 topics are added", async () => {
      renderForm();
      fireEvent.click(votingSwitch());
      for (let i = 0; i < 4; i++) {
        fireEvent.click(screen.getByRole("button", { name: /Add option/i }));
      }
      expect(screen.queryByRole("button", { name: /Add option/i })).not.toBeInTheDocument();
    });

    it("remove button removes a topic", async () => {
      renderForm();
      fireEvent.click(votingSwitch());
      fireEvent.click(screen.getByRole("button", { name: /Add option/i }));
      expect(screen.getByPlaceholderText("Option 1")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Remove option 1" }));
      expect(screen.queryByPlaceholderText("Option 1")).not.toBeInTheDocument();
    });

    it("submits with voting topics included in payload", async () => {
      renderForm();
      fireEvent.click(votingSwitch());
      fireEvent.click(screen.getByRole("button", { name: /Add option/i }));
      fireEvent.change(screen.getByPlaceholderText("Option 1"), {
        target: { value: "Topic A" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Add option/i }));
      fireEvent.change(screen.getByPlaceholderText("Option 2"), {
        target: { value: "Topic B" },
      });
      await act(async () => {
        fireEvent.click(createBtn());
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockRoomApiCreateRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          votingEnabled: true,
          votingTopics: expect.arrayContaining(["Topic A", "Topic B"]),
        })
      );
    });
  });

  // ── Pro vs Free feature gates ──────────────────────────────────────────────

  describe("Pro vs Free feature gates", () => {
    it("free user sees Pro upsell banner", () => {
      renderForm();
      expect(screen.getByText(/unlocks human judges/i)).toBeInTheDocument();
      expect(screen.getByText(/See plans →/)).toBeInTheDocument();
    });

    it("clicking Pro upsell banner navigates to /pricing", () => {
      renderForm();
      fireEvent.click(screen.getByText(/See plans →/));
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });

    it("free user sees a locked Human judges switch that opens pricing", () => {
      renderForm();
      const sw = screen.getByRole("switch", { name: /Human judges \(Pro only\)/i });
      expect(sw).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(sw);
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });

    it("free user does NOT see Max judges stepper", () => {
      renderForm();
      expect(screen.queryByRole("group", { name: "Max judges" })).not.toBeInTheDocument();
    });

    it("free user does NOT see Max spectators stepper", () => {
      renderForm();
      expect(screen.queryByRole("group", { name: "Max spectators" })).not.toBeInTheDocument();
    });

    it("Pro user sees Max judges stepper", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      expect(screen.getByRole("group", { name: "Max judges" })).toBeInTheDocument();
    });

    it("Pro user sees Max spectators stepper", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      expect(screen.getByRole("group", { name: "Max spectators" })).toBeInTheDocument();
    });

    it("Pro user does not see the upsell", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      expect(screen.queryByText(/See plans →/)).not.toBeInTheDocument();
    });

    it("Pro user sees judges/spectators in the preview", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      expect(within(preview()).getByText("Judges")).toBeInTheDocument();
      expect(within(preview()).getByText("Spectators")).toBeInTheDocument();
    });

    it("free user does not see judges/spectators in the preview", () => {
      renderForm();
      expect(within(preview()).queryByText("Judges")).not.toBeInTheDocument();
    });
  });

  // ── Stepper interactions ───────────────────────────────────────────────────

  describe("Stepper component", () => {
    it("clicking + on Rounds stepper increments the round count", () => {
      renderForm();
      fireEvent.click(stepperPlus("rounds"));
      // totalRounds goes 2→3, totalTurns goes 4→6
      expect(stepperValue("Rounds")).toHaveTextContent("3");
      expect(within(preview()).getByText("6")).toBeInTheDocument();
    });

    it("clicking − on Rounds stepper decrements when not at minimum", () => {
      renderForm();
      // rounds starts at 2 (min=1), decrement → 1, totalTurns=2
      fireEvent.click(stepperMinus("rounds"));
      expect(stepperValue("Rounds")).toHaveTextContent("1");
      expect(within(preview()).getByText("2")).toBeInTheDocument();
    });

    it("− button is disabled when value is at minimum", () => {
      renderForm();
      fireEvent.click(stepperMinus("rounds"));
      expect(stepperMinus("rounds")).toBeDisabled();
    });

    it("+ button is disabled at maximum (rounds max 10)", () => {
      renderForm();
      for (let i = 0; i < 12; i++) fireEvent.click(stepperPlus("rounds"));
      expect(stepperValue("Rounds")).toHaveTextContent("10");
      expect(stepperPlus("rounds")).toBeDisabled();
    });

    it("Turn time stepper displays formatted time", () => {
      renderForm();
      // Default turnDuration = 60 → displayed as "1m"
      expect(stepperValue("Turn time")).toHaveTextContent("1m");
    });

    it("Turn time steps by 15s", () => {
      renderForm();
      fireEvent.click(stepperPlus("seconds per turn"));
      expect(stepperValue("Turn time")).toHaveTextContent("1m 15s");
    });

    it("Prep time stepper displays formatted time", () => {
      renderForm();
      // Default prepDuration = 30 → "30s"
      expect(stepperValue("Prep time")).toHaveTextContent("30s");
    });
  });

  // ── Character counter ──────────────────────────────────────────────────────

  describe("topic character counter", () => {
    it("shows 0/500 initially", () => {
      renderForm();
      expect(screen.getByText("0/500")).toBeInTheDocument();
    });

    it("updates counter as user types", () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Hello" } });
      expect(screen.getByText("5/500")).toBeInTheDocument();
    });

    it("mirrors the motion in the preview", () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Cats beat dogs" } });
      expect(within(preview()).getByText("Cats beat dogs")).toBeInTheDocument();
    });
  });
});
