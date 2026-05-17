import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockCheckAuth, mockGetMe } = vi.hoisted(() => ({
  mockCheckAuth: vi.fn(),
  mockGetMe:     vi.fn(),
}));

// AuthContext — default: unauthenticated, isLoading=false
let mockAuthUser: any = null;
vi.mock("./contexts/AuthContext", () => ({
  AuthProvider: ({ children }: any) => <>{children}</>,
  useAuth:      () => ({ user: mockAuthUser, isLoading: false, checkAuth: mockCheckAuth }),
}));

vi.mock("./contexts/RoomContext", () => ({
  RoomProvider: ({ children }: any) => <>{children}</>,
}));

vi.mock("./contexts/ThemeContext", () => ({
  ThemeProvider: ({ children }: any) => <>{children}</>,
}));

// Stub every page/component to a minimal element
vi.mock("./components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: any) => <>{children}</>,
}));
vi.mock("./pages/Login",               () => ({ Login:               () => <div>Login</div>                }));
vi.mock("./pages/Register",            () => ({ Register:            () => <div>Register</div>             }));
vi.mock("./pages/Home",                () => ({ Home:                () => <div>Home</div>                 }));
vi.mock("./pages/CreateRoom",          () => ({ CreateRoom:          () => <div>CreateRoom</div>           }));
vi.mock("./pages/JoinRoom",            () => ({ JoinRoom:            () => <div>JoinRoom</div>             }));
vi.mock("./pages/RoomLobby",           () => ({ RoomLobby:           () => <div>RoomLobby</div>           }));
vi.mock("./pages/PrepScreen",          () => ({ PrepScreen:          () => <div>PrepScreen</div>          }));
vi.mock("./pages/DebatePage",          () => ({ DebatePage:          () => <div>DebatePage</div>          }));
vi.mock("./pages/ResultPage",          () => ({ ResultPage:          () => <div>ResultPage</div>          }));
vi.mock("./pages/PricingPage",         () => ({ PricingPage:         () => <div>PricingPage</div>        }));
vi.mock("./pages/SubscriptionSuccess", () => ({ SubscriptionSuccess: () => <div>SubscriptionSuccess</div>}));
vi.mock("./pages/SubscriptionCancel",  () => ({ SubscriptionCancel:  () => <div>SubscriptionCancel</div> }));
vi.mock("./pages/LevelRewards",        () => ({ LevelRewards:        () => <div>LevelRewards</div>       }));
vi.mock("./pages/DebateAnalysisPage",  () => ({ DebateAnalysisPage:  () => <div>DebateAnalysisPage</div> }));

import App from "./App";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUser = null;
  document.documentElement.removeAttribute("data-tier");
});

function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("App routing", () => {
  it("renders without crashing at /", () => {
    renderApp("/");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders Login at /login", () => {
    renderApp("/login");
    expect(screen.getByText("Login")).toBeInTheDocument();
  });

  it("renders Register at /register", () => {
    renderApp("/register");
    expect(screen.getByText("Register")).toBeInTheDocument();
  });

  it("renders PricingPage at /pricing", () => {
    renderApp("/pricing");
    expect(screen.getByText("PricingPage")).toBeInTheDocument();
  });

  it("renders SubscriptionSuccess at /subscription/success", () => {
    renderApp("/subscription/success");
    expect(screen.getByText("SubscriptionSuccess")).toBeInTheDocument();
  });

  it("renders SubscriptionCancel at /subscription/cancel", () => {
    renderApp("/subscription/cancel");
    expect(screen.getByText("SubscriptionCancel")).toBeInTheDocument();
  });

  it("redirects unknown routes to /", () => {
    renderApp("/this-does-not-exist");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("ProTierSync", () => {
  it("sets data-tier='pro' on <html> when user.isPro is true", () => {
    mockAuthUser = { isPro: true };
    renderApp("/");
    expect(document.documentElement.getAttribute("data-tier")).toBe("pro");
  });

  it("removes data-tier from <html> when user.isPro is false", () => {
    document.documentElement.setAttribute("data-tier", "pro");
    mockAuthUser = { isPro: false };
    renderApp("/");
    expect(document.documentElement.hasAttribute("data-tier")).toBe(false);
  });

  it("removes data-tier when user is null", () => {
    document.documentElement.setAttribute("data-tier", "pro");
    mockAuthUser = null;
    renderApp("/");
    expect(document.documentElement.hasAttribute("data-tier")).toBe(false);
  });
});
