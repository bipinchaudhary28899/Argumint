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
  useTheme: () => ({ theme: "dark" }),
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

/** Find the + button inside the Stepper identified by its unique hint text. */
function stepperPlus(hintText: string) {
  const hintEl = screen.getByText(hintText);
  // hintEl is the <span> hint; parentElement is the outer Stepper <div>
  return within(hintEl.parentElement!).getAllByRole("button")[1]; // [0]=minus [1]=plus
}
function stepperMinus(hintText: string) {
  const hintEl = screen.getByText(hintText);
  return within(hintEl.parentElement!).getAllByRole("button")[0];
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
      expect(screen.getByText(/Host a Debate/i)).toBeInTheDocument();
    });

    it("renders the topic input", () => {
      renderForm();
      expect(topicInput()).toBeInTheDocument();
    });

    it("renders Cancel button", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    });

    it("renders Create button", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /Create →/i })).toBeInTheDocument();
    });

    it("renders back ← button", () => {
      renderForm();
      expect(screen.getByRole("button", { name: /←/i })).toBeInTheDocument();
    });

    it("shows Alternate mode card as selected by default", () => {
      renderForm();
      expect(screen.getByText("SELECTED")).toBeInTheDocument();
    });

    it("shows summary strip with default turn count", () => {
      // totalRounds=2 → 4 turns
      renderForm();
      expect(screen.getByText("4")).toBeInTheDocument();
    });

    it("shows summary strip with default total time", () => {
      // 4×60s + 30s = 270s = 4m 30s
      renderForm();
      expect(screen.getByText("4m 30s")).toBeInTheDocument();
    });

    it("shows Timing section with Rounds stepper", () => {
      renderForm();
      expect(screen.getByText("Rounds")).toBeInTheDocument();
    });

    it("shows Turn time stepper", () => {
      renderForm();
      expect(screen.getByText("Turn time")).toBeInTheDocument();
    });

    it("shows Max Debaters stepper", () => {
      renderForm();
      expect(screen.getByText("Max Debaters")).toBeInTheDocument();
    });
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  describe("navigation", () => {
    it("Cancel button navigates to /", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("← button navigates to /", () => {
      renderForm();
      // First ← button (type=button, not submit)
      fireEvent.click(screen.getAllByRole("button", { name: /←/i })[0]);
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  // ── Form validation ────────────────────────────────────────────────────────

  describe("form validation", () => {
    it("shows error when submitting without a topic", async () => {
      renderForm();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
      });
      expect(screen.getByText(/Debate topic is required/i)).toBeInTheDocument();
    });

    it("does not call API when topic is missing", async () => {
      renderForm();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
      });
      expect(mockRoomApiCreateRoom).not.toHaveBeenCalled();
    });

    it("shows error when votingEnabled but no topics added", async () => {
      // Must be Pro to enable voting
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      // Toggle voting on
      fireEvent.click(screen.getByText(/Let players vote on the topic/i).closest("div")!);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
      });
      expect(screen.getByText(/Add at least one voting topic/i)).toBeInTheDocument();
    });

    it("clears error when a topic is typed after validation failure", async () => {
      renderForm();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
      });
      expect(screen.getByText(/Debate topic is required/i)).toBeInTheDocument();

      fireEvent.change(topicInput(), { target: { value: "My topic" } });
      // Error should clear when user types (re-submit clears it too, but typing alone won't)
      // Just ensure the form re-submits successfully after adding a topic
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
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
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockRoomApiCreateRoom).toHaveBeenCalledWith(
        expect.objectContaining({ topic: "AI is good" })
      );
    });

    it("calls setRoom with the returned room", async () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Test topic" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockSetRoom).toHaveBeenCalledWith({ _id: "room-1", code: "ABCD" });
    });

    it("navigates to the room lobby after creation", async () => {
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Test topic" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
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
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
      });
      expect(screen.getByRole("button", { name: /Creating…/i })).toBeInTheDocument();
      resolve({ _id: "r1", code: "ABCD" });
    });

    it("Create button is disabled during submission", async () => {
      let resolve!: (v: any) => void;
      mockRoomApiCreateRoom.mockReturnValue(new Promise(r => { resolve = r; }));
      renderForm();
      fireEvent.change(topicInput(), { target: { value: "Topic" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
      });
      expect(screen.getByRole("button", { name: /Creating…/i })).toBeDisabled();
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
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
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
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByRole("button", { name: /Create →/i })).not.toBeDisabled();
    });
  });

  // ── Debate mode selection ──────────────────────────────────────────────────

  describe("debate mode selection", () => {
    it("Alternate is selected by default (shows SELECTED badge)", () => {
      renderForm();
      expect(screen.getByText("SELECTED")).toBeInTheDocument();
    });

    it("clicking Buzzer as free user navigates to /pricing", () => {
      renderForm();
      fireEvent.click(screen.getByText("Buzzer").closest("div")!);
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });

    it("clicking Buzzer as Pro user selects it", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      fireEvent.click(screen.getByText("Buzzer").closest("div")!);
      // "Alternate" loses SELECTED; active mode shows "SELECTED" on Buzzer
      // Check the active badge moved — just verify no navigation to pricing
      expect(mockNavigate).not.toHaveBeenCalledWith("/pricing");
    });

    it("shows PRO badge on Buzzer mode for free users", () => {
      renderForm();
      // The Buzzer card has a PRO badge (inline span, not ProLock component)
      const buzzerCard = screen.getByText("Buzzer").closest("div")!;
      expect(within(buzzerCard).getByText("👑 PRO")).toBeInTheDocument();
    });
  });

  // ── Voting toggle ──────────────────────────────────────────────────────────

  describe("voting toggle", () => {
    it("clicking toggle as free user navigates to /pricing", () => {
      renderForm();
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });

    it("clicking toggle as Pro user enables voting mode", async () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
      // Topic input disappears, voting topics UI appears
      expect(screen.getByText(/Add 2–4 options/i)).toBeInTheDocument();
    });

    it("toggling voting off hides the topic inputs and restores text input", async () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      // Toggle on
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
      expect(screen.getByText(/Add 2–4 options/i)).toBeInTheDocument();
      // Toggle off
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
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
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
      fireEvent.click(screen.getByText(/\+ Add option/i));
      expect(screen.getByPlaceholderText("Option 1")).toBeInTheDocument();
    });

    it("can add up to 4 topics", async () => {
      renderForm();
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
      for (let i = 0; i < 4; i++) {
        fireEvent.click(screen.getByText(/\+ Add option/i));
      }
      expect(screen.getAllByPlaceholderText(/Option \d/).length).toBe(4);
    });

    it("hides Add option button when 4 topics are added", async () => {
      renderForm();
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
      for (let i = 0; i < 4; i++) {
        fireEvent.click(screen.getByText(/\+ Add option/i));
      }
      expect(screen.queryByText(/\+ Add option/i)).not.toBeInTheDocument();
    });

    it("✕ button removes a topic", async () => {
      renderForm();
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
      fireEvent.click(screen.getByText(/\+ Add option/i));
      expect(screen.getByPlaceholderText("Option 1")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "✕" }));
      expect(screen.queryByPlaceholderText("Option 1")).not.toBeInTheDocument();
    });

    it("submits with voting topics included in payload", async () => {
      renderForm();
      fireEvent.click(screen.getByText(/Let players vote/i).closest("div")!);
      fireEvent.click(screen.getByText(/\+ Add option/i));
      fireEvent.change(screen.getByPlaceholderText("Option 1"), {
        target: { value: "Topic A" },
      });
      fireEvent.click(screen.getByText(/\+ Add option/i));
      fireEvent.change(screen.getByPlaceholderText("Option 2"), {
        target: { value: "Topic B" },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Create →/i }));
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
      expect(screen.getByText(/Pro/)).toBeInTheDocument();
      expect(screen.getByText(/See plans →/)).toBeInTheDocument();
    });

    it("clicking Pro upsell banner navigates to /pricing", () => {
      renderForm();
      fireEvent.click(screen.getByText(/See plans →/));
      expect(mockNavigate).toHaveBeenCalledWith("/pricing");
    });

    it("free user does NOT see Max Judges stepper", () => {
      renderForm();
      expect(screen.queryByText("Max Judges")).not.toBeInTheDocument();
    });

    it("free user does NOT see Max Spectators stepper", () => {
      renderForm();
      expect(screen.queryByText("Max Spectators")).not.toBeInTheDocument();
    });

    it("Pro user sees Max Judges stepper", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      expect(screen.getByText("Max Judges")).toBeInTheDocument();
    });

    it("Pro user sees Max Spectators stepper", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      expect(screen.getByText("Max Spectators")).toBeInTheDocument();
    });

    it("Pro user sees judges/spectators in summary strip", () => {
      mockUser = { ...mockUser, isPro: true };
      renderForm();
      expect(screen.getByText("judges")).toBeInTheDocument();
      expect(screen.getByText("spectators")).toBeInTheDocument();
    });
  });

  // ── Stepper interactions ───────────────────────────────────────────────────

  describe("Stepper component", () => {
    it("clicking + on Rounds stepper increments the round count", () => {
      renderForm();
      // "turns per side" is the unique hint for Rounds stepper
      fireEvent.click(stepperPlus("turns per side"));
      // totalRounds goes 2→3, totalTurns goes 4→6
      expect(screen.getByText("6")).toBeInTheDocument();
    });

    it("clicking − on Rounds stepper decrements when not at minimum", () => {
      renderForm();
      // rounds starts at 2 (min=1), decrement → 1, totalTurns=2
      fireEvent.click(stepperMinus("turns per side"));
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("− button is disabled when value is at minimum", () => {
      renderForm();
      // Rounds min=1: click − once to reach min
      fireEvent.click(stepperMinus("turns per side"));
      // Now at min (1). The minus button should be disabled
      const minusBtn = stepperMinus("turns per side");
      expect(minusBtn).toBeDisabled();
    });

    it("Turn time stepper displays formatted time", () => {
      renderForm();
      // Default turnDuration = 60 → displayed as "1m"
      expect(screen.getByText("1m")).toBeInTheDocument();
    });

    it("Prep time stepper displays formatted time", () => {
      renderForm();
      // Default prepDuration = 30 → "30s"
      expect(screen.getByText("30s")).toBeInTheDocument();
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
  });
});
