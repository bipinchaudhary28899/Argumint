/**
 * VotingPanel.test.tsx
 *
 * Tests for the topic-voting panel used inside debate rooms.
 *
 * Covers:
 *   – null render when topics list is empty / undefined
 *   – Host vs guest initial UI
 *   – handleStartVoting (host): optimistic state + socket emit
 *   – handleVote: blocked before start / after end, fires socket emit when active
 *   – Countdown timer and red-color threshold (≤10 s)
 *   – Host auto-ends voting when timer hits 0
 *   – Live vote percentages and counts
 *   – Socket events: voting-started, voting-update, voting-ended
 *   – Selected-topic banner after voting ends
 *   – "Run another vote" resets state
 *   – Props sync when voting is not active
 *   – room:get-state callback restores in-progress voting state on mount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { VotingPanel } from "../VotingPanel";

// ── Socket mock factory ────────────────────────────────────────────────────────

type SocketListener = (...args: any[]) => void;

function createMockSocket() {
  const listeners: Record<string, SocketListener[]> = {};

  const socket = {
    emit: vi.fn((event: string, payload: any, cb?: Function) => {
      if (cb) cb({ success: true });
    }),
    on:   vi.fn((event: string, fn: SocketListener) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(fn);
    }),
    off:  vi.fn((event: string, fn: SocketListener) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(f => f !== fn);
      }
    }),
    /** Test helper — simulate a server event */
    _emit(event: string, data: any) {
      (listeners[event] ?? []).forEach(fn => fn(data));
    },
  };
  return socket;
}

// ── Test data ─────────────────────────────────────────────────────────────────

const TOPICS = [
  { id: "t1", text: "AI will replace jobs",       votes: 0 },
  { id: "t2", text: "AI will create new jobs",    votes: 0 },
  { id: "t3", text: "No net change",              votes: 0 },
];

function makeProps(overrides: Partial<Parameters<typeof VotingPanel>[0]> = {}) {
  return {
    votingTopics:         TOPICS,
    votingDuration:       60,
    isHost:               false,
    roomId:               "room-1",
    socket:               null as any,
    onVotingStatusChange: vi.fn(),
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("VotingPanel — null render", () => {
  it("returns null when votingTopics is empty", () => {
    const { container } = render(<VotingPanel {...makeProps({ votingTopics: [] })} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when votingTopics is undefined (cast)", () => {
    const { container } = render(<VotingPanel {...makeProps({ votingTopics: undefined as any })} />);
    expect(container.firstChild).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — initial UI (voting not yet started)", () => {
  it("renders all topic buttons", () => {
    render(<VotingPanel {...makeProps()} />);
    expect(screen.getByText("AI will replace jobs")).toBeInTheDocument();
    expect(screen.getByText("AI will create new jobs")).toBeInTheDocument();
    expect(screen.getByText("No net change")).toBeInTheDocument();
  });

  it("shows 'Choose the motion' heading", () => {
    render(<VotingPanel {...makeProps()} />);
    expect(screen.getByText(/Choose the motion/i)).toBeInTheDocument();
  });

  it("shows 'Waiting for host' message for non-host guests", () => {
    render(<VotingPanel {...makeProps({ isHost: false })} />);
    expect(screen.getByText(/Waiting for host to start voting/i)).toBeInTheDocument();
  });

  it("shows '⚡ Start Voting' button for the host", () => {
    render(<VotingPanel {...makeProps({ isHost: true })} />);
    expect(screen.getByText(/Start Voting/i)).toBeInTheDocument();
  });

  it("does NOT show start-voting button for non-host guests", () => {
    render(<VotingPanel {...makeProps({ isHost: false })} />);
    // Use getByRole to avoid matching "start voting" inside the waiting-message text
    expect(screen.queryByRole("button", { name: /Start Voting/i })).not.toBeInTheDocument();
  });

  it("does NOT show vote percentages before voting starts", () => {
    render(<VotingPanel {...makeProps()} />);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("topic buttons are disabled before voting starts", () => {
    render(<VotingPanel {...makeProps()} />);
    const topicBtns = screen.getAllByRole("button").filter(b => b.textContent?.includes("AI will replace jobs"));
    topicBtns.forEach(btn => expect(btn).toBeDisabled());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — host starts voting", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

  it("clicking Start Voting emits room:start-voting", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ isHost: true, socket: socket as any })} />);
    fireEvent.click(screen.getByText(/Start Voting/i));
    expect(socket.emit).toHaveBeenCalledWith("room:start-voting", { roomId: "room-1" }, expect.any(Function));
  });

  it("optimistically shows the timer after clicking Start Voting", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ isHost: true, socket: socket as any, votingDuration: 30 })} />);
    fireEvent.click(screen.getByText(/Start Voting/i));
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("calls onVotingStatusChange(true) when host starts voting", () => {
    const socket = createMockSocket();
    const onStatus = vi.fn();
    render(<VotingPanel {...makeProps({ isHost: true, socket: socket as any, onVotingStatusChange: onStatus })} />);
    fireEvent.click(screen.getByText(/Start Voting/i));
    expect(onStatus).toHaveBeenCalledWith(true);
  });

  it("rolls back to not-started state if socket emits failure", () => {
    const socket = createMockSocket();
    // Override emit so room:start-voting specifically returns failure.
    // The component also emits room:get-state on mount, so we must handle both
    // events — mockImplementationOnce would be consumed by get-state first.
    socket.emit.mockImplementation((event: string, _payload: any, cb?: Function) => {
      if (event === "room:start-voting" && cb) cb({ success: false });
      else if (cb) cb({ success: true });
    });
    render(<VotingPanel {...makeProps({ isHost: true, socket: socket as any })} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Voting/i }));
    // After rollback isVotingStarted→false, the Start Voting button reappears
    expect(screen.getByRole("button", { name: /Start Voting/i })).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — voting (active state)", () => {
  function startVotingViaSocket(socket: ReturnType<typeof createMockSocket>, topics = TOPICS, duration = 60) {
    socket._emit("room:voting-started", { votingDuration: duration, votingTopics: topics });
  }

  it("shows timer when voting starts via socket event", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => startVotingViaSocket(socket, TOPICS, 45));
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText(/seconds/i)).toBeInTheDocument();
  });

  it("shows vote percentages once voting starts", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => startVotingViaSocket(socket));
    // 0 total votes → all percentages show 0%
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  });

  it("enables topic buttons once voting starts", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => startVotingViaSocket(socket));
    const topicBtns = screen.getAllByRole("button").filter(b => TOPICS.some(t => b.textContent?.includes(t.text)));
    topicBtns.forEach(btn => expect(btn).not.toBeDisabled());
  });

  it("calls onVotingStatusChange(true) when server sends voting-started", () => {
    const socket = createMockSocket();
    const onStatus = vi.fn();
    render(<VotingPanel {...makeProps({ socket: socket as any, onVotingStatusChange: onStatus })} />);
    act(() => startVotingViaSocket(socket));
    expect(onStatus).toHaveBeenCalledWith(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — handleVote", () => {
  it("does not emit vote before voting starts (button disabled)", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    // Buttons are disabled — fireEvent.click won't trigger the handler
    const topicBtns = screen.getAllByRole("button");
    topicBtns.forEach(btn => { if (btn.textContent?.includes("AI will replace")) fireEvent.click(btn); });
    expect(socket.emit).not.toHaveBeenCalledWith("room:vote-topic", expect.anything(), expect.any(Function));
  });

  it("emits room:vote-topic when voting is active and topic is clicked", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 60, votingTopics: TOPICS }); });
    fireEvent.click(screen.getByText("AI will replace jobs"));
    expect(socket.emit).toHaveBeenCalledWith(
      "room:vote-topic",
      { roomId: "room-1", topicId: "t1" },
      expect.any(Function)
    );
  });

  it("shows a ✓ checkmark next to the voted topic after successful vote", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 60, votingTopics: TOPICS }); });
    fireEvent.click(screen.getByText("AI will replace jobs"));
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("does not show ✓ if socket returns failure for the vote", () => {
    const socket = createMockSocket();
    // Override emit to return failure for vote-topic
    socket.emit.mockImplementation((event: string, _p: any, cb?: Function) => {
      if (event === "room:vote-topic" && cb) cb({ success: false });
      else if (cb) cb({ success: true });
    });
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 60, votingTopics: TOPICS }); });
    fireEvent.click(screen.getByText("AI will replace jobs"));
    expect(screen.queryByText("✓")).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — countdown timer", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

  it("decrements the timer every second", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any, votingDuration: 10 })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 10, votingTopics: TOPICS }); });
    expect(screen.getByText("10")).toBeInTheDocument();

    // Advance 1 second at a time inside separate act() calls so React re-renders
    // (and re-registers the next setTimeout) between each tick.
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("timer colour is NOT red when timer > 10", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any, votingDuration: 60 })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 60, votingTopics: TOPICS }); });
    const timerEl = screen.getByText("60");
    // var(--against) is the red color
    expect(timerEl.style.color).not.toBe("var(--against)");
    expect(timerEl.style.color).toBe("var(--gold)");
  });

  it("timer colour turns red (var(--against)) at exactly 10 seconds", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any, votingDuration: 13 })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 13, votingTopics: TOPICS }); });
    // Tick 1s at a time so React re-renders and re-registers each timeout
    for (let i = 0; i < 3; i++) act(() => { vi.advanceTimersByTime(1000); });
    const timerEl = screen.getByText("10");
    expect(timerEl.style.color).toBe("var(--against)");
  });

  it("host emits room:end-voting when timer reaches 0", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ isHost: true, socket: socket as any, votingDuration: 3 })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 3, votingTopics: TOPICS }); });
    // Tick each second individually so React can re-register the next timeout
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(socket.emit).toHaveBeenCalledWith("room:end-voting", { roomId: "room-1" }, expect.any(Function));
  });

  it("non-host does NOT emit room:end-voting when timer reaches 0", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ isHost: false, socket: socket as any, votingDuration: 3 })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 3, votingTopics: TOPICS }); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(socket.emit).not.toHaveBeenCalledWith("room:end-voting", expect.anything(), expect.any(Function));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — vote percentages and counts", () => {
  it("shows correct percentages when some topics have votes", () => {
    const topicsWithVotes = [
      { id: "t1", text: "Option A", votes: 3 },
      { id: "t2", text: "Option B", votes: 1 },
    ];
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any, votingTopics: topicsWithVotes })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 60, votingTopics: topicsWithVotes }); });
    // 3/4 = 75%, 1/4 = 25%
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("shows vote counts alongside percentages", () => {
    const topicsWithVotes = [
      { id: "t1", text: "Option A", votes: 5 },
      { id: "t2", text: "Option B", votes: 0 },
    ];
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any, votingTopics: topicsWithVotes })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 60, votingTopics: topicsWithVotes }); });
    // Vote count "5" should appear
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("updates percentages when room:voting-update is received", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 60, votingTopics: TOPICS }); });
    act(() => {
      socket._emit("room:voting-update", {
        votingTopics: [
          { id: "t1", text: "AI will replace jobs",    votes: 2 },
          { id: "t2", text: "AI will create new jobs", votes: 2 },
          { id: "t3", text: "No net change",           votes: 0 },
        ],
      });
    });
    // Each of the two with votes = 50%
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — voting ended (room:voting-ended event)", () => {
  const endedTopics = [
    { id: "t1", text: "AI will replace jobs",    votes: 5 },
    { id: "t2", text: "AI will create new jobs", votes: 2 },
    { id: "t3", text: "No net change",           votes: 1 },
  ];

  it("shows selected-topic banner with winning motion text", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => {
      socket._emit("room:voting-ended", {
        votingTopics:  endedTopics,
        selectedTopic: "t1",
      });
    });
    // The banner span "✓ Motion selected: " is a unique text node — fine to use getByText on it
    expect(screen.getByText(/Motion selected:/i)).toBeInTheDocument();
    // The topic text also appears in the button — use getAllByText to handle multiple matches
    expect(screen.getAllByText("AI will replace jobs").length).toBeGreaterThan(0);
  });

  it("shows 🏆 trophy on the winning topic button", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => {
      socket._emit("room:voting-ended", { votingTopics: endedTopics, selectedTopic: "t1" });
    });
    expect(screen.getByText("🏆")).toBeInTheDocument();
  });

  it("disables topic buttons after voting ends", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => {
      socket._emit("room:voting-ended", { votingTopics: endedTopics, selectedTopic: "t1" });
    });
    const topicBtns = screen.getAllByRole("button").filter(b => TOPICS.some(t => b.textContent?.includes(t.text)));
    topicBtns.forEach(btn => expect(btn).toBeDisabled());
  });

  it("calls onVotingStatusChange(false) when voting ends", () => {
    const socket = createMockSocket();
    const onStatus = vi.fn();
    render(<VotingPanel {...makeProps({ socket: socket as any, onVotingStatusChange: onStatus })} />);
    act(() => {
      socket._emit("room:voting-ended", { votingTopics: endedTopics, selectedTopic: "t1" });
    });
    expect(onStatus).toHaveBeenCalledWith(false);
  });

  it("shows 'Run another vote' button for the host after voting ends", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ isHost: true, socket: socket as any })} />);
    act(() => {
      socket._emit("room:voting-ended", { votingTopics: endedTopics, selectedTopic: "t1" });
    });
    expect(screen.getByText(/Run another vote/i)).toBeInTheDocument();
  });

  it("does NOT show 'Run another vote' button for non-host guests", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ isHost: false, socket: socket as any })} />);
    act(() => {
      socket._emit("room:voting-ended", { votingTopics: endedTopics, selectedTopic: "t1" });
    });
    expect(screen.queryByText(/Run another vote/i)).not.toBeInTheDocument();
  });

  it("'Run another vote' button resets voting state so host can start again", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ isHost: true, socket: socket as any })} />);
    act(() => {
      socket._emit("room:voting-ended", { votingTopics: endedTopics, selectedTopic: "t1" });
    });
    fireEvent.click(screen.getByText(/Run another vote/i));
    // After reset: start-voting button visible, no banner, no trophy
    expect(screen.getByText(/Start Voting/i)).toBeInTheDocument();
    expect(screen.queryByText(/Motion selected:/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — socket lifecycle", () => {
  it("registers socket listeners on mount", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    expect(socket.on).toHaveBeenCalledWith("room:voting-started", expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith("room:voting-update",  expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith("room:voting-ended",   expect.any(Function));
  });

  it("deregisters socket listeners on unmount", () => {
    const socket = createMockSocket();
    const { unmount } = render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    unmount();
    expect(socket.off).toHaveBeenCalledWith("room:voting-started", expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith("room:voting-update",  expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith("room:voting-ended",   expect.any(Function));
  });

  it("does not register listeners when socket is null", () => {
    // Should not throw
    expect(() => render(<VotingPanel {...makeProps({ socket: null })} />)).not.toThrow();
  });

  it("emits room:get-state on mount to sync in-progress voting", () => {
    const socket = createMockSocket();
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    expect(socket.emit).toHaveBeenCalledWith(
      "room:get-state",
      { roomId: "room-1" },
      expect.any(Function)
    );
  });

  it("restores in-progress state from room:get-state callback when votingInProgress=true", () => {
    const socket = createMockSocket();
    const inProgressTopics = [
      { id: "t1", text: "Running topic", votes: 3 },
    ];
    socket.emit.mockImplementation((event: string, _: any, cb?: Function) => {
      if (event === "room:get-state" && cb) {
        cb({
          success: true,
          room: {
            votingInProgress: true,
            votingDuration:   45,
            votingTopics:     inProgressTopics,
          },
        });
      }
    });
    render(<VotingPanel {...makeProps({ socket: socket as any, votingTopics: inProgressTopics })} />);
    // Timer should be visible because voting was already in progress
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("does not restore state from room:get-state when votingInProgress=false", () => {
    const socket = createMockSocket();
    socket.emit.mockImplementation((event: string, _: any, cb?: Function) => {
      if (event === "room:get-state" && cb) {
        cb({ success: true, room: { votingInProgress: false } });
      }
    });
    render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    // No timer shown
    expect(screen.queryByText(/seconds/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("VotingPanel — props sync", () => {
  it("updates displayed topics when votingTopics prop changes and voting is not active", () => {
    const { rerender } = render(<VotingPanel {...makeProps()} />);
    const newTopics = [
      { id: "n1", text: "New topic alpha", votes: 0 },
      { id: "n2", text: "New topic beta",  votes: 0 },
    ];
    rerender(<VotingPanel {...makeProps({ votingTopics: newTopics })} />);
    expect(screen.getByText("New topic alpha")).toBeInTheDocument();
    expect(screen.getByText("New topic beta")).toBeInTheDocument();
    // Old topics gone
    expect(screen.queryByText("AI will replace jobs")).not.toBeInTheDocument();
  });

  it("does NOT sync prop changes into currentTopics while voting is active", () => {
    const socket = createMockSocket();
    const { rerender } = render(<VotingPanel {...makeProps({ socket: socket as any })} />);
    act(() => { socket._emit("room:voting-started", { votingDuration: 60, votingTopics: TOPICS }); });
    // Now change the prop — should not affect the locked-in voting topics
    const newTopics = [{ id: "nx", text: "Should not appear", votes: 0 }];
    rerender(<VotingPanel {...makeProps({ socket: socket as any, votingTopics: newTopics })} />);
    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
    expect(screen.getByText("AI will replace jobs")).toBeInTheDocument();
  });
});
