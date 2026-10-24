/**
 * AppShell.test.tsx
 *
 * Tests for the global app chrome: sidebar / tab-bar navigation, active
 * item, theme picker, logout, Go Pro card, dev previews and the initials helper.
 * (This coverage used to live in Home.test.tsx when Home owned its own nav.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockLogout  = vi.fn();
const mockUseAuth = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSetTheme = vi.fn();
let mockTheme = "light";
vi.mock("../../contexts/ThemeContext", () => {
  const THEMES = [
    { id: "light",   label: "Light",   icon: "☀️", desc: "Clean lavender white"     },
    { id: "dark",    label: "Dark",    icon: "🌙", desc: "Deep space"               },
    { id: "glacier", label: "Glacier", icon: "🧊", desc: "Icy frosted glass · Lv.5" },
  ];
  return {
    THEMES,
    useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme, meta: THEMES.find(t => t.id === mockTheme) }),
  };
});

vi.mock("@argumint/shared", () => ({
  getLevelInfo: (xp: number) => xp >= 1200
    ? { current: { level: 5, title: "Orator" }, next: { level: 6, title: "Rhetorician" } }
    : { current: { level: 1, title: "Novice" }, next: { level: 2, title: "Debater" } },
}));

import { AppShell, initials, type ShellNavId } from "../AppShell";

// ── Helpers ────────────────────────────────────────────────────────────────────

const DEV_EMAIL = "bkumar28899@gmail.com";

function asUser(overrides: Record<string, any> = {}) {
  mockUseAuth.mockReturnValue({
    user: { id: "user-1", username: "Ashish Joshi", email: "a@example.com", xp: 0, isPro: false, ...overrides },
    logout: mockLogout,
  });
}

function renderShell(active: ShellNavId = "home") {
  return render(<AppShell active={active}><p>Page body</p></AppShell>);
}

const sidebar = () => within(screen.getAllByRole("navigation", { name: "Main" })[0]);
const tabbar  = () => within(screen.getAllByRole("navigation", { name: "Main" })[1]);

beforeEach(() => {
  vi.clearAllMocks();
  mockTheme = "light";
  asUser();
});

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
describe("AppShell — layout", () => {
  it("renders the page content inside <main>", () => {
    renderShell();
    expect(within(screen.getByRole("main")).getByText("Page body")).toBeInTheDocument();
  });

  it("shows the user's name, initials and level line", () => {
    renderShell();
    expect(screen.getByText("Ashish Joshi")).toBeInTheDocument();
    expect(screen.getAllByText("AJ").length).toBeGreaterThan(0);
    expect(screen.getByText("Lv 1 · Novice")).toBeInTheDocument();
    expect(screen.getByText("Lv 1")).toBeInTheDocument(); // mobile top-bar pill
  });

  it("navigates home from the logo", () => {
    renderShell("history");
    fireEvent.click(screen.getAllByRole("button", { name: "Argumint home" })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
describe("AppShell — navigation", () => {
  it.each([
    ["Home",              "/"],
    ["Create room",       "/create-room"],
    ["Join room",         "/join-room"],
    ["Leaderboard",       "/leaderboard"],
    ["Match history",     "/history"],
    ["Judge credibility", "/judge-credibility"],
    ["Level rewards",     "/level-rewards"],
    ["Pro",               "/pricing"],
  ])("sidebar '%s' navigates to %s", (label, path) => {
    renderShell(null);
    fireEvent.click(sidebar().getByRole("button", { name: label }));
    expect(mockNavigate).toHaveBeenCalledWith(path);
  });

  it.each([
    ["Home",    "/"],
    ["Create",  "/create-room"],
    ["Join",    "/join-room"],
    ["Ranks",   "/leaderboard"],
    ["History", "/history"],
  ])("tab bar '%s' navigates to %s", (label, path) => {
    renderShell(null);
    fireEvent.click(tabbar().getByRole("button", { name: label }));
    expect(mockNavigate).toHaveBeenCalledWith(path);
  });

  it("marks only the active item with aria-current in sidebar and tab bar", () => {
    renderShell("leaderboard");
    expect(sidebar().getByRole("button", { name: "Leaderboard" })).toHaveAttribute("aria-current", "page");
    expect(sidebar().getByRole("button", { name: "Home" })).not.toHaveAttribute("aria-current");
    expect(tabbar().getByRole("button", { name: "Ranks" })).toHaveAttribute("aria-current", "page");
    expect(tabbar().getByRole("button", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("has no active item when active is null", () => {
    renderShell(null);
    const all = screen.getAllByRole("navigation", { name: "Main" }).flatMap(n => within(n).getAllByRole("button"));
    expect(all.some(b => b.getAttribute("aria-current") === "page")).toBe(false);
  });

  it("opens level rewards from the avatar", () => {
    renderShell();
    fireEvent.click(screen.getByTitle("Profile and rewards"));
    expect(mockNavigate).toHaveBeenCalledWith("/level-rewards");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THEME PICKER
// ─────────────────────────────────────────────────────────────────────────────
describe("AppShell — theme picker", () => {
  const openSideMenu = () => fireEvent.click(screen.getAllByTitle(/change theme/i)[0]);

  it("shows the current theme label on the sidebar button", () => {
    mockTheme = "dark";
    renderShell();
    expect(screen.getByText("Dark theme")).toBeInTheDocument();
  });

  it("opens the theme menu with every theme", () => {
    renderShell();
    expect(screen.queryByRole("menu", { name: "Theme" })).not.toBeInTheDocument();
    openSideMenu();
    const menu = within(screen.getByRole("menu", { name: "Theme" }));
    expect(menu.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(menu.getByRole("menuitemradio", { name: /Light/ })).toHaveAttribute("aria-checked", "true");
  });

  it.each(["dark", "glacier"])("calls setTheme('%s') and closes the menu", (id) => {
    renderShell();
    openSideMenu();
    const label = id === "dark" ? /Dark/ : /Glacier/;
    fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
    expect(mockSetTheme).toHaveBeenCalledWith(id);
    expect(screen.queryByRole("menu", { name: "Theme" })).not.toBeInTheDocument();
  });

  it("closes the menu when the backdrop is clicked", () => {
    renderShell();
    openSideMenu();
    fireEvent.click(document.querySelector(".shell-menu-backdrop")!);
    expect(screen.queryByRole("menu", { name: "Theme" })).not.toBeInTheDocument();
  });

  it("opens the menu from the mobile top bar too", () => {
    renderShell();
    const topButton = screen.getAllByTitle(/change theme/i)[1];
    fireEvent.click(topButton);
    expect(topButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Dark/ }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
describe("AppShell — logout", () => {
  it("calls logout() then navigates to /login", async () => {
    const order: string[] = [];
    mockLogout.mockImplementation(async () => { order.push("logout"); });
    mockNavigate.mockImplementation((p: string) => { order.push(`nav:${p}`); });
    renderShell();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Log out" })); });
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["logout", "nav:/login"]);
  });

  it("disables the button while logging out and re-enables it on failure", async () => {
    let reject!: (e: Error) => void;
    mockLogout.mockReturnValue(new Promise((_, r) => { reject = r; }));
    renderShell();
    const btn = screen.getByRole("button", { name: "Log out" });
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    await act(async () => { reject(new Error("nope")); });
    await waitFor(() => expect(btn).not.toBeDisabled());
    expect(mockNavigate).not.toHaveBeenCalledWith("/login");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GO PRO + DEV PREVIEWS
// ─────────────────────────────────────────────────────────────────────────────
describe("AppShell — Go Pro card", () => {
  it("shows the Go Pro card for non-Pro users and links to /pricing", () => {
    renderShell();
    fireEvent.click(screen.getByText("GO PRO"));
    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });

  it("hides the Go Pro card for Pro users", () => {
    asUser({ isPro: true });
    renderShell();
    expect(screen.queryByText("GO PRO")).not.toBeInTheDocument();
  });
});

describe("AppShell — dev previews", () => {
  it("does not show dev previews for regular users", () => {
    renderShell();
    expect(screen.queryByLabelText("Dev previews")).not.toBeInTheDocument();
  });

  it.each([
    ["Preview result page",                   "/room/PREVIEW/result/preview"],
    ["Preview debate arena (alternate mode)", "/room/PREVIEW/debate/preview"],
    ["Preview debate arena (buzzer mode)",    "/room/PREVIEW/debate/preview-buzzer"],
  ])("shows '%s' for the dev email and navigates to %s", (title, path) => {
    asUser({ email: DEV_EMAIL });
    renderShell();
    fireEvent.click(within(screen.getByLabelText("Dev previews")).getByTitle(title));
    expect(mockNavigate).toHaveBeenCalledWith(path);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// initials()
// ─────────────────────────────────────────────────────────────────────────────
describe("initials()", () => {
  it.each([
    ["Ashish Joshi", "AJ"],
    ["ashish",       "A"],
    ["  a  b  c ",   "AB"],
    ["",             "?"],
    [null,           "?"],
    [undefined,      "?"],
  ])("%j → %s", (name, out) => {
    expect(initials(name as any)).toBe(out);
  });
});
