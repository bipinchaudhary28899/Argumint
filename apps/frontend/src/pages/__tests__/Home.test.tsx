/**
 * Home.test.tsx
 *
 * Unit + integration tests for the Home page.
 * Covers: auth states, user stats, judge credibility card, leaderboard,
 * navigation, theme picker, mobile/desktop layouts, Pro features,
 * win-rate edge cases, platform stats display, and module-level cache.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLogout  = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSetTheme  = vi.fn();
const mockUseTheme  = vi.fn();
vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => mockUseTheme(),
  THEMES: [
    { id: "light",   label: "Light",   icon: "☀️",  desc: "Clean lavender white"     },
    { id: "dark",    label: "Dark",    icon: "🌙",  desc: "Deep space"               },
    { id: "glacier", label: "Glacier", icon: "🧊",  desc: "Icy frosted glass · Lv.5" },
  ],
}));

const mockUseIsMobile = vi.fn(() => false);
vi.mock("../../hooks/useIsMobile", () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock("../../components/NavLogo", () => ({
  NavLogo: () => <div data-testid="nav-logo">Argumint</div>,
}));

vi.mock("../../components/ProWelcomeModal", () => ({
  ProWelcomeModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="pro-welcome-modal">
      <button onClick={onClose}>Close modal</button>
    </div>
  ),
}));

const mockGetStats       = vi.fn();
const mockGetLeaderboard = vi.fn();
vi.mock("../../services/api", () => ({
  platformApi: {
    getStats:       (...args: any[]) => mockGetStats(...args),
    getLeaderboard: (...args: any[]) => mockGetLeaderboard(...args),
  },
}));

vi.mock("@argumint/shared", () => ({
  getLevelInfo: (xp: number) => {
    if (xp >= 1200) return { current: { level: 5, title: "Orator" },   next: { level: 6, title: "Rhetorician" }, progressXP: xp - 1200, neededXP: 600, progressPct: Math.min(100, Math.round(((xp - 1200) / 600) * 100)), totalXP: xp };
    if (xp >= 750)  return { current: { level: 4, title: "Advocate" }, next: { level: 5, title: "Orator"      }, progressXP: xp - 750,  neededXP: 450, progressPct: Math.min(100, Math.round(((xp - 750)  / 450) * 100)), totalXP: xp };
    if (xp >= 400)  return { current: { level: 3, title: "Arguer" },   next: { level: 4, title: "Advocate"    }, progressXP: xp - 400,  neededXP: 350, progressPct: Math.min(100, Math.round(((xp - 400)  / 350) * 100)), totalXP: xp };
    if (xp >= 150)  return { current: { level: 2, title: "Debater" },  next: { level: 3, title: "Arguer"      }, progressXP: xp - 150,  neededXP: 250, progressPct: Math.min(100, Math.round(((xp - 150)  / 250) * 100)), totalXP: xp };
    return           { current: { level: 1, title: "Novice" },          next: { level: 2, title: "Debater"     }, progressXP: xp,         neededXP: 150, progressPct: Math.min(100, Math.round((xp           / 150) * 100)), totalXP: xp };
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: "user-1",
    username: "Alice",
    email: "alice@example.com",
    xp: 0,
    isPro: false,
    subscriptionStatus: null,
    stats: { debatesWon: 0, debatesLost: 0, totalDebates: 0 },
    judgeStats: {
      totalSessions:    0,
      credibilityScore: 0,
      credibilityBand:  "moderate",
      lastJudgedAt:     null,
    },
    ...overrides,
  };
}

function defaultTheme() {
  return {
    theme:    "light",
    setTheme: mockSetTheme,
    meta:     { id: "light", label: "Light", icon: "☀️", desc: "Clean lavender white" },
  };
}

// Import the real Home component once — cache reset is done via _resetCacheForTests
import { Home, _resetCacheForTests } from "../Home";

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

// ── Setup / Teardown ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level stats/leaderboard cache before every test
  _resetCacheForTests();
  mockUseIsMobile.mockReturnValue(false);
  mockUseTheme.mockReturnValue(defaultTheme());
  mockGetStats.mockResolvedValue({ activeRooms: 3, liveDebates: 1, totalDebates: 42 });
  mockGetLeaderboard.mockResolvedValue([]);
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH STATES
// ─────────────────────────────────────────────────────────────────────────────
describe("Auth states", () => {
  it("renders the page for a basic authenticated user", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getByText(/Argue smarter/i)).toBeInTheDocument();
  });

  it("shows the username in the nav", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ username: "TestUser" }), logout: mockLogout, isLoading: false });
    renderHome();
    // username appears in desktop nav AND player card — both should exist
    expect(screen.getAllByText("TestUser").length).toBeGreaterThan(0);
  });

  it("renders Upgrade button for non-Pro users", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ isPro: false }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getAllByText(/upgrade/i).length).toBeGreaterThan(0);
  });

  it("shows PRO badge for Pro users", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ isPro: true }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getAllByText(/PRO/i).length).toBeGreaterThan(0);
  });

  it("does not show upgrade CTA for Pro users", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ isPro: true }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.queryByText(/^⚡ Upgrade$/)).not.toBeInTheDocument();
  });

  it("shows 'ending' label for cancelled Pro subscription", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ isPro: true, subscriptionStatus: "cancelled" }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getByText(/ending/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER CARD — XP & LEVEL
// ─────────────────────────────────────────────────────────────────────────────
describe("Player card — XP and level", () => {
  it("shows Lv.1 and Novice for a brand new user (0 XP)", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 0 }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getAllByText(/Lv\.1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Novice/i).length).toBeGreaterThan(0);
  });

  it("shows Lv.5 and Orator for a user with 1200 XP", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 1200 }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getAllByText(/Lv\.5/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Orator/i).length).toBeGreaterThan(0);
  });

  it("shows total XP in the player card", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 850 }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getByText(/850 total XP/i)).toBeInTheDocument();
  });

  it("shows level progress label when not at max level", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 0 }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getByText(/Progress to Lv\.2/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLAYER CARD — WIN RATE STAT BOX
// ─────────────────────────────────────────────────────────────────────────────
describe("Win rate display", () => {
  it("shows '—' when user has played 0 debates", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ stats: { debatesWon: 0, debatesLost: 0, totalDebates: 0 } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows 100% win rate when user has won all debates", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ stats: { debatesWon: 5, debatesLost: 0, totalDebates: 5 } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
  });

  it("shows 50% win rate correctly", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ stats: { debatesWon: 3, debatesLost: 3, totalDebates: 6 } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });

  it("shows 0% when user has lost all debates", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ stats: { debatesWon: 0, debatesLost: 4, totalDebates: 4 } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  });

  it("rounds fractional win rate (1/3 → 33%)", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ stats: { debatesWon: 1, debatesLost: 2, totalDebates: 3 } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getAllByText("33%").length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JUDGE CREDIBILITY CARD
// ─────────────────────────────────────────────────────────────────────────────
describe("Judge credibility card", () => {
  it("shows teaser when user has 0 judge sessions", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getByText(/start building your credibility score/i)).toBeInTheDocument();
  });

  it("shows full credibility card when user has judged at least once", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 5, credibilityScore: 0.82, credibilityBand: "strong", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    // "Judge Credibility" heading + credibility bar label
    expect(screen.getAllByText(/Judge Credibility/i).length).toBeGreaterThan(0);
    // Score appears in both the bar label and the StatBox — at least one should be present
    expect(screen.getAllByText("82%").length).toBeGreaterThan(0);
  });

  it("shows 'strong' band badge correctly", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 10, credibilityScore: 0.90, credibilityBand: "strong", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    // Band badge text is uppercased via CSS but the DOM value is lowercase
    expect(screen.getAllByText(/strong/i).length).toBeGreaterThan(0);
  });

  it("shows 'moderate' band badge correctly", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 3, credibilityScore: 0.60, credibilityBand: "moderate", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    // "Moderate" also appears in the StatBox value
    expect(screen.getAllByText(/moderate/i).length).toBeGreaterThan(0);
  });

  it("shows 'flagged' band badge correctly", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 8, credibilityScore: 0.30, credibilityBand: "flagged", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getAllByText(/flagged/i).length).toBeGreaterThan(0);
  });

  it("shows 'last judged' date when lastJudgedAt is set", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 2, credibilityScore: 0.65, credibilityBand: "moderate", lastJudgedAt: "2026-04-10T00:00:00.000Z" } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getByText(/last judged/i)).toBeInTheDocument();
  });

  it("does not show 'last judged' when lastJudgedAt is null", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 1, credibilityScore: 0.70, credibilityBand: "moderate", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.queryByText(/last judged/i)).not.toBeInTheDocument();
  });

  it("shows session count in the stats row", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 7, credibilityScore: 0.75, credibilityBand: "strong", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    // "7" appears as the Sessions stat box value
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("defaults credibilityScore to 0 when judgeStats is missing", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: undefined }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    // Falls back to 0 sessions → teaser
    expect(screen.getByText(/start building your credibility score/i)).toBeInTheDocument();
  });

  it("shows 0% credibility score on first session", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 1, credibilityScore: 0, credibilityBand: "flagged", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
describe("Navigation", () => {
  it("navigates to /create-room on Create Room click", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getAllByText(/Create Room/i)[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/create-room");
  });

  it("navigates to /join-room on Join Room click", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getAllByText(/Join Room/i)[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/join-room");
  });

  it("navigates to /pricing when non-Pro clicks Upgrade", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ isPro: false }), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getAllByText(/upgrade/i)[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });

  it("calls logout and navigates to /login on Logout click", async () => {
    mockLogout.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await act(async () => { fireEvent.click(screen.getByText(/logout/i)); });
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("navigates to /level-rewards when the player card is clicked", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    // PlayerCard itself has onClick and contains the "total XP" text — click it
    fireEvent.click(screen.getByText(/0 total XP/i));
    expect(mockNavigate).toHaveBeenCalledWith("/level-rewards");
  });

  it("navigates to /pricing when Pro badge is clicked", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ isPro: true }), logout: mockLogout, isLoading: false });
    renderHome();
    // The PRO badge in the nav has onClick → navigate("/pricing")
    const proBadges = screen.getAllByText(/PRO$/i);
    fireEvent.click(proBadges[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM STATS
// ─────────────────────────────────────────────────────────────────────────────
describe("Platform stats", () => {
  it("shows total debate count after loading", async () => {
    mockGetStats.mockResolvedValue({ activeRooms: 2, liveDebates: 0, totalDebates: 123 });
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      expect(screen.getAllByText("123").length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it("shows live debates indicator when liveDebates > 0", async () => {
    mockGetStats.mockResolvedValue({ activeRooms: 1, liveDebates: 3, totalDebates: 50 });
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      expect(screen.getByText(/3 live/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("does not show live indicator when liveDebates is 0", async () => {
    mockGetStats.mockResolvedValue({ activeRooms: 0, liveDebates: 0, totalDebates: 10 });
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      expect(screen.queryByText(/live now/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows active rooms count", async () => {
    mockGetStats.mockResolvedValue({ activeRooms: 7, liveDebates: 0, totalDebates: 20 });
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      expect(screen.getAllByText("7").length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it("handles API failure gracefully — no crash", async () => {
    mockGetStats.mockRejectedValue(new Error("Network error"));
    mockGetLeaderboard.mockRejectedValue(new Error("Network error"));
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    expect(() => renderHome()).not.toThrow();
    // Drain microtasks so the .catch() inside the component fires before the test exits
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────
describe("Leaderboard", () => {
  it("shows empty state when leaderboard has no entries", async () => {
    mockGetLeaderboard.mockResolvedValue([]);
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      expect(screen.getAllByText(/be the first/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it("renders top debater entries", async () => {
    mockGetLeaderboard.mockResolvedValue([
      { id: "u1", username: "Bob",   xp: 5000, debatesWon: 20, totalDebates: 30 },
      { id: "u2", username: "Carol", xp: 3000, debatesWon: 10, totalDebates: 15 },
    ]);
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Carol")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("highlights the current user in the leaderboard", async () => {
    // Bob is ranked first; Alice is second so gets the 👤 marker (not the crown)
    mockGetLeaderboard.mockResolvedValue([
      { id: "u2",     username: "Bob",   xp: 1200, debatesWon: 8, totalDebates: 10 },
      { id: "user-1", username: "Alice", xp: 800,  debatesWon: 5, totalDebates: 8  },
    ]);
    mockUseAuth.mockReturnValue({ user: makeUser({ id: "user-1", username: "Alice" }), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      // The span for Alice (isMe=true, isFirst=false) renders "Alice 👤"
      const span = screen.getByText((_, el) =>
        el?.tagName === "SPAN" &&
        (el?.textContent ?? "").includes("Alice") &&
        (el?.textContent ?? "").includes("👤")
      );
      expect(span).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows first place with crown emoji", async () => {
    mockGetLeaderboard.mockResolvedValue([
      { id: "u1", username: "TopDog", xp: 9000, debatesWon: 50, totalDebates: 55 },
    ]);
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      expect(screen.getByText(/👑.*TopDog/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows top debater in social strip", async () => {
    mockGetLeaderboard.mockResolvedValue([
      { id: "u1", username: "TopDog", xp: 9000, debatesWon: 50, totalDebates: 55 },
    ]);
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    await waitFor(() => {
      expect(screen.getByText(/Top debater:/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THEME PICKER
// ─────────────────────────────────────────────────────────────────────────────
describe("Theme picker", () => {
  it("opens theme picker when theme button is clicked", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByTitle(/change theme/i));
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("Glacier")).toBeInTheDocument();
  });

  it("calls setTheme('dark') when Dark option is clicked", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByTitle(/change theme/i));
    fireEvent.click(screen.getByText("Dark"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("shows 🔒 icon on Glacier theme option for Lv.1 user", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 0 }), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByTitle(/change theme/i));
    // Locked theme renders a 🔒 icon next to Glacier
    expect(screen.getByText("🔒")).toBeInTheDocument();
  });

  it("does not show 🔒 icon for Glacier when user is Lv.5", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 1200 }), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByTitle(/change theme/i));
    // At Lv.5 the theme is unlocked — no lock icon
    expect(screen.queryByText("🔒")).not.toBeInTheDocument();
  });

  it("closes theme picker when backdrop is clicked", async () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByTitle(/change theme/i));
    expect(screen.getByText("Theme")).toBeInTheDocument();
    const backdrop = document.querySelector('div[style*="position: fixed"][style*="z-index: 99"]') as HTMLElement;
    if (backdrop) fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByText("Theme")).not.toBeInTheDocument());
  });

  it("does not apply locked theme when Glacier is clicked at low level", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 0 }), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByTitle(/change theme/i));
    fireEvent.click(screen.getByText("Glacier"));
    // setTheme should NOT have been called for the locked theme
    expect(mockSetTheme).not.toHaveBeenCalledWith("glacier");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
describe("Mobile layout", () => {
  beforeEach(() => { mockUseIsMobile.mockReturnValue(true); });

  it("renders bottom navigation tabs on mobile", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(screen.getByText("Me")).toBeInTheDocument();
  });

  it("switches to leaderboard tab on mobile", async () => {
    mockGetLeaderboard.mockResolvedValue([
      { id: "u1", username: "Rank1", xp: 5000, debatesWon: 10, totalDebates: 12 },
    ]);
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    // Flush the API promise so leaderboard state is populated before switching tabs
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    // Click the Rank tab inside act so React flushes the tab-switch re-render
    await act(async () => { fireEvent.click(screen.getByText("Rank")); });
    // Rank1 is index 0 so it renders as "👑 Rank1" — use regex to match substring
    await waitFor(() => {
      expect(screen.getByText(/Rank1/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("switches to profile tab and shows player card", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ username: "MobileUser" }), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByText("Me"));
    // MobilePlayerCard should now be visible — username appears at least twice
    expect(screen.getAllByText("MobileUser").length).toBeGreaterThan(0);
  });

  it("shows sign out button in mobile profile tab", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    fireEvent.click(screen.getByText("Me"));
    expect(screen.getByText(/sign out/i)).toBeInTheDocument();
  });

  it("shows judge teaser card in mobile profile tab when sessions = 0", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 0, credibilityScore: 0, credibilityBand: "moderate", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    fireEvent.click(screen.getByText("Me"));
    expect(screen.getByText(/start building your credibility score/i)).toBeInTheDocument();
  });

  it("shows full judge card in mobile profile tab when sessions > 0", () => {
    mockUseAuth.mockReturnValue({
      user: makeUser({ judgeStats: { totalSessions: 3, credibilityScore: 0.70, credibilityBand: "moderate", lastJudgedAt: null } }),
      logout: mockLogout,
      isLoading: false,
    });
    renderHome();
    fireEvent.click(screen.getByText("Me"));
    expect(screen.getAllByText(/Judge Credibility/i).length).toBeGreaterThan(0);
  });

  it("does not render the desktop sidebar nav logout button on mobile", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    // Desktop nav renders a "Logout" button — mobile uses bottom tabs with "Sign Out" in the profile tab
    // Without clicking "Me" the sign-out button is hidden, so neither text should be present
    expect(screen.queryByText("Logout")).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PRO WELCOME MODAL
// ─────────────────────────────────────────────────────────────────────────────
describe("Pro welcome modal", () => {
  it("shows Pro welcome modal for a brand new Pro user", () => {
    const proUser = makeUser({ isPro: true, id: "pro-user-1" });
    localStorage.removeItem("proWelcome_pro-user-1");
    mockUseAuth.mockReturnValue({ user: proUser, logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getByTestId("pro-welcome-modal")).toBeInTheDocument();
  });

  it("does not show Pro welcome modal when already dismissed", () => {
    const proUser = makeUser({ isPro: true, id: "pro-user-2" });
    localStorage.setItem("proWelcome_pro-user-2", "1");
    mockUseAuth.mockReturnValue({ user: proUser, logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.queryByTestId("pro-welcome-modal")).not.toBeInTheDocument();
  });

  it("does not show Pro welcome modal for non-Pro users", () => {
    mockUseAuth.mockReturnValue({ user: makeUser({ isPro: false }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.queryByTestId("pro-welcome-modal")).not.toBeInTheDocument();
  });

  it("closes Pro welcome modal when onClose is triggered", async () => {
    const proUser = makeUser({ isPro: true, id: "pro-user-3" });
    localStorage.removeItem("proWelcome_pro-user-3");
    mockUseAuth.mockReturnValue({ user: proUser, logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getByTestId("pro-welcome-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Close modal"));
    await waitFor(() => expect(screen.queryByTestId("pro-welcome-modal")).not.toBeInTheDocument());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE CARDS (desktop only)
// ─────────────────────────────────────────────────────────────────────────────
describe("Feature cards (desktop)", () => {
  it("renders all three feature cards", () => {
    mockUseIsMobile.mockReturnValue(false);
    mockUseAuth.mockReturnValue({ user: makeUser(), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getByText("AI Judging")).toBeInTheDocument();
    expect(screen.getByText("Live Transcription")).toBeInTheDocument();
    expect(screen.getByText("Ranked Play")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GLACIER THEME RENDERING
// ─────────────────────────────────────────────────────────────────────────────
describe("Glacier theme rendering", () => {
  it("renders without error in glacier theme for a Lv.5+ user", () => {
    mockUseTheme.mockReturnValue({
      theme:    "glacier",
      setTheme: mockSetTheme,
      meta:     { id: "glacier", label: "Glacier", icon: "🧊", desc: "Icy frosted glass · Lv.5" },
    });
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 1200 }), logout: mockLogout, isLoading: false });
    expect(() => renderHome()).not.toThrow();
  });

  it("renders the hero heading with glacier gradient style", () => {
    mockUseTheme.mockReturnValue({
      theme:    "glacier",
      setTheme: mockSetTheme,
      meta:     { id: "glacier", label: "Glacier", icon: "🧊", desc: "Icy frosted glass · Lv.5" },
    });
    mockUseAuth.mockReturnValue({ user: makeUser({ xp: 1200 }), logout: mockLogout, isLoading: false });
    renderHome();
    expect(screen.getByText(/Argue smarter/i)).toBeInTheDocument();
  });
});
