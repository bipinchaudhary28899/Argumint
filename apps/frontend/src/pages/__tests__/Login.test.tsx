import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockNavigate, mockLogin, mockCheckAuth, mockAuthApiLogin } = vi.hoisted(() => ({
  mockNavigate:     vi.fn(),
  mockLogin:        vi.fn(),
  mockCheckAuth:    vi.fn(),
  mockAuthApiLogin: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────
let mockSearchParams = new URLSearchParams();
vi.mock("react-router-dom", () => ({
  useNavigate:     () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

let mockIsLoading = false;
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    login:    mockLogin,
    checkAuth: mockCheckAuth,
    isLoading: mockIsLoading,
  }),
}));

vi.mock("../../services/api", () => ({
  authApi: { login: (...args: any[]) => mockAuthApiLogin(...args) },
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { Login } from "../Login";

function renderPage() {
  return render(<Login />);
}

async function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { name: "email", value: email },
  });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), {
    target: { name: "password", value: password },
  });
  fireEvent.click(screen.getByText("Enter the Arena →"));
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockIsLoading    = false;
    mockLogin.mockResolvedValue(undefined);
    mockCheckAuth.mockResolvedValue(undefined);
    mockAuthApiLogin.mockResolvedValue(undefined);
  });

  // ── Page structure ─────────────────────────────────────────────────────────
  describe("page structure", () => {
    it("renders 'Welcome back' heading", () => {
      renderPage();
      expect(screen.getByText("Welcome back")).toBeInTheDocument();
    });

    it("renders 'Sign in to your arena account' subtitle", () => {
      renderPage();
      expect(screen.getByText("Sign in to your arena account")).toBeInTheDocument();
    });

    it("renders 'Debate Arena' label", () => {
      renderPage();
      expect(screen.getByText("Debate Arena")).toBeInTheDocument();
    });

    it("renders Argumint logo image", () => {
      renderPage();
      expect(screen.getByAltText("Argumint")).toBeInTheDocument();
    });

    it("renders email input with placeholder", () => {
      renderPage();
      expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    });

    it("renders password input with placeholder", () => {
      renderPage();
      expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    });

    it("renders 'Enter the Arena →' submit button", () => {
      renderPage();
      expect(screen.getByText("Enter the Arena →")).toBeInTheDocument();
    });

    it("renders 'Create one' link to /register", () => {
      renderPage();
      const link = screen.getByText("Create one");
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/register");
    });
  });

  // ── Form validation ────────────────────────────────────────────────────────
  describe("form validation", () => {
    it("shows 'Email is required' when email is blank", async () => {
      renderPage();
      await fillAndSubmit("", "mypassword");
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });

    it("shows 'Invalid email' for email with no valid domain dot", async () => {
      // "test@invalid" passes HTML email input constraint validation but fails
      // our custom regex which requires a dot in the domain.
      renderPage();
      await fillAndSubmit("test@invalid", "mypassword");
      expect(screen.getByText("Invalid email")).toBeInTheDocument();
    });

    it("shows 'Password is required' when password is blank", async () => {
      renderPage();
      await fillAndSubmit("alice@example.com", "");
      expect(screen.getByText("Password is required")).toBeInTheDocument();
    });

    it("clears email field error when user starts typing", async () => {
      renderPage();
      await fillAndSubmit("", "mypassword");
      expect(screen.getByText("Email is required")).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { name: "email", value: "a" },
      });
      expect(screen.queryByText("Email is required")).not.toBeInTheDocument();
    });

    it("does not call login() when validation fails", async () => {
      renderPage();
      await fillAndSubmit("", "");
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  // ── Successful login ───────────────────────────────────────────────────────
  describe("successful login", () => {
    it("calls login() with email and password", async () => {
      renderPage();
      await fillAndSubmit("alice@example.com", "secret123");
      await waitFor(() =>
        expect(mockLogin).toHaveBeenCalledWith({ email: "alice@example.com", password: "secret123" })
      );
    });

    it("navigates to / after successful login", async () => {
      renderPage();
      await fillAndSubmit("alice@example.com", "secret123");
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith("/")
      );
    });
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  describe("loading state", () => {
    it("shows 'Signing in…' when isLoading is true", () => {
      mockIsLoading = true;
      renderPage();
      expect(screen.getByText("Signing in…")).toBeInTheDocument();
    });

    it("submit button is disabled while isLoading", () => {
      mockIsLoading = true;
      renderPage();
      expect(screen.getByText("Signing in…")).toBeDisabled();
    });
  });

  // ── Login error ────────────────────────────────────────────────────────────
  describe("login errors", () => {
    it("shows error message when login() throws", async () => {
      mockLogin.mockRejectedValue(new Error("Invalid credentials"));
      renderPage();
      await fillAndSubmit("alice@example.com", "wrongpass");
      await waitFor(() =>
        expect(screen.getByText("Invalid credentials")).toBeInTheDocument()
      );
    });

    it("shows 'Login failed' for non-Error throws", async () => {
      mockLogin.mockRejectedValue("unexpected string");
      renderPage();
      await fillAndSubmit("alice@example.com", "pass");
      await waitFor(() =>
        expect(screen.getByText("Login failed")).toBeInTheDocument()
      );
    });
  });

  // ── Eviction banner ────────────────────────────────────────────────────────
  describe("eviction banners", () => {
    it("shows session-expired banner when reason=session_expired", () => {
      mockSearchParams = new URLSearchParams("reason=session_expired");
      renderPage();
      expect(screen.getByText(/Your session expired/)).toBeInTheDocument();
    });

    it("shows eviction banner when reason=evicted", () => {
      mockSearchParams = new URLSearchParams("reason=evicted");
      renderPage();
      expect(screen.getByText(/signed out because your account logged in on another device/)).toBeInTheDocument();
    });

    it("does not show eviction banner with no reason param", () => {
      renderPage();
      expect(screen.queryByText(/Your session expired/)).not.toBeInTheDocument();
      expect(screen.queryByText(/signed out because/)).not.toBeInTheDocument();
    });
  });

  // ── Active session conflict ────────────────────────────────────────────────
  describe("active session conflict", () => {
    it("shows active session conflict message on 409 + active_session", async () => {
      const err = {
        response: { status: 409, data: { error: "active_session" } },
        message: "Active session",
      };
      mockLogin.mockRejectedValue(err);
      renderPage();
      await fillAndSubmit("alice@example.com", "pass");
      await waitFor(() =>
        expect(screen.getByText(/You're already signed in on another device/)).toBeInTheDocument()
      );
    });

    it("shows 'Sign in here →' button in conflict state", async () => {
      const err = { response: { status: 409, data: { error: "active_session" } } };
      mockLogin.mockRejectedValue(err);
      renderPage();
      await fillAndSubmit("alice@example.com", "pass");
      await waitFor(() =>
        expect(screen.getByText("Sign in here →")).toBeInTheDocument()
      );
    });

    it("clicking 'Sign in here →' calls authApi.login with force:true", async () => {
      const err = { response: { status: 409, data: { error: "active_session" } } };
      mockLogin.mockRejectedValue(err);
      renderPage();
      await fillAndSubmit("alice@example.com", "pass");
      await waitFor(() => screen.getByText("Sign in here →"));
      fireEvent.click(screen.getByText("Sign in here →"));
      await waitFor(() =>
        expect(mockAuthApiLogin).toHaveBeenCalledWith(
          expect.objectContaining({ force: true })
        )
      );
    });

    it("navigates to / after successful force login", async () => {
      const err = { response: { status: 409, data: { error: "active_session" } } };
      mockLogin.mockRejectedValue(err);
      renderPage();
      await fillAndSubmit("alice@example.com", "pass");
      await waitFor(() => screen.getByText("Sign in here →"));
      fireEvent.click(screen.getByText("Sign in here →"));
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith("/")
      );
    });
  });

  // ── Password visibility toggle ─────────────────────────────────────────────
  describe("password visibility toggle", () => {
    it("password input is type=password by default", () => {
      renderPage();
      const passInput = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
      expect(passInput.type).toBe("password");
    });

    it("toggles to type=text when eye icon is clicked", async () => {
      renderPage();
      const toggleBtn = screen.getByRole("button", { name: "" }); // eye button has no text
      // Find the eye button — it's a button with tabIndex=-1 inside password area
      const allBtns = screen.getAllByRole("button");
      const eyeBtn = allBtns.find(b => b.getAttribute("tabindex") === "-1");
      expect(eyeBtn).toBeDefined();
      if (eyeBtn) fireEvent.click(eyeBtn);
      const passInput = screen.getByPlaceholderText("••••••••") as HTMLInputElement;
      expect(passInput.type).toBe("text");
    });
  });
});
