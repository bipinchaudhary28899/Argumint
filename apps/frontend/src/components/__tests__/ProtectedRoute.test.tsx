/**
 * ProtectedRoute.test.tsx
 *
 * Tests for the ProtectedRoute gate component.
 *
 * Decision matrix:
 *   isLoading && !user       → show loading spinner
 *   isLoading &&  user       → show children (no spinner flash for cached user)
 *   !user && !guestOnly      → <Navigate to="/login" />
 *    user &&  guestOnly      → <Navigate to="/" />
 *    user && !guestOnly      → render children
 *   !user &&  guestOnly      → render children (public guest-only pages)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";
import { ProtectedRoute } from "../ProtectedRoute";

// ── Mock AuthContext ──────────────────────────────────────────────────────────

const mockUseAuth = vi.fn();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, any> = {}) {
  return { id: "u1", username: "Alice", email: "alice@example.com", ...overrides };
}

/**
 * Render <ProtectedRoute> inside a MemoryRouter with /login and / routes so
 * that <Navigate> redirects can actually be verified via the rendered text.
 */
function renderRoute(
  guestOnly: boolean,
  initialPath = "/"
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute guestOnly={guestOnly}>
              <div data-testid="protected-children">Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route path="/home"  element={<div data-testid="home-page">Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Loading spinner ───────────────────────────────────────────────────────────

describe("ProtectedRoute — loading spinner", () => {
  it("shows loading spinner when isLoading=true and there is no cached user", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    renderRoute(false);
    expect(screen.getByAltText(/Loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId("protected-children")).not.toBeInTheDocument();
  });

  it("does NOT show the spinner when isLoading=true but a cached user already exists", () => {
    // The user is seeded from localStorage — we already have data, avoid full-screen flash.
    mockUseAuth.mockReturnValue({ user: makeUser(), isLoading: true });
    renderRoute(false);
    expect(screen.queryByAltText(/Loading/i)).not.toBeInTheDocument();
  });

  it("renders children (not spinner) once loading is false and user exists", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), isLoading: false });
    renderRoute(false);
    expect(screen.getByTestId("protected-children")).toBeInTheDocument();
    expect(screen.queryByAltText(/Loading/i)).not.toBeInTheDocument();
  });

  it("spinner img has the correct logo src", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });
    renderRoute(false);
    expect(screen.getByAltText(/Loading/i)).toHaveAttribute("src", "/logo/logo.png");
  });
});

// ── Protected (auth-required) routes ─────────────────────────────────────────

describe("ProtectedRoute — guestOnly=false (auth-required pages)", () => {
  it("renders children when user is authenticated", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), isLoading: false });
    renderRoute(false);
    expect(screen.getByTestId("protected-children")).toBeInTheDocument();
  });

  it("redirects to /login when user is null (unauthenticated)", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    renderRoute(false);
    expect(screen.queryByTestId("protected-children")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("does not redirect when user is present, even if isLoading is still true", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), isLoading: true });
    renderRoute(false);
    expect(screen.getByTestId("protected-children")).toBeInTheDocument();
  });
});

// ── Guest-only routes (login / register pages) ────────────────────────────────

describe("ProtectedRoute — guestOnly=true (guest-only pages)", () => {
  it("renders children when user is null (visitor on login page)", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute guestOnly>
                <div data-testid="login-form">Login Form</div>
              </ProtectedRoute>
            }
          />
          <Route path="/home" element={<div data-testid="home-page">Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
  });

  it("redirects to / (home) when a logged-in user visits a guest-only page", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), isLoading: false });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              <ProtectedRoute guestOnly>
                <div data-testid="login-form">Login Form</div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByTestId("login-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  it("does not show spinner for guest-only page with no user (isLoading=false)", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute guestOnly>
                <div>Form</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByAltText(/Loading/i)).not.toBeInTheDocument();
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("ProtectedRoute — edge cases", () => {
  it("guestOnly defaults to false when not specified", () => {
    // Without guestOnly, an authenticated user sees their content (no redirect to /)
    mockUseAuth.mockReturnValue({ user: makeUser(), isLoading: false });
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              // guestOnly prop intentionally omitted
              <ProtectedRoute>
                <div data-testid="page">Page</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  it("renders nested children (complex child tree) correctly", () => {
    mockUseAuth.mockReturnValue({ user: makeUser(), isLoading: false });
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>
                  <header data-testid="header">Header</header>
                  <main data-testid="main">Main</main>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("main")).toBeInTheDocument();
  });

  it("does not flash spinner when isLoading transitions from true to false with a user", () => {
    // Start with isLoading=true + user (no spinner shown due to cached user)
    const { rerender } = render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div data-testid="content">Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    mockUseAuth.mockReturnValue({ user: makeUser(), isLoading: true });
    rerender(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div data-testid="content">Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    // No spinner because user is already available
    expect(screen.queryByAltText(/Loading/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});
