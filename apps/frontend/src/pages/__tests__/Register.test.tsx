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
    fireEvent.change(screen.getByPlaceholderText("Create a password"), {
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
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
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
    it("renders 'Create your account' heading", () => {
      renderPage();
      expect(screen.getByRole("heading", { level: 2, name: "Create your account" })).toBeInTheDocument();
    });

    it("renders 'Pick a name other debaters will see.' subtitle", () => {
      renderPage();
      expect(screen.getByText("Pick a name other debaters will see.")).toBeInTheDocument();
    });

    it("renders Argumint logo", () => {
      renderPage();
      expect(screen.getByRole("img", { name: "Argumint" })).toBeInTheDocument();
    });

    it("renders the hero headline", () => {
      renderPage();
      expect(screen.getByRole("heading", { level: 1, name: /Start as a Novice/ })).toBeInTheDocument();
    });

    it("labels every input", () => {
      renderPage();
      expect(screen.getByLabelText("Username")).toHaveAttribute("name", "username");
      expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
      expect(screen.getByLabelText("Password")).toHaveAttribute("name", "password");
      expect(screen.getByLabelText("Confirm Password")).toHaveAttribute("name", "confirmPassword");
    });

    it("shows the password rules hint until a password error replaces it", () => {
      renderPage();
      const hint = "At least 8 characters, with an uppercase letter and a number.";
      expect(screen.getByText(hint)).toBeInTheDocument();
      fillForm({ password: "Ab1", confirmPassword: "Ab1" });
      submit();
      expect(screen.queryByText(hint)).not.toBeInTheDocument();
      expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    });

    it("toggles password visibility per field", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Show password" }));
      expect((screen.getByPlaceholderText("Create a password") as HTMLInputElement).type).toBe("text");
      expect((screen.getByPlaceholderText("Repeat password") as HTMLInputElement).type).toBe("password");
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
      expect(screen.getByPlaceholderText("Create a password")).toBeInTheDocument();
    });

    it("renders confirm password input", () => {
      renderPage();
      expect(screen.getByPlaceholderText("Repeat password")).toBeInTheDocument();
    });

    it("renders 'Create account' submit button", () => {
      renderPage();
      expect(screen.getByRole("button", { name: "Create account" })).toHaveAttribute("type", "submit");
    });

    it("renders 'Back' navigation button", () => {
      renderPage();
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    });

    it("'Back' navigates to /", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    it("renders 'Log in' link to /login", () => {
      renderPage();
      const link = screen.getByText("Log in");
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
