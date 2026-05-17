import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockNavigate, mockRegister } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRegister: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

let mockIsLoading = false;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ register: mockRegister, isLoading: mockIsLoading }),
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { Register } from "../Register";

function renderPage() {
  return render(<Register />);
}

function fillForm(opts: {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
} = {}) {
  const {
    username        = "aliceXYZ",
    email           = "alice@example.com",
    password        = "Password1",
    confirmPassword = "Password1",
  } = opts;

  if (username !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Pick a callsign"), {
      target: { name: "username", value: username },
    });
  }
  if (email !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { name: "email", value: email },
    });
  }
  if (password !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number"), {
      target: { name: "password", value: password },
    });
  }
  if (confirmPassword !== undefined) {
    fireEvent.change(screen.getByPlaceholderText("Repeat password"), {
      target: { name: "confirmPassword", value: confirmPassword },
    });
  }
}

function submit() {
  fireEvent.click(screen.getByText("Create Account →"));
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockRegister.mockResolvedValue(undefined);
  });

  // ── Page structure ─────────────────────────────────────────────────────────
  describe("page structure", () => {
    it("renders 'Join the arena' heading", () => {
      renderPage();
      expect(screen.getByText("Join the arena")).toBeInTheDocument();
    });

    it("renders 'Pick a callsign and start debating' subtitle", () => {
      renderPage();
      expect(screen.getByText("Pick a callsign and start debating")).toBeInTheDocument();
    });

    it("renders Argumint logo", () => {
      renderPage();
      expect(screen.getByAltText("Argumint")).toBeInTheDocument();
    });

    it("renders 'Create your account' label", () => {
      renderPage();
      expect(screen.getByText("Create your account")).toBeInTheDocument();
    });

    it("renders username input", () => {
      renderPage();
      expect(screen.getByPlaceholderText("Pick a callsign")).toBeInTheDocument();
    });

    it("renders email input", () => {
      renderPage();
      expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    });

    it("renders password input", () => {
      renderPage();
      expect(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number")).toBeInTheDocument();
    });

    it("renders confirm password input", () => {
      renderPage();
      expect(screen.getByPlaceholderText("Repeat password")).toBeInTheDocument();
    });

    it("renders 'Create Account →' submit button", () => {
      renderPage();
      expect(screen.getByText("Create Account →")).toBeInTheDocument();
    });

    it("renders '← Back' navigation button", () => {
      renderPage();
      expect(screen.getByText("← Back")).toBeInTheDocument();
    });

    it("'← Back' navigates to /", () => {
      renderPage();
      fireEvent.click(screen.getByText("← Back"));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("renders 'Sign in' link to /login", () => {
      renderPage();
      const link = screen.getByText("Sign in");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/login");
    });
  });

  // ── Form validation ────────────────────────────────────────────────────────
  describe("form validation", () => {
    it("shows 'Username is required' when username is blank", () => {
      renderPage();
      fillForm({ username: "" });
      submit();
      expect(screen.getByText("Username is required")).toBeInTheDocument();
    });

    it("shows '3–30 characters' for too-short username", () => {
      renderPage();
      fillForm({ username: "ab" });
      submit();
      expect(screen.getByText("3–30 characters")).toBeInTheDocument();
    });

    it("shows '3–30 characters' for too-long username (31 chars)", () => {
      renderPage();
      fillForm({ username: "a".repeat(31) });
      submit();
      expect(screen.getByText("3–30 characters")).toBeInTheDocument();
    });

    it("shows 'Email is required' when email is blank", () => {
      renderPage();
      fillForm({ email: "" });
      submit();
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });

    it("shows 'Invalid email' for email without proper domain dot", () => {
      // Uses an email that passes HTML constraint validation but fails custom regex
      renderPage();
      fillForm({ email: "test@invalid" });
      submit();
      expect(screen.getByText("Invalid email")).toBeInTheDocument();
    });

    it("shows 'Password is required' when password is blank", () => {
      renderPage();
      fillForm({ password: "", confirmPassword: "" });
      submit();
      expect(screen.getByText("Password is required")).toBeInTheDocument();
    });

    it("shows 'At least 8 characters' for short password", () => {
      renderPage();
      fillForm({ password: "Ab1", confirmPassword: "Ab1" });
      submit();
      expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    });

    it("shows 'Needs an uppercase letter' for lowercase-only password", () => {
      renderPage();
      fillForm({ password: "password1", confirmPassword: "password1" });
      submit();
      expect(screen.getByText("Needs an uppercase letter")).toBeInTheDocument();
    });

    it("shows 'Needs a number' for password without digits", () => {
      renderPage();
      fillForm({ password: "Password!", confirmPassword: "Password!" });
      submit();
      expect(screen.getByText("Needs a number")).toBeInTheDocument();
    });

    it("shows 'Passwords don't match' when confirm differs", () => {
      renderPage();
      fillForm({ password: "Password1", confirmPassword: "Different1" });
      submit();
      expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    });

    it("clears a field error when user starts typing in that field", () => {
      renderPage();
      fillForm({ username: "" });
      submit();
      expect(screen.getByText("Username is required")).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText("Pick a callsign"), {
        target: { name: "username", value: "a" },
      });
      expect(screen.queryByText("Username is required")).not.toBeInTheDocument();
    });

    it("does not call register() when validation fails", () => {
      renderPage();
      fillForm({ username: "" });
      submit();
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  // ── Successful registration ────────────────────────────────────────────────
  describe("successful registration", () => {
    it("calls register() with username, email, password (no confirmPassword)", async () => {
      renderPage();
      fillForm();
      submit();
      await waitFor(() =>
        expect(mockRegister).toHaveBeenCalledWith({
          username: "aliceXYZ",
          email:    "alice@example.com",
          password: "Password1",
        })
      );
    });

    it("navigates to / after successful registration", async () => {
      renderPage();
      fillForm();
      submit();
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith("/")
      );
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("shows 'Creating account…' while isLoading", () => {
      mockIsLoading = true;
      renderPage();
      expect(screen.getByText("Creating account…")).toBeInTheDocument();
    });

    it("submit button is disabled while loading", () => {
      mockIsLoading = true;
      renderPage();
      expect(screen.getByText("Creating account…")).toBeDisabled();
    });
  });

  // ── Registration error ─────────────────────────────────────────────────────
  describe("registration errors", () => {
    it("shows error message when register() throws", async () => {
      mockRegister.mockRejectedValue(new Error("Username already taken"));
      renderPage();
      fillForm();
      submit();
      await waitFor(() =>
        expect(screen.getByText("Username already taken")).toBeInTheDocument()
      );
    });

    it("shows 'Registration failed' for non-Error throws", async () => {
      mockRegister.mockRejectedValue("unexpected");
      renderPage();
      fillForm();
      submit();
      await waitFor(() =>
        expect(screen.getByText("Registration failed")).toBeInTheDocument()
      );
    });
  });
});
